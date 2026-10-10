"use server";

import { runBridge } from "./python-bridge";

export type TimelineStep = {
    log_type: string;
    label: string;
    present: boolean;
    entries: string[];
};

export type SampleLookupResult = {
    success: boolean;
    query?: string;
    message?: string;
    gene_tracker?: Record<string, any> | null;
    timeline?: TimelineStep[];
};

/** Consolidated sample lookup (Phase 6): one query across all *_index/data
 *  tables joined by work_no/bbi_id. Pure SQL via db_run_query. */
export async function sampleLookup(rawQuery: string): Promise<SampleLookupResult> {
    const query = String(rawQuery || "").trim();
    if (!query) return { success: false, message: "Empty query." };

    // exact string escaping for the LIKE patterns
    const esc = (s: string) => s.replace(/'/g, "''");
    const q = esc(query);

    const steps: { log_type: string; label: string; idTable: string; dataTable: string; idCol: string; matchCol: string }[] = [
        { log_type: "ligation", label: "Ligation", idTable: "ligation_index", dataTable: "ligation_data", idCol: "ligation_id", matchCol: "Name" },
        { log_type: "colony_pcr", label: "Colony PCR", idTable: "colony_pcr_index", dataTable: "colony_pcr_index", idCol: "id", matchCol: "name" },
        { log_type: "dna_extraction", label: "DNA Extraction", idTable: "dna_extraction_index", dataTable: "dna_extraction_index", idCol: "id", matchCol: "name" },
        { log_type: "dna_quantification", label: "DNA Quantification", idTable: "dna_quantification_index", dataTable: "dna_quantification_index", idCol: "id", matchCol: "name" },
        { log_type: "sequencing_layout", label: "Seq Prep Layout", idTable: "sequencing_layout_index", dataTable: "sequencing_layout_index", idCol: "id", matchCol: "name" },
        { log_type: "sequencing_order", label: "Seq Order Form", idTable: "sequencing_order_index", dataTable: "sequencing_order_index", idCol: "id", matchCol: "name" },
        { log_type: "sequencing_validation", label: "Seq Validation", idTable: "sequencing_validation_index", dataTable: "sequencing_validation_index", idCol: "id", matchCol: "name" },
        { log_type: "seq_log", label: "Seq Results", idTable: "seq_log_index", dataTable: "seq_log_index", idCol: "id", matchCol: "name" },
    ];

    // Gene Tracker row (work_no or bbi_id)
    let geneTracker: Record<string, any> | null = null;
    const gtRes = (await runBridge({
        action: "db_run_query",
        sql: `SELECT * FROM gene_tracker_data WHERE work_no ILIKE '%${q}%' OR bbi_id ILIKE '%${q}%' LIMIT 5`,
    }) as any) as { success: boolean; rows?: any[] };
    if (gtRes.success && gtRes.rows && gtRes.rows.length > 0) geneTracker = gtRes.rows[0];

    const timeline: TimelineStep[] = [];
    for (const step of steps) {
        // colony/extraction/quant/prep/index tables match by name (entry code),
        // ligation data rows also match by BBID gene rows.
        const res = (await runBridge({
            action: "db_run_query",
            sql: `SELECT name FROM ${step.idTable} WHERE name ILIKE '%${q}%' LIMIT 30`,
        }) as any) as { success: boolean; rows?: any[] };
        const entries = res.success ? (res.rows || []).map((r) => String(r.name)) : [];
        timeline.push({ log_type: step.log_type, label: step.label, present: entries.length > 0, entries });
    }

    // P8 job web: fragments, primer addon, reference files, shipping, QC + clone lineage
    const webSteps: { label: string; sql: string; col: string }[] = [
        { label: "IDT Fragments", sql: `SELECT DISTINCT work_no AS hit FROM idt_fragments WHERE work_no ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "PCR Fragments", sql: `SELECT DISTINCT work_no AS hit FROM pcr_fragments WHERE work_no ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "Primer Addon", sql: `SELECT job_id AS hit FROM primer_input_addon WHERE job_id ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "Reference Files", sql: `SELECT gene_name AS hit FROM reference_files WHERE gene_name ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "Shipment", sql: `SELECT job_id AS hit FROM shipment_rows WHERE job_id ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "QC", sql: `SELECT job_id AS hit FROM qc_rows WHERE job_id ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "Clones (colony)", sql: `SELECT DISTINCT work_no AS hit FROM job_clones WHERE work_no ILIKE '%${q}%' LIMIT 30`, col: "hit" },
        { label: "Plasmids (extracted)", sql: `SELECT DISTINCT work_no AS hit FROM clone_plasmids WHERE work_no ILIKE '%${q}%' OR plasmid_no ILIKE '%${q}%' LIMIT 30`, col: "hit" },
    ];
    for (const step of webSteps) {
        const res = (await runBridge({ action: "db_run_query", sql: step.sql }) as any) as { success: boolean; rows?: any[] };
        const entries = res.success ? (res.rows || []).map((r) => String(r[step.col] ?? "")) : [];
        timeline.push({ log_type: step.label.toLowerCase().replace(/ /g, "_"), label: step.label, present: entries.length > 0, entries });
    }

    const anyHit = !!geneTracker || timeline.some((t) => t.present);
    return {
        success: anyHit,
        query,
        gene_tracker: geneTracker,
        timeline,
        message: anyHit ? undefined : `No entries matched "${query}" in any log table.`,
    };
}