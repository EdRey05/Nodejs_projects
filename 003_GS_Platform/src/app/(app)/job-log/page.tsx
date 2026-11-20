import { TrackerTable } from '@/components/tracker-preview';
import { loadTrackerPreview } from '@/lib/tracker-preview';

const COLUMNS = [
  { key: 'bbi_id', label: 'BBI ID' },
  { key: 'work_number', label: 'Work Number' },
  { key: 'status', label: 'Status' },
  { key: 'order_date', label: 'Order Date' },
  { key: 'gene_name', label: 'Gene Name' },
  { key: 'vector', label: 'Vector' },
  { key: 'cloning_site', label: 'Cloning Site' },
  { key: 'resistance', label: 'Resistance' },
  { key: 'length', label: 'Length' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'delivery_format', label: 'Delivery Format' },
  { key: 'notes', label: 'Notes' },
];

export default async function ProgressTrackerPage() {
  const data = await loadTrackerPreview();
  return (
    <section className="min-w-0 space-y-4 p-4 md:p-6">
      {data ? <TrackerTable label="Progress Tracker" columns={COLUMNS} rows={data.progress} statusField="progress" />
        : <p role="alert">Could not load the synthetic database.</p>}
    </section>
  );
}
