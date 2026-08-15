"use client";

import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { getStripe } from "../lib/stripe-client";
import AddressFields from "@/features/checkout/components/AddressFields";
import QuantityStepper from "@/components/ui/QuantityStepper";
import { ApiError, useCreateIntent } from "@/features/checkout/hooks/use-checkout";
import { shippingAddressSchema, type ShippingAddressInput } from "@/features/shipping";
import { PRODUCT, computeAmount, formatAmountShort } from "@/lib/config/product";

interface PayStepProps {
  // The verified email — the intent is authorized against a fresh verification
  // for this address when it is finally created (at pay time).
  email: string;
  // Called after Stripe confirms the payment *inline* (no redirect). The parent
  // then server-verifies (via /confirm) before showing success — we never trust
  // this client-side confirmation on its own. The client secret is minted at pay
  // time and travels back so the parent can confirm the exact intent.
  onPaid: (paymentIntentId: string, clientSecret: string) => void;
  // Notifies the parent of the current quantity so the confirmation view can
  // show it. The server remains the amount authority.
  onQuantityChange?: (quantity: number) => void;
  // The verification is consumed at pay time and is only valid for a short
  // freshness window. If it has expired (or was already spent), create-intent
  // returns `not_verified` — the parent bounces the customer back to re-verify
  // rather than showing a dead-end error.
  onNeedsReverify?: () => void;
}

// Deferred PaymentIntent flow: the Payment Element is mounted with just
// mode/amount/currency — no intent, no server call — so the customer can fill in
// their address and adjust the quantity with zero network traffic (quantity
// changes are a pure client-side `elements.update`). The intent is created
// exactly once, at pay time, with the server-authoritative total. This replaces
// the old create-intent-then-reprice path (no more /update-quantity round-trips
// per quantity change, and no abandoned intents for customers who never pay).
function PayInner({ email, onPaid, onQuantityChange, onNeedsReverify }: PayStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const createIntent = useCreateIntent();

  const form = useForm<ShippingAddressInput>({
    defaultValues: {
      recipientName: "",
      country: "AU",
      state: "",
      city: "",
      line1: "",
      line2: "",
      postalCode: "",
    },
  });

  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleQuantityChange(next: number) {
    setQuantity(next);
    onQuantityChange?.(next);
    // Pure client-side re-price — the mounted Element just re-renders with the
    // new amount. No server call, no Stripe call.
    elements?.update({ amount: computeAmount(next) });
  }

  async function onValid(data: ShippingAddressInput) {
    // Guards against double-submission (FR-004).
    if (!stripe || !elements || submitting) return;

    // Zod is the source of truth (same schema the server re-validates). Map any
    // structural failures back onto the fields rather than proceeding to pay.
    const parsed = shippingAddressSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        form.setError(issue.path[0] as keyof ShippingAddressInput, { message: issue.message });
      }
      return;
    }

    setSubmitting(true);
    setError(null);

    // 1. Validate the payment details before doing any server work.
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your payment details and try again.");
      setSubmitting(false);
      return;
    }

    // 2. Create the order + address snapshot + intent with the *final* quantity.
    //    The server derives the total; the client never sends an amount.
    let created;
    try {
      created = await createIntent.mutateAsync({
        email,
        shippingAddress: parsed.data,
        quantity,
      });
    } catch (err) {
      // Verification expired or was already spent — send the customer back to
      // re-verify (a fresh code) instead of leaving them at a dead end. The
      // parent unmounts this step, so card re-entry is expected on that rare
      // path (nothing was charged; no intent was even created).
      if (err instanceof ApiError && err.code === "not_verified" && onNeedsReverify) {
        onNeedsReverify();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    // 3. Confirm the freshly-created intent. Card details already collected in
    //    the mounted Element, so no re-entry on failure.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret: created.clientSecret,
      confirmParams: { return_url: `${window.location.origin}/checkout` },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment could not be completed. Please try again.");
      setSubmitting(false);
      return;
    }

    if (paymentIntent) {
      onPaid(paymentIntent.id, created.clientSecret);
    }
  }

  const total = computeAmount(quantity);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onValid)} className="space-y-6">
        <AddressFields />

        <div className="flex items-center justify-between">
          <span className="font-body text-ink/70">Quantity</span>
          <QuantityStepper value={quantity} onChange={handleQuantityChange} disabled={submitting} />
        </div>

        <PaymentElement />

        <button
          type="submit"
          disabled={!stripe || submitting}
          className="w-full inline-flex items-center justify-center px-6 py-3 bg-cinnabar text-paper-bone font-body font-medium rounded-[4px] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Processing…" : `Pay ${formatAmountShort(total)} ${PRODUCT.currency}`}
        </button>

        {error && <p className="text-sm text-cinnabar">{error}</p>}
      </form>
    </FormProvider>
  );
}

export default function PayStep({
  email,
  onPaid,
  onQuantityChange,
  onNeedsReverify,
}: PayStepProps) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        mode: "payment",
        amount: computeAmount(1),
        // Stripe expects a lowercase ISO currency code here.
        currency: PRODUCT.currency.toLowerCase(),
      }}
    >
      <PayInner
        email={email}
        onPaid={onPaid}
        onQuantityChange={onQuantityChange}
        onNeedsReverify={onNeedsReverify}
      />
    </Elements>
  );
}
