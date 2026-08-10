'use client';

import { useMemo, useState } from 'react';
import RangePicker from '@/features/admin/components/RangePicker';
import AnalyticsCharts from '@/features/admin/components/AnalyticsCharts';
import { useAnalytics } from '@/features/admin/hooks/use-analytics';

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const { data, isLoading, isError } = useAnalytics(range);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ledger-label mb-1">Field readings</p>
          <h1 className="font-display text-4xl font-medium leading-none sm:text-5xl">Analytics</h1>
        </div>
        <RangePicker days={days} onChange={setDays} />
      </div>

      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="h-24 animate-pulse rounded-lg bg-ink/[0.06]" />
            <div className="h-24 animate-pulse rounded-lg bg-ink/[0.06]" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-lg bg-ink/[0.06]" />
            <div className="h-64 animate-pulse rounded-lg bg-ink/[0.06]" />
          </div>
        </div>
      )}
      {isError && !isLoading && (
        <div className="admin-card p-6 text-sm text-cinnabar">Failed to load analytics.</div>
      )}
      {data && <AnalyticsCharts series={data} />}
    </div>
  );
}
