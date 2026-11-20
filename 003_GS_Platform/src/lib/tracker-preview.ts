import 'server-only';
import { connection } from 'next/server';
import { runPythonScript } from '@/app/actions/python-bridge';

export type PreviewRow = Record<string, string | number | null>;

export async function loadTrackerPreview() {
  await connection();
  const result = await runPythonScript('read_tracker_seed.py', {}) as {
    success: boolean;
    data?: Record<'customers' | 'orders' | 'progress', PreviewRow[]>;
  };
  const data = result.data;
  if (!result.success || !data || !Array.isArray(data.customers)
    || !Array.isArray(data.orders) || !Array.isArray(data.progress)) {
    return null;
  }
  return data;
}
