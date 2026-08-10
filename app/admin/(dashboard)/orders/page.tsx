import OrdersTable from '@/features/admin/components/OrdersTable';

export default function AdminOrdersPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="ledger-label mb-1">Ledger</p>
        <h1 className="font-display text-4xl font-medium leading-none sm:text-5xl">Orders</h1>
      </div>
      <OrdersTable />
    </div>
  );
}
