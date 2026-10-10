'use client';

import { useState, useMemo } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LogSearchCombobox } from '@/components/ui/log-search-combobox';
import { FileSearch, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

type SeqLogRow = Record<string, any>;

const PASS_FAIL_COLUMNS = ['sg_ss_ok', 'sg_ds_ok', 'sg_mutation_or_fail'];

function cellStyle(row: SeqLogRow, col: string): string {
  const v = String(row[col] || '').trim();
  if (!v) return '';
  if (PASS_FAIL_COLUMNS.includes(col)) {
    if (/SS OK|OK/i.test(v) && !/fail|mutation/i.test(v)) return 'text-green-600 font-medium';
    if (/fail|加不上/i.test(v)) return 'text-red-600 font-medium';
    if (/mutation|→/i.test(v)) return 'text-amber-600 font-medium';
  }
  return '';
}

const HEADERS: [string, string][] = [
  ['folder_name', 'Folder name'],
  ['job_id', 'Job ID'],
  ['vector_id', 'Vector ID'],
  ['sg_ss_ok', 'Sg SS OK'],
  ['sg_ds_ok', 'Sg DS OK'],
  ['sg_mutation_or_fail', 'Mutation / FAIL'],
  ['sg_primer_to_repeat', 'Primer to repeat'],
  ['requirement', 'Requirement'],
  ['qc_file_name', 'QC file'],
  ['work_no', 'Work No.'],
  ['bbi_id', 'BBI ID'],
  ['gene_name', 'Gene Name'],
  ['vector', 'Vector'],
  ['length_bp', 'Length (bp)'],
  ['plasmid_no', 'Plasmid No.'],
  ['cloning_site', 'Cloning Site'],
  ['resistance', 'Resistance'],
  ['growth_condition_temperature', 'Growth Cond.'],
  ['delivery_date', 'Delivery Date'],
  ['host', 'Host'],
];

export default function SequencingAnalysisLogPage() {
  const { databases } = useDatabase();
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const { logs, rows } = useMemo(() => {
    const db = databases['Sequencing Analysis'];
    if (!db || !db.payload) return { logs: [] as string[], rows: [] as SeqLogRow[] };
    try {
      const indexData = (db.payload.index as any[]) || [];
      const allRows = (db.payload.data as SeqLogRow[]) || [];
      const selected = selectedLog || indexData[indexData.length - 1]?.name || '';
      const logEntry = indexData.find((r) => r.name === selected);
      const filtered = logEntry ? allRows.filter((r) => String(r.seq_log_id) === String(logEntry.id)) : [];
      return { logs: indexData.map((r) => String(r.name)), rows: filtered };
    } catch (e) {
      console.error('Failed to load sequencing analysis data:', e);
      return { logs: [] as string[], rows: [] as SeqLogRow[] };
    }
  }, [databases, selectedLog]);

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <FileSearch className="h-12 w-12 text-muted-foreground" />
        <p className="font-medium">No Gene Seq Logs in DuckDB.</p>
        <p className="text-xs text-muted-foreground">Run the bulk_import_seq_logs bridge action on the pilot 10/11 folders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <LogSearchCombobox
          items={logs.map((l, i) => ({ label: l, index: i }))}
          currentIndex={logs.indexOf(selectedLog ?? '') === -1 ? logs.length - 1 : logs.indexOf(selectedLog ?? '')}
          onSelect={(i) => setSelectedLog(logs[i])}
        />
        <span className="text-xs text-muted-foreground">{rows.length} rows</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{selectedLog || logs[logs.length - 1]}</CardTitle>
          <CardDescription>Genes Sequenced — SS/DS pass-fail coloring; latest version of each date&apos;s log is imported.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  {HEADERS.map(([key, label]) => (
                    <TableHead key={key}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {HEADERS.map(([key]) => (
                      <TableCell key={key} className={cn('text-xs whitespace-nowrap', cellStyle(row, key))}>
                        {String(row[key] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}