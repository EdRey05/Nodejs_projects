"use server";

/**
 * @deprecated Legacy Excel-based processing functions.
 * Used by tools/log-uploader and tools/tool-1 pages.
 * Will be removed once those pages are migrated to the DuckDB-based workflow.
 */

import { LogType, DnaQuantificationSource } from "@/lib/types";
import * as xlsx from 'xlsx';
import { generatePlateData } from "@/lib/utils";

type ParseResult = {
    success: boolean;
    message: string;
    data?: any;
    headers?: string[];
};

async function _parseLigationData(fileBuffer: ArrayBuffer): Promise<ParseResult> {
    try {
        const wb = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = 'Plate Name';
        if (!wb.SheetNames.includes(sheetName)) {
            return { success: false, message: `Sheet "${sheetName}" not found.` };
        }
        const sheet = wb.Sheets[sheetName];
        const jsonData: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 'A1:W97' });

        if (jsonData.length < 2) return { success: false, message: 'No data rows found.' };

        const originalHeaders = jsonData[0];
        const headers = originalHeaders.map((h: any) => String(h || '')).filter(Boolean);
        const rowsToProcess = jsonData.slice(1);

        const nameIndex = originalHeaders.indexOf('Name');
        const bbidIndex = originalHeaders.indexOf('BBID');

        if (nameIndex === -1 || bbidIndex === -1) {
            return { success: false, message: 'Missing "Name" and/or "BBID" columns.' };
        }

        const filteredRows = rowsToProcess.filter((row: any[]) => row[nameIndex] || row[bbidIndex]);
        if (filteredRows.length === 0) {
            return { success: false, message: 'No valid rows found to import.' };
        }

        const dataToReturn = filteredRows.map((row: any[]) => {
            let rowData: { [key: string]: any } = {};
            headers.forEach((header: string) => {
                const headerIndex = originalHeaders.indexOf(header);
                rowData[header] = row[headerIndex];
            });
            return rowData;
        });

        return { success: true, message: `${filteredRows.length} rows ready.`, data: dataToReturn, headers };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || 'Error parsing ligation file.' };
    }
}

async function _parseColonyPCRData(fileBuffer: ArrayBuffer): Promise<ParseResult> {
    try {
        const wb = xlsx.read(fileBuffer, { type: 'buffer', cellStyles: true });
        const plateSheetNames = wb.SheetNames.filter(name => /^plate \d+$/i.test(name));

        if (plateSheetNames.length === 0) {
            return { success: false, message: 'No sheets named "Plate {number}" found in the file.' };
        }

        const plates = [];
        const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        for (const sheetName of plateSheetNames) {
            const sheet = wb.Sheets[sheetName];
            const plateId = parseInt(sheetName.match(/\d+/)?.[0] || '0');

            const gridRawData: any[][] = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                range: 'B3:M10',
                defval: '',
            });

            const gridJson = gridRawData.map((row, rowIndex) => {
                const rowObj: { [key: string]: any } = { Row: rowLabels[rowIndex] };
                for(let i=0; i<12; i++) {
                    rowObj[`C${i+1}`] = row[i] || '';
                }
                return rowObj;
            });
            const gridHeaders = ['Row', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'];

            const allSheetJson: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
            let sampleHeaderIndex = -1;
            for(let i=0; i<allSheetJson.length; i++){
                const row = allSheetJson[i];
                if (row && row[1] === 'JobID' && row[2] === 'BBID') {
                    sampleHeaderIndex = i;
                    break;
                }
            }

            let samplesData: any[] = [];
            let samplesHeaders: string[] = [];
            if (sampleHeaderIndex !== -1) {
                const headers = allSheetJson[sampleHeaderIndex].slice(1, 7);
                samplesHeaders = headers.filter((h: any) => h).map(String);

                for (let i = sampleHeaderIndex + 1; i < allSheetJson.length; i++) {
                    const row = allSheetJson[i];
                    if (!row || !row[1]) break;

                    const sampleRow: { [key: string]: any } = {};
                    samplesHeaders.forEach((header) => {
                        const headerSheetIndex = allSheetJson[sampleHeaderIndex].indexOf(header);
                        sampleRow[header] = row[headerSheetIndex] || '';
                    });
                    samplesData.push(sampleRow);
                }
            }

            plates.push({
                plateId,
                sheetName,
                gridData: gridJson,
                gridHeaders,
                samplesData,
                samplesHeaders,
            });
        }

        return { success: true, message: `Found ${plates.length} plate(s).`, data: plates };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || 'Error parsing Colony PCR file.' };
    }
}

