'use client';
import { useState, useTransition } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2, Database as DbIcon, FileArchive, Play, AlertCircle } from 'lucide-react';
import { LogType } from '@/lib/types';
import { downloadDataZip, exportLogToExcel, runSqlQuery } from '@/app/actions';

export default function DatabasesPage() {
  const { databases } = useDatabase();
  const { toast } = useToast();
  const [isExporting, startExporting] = useTransition();
  const [isZipping, startZipping] = useTransition();
  const [isQuerying, startQuerying] = useTransition();
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM ligation_index LIMIT 10');
  const [queryResult, setQueryResult] = useState<{ columns: string[]; rows: Record<string, any>[] } | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const handleDownload = (logType: LogType) => {
    startExporting(async () => {
      const result = await exportLogToExcel(logType);
      if (result.success && result.data) {
        const byteCharacters = atob(result.data);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${logType.toLowerCase().replace(/ /g, '_')}_db.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: 'Export Successful', description: `Downloaded ${logType} as Excel.` });
      } else {
        toast({ variant: 'destructive', title: 'Export Failed', description: result.message });
      }
    });
  };

  const handleDownloadZip = () => {
    startZipping(async () => {
      const result = await downloadDataZip();
      if (result.success && result.data) {
        const byteCharacters = atob(result.data);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
        const blob = new Blob([byteArray], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GeneSyn_data_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: 'ZIP Download Started', description: 'Full data archive downloaded.' });
      } else {
        toast({ variant: 'destructive', title: 'ZIP Failed', description: result.message });
      }
    });
  };

  const handleRunQuery = () => {
    setQueryError(null);
    setQueryResult(null);
    startQuerying(async () => {
      const result = await runSqlQuery(sqlQuery);
      if (result.success) {
        setQueryResult({ columns: result.columns!, rows: result.rows! });
      } else {
        setQueryError(result.message ?? 'Unknown error');
      }
    });
  };

  const activeDatabases = Object.entries(databases).filter(([, db]) => db?.payload);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>Experiment db downloader</CardTitle>
              <CardDescription>Download experiment data from DuckDB as Excel files.</CardDescription>
            </div>
            <Button onClick={handleDownloadZip} disabled={isZipping} variant="outline">
              {isZipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileArchive className="mr-2 h-4 w-4" />}
              Archive Full Data (ZIP)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeDatabases.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeDatabases.map(([logType, db]) => (
                <Card key={logType} className="flex flex-col">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{logType}</CardTitle>
                    <DbIcon className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-xs text-muted-foreground">Persisted in DuckDB</p>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate">{db?.name}</p>
                  </CardContent>
                  <div className="p-4 pt-0">
                    <Button className="w-full" onClick={() => handleDownload(logType as LogType)} variant="outline" disabled={isExporting}>
                      {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                      Download Excel
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
              <DbIcon className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium">No experiment data loaded</p>
              <p className="text-sm text-muted-foreground">Data will appear here once the database is initialized and populated.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SQL Query Runner</CardTitle>
          <CardDescription>Run read-only SELECT queries against the DuckDB database.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={4}
            className="font-mono text-sm"
            placeholder="SELECT * FROM ligation_index LIMIT 10"
          />
          <Button onClick={handleRunQuery} disabled={isQuerying || !sqlQuery.trim()}>
            {isQuerying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run Query
          </Button>

          {queryError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="font-mono">{queryError}</span>
            </div>
          )}

          {queryResult && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{queryResult.rows.length} row(s) returned</p>
              <div className="relative overflow-auto max-h-[500px] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                    <TableRow>
                      {queryResult.columns.map((col) => (
                        <TableHead key={col} className="whitespace-nowrap font-bold">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryResult.rows.map((row, rIdx) => (
                      <TableRow key={rIdx}>
                        {queryResult.columns.map((col) => (
                          <TableCell key={col} className="whitespace-nowrap font-mono text-xs">
                            {row[col] === null || row[col] === undefined ? (
                              <span className="text-muted-foreground/40 italic">null</span>
                            ) : typeof row[col] === 'object' ? (
                              JSON.stringify(row[col])
                            ) : (
                              String(row[col])
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
