/**
 * New Job form definition.
 *
 * Plain data, deliberately NOT in a `"use server"` module: a `"use server"`
 * file's exports all become server-action references, so a constant array
 * exported from one is not an array on the client.
 *
 * This list is the set of Job Log columns the New Job form writes. It
 * stops at 'prep' — Insert Sequence and every column after it are
 * deferred by design (the pipeline fills those as the job advances).
 */

export const NEW_JOB_FIELDS = [
    { key: 'work_no', label: 'Work No.', required: true, placeholder: 'e.g. ZV2650311' },
    { key: 'bbi_id', label: 'BBI ID', required: false, placeholder: 'e.g. BATCH 2851-05' },
    { key: 'order_date', label: 'Order Date', required: false, placeholder: 'YYYY-MM-DD' },
    { key: 'so', label: 'SO', required: false, placeholder: 'e.g. 20072635' },
    { key: 'gene_name', label: 'Gene Name', required: false, placeholder: 'e.g. pMON472528' },
    { key: 'vector', label: 'Vector', required: false, placeholder: 'e.g. pMON452113' },
    { key: 'cloning_site', label: 'Cloning Site', required: false, placeholder: 'e.g. AsiSI / PacI' },
    { key: 'resistance', label: 'Resistance', required: false, placeholder: 'e.g. Kanamycin' },
    { key: 'length_bp', label: 'Length (bp)', required: false, placeholder: 'e.g. 6551' },
    { key: 'quantity', label: 'Quantity', required: false, placeholder: 'e.g. 200ug' },
    { key: 'prep', label: 'Prep', required: false, placeholder: 'e.g. Lyophilized' },
] as const;

export type NewJobFieldKey = (typeof NEW_JOB_FIELDS)[number]['key'];
