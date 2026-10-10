"use server";

import { LogType } from "@/lib/types";
import { createDataZip } from "@/lib/storage";
import { runBridge, runPythonScript } from "./python-bridge";

export async function initializeDuckDB() {
    try {
        const result = await runBridge({ action: 'db_init' }) as any;
        return result;
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export async function runDataMigration() {
    try {
        const result = await runPythonScript('migrate_data.py', {}) as any;
        return result;
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export async function downloadDataZip() {
    try {
        const buffer = await createDataZip();
        const base64 = buffer.toString('base64');
        return { success: true, data: base64 };
    } catch (error: any) {
        console.error("Zip error:", error);
        return { success: false, message: error.message || "Failed to create ZIP." };
    }
}

export async function exportLogToExcel(logType: LogType) {
    try {
        const logTypeKey = logType.toLowerCase().replace(/ /g, '_');
        const result = await runBridge({
            action: 'db_export',
            log_type: logTypeKey,
        }) as any;

        if (result.success && result.data?.excel_base64) {
            return { success: true, data: result.data.excel_base64 };
        }
        return { success: false, message: result.message || "Export failed." };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

export async function runSqlQuery(sql: string) {
    try {
        const result = await runBridge({
            action: 'db_run_query',
            sql,
        }) as any;

        if (!result.success) {
            return { success: false, message: result.message || 'Query failed' };
        }
        if (result.data?.error) {
            return { success: false, message: result.data.error };
        }
        return { success: true, columns: result.data.columns as string[], rows: result.data.rows as Record<string, any>[] };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}
