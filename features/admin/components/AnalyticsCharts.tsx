import type { AnalyticsSeriesResponse } from '../types';
import { formatMoney, formatPercent } from '../lib/format';

const SOURCE_SWATCHES = ['var(--eucalypt)', 'var(--wattle)', 'var(--cinnabar)', 'rgba(27,27,27,0.45)'];

function BarChart({
  points,
  formatValue,
  color = 'var(--eucalypt)',
}: {
  points: Array<{ date: string; value: number }>;
  formatValue: (value: number) => string;
  color?: string;
}) {
  if (points.length === 0) {
    return <EmptyPlot />;
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  // Keep the axis readable: cap how many x-labels we print.
  const labelEvery = Math.ceil(points.length / 12);

  return (
    <div className="flex h-48 items-end gap-[3px] overflow-x-auto pb-1">
      {points.map((p, i) => {
        const heightPct = (p.value / max) * 100;
        return (
          <div
            key={p.date}
            className="group flex min-w-[10px] flex-1 flex-col items-center justify-end"
            title={`${p.date}: ${formatValue(p.value)}`}
          >
            <div
              className="ledger-seg w-full rounded-t-[3px] transition-opacity group-hover:opacity-80"
              style={{
                height: `${Math.max(heightPct, 1.5)}%`,
                background: color,
                animationDelay: `${Math.min(i * 25, 500)}ms`,
              }}
            />
            <span className="specimen-index mt-1.5 h-3 overflow-hidden whitespace-nowrap text-[9px]">
              {i % labelEvery === 0 ? p.date.slice(5) : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyPlot() {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-md border border-dashed border-ink/15">
      <p className="ledger-label mb-1">No readings</p>
      <p className="text-sm text-ink/45">No data in this period.</p>
    </div>
  );
}

export default function AnalyticsCharts({ series }: { series: AnalyticsSeriesResponse }) {
  const sortedSources = [...series.trafficSources].sort((a, b) => b.entries - a.entries);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Payment success" value={formatPercent(series.paymentSuccessRate)} accent="var(--eucalypt)" />
        <StatTile label="Conversion" value={formatPercent(series.conversionRate)} accent="var(--cinnabar)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="ledger-label">Revenue over time</span>
            <span className="specimen-index">Net · {series.range.timezone.split('/')[1] ?? 'local'}</span>
          </div>
          <BarChart
            points={series.revenueOverTime.map((p) => ({ date: p.date, value: p.amount }))}
            formatValue={(v) => formatMoney(v)}
            color="var(--eucalypt)"
          />
        </article>

        <article className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="ledger-label">Orders per day</span>
            <span className="specimen-index">Count</span>
          </div>
          <BarChart
            points={series.ordersPerDay.map((p) => ({ date: p.date, value: p.count }))}
            formatValue={(v) => String(v)}
            color="var(--wattle)"
          />
        </article>
      </div>

      <article className="admin-card p-5">
        <span className="ledger-label">Traffic sources</span>
        {sortedSources.length === 0 ? (
          <p className="mt-4 text-sm text-ink/45">No funnel entries in this period.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {sortedSources.map((s, i) => (
              <li key={s.source} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate capitalize text-ink/70">{s.source}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div
                    className="ledger-seg h-full rounded-full"
                    style={{
                      width: `${s.share * 100}%`,
                      background: SOURCE_SWATCHES[i % SOURCE_SWATCHES.length],
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right font-utility tabular text-xs text-ink/55">
                  {s.entries} · {formatPercent(s.share)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <article className="admin-card relative overflow-hidden p-5">
      <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: accent }} />
      <div className="ledger-label">{label}</div>
      <div className="mt-2 font-display tabular text-4xl font-medium leading-none">{value}</div>
    </article>
  );
}
