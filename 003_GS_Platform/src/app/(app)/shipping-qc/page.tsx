'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExportLogButton } from '@/components/export-log-button';
import { Loader2 } from 'lucide-react';
import {
  fetchJobLog, fetchShipmentRows, fetchQcRows,
  type JobLogRow, type ShipmentRow, type QcRow,
} from '@/app/actions/jobweb';

export default function ShippingQcPage() {
  const [jobLog, setJobLog] = useState<JobLogRow[]>([]);
  const [shipment, setShipment] = useState<ShipmentRow[]>([]);
  const [qc, setQc] = useState<QcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [j, s, c] = await Promise.all([fetchJobLog(), fetchShipmentRows(), fetchQcRows()]);
        if (!j.success) setError(j.message || 'job log fetch failed');
        setJobLog(j.rows ?? []);
        setShipment(s.rows ?? []);
        setQc(c.rows ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredJobs = useMemo(() => {
    if (!q) return jobLog;
    const ql = q.toLowerCase();
    return jobLog.filter(
      (j) =>
        j.work_no.toLowerCase().includes(ql) ||
        (j.bbi_id || '').toLowerCase().includes(ql) ||
        (j.gene_name || '').toLowerCase().includes(ql)
    );
  }, [jobLog, q]);

  const shipmentByJob = useMemo(() => {
    const m = new Map<string, ShipmentRow[]>();
    for (const s of shipment) m.set(s.job_id, [...(m.get(s.job_id) || []), s]);
    return m;
  }, [shipment]);

  const qcByJob = useMemo(() => {
    const m = new Map<string, QcRow[]>();
    for (const c of qc) m.set(c.job_id, [...(m.get(c.job_id) || []), c]);
    return m;
  }, [qc]);

  const selShip = selected ? shipmentByJob.get(selected) ?? [] : [];
  const selQc = selected ? qcByJob.get(selected) ?? [] : [];

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Shipping &amp; QC</h1>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work no / BBI ID / gene..." className="w-72" />
          <ExportLogButton table={{ sql: 'SELECT work_no, bbi_id, gene_name, vector, cloning_site, synthesis_progress, qc_status, plasmid_no, shipped FROM job_log_rows ORDER BY work_no', sheet: 'Job Log', file: 'Shipping_QC' }} />
        </div>
      </div>
      {loading && <p className="text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading job log...</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!loading && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Job Log ({filteredJobs.length} rows)</CardTitle>
              <CardDescription>Spine = imported Gene Tracker; QC Status shown per row. Click a row to see its shipment/QC detail.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[40vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Work No</TableHead>
                      <TableHead>BBI ID</TableHead>
                      <TableHead>Gene</TableHead>
                      <TableHead>Vector</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>QC Status</TableHead>
                      <TableHead>Plasmid No</TableHead>
                      <TableHead>Shipped</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((j) => (
                      <TableRow
                        key={j.work_no}
                        className={`cursor-pointer hover:bg-secondary ${selected === j.work_no ? 'bg-secondary' : ''}`}
                        onClick={() => setSelected(j.work_no === selected ? null : j.work_no)}
                      >
                        <TableCell className="font-mono text-xs">{j.work_no}</TableCell>
                        <TableCell className="text-xs">{j.bbi_id}</TableCell>
                        <TableCell className="text-xs">{j.gene_name}</TableCell>
                        <TableCell className="text-xs">{j.vector}</TableCell>
                        <TableCell className="text-xs">{j.synthesis_progress}</TableCell>
                        <TableCell>
                          {j.qc_status ? (
                            <Badge variant={j.qc_status.toLowerCase().includes('reject') ? 'destructive' : 'secondary'}>{j.qc_status}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{j.plasmid_no}</TableCell>
                        <TableCell className="text-xs">{j.shipped}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {selected && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Shipment — {selected}</CardTitle>
                  <CardDescription>{selShip.length} rows</CardDescription>
                </CardHeader>
                <CardContent>
                  {selShip.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No shipment rows for this job.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Prep date</TableHead>
                          <TableHead>ng/µl</TableHead>
                          <TableHead>ul transferred</TableHead>
                          <TableHead>ul left</TableHead>
                          <TableHead>Tube loc</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selShip.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{s.prep_date}</TableCell>
                            <TableCell className="text-xs">{s.ng_ul}</TableCell>
                            <TableCell className="text-xs">{s.ul_transferred}</TableCell>
                            <TableCell className="text-xs">{s.ul_left}</TableCell>
                            <TableCell className="text-xs">{s.tube_location}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">QC — {selected}</CardTitle>
                  <CardDescription>{selQc.length} rows</CardDescription>
                </CardHeader>
                <CardContent>
                  {selQc.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No QC rows for this job.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>QC date</TableHead>
                          <TableHead>Digestion</TableHead>
                          <TableHead>Bands</TableHead>
                          <TableHead>ng/µl</TableHead>
                          <TableHead>Image</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selQc.map((c, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{c.qc_date}</TableCell>
                            <TableCell className="text-xs">{c.digestion}</TableCell>
                            <TableCell className="text-xs">{c.expected_bands}</TableCell>
                            <TableCell className="text-xs">{c.ng_ul}</TableCell>
                            <TableCell className="font-mono text-[10px]">{c.image_name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}