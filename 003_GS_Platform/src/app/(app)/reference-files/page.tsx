'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ExportLogButton } from '@/components/export-log-button';
import { Loader2, FileText, X } from 'lucide-react';
import { fetchReferenceFiles, readReferencePreview, type ReferenceFile } from '@/app/actions/jobweb';

export default function ReferenceFilesPage() {
  const [files, setFiles] = useState<ReferenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<{ file: ReferenceFile; text: string; truncated: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchReferenceFiles();
        if (!r.success) setError(r.message || 'fetch failed');
        else setFiles(r.rows ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q) return files;
    const ql = q.toLowerCase();
    return files.filter((f) => f.gene_name.toLowerCase().includes(ql));
  }, [files, q]);

  async function openPreview(f: ReferenceFile) {
    setPreviewLoading(true);
    try {
      const r = await readReferencePreview(f.path);
      if (r.success) setPreview({ file: f, text: r.preview ?? '', truncated: !!r.truncated });
      else setError(r.message || 'preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reference Files</h1>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gene name..." className="w-72" />
          <ExportLogButton table={{ sql: 'SELECT gene_name, path, length_bp, sha256 FROM reference_files ORDER BY gene_name', sheet: 'Reference Files', file: 'Reference_Files' }} />
        </div>
      </div>
      {loading && <p className="text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading reference files...</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{filtered.length} files</CardTitle>
            <CardDescription>Plain-text sequence references; content lives on the pilot drive, metadata here</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[65vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Gene Name</TableHead>
                    <TableHead>bp</TableHead>
                    <TableHead>SHA-256</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f) => (
                    <TableRow key={f.gene_name}>
                      <TableCell className="font-mono text-xs">{f.gene_name}</TableCell>
                      <TableCell className="text-xs">{f.length_bp ?? '—'}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{(f.sha256 || '').slice(0, 12)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openPreview(f)} disabled={previewLoading}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {preview && (
        <Card className="fixed bottom-4 right-4 w-[560px] max-h-[60vh] z-50 shadow-xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-mono">{preview.file.gene_name}</CardTitle>
              <CardDescription>{preview.truncated ? 'first 2 kB (truncated)' : 'full content'}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-h-[40vh] overflow-auto">{preview.text}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}