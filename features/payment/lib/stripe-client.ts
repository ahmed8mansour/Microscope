"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// The publishable key is the one intentionally client-exposed value — a
// public credential by design, not a secret (see .env.example).
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      throw new Error(
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set (see .env.example)."
      );
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
