"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { getStripe } from "../lib/stripe-client";
import { useReprice } from "../hooks/use-reprice";
import QuantityStepper from "@/components/ui/QuantityStepper";
import { PRODUCT, computeAmount, formatAmountShort } from "@/lib/config/product";

interface PaymentFormProps {
  clientSecret: string;
  paymentIntentId: string;
  // Called after Stripe confirms the payment *inline* (no redirect). The
  // parent then server-verifies before showing success — we never trust this
  // client-side confirmation on its own.
  onConfirmed: (paymentIntentId: string) => void;
  // Notifies the parent of the current quantity so the confirmation view can
  // show it (feature 005). The server remains the amount authority.
  onQuantityChange?: (quantity: number) => void;
}

function PayButton({
  clientSecret,
  paymentIntentId,
  onConfirmed,
  onQuantityChange,
}: Omit<PaymentFormProps, never>) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const reprice = useReprice();

  // Re-pricing in flight or confirmation under way — the amount must not change
  // while either is happening (FR-002a).
  const busy = submitting || reprice.isPending;

  function handleQuantityChange(next: number) {
    const previous = quantity;
    setQuantity(next);
    onQuantityChange?.(next);
    // Server recomputes the total from the quantity; the client never sends an
    // amount. On failure, revert so the shown quantity matches the intent.
    reprice.mutate(
      { paymentIntentId, clientSecret, quantity: next },
      {
        onError: () => {
          setQuantity(previous);
          onQuantityChange?.(previous);
        },
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Guards against double-submission (FR-004) and against confirming while a
    // re-price is still settling.
    if (!stripe || !elements || busy) return;

    setSubmitting(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/checkout`,
      },
    });

    if (confirmError) {
      setError(
        confirmError.message ?? "Payment could not be completed. Please try again."
      );
      setSubmitting(false);
      return;
    }

    if (paymentIntent) {
      onConfirmed(paymentIntent.id);
    }
  }

  const total = computeAmount(quantity);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-body text-ink/70">Quantity</span>
        <QuantityStepper value={quantity} onChange={handleQuantityChange} disabled={busy} />
      </div>
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full inline-flex items-center justify-center px-6 py-3 bg-cinnabar text-paper-bone font-body font-medium rounded-[4px] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {submitting
          ? "Processing…"
          : reprice.isPending
            ? "Updating…"
            : `Pay ${formatAmountShort(total)} ${PRODUCT.currency}`}
      </button>
      {error && <p className="text-sm text-cinnabar">{error}</p>}
      {reprice.isError && (
        <p className="text-sm text-cinnabar">{reprice.error.message}</p>
      )}
    </form>
  );
}

export default function PaymentForm({
  clientSecret,
  paymentIntentId,
  onConfirmed,
  onQuantityChange,
}: PaymentFormProps) {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      <PayButton
        clientSecret={clientSecret}
        paymentIntentId={paymentIntentId}
        onConfirmed={onConfirmed}
        onQuantityChange={onQuantityChange}
      />
    </Elements>
  );
}
