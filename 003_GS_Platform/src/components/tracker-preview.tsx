'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PreviewRow } from '@/lib/tracker-preview';

type Column = { key: string; label: string };
const PAGE_SIZE = 25;
const STATUSES = ['In Progress', 'Completed', 'Completed (Partial)', 'Cancelled'] as const;
type Status = typeof STATUSES[number];
const statusColors: Record<Status, string> = {
  'In Progress': 'border-violet-400 bg-violet-700 text-white hover:bg-violet-800 hover:text-white',
  Completed: 'border-emerald-400 bg-emerald-700 text-white hover:bg-emerald-800 hover:text-white',
  'Completed (Partial)': 'border-amber-400 bg-amber-200 text-amber-950 hover:bg-amber-300',
  Cancelled: 'border-rose-400 bg-rose-700 text-white hover:bg-rose-800 hover:text-white',
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function TrackerTable({ label, columns, rows, externalQuery, statusField }: {
  label: string;
  columns: Column[];
  rows: PreviewRow[];
  externalQuery?: string;
  statusField?: 'status' | 'progress';
}) {
  const [statuses, setStatuses] = useState<Status[]>(['In Progress']);
  const [query, setQuery] = useState('');
  const [pageState, setPageState] = useState({ index: 0, query: externalQuery });
  const page = pageState.query === externalQuery ? pageState.index : 0;
  const setPage = (index: number) => setPageState({ index, query: externalQuery });
  const [sort, setSort] = useState<{ key: string; ascending: boolean } | null>(null);
  const filtered = useMemo(() => {
    const needle = (externalQuery ?? query).trim().toLocaleLowerCase();
    const matching = rows.filter(row => {
      if (statusField) {
        const value = String(row.status ?? '');
        const category = statusField === 'status' ? value
          : value.startsWith('X.') ? 'Cancelled' : value.startsWith('13.') ? 'Completed' : 'In Progress';
        if (!statuses.some(status => status === category)) return false;
      }
      return columns.some(({ key }) => String(row[key] ?? '').toLocaleLowerCase().includes(needle));
    });
    if (sort) {
      matching.sort((a, b) => {
        const left = a[sort.key] ?? '';
        const right = b[sort.key] ?? '';
        const order = typeof left === 'number' && typeof right === 'number'
          ? left - right : collator.compare(String(left), String(right));
        return sort.ascending ? order : -order;
      });
    }
    return matching;
  }, [columns, rows, query, externalQuery, sort, statusField, statuses]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const offset = currentPage * PAGE_SIZE;

  return (
    <div className="min-w-0 space-y-3">
      {externalQuery === undefined && <div className="grid items-center gap-3 md:grid-cols-3">
        <Input
          aria-label={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="border-violet-300 bg-white text-violet-950 placeholder:text-violet-600 focus-visible:ring-violet-500"
          value={query}
          onChange={event => { setQuery(event.target.value); setPage(0); }}
        />
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" aria-label={statusField ? "Filter by status" : undefined}>
          {statusField && STATUSES.filter(status => statusField === 'status' || status !== 'Completed (Partial)').map(status => {
            const active = statuses.includes(status);
            return (
              <Button key={status} size="sm" variant="outline" aria-pressed={active}
                className={active ? statusColors[status] : "border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100"}
                onClick={() => {
                  setStatuses(current => current.includes(status) ? current.filter(item => item !== status) : [...current, status]);
                  setPage(0);
                }}>
                {status}
              </Button>
            );
          })}
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {filtered.length ? `${offset + 1}-${Math.min(offset + PAGE_SIZE, filtered.length)} of ` : ''}
          {filtered.length} records
        </span>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-md border bg-card" tabIndex={0} aria-label={`${label} table`}>
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-violet-200">
            <TableRow>
              {columns.map(({ key, label }) => {
                const active = sort?.key === key;
                const Icon = active ? (sort.ascending ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <TableHead key={key} className="whitespace-nowrap"
                    aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
                    <Button size="sm" variant="ghost" className="-ml-2 gap-1 px-2 text-violet-950 hover:bg-violet-300/60"
                      onClick={() => { setSort({ key, ascending: active ? !sort.ascending : true }); setPage(0); }}>
                      {label}<Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(offset, offset + PAGE_SIZE).map((row, index) => (
              <TableRow key={offset + index}>
                {columns.map(({ key }) => <TableCell key={key} className="whitespace-nowrap">{row[key] ?? '-'}</TableCell>)}
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {rows.length ? 'No records match the current search and filters.' : 'No records yet.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">Page {currentPage + 1} of {pageCount}</span>
        <Button variant="outline" size="sm" disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={currentPage + 1 >= pageCount}
          onClick={() => setPage(currentPage + 1)}>Next</Button>
      </div>
    </div>
  );
}

const CUSTOMER_COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'customer_affiliation', label: 'Customer Affiliation' },
  { key: 'sales_order', label: 'Sales Order' },
  { key: 'customer_email', label: 'Customer Email' },
];
const ORDER_COLUMNS = [
  { key: 'order_id', label: 'Order ID' },
  { key: 'genes_ordered', label: 'Genes Ordered' },
  { key: 'status', label: 'Status' },
];

export function CustomersAndOrders({ customers, orders }: { customers: PreviewRow[]; orders: PreviewRow[] }) {
  const [tab, setTab] = useState('customers');
  const [search, setSearch] = useState({ customers: '', orders: '' });
  const isOrders = tab === 'orders';
  const active = isOrders ? 'orders' : 'customers';
  const label = isOrders ? 'Orders' : 'Customer Info';
  const tabs = (
    <TabsList className="h-auto min-h-10 w-full justify-start gap-1 border border-violet-300 bg-violet-100 text-violet-900">
      <TabsTrigger className="flex-1 data-[state=active]:bg-violet-700 data-[state=active]:text-white" value="customers">Customer Info</TabsTrigger>
      <TabsTrigger className="flex-1 data-[state=active]:bg-violet-700 data-[state=active]:text-white" value="orders">Orders</TabsTrigger>
    </TabsList>
  );
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="grid items-center gap-3 md:grid-cols-3">
        {tabs}
        <Input aria-label={`Search ${label}`} placeholder={`Search ${label.toLowerCase()}...`}
          className="border-violet-300 bg-white text-violet-950 placeholder:text-violet-600 focus-visible:ring-violet-500"
          value={search[active]} onChange={event => setSearch({ ...search, [active]: event.target.value })} />
      </div>
      <TabsContent value="customers" forceMount className="data-[state=inactive]:hidden">
        <TrackerTable label="Customer Info" columns={CUSTOMER_COLUMNS} rows={customers} externalQuery={search.customers} />
      </TabsContent>
      <TabsContent value="orders" forceMount className="data-[state=inactive]:hidden">
        <TrackerTable label="Orders" columns={ORDER_COLUMNS} rows={orders}
          statusField="status" externalQuery={search.orders} />
      </TabsContent>
    </Tabs>
  );
}
