import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Passwordless customer contact record (NOT an authenticated account) — no
// password, no login, no session-as-identity. See
// specs/002-storefront-checkout-payments/data-model.md.
// RLS is enabled with no policies: all access goes through the server-only
// Drizzle client (service-role-equivalent trusted connection).
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email'),
    whatsapp: text('whatsapp'),
    // Per-checkout verification: `verified` is reset when a new code is issued
    // and consumed on payment-intent creation; `verifiedAt` bounds its
    // freshness so a stale verification cannot authorize a later purchase
    // (spec Session 2026-08-04).
    verified: boolean('verified').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    // OTP verification state — hashed code, never plaintext (FR-006).
    otpCodeHash: text('otp_code_hash'),
    otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
    otpAttemptCount: integer('otp_attempt_count').notNull().default(0),
    otpLastSentAt: timestamp('otp_last_sent_at', { withTimezone: true }),
    otpSendCount: integer('otp_send_count').notNull().default(0),
    otpSendWindowStart: timestamp('otp_send_window_start', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('users_otp_attempt_count_check', sql`${t.otpAttemptCount} >= 0`),
    check('users_otp_send_count_check', sql`${t.otpSendCount} >= 0`),
    // Case-insensitive uniqueness — one record per email (FR-004).
    uniqueIndex('users_email_uidx').on(sql`lower(${t.email})`),
  ]
).enableRLS();

// Authoritative order record. See specs/001-data-payment-foundation/data-model.md
// (amended by specs/002-storefront-checkout-payments/data-model.md: contact moved
// to `users`; orders now relate to a user via `user_id`).
// RLS is enabled with no policies: all access in this feature goes through the
// server-only Drizzle client (service-role-equivalent trusted connection).
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // Minor units (e.g. cents) — precise integer, no rounding drift. Holds the
    // ORDER TOTAL: `unitAmount × quantity` (feature 005). Kept as the total so
    // 003's webhook amount check (event.amount === order.amount) and 004's
    // revenue sums need no change.
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    // Units of the single product (feature 005). Positive integer, no upper
    // cap; `amount` is always `unitAmount × quantity`, both written together.
    quantity: integer('quantity').notNull().default(1),
    paymentStatus: text('payment_status').notNull().default('pending'),
    fulfilled: boolean('fulfilled').notNull().default(false),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeReceiptUrl: text('stripe_receipt_url'),
    stripeCustomerId: text('stripe_customer_id'),
    notes: text('notes'),
    // Admin-recorded supplier (Alibaba/AliExpress) order + tracking references,
    // set at manual fulfillment (feature 005). Recording them never changes
    // `payment_status` — fulfillment and payment are independent.
    supplierOrderRef: text('supplier_order_ref'),
    supplierTrackingRef: text('supplier_tracking_ref'),
    // Set once, by order-sync, on the first verified transition to `success`
    // (never cleared by a later `refunded`). Anchors revenue windows and the
    // admin refund 90-day eligibility window. See
    // specs/004-admin-dashboard-analytics/data-model.md.
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('orders_amount_check', sql`${t.amount} >= 0`),
    check('orders_currency_check', sql`char_length(${t.currency}) = 3`),
    // Positive integer, no upper cap (feature 005).
    check('orders_quantity_check', sql`${t.quantity} >= 1`),
    check(
      'orders_payment_status_check',
      sql`${t.paymentStatus} in ('pending','success','failed','refunded')`
    ),
    // A fulfilled order must have been PAID — i.e. `success`, or `refunded`
    // after the fact. Refund-after-fulfilment is an explicit spec case
    // (feature 004): the product may already have shipped, so a refund does
    // NOT reverse fulfilment — the two are tracked independently. The
    // original 001 form (`= 'success'`) wrongly blocked the webhook from
    // moving a fulfilled order to `refunded`.
    check(
      'orders_fulfilled_requires_success_check',
      sql`(not ${t.fulfilled}) or ${t.paymentStatus} in ('success','refunded')`
    ),
    // Partial unique index: multiple NULLs are allowed (orders without a payment
    // reference yet), but any real reference must be globally unique.
    uniqueIndex('orders_payment_intent_uidx')
      .on(t.stripePaymentIntentId)
      .where(sql`${t.stripePaymentIntentId} is not null`),
    index('orders_created_at_idx').on(t.createdAt.desc()),
    index('orders_user_id_idx').on(t.userId),
  ]
).enableRLS();

// Per-order snapshot of the validated, normalized shipping destination
// (feature 005). 1:1 with `orders` (unique order_id). PII: RLS enabled with no
// anon policies (server-only), columns nullable so the address can be
// anonymized later while the order/financial record survives — the same rule
// as `users.email`/`whatsapp`. Values stored are the provider-NORMALIZED
// address, not the raw client input. `phone` is a snapshot of the customer's
// `users.whatsapp` at purchase (no separate phone field). See
// specs/005-quantity-shipping-fulfillment/data-model.md.
export const shippingAddresses = pgTable(
  'shipping_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    recipientName: text('recipient_name'),
    phone: text('phone'),
    country: text('country'), // ISO-3166 alpha-2, uppercase
    state: text('state'),
    city: text('city'),
    line1: text('line1'),
    line2: text('line2'),
    postalCode: text('postal_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'shipping_addresses_country_check',
      sql`${t.country} is null or char_length(${t.country}) = 2`
    ),
    // 1:1 with orders — exactly one snapshot per order.
    uniqueIndex('shipping_addresses_order_id_uidx').on(t.orderId),
  ]
).enableRLS();

