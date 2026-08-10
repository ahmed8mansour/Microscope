import 'server-only';

import type { PaymentStatus } from '@/features/orders';
import { getPaymentProvider, registerProvider } from './factory';
import { stripeProvider } from './providers/stripe';
import type {
  CreateIntentInput,
  NormalizedIntent,
  NormalizedPaymentSnapshot,
  NormalizedWebhookEvent,
  RefundInput,
  RefundResult,
} from './types';

registerProvider(stripeProvider);

// Public seam every payment caller uses. No provider-specific type crosses
// this boundary (SC-006); the concrete provider is resolved via the factory
// (FR-011, FR-012, FR-016).
export async function createPaymentIntent(input: CreateIntentInput): Promise<NormalizedIntent> {
  return getPaymentProvider().createIntent(input);
}

export async function verifyPayment(providerRef: string): Promise<PaymentStatus> {
  return getPaymentProvider().verify(providerRef);
}

export async function parseWebhookEvent(
  rawBody: string,
  signature: string
): Promise<NormalizedWebhookEvent> {
  return getPaymentProvider().parseWebhookEvent(rawBody, signature);
}

export async function getPaymentSnapshot(providerRef: string): Promise<NormalizedPaymentSnapshot> {
  return getPaymentProvider().getPaymentSnapshot(providerRef);
}

// Feature 005 (FR-002a): re-price an unconfirmed intent server-side. Throws
// `NotRepriceableError` (re-exported below) when the intent is already settled.
export async function updateIntentAmount(providerRef: string, amount: number): Promise<void> {
  return getPaymentProvider().updateIntentAmount(providerRef, amount);
}

export { NotRepriceableError } from './types';

export async function issueRefund(input: RefundInput): Promise<RefundResult> {
  return getPaymentProvider().refund(input);
}
