'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardMetrics } from '../types';

async function fetchMetrics(): Promise<DashboardMetrics> {
  const res = await fetch('/api/admin/metrics', { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Failed to load dashboard metrics');
  }
  return res.json();
}

export function useMetrics() {
  return useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: fetchMetrics,
  });
}
