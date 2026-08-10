'use client';

import { useState } from 'react';
import { useFulfillOrder } from '../hooks/use-fulfill';
import { fulfillmentFields, fulfillmentCopyAll } from '@/features/shipping/domain/format';
import type { StoredShippingAddress } from '@/features/shipping';

interface FulfillmentPanelProps {
  orderId: string;
  quantity: number;
  address: StoredShippingAddress | null;
  supplierOrderRef: string | null;
  supplierTrackingRef: string | null;
  fulfilled: boolean;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard unavailable — the values are also rendered as selectable text
    // (below), so the admin can copy manually. No-op.
  }
}

// Copy-ready supplier fulfillment panel (feature 005, US3). Renders the address
// + quantity field-for-field in supplier-form order with per-field and copy-all
// controls, and records the supplier order/tracking references. The app never
// calls a supplier API — placement is a human action.
export default function FulfillmentPanel({
  orderId,
  quantity,
  address,
  supplierOrderRef,
  supplierTrackingRef,
  fulfilled,
}: FulfillmentPanelProps) {
  const fulfill = useFulfillOrder(orderId);
  const [orderRef, setOrderRef] = useState(supplierOrderRef ?? '');
  const [trackingRef, setTrackingRef] = useState(supplierTrackingRef ?? '');

  if (!address) {
    return (
      <article className="admin-card p-5 sm:p-6">
        <span className="ledger-label">Supplier fulfillment</span>
        <p className="mt-3 text-sm text-ink/45">Shipping address unavailable for this order.</p>
      </article>
    );
  }

  const fields = fulfillmentFields(address, quantity);

  function handleSubmit() {
    fulfill.mutate({
      supplierOrderRef: orderRef.trim() || undefined,
      supplierTrackingRef: trackingRef.trim() || undefined,
      fulfilled: true,
    });
  }

  return (
    <article className="admin-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="ledger-label">Supplier fulfillment</span>
        <button
          type="button"
          onClick={() => copy(fulfillmentCopyAll(address, quantity))}
          className="admin-focus rounded-lg border border-ink/20 px-3 py-1.5 text-xs text-ink/70 transition-colors hover:border-ink/40 hover:bg-ink/[0.04]"
        >
          Copy all
        </button>
      </div>

      <dl className="mt-4 space-y-2">
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <dt className="ledger-label">{f.label}</dt>
              <dd className="mt-0.5 select-all break-all text-sm text-ink">{f.value || '—'}</dd>
            </div>
            <button
              type="button"
              onClick={() => copy(f.value)}
              aria-label={`Copy ${f.label}`}
              disabled={!f.value}
              className="admin-focus shrink-0 rounded-md border border-ink/15 px-2.5 py-1 text-xs text-ink/60 transition-colors hover:border-ink/40 hover:bg-ink/[0.04] disabled:opacity-40"
            >
              Copy
            </button>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-3 border-t ledger-rule pt-4">
        <label className="block">
          <span className="ledger-label">Supplier order ref</span>
          <input
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            maxLength={200}
            placeholder="e.g. ALI-123456789"
            className="admin-focus mt-1 w-full rounded-lg border border-ink/15 bg-paper-raised p-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="ledger-label">Tracking ref</span>
          <input
            value={trackingRef}
            onChange={(e) => setTrackingRef(e.target.value)}
            maxLength={200}
            placeholder="e.g. LP00612345678"
            className="admin-focus mt-1 w-full rounded-lg border border-ink/15 bg-paper-raised p-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={fulfill.isPending}
          className="admin-focus rounded-lg bg-eucalypt px-4 py-2 text-sm font-medium text-paper-bone transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {fulfill.isPending
            ? 'Saving…'
            : fulfilled
              ? 'Update supplier refs'
              : 'Record refs & mark fulfilled'}
        </button>
        {fulfill.isError && (
          <p className="text-sm text-cinnabar">{(fulfill.error as Error).message}</p>
        )}
      </div>
    </article>
  );
}
