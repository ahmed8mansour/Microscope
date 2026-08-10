'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useOrders } from '../hooks/use-orders';
import type { OrderWithRefundable } from '../types';
import type { PaymentStatus } from '@/features/orders';
import { STATUS_STYLES, formatMoney } from '../lib/format';

const STATUS_OPTIONS: Array<PaymentStatus | 'all'> = ['all', 'success', 'pending', 'failed', 'refunded'];
const FULFILLED_OPTIONS: Array<{ value: 'all' | 'true' | 'false'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Fulfilled' },
  { value: 'false', label: 'Unfulfilled' },
];

function StatusPill({ status }: { status: PaymentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pillClass}`}>
      {s.label}
    </span>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="ledger-label hidden sm:inline">{label}</span>
      <div className="flex rounded-lg border border-ink/15 bg-paper-raised p-0.5" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`admin-focus rounded-[6px] px-2.5 py-1 text-xs capitalize transition-colors ${
                active ? 'bg-ink text-paper-bone' : 'text-ink/60 hover:text-ink'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function OrdersTable() {
  const [status, setStatus] = useState<PaymentStatus | 'all'>('all');
  const [fulfilled, setFulfilled] = useState<'all' | 'true' | 'false'>('all');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<OrderWithRefundable[]>([]);

  const filter = {
    status: status === 'all' ? undefined : status,
    fulfilled: fulfilled === 'all' ? undefined : fulfilled === 'true',
    cursor,
  };

  const { data, isLoading, isError } = useOrders(filter);

  useEffect(() => {
    setCursor(undefined);
    setAccumulated([]);
  }, [status, fulfilled]);

  useEffect(() => {
    if (!data) return;
    setAccumulated((prev) => (cursor ? [...prev, ...data.orders] : data.orders));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="Status"
          value={status}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s === 'all' ? 'All' : s }))}
          onChange={setStatus}
        />
        <Segmented label="Fulfilment" value={fulfilled} options={FULFILLED_OPTIONS} onChange={setFulfilled} />
      </div>

      {isError && <p className="mb-3 text-sm text-cinnabar">Failed to load orders.</p>}

      <div className="admin-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b ledger-rule">
                <Th>Order</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Qty</Th>
                <Th>Status</Th>
                <Th>Fulfilled</Th>
                <Th>Refund</Th>
                <Th className="text-right">Created</Th>
              </tr>
            </thead>
            <tbody>
              {accumulated.map((order, idx) => (
                <tr
                  key={order.id}
                  className="group border-b border-ink/[0.07] transition-colors last:border-0 hover:bg-wattle/[0.08]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="admin-focus font-utility text-sm text-ink underline-offset-4 group-hover:underline"
                    >
                      {order.id.slice(0, 8)}
                    </Link>
                    <span className="specimen-index ml-2">№ {String(idx + 1).padStart(3, '0')}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-utility tabular text-sm">
                    {formatMoney(order.amount, order.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-utility tabular text-sm text-ink/70">
                    {order.quantity}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={order.paymentStatus} />
                  </td>
                  <td className="px-4 py-3 text-sm text-ink/70">
                    {order.fulfilled ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-eucalypt" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RefundCell order={order} />
                  </td>
                  <td className="px-4 py-3 text-right font-utility text-xs text-ink/55">
                    {new Date(order.createdAt).toLocaleDateString('en-AU', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
              {accumulated.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="ledger-label mb-1">No specimens on record</p>
                    <p className="text-sm text-ink/50">No orders match the current filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isLoading && <p className="mt-3 ledger-label">Loading…</p>}

      {data?.nextCursor && (
        <button
          type="button"
          onClick={() => setCursor(data.nextCursor as string)}
          className="admin-focus mt-4 rounded-lg border border-ink/20 px-4 py-2 text-sm text-ink/70 transition-colors hover:border-ink/40 hover:bg-ink/[0.04]"
        >
          Load more orders
        </button>
      )}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 ledger-label font-normal ${className}`}>{children}</th>;
}

function RefundCell({ order }: { order: OrderWithRefundable }) {
  if (order.paymentStatus === 'refunded') {
    return <span className="text-xs font-medium text-ink/60">Refunded</span>;
  }
  if (order.refundState === 'requested') {
    return (
      <span className="rounded-full bg-wattle/20 px-2 py-0.5 text-xs font-medium text-ink/70">
        Requested
      </span>
    );
  }
  if (order.refundState === 'failed') {
    return (
      <span className="rounded-full bg-cinnabar/15 px-2 py-0.5 text-xs font-medium text-cinnabar">
        Failed
      </span>
    );
  }
  if (order.refundable) {
    return (
      <span className="rounded-full bg-cinnabar/10 px-2 py-0.5 text-xs font-medium text-cinnabar">
        Eligible
      </span>
    );
  }
  return <span className="text-ink/30">—</span>;
}
