# Contract: Webhook Endpoint

`POST /api/webhooks/stripe` — the durable, signature-verified, idempotent source of order
truth. `runtime = 'nodejs'`. Reads the **raw body** for signature verification. Thin: delegates
to `lib/payments.parseWebhookEvent` + the order-sync service; no Stripe type appears here.

## Request

- Method: `POST`
- Headers: `stripe-signature: <t=…,v1=…>` (provider signature)
- Body: the raw event JSON (read via `request.text()`, verified byte-for-byte)

## Behavior

1. Read raw body + `stripe-signature`. Verify via `parseWebhookEvent(rawBody, signature)`.
   - Verification failure (bad/missing signature, outside replay tolerance) → **`400`**, no
     state change, log only (untrusted content is NOT persisted) (FR-008/009, SC-003).
2. Dedup: if the event id already exists in `webhook_events` → **`200`** no-op (FR-009).
3. Map `kind` → action and apply via the order-sync service (idempotent, forward-only):
   - `succeeded` → order `success` (+ receipt ref) **after** amount/currency match check; on
     mismatch → do NOT mark success, outcome `flagged`, note the order (FR-010/013, SC-007).
   - `failed` / `canceled` → order `failed` (FR-011).
   - `refunded` (full) → order `refunded` (FR-014).
   - `refund_partial` / `dispute` → outcome `flagged`, no status change (FR-014).
   - any other type → outcome `ignored`, no-op (FR-017).
4. Record the `webhook_events` row (id, type, outcome, order_id?) — audit + dedup (FR-014a).
5. **Order not yet visible** for an event that needs one → return a **retryable non-2xx**
   (e.g. `503`) and write **no** event row, so the provider redelivers (FR-018).
6. Acknowledge success with **`200`** quickly (FR-016).

## Responses

- `200` — processed, ignored, or duplicate (all acknowledged so the provider stops retrying).
- `400` — signature verification failed (unauthorized); no state change.
- `503` — transient (order not yet visible / datastore unavailable); provider will retry
  (FR-015/018). No partial writes.

## Invariants

- Exactly-once **effect** under duplicate/concurrent/out-of-order delivery (PK dedup + idempotent
  status update).
- Status derived only from the verified event, never from any client input (FR-023).
- No provider-specific object crosses out of `lib/payments`.
