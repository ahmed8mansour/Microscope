# Feature Specification: Admin Dashboard & Analytics

**Feature Branch**: `004-admin-dashboard-analytics`
**Created**: 2026-08-07
**Status**: Draft
**Input**: User selection of four items from the specs-suggestions table — #8 Admin auth +
dashboard home (simple password protection; summary cards for orders, payments by status,
revenue today/month/total, conversion rate), #9 Orders management (orders table with all
fields; view details, mark fulfilled, add internal notes), #10 Analytics page (revenue over
time, orders/day, payment success rate, conversion rate, traffic sources), and #11 Analytics
instrumentation (funnel/conversion events for the internal dashboard) — consolidated into one
spec. These are the final features of the store. **MVP scope note:** the external Google
Analytics wiring originally listed in #11 is **deferred to a later iteration** (see
Clarifications 2026-08-07); instrumentation ships **first-party only** for the MVP.

## Overview

This feature delivers the **internal, staff-facing side of the store**: a
password-protected admin area layered on top of the authoritative order data (feature 1) and
the verified payment/webhook truth (feature 6). It gives the business owner a place to log
in, see the health of the store at a glance, work individual orders (view, fulfill,
annotate, and refund), and understand performance over time. It also wires up **conversion
instrumentation** across the public funnel (landing → payment) so the funnel and conversion
numbers shown in the dashboard reflect real customer behavior. (Instrumentation is first-party
only for the MVP; external Google Analytics export is deferred — see Clarifications.)

The public storefront and payment flow (features 1–7) are already specified/built; nothing
here changes how customers buy. For most surfaces this feature only *reads* order and payment
truth and *adds* fulfillment state and internal notes on top of it, plus emits analytics
events from the public funnel. The **one money-movement capability** it introduces is an
admin-initiated **refund**: the admin can request a refund, but the money movement is executed
server-side through the payment provider and the order's money state only becomes `Refunded`
from verified provider truth — never optimistically from the admin's click (Constitution
Principle III).

## Clarifications

### Session 2026-08-07

- Q: What does "simple password protection" mean for the admin area — full user accounts, or
  a single shared secret? → A: A **single shared admin password** (no user accounts, no
  usernames, no roles), consistent with Constitution Principle I (no auth systems / no user
  accounts) and Principle IV ("password protection is sufficient for MVP"). Entering the
  correct password establishes an admin session; there is exactly one privilege level.
- Q: How is "conversion rate" defined for the summary card and analytics? → A: **Completed
  purchases ÷ funnel entries** over the selected period, where a funnel entry is a unique
  visitor/session that reached the landing page and a completed purchase is an order whose
  payment status is `Success`. It is expressed as a percentage.
- Q: Is "revenue" gross or net of refunds? → A: **Net of refunds** — revenue counts only
  `Success` orders and excludes any amount later marked `Refunded`, matching feature 001's
  reconciliation rule ("reconciliation excludes refunded amounts").
- Q: Where do "traffic sources" come from? → A: From the **first-party analytics
  instrumentation** (referrer / UTM attribution captured when a visitor enters the funnel), not
  from the orders table. The Analytics page surfaces them; the orders table does not store them
  per order.
- Q: Should "mark fulfilled" and "internal notes" be available for non-successful orders? →
  A: **Fulfillment** applies only to `Success` orders (you cannot fulfill an unpaid or failed
  order); **internal notes** may be added to any order regardless of payment status (e.g. to
  annotate a failed or refunded order).

### Session 2026-08-07 (refund addition)

- Q: Should the admin be able to issue refunds from the dashboard, and if so how does the
  money move? → A: **Yes — admin-initiated refunds are in scope.** The admin requests the
  refund from an order; the system executes it **server-side through the payment provider**
  (via the same payment abstraction), and the order's payment status becomes `Refunded` only
  from the verified provider result (webhook + provider confirmation), never from the admin's
  click alone. The action requires an explicit confirmation, is idempotent (no double-refund),
  and is auditable.
