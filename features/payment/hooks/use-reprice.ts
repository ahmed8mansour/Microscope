"use client";

import { useMutation } from "@tanstack/react-query";

interface ApiErrorBody {
  error?: { code: string; message: string };
}

interface RepriceResponse {
  quantity: number;
  amount: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Couldn't update the quantity. Please try again.");
  }
  return data;
}

// Feature 005 (FR-002a): re-price the unconfirmed intent + order server-side
// when the customer changes the quantity stepper on the payment step. The
// client never sends an amount — only the quantity.
export function useReprice() {
  return useMutation({
    mutationFn: (input: { paymentIntentId: string; clientSecret: string; quantity: number }) =>
      postJson<RepriceResponse>("/api/checkout/update-quantity", input),
  });
}
