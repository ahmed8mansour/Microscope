import Link from 'next/link';
import OrderDetail from '@/features/admin/components/OrderDetail';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <Link
        href="/admin/orders"
        className="admin-focus ledger-label mb-3 inline-flex items-center gap-1.5 transition-colors hover:text-ink"
      >
        <span aria-hidden>←</span> Back to orders
      </Link>
      <h1 className="mb-6 font-display text-4xl font-medium leading-none sm:text-5xl">Order detail</h1>
      <OrderDetail orderId={id} />
    </div>
  );
}
