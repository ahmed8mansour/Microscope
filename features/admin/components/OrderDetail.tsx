'use client';

import { useState } from 'react';
import { useOrder } from '../hooks/use-order';
import { useFulfillOrder } from '../hooks/use-fulfill';
import { useAddNote } from '../hooks/use-add-note';
import RefundButton from './RefundButton';
import FulfillmentPanel from './FulfillmentPanel';
import { STATUS_STYLES, formatMoney } from '../lib/format';

export default function OrderDetail({ orderId }: { orderId: string }) {
  const { data, isLoading, isError } = useOrder(orderId);
  const fulfill = useFulfillOrder(orderId);
  const addNote = useAddNote(orderId);
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-56 animate-pulse rounded-lg bg-ink/[0.06]" />
        <div className="h-40 animate-pulse rounded-lg bg-ink/[0.06]" />
      </div>
    );
  }
  if (isError || !data) return <p className="text-sm text-cinnabar">Failed to load order.</p>;

  const { order, notes, refund, shippingAddress } = data;
  const statusStyle = STATUS_STYLES[order.paymentStatus];
  const isPaid = order.paymentStatus === 'success' || order.paymentStatus === 'refunded';

  async function handleAddNote() {
    setNoteError(null);
    if (!noteBody.trim()) {
      setNoteError('Note cannot be empty.');
      return;
    }
    try {
      await addNote.mutateAsync(noteBody);
      setNoteBody('');
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Failed to add note.');
    }
  }

  return (
    <div className="space-y-4">
      {/* Specimen header */}
      <article className="admin-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b ledger-rule p-5 sm:p-6">
          <div>
            <span className="ledger-label">Order specimen</span>
            <div className="mt-1 font-utility text-lg text-ink">{order.id.slice(0, 8)}</div>
            <div className="specimen-index mt-0.5 break-all">{order.id}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusStyle.pillClass}`}>
              {statusStyle.label}
            </span>
            <div className="font-display tabular text-3xl font-medium leading-none">
              {formatMoney(order.amount, order.currency)}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3 sm:p-6">
          <Field label="Fulfilled" value={order.fulfilled ? 'Yes' : 'No'} />
          <Field label="Quantity" value={String(order.quantity)} />
          <Field label="Paid at" value={order.paidAt ? new Date(order.paidAt).toLocaleString('en-AU') : '—'} />
          <Field label="Created" value={new Date(order.createdAt).toLocaleString('en-AU')} />
          <Field label="Payment reference" value={order.stripePaymentIntentId ?? '—'} mono />
          <Field label="Receipt" value={order.stripeReceiptUrl ? 'Available' : '—'} link={order.stripeReceiptUrl} />
          <Field label="Customer" value={order.userId} mono />
        </dl>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 border-t ledger-rule bg-paper-surface/60 p-5 sm:p-6">
          {order.paymentStatus === 'success' && (
            <button
              type="button"
              onClick={() => fulfill.mutate(undefined)}
              disabled={fulfill.isPending || order.fulfilled}
              className="admin-focus rounded-lg bg-eucalypt px-4 py-2 text-sm font-medium text-paper-bone transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {order.fulfilled ? '✓ Fulfilled' : fulfill.isPending ? 'Marking…' : 'Mark fulfilled'}
            </button>
          )}
          {order.refundable && !refund && (
            <RefundButton orderId={order.id} amount={order.amount} currency={order.currency} />
          )}
          {refund && (
            <p className="text-sm text-ink/60">
              {refund.status === 'requested' && order.paymentStatus === 'success' && (
                <>Refund requested {new Date(refund.createdAt).toLocaleString('en-AU')} — awaiting provider confirmation.</>
              )}
              {refund.status === 'requested' && order.paymentStatus === 'refunded' && (
                <>Refunded — requested {new Date(refund.createdAt).toLocaleString('en-AU')}.</>
              )}
              {refund.status === 'failed' && (
                <span className="text-cinnabar">
                  Refund attempt failed: {refund.failureMessage ?? 'unknown error'}
                </span>
              )}
            </p>
          )}
        </div>
      </article>

      {/* Supplier fulfillment (paid orders only) */}
      {isPaid && (
        <FulfillmentPanel
          orderId={order.id}
          quantity={order.quantity}
          address={shippingAddress}
          supplierOrderRef={order.supplierOrderRef}
          supplierTrackingRef={order.supplierTrackingRef}
          fulfilled={order.fulfilled}
        />
      )}

      {/* Internal notes */}
      <article className="admin-card p-5 sm:p-6">
        <span className="ledger-label">Internal notes</span>
        <ul className="mb-4 mt-4 space-y-2">
          {notes.length === 0 && <li className="text-sm text-ink/45">No notes yet.</li>}
          {notes.map((note) => (
            // React escapes text content, so a note can never render as
            // active content (FR-018).
            <li key={note.id} className="rounded-md border border-ink/[0.09] bg-paper-surface/60 p-3 text-sm">
              <p className="whitespace-pre-wrap break-words text-ink">{note.body}</p>
              <p className="specimen-index mt-2">{new Date(note.createdAt).toLocaleString('en-AU')}</p>
            </li>
          ))}
        </ul>
        <textarea
          aria-label="Add an internal note"
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Add an internal note…"
          className="admin-focus w-full rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
        />
        {noteError && <p className="mt-1 text-sm text-cinnabar">{noteError}</p>}
        <button
          type="button"
          onClick={handleAddNote}
          disabled={addNote.isPending}
          className="admin-focus mt-2 rounded-lg border border-ink/20 px-4 py-2 text-sm text-ink/70 transition-colors hover:border-ink/40 hover:bg-ink/[0.04] disabled:opacity-50"
        >
          {addNote.isPending ? 'Adding…' : 'Add note'}
        </button>
      </article>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string | null;
}) {
  return (
    <div>
      <dt className="ledger-label">{label}</dt>
      <dd className={`mt-1 break-all text-ink ${mono ? 'font-utility text-xs' : 'text-sm'}`}>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-focus text-eucalypt underline underline-offset-2"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
