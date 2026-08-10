'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ApiErrorBody {
  error?: { code: string; message: string };
}

export interface FulfillPayload {
  supplierOrderRef?: string;
  supplierTrackingRef?: string;
  fulfilled?: boolean;
}

async function fulfillOrder(id: string, payload?: FulfillPayload): Promise<void> {
  const res = await fetch(`/api/admin/orders/${id}/fulfill`, {
    method: 'POST',
    credentials: 'include',
    ...(payload
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
      : {}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(data?.error?.message ?? 'Failed to update fulfillment');
  }
}

// A bodyless call marks the order fulfilled (legacy 004 behaviour); a payload
// records supplier refs and/or marks fulfilled (feature 005).
export function useFulfillOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: FulfillPayload) => fulfillOrder(orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });
}
