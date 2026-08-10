"use client";

import { useMutation } from "@tanstack/react-query";

interface ApiErrorBody {
  error?: { code: string; message: string };
}

interface ConfirmResponse {
  status: "success" | "pending" | "failed" | "refunded" | "not_found";
  orderId: string | null;
  amount: number | null;
  currency: string | null;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (res.status === 403) {
    throw new Error(data?.error?.message ?? "This confirmation link is invalid.");
  }
  if (!res.ok && res.status !== 404) {
    throw new Error(data?.error?.message ?? "Something went wrong. Please try again.");
  }
  return data;
}

export function useConfirm() {
  return useMutation({
    mutationFn: (input: { paymentIntentId: string; clientSecret: string }) =>
      postJson<ConfirmResponse>("/api/checkout/confirm", input),
  });
}
