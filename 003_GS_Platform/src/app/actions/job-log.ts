"use server";

import { runBridge } from './python-bridge';
import { JOB_STAGES, type JobStage } from '@/lib/stages';

/**
 * Job Log write path.
 *
 * `createJobLogRow` is the New Job form's submit: it writes one row to the
 * `job_log` table through the bridge, which validates the stage against the
 * canonical vocabulary and leaves Insert Sequence and every column after it
 * NULL (those are filled later by the pipeline).
 *
 * The form's field list lives in `src/lib/job-log-fields.ts` — a
 * `"use server"` module's exports all become server-action references, so
 * a constant array cannot be exported from here.
 */

export type NewJobPayload = Record<string, string> & { stage: string };

export type CreateJobResult = {
    success: boolean;
    message: string;
    row?: Record<string, any>;
    deferred_columns?: string[];
};

/** Canonical stages, for the form's stage picker. */
export async function fetchJobStages(): Promise<JobStage[]> {
    const res = (await runBridge({ action: 'fetch_stages' })) as any;
    if (!res.success) return JOB_STAGES;
    const stages = res.data?.stages;
    if (Array.isArray(stages) && stages.length > 0) {
        return stages.sort((a: JobStage, b: JobStage) => a.number - b.number);
    }
    return JOB_STAGES;
}

/** Create one Job Log row. */
export async function createJobLogRow(payload: NewJobPayload): Promise<CreateJobResult> {
    const workNo = String(payload.work_no ?? '').trim();
    if (!workNo) {
        return { success: false, message: 'Work No. is required.' };
    }
    try {
        const res = (await runBridge({
            action: 'create_job_log_row',
            ...payload,
            work_no: workNo,
        })) as any;
        if (!res.success) {
            return { success: false, message: res.message || 'Could not create the job.' };
        }
        const data = res.data ?? res;
        if (!data.success) {
            return { success: false, message: data.message || 'Could not create the job.' };
        }
        return {
            success: true,
            message: data.message || `Job ${workNo} created.`,
            row: data.row,
            deferred_columns: data.deferred_columns,
        };
    } catch (e: any) {
        return { success: false, message: e.message || 'Could not create the job.' };
    }
}
