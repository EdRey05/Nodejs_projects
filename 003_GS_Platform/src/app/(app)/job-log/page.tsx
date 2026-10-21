'use client';

import { useState, useMemo } from 'react';
import { useDatabase } from '../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ExportLogButton } from '@/components/export-log-button';
import { FileText, ArrowUpDown, ArrowUp, ArrowDown, Columns3, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type JobLogRow = Record<string, any>;

/**
 * Job Log — the app's first table.
 *
 * Column keys are the snake_case DuckDB column names (see
 * python_tools/schema.yaml, group `job_log`); the labels are the display
 * names. The order below is the table's column order.
 */
const JOB_LOG_COLUMNS: { key: string; label: string }[] = [
  { key: 'work_no', label: 'Work No.' },
  { key: 'bbi_id', label: 'BBI ID' },
  { key: 'order_date', label: 'Order Date' },
  { key: 'so', label: 'SO' },
  { key: 'gene_name', label: 'Gene Name' },
  { key: 'vector', label: 'Vector' },
  { key: 'cloning_site', label: 'Cloning Site' },
  { key: 'resistance', label: 'Resistance' },
  { key: 'length_bp', label: 'Length (bp)' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'prep', label: 'Prep' },
  { key: 'stage', label: 'Stage' },
  { key: 'insert_sequence', label: 'Insert Sequence' },
  { key: 'final_vector_sequence', label: 'Final Vector Sequence' },
  { key: 'plasmid_no', label: 'Plasmid No.' },
  { key: 'tube_id', label: 'Tube ID' },
  { key: 'host', label: 'Host' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'competent_cells', label: 'Competent Cells' },
  { key: 'notes', label: 'Notes' },
];

// Long sequences are excluded from the table display; they open in the row detail.
const HIDDEN_COLUMNS = new Set(['insert_sequence', 'final_vector_sequence']);

const VISIBLE_COLUMNS = JOB_LOG_COLUMNS.filter(c => !HIDDEN_COLUMNS.has(c.key));

// --- Stage filter categories -------------------------------------------
type StageCategory = 'in_progress' | 'shipped' | 'canceled' | 'moved' | 'other';

const STAGE_DEFS: { id: StageCategory; label: string; description: string; color: string; activeColor: string }[] = [
  { id: 'in_progress', label: 'In Progress', description: 'Stages 1-12', color: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200', activeColor: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' },
  { id: 'other', label: 'Other', description: 'Ordered, etc.', color: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200', activeColor: 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700' },
  { id: 'shipped', label: 'Shipped', description: 'Completed & shipped', color: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200', activeColor: 'bg-green-600 text-white border-green-600 hover:bg-green-700' },
  { id: 'canceled', label: 'Canceled', description: '0. Canceled', color: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200', activeColor: 'bg-red-600 text-white border-red-600 hover:bg-red-700' },
  { id: 'moved', label: 'Moved', description: 'Moved to Sg', color: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200', activeColor: 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700' },
];

function classifyStage(stage: string): StageCategory {
  const p = (stage || '').trim().toLowerCase();
  if (p.includes('shipped')) return 'shipped';
  if (p.startsWith('0.') || p.includes('cancel')) return 'canceled';
  if (p.includes('moved')) return 'moved';
  // Numbered stages 1-12
  if (/^\d{1,2}\./.test(p)) return 'in_progress';
  return 'other';
}

// Color badge for the stage cell
function stageBadgeClass(category: StageCategory): string {
  switch (category) {
    case 'in_progress': return 'bg-blue-100 text-blue-800';
    case 'shipped': return 'bg-green-100 text-green-800';
    case 'canceled': return 'bg-red-100 text-red-800';
    case 'moved': return 'bg-purple-100 text-purple-800';
    default: return 'bg-amber-100 text-amber-800';
  }
}

export default function JobLogPage() {
  const { databases } = useDatabase();
  const data = (databases['Job Log']?.payload?.data as JobLogRow[] | undefined) ?? null;

  // Default: show In Progress + Other only
  const [activeFilters, setActiveFilters] = useState<Set<StageCategory>>(
    new Set(['in_progress', 'other'])
  );

  const toggleFilter = (id: StageCategory) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectOnly = (id: StageCategory) => {
    setActiveFilters(new Set([id]));
  };

  const selectAll = () => {
    setActiveFilters(new Set(STAGE_DEFS.map(f => f.id)));
  };

  // --- Sorting + column visibility -------------------------------------
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => new Set(VISIBLE_COLUMNS.map(c => c.key)));

  function toggleSort(key: string) {
    setSortKey(prev => {
      if (prev === key) {
        if (sortDir === 'asc') { setSortDir('desc'); return key; }
        setSortKey(null); setSortDir('asc'); return null; // third click clears
      }
      setSortDir('asc');
      return key;
    });
  }

  const shownColumns = VISIBLE_COLUMNS.filter(c => visibleCols.has(c.key));

  // --- Free-text search (any visible column) ---------------------------
  const [query, setQuery] = useState('');

  // Compute counts per category and filtered rows
  const { filteredData, categoryCounts } = useMemo(() => {
    if (!data) return { filteredData: [], categoryCounts: {} as Record<StageCategory, number> };

    const counts: Record<StageCategory, number> = {
      in_progress: 0, shipped: 0, canceled: 0, moved: 0, other: 0,
    };

    const filtered: JobLogRow[] = [];
    for (const row of data) {
      const cat = classifyStage(String(row.stage ?? ''));
      counts[cat]++;
      if (activeFilters.has(cat)) {
        filtered.push(row);
      }
    }

    return { filteredData: filtered, categoryCounts: counts };
  }, [data, activeFilters]);

  // Text search across the displayed columns
  const searchedData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filteredData;
    return filteredData.filter((row) =>
      shownColumns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q))
    );
  }, [filteredData, query, shownColumns]);

  // Job Log rows are historical strings; numeric columns sort numerically
  // when every non-empty value parses, string/empty-cell collation otherwise.
  const shownData = useMemo(() => {
    let rows = searchedData;
    if (sortKey) {
      const vals = rows.map(r => String(r[sortKey] ?? '').trim());
      const numeric = vals.every(v => v === '' || !isNaN(Number(v.replace(/,/g, ''))));
      const sorted = [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? '').trim();
        const bv = String(b[sortKey] ?? '').trim();
        if (av === '' && bv === '') return 0;
        if (av === '') return 1; // empties always sink
        if (bv === '') return -1;
        if (numeric) return Number(av.replace(/,/g, '')) - Number(bv.replace(/,/g, ''));
        return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      });
      if (sortDir === 'desc') sorted.reverse();
      rows = sorted;
    }
    return rows;
  }, [searchedData, sortKey, sortDir]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4"><FileText className="w-12 h-12 text-primary" /></div>
            <CardTitle>Job Log</CardTitle>
            <CardDescription>No Job Log data found. Data is loading or not yet imported.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Filter toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center">
          {STAGE_DEFS.map(f => {
            const isActive = activeFilters.has(f.id);
            const count = categoryCounts[f.id] || 0;
            return (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                className={cn(
                  'border transition-colors',
                  isActive ? f.activeColor : f.color,
                )}
                onClick={() => toggleFilter(f.id)}
                onContextMenu={(e) => { e.preventDefault(); selectOnly(f.id); }}
              >
                {f.label}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px] rounded-full">
                  {count}
                </Badge>
              </Button>
            );
          })}
          <div className="h-6 w-px bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={selectAll}>
            Show All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setActiveFilters(new Set(['in_progress', 'other']))}>
            Reset
          </Button>
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter rows..."
              className="h-8 w-48 pr-7 text-sm"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <Columns3 className="h-4 w-4" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
              {VISIBLE_COLUMNS.map(col => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={visibleCols.has(col.key)}
                  onCheckedChange={(v) => setVisibleCols(prev => {
                    const next = new Set(prev);
                    if (v) next.add(col.key); else next.delete(col.key);
                    // never hide every column
                    return next.size === 0 ? prev : next;
                  })}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ExportLogButton
            table={{
              sql: 'SELECT work_no, bbi_id, order_date, so, gene_name, vector, cloning_site, resistance, length_bp, quantity, prep, stage, insert_sequence, final_vector_sequence, plasmid_no, tube_id, host, temperature, competent_cells, notes FROM job_log ORDER BY work_no',
              sheet: 'Job Log',
              file: 'Job_Log',
            }}
          />
          <span className="text-xs text-muted-foreground ml-auto">
            {shownData.length} of {data.length} entries
          </span>
        </div>
      </Card>

      {/* Data table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative overflow-auto max-h-[calc(100vh-240px)] rounded-md">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="bg-sidebar-accent hover:bg-sidebar-accent">
                  <TableHead className="whitespace-nowrap text-sidebar-foreground w-10">#</TableHead>
                  {shownColumns.map(col => (
                    <TableHead
                      key={col.key}
                      className={cn('whitespace-nowrap text-sidebar-foreground cursor-pointer select-none hover:text-foreground', sortKey === col.key && 'text-foreground')}
                      onClick={(e) => { e.preventDefault(); toggleSort(col.key); }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortKey === col.key && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        {sortKey !== col.key && <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={shownColumns.length + 1} className="text-center py-8 text-muted-foreground">
                      No entries match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  shownData.map((row, i) => {
                    const category = classifyStage(String(row.stage ?? ''));
                    return (
                      <TableRow key={row.work_no || i} className="hover:bg-secondary">
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        {shownColumns.map(col => (
                          <TableCell key={col.key} className="whitespace-nowrap max-w-[300px] truncate">
                            {col.key === 'stage' ? (
                              <Badge className={cn('font-normal', stageBadgeClass(category))}>
                                {row[col.key] || ''}
                              </Badge>
                            ) : (
                              row[col.key] ?? ''
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
