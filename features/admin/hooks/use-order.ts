'use client';

import { useQuery } from '@tanstack/react-query';
import type { OrderDetailResponse } from '../types';

async function fetchOrder(id: string): Promise<OrderDetailResponse> {
  const res = await fetch(`/api/admin/orders/${id}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load order');
  return res.json();
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => fetchOrder(id),
    enabled: Boolean(id),
  });
}