async function _parseDnaExtractionData(fileBuffer: ArrayBuffer): Promise<ParseResult> {
    try {
        const wb = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = 'Layout';
        if (!wb.SheetNames.includes(sheetName)) {
            return { success: false, message: `Sheet "${sheetName}" not found.` };
        }
        const sheet = wb.Sheets[sheetName];

        const ranges = [
            { id: 1, range: 'B5:G12', colOffset: 0 },
            { id: 2, range: 'J5:O12', colOffset: 6 }
        ];

        const plates = [];
        const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

        for (const { id, range } of ranges) {
            const data: any[][] = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                range,
                defval: '',
            });

            const isRangeEmpty = data.flat().every(cell => cell === null || cell === undefined || String(cell).trim() === '');
            if (isRangeEmpty) continue;

            const plateData = generatePlateData(8, 6);
             for (let i = 0; i < 8; i++) {
                const rowChar = rowLabels[i];
                for (let j = 0; j < 6; j++) {
                    const wellId = `${rowChar}${j+1}`;
                    if (plateData[wellId]) {
                        const cellVal = data[i]?.[j];
                        plateData[wellId].content = (cellVal !== null && cellVal !== undefined) ? String(cellVal).trim() : '';
                    }
                }
            }

            plates.push({
                plateId: id,
                data: plateData,
            });
        }

        if (plates.length === 0) {
            return { success: false, message: 'No data found in the expected ranges (B5:G12, J5:O12) of the "Layout" sheet.' };
        }

        return { success: true, message: `Found data for ${plates.length} plate(s).`, data: plates };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || 'Error parsing DNA Extraction file.' };
    }
}

async function _parseDnaQuantificationData(fileBuffer: ArrayBuffer): Promise<ParseResult> {
    try {
        const wb = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        const jsonData: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        if (jsonData.length < 2) return { success: false, message: 'No data found.' };

        const allHeaders = jsonData[0];
        const headers = allHeaders.slice(1, 7).map((h: any) => String(h || 'Unnamed')).filter(Boolean);

        const dataToReturn = jsonData.slice(1).map(row => {
            let rowData: { [key: string]: any } = {};
            headers.forEach((header: string, idx: number) => {
                rowData[header] = row[idx + 1] || '';
            });
            return rowData;
        }).filter(row => Object.values(row).some(v => v !== ''));

        return { success: true, message: `${dataToReturn.length} rows parsed successfully.`, data: dataToReturn, headers };
    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || 'Error parsing DNA Quantification file.' };
    }
}

/** @deprecated - Used for preview in legacy tools pages */
export async function legacyPreviewFile(logType: LogType, fileBuffer: ArrayBuffer): Promise<ParseResult> {
    switch (logType) {
        case 'Ligation':
            return _parseLigationData(fileBuffer);
        case 'Colony PCR':
            return _parseColonyPCRData(fileBuffer);
        case 'DNA Extraction':
            return _parseDnaExtractionData(fileBuffer);
        case 'DNA Quantification':
            return _parseDnaQuantificationData(fileBuffer);
        default:
            return { success: false, message: 'Invalid log type selected.' };
    }
}

