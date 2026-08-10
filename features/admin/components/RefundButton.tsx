'use client';

import { useEffect, useRef, useState } from 'react';
import { useRequestRefund } from '../hooks/use-refund';

function formatMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(minorUnits / 100);
}

// FR-034: an explicit confirmation stating the amount and that money
// returns to the customer — no refund executes until confirmed here.
export default function RefundButton({
  orderId,
  amount,
  currency,
}: {
  orderId: string;
  amount: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const refund = useRequestRefund(orderId);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleConfirm() {
    try {
      await refund.mutateAsync(reason.trim() || undefined);
      setOpen(false);
      setReason('');
    } catch {
      // Surfaced via refund.error below — dialog stays open so the admin
      // can see the failure and decide whether to retry.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
      >
        Refund
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <h3 id="refund-dialog-title" className="mb-2 text-base font-semibold text-neutral-900">
              Refund this order?
            </h3>
            <p className="mb-4 text-sm text-neutral-600">
              This will refund <strong>{formatMoney(amount, currency)}</strong> to the
              customer&rsquo;s original payment method. This cannot be undone.
            </p>
            <textarea
              aria-label="Refund reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Reason (optional)"
              className="mb-3 w-full rounded border border-neutral-300 p-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            {refund.isError && (
              <p role="alert" className="mb-3 text-sm text-red-600">
                {refund.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                disabled={refund.isPending}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={refund.isPending}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {refund.isPending ? 'Refunding…' : 'Confirm refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
