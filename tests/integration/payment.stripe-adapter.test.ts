import { describe, expect, it } from 'vitest';

const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY);

// Live test-mode calls against the real Stripe API. Skipped unless
// STRIPE_SECRET_KEY is set (e.g. in CI), so `npm test` stays green locally
// without live credentials — mirrors the DATABASE_URL-gated pattern.
describe.skipIf(!hasStripeKey)('stripe adapter (live, test mode)', () => {
  it('creates a PaymentIntent and maps a pending status', async () => {
    const { stripeProvider } = await import('@/lib/payments/providers/stripe');

    const intent = await stripeProvider.createIntent({
      orderId: 'test-order-id',
      amount: 8900,
      currency: 'AUD',
    });

    expect(intent.providerRef).toMatch(/^pi_/);
    expect(intent.clientSecret).toBeTruthy();

    const status = await stripeProvider.verify(intent.providerRef);
    // A freshly created, unconfirmed PaymentIntent is pending.
    expect(status).toBe('pending');
  });
});
