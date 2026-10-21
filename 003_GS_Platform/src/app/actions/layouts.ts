"use server";

import { runBridge } from "./python-bridge";

/** Eligible jobs for layout building: not shipped/canceled/moved; ordered by work_no. */
export async function fetchEligibleJobs(): Promise<{
    eligible: { work_no: string; bbi_id: string; gene_name: string; vector: string; cloning_site: string; resistance: string; length_bp: string; prep: string }[];
    ineligible: { work_no: string; stage: string }[];
}> {
    const res = (await runBridge({
        action: "db_run_query",
        sql: "SELECT work_no, bbi_id, gene_name, vector, cloning_site, resistance, length_bp, prep, stage FROM job_log ORDER BY work_no",
    }) as any) as { success: boolean; rows?: any[]; [k: string]: any };
    if (!res.success) return { eligible: [], ineligible: [] };
    const rows = res.rows || [];
    const eligible: any[] = [];
    const ineligible: any[] = [];
    for (const r of rows) {
        const stage = String(r.stage ?? "");
        const blocked =
            /^0\./.test(stage) || /^(cancel|canceled|cancelled|moved|shipped)/i.test(stage);
        if (blocked) ineligible.push({ work_no: r.work_no, stage });
        else
            eligible.push({
                work_no: r.work_no,
                bbi_id: r.bbi_id ?? "",
                gene_name: r.gene_name ?? "",
                vector: r.vector ?? "",
                cloning_site: r.cloning_site ?? "",
                resistance: r.resistance ?? "",
                length_bp: r.length_bp == null ? "" : String(r.length_bp),
                prep: r.prep ?? "",
            });
    }
    return { eligible, ineligible };
}

export async function generateLigationLayout(payload: {
    jobs: string[];
    wells: Record<string, string>;
    overrides: Record<string, { vector?: string; enzyme?: string; resistance?: string; host?: string; temperature?: string }>;
    fragments?: Record<string, { name: string; location: string; length: number; concentration?: number | null }[]>;
    initials?: string;
}) {
    const res = (await runBridge({ action: "build_ligation_layout", ...payload }) as any);
    if (!res.success) return { success: false as const, message: res.message || "Layout build failed.", warnings: [] as string[] };
    const data = res.data ?? res;
    return {
        success: true as const,
        filename: data.filename,
        excel_base64: data.excel_base64,
        rows_written: data.rows_written,
        warnings: data.warnings || [],
    };
}

export async function lookupVector(vector: string, enzyme?: string) {
    const res = (await runBridge({ action: "lookup_vector", vector, ...(enzyme ? { enzyme } : {}) }) as any);
    if (!res.success) return { success: false as const, message: res.message || "Lookup failed.", matches: [] };
    return { success: true as const, matches: (res.data?.matches || []) as Record<string, any>[] };
}

export async function importVectorDbAction(xlsxPath: string) {
    const res = (await runBridge({ action: "import_vector_db", xlsx_path: xlsxPath, dry_run: false, commit: true }) as any);
    return { success: !!res.success, message: res.message || res.data?.message || "" };
}

export async function importPrimerLogAction(xlsxPath?: string) {
    const res = (await runBridge({ action: "import_primer_log", ...(xlsxPath ? { xlsx_path: xlsxPath } : {}), dry_run: false, commit: true }) as any);
    return { success: !!res.success, message: res.message || res.data?.message || "" };
}

export async function fetchPrimerMapAction() {
    const res = (await runBridge({ action: "fetch_primer_map" }) as any);
    if (!res.success) return { success: false as const, mapping: {} as Record<string, string> };
    return { success: true as const, mapping: (res.data?.mapping || {}) as Record<string, string> };
}

export async function buildColonyPcrLayoutAction(payload: {
    ligation_entry_codes?: string[];
    ligation_xlsx_path?: string;
    clones: Record<string, number>;
    initials?: string;
}) {
    const res = (await runBridge({ action: "build_colony_pcr_layout", ...payload }) as any);
    if (!res.success) return { success: false as const, message: res.message || res.data?.message || "Colony PCR layout failed." };
    const data = res.data ?? res;
    return { success: true as const, filename: data.filename, excel_base64: data.excel_base64, plates: data.plates };
}

export async function fetchLigationEntryCodes(): Promise<string[]> {
    const res = (await runBridge({ action: "db_run_query", sql: "SELECT name FROM ligation_index ORDER BY id" }) as any);
    if (!res.success) return [];
    return (res as any).rows.map((r: any) => r.name);
}

export async function fetchColonyEntryCodes(): Promise<string[]> {
    const res = (await runBridge({ action: "db_run_query", sql: "SELECT name FROM colony_pcr_index ORDER BY id" }) as any);
    if (!res.success) return [];
    return (res as any).rows.map((r: any) => r.name);
}

export async function fetchPositivesWells(entryCode: string): Promise<string[]> {
    const res = (await runBridge({ action: "db_run_query", sql: `SELECT plate_id, well FROM colony_pcr_positives p JOIN colony_pcr_index i ON p.colony_pcr_id = i.id WHERE i.name = '${String(entryCode).replace(/'/g, "''")}' ORDER BY plate_id, well` }) as any);
    if (!res.success) return [];
    const rows = (res as any).rows as { plate_id: number; well: string }[];
    // two 48-well halves share one 12-col grid: plate 1 wells = cols 1-6,
    // plate 2 wells = cols 7-12 (matches dna_extraction parser/layout convention)
    return rows.map((r) => `${r.well[0]}${Number(r.well.slice(1)) + (r.plate_id - 1) * 6}`);
}

export async function buildExtractionLayoutAction(payload: { source_entry_code?: string; wells?: string[]; initials?: string }) {
    const res = (await runBridge({ action: "build_extraction_layout", ...payload }) as any);
    if (!res.success) return { success: false as const, message: res.message || res.data?.message || "Extraction layout failed." };
    const data = res.data ?? res;
    return { success: true as const, filename: data.filename, excel_base64: data.excel_base64, wells_filled: data.wells_filled };
}