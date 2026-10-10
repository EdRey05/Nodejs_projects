"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchLigationEntryCodes, buildColonyPcrLayoutAction } from "@/app/actions";
import { downloadBase64Excel } from "@/lib/download";
import { Loader2, Download, Grid3X3 } from "lucide-react";

export function ColonyPcrLayoutClient() {
    const [codes, setCodes] = React.useState<string[]>([]);
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [cloneCounts, setCloneCounts] = React.useState<Record<string, number>>({});
    const [loading, setLoading] = React.useState(true);
    const [building, setBuilding] = React.useState(false);
    const [result, setResult] = React.useState<{ ok: boolean; text: string; file?: string; b64?: string } | null>(null);

    React.useEffect(() => {
        (async () => {
            const list = await fetchLigationEntryCodes();
            setCodes(list);
            setLoading(false);
        })();
    }, []);

    function toggle(code: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else {
                next.add(code);
                setCloneCounts((c) => ({ ...c, [code]: c[code] ?? 4 }));
            }
            return next;
        });
    }

    async function build() {
        setBuilding(true);
        setResult(null);
        const clones: Record<string, number> = {};
        selected.forEach((c) => (clones[c] = cloneCounts[c] ?? 4));
        const res = await buildColonyPcrLayoutAction({ ligation_entry_codes: [...selected], clones });
        if (res.success) {
            setResult({ ok: true, text: `${res.plates} plate(s) generated.`, file: res.filename, b64: res.excel_base64 });
        } else {
            setResult({ ok: false, text: res.message });
        }
        setBuilding(false);
    }

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Ligation entries</CardTitle>
                    <CardDescription>
                        {loading ? "Loading…" : `${codes.length} entries in DuckDB. Select the ones to plate; per-job clone spinbox (0 skips).`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[440px] pr-3">
                        <div className="space-y-1">
                            {codes.map((code) => (
                                <div key={code} className="flex items-center gap-3 rounded border px-2 py-1.5">
                                    <label className="flex flex-1 items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={selected.has(code)} onChange={() => toggle(code)} className="accent-current" />
                                        <span className="font-mono text-xs">{code}</span>
                                    </label>
                                    {selected.has(code) && (
                                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                            clones
                                            <Input
                                                type="number"
                                                min={0}
                                                max={96}
                                                value={cloneCounts[code] ?? 4}
                                                onChange={(e) =>
                                                    setCloneCounts((c) => ({ ...c, [code]: Math.max(0, Math.min(96, Number(e.target.value) || 0)) }))
                                                }
                                                className="h-7 w-16 text-center"
                                            />
                                        </label>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Generate</CardTitle>
                    <CardDescription>Jobs fill column-blocks grouped by vector (pilot well order); primers pulled from the Primer Log when present; controls CK+/CK- after the last group.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Button onClick={build} disabled={building || selected.size === 0} className="w-full">
                        {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Grid3X3 className="mr-2 h-4 w-4" />}
                        {building ? "Building…" : `Generate Colony PCR Layout (${selected.size})`}
                    </Button>
                    {result && (
                        <div className={`rounded-md border p-3 text-xs ${result.ok ? "border-green-600/40 bg-green-500/10" : "border-red-600/40 bg-red-500/10"}`}>
                            <p className="whitespace-pre-wrap">{result.text}</p>
                            {result.ok && result.b64 && (
                                <Button variant="outline" size="sm" className="mt-2" onClick={() => downloadBase64Excel(result.b64!, result.file || "ColonyPCR-Layout.xlsx")}>
                                    <Download className="mr-2 h-4 w-4" /> Download {result.file}
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}