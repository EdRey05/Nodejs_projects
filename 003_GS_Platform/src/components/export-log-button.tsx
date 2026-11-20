'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { exportLogToExcel } from '@/app/actions';
import { downloadBase64Excel } from '@/lib/download';
import { Download, Loader2 } from 'lucide-react';
import type { LogType } from '@/lib/types';

/** Export the displayed log through the shared Python workbook writer. */
export function ExportLogButton({ logType, className }: {
    logType: LogType;
    className?: string;
}) {
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    async function go() {
        setBusy(true);
        setError(null);
        try {
            const res = await exportLogToExcel(logType);
            if (!res.success || !res.data) {
                setError(res.message || 'Export failed.');
                setBusy(false);
                return;
            }
            const stamp = new Date().toISOString().slice(0, 10);
            await downloadBase64Excel(res.data, `${logType.replace(/ /g, '_')}_${stamp}.xlsx`);
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