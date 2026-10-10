'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExportLogButton } from '@/components/export-log-button';
import { Loader2, Dna } from 'lucide-react';
import { fetchIdtFragments, fetchPcrFragments, type IdtFragment, type PcrFragment } from '@/app/actions/jobweb';

const PASS_BADGE = (v: string | null | undefined) => {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const pass = v.toLowerCase().startsWith('pass');
  return <Badge variant={pass ? 'secondary' : 'destructive'}>{v}</Badge>;
};

export default function FragmentsPage() {
  const [idt, setIdt] = useState<IdtFragment[]>([]);
  const [pcr, setPcr] = useState<PcrFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [i, p] = await Promise.all([fetchIdtFragments(), fetchPcrFragments()]);
        if (!i.success) setError(i.message || 'IDT fetch failed');
        else setIdt(i.rows ?? []);
        if (p.success) setPcr(p.rows ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const idtPlates = useMemo(() => {
    const byPlate = new Map<string, IdtFragment[]>();
    for (const f of idt) {
      if (q && !f.work_no.toLowerCase().includes(q.toLowerCase()) && !f.idt_plate.toLowerCase().includes(q.toLowerCase())) continue;
      byPlate.set(f.idt_plate, [...(byPlate.get(f.idt_plate) || []), f]);
    }
    return [...byPlate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [idt, q]);

  const pcrFiltered = useMemo(() => {
    if (!q) return pcr;
    const ql = q.toLowerCase();
    return pcr.filter((f) => f.work_no.toLowerCase().includes(ql) || (f.plasmid_no || '').toLowerCase().includes(ql));
  }, [pcr, q]);

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">IDT Fragments</h1>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by work no / plate / clone..." className="w-72" />
          <ExportLogButton table={{ sql: 'SELECT idt_plate, work_no, position, reference_nbr, purity_pass, yield_pass, sequence, insert_length_bp FROM idt_fragments ORDER BY idt_plate, position', sheet: 'IDT Fragments', file: 'IDT_Fragments' }} />
        </div>
      </div>
      {loading && <p className="text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading fragments...</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!loading && idtPlates.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Dna className="h-12 w-12 text-muted-foreground" />
          <p className="font-medium">No IDT fragments in DuckDB.</p>
          <p className="text-xs text-muted-foreground">Run the import_idt bridge action on the pilot folder.</p>
        </div>
      )}
      {idtPlates.map(([plate, frags]) => (
        <Card key={plate}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Plate {plate}</CardTitle>
            <CardDescription>{frags.length} fragments</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Well</TableHead>
                  <TableHead>Work No</TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Purity</TableHead>
                  <TableHead>Yield</TableHead>
                  <TableHead>bp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {frags.map((f, i) => (
                  <TableRow key={`${f.work_no}-${f.position}-${i}`}>
                    <TableCell className="font-mono text-xs">{f.position}</TableCell>
                    <TableCell className="font-mono text-xs">{f.work_no}</TableCell>
                    <TableCell className="text-xs">{f.reference_nbr}</TableCell>
                    <TableCell>{PASS_BADGE(f.purity_pass)}</TableCell>
                    <TableCell>{PASS_BADGE(f.yield_pass)}</TableCell>
                    <TableCell className="text-xs">{f.insert_length_bp ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {pcrFiltered.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">PCR Fragments</CardTitle>
            <CardDescription>{pcrFiltered.length} clone-well fragments (concentration measured)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work No</TableHead>
                  <TableHead>Clone</TableHead>
                  <TableHead>Purity</TableHead>
                  <TableHead>Yield</TableHead>
                  <TableHead>bp</TableHead>
                  <TableHead>ng/µl</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pcrFiltered.map((f, i) => (
                  <TableRow key={`${f.work_no}-${f.plasmid_no}-${i}`}>
                    <TableCell className="font-mono text-xs">{f.work_no}</TableCell>
                    <TableCell className="font-mono text-xs">{f.plasmid_no}</TableCell>
                    <TableCell>{PASS_BADGE(f.purity_pass)}</TableCell>
                    <TableCell>{PASS_BADGE(f.yield_pass)}</TableCell>
                    <TableCell className="text-xs">{f.insert_length_bp ?? '—'}</TableCell>
                    <TableCell className="text-xs">{f.concentration ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}