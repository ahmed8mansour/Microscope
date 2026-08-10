import type { InferSelectModel } from 'drizzle-orm';
import type { orders } from '@/lib/db/schema';
import type { PaymentStatus } from '../domain/payment-status';

export type OrderRow = InferSelectModel<typeof orders>;

export interface Order {
  id: string;
  userId: string;
  amount: number; // order total = unitAmount × quantity (minor units)
  currency: string;
  quantity: number; // units of the single product (feature 005)
  paymentStatus: PaymentStatus;
  fulfilled: boolean;
  stripePaymentIntentId: string | null;
  stripeReceiptUrl: string | null;
  stripeCustomerId: string | null;
  notes: string | null;
  supplierOrderRef: string | null; // admin-recorded at fulfillment (feature 005)
  supplierTrackingRef: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  userId: string;
  amount: number;
  currency: string;
  quantity?: number; // defaults to 1 when omitted
}
