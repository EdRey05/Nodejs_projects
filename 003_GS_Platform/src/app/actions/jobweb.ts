import { runBridge } from './python-bridge';

export interface IdtFragment {
  idt_plate: string;
  work_no: string;
  position: string | null;
  reference_nbr: string | null;
  purity_pass: string | null;
  yield_pass: string | null;
  sequence: string | null;
  insert_length_bp: number | null;
}

export interface PcrFragment {
  work_no: string;
  plasmid_no: string | null;
  reference_nbr: string | null;
  purity_pass: string | null;
  yield_pass: string | null;
  sequence: string | null;
  insert_length_bp: number | null;
  concentration: number | null;
}

export interface ReferenceFile {
  gene_name: string;
  path: string;
  length_bp: number | null;
  sha256: string | null;
}

export type FetchResult<T> = { success: boolean; rows?: T[]; message?: string };

async function query<T>(sql: string): Promise<FetchResult<T>> {
  try {
    const result = (await runBridge({ action: 'db_run_query', sql })) as any;
    if (!result.success) return { success: false, message: result.error || result.message || 'Query failed.' };
    return { success: true, rows: result.rows || [] };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export async function fetchIdtFragments(): Promise<FetchResult<IdtFragment>> {
  return query<IdtFragment>(
    'SELECT idt_plate, work_no, position, reference_nbr, purity_pass, yield_pass, sequence, insert_length_bp FROM idt_fragments ORDER BY idt_plate, position'
  );
}

export async function fetchPcrFragments(): Promise<FetchResult<PcrFragment>> {
  return query<PcrFragment>(
    'SELECT work_no, plasmid_no, reference_nbr, purity_pass, yield_pass, sequence, insert_length_bp, concentration FROM pcr_fragments ORDER BY work_no, plasmid_no'
  );
}

export async function fetchReferenceFiles(): Promise<FetchResult<ReferenceFile>> {
  return query<ReferenceFile>(
    'SELECT gene_name, path, length_bp, sha256 FROM reference_files ORDER BY gene_name'
  );
}

export async function readReferencePreview(path: string): Promise<{ success: boolean; preview?: string; truncated?: boolean; message?: string }> {
  try {
    const res = (await runBridge({ action: 'read_reference_file', path })) as any;
    if (!res.success) return { success: false, message: res.error || 'read failed' };
    return { success: true, preview: res.preview ?? '', truncated: !!res.truncated };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export interface JobLogRow {
  work_no: string;
  bbi_id: string | null;
  gene_name: string | null;
  vector: string | null;
  cloning_site: string | null;
  synthesis_progress: string | null;
  qc_status: string | null;
  plasmid_no: string | null;
  shipped: string | null;
}

export interface ShipmentRow {
  job_id: string;
  prep_date: string | null;
  bbi_id: string | null;
  tube_location: string | null;
  ng_ul: string | null;
  ul_transferred: string | null;
  ul_left: string | null;
  notes: string | null;
}

export interface QcRow {
  job_id: string;
  qc_date: string | null;
  clone: string | null;
  digestion: string | null;
  expected_bands: string | null;
  ng_ul: string | null;
  image_name: string | null;
  notes: string | null;
}

export async function fetchJobLog(): Promise<FetchResult<JobLogRow>> {
  return query<JobLogRow>(
    'SELECT work_no, bbi_id, gene_name, vector, cloning_site, synthesis_progress, qc_status, plasmid_no, shipped FROM job_log_rows ORDER BY work_no'
  );
}

export async function fetchShipmentRows(): Promise<FetchResult<ShipmentRow>> {
  return query<ShipmentRow>(
    'SELECT job_id, prep_date, bbi_id, tube_location, ng_ul, ul_transferred, ul_left, notes FROM shipment_rows ORDER BY job_id, prep_date'
  );
}

export async function fetchQcRows(): Promise<FetchResult<QcRow>> {
  return query<QcRow>(
    'SELECT job_id, qc_date, clone, digestion, expected_bands, ng_ul, image_name, notes FROM qc_rows ORDER BY job_id, qc_date'
  );
}