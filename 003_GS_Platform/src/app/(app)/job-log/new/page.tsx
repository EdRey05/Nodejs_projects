'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDatabase } from '../../_context/DatabaseContext';
import { fetchJobLog } from '@/app/actions/logs';
import { createJobLogRow, fetchJobStages } from '@/app/actions/job-log';
import { NEW_JOB_FIELDS } from '@/lib/job-log-fields';
import { JOB_STAGES, DEFAULT_STAGE, type JobStage } from '@/lib/stages';
import { ArrowLeft, CircleDot, Loader2, Plus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * New Job — create one row in the Job Log.
 *
 * The form writes the columns up to and including 'prep'. Insert Sequence
 * and every column after it are deferred: the pipeline fills those later
 * (sequence reads, clone selection, extraction, QC), so they are left empty
 * on a freshly created job.
 */

const DEFERRED_NOTE =
    'Insert Sequence and every column after it are left empty for now — the pipeline fills them as the job advances.';

export default function NewJobPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { setDatabase } = useDatabase();

    const [stages, setStages] = React.useState<JobStage[]>(JOB_STAGES);
    const [stage, setStage] = React.useState<string>(DEFAULT_STAGE);
    const [values, setValues] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        fetchJobStages().then((s) => {
            if (!cancelled && s.length > 0) setStages(s);
        });
        return () => { cancelled = true; };
    }, []);

    const selected = stages.find((s) => s.label === stage);

    function setField(key: string, value: string) {
        setValues(prev => ({ ...prev, [key]: value }));
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (busy) return;

        const workNo = String(values.work_no ?? '').trim();
        if (!workNo) {
            setError('Work No. is required.');
            return;
        }

        setBusy(true);
        setError(null);

        const result = await createJobLogRow({ ...values, stage });

        if (!result.success) {
            setError(result.message);
            setBusy(false);
            return;
        }

        // Refresh the Job Log held in the app context so the list page shows
        // the new row without a full reload.
        const refreshed = await fetchJobLog();
        if (refreshed.success && refreshed.data) {
            setDatabase('Job Log', {
                buffer: null,
                name: 'DuckDB: Job Log',
                payload: { data: refreshed.data },
            });
        }

        toast({
            title: 'Job created',
            description: result.message,
        });

        setBusy(false);
        router.push('/job-log');
    }

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                    <a href="/job-log">
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Job Log
                    </a>
                </Button>
                <h2 className="text-lg font-semibold">New Job</h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* ---- the form ---- */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Job details
                        </CardTitle>
                        <CardDescription>
                            Work No. is required. The rest can be filled in as the job advances.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                {NEW_JOB_FIELDS.map(field => (
                                    <div key={field.key} className="space-y-1.5">
                                        <Label htmlFor={field.key}>
                                            {field.label}
                                            {field.required && (
                                                <span className="ml-1 text-destructive">*</span>
                                            )}
                                        </Label>
                                        <Input
                                            id={field.key}
                                            name={field.key}
                                            value={values[field.key] ?? ''}
                                            placeholder={field.placeholder}
                                            onChange={(e) => setField(field.key, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                                {DEFERRED_NOTE}
                            </div>

                            {error && (
                                <p className="rounded border border-red-600/40 bg-red-500/10 p-3 text-sm text-red-700">
                                    {error}
                                </p>
                            )}

                            <div className="flex gap-2">
                                <Button type="submit" disabled={busy}>
                                    {busy ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="mr-2 h-4 w-4" />
                                    )}
                                    Create job
                                </Button>
                                <Button type="button" variant="outline" asChild>
                                    <a href="/job-log">Cancel</a>
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* ---- the stage picker ---- */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Stage</CardTitle>
                        <CardDescription>
                            {selected
                                ? selected.timeline
                                    ? `Target turnaround: ${selected.timeline}`
                                    : 'Start of the pipeline.'
                                : 'Pick the stage this job is entering at.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol className="space-y-1">
                            {stages.map(s => {
                                const active = s.label === stage;
                                return (
                                    <li key={s.number}>
                                        <button
                                            type="button"
                                            onClick={() => setStage(s.label)}
                                            aria-current={active ? 'true' : undefined}
                                            className={cn(
                                                'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                                                active
                                                    ? 'border-primary bg-primary/10 font-medium text-foreground'
                                                    : 'border-transparent hover:bg-secondary',
                                            )}
                                        >
                                            <CircleDot
                                                className={cn(
                                                    'h-3.5 w-3.5 shrink-0',
                                                    active ? 'text-primary' : 'text-muted-foreground/50',
                                                )}
                                            />
                                            <span className="min-w-0 flex-1 truncate">{s.label}</span>
                                            {s.timeline && (
                                                <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {s.timeline}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                        <div className="mt-3 border-t pt-3">
                            <p className="mb-1 text-xs font-medium text-muted-foreground">Current stage</p>
                            <Badge variant="secondary">{stage}</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
