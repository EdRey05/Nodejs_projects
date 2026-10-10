"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchColonyEntryCodes, fetchPositivesWells, buildExtractionLayoutAction } from "@/app/actions";
import { downloadBase64Excel } from "@/lib/download";
import { Loader2, Download, TestTube2 } from "lucide-react";

export function ExtractionLayoutClient() {
    const [codes, setCodes] = React.useState<string[]>([]);
    const [selected, setSelected] = React.useState<string | null>(null);
    const [wells, setWells] = React.useState<string[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [building, setBuilding] = React.useState(false);
    const [result, setResult] = React.useState<{ ok: boolean; text: string; file?: string; b64?: string } | null>(null);

    React.useEffect(() => {
        (async () => {
            const list = await fetchColonyEntryCodes();
            setCodes(list);
            setLoading(false);
        })();
    }, []);

    async function pick(code: string) {
        setSelected(code);
        const w = await fetchPositivesWells(code);
        setWells(w);
    }

    async function build() {
        if (!selected) return;
        setBuilding(true);
        setResult(null);
        const res = await buildExtractionLayoutAction({ source_entry_code: selected });
        if (res.success) {
            setResult({ ok: true, text: `${res.wells_filled} wells filled (positives, well order).`, file: res.filename, b64: res.excel_base64 });
        } else {
            setResult({ ok: false, text: res.message });
        }
        setBuilding(false);
    }

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle>Colony PCR entries</CardTitle>
                    <CardDescription>{loading ? "Loading…" : `${codes.length} entries; positives become extraction wells.`}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[380px] pr-3">
                        <div className="space-y-1">
                            {codes.map((code) => (
                                <button
                                    key={code}
                                    onClick={() => pick(code)}
                                    className={`w-full rounded border px-2 py-1.5 text-left font-mono text-xs ${selected === code ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                                >
                                    {code}
                                </button>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Positive wells ({wells.length})</CardTitle>
                    <CardDescription>Plate 1 wells land in C1-6, plate 2 in C7-12 (two 48-well halves).</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[380px] pr-3">
                        <div className="flex flex-wrap gap-1">
                            {wells.map((w) => (
                                <span key={w} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                    {w}
                                </span>
                            ))}
                            {!loading && selected && wells.length === 0 && (
                                <p className="text-sm text-muted-foreground">No positives marked on this entry.</p>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Generate</CardTitle>
                    <CardDescription>Output re-uploads through the existing parser (Layout sheet, B5:G12 / J5:O12 halves).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Button onClick={build} disabled={building || !selected || wells.length === 0} className="w-full">
                        {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
                        {building ? "Building…" : "Generate Extraction Layout"}
                    </Button>
                    {result && (
                        <div className={`rounded-md border p-3 text-xs ${result.ok ? "border-green-600/40 bg-green-500/10" : "border-red-600/40 bg-red-500/10"}`}>
                            <p className="whitespace-pre-wrap">{result.text}</p>
                            {result.ok && result.b64 && (
                                <Button variant="outline" size="sm" className="mt-2" onClick={() => downloadBase64Excel(result.b64!, result.file || "Extraction-Layout.xlsx")}>
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