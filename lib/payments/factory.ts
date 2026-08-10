import type { PaymentProvider } from './types';

const registry = new Map<string, PaymentProvider>();

// FR-012, SC-007: adding a provider = implement PaymentProvider + register.
// No caller changes required.
export function registerProvider(provider: PaymentProvider): void {
  registry.set(provider.name, provider);
}

const DEFAULT_PROVIDER = 'stripe';

export function getPaymentProvider(name: string = DEFAULT_PROVIDER): PaymentProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(`Payment provider "${name}" is not registered`);
  }
  return provider;
}
