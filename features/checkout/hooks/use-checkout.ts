"use client";

import { useMutation } from "@tanstack/react-query";
import type { ShippingAddressInput } from "@/features/shipping";

interface ApiErrorBody {
  error?: { code: string; message: string };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) {
    throw new Error(data?.error?.message ?? "Something went wrong. Please try again.");
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
    mutationFn: (input: { email: string; shippingAddress: ShippingAddressInput }) =>
      postJson<{ clientSecret: string; orderId: string; paymentIntentId: string }>(
        "/api/checkout/create-intent",
        input
      ),
  });
}
