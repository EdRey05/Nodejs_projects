/**
 * Canonical job-stage vocabulary.
 *
 * Mirrors `python_tools/stages.json`, which the bridge validates against.
 * The two lists are kept in step by hand — a stage that exists in one and
 * not the other is a bug, so the labels here are the same strings the
 * Python side knows.
 *
 * Stage 0 is where a new job enters the pipeline. Lifecycle states that
 * sit outside the pipeline (cancelled, moved to Sg, shipped) are NOT
 * stages: the Job Log filters those as categories instead.
 */
export type JobStage = {
  number: number;
  label: string;
  timeline: string;
};

export const JOB_STAGES: JobStage[] = [
  { number: 0, label: '0. Onboarding', timeline: '' },
  { number: 1, label: '1. Synthesizing Oligos', timeline: '3.5-4 weeks' },
  { number: 2, label: '2. Amplification PCR', timeline: '3 weeks' },
  { number: 3, label: '3. Fragment Assembly', timeline: '3 weeks' },
  { number: 4, label: '4. Fragment Sequencing', timeline: '3 weeks' },
  { number: 5, label: '5. Correcting Fragment Errors', timeline: '3-4 weeks' },
  { number: 6, label: '6. Vector Insertion', timeline: '2.5 weeks' },
  { number: 7, label: '7. Selecting Clones', timeline: '2.5 weeks' },
  { number: 8, label: '8. First Sequencing Round', timeline: '2 weeks' },
  { number: 9, label: '9. Correcting Gene Errors', timeline: '1.5-2.5 weeks' },
  { number: 10, label: '10. Final Sequencing Round', timeline: '1.5 weeks' },
  { number: 11, label: '11. QC and Prep', timeline: '~0.5-1 weeks' },
  { number: 12, label: '12. Completed - Preparing for Shipment', timeline: '' },
];

/** The stage a newly created job starts at. */
export const DEFAULT_STAGE = JOB_STAGES[0].label;

/**
 * Stage number for a stored stage string, or null when the value is not a
 * pipeline stage (cancelled / moved / shipped / free text).
 */
export function stageNumber(stage: string | null | undefined): number | null {
  const text = String(stage ?? '').trim();
  const m = /^(\d{1,2})\./.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return JOB_STAGES.some((s) => s.number === n) ? n : null;
}

/** Timeline estimate for a stage label, or '' when unknown. */
export function stageTimeline(stage: string | null | undefined): string {
  const text = String(stage ?? '').trim().toLowerCase();
  return JOB_STAGES.find((s) => s.label.toLowerCase() === text)?.timeline ?? '';
}
