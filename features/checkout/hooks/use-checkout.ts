"use client";

import { useMutation } from "@tanstack/react-query";
import type { ShippingAddressInput } from "@/features/shipping";

interface ApiErrorBody {
  error?: { code: string; message: string };
}

// Carries the server's error `code` (e.g. "not_verified") alongside the
// message, so callers can branch on the specific failure — the re-verify
// fallback needs to tell `not_verified` apart from a generic error.
export class ApiError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    throw new ApiError(
      data?.error?.message ?? "Something went wrong. Please try again.",
      data?.error?.code ?? null
    );
  }
  return data;
}

export function useSendOtp() {
  return useMutation({
    mutationFn: (input: { email: string; whatsapp: string }) =>
      postJson<{ ok: true }>("/api/checkout/send-otp", input),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      postJson<{ verified: true }>("/api/checkout/verify-otp", input),
  });
}

export function useCreateIntent() {
  return useMutation({
    mutationFn: (input: {
      email: string;
      shippingAddress: ShippingAddressInput;
      quantity: number;
    }) =>
      postJson<{ clientSecret: string; orderId: string; paymentIntentId: string }>(
        "/api/checkout/create-intent",
        input
      ),
  });
}
