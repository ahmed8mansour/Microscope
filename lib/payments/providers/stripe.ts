import 'server-only';

import Stripe from 'stripe';
import type { PaymentStatus } from '@/features/orders';
import type {
  CreateIntentInput,
  NormalizedIntent,
  NormalizedPaymentSnapshot,
  NormalizedWebhookEvent,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEventKind,
} from '../types';
import { NotRepriceableError } from '../types';

let client: Stripe | null = null;

function getClient(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY must be set (see .env.example).');
  }
  client = new Stripe(key);
  return client;
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET must be set (see .env.example).');
  }
  return secret;
}

// Stripe status -> normalized status. See
// specs/002-storefront-checkout-payments/contracts/payment-provider.md.
function mapStatus(pi: Stripe.PaymentIntent): PaymentStatus {
  const charge =
    typeof pi.latest_charge === 'object' && pi.latest_charge !== null ? pi.latest_charge : null;
  if (charge?.refunded) return 'refunded';

  switch (pi.status) {
    case 'succeeded':
      return 'success';
    case 'canceled':
      return 'failed';
    default:
      return 'pending';
  }
}

// Stripe event.type -> normalized kind. See
// specs/003-payment-webhook-success/contracts/payment-provider-ext.md.
function mapEventKind(event: Stripe.Event, charge: Stripe.Charge | null): WebhookEventKind {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return 'succeeded';
    case 'payment_intent.payment_failed':
      return 'failed';
    case 'payment_intent.canceled':
      return 'canceled';
    case 'charge.refunded':
      return charge?.refunded ? 'refunded' : 'refund_partial';
    case 'charge.dispute.created':
      return 'dispute';
    default:
      return 'other';
  }
}

function refString(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

export const stripeProvider: PaymentProvider = {
  name: 'stripe',

  async createIntent(input: CreateIntentInput): Promise<NormalizedIntent> {
    const stripe = getClient();
    const pi = await stripe.paymentIntents.create({
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      metadata: { orderId: input.orderId },
    });
    if (!pi.client_secret) {
      throw new Error('Stripe did not return a client secret');
    }
    return { providerRef: pi.id, clientSecret: pi.client_secret };
  },

  // Re-price an unconfirmed PaymentIntent (feature 005, FR-002a). Stripe only
  // permits updating `amount` while the intent is still open (requires_*
  // states); a succeeded/canceled intent rejects the update with an
  // invalid-request error, which we normalize to `NotRepriceableError` so the
  // route returns 409 rather than a 500. The amount is server-set by the
  // caller (`unitAmount × quantity`) — never client-supplied.
  async updateIntentAmount(providerRef: string, amount: number): Promise<void> {
    const stripe = getClient();
    try {
      await stripe.paymentIntents.update(providerRef, { amount });
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new NotRepriceableError(providerRef);
      }
      throw err;
    }
  },

  async verify(providerRef: string): Promise<PaymentStatus> {
    const stripe = getClient();
    const pi = await stripe.paymentIntents.retrieve(providerRef, {
      expand: ['latest_charge'],
    });
    return mapStatus(pi);
  },

  async parseWebhookEvent(rawBody: string, signature: string): Promise<NormalizedWebhookEvent> {
    const stripe = getClient();
    // Throws on invalid/missing signature or timestamp outside tolerance —
    // callers translate that to a rejected (400) response (FR-008, FR-009).
    const event = stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());

    const object = event.data.object as
      | Stripe.PaymentIntent
      | Stripe.Charge
      | Stripe.Dispute;

    const isPaymentIntent = event.type.startsWith('payment_intent.');
    const charge = event.type === 'charge.refunded' ? (object as Stripe.Charge) : null;

    return {
      id: event.id,
      type: event.type,
      kind: mapEventKind(event, charge),
      providerRef: isPaymentIntent
        ? (object as Stripe.PaymentIntent).id
        : refString((object as Stripe.Charge | Stripe.Dispute).payment_intent),
      amount: 'amount' in object ? object.amount : null,
      currency: 'currency' in object ? object.currency.toUpperCase() : null,
      // Not reliably present without an extra expand — the success-page
      // verification path (getPaymentSnapshot) fills this in instead.
      receiptRef: null,
    };
  },

  async getPaymentSnapshot(providerRef: string): Promise<NormalizedPaymentSnapshot> {
    const stripe = getClient();
    const pi = await stripe.paymentIntents.retrieve(providerRef, {
      expand: ['latest_charge'],
    });
    const charge =
      typeof pi.latest_charge === 'object' && pi.latest_charge !== null ? pi.latest_charge : null;
    if (!pi.client_secret) {
      throw new Error('Stripe did not return a client secret');
    }
    return {
      status: mapStatus(pi),
      amount: pi.amount,
      currency: pi.currency.toUpperCase(),
      clientSecret: pi.client_secret,
      receiptRef: charge?.receipt_url ?? null,
      customerRef: refString(pi.customer),
    };
  },

  // Issues the refund only — does not touch order/payment status (see
  // contracts/payment-provider-ext.md). Throws on rejection so the caller
  // (features/admin/services/refund.service.ts) can record a `failed`
  // outcome and leave the order untouched (FR-039).
  async refund({ providerRef, amount, idempotencyKey }: RefundInput): Promise<RefundResult> {
    const stripe = getClient();
    const refund = await stripe.refunds.create(
      { payment_intent: providerRef, amount },
      { idempotencyKey }
    );
    return { providerRefundRef: refund.id, accepted: true };
  },
};
