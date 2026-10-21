"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchEligibleJobs, generateLigationLayout } from "@/app/actions";
import { downloadBase64Excel } from "@/lib/download";
import { Loader2, Download, FlaskConical } from "lucide-react";

type Job = {
    work_no: string;
    bbi_id: string;
    gene_name: string;
    vector: string;
    cloning_site: string;
    resistance: string;
    length_bp: string;
    prep: string;
};

export function LigationLayoutClient() {
    const router = useRouter();
    const [jobs, setJobs] = React.useState<Job[]>([]);
    const [ineligibleCount, setIneligibleCount] = React.useState(0);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [order, setOrder] = React.useState<string[]>([]); // drag order = row order
    const [loading, setLoading] = React.useState(true);
    const [building, setBuilding] = React.useState(false);
    const [result, setResult] = React.useState<{ ok: boolean; text: string; file?: string; b64?: string; warnings?: string[] } | null>(null);
    const [dragJob, setDragJob] = React.useState<string | null>(null);

    const load = React.useCallback(async () => {
        setLoading(true);
        const res = await fetchEligibleJobs();
        setJobs(res.eligible);
        setIneligibleCount(res.ineligible.length);
        setLoading(false);
    }, []);

    React.useEffect(() => {
        load();
    }, [load]);

    function toggleJob(wn: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(wn)) {
                next.delete(wn);
                setOrder((o) => o.filter((x) => x !== wn));
            } else {
                next.add(wn);
                setOrder((o) => [...o, wn]);
            }
            return next;
        });
    }

    function onJobDrop(e: React.DragEvent, target: string) {
        e.preventDefault();
        if (!dragJob || dragJob === target) return;
        setOrder((o) => {
            const without = o.filter((x) => x !== dragJob);
            const idx = without.indexOf(target);
            return [...without.slice(0, idx), dragJob, ...without.slice(idx)];
        });
    }

    async function build() {
        setBuilding(true);
        setResult(null);
        const res = await generateLigationLayout({
            jobs: order,
            wells: {},
            overrides: {},
            fragments: {},
        });
        if (res.success) {
            setResult({ ok: true, text: `${res.rows_written} layout rows written (jobs, grouped negative controls, CK+pUC19).`, file: res.filename, b64: res.excel_base64, warnings: res.warnings });
        } else {
            setResult({ ok: false, text: res.message });
        }
        setBuilding(false);
    }

    return (
        <div className="grid gap-4 lg:grid-cols-4">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Jobs from Job Log</CardTitle>
                    <CardDescription>
                        {loading ? "Loading…" : `${jobs.length} eligible (shipped/canceled/moved hidden${ineligibleCount ? ` — ${ineligibleCount} filtered` : ""}). Pick in order; order = plate row order.`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[460px] pr-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8" />
                                    <TableHead>Work No</TableHead>
                                    <TableHead>Gene</TableHead>
                                    <TableHead>Vector</TableHead>
                                    <TableHead>Site</TableHead>
                                    <TableHead>Res</TableHead>
                                    <TableHead>bp</TableHead>
                                    <TableHead>Prep</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map((j) => (
                                    <TableRow
                                        key={j.work_no}
                                        className="cursor-pointer"
                                        onClick={() => toggleJob(j.work_no)}
                                    >
                                        <TableCell>
                                            <Checkbox checked={selected.has(j.work_no)} onCheckedChange={() => toggleJob(j.work_no)} />
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">{j.work_no}</TableCell>
                                        <TableCell className="text-xs">{j.gene_name}</TableCell>
                                        <TableCell className="text-xs">{j.vector}</TableCell>
                                        <TableCell className="text-xs">{j.cloning_site}</TableCell>
                                        <TableCell className="text-xs">{j.resistance}</TableCell>
                                        <TableCell className="text-xs">{j.length_bp}</TableCell>
                                        <TableCell className="text-xs">{j.prep}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Fill order ({order.length})</CardTitle>
                    <CardDescription>Drag to reorder; generation starts at A01 top-to-bottom (template defaults).</CardDescription>
                </CardHeader>
                <CardContent>
                    <div
                        className="space-y-1"
                        onDragOver={(e) => e.preventDefault()}
                    >
                        {order.length === 0 && <p className="text-sm text-muted-foreground">No jobs selected.</p>}
                        {order.map((wn) => {
                            const j = jobs.find((x) => x.work_no === wn);
                            return (
                                <div
                                    key={wn}
                                    draggable
                                    onDragStart={() => setDragJob(wn)}
                                    onDragEnd={() => setDragJob(null)}
                                    onDrop={(e) => onJobDrop(e, wn)}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="flex items-center justify-between rounded border px-2 py-1 text-xs cursor-grab bg-background"
                                >
                                    <span className="font-mono">{wn}</span>
                                    <span className="text-muted-foreground">{j?.vector} · {j?.cloning_site}</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Generate</CardTitle>
                    <CardDescription>Vector lots/concentrations come from vector_db; insert volumes from fragment rows (blank until fragment data exists).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Button onClick={build} disabled={building || order.length === 0} className="w-full">
                        {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                        {building ? "Building…" : `Generate Ligation Layout (${order.length} jobs)`}
                    </Button>
                    {result && (
                        <div className={`rounded-md border p-3 text-xs ${result.ok ? "border-green-600/40 bg-green-500/10" : "border-red-600/40 bg-red-500/10"}`}>
                            <p className="whitespace-pre-wrap">{result.text}</p>
                            {result.warnings && result.warnings.length > 0 && (
                                <ul className="mt-2 list-disc pl-4 text-muted-foreground">
                                    {result.warnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            )}
                            {result.ok && result.b64 && (
                                <Button variant="outline" size="sm" className="mt-2" onClick={() => downloadBase64Excel(result.b64!, result.file || "Ligation-Layout.xlsx")}>
                                    <Download className="mr-2 h-4 w-4" /> Download {result.file}
                                </Button>
                            )}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => router.push("/logs/ligation")}>
                            View log
                        </Button>
                        <Button variant="ghost" size="sm" onClick={load}>
                            Reload jobs
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}