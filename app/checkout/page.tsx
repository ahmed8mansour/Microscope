"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ContactForm from "@/features/checkout/components/ContactForm";
import OtpForm from "@/features/checkout/components/OtpForm";
import { useSendOtp, useVerifyOtp } from "@/features/checkout/hooks/use-checkout";
import { useConfirm } from "@/features/payment/hooks/use-confirm";
import type { ContactInput } from "@/features/checkout/schemas/checkout.schema";
import PayStep from "@/features/payment/components/PayStep";
import { formatPrice } from "@/lib/config/product";
import { getWhatsAppSupportUrl } from "@/lib/config/support";
import { trackFunnelEvent } from "@/features/analytics/lib/track";

type Step = "contact" | "otp" | "pay" | "confirm";

function CheckoutFlow() {
  const searchParams = useSearchParams();

  // 3-D Secure / redirect return: Stripe sends the browser back to /checkout
  // with the payment_intent + its client_secret in the URL (a fresh page load,
  // so this is read at first render). The common card path never hits this —
  // it confirms inline with no URL params.
  const returnPI = searchParams.get("payment_intent");
  const returnSecret = searchParams.get("payment_intent_client_secret");
  const isReturn = Boolean(returnPI && returnSecret);

  const [step, setStep] = useState<Step>(() => (isReturn ? "confirm" : "contact"));
  const [contact, setContact] = useState<ContactInput | null>(null);
  // Quantity is chosen on the pay step (feature 005) before the intent is
  // created, so it never triggers a server re-price. Held here so the
  // confirmation view can show it.
  const [quantity, setQuantity] = useState(1);
  // Set when the customer is bounced back to the OTP step because their
  // verification expired (or was already spent) at pay time.
  const [reverifyNotice, setReverifyNotice] = useState<string | null>(null);

  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const confirm = useConfirm();

  // On a 3-D Secure return, confirm server-side and strip the secret from the
  // address bar so it doesn't linger in history. Runs once; no setState here
  // (the step was already initialised to "confirm" above).
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current || !isReturn || !returnPI || !returnSecret) return;
    handledReturn.current = true;
    confirm.mutate({ paymentIntentId: returnPI, clientSecret: returnSecret });
    window.history.replaceState(null, "", "/checkout");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleContactSubmit(input: ContactInput) {
    setContact(input);
    setReverifyNotice(null);
    sendOtp.mutate(input, { onSuccess: () => setStep("otp") });
  }

  function handleVerifySubmit(code: string) {
    if (!contact) return;
    verifyOtp.mutate(
      { email: contact.email, code },
      {
        onSuccess: () => {
          setReverifyNotice(null);
          setStep("pay");
          // Funnel: pay step presented (FR-027). The address + quantity + card
          // now live on one screen; the intent is created when they pay.
          trackFunnelEvent("payment");
        },
      }
    );
  }

  function handleResend() {
    if (!contact) return;
    sendOtp.mutate(contact);
  }

  // Pay-time verification expired (or was already consumed): re-send a fresh
  // code and drop the customer back on the OTP step with an explanation, rather
  // than dead-ending them on the pay screen.
  function handleNeedsReverify() {
    if (!contact) return;
    sendOtp.mutate(contact);
    setReverifyNotice(
      "Your verification expired for security. We've sent a new code — enter it to finish paying."
    );
    setStep("otp");
  }

  // Inline confirmation (no redirect): server-verify before showing success —
  // never trust the client-side result on its own. The client secret is minted
  // at pay time (PayStep) and travels in the POST body (via useConfirm), not the
  // URL.
  function handlePaid(paymentIntentId: string, clientSecret: string) {
    setStep("confirm");
    confirm.mutate({ paymentIntentId, clientSecret });
  }

  return (
    <main className="leaf-scope leaf-tint-mint min-h-dvh flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center">
        <h1 className="text-h2 text-ink mb-2">Checkout</h1>
        {/* Product summary card — the same line as before, in a card. */}
        <div className="mx-auto mb-8 inline-flex items-center gap-3 rounded-full border border-[color:var(--leaf-card-border)] bg-white px-4 py-2 shadow-[var(--leaf-card-shadow)]">
          <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-leaf-chip text-leaf-accent">
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m7.5 4.27 9 5.15" />
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </span>
          <p className="font-body text-ink/80">The Field Microscope &mdash; {formatPrice()}</p>
        </div>

        {step === "contact" && (
          <ContactForm
            onSubmit={handleContactSubmit}
            submitting={sendOtp.isPending}
            serverError={sendOtp.isError ? sendOtp.error.message : null}
          />
        )}

        {step === "otp" && contact && (
          <OtpForm
            email={contact.email}
            onSubmit={handleVerifySubmit}
            onResend={handleResend}
            submitting={verifyOtp.isPending}
            resending={sendOtp.isPending}
            serverError={verifyOtp.isError ? verifyOtp.error.message : null}
            notice={reverifyNotice}
          />
        )}

        {step === "pay" && contact && (
          <PayStep
            email={contact.email}
            onPaid={handlePaid}
            onQuantityChange={setQuantity}
            onNeedsReverify={handleNeedsReverify}
          />
        )}

        {step === "confirm" && <ConfirmView confirm={confirm} quantity={quantity} />}
      </div>
    </main>
  );
}

