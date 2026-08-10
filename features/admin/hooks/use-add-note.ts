'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

interface ApiErrorBody {
  error?: { code: string; message: string };
}

async function addNote(orderId: string, body: string): Promise<void> {
  const res = await fetch(`/api/admin/orders/${orderId}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(data?.error?.message ?? 'Failed to add note');
  }
}

export function useAddNote(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addNote(orderId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
    },
  });
}
