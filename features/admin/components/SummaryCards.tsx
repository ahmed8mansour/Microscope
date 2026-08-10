'use client';

import type { DashboardMetrics } from '../types';
import type { PaymentStatus } from '@/features/orders';
import { useCountUp } from '../hooks/use-count-up';
import { STATUS_ORDER, STATUS_STYLES, formatMoneyParts, formatPercent } from '../lib/format';

export default function SummaryCards({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="space-y-4">
      <RevenueBand revenue={metrics.revenue} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <TotalOrdersCard total={metrics.totalOrders} />
        </div>
        <div className="lg:col-span-3">
          <ConversionCard rate={metrics.conversionRate} />
        </div>
        <div className="lg:col-span-6">
          <PaymentsCard byStatus={metrics.paymentsByStatus} total={metrics.totalOrders} />
        </div>
      </div>
    </div>
  );
}

/* ---- Revenue hero band -------------------------------------------------- */

function RevenueBand({ revenue }: { revenue: DashboardMetrics['revenue'] }) {
  const allTime = useCountUp(revenue.allTime);
  const all = formatMoneyParts(allTime, revenue.currency);
  const today = formatMoneyParts(revenue.today, revenue.currency);
  const month = formatMoneyParts(revenue.month, revenue.currency);

  return (
    <section className="on-dark relative overflow-hidden rounded-lg bg-eucalypt text-paper-bone shadow-[0_18px_40px_-24px_rgba(27,27,27,0.6)]">
      {/* concentric-lens motif etched into the panel */}
      <svg
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 text-paper-bone/10"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {[90, 70, 50, 30, 14].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} />
        ))}
      </svg>

      <div className="relative p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="ledger-label text-paper-bone/70">Revenue · All time</span>
          <span className="flex items-center gap-2 text-paper-bone/70">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wattle opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-wattle" />
            </span>
            <span className="specimen-index text-paper-bone/70">Net of refunds</span>
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-1">
          <span className="font-display text-2xl text-paper-bone/70 sm:text-3xl">{all.symbol}</span>
          <span className="font-display tabular text-5xl font-medium leading-none sm:text-7xl">
            {all.amount}
          </span>
          <span className="ml-2 font-display text-lg text-paper-bone/60">{revenue.currency}</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-t border-paper-bone/20 pt-4">
          <SubFigure label="Today" symbol={today.symbol} amount={today.amount} />
          <SubFigure label="This month" symbol={month.symbol} amount={month.amount} />
        </div>
      </div>
    </section>
  );
}

function SubFigure({ label, symbol, amount }: { label: string; symbol: string; amount: string }) {
  return (
    <div>
      <div className="ledger-label text-paper-bone/60">{label}</div>
      <div className="mt-1 flex items-baseline gap-0.5 font-display text-2xl">
        <span className="text-paper-bone/60">{symbol}</span>
        <span className="tabular">{amount}</span>
      </div>
    </div>
  );
}

/* ---- Total orders ------------------------------------------------------- */

function TotalOrdersCard({ total }: { total: number }) {
  const animated = Math.round(useCountUp(total));
  return (
    <article className="admin-card flex h-full flex-col justify-between p-5">
      <div className="flex items-start justify-between">
        <span className="ledger-label">Total orders</span>
        <span className="specimen-index">№ 01</span>
      </div>
      <div className="mt-6 font-display tabular text-6xl font-medium leading-none">{animated}</div>
      <div className="mt-2 text-sm text-ink/55">Lifetime records on the ledger</div>
    </article>
  );
}

/* ---- Conversion ring ---------------------------------------------------- */

function ConversionCard({ rate }: { rate: number }) {
  const animated = useCountUp(rate);
  const pct = Math.max(0, Math.min(1, animated));
  const size = 116;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <article className="admin-card flex h-full flex-col justify-between p-5">
      <div className="flex items-start justify-between">
        <span className="ledger-label">Conversion</span>
        <span className="specimen-index">№ 02</span>
      </div>
      <div className="mt-4 flex items-center justify-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-08)" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--cinnabar)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display tabular text-2xl font-medium leading-none">
              {formatPercent(animated)}
            </span>
            <span className="specimen-index mt-1">visitors → sales</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ---- Payments by status ------------------------------------------------- */

function PaymentsCard({
  byStatus,
  total,
}: {
  byStatus: Record<PaymentStatus, number>;
  total: number;
}) {
  const sum = STATUS_ORDER.reduce((acc, s) => acc + byStatus[s], 0) || 1;

  return (
    <article className="admin-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between">
        <span className="ledger-label">Payments by status</span>
        <span className="specimen-index">№ 03 · {total} total</span>
      </div>

      {/* Stacked distribution meter */}
      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-ink/[0.06]">
        {STATUS_ORDER.map((status, i) => {
          const value = byStatus[status];
          if (value === 0) return null;
          const width = (value / sum) * 100;
          return (
            <div
              key={status}
              className="ledger-seg h-full"
              style={{
                width: `${width}%`,
                background: STATUS_STYLES[status].swatch,
                animationDelay: `${i * 80}ms`,
              }}
              title={`${STATUS_STYLES[status].label}: ${value}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <div key={status}>
            <dt className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: STATUS_STYLES[status].swatch }}
              />
              <span className="specimen-index">{STATUS_STYLES[status].label}</span>
            </dt>
            <dd className="mt-1 pl-[18px] font-display tabular text-2xl leading-none">
              {byStatus[status]}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