function ConfirmView({
  confirm,
  quantity,
}: {
  confirm: ReturnType<typeof useConfirm>;
  quantity: number;
}) {
  if (confirm.isPending || confirm.isIdle) {
    return <p className="font-body text-ink/70">Confirming your payment&hellip;</p>;
  }

  if (confirm.isError) {
    return (
      <div className="space-y-4">
        <p className="font-body text-ink">We couldn&rsquo;t confirm this payment.</p>
        <p className="text-sm text-danger">{confirm.error.message}</p>
        <SupportButton />
      </div>
    );
  }

  const data = confirm.data;

  if (data.status === "success") {
    return (
      <div className="space-y-2">
        <h2 className="text-h3 text-ink">Thank you!</h2>
        <p className="font-body text-ink/70">Your payment was successful.</p>
        <div className="mt-4 space-y-1 text-sm text-ink/70">
          <p>Order: {data.orderId}</p>
          <p>Quantity: {quantity}</p>
          {data.amount !== null && data.currency !== null && (
            <p>
              Amount: {(data.amount / 100).toFixed(2)} {data.currency}
            </p>
          )}
        </div>
        <SupportButton />
      </div>
    );
  }

  if (data.status === "pending") {
    return (
      <div className="space-y-3">
        <h2 className="text-h3 text-ink">Payment processing</h2>
        <p className="font-body text-ink/70">
          We&rsquo;re still confirming your payment. We&rsquo;ll email you as soon as it&rsquo;s done.
        </p>
        <SupportButton />
      </div>
    );
  }

  if (data.status === "refunded") {
    return (
      <div className="space-y-3">
        <h2 className="text-h3 text-ink">Order refunded</h2>
        <p className="font-body text-ink/70">This order has been refunded.</p>
        <SupportButton />
      </div>
    );
  }

  if (data.status === "failed") {
    return (
      <div className="space-y-3">
        <h2 className="text-h3 text-ink">Payment not completed</h2>
        <p className="font-body text-ink/70">
          This payment didn&rsquo;t go through. Please start checkout again to try another card.
        </p>
        <SupportButton />
      </div>
    );
  }

  // not_found
  return (
    <div className="space-y-3">
      <h2 className="text-h3 text-ink">We couldn&rsquo;t find this order</h2>
      <p className="font-body text-ink/70">
        If you believe this is a mistake, contact support.
      </p>
      <SupportButton />
    </div>
  );
}

function SupportButton() {
  return (
    <a
      href={getWhatsAppSupportUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-cinnabar text-paper-bone font-body font-medium rounded-[4px] transition-opacity hover:opacity-90"
    >
      Contact support on WhatsApp
    </a>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutFlow />
    </Suspense>
  );
}