- Q: Full refunds only, or partial/multiple refunds? → A: **Full refund of the order amount
  only** for the MVP, consistent with single-product simplicity (Principle I) — one order is
  one product at one amount. Partial or multiple refunds are out of scope and would require a
  later amendment.
- Q: Which orders are refundable? → A: Only orders whose payment status is `Success` (and not
  already `Refunded`). Pending/Failed orders never took money, so there is nothing to refund.

### Session 2026-08-07 (clarify)

- Q: When does an admin session expire? → A: **Idle timeout capped by an absolute maximum** —
  the session expires after 30 minutes of inactivity (refreshed on each authenticated
  request/activity) and, regardless of activity, after an absolute maximum of 12 hours from
  login, at which point the admin must re-enter the password.
- Q: How should the password gate resist brute-force attempts? → A: **Fixed lockout** — after 5
  failed attempts from a source (IP) within a 15-minute window, further attempts from that
  source are blocked for 15 minutes.
- Q: Where does the internal dashboard get funnel-entry counts and traffic-source data? → A:
  **First-party event store** — funnel/conversion events are persisted in the app's own
  datastore and the dashboard reads exclusively from there; this keeps figures
  server-verifiable, per Principle IV.
- Q: Is Google Analytics in scope for the MVP? → A: **No — deferred.** The MVP ships
  instrumentation **first-party only**. External Google Analytics wiring (the `gtag`/mirror half
  of the original feature #11) is deferred to a later iteration; it can be added later without
  changing the dashboard, which never reads GA regardless. The constitution still lists GA as an
  eventual analytics destination — this is a scope deferral, not a permanent removal.
- Q: What counts as a funnel entry for the conversion-rate denominator? → A: **Unique sessions,
  minus known bots and admin traffic** — a funnel entry is a unique visitor session; repeated
  loads within the same session count once, and requests identified as known bots/crawlers (by
  user-agent) or originating from an authenticated admin session are excluded from the
  denominator.
- Q: Is there a time limit on refunding an order from the dashboard? → A: **90-day window** —
  the refund action is offered only for orders paid within the last 90 days; older `Success`
  orders show refund as unavailable in the dashboard (they can still be handled directly in the
  provider if ever needed).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin logs in and sees store health at a glance (Priority: P1)

The business owner opens the admin area, is stopped by a password gate, enters the shared
admin password, and lands on a dashboard home that summarizes the state of the store:
how many orders exist, how payments break down by status, how much revenue came in today,
this month, and in total, and the current conversion rate. From there they can reach the
other admin pages.

**Why this priority**: The password gate and dashboard home are the foundation of the entire
admin experience — every other admin page lives behind the same gate and links from this
home. Without it there is no protected surface and no at-a-glance operational view. It is the
first admin slice that delivers standalone value: the owner can log in and instantly read the
store's status.

**Independent Test**: Navigate to the admin area without a session and confirm access is
refused; enter the correct password and confirm a session is established and the dashboard
home renders summary cards populated from real order/payment data; enter an incorrect
password and confirm access stays refused.

**Acceptance Scenarios**:

1. **Given** a visitor with no admin session, **When** they request any admin page, **Then**
   they are shown the password gate and cannot see any admin content.
2. **Given** the password gate, **When** the correct admin password is submitted, **Then** an
   admin session is established and the dashboard home is shown.
3. **Given** the password gate, **When** an incorrect password is submitted, **Then** access
   is refused and no admin session is established.
4. **Given** an authenticated admin on the dashboard home, **When** the page loads, **Then**
   it shows summary cards for: total order count, a breakdown of payments by status
   (Pending / Success / Failed / Refunded), revenue today, revenue this month, revenue all
   time (net of refunds), and the current conversion rate.
5. **Given** an authenticated admin, **When** they choose to end their session (log out),
   **Then** the admin session is cleared and subsequent admin requests are refused until they
   re-enter the password.

---

### User Story 2 - Admin manages individual orders (Priority: P1)

The owner opens the orders area and sees a table of every order with all its fields. They can
open a single order to view its full details, mark a paid order as fulfilled once they have
shipped/delivered the product, and add internal notes to any order for their own record-
keeping.

**Why this priority**: Fulfillment and note-taking are the core day-to-day operational job of
the store owner — this is what turns "a payment happened" into "the customer got their
product." It is P1 alongside the dashboard because a store that can take money but not track
fulfillment is not operable. It builds directly on Story 1's protected surface.

**Independent Test**: As an authenticated admin, open the orders list and confirm it lists
orders with all fields; open one order and confirm full details render; mark a `Success`
order fulfilled and confirm the state persists and is reflected in the list; add an internal
note to an order and confirm it persists and is visible on re-open.

**Acceptance Scenarios**:

1. **Given** an authenticated admin, **When** they open the orders page, **Then** a table
   lists all orders showing every stored field (identifier, customer contact, amount,
   currency, payment status, fulfillment state, payment reference, created/updated
   timestamps).
2. **Given** the orders table, **When** the admin opens a single order, **Then** its full
   details are shown, including any internal notes previously added.
3. **Given** an order whose payment status is `Success` and is not yet fulfilled, **When** the
   admin marks it fulfilled, **Then** its fulfillment state is persisted as fulfilled and the
   change is reflected in both the detail view and the list.
4. **Given** an order whose payment status is not `Success` (Pending / Failed / Refunded),
   **When** the admin views it, **Then** the "mark fulfilled" action is unavailable.
5. **Given** any order, **When** the admin adds an internal note, **Then** the note is
   persisted, attributed with a timestamp, and visible whenever the order is re-opened.
6. **Given** a large number of orders, **When** the admin opens the orders page, **Then** the
   table remains usable (orders are paginated or otherwise bounded so the page stays
   responsive).

---

### User Story 3 - Admin reviews performance on the analytics page (Priority: P2)

The owner opens an analytics page that shows how the store is performing over time: revenue
over a selected period, orders per day, the payment success rate, the conversion rate, and
where traffic is coming from (traffic sources). This helps them understand trends rather than
just the current snapshot on the dashboard home.

**Why this priority**: Analytics is decision-support, not day-to-day operation — valuable but
not required to run the store, so it sits below the operational P1 stories. It depends on the
same protected surface (Story 1) and on instrumentation (Story 4) for traffic-source and
funnel data.

**Independent Test**: As an authenticated admin, open the analytics page for a chosen period
and confirm it renders revenue-over-time, orders-per-day, payment success rate, conversion
rate, and traffic sources computed from order data and captured analytics events.

**Acceptance Scenarios**:

1. **Given** an authenticated admin, **When** they open the analytics page, **Then** it shows
   revenue over time, orders per day, payment success rate, conversion rate, and traffic
   sources for a default period.
2. **Given** the analytics page, **When** the admin selects a different time period, **Then**
   all metrics recompute for that period.
3. **Given** a period with no orders, **When** the analytics page loads, **Then** each metric
   renders a clear empty/zero state rather than an error.
4. **Given** analytics events attributing visits to referrers/campaigns, **When** the traffic
   sources view renders, **Then** it groups funnel entries by source and shows their relative
   contribution.

---

### User Story 4 - Funnel activity is instrumented for conversion measurement (Priority: P2)

As customers move through the public funnel — landing on the store, and reaching/completing
payment — the system records first-party analytics events for the internal dashboard that
capture each funnel step and its conversion. This is what makes the conversion rate and
traffic-source figures in the dashboard and analytics page real rather than estimated.
(External Google Analytics export is deferred post-MVP; see Clarifications.)

**Why this priority**: Instrumentation is a cross-cutting enabler for the conversion and
traffic-source metrics; the dashboard/analytics pages can ship with order-derived metrics
first, so instrumentation is P2. It touches the public funnel (features 3 and 5) but must not
alter the purchase experience.

**Independent Test**: Walk the public funnel (view landing, reach payment, complete a
payment) and confirm a corresponding funnel/conversion event is emitted for each step with
its attribution, and that these events feed the dashboard's conversion figure and the
analytics page's funnel/traffic-source views — without changing what the customer sees.

**Acceptance Scenarios**:

1. **Given** a visitor arrives at the landing page, **When** the page loads, **Then** a
   "funnel entry" event is recorded with available attribution (referrer / campaign
   parameters).
2. **Given** a visitor reaches the payment step, **When** that step is presented, **Then** a
   corresponding funnel event is recorded.
3. **Given** a payment is confirmed as successful (server-verified), **When** the success is
   recorded, **Then** a conversion event is recorded and counted toward conversion rate.
4. **Given** instrumentation is active, **When** a customer completes the funnel, **Then**
   their purchase experience (steps, speed, fields) is unchanged from the un-instrumented
   flow.
5. **Given** the first-party analytics recording endpoint is slow, failing, or unavailable,
   **When** a customer moves through the funnel, **Then** the funnel still functions normally
   and no customer-facing error occurs (events are recorded fire-and-forget).

---

### User Story 5 - Admin issues a refund for a paid order (Priority: P2)

When a customer needs their money back (defective product, cancelled order, dispute), the
owner opens the paid order in the admin area and issues a **full refund**. After an explicit
confirmation, the system executes the refund through the payment provider server-side; once
the provider confirms it, the order's payment status becomes `Refunded`, that amount drops out
of net revenue, and the reason/outcome is recorded on the order for the audit trail. The
customer receives their money back through the original payment method via the provider.

**Why this priority**: Refunds are a real operational need but occur far less often than
fulfillment, and the store can run without them at launch (refunds can still be issued in the
provider's own dashboard). That makes this P2 — valuable, but below the P1 login/orders
operations. Because it moves money, it is the highest-risk story here and must obey Principle
III end to end. It builds on Story 2's order surface.

**Independent Test**: As an authenticated admin, open a `Success` order, issue a full refund,
confirm the provider processes it, and verify the order transitions to `Refunded` from the
verified provider result, the refunded amount is excluded from net revenue, and a repeat
refund attempt on the same order does not move money a second time. Confirm the refund action
is unavailable on non-`Success` (Pending / Failed / already-`Refunded`) orders.

**Acceptance Scenarios**:

1. **Given** an authenticated admin viewing a `Success`, not-yet-refunded order, **When** they
   choose to refund it, **Then** they are shown an explicit confirmation stating the amount
   and that the money will be returned to the customer, and no refund occurs until they
   confirm.
2. **Given** the admin confirms the refund, **When** the request is processed, **Then** the
   system issues the refund to the payment provider server-side for the full order amount and
   does not mark the order `Refunded` from the click alone.
3. **Given** the payment provider confirms the refund succeeded (via provider response and/or
   webhook), **When** that verified result is received, **Then** the order's payment status
   becomes `Refunded`, the refunded amount is excluded from net revenue, and the payments-by-
   status figures update accordingly.
4. **Given** an order that is not refundable — payment status not `Success` (Pending / Failed /
   already `Refunded`), or paid more than 90 days ago — **When** the admin views it, **Then**
   the refund action is unavailable and is rejected if attempted directly.
5. **Given** a refund has already been issued for an order, **When** a refund is requested
   again (including from a concurrent admin session or a retried request), **Then** no second
   refund is executed and the customer is not paid twice.
6. **Given** the payment provider rejects or fails the refund, **When** the failure is
   returned, **Then** the order's money state is left unchanged (still `Success`), the failure
   is surfaced to the admin and recorded, and no partial/ambiguous state is persisted.
7. **Given** a refund is issued, **When** it completes, **Then** the order records who/when it
   was refunded and any admin-supplied reason, so the action is auditable.

---

### Edge Cases

- **Wrong / repeated wrong password**: The gate must not reveal whether the password is
  "close"; after 5 failed attempts from a source within 15 minutes, that source is locked out
  for 15 minutes so the single shared secret cannot be trivially brute-forced.
- **Session expiry / stale session**: A session that has been idle for more than 30 minutes,
  has exceeded its 12-hour absolute maximum since login, or is tampered with, is treated as no
  session — the gate is shown again; no admin data leaks. Each authenticated request refreshes
  the idle window (but not the absolute cap).
- **Direct link to a deep admin page**: Requesting an inner admin page (an order detail, the
  analytics page) without a session redirects to the gate, then ideally back to the
  requested page after login.
- **Concurrent fulfillment**: Two admin sessions marking the same order fulfilled must
  converge to "fulfilled once" without error or double-side-effect.
- **Marking an unpaid/failed/refunded order fulfilled**: Disallowed; the action is not
  offered and is rejected if attempted directly.
- **Refund after fulfillment**: An order can be `Success` + fulfilled and later become
  `Refunded`; revenue must drop it out of net revenue while the order and its notes remain
  visible with an accurate status. Fulfillment state is not reversed by a refund (the product
  may already have shipped) — the two are tracked independently.
- **Refund executed but confirmation lags**: If the provider accepts the refund but its
  confirmation/webhook is delayed, the order must not be shown as `Refunded` until verified,
  and the eventual confirmation must apply exactly once (idempotent) — matching the same
  hybrid/idempotent handling used for payment success.
- **Double / concurrent refund**: Two refund requests for the same order (retry, double-click,
  two admin sessions) must result in the customer being refunded at most once.
- **Refund provider failure / timeout**: A rejected or timed-out refund leaves money state
  unchanged (`Success`), surfaces the error to the admin, and records the attempt; it must not
  leave the order in an ambiguous half-refunded state.
- **Refunding a non-refundable order**: Attempting to refund a Pending, Failed, already
  `Refunded`, or beyond-90-day order is disallowed and rejected server-side even if requested
  directly.
- **Order just past the 90-day window**: An order paid 91 days ago shows refund as unavailable
  in the dashboard; the boundary is evaluated server-side against payment time.
- **Revenue period boundaries**: "Today" and "this month" must be computed against a single,
  well-defined timezone so figures are stable and reconcilable.
- **Empty store**: With zero orders, all cards/metrics show zero/empty states, and conversion
  rate with zero funnel entries shows a defined value (e.g. 0%) rather than a divide-by-zero
  error.
- **Very large notes / malicious note content**: Internal notes are length-bounded and
  treated as untrusted text (not rendered as active content).
- **Analytics discrepancy**: First-party funnel counts can still be affected by bots or
  visitors who block scripts/requests; the dashboard should be clear about which source a figure
  uses (orders table vs first-party funnel store) and not present a recording gap as lost sales.

## Requirements *(mandatory)*

### Functional Requirements

#### Admin access & session (Story 1)

- **FR-001**: The system MUST protect every admin route so that no admin content is served
  without a valid admin session.
- **FR-002**: The system MUST establish an admin session only upon submission of the correct
  single shared admin password, and MUST NOT expose any usernames, accounts, or roles.
- **FR-003**: The system MUST validate the submitted password on the server side and MUST NOT
  rely on any client-side check for access control.
- **FR-004**: The system MUST allow an authenticated admin to end their session (log out), and
  MUST expire an admin session after 30 minutes of inactivity (idle timeout, refreshed on each
  authenticated request) and, regardless of activity, after an absolute maximum of 12 hours
  from login; after logout or either expiry, admin routes are refused until the password is
  re-entered.
- **FR-005**: The system MUST resist password brute-forcing by locking out a source (IP) after
  5 failed attempts within a 15-minute window, blocking further attempts from that source for
  15 minutes, and MUST NOT reveal how close a submitted password is.
- **FR-006**: The system MUST keep the admin password out of source control, referencing it
  only via environment configuration.

#### Dashboard home (Story 1)

- **FR-007**: The dashboard home MUST display a total order count.
- **FR-008**: The dashboard home MUST display a breakdown of payments by status across the
  four defined statuses (Pending, Success, Failed, Refunded).
- **FR-009**: The dashboard home MUST display revenue for today, revenue for the current
  month, and revenue all-time, each computed **net of refunds** (Success amounts only,
  excluding Refunded amounts).
- **FR-010**: The dashboard home MUST display the current conversion rate, defined as
  completed purchases (Success orders) ÷ funnel entries, expressed as a percentage.
- **FR-011**: All summary figures MUST be derived from server-side sources of truth (order
  records and verified payment state), never from client-supplied values.

#### Orders management (Story 2)

- **FR-012**: The system MUST present an orders list showing every stored order field for
  each order.
- **FR-013**: The system MUST let an admin open a single order and view its full details,
  including its internal notes.
- **FR-014**: The system MUST let an admin mark a `Success` order as fulfilled, persisting the
  fulfillment state, and MUST reflect the change in both the detail and list views.
- **FR-015**: The system MUST NOT allow orders whose payment status is not `Success` to be
  marked fulfilled.
- **FR-016**: Marking an order fulfilled MUST be idempotent — repeating it (including from
  concurrent sessions) leaves the order fulfilled exactly once with no duplicate side effects.
- **FR-017**: The system MUST let an admin add internal notes to any order regardless of
  payment status; each note MUST be persisted with a timestamp and remain visible on re-open.
- **FR-018**: Internal notes MUST be length-bounded and stored/displayed as inert text (not
  executed or rendered as active content).
- **FR-019**: The orders list MUST stay responsive with large numbers of orders (e.g. via
  pagination or bounded queries) and SHOULD support locating orders (e.g. filter by payment
  status or fulfillment state).
- **FR-020**: Fulfillment state and internal notes MUST be additive to existing order data and
  MUST NOT alter payment/money state or the webhook-derived source of truth.

#### Refunds (Story 5)

- **FR-032**: The system MUST let an admin issue a **full refund** (the entire order amount)
  for an order whose payment status is `Success`, is not already `Refunded`, and was paid
  within the last **90 days**.
- **FR-033**: The system MUST NOT offer or execute a refund for orders whose payment status is
  Pending, Failed, or `Refunded`, or whose payment is older than the 90-day refund window, and
  MUST reject such a request server-side even if attempted directly.
- **FR-034**: The system MUST require an explicit admin confirmation — stating the amount and
  that the money will be returned to the customer — before executing any refund.
- **FR-035**: The system MUST execute the refund **server-side through the payment provider**
  (via the payment abstraction), and MUST NOT rely on any client-side action to move money.
- **FR-036**: The order's payment status MUST transition to `Refunded` **only from the verified
  provider result** (provider confirmation and/or the refund webhook event), never optimistically
  from the admin's click.
- **FR-037**: Refund processing MUST be idempotent — retries, double submissions, and
  concurrent requests for the same order MUST result in the customer being refunded at most
  once, with no duplicate side effects. This MUST reuse the same idempotent, signature-verified
  webhook handling established for payment events (feature 6).
- **FR-038**: If the provider rejects or fails the refund, the system MUST leave the order's
  money state unchanged (`Success`), surface the failure to the admin, and record the attempt —
  it MUST NOT persist a partial or ambiguous refund state.
- **FR-039**: A successful refund MUST exclude the refunded amount from net revenue everywhere
  it is reported (dashboard cards and analytics), and MUST update the payments-by-status
  figures.
- **FR-040**: The system MUST record refund provenance on the order — that it was refunded, by
  the admin, when, and any admin-supplied reason — so the action is auditable. Refunding MUST
  NOT reverse the order's independent fulfillment state.
- **FR-041**: The refund action MUST be available only to an authenticated admin session (it is
  a protected admin operation subject to FR-001–FR-003).

#### Analytics page (Story 3)

- **FR-021**: The analytics page MUST present revenue over time, orders per day, payment
  success rate, conversion rate, and traffic sources.
- **FR-022**: The analytics page MUST let the admin choose a time period, recomputing all
  metrics for the selected period.
- **FR-023**: Payment success rate MUST be defined as Success orders ÷ total payment attempts
  over the period, expressed as a percentage.
- **FR-024**: The analytics page MUST render clear empty/zero states for periods with no
  activity rather than errors.
- **FR-025**: Traffic sources MUST be derived from captured analytics/attribution data (see
  instrumentation), grouping funnel entries by source with their relative contribution.

#### Analytics instrumentation (Story 4)

- **FR-026**: The system MUST emit a funnel event when a visitor enters the funnel (landing),
  capturing available attribution (referrer / campaign parameters). For the conversion-rate
  denominator, funnel entries MUST be counted as **unique sessions** (repeated loads in the
  same session count once) and MUST exclude requests identified as known bots/crawlers (by
  user-agent) and any traffic originating from an authenticated admin session.
- **FR-027**: The system MUST emit a funnel event when a visitor reaches the payment step.
- **FR-028**: The system MUST emit a conversion event when a payment is confirmed successful,
  and this event MUST be tied to server-verified success (never to an unverified client
  signal).
- **FR-029**: Instrumentation MUST persist funnel/conversion events in the app's own
  first-party datastore, which is the internal dashboard's sole source for funnel-entry counts
  and traffic sources. (External export to Google Analytics is deferred post-MVP and, when
  added, MUST NOT become the dashboard's data source.)
- **FR-030**: Instrumentation MUST NOT change the customer's purchase experience, MUST NOT
  add friction or steps to the funnel, and MUST fail silently (no customer-facing error) if
  the first-party recording endpoint is slow, failing, or unavailable.
- **FR-031**: Instrumentation MUST NOT place personal or sensitive customer data into
  analytics event parameters or URLs.

### Key Entities *(include if feature involves data)*

- **Admin session**: A transient, server-validated proof that the shared admin password was
  supplied. Has no username or role — one privilege level. Attributes: established-at,
  expiry; no personal data.
- **Order (existing, extended)**: The authoritative order record from feature 1 (identifier,
  customer contact, amount, currency, payment status, payment reference, timestamps,
  fulfillment boolean). This feature *reads* it and *adds* fulfillment transitions, associated
  internal notes, and refund provenance. It does not create orders; the only money-state change
  it makes is an admin-initiated refund, and even that is applied only from verified provider
  truth (see Refund).
- **Internal note**: An admin-authored annotation attached to an order. Attributes: parent
  order, note text (bounded, inert), created-at timestamp. May attach to orders of any
  payment status.
- **Refund**: A record of an admin-initiated, provider-executed return of the full order
  amount to the customer. Attributes: parent order, amount, provider refund reference,
  status/outcome, initiating admin session, admin-supplied reason, timestamp. Drives the order
  to `Refunded` only once the provider confirms; keyed so processing is idempotent (at most one
  refund per order).
- **Funnel/analytics event**: A first-party record — **persisted in the app's own datastore** —
  of a customer reaching a funnel step (entry / payment / conversion) with attribution
  (referrer / campaign, timestamp). It is the dashboard's sole source for conversion rate and
  traffic-source views. Contains no personal/sensitive customer data.
- **Aggregate metric (derived, not stored)**: Computed summaries — order counts, payments-by-
  status, revenue (today/month/all-time, net of refunds), conversion rate, payment success
  rate, orders/day, revenue-over-time, traffic-source breakdown — derived on demand from
  orders and analytics events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of admin routes are inaccessible without a valid session — no admin data
  (orders, revenue, notes) is retrievable without first passing the password gate.
- **SC-002**: An admin can log in and reach the dashboard home in under 30 seconds, and the
  home's summary cards reflect current order/payment truth (they match the underlying records
  exactly).
- **SC-003**: Revenue figures on the dashboard reconcile to the payment provider's records
  net of refunds with zero discrepancy for a given period.
- **SC-004**: An admin can locate a specific order and mark it fulfilled in under 1 minute,
  and the fulfillment state is immediately consistent across the list and detail views.
- **SC-005**: Marking the same order fulfilled twice (including concurrently) never produces a
  duplicate side effect — the order is fulfilled exactly once.
- **SC-006**: The orders page remains responsive (loads within a few seconds) with at least
  10,000 orders present.
- **SC-007**: For any selected period, the analytics page's conversion rate and payment
  success rate equal an independent manual computation from the same underlying data.
- **SC-008**: At least 95% of completed purchases produce a corresponding server-verified
  conversion event.
- **SC-009**: Enabling instrumentation causes no measurable regression in funnel completion
  time or conversion rate, and a slow/failing/unavailable first-party recording endpoint
  produces zero customer-facing errors.
- **SC-010**: No personal or sensitive customer data appears in any analytics event payload or
  URL parameter.
- **SC-011**: An admin can refund a `Success` order in under 1 minute, and the order shows as
  `Refunded` only after the provider confirms; the refunded amount then reconciles to the
  provider's refund records with zero discrepancy and is excluded from net revenue.
- **SC-012**: A refund is executed at most once per order — repeated, retried, or concurrent
  refund requests never return money to the customer twice.
- **SC-013**: A failed/rejected refund leaves the order's money state unchanged (`Success`)
  100% of the time, with the failure surfaced and recorded and no ambiguous half-refunded
  state persisted.

## Assumptions

- **Single shared admin password** (no user accounts, usernames, or roles) is sufficient for
  the MVP, per Constitution Principles I and IV. There is exactly one admin privilege level.
- The **orders record from feature 1** (with the `Pending`/`Success`/`Failed`/`Refunded`
  payment model and a separate `fulfilled` boolean) already exists and is the system of
  record; this feature reads it and adds fulfillment transitions and internal notes on top.
- The **webhook/order-sync truth from feature 6** already keeps payment state authoritative
  and server-verified; the dashboard trusts that state and does not re-derive money outcomes
  from the client.
- **Revenue is net of refunds** and computed in a single well-defined timezone for "today"/
  "this month" boundaries, matching feature 001's reconciliation rule.
- **Refunds are full-amount only** for the MVP (one order = one product at one amount), and are
  offered only within a **90-day window** from payment; partial refunds, repeated refunds, and
  out-of-window refunds are out of scope and would require a later amendment. The refund is
  executed through the existing payment abstraction/provider and confirmed via the same
  idempotent, signature-verified webhook path as payments (feature 6).
- **Conversion rate** = Success orders ÷ funnel entries, where **funnel entries are unique
  sessions excluding known bots/crawlers and authenticated-admin traffic**; **payment success
  rate** = Success orders ÷ total payment attempts. Funnel entries and traffic sources come from
  the first-party event store; order-derived metrics come from the orders table.
- **Analytics is first-party only for the MVP**: the internal dashboard consumes funnel/
  conversion data from the app's own event store. External **Google Analytics** export is
  **deferred** to a later iteration (the constitution still lists GA as an eventual destination).
  Instrumentation is best-effort and must not block the funnel.
- The **public funnel (features 3 and 5)** already exists; instrumentation attaches to it
  without altering the customer experience.
- This is the **final feature set** for the store; no additional customer-facing scope is
  introduced here (consistent with Principle I — single-product simplicity).

## Dependencies

- **Feature 1 (Data & Payment Foundation, spec 001)**: provides the authoritative `orders`
  record, payment-status model, and the `fulfilled` boolean this feature reads and updates.
- **Feature 6 (Stripe webhook & order sync, part of spec 003)**: provides the server-verified,
  idempotent payment truth the dashboard and revenue figures rely on, and the refund webhook
  handling that confirms an admin-initiated refund and drives the order to `Refunded`.
- **Feature 2 (Payment provider abstraction, part of spec 002)**: the provider-agnostic payment
  abstraction that the refund operation extends with a server-side "issue refund" capability,
  keeping Stripe isolated behind the abstraction (Principle III).
- **Feature 3 (Landing page, part of spec 002)**: the top of the funnel that instrumentation
  attaches a "funnel entry" event to.
- **Feature 5 (Payment page, part of spec 003)**: the payment step that instrumentation marks,
  and whose server-verified success drives the conversion event.

## Out of Scope

- User accounts, usernames, roles/permissions, or any general authentication system beyond the
  single shared admin password (Principle I).
- Editing arbitrary order money/payment state, or triggering fulfillment side effects
  (shipping labels, emails) from the dashboard. The one exception is the admin-initiated
  **full refund** (User Story 5), which is provider-executed and provider-verified.
- **Partial refunds, repeated/multiple refunds per order, and store-credit or alternate-method
  refunds** — only a single full refund to the original payment method is in scope.
- Changing the customer-facing storefront, checkout, or payment experience.
- Any additional product, catalog, or inventory management.
