'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchDashboardCounts } from '@/app/actions';
import type { DashboardData, StageCount } from '@/app/actions/dashboard';
import { ArrowRight, Dna, FlaskConical, Microscope, TestTube2, FileSearch, BarChart3, Database } from 'lucide-react';

const STAGE_ICONS: Record<string, React.ReactNode> = {
  ligation: <FlaskConical className="h-4 w-4" />,
  colony_pcr: <Microscope className="h-4 w-4" />,
  dna_extraction: <TestTube2 className="h-4 w-4" />,
  dna_quantification: <BarChart3 className="h-4 w-4" />,
  sequencing_prep: <FileSearch className="h-4 w-4" />,
  seq_log: <Dna className="h-4 w-4" />,
};

const STAGE_HREF: Record<string, string> = {
  ligation: '/layouts/ligation',
  colony_pcr: '/logs/colony-pcr',
  dna_extraction: '/logs/dna-extraction',
  dna_quantification: '/logs/dna-quantification',
  sequencing_prep: '/logs/sequencing-prep',
  seq_log: '/logs/sequencing-analysis',
};

export function DashboardClient() {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchDashboardCounts().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><Dna className="h-4 w-4" /> Gene Tracker</CardTitle>
          <CardDescription>All work numbers</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{loading ? '…' : data?.gene_tracker_total ?? 0}</p>
          <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2">
            <Link href="/gene-synthesis-progress">Open tracker <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        </CardContent>
      </Card>

      {(data?.stages || []).map((s: StageCount) => (
        <Card key={s.log_type}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">{STAGE_ICONS[s.log_type]} {s.label}</CardTitle>
            <CardDescription>{s.entries} entries</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{loading ? '…' : s.entries}</p>
            <p className="text-xs text-muted-foreground">{s.rows.toLocaleString()} underlying rows</p>
            <Button asChild variant="ghost" size="sm" className="mt-2 -ml-2">
              <Link href={STAGE_HREF[s.log_type]}>Open <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Reference data</CardTitle>
          <CardDescription>master summary · vectors · primers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>master_summary: <span className="font-medium text-foreground">{loading ? '…' : (data?.master_summary_rows ?? 0).toLocaleString()}</span></p>
          <p>vector_db: <span className="font-medium text-foreground">{loading ? '…' : data?.vector_db_rows ?? 0}</span></p>
          <p>primers: <span className="font-medium text-foreground">{loading ? '…' : data?.primers_rows ?? 0}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Sample lookup</CardTitle>
          <CardDescription>One query across every log table</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm">
            <Link href="/search">Open lookup <ArrowRight className="ml-1 h-3 w-3" /></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}