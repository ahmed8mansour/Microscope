import { describe, expect, it } from 'vitest';
import { getPaymentProvider, registerProvider } from '@/lib/payments/factory';
import type { PaymentProvider } from '@/lib/payments/types';

describe('payment provider factory', () => {
  it('defaults to the stripe provider', async () => {
    // Import here to ensure the stripe adapter has registered itself.
    await import('@/lib/payments');
    const provider = getPaymentProvider();
    expect(provider.name).toBe('stripe');
  });

  it('registers and selects a stub provider with zero caller changes (SC-007)', async () => {
    const stub: PaymentProvider = {
      name: 'stub',
      async createIntent() {
        return { providerRef: 'stub_ref', clientSecret: 'stub_secret' };
      },
      async verify() {
        return 'success';
      },
      async parseWebhookEvent() {
        return {
          id: 'evt_stub',
          type: 'stub.event',
          kind: 'other',
          providerRef: null,
          amount: null,
          currency: null,
          receiptRef: null,
        };
      },
      async getPaymentSnapshot() {
        return {
          status: 'success',
          amount: 100,
          currency: 'AUD',
          clientSecret: 'stub_secret',
          receiptRef: null,
          customerRef: null,
        };
      },
      async updateIntentAmount() {
        // no-op stub (feature 005)
      },
      async refund() {
        return { providerRefundRef: 'stub_refund_ref', accepted: true };
      },
    };
    registerProvider(stub);

    const provider = getPaymentProvider('stub');
    expect(provider.name).toBe('stub');
    const intent = await provider.createIntent({ orderId: 'o1', amount: 100, currency: 'AUD' });
    expect(intent).toEqual({ providerRef: 'stub_ref', clientSecret: 'stub_secret' });
  });

  it('throws for an unregistered provider name', () => {
    expect(() => getPaymentProvider('nonexistent')).toThrow();
  });
});

describe('lib/payments public API — no provider types leak (SC-006)', () => {
  it('exposes only createPaymentIntent/verifyPayment, no stripe-specific exports', async () => {
    const mod = await import('@/lib/payments');
    const keys = Object.keys(mod);
    expect(keys).toContain('createPaymentIntent');
    expect(keys).toContain('verifyPayment');
    expect(keys.some((k) => /stripe/i.test(k))).toBe(false);
  });
});
