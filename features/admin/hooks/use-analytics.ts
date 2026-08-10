'use client';

import { useQuery } from '@tanstack/react-query';
import type { AnalyticsSeriesResponse } from '../types';

export interface AnalyticsRangeInput {
  from?: string;
  to?: string;
}

async function fetchAnalytics(range: AnalyticsRangeInput): Promise<AnalyticsSeriesResponse> {
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const qs = params.toString();

  const res = await fetch(`/api/admin/analytics${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load analytics');
  return res.json();
}

export function useAnalytics(range: AnalyticsRangeInput) {
  return useQuery({
    queryKey: ['admin', 'analytics', range],
    queryFn: () => fetchAnalytics(range),
  });
}