// Dedup + audit record for each *verified* webhook event. Its primary key
// (the provider's event id) is the idempotency mechanism; `outcome` makes it
// a durable audit trail. See specs/003-payment-webhook-success/data-model.md.
// Signature-rejected/forged events are never written here (untrusted,
// unkeyable) — they go to application logs only.
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(), // provider event id, e.g. "evt_…"
    type: text('type').notNull(),
    outcome: text('outcome').notNull(),
    orderId: uuid('order_id').references(() => orders.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'webhook_events_outcome_check',
      sql`${t.outcome} in ('processed','ignored','flagged')`
    ),
    index('webhook_events_order_id_idx').on(t.orderId),
  ]
).enableRLS();

// Append-only admin annotations on an order. Distinct from `orders.notes`,
// which order-sync owns for amount/currency anomaly flags — admin notes are
// additive and multi-valued, so they get their own table. See
// specs/004-admin-dashboard-analytics/data-model.md.
// RLS is enabled with no policies: all access goes through the server-only
// Drizzle client (service-role-equivalent trusted connection).
export const orderNotes = pgTable(
  'order_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('order_notes_body_length_check', sql`char_length(${t.body}) between 1 and 2000`),
    index('order_notes_order_id_created_at_idx').on(t.orderId, t.createdAt.desc()),
  ]
).enableRLS();

// Admin-initiated refund record + at-most-once guard. Exactly one refund per
// order (MVP: full refunds only). This row records the *request* and its
// provenance — it does NOT itself change `orders.payment_status`; that only
// happens from the verified `charge.refunded` webhook via the existing
// order-sync path (Principle III). See
// specs/004-admin-dashboard-analytics/data-model.md and
// contracts/payment-provider-ext.md.
// RLS is enabled with no policies: all access goes through the server-only
// Drizzle client (service-role-equivalent trusted connection).
export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    // Minor units — full order amount (MVP: no partial refunds).
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull().default('requested'),
    providerRefundRef: text('provider_refund_ref'),
    reason: text('reason'),
    // Admin session marker — single shared admin, no accounts (Principle I).
    requestedBy: text('requested_by').notNull(),
    failureMessage: text('failure_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('refunds_amount_check', sql`${t.amount} >= 0`),
    check('refunds_currency_check', sql`char_length(${t.currency}) = 3`),
    check('refunds_status_check', sql`${t.status} in ('requested','failed')`),
    check(
      'refunds_reason_length_check',
      sql`${t.reason} is null or char_length(${t.reason}) <= 500`
    ),
    // At most one refund per order — the idempotency guard (FR-038, SC-012).
    uniqueIndex('refunds_order_id_uidx').on(t.orderId),
  ]
).enableRLS();

// First-party funnel/conversion event store — the internal dashboard's sole
// source for funnel-entry counts and traffic sources (Google Analytics
// export is deferred post-MVP; this table is never mirrored from GA). See
// specs/004-admin-dashboard-analytics/data-model.md and
// contracts/analytics-events.md.
// RLS is enabled with no policies: all access goes through the server-only
// Drizzle client (service-role-equivalent trusted connection).
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    step: text('step').notNull(),
    // First-party analytics session id (cookie) — dedup key, not linked to
    // customer identity.
    sessionId: text('session_id').notNull(),
    source: text('source'),
    referrer: text('referrer'),
    campaign: text('campaign'),
    orderId: uuid('order_id').references(() => orders.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('analytics_events_step_check', sql`${t.step} in ('entry','payment','conversion')`),
    // At most one countable `entry` per session (dedup — a refresh within the
    // same session does not inflate the funnel-entry denominator).
    uniqueIndex('analytics_events_entry_session_uidx')
      .on(t.sessionId)
      .where(sql`${t.step} = 'entry'`),
    // At most one `conversion` per order (idempotent under duplicate
    // webhook-driven success transitions, FR-028).
    uniqueIndex('analytics_events_conversion_order_uidx')
      .on(t.orderId)
      .where(sql`${t.step} = 'conversion'`),
    index('analytics_events_step_created_at_idx').on(t.step, t.createdAt),
    index('analytics_events_session_id_idx').on(t.sessionId),
    index('analytics_events_order_id_idx').on(t.orderId),
  ]
).enableRLS();

// Brute-force lockout for the admin password gate — one row per client IP.
// Holds no PII beyond the transient IP itself. See
// specs/004-admin-dashboard-analytics/data-model.md and
// contracts/admin-auth-api.md.
// RLS is enabled with no policies: all access goes through the server-only
// Drizzle client (service-role-equivalent trusted connection).
export const adminAuthAttempts = pgTable(
  'admin_auth_attempts',
  {
    ip: text('ip').primaryKey(),
    attemptCount: integer('attempt_count').notNull().default(0),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('admin_auth_attempts_count_check', sql`${t.attemptCount} >= 0`)]
).enableRLS();
