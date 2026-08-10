'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ApiErrorBody {
  error?: { code: string; message: string };
}

async function requestRefund(orderId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(data?.error?.message ?? 'Failed to request refund');
  }
}

export function useRequestRefund(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => requestRefund(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });
}
