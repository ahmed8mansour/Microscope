import { describe, expect, it } from 'vitest';

const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY);

// Live test-mode calls against the real Stripe API. Skipped unless
// STRIPE_SECRET_KEY is set (e.g. in CI), mirroring the DATABASE_URL-gated
// pattern from 001/002 and payment.stripe-webhook.test.ts.
describe.skipIf(!hasStripeKey)('stripe adapter — refund (live, test mode)', () => {
  it('refunds a succeeded test-mode payment intent', async () => {
    const { stripeProvider } = await import('@/lib/payments/providers/stripe');
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    // Stripe's well-known test payment method token auto-succeeds without
    // requiring 3-D Secure — standard pattern for server-side test-mode
    // confirmation (no Stripe.js/Elements needed here).
    const pi = await stripe.paymentIntents.create({
      amount: 8900,
      currency: 'aud',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    const idempotencyKey = `refund_test_${pi.id}`;
    const result = await stripeProvider.refund({
      providerRef: pi.id,
      amount: pi.amount,
      idempotencyKey,
    });

    expect(result.accepted).toBe(true);
    expect(result.providerRefundRef).toMatch(/^re_/);

    // Verify against Stripe directly — the charge is now refunded.
    const updated = await stripe.paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] });
    const charge = typeof updated.latest_charge === 'object' ? updated.latest_charge : null;
    expect(charge?.refunded).toBe(true);
  }, 20000);

  it('is idempotent — the same idempotency key never issues a second refund', async () => {
    const { stripeProvider } = await import('@/lib/payments/providers/stripe');
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const pi = await stripe.paymentIntents.create({
      amount: 5000,
      currency: 'aud',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    const idempotencyKey = `refund_test_idem_${pi.id}`;
    const first = await stripeProvider.refund({ providerRef: pi.id, amount: pi.amount, idempotencyKey });
    const second = await stripeProvider.refund({ providerRef: pi.id, amount: pi.amount, idempotencyKey });

    // Stripe's idempotency guarantee: the same key returns the same
    // resulting refund object, not a second refund.
    expect(second.providerRefundRef).toBe(first.providerRefundRef);
  }, 20000);
});
