import { CustomersAndOrders } from '@/components/tracker-preview';
import { loadTrackerPreview } from '@/lib/tracker-preview';

export default async function CustomersOrdersPage() {
  const data = await loadTrackerPreview();
  return (
    <section className="min-w-0 space-y-4 p-4 md:p-6">
      {data ? <CustomersAndOrders customers={data.customers} orders={data.orders} />
        : <p role="alert">Could not load the synthetic database.</p>}
    </section>
  );
}
