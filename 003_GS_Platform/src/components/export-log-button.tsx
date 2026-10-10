'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { exportLogToExcel } from '@/app/actions';
import { downloadBase64Excel } from '@/lib/download';
import { Download, Loader2 } from 'lucide-react';
import type { LogType } from '@/lib/types';
import { runBridge } from '@/app/actions/python-bridge';

/** Export-current-log button for the viewers (Phase 7): pulls the log type's
 *  index+data tables out of DuckDB as one workbook. Suggested filename gets a
 *  date stamp; the Electron saveExcel dialog takes over on desktop.
 *  P8 extension: arbitrary-table mode — pass `table` (a SELECT over any DB
 *  table/view) instead of a LogType (e.g. /fragments, /reference-files). */
export function ExportLogButton({ logType, table, className }: {
    logType?: LogType;
    table?: { sql: string; sheet: string; file: string };
    className?: string;
}) {
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function go() {
        setBusy(true);
        setError(null);
        try {
            if (table) {
                const res = (await runBridge({ action: 'db_run_query', sql: table.sql })) as any;
                if (!res.success) throw new Error(res.error || 'Export query failed.');
                const { rowsToExcelBase64 } = await import('@/lib/excel');
                const b64 = await rowsToExcelBase64(res.rows || [], table.sheet);
                const stamp = new Date().toISOString().slice(0, 10);
                await downloadBase64Excel(b64, `${table.file}_${stamp}.xlsx`);
            } else if (logType) {
                const res = await exportLogToExcel(logType);
                if (!res.success || !res.data) {
                    setError(res.message || 'Export failed.');
                    setBusy(false);
                    return;
                }
                const stamp = new Date().toISOString().slice(0, 10);
                await downloadBase64Excel(res.data, `${logType.replace(/ /g, '_')}_${stamp}.xlsx`);
            }
        } catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    return (
        <span className={className}>
            <Button variant="outline" size="sm" onClick={go} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export Excel
            </Button>
            {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
        </span>
    );
}