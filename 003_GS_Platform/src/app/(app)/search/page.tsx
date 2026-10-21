'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { sampleLookup } from '@/app/actions';
import type { SampleLookupResult, TimelineStep } from '@/app/actions/lookup';
import { Search, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';

const STEP_HREF: Record<string, string> = {
    ligation: '/logs/ligation',
    colony_pcr: '/logs/colony-pcr',
    dna_extraction: '/logs/dna-extraction',
    dna_quantification: '/logs/dna-quantification',
    sequencing_layout: '/logs/sequencing-prep',
    sequencing_order: '/logs/sequencing-prep',
    sequencing_validation: '/logs/sequencing-prep',
    seq_log: '/logs/sequencing-analysis',
};

export default function SearchPage() {
    const [query, setQuery] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState<SampleLookupResult | null>(null);

    async function go() {
        if (!query.trim()) return;
        setLoading(true);
        setResult(null);
        const res = await sampleLookup(query);
        setResult(res);
        setLoading(false);
    }

    return (
        <div className="mx-auto max-w-3xl space-y-4 p-4">
            <div className="flex gap-2">
                <Input
                    placeholder="Work No. or BBI ID (e.g. U0106, WGK0283SLT-01)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && go()}
                    className="font-mono"
                />
                <Button onClick={go} disabled={loading || !query.trim()}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    Search
                </Button>
            </div>

            {result && !result.success && (
                <p className="rounded border border-red-600/40 bg-red-500/10 p-3 text-sm">{result.message}</p>
            )}

            {result?.job_log && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{result.job_log.work_no}</CardTitle>
                        <CardDescription>
                            {result.job_log.gene_name} · {String(result.job_log.bbi_id ?? '')} · {result.job_log.vector} · {result.job_log.cloning_site} · {result.job_log.resistance}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-1 text-xs text-muted-foreground sm:grid-cols-4">
                        <div>Length: {String(result.job_log.length_bp ?? '—')}</div>
                        <div>Prep: {String(result.job_log.prep ?? '—')}</div>
                        <div>Host: {String(result.job_log.host ?? '—')}</div>
                        <div>Stage: {String(result.job_log.stage ?? '—')}</div>
                    </CardContent>
                </Card>
            )}

            {result?.timeline && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Pipeline progress</CardTitle>
                        <CardDescription>Entries found per stage — click a stage to jump to its viewer.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol className="relative ml-3 space-y-3 border-l">
                            {result.timeline.map((step: TimelineStep & { href?: string }) => (
                                <li key={step.log_type} className="ml-6">
                                    <span className="absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center">
                                        {step.present ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <CircleDashed className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{step.label}</span>
                                        {step.present ? (
                                            step.entries.map((e: string) => (
                                                <a key={e} href={STEP_HREF[step.log_type] || '/home'}>
                                                    <Badge variant="secondary" className="font-mono text-[10px]">{e}</Badge>
                                                </a>
                                            ))
                                        ) : (
                                            <span className="text-xs text-muted-foreground">no entries</span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}