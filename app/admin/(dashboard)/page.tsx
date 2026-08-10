'use client';

import SummaryCards from '@/features/admin/components/SummaryCards';
import { useMetrics } from '@/features/admin/hooks/use-metrics';

export default function AdminDashboardPage() {
  const { data, isLoading, isError } = useMetrics();

  const today = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="ledger-label mb-1">Store overview</p>
          <h1 className="font-display text-4xl font-medium leading-none sm:text-5xl">
            The Field Microscope
          </h1>
        </div>
        <p className="specimen-index pb-1">{today}</p>
      </div>

      {isLoading && <LoadingState />}
      {isError && !isLoading && (
        <div className="admin-card p-6 text-sm text-cinnabar">
          Couldn&rsquo;t load the dashboard metrics. Try refreshing.
        </div>
      )}
      {data && <SummaryCards metrics={data} />}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-44 animate-pulse rounded-lg bg-ink/[0.06]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-40 animate-pulse rounded-lg bg-ink/[0.06] lg:col-span-3" />
        <div className="h-40 animate-pulse rounded-lg bg-ink/[0.06] lg:col-span-3" />
        <div className="h-40 animate-pulse rounded-lg bg-ink/[0.06] lg:col-span-6" />
      </div>
    </div>
  );
}
