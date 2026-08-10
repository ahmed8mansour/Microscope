'use client';

import { useQuery } from '@tanstack/react-query';
import type { OrdersListResponse } from '../types';
import type { PaymentStatus } from '@/features/orders';

export interface OrdersFilter {
  status?: PaymentStatus;
  fulfilled?: boolean;
  cursor?: string;
}

async function fetchOrders(filter: OrdersFilter): Promise<OrdersListResponse> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.fulfilled !== undefined) params.set('fulfilled', String(filter.fulfilled));
  if (filter.cursor) params.set('cursor', filter.cursor);

  const res = await fetch(`/api/admin/orders?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load orders');
  return res.json();
}

export function useOrders(filter: OrdersFilter) {
  return useQuery({
    queryKey: ['admin', 'orders', filter],
    queryFn: () => fetchOrders(filter),
  });
}
