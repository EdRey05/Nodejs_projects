"use server";

import { runBridge } from "./python-bridge";

export type StageCount = { log_type: string; label: string; entries: number; rows: number };
export type DashboardData = {
    success: boolean;
    message?: string;
    stages?: StageCount[];
    gene_tracker_total?: number;
    master_summary_rows?: number;
    vector_db_rows?: number;
    primers_rows?: number;
};

/** Dashboard counts per stage (Phase 7): one index count + one data count per log type. */
export async function fetchDashboardCounts(): Promise<DashboardData> {
    const stages: { log_type: string; label: string; indexTable: string; dataTable: string }[] = [
        { log_type: 'ligation', label: 'Ligation', indexTable: 'ligation_index', dataTable: 'ligation_data' },
        { log_type: 'colony_pcr', label: 'Colony PCR', indexTable: 'colony_pcr_index', dataTable: 'colony_pcr_data' },
        { log_type: 'dna_extraction', label: 'DNA Extraction', indexTable: 'dna_extraction_index', dataTable: 'dna_extraction_data' },
        { log_type: 'dna_quantification', label: 'DNA Quant', indexTable: 'dna_quantification_index', dataTable: 'dna_quantification_nanodrop' },
        { log_type: 'sequencing_prep', label: 'Seq Prep', indexTable: 'sequencing_layout_index', dataTable: 'sequencing_layout_data' },
        { log_type: 'seq_log', label: 'Seq Results', indexTable: 'seq_log_index', dataTable: 'seq_log_data' },
    ];
    try {
        const out: StageCount[] = [];
        for (const s of stages) {
            const idx = (await runBridge({ action: 'db_run_query', sql: `SELECT count(*) AS n FROM ${s.indexTable}` }) as any) as { success: boolean; rows?: any[] };
            const dat = (await runBridge({ action: 'db_run_query', sql: `SELECT count(*) AS n FROM ${s.dataTable}` }) as any) as { success: boolean; rows?: any[] };
            out.push({
                log_type: s.log_type,
                label: s.label,
                entries: idx.success ? Number(idx.rows?.[0]?.n ?? 0) : 0,
                rows: dat.success ? Number(dat.rows?.[0]?.n ?? 0) : 0,
            });
        }
        const gt = (await runBridge({ action: 'db_run_query', sql: 'SELECT count(*) AS n FROM gene_tracker_data' }) as any) as { success: boolean; rows?: any[] };
        const ms = (await runBridge({ action: 'db_run_query', sql: 'SELECT count(*) AS n FROM master_summary' }) as any) as { success: boolean; rows?: any[] };
        const vd = (await runBridge({ action: 'db_run_query', sql: 'SELECT count(*) AS n FROM vector_db' }) as any) as { success: boolean; rows?: any[] };
        const pr = (await runBridge({ action: 'db_run_query', sql: 'SELECT count(*) AS n FROM primers' }) as any) as { success: boolean; rows?: any[] };
        return {
            success: true,
            stages: out,
            gene_tracker_total: gt.success ? Number(gt.rows?.[0]?.n ?? 0) : 0,
            master_summary_rows: ms.success ? Number(ms.rows?.[0]?.n ?? 0) : 0,
            vector_db_rows: vd.success ? Number(vd.rows?.[0]?.n ?? 0) : 0,
            primers_rows: pr.success ? Number(pr.rows?.[0]?.n ?? 0) : 0,
        };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}