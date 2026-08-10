import { describe, expect, it } from 'vitest';

const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY);

// Live test-mode calls against the real Stripe API. Skipped unless
// STRIPE_SECRET_KEY is set (e.g. in CI), mirroring the DATABASE_URL-gated
// pattern from 001/002.
describe.skipIf(!hasStripeKey)('stripe adapter — webhook & snapshot (live, test mode)', () => {
  it('getPaymentSnapshot normalizes a freshly created intent as pending', async () => {
    const { stripeProvider } = await import('@/lib/payments/providers/stripe');

    const intent = await stripeProvider.createIntent({
      orderId: 'test-order-id',
      amount: 8900,
      currency: 'AUD',
    });

    const snapshot = await stripeProvider.getPaymentSnapshot(intent.providerRef);
    expect(snapshot.status).toBe('pending');
    expect(snapshot.amount).toBe(8900);
    expect(snapshot.currency).toBe('AUD');
    expect(snapshot.clientSecret).toBe(intent.clientSecret);
  });

  it('parseWebhookEvent rejects a payload with an invalid signature', async () => {
    const { stripeProvider } = await import('@/lib/payments/providers/stripe');

    await expect(
      stripeProvider.parseWebhookEvent('{"id":"evt_fake"}', 't=1,v1=not-a-real-signature')
    ).rejects.toThrow();
  });
});
