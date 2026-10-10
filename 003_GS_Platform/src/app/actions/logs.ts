"use server";

import { LogType, ParseResult, FetchResult } from "@/lib/types";
import { saveImages, loadImages } from "@/lib/storage";
import { runBridge } from "./python-bridge";

export async function previewFile(logType: LogType, fileBuffer: ArrayBuffer): Promise<ParseResult> {
    try {
        const logTypeKey = logType.toLowerCase().replace(/ /g, '_');
        const fileBase64 = Buffer.from(fileBuffer).toString('base64');

        const result = await runBridge({
            action: 'parse',
            log_type: logTypeKey,
            file_base64: fileBase64,
        }) as any;

        if (!result.success) {
            return { success: false, message: result.message || 'Python bridge error.' };
        }

        // bridge.py returns the parser result directly in result.data
        const parseResult = result.data;
        return {
            success: parseResult.success,
            message: parseResult.message,
            data: parseResult.data,
            headers: parseResult.headers,
        };
    } catch (e: any) {
        console.error("previewFile error:", e);
        return { success: false, message: e.message || 'Error parsing file.' };
    }
}

export async function processAndPersist(
    logType: LogType,
    fileBuffer: ArrayBuffer,
    entryCode: string,
    additionalData?: any,
    images?: Record<string, string[]>
): Promise<{ success: boolean; message: string; payload?: Record<string, any[]>; images?: Record<string, string[]> }> {
    try {
        const logTypeKey = logType.toLowerCase().replace(/ /g, '_');
        const fileBase64 = Buffer.from(fileBuffer).toString('base64');

        // Single Python call handles: parse + validate uniqueness + insert all tables
        const result = await runBridge({
            action: 'parse_and_persist',
            log_type: logTypeKey,
            entry_code: entryCode,
            file_base64: fileBase64,
            additional_data: additionalData || {},
        }) as any;

        if (!result.success) {
            return { success: false, message: result.message || result.data?.message || 'Processing failed.' };
        }

        const bridgeResult = result.data;
        if (!bridgeResult.success) {
            return { success: false, message: bridgeResult.message };
        }

        // Save images (stays in TypeScript - file I/O, not data processing)
        if (images && Object.keys(images).length > 0) {
            const existingImages = await loadImages(logType);
            const mergedImages = { ...existingImages, ...images };
            await saveImages(logType, mergedImages);
        }

        // Load images for the response
        const allImages = await loadImages(logType);

        return {
            success: true,
            message: bridgeResult.message,
            payload: bridgeResult.payload,
            images: allImages,
        };

    } catch (e: any) {
        console.error("processAndPersist error:", e);
        return { success: false, message: e.message || 'An unexpected error occurred.' };
    }
}

export async function fetchPersistedData(logType: LogType): Promise<FetchResult> {
    try {
        const logTypeKey = logType.toLowerCase().replace(/ /g, '_');

        // Single Python call fetches all tables for this log type
        const result = await runBridge({
            action: 'fetch',
            log_type: logTypeKey,
        }) as any;

        const images = await loadImages(logType);

        if (!result.success) {
            return { success: false, message: result.message || 'Fetch failed.' };
        }

        const bridgeResult = result.data;
        if (!bridgeResult.success) {
            return { success: false, message: bridgeResult.message };
        }

        return {
            success: true,
            isJson: true,
            payload: bridgeResult.payload,
            images,
        };
    } catch (error: any) {
        console.error("Fetch error:", error);
        return { success: false, message: error.message || "Failed to fetch persisted data." };
    }
}

export async function fetchGeneTracker(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    try {
        const result = await runBridge({ action: 'fetch_gene_tracker' }) as any;
        if (!result.success) {
            return { success: false, message: result.message || 'Fetch failed.' };
        }
        const bridgeResult = result.data;
        if (!bridgeResult.success) {
            return { success: false, message: bridgeResult.message };
        }
        return { success: true, data: bridgeResult.data };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

export async function fetchExtractionWells(entryName: string) {
    try {
        const result = await runBridge({
            action: 'fetch_extraction_wells',
            entry_name: entryName,
        }) as any;

        if (!result.success) {
            return { success: false, message: result.message || 'Fetch failed.' };
        }

        const bridgeResult = result.data;
        return {
            success: bridgeResult.success,
            wells: bridgeResult.wells,
            message: bridgeResult.message,
        };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}
