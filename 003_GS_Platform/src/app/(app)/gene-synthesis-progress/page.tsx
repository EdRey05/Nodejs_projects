'use client';

import { useState, useMemo } from 'react';
import { useDatabase } from '../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

type GeneTrackerRow = Record<string, string>;

// Display-friendly column headers (order matters for table rendering)
const DISPLAY_COLUMNS: { key: string; label: string }[] = [
  { key: 'work_no', label: 'Work No.' },
  { key: 'bbi_id', label: 'BBI ID' },
  { key: 'order_date', label: 'Order Date' },
  { key: 'so', label: 'SO' },
  { key: 'gene_name', label: 'Gene Name' },
  { key: 'vector', label: 'Vector' },
  { key: 'cloning_site', label: 'Cloning Site' },
  { key: 'resistance', label: 'Resistance' },
  { key: 'length_bp', label: 'Length (bp)' },
  { key: 'plasmid_qty', label: 'Plasmid Qty.' },
  { key: 'prep', label: 'Prep' },
  { key: 'synthesis_progress', label: 'Synthesis Progress' },
  { key: 'job_id_2', label: 'Job ID 2' },
  { key: 'internal_progress_notes', label: 'Progress Notes' },
  { key: 'need_by', label: 'Need By' },
  { key: 'qc_status', label: 'QC Status' },
  { key: 'seq_check', label: 'SEQ Check' },
  { key: 'plasmid_no', label: 'Plasmid No.' },
  { key: 'tube_id', label: 'Tube ID' },
  { key: 'position_in_box', label: 'Position in Box' },
  { key: 'host', label: 'Host' },
  { key: 'growth_condition_temperature', label: 'Growth Temp.' },
  { key: 'competent_cells', label: 'Competent Cells' },
  { key: 'od260', label: 'OD260' },
  { key: 'od280', label: 'OD280' },
  { key: 'od260_od280', label: 'OD260/280' },
  { key: 'conc_ng_ul', label: 'Conc. ng/uL' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'notes_on_order_shipment', label: 'Notes' },
];

// Intentionally exclude long sequences from the table display
const HIDDEN_COLUMNS = new Set(['insert_sequence', 'insert_vector']);

const VISIBLE_COLUMNS = DISPLAY_COLUMNS.filter(c => !HIDDEN_COLUMNS.has(c.key));

// --- Filter category definitions ---
type FilterCategory = 'in_progress' | 'shipped' | 'canceled' | 'moved' | 'other';

const FILTER_DEFS: { id: FilterCategory; label: string; description: string; color: string; activeColor: string }[] = [
  { id: 'in_progress', label: 'In Progress', description: 'Stages 1-12', color: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200', activeColor: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' },
  { id: 'other', label: 'Other', description: 'Ordered, etc.', color: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200', activeColor: 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700' },
  { id: 'shipped', label: 'Shipped', description: 'Completed & shipped', color: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200', activeColor: 'bg-green-600 text-white border-green-600 hover:bg-green-700' },
  { id: 'canceled', label: 'Canceled', description: '0. Canceled', color: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200', activeColor: 'bg-red-600 text-white border-red-600 hover:bg-red-700' },
  { id: 'moved', label: 'Moved', description: 'Moved to Sg', color: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200', activeColor: 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700' },
];

function classifyProgress(progress: string): FilterCategory {
  const p = (progress || '').trim().toLowerCase();
  if (p.includes('shipped')) return 'shipped';
  if (p.startsWith('0.') || p.includes('cancel')) return 'canceled';
  if (p.includes('moved')) return 'moved';
  // Numbered stages 1-12
  if (/^\d{1,2}\./.test(p)) return 'in_progress';
  return 'other';
}

// Color badge for the synthesis progress cell
function progressBadgeClass(category: FilterCategory): string {
  switch (category) {
    case 'in_progress': return 'bg-blue-100 text-blue-800';
    case 'shipped': return 'bg-green-100 text-green-800';
    case 'canceled': return 'bg-red-100 text-red-800';
    case 'moved': return 'bg-purple-100 text-purple-800';
    default: return 'bg-amber-100 text-amber-800';
  }
}

export default function GeneSynthesisProgressPage() {
  const { databases } = useDatabase();
  const data = (databases['Gene Tracker']?.payload?.data as GeneTrackerRow[] | undefined) ?? null;

  // Default: show In Progress + Other only
  const [activeFilters, setActiveFilters] = useState<Set<FilterCategory>>(
    new Set(['in_progress', 'other'])
  );

  const toggleFilter = (id: FilterCategory) => {
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

  const selectOnly = (id: FilterCategory) => {
    setActiveFilters(new Set([id]));
  };

  const selectAll = () => {
    setActiveFilters(new Set(FILTER_DEFS.map(f => f.id)));
  };

  // Compute counts per category and filtered rows
  const { filteredData, categoryCounts } = useMemo(() => {
    if (!data) return { filteredData: [], categoryCounts: {} as Record<FilterCategory, number> };

    const counts: Record<FilterCategory, number> = {
      in_progress: 0, shipped: 0, canceled: 0, moved: 0, other: 0,
    };

    const filtered: GeneTrackerRow[] = [];
    for (const row of data) {
      const cat = classifyProgress(row.synthesis_progress);
      counts[cat]++;
      if (activeFilters.has(cat)) {
        filtered.push(row);
      }
    }

    return { filteredData: filtered, categoryCounts: counts };
  }, [data, activeFilters]);

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4"><FileText className="w-12 h-12 text-primary" /></div>
            <CardTitle>Gene Tracker</CardTitle>
            <CardDescription>No Gene Tracker data found. Data is loading or not yet imported.</CardDescription>
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
          {FILTER_DEFS.map(f => {
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
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredData.length} of {data.length} entries
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
                  {VISIBLE_COLUMNS.map(col => (
                    <TableHead key={col.key} className="whitespace-nowrap text-sidebar-foreground">
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={VISIBLE_COLUMNS.length + 1} className="text-center py-8 text-muted-foreground">
                      No entries match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((row, i) => {
                    const category = classifyProgress(row.synthesis_progress);
                    return (
                      <TableRow key={row.work_no || i} className="hover:bg-secondary">
                        <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                        {VISIBLE_COLUMNS.map(col => (
                          <TableCell key={col.key} className="whitespace-nowrap max-w-[300px] truncate">
                            {col.key === 'synthesis_progress' ? (
                              <Badge className={cn('font-normal', progressBadgeClass(category))}>
                                {row[col.key] || ''}
                              </Badge>
                            ) : (
                              row[col.key] || ''
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
