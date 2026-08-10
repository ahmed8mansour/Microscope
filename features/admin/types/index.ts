import type { Order, OrderNote, PaymentStatus } from '@/features/orders';
import type { StoredShippingAddress } from '@/features/shipping';

// Response shapes shared between server data modules and client
// components/hooks. Client code imports from here (or the feature barrel),
// never directly from a `data/*.repository.ts` module.

export interface DashboardMetrics {
  totalOrders: number;
  paymentsByStatus: Record<PaymentStatus, number>;
  revenue: { today: number; month: number; allTime: number; currency: string };
  conversionRate: number;
}

export type RefundState = 'none' | 'requested' | 'failed';

export type OrderWithRefundable = Order & { refundable: boolean; refundState: RefundState };

export interface RefundRow {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'requested' | 'failed';
  providerRefundRef: string | null;
  reason: string | null;
  requestedBy: string;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersListResponse {
  orders: OrderWithRefundable[];
  nextCursor: string | null;
}

export interface OrderDetailResponse {
  order: OrderWithRefundable;
  refund: RefundRow | null;
  notes: OrderNote[];
  shippingAddress: StoredShippingAddress | null;
}

export interface AnalyticsSeriesResponse {
  range: { from: string; to: string; timezone: string };
  revenueOverTime: Array<{ date: string; amount: number }>;
  ordersPerDay: Array<{ date: string; count: number }>;
  paymentSuccessRate: number;
  conversionRate: number;
  trafficSources: Array<{ source: string; entries: number; share: number }>;
}