async function _processColonyPcrFile(
    dbBuffer: ArrayBuffer | null,
    fileBuffer: ArrayBuffer,
    entryCode: string,
    additionalData?: { positiveWells?: Record<string, string[]> }
): Promise<{ success: boolean; message: string; data?: string }> {
     let workbook: xlsx.WorkBook;
    let indexData: { name: string; id: number }[];
    let idCounter: number;
    const idColName = 'colony_pcr_id';

    const requiredSheets = ['Index', 'Data', 'Samples', 'Positives'];

    if (dbBuffer) {
        workbook = xlsx.read(dbBuffer, { type: 'buffer' });
        requiredSheets.forEach(sheetName => {
            if (!workbook.Sheets[sheetName]) {
                const ws = xlsx.utils.json_to_sheet([]);
                xlsx.utils.book_append_sheet(workbook, ws, sheetName);
            }
        });
        const indexSheet = workbook.Sheets['Index'];
        indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
        if (indexData.some(item => item.name === entryCode)) {
            return { success: false, message: 'Entry code must be unique.' };
        }
        idCounter = indexData.length > 0 ? Math.max(...indexData.map(i => i.id)) + 1 : 1;
    } else {
        workbook = xlsx.utils.book_new();
        indexData = [];
        idCounter = 1;
        requiredSheets.forEach(sheetName => {
            const ws = xlsx.utils.json_to_sheet([]);
            xlsx.utils.book_append_sheet(workbook, ws, sheetName);
        });
    }

    const parseResult = await _parseColonyPCRData(fileBuffer);
    if (!parseResult.success || !Array.isArray(parseResult.data)) {
        return { success: false, message: parseResult.message };
    }

    const newId = idCounter;

    const allPlatesData: any[] = [];
    const allPlatesSamples: any[] = [];
    const allPlatesPositives: any[] = [];

    for (const plate of parseResult.data) {
        const plateId = plate.plateId;

        const gridDataWithIds = plate.gridData.map((row: any) => ({
            [idColName]: newId,
            plate_id: plateId,
            ...row
        }));
        allPlatesData.push(...gridDataWithIds);

        const samplesDataWithIds = plate.samplesData.map((row: any) => ({
            [idColName]: newId,
            plate_id: plateId,
            ...row
        }));
        allPlatesSamples.push(...samplesDataWithIds);

        const positiveWells = additionalData?.positiveWells?.[String(plateId)] || [];
        const positivesData = positiveWells.map((well: string) => ({
            [idColName]: newId,
            plate_id: plateId,
            well: well
        }));
        allPlatesPositives.push(...positivesData);
    }

    const indexSheet = workbook.Sheets['Index'];
    const isIndexSheetEmpty = xlsx.utils.sheet_to_json(indexSheet).length === 0;
    xlsx.utils.sheet_add_json(indexSheet, [{ name: entryCode, id: newId }], {
        origin: isIndexSheetEmpty ? 'A1' : -1,
        skipHeader: !isIndexSheetEmpty,
    });

    const sheetsToUpdate: {name: 'Data' | 'Samples' | 'Positives', data: any[]}[] = [
        { name: 'Data', data: allPlatesData },
        { name: 'Samples', data: allPlatesSamples },
        { name: 'Positives', data: allPlatesPositives },
    ];

    for (const sheetInfo of sheetsToUpdate) {
        if (sheetInfo.data.length > 0) {
            const ws = workbook.Sheets[sheetInfo.name];
            if (!ws) continue;
            const isSheetEmpty = xlsx.utils.sheet_to_json(ws).length === 0;
            xlsx.utils.sheet_add_json(ws, sheetInfo.data, {
                origin: isSheetEmpty ? 'A1' : -1,
                skipHeader: !isSheetEmpty,
            });
        }
    }

    const newDbBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const newDbBase64 = Buffer.from(newDbBuffer).toString('base64');

    return { success: true, message: `Successfully processed "${entryCode}". Added data for ${parseResult.data.length} plate(s).`, data: newDbBase64 };
}

async function _processDnaExtractionFile(
    dbBuffer: ArrayBuffer | null,
    fileBuffer: ArrayBuffer,
    entryCode: string,
    additionalData?: { parameters?: { plate_id: number; well_id: string; type: string; value: string }[] }
): Promise<{ success: boolean; message: string; data?: string }> {
    let workbook: xlsx.WorkBook;
    const idColName = 'dna_extraction_id';
    const requiredSheets = ['Index', 'Data', 'Antibiotic', 'Temperature', 'Bacteria', 'Incubation', 'Prep'];

    if (dbBuffer) {
        workbook = xlsx.read(dbBuffer, { type: 'buffer' });
        requiredSheets.forEach(sheetName => {
            if (!workbook.Sheets[sheetName]) {
                const ws = xlsx.utils.json_to_sheet([]);
                xlsx.utils.book_append_sheet(workbook, ws, sheetName);
            }
        });
    } else {
        workbook = xlsx.utils.book_new();
        requiredSheets.forEach(sheetName => {
            const ws = xlsx.utils.json_to_sheet([]);
            xlsx.utils.book_append_sheet(workbook, ws, sheetName);
        });
    }

    const indexSheet = workbook.Sheets['Index'];
    const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
    if (indexData.some(item => item.name === entryCode)) {
        return { success: false, message: 'Entry code must be unique.' };
    }
    const newId = indexData.length > 0 ? Math.max(...indexData.map(i => i.id)) + 1 : 1;

    const parseResult = await _parseDnaExtractionData(fileBuffer);
    if (!parseResult.success || !Array.isArray(parseResult.data)) {
        return { success: false, message: parseResult.message };
    }

    const allPlatesData: any[] = [];
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const dataHeaders = [idColName, 'plate_id', 'Row', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'];

    for (const plate of parseResult.data) {
        for(let i=0; i < 8; i++) {
            const rowLabel = rowLabels[i];
            const row: any = {};
            dataHeaders.forEach(h => row[h] = null);

            row[idColName] = newId;
            row['plate_id'] = plate.plateId;
            row['Row'] = rowLabel;

            let hasContentInRow = false;
            for(let j=0; j < 6; j++) {
                const wellId = `${rowLabel}${j+1}`;
                const content = plate.data[wellId]?.content;
                if (content && content.trim() !== '') {
                    const colOffset = plate.plateId === 1 ? 0 : 6;
                    const excelColName = `C${j + 1 + colOffset}`;
                    row[excelColName] = content;
                    hasContentInRow = true;
                }
            }

            if(hasContentInRow) {
                allPlatesData.push(row);
            }
        }
    }

    xlsx.utils.sheet_add_json(indexSheet, [{ name: entryCode, id: newId }], {
        origin: -1,
        skipHeader: indexData.length > 0
    });

    if (allPlatesData.length > 0) {
        const dataSheet = workbook.Sheets['Data'];
        const existingData = xlsx.utils.sheet_to_json(dataSheet);
        xlsx.utils.sheet_add_json(dataSheet, allPlatesData, {
            origin: -1,
            skipHeader: existingData.length > 0,
            header: dataHeaders
        });
    }

    if (additionalData?.parameters) {
        const sheetMap: Record<string, string> = {
            antibiotic: 'Antibiotic',
            temperature: 'Temperature',
            bacteria: 'Bacteria',
            incubationTime: 'Incubation',
            prep: 'Prep'
        };
        const paramHeader = [idColName, 'plate_id', 'well_id', 'value'];

        Object.keys(sheetMap).forEach(type => {
            const params = additionalData.parameters!.filter(p => p.type === type).map(p => ({
                [idColName]: newId,
                plate_id: p.plate_id,
                well_id: p.well_id,
                value: p.value
            }));

            if (params.length > 0) {
                const sheetName = sheetMap[type];
                const ws = workbook.Sheets[sheetName];
                const existingParams = xlsx.utils.sheet_to_json(ws);
                xlsx.utils.sheet_add_json(ws, params, {
                    origin: -1,
                    skipHeader: existingParams.length > 0,
                    header: paramHeader
                });
            }
        });
    }

    const newDbBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const newDbBase64 = Buffer.from(newDbBuffer).toString('base64');

    return { success: true, message: `Successfully processed "${entryCode}". Added data for ${parseResult.data.length} plate(s).`, data: newDbBase64 };
}

async function _processDnaQuantificationFile(
    dbBuffer: ArrayBuffer | null,
    fileBuffer: ArrayBuffer,
    entryCode: string,
    additionalData?: { sourceMode: DnaQuantificationSource; sourceDetails?: any }
): Promise<{ success: boolean; message: string; data?: string }> {
    let workbook: xlsx.WorkBook;
    const idColName = 'quantification_id';
    const sheets = ['Index', 'ExtractionPlate', 'Fragments', 'Other'];

    if (dbBuffer) {
        workbook = xlsx.read(dbBuffer, { type: 'buffer' });
        sheets.forEach(s => {
            if (!workbook.Sheets[s]) {
                const ws = xlsx.utils.json_to_sheet([]);
                xlsx.utils.book_append_sheet(workbook, ws, s);
            }
        });
        const indexSheet = workbook.Sheets['Index'];
        const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
        if (indexData.some(item => item.name === entryCode)) return { success: false, message: 'Entry code must be unique.' };
    } else {
        workbook = xlsx.utils.book_new();
        sheets.forEach(s => {
            const ws = xlsx.utils.json_to_sheet([]);
            xlsx.utils.book_append_sheet(workbook, ws, s);
        });
    }

    const indexSheet = workbook.Sheets['Index'];
    const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
    const newId = indexData.length > 0 ? Math.max(...indexData.map(i => i.id)) + 1 : 1;

    const parseResult = await _parseDnaQuantificationData(fileBuffer);
    if (!parseResult.success) return { success: false, message: parseResult.message };

    xlsx.utils.sheet_add_json(indexSheet, [{
        name: entryCode,
        id: newId,
        source: additionalData?.sourceMode || 'Unknown',
        source_details: JSON.stringify(additionalData?.sourceDetails || {})
    }], { origin: -1, skipHeader: indexData.length > 0 });

    const modeSheetName = additionalData?.sourceMode === 'Extraction Plate' ? 'ExtractionPlate' :
                          additionalData?.sourceMode === 'Fragments' ? 'Fragments' : 'Other';

    const modeSheet = workbook.Sheets[modeSheetName];
    const rowsToAdd = parseResult.data.map((row: any) => ({ [idColName]: newId, ...row }));
    const isModeSheetEmpty = xlsx.utils.sheet_to_json(modeSheet).length === 0;
    xlsx.utils.sheet_add_json(modeSheet, rowsToAdd, { origin: isModeSheetEmpty ? 'A1' : -1, skipHeader: !isModeSheetEmpty });

    const newDbBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return { success: true, message: `Successfully added "${entryCode}" to quantification log.`, data: Buffer.from(newDbBuffer).toString('base64') };
}

/** @deprecated Use processAndPersist instead */
export async function processFile(
    logType: LogType,
    dbBuffer: ArrayBuffer | null,
    fileBuffer: ArrayBuffer,
    entryCode: string,
    additionalData?: any
): Promise<{ success: boolean; message: string; data?: string }> {
    try {
        if (logType === 'Colony PCR') {
           return _processColonyPcrFile(dbBuffer, fileBuffer, entryCode, additionalData);
        }
        if (logType === 'DNA Extraction') {
            return _processDnaExtractionFile(dbBuffer, fileBuffer, entryCode, additionalData);
        }
        if (logType === 'DNA Quantification') {
            return _processDnaQuantificationFile(dbBuffer, fileBuffer, entryCode, additionalData);
        }

        let workbook: xlsx.WorkBook;
        let indexData: { name: string; id: number }[];
        let idCounter: number;
        const idColName = `${logType.toLowerCase().replace(' ', '_')}_id`;

        if (dbBuffer) {
            workbook = xlsx.read(dbBuffer, { type: 'buffer' });
            if (!workbook.Sheets['Index']) {
                xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), 'Index');
            }
            if (!workbook.Sheets['Data']) {
                xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), 'Data');
            }
            const indexSheet = workbook.Sheets['Index'];
            indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
            if (indexData.some(item => item.name === entryCode)) {
                return { success: false, message: 'Entry code must be unique.' };
            }
            idCounter = indexData.length > 0 ? Math.max(...indexData.map(i => i.id)) + 1 : 1;
        } else {
            workbook = xlsx.utils.book_new();
            indexData = [];
            idCounter = 1;
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), 'Data');
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), 'Index');
        }

        const parseResult = await legacyPreviewFile(logType, fileBuffer);
        if (!parseResult.success || !parseResult.data) {
            return { success: false, message: parseResult.message };
        }

        const newId = idCounter;
        const dataToAdd = parseResult.data.map((row: any) => ({ [idColName]: newId, ...row }));

        const indexSheet = workbook.Sheets['Index'];
        const isIndexSheetEmpty = xlsx.utils.sheet_to_json(indexSheet).length === 0;
        xlsx.utils.sheet_add_json(indexSheet, [{ name: entryCode, id: newId }], {
            origin: isIndexSheetEmpty ? 'A1' : -1,
            skipHeader: !isIndexSheetEmpty
        });

        const dataSheet = workbook.Sheets['Data'];
        const isDataSheetEmpty = xlsx.utils.sheet_to_json(dataSheet).length === 0;

        xlsx.utils.sheet_add_json(dataSheet, dataToAdd, {
            origin: isDataSheetEmpty ? 'A1' : -1,
            skipHeader: !isDataSheetEmpty
        });

        const newDbBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const newDbBase64 = Buffer.from(newDbBuffer).toString('base64');

        return { success: true, message: `Successfully processed "${entryCode}". Added ${parseResult.data.length} rows.`, data: newDbBase64 };

    } catch (e: any) {
        console.error(e);
        return { success: false, message: e.message || 'An unexpected error occurred during processing.' };
    }
}
