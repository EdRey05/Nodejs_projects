
"use server";

import { getContextAwareHelp } from "@/ai/flows/context-aware-help";
import { getExcelSummary } from "@/ai/flows/excel-summary";
import { LogType, PlateData } from "@/lib/types";
import * as xlsx from 'xlsx';
import { saveDatabaseFile, loadDatabaseFile, saveImages, loadImages, createDataZip } from "@/lib/storage";
import { spawn } from 'child_process';
import path from 'path';
import { generatePlateData } from "@/lib/utils";

export async function getHelp(
  query: string,
  context: string
): Promise<string> {
  try {
    const result = await getContextAwareHelp({ query, appContext: context });
    return result.helpMessage;
  } catch (error) {
    console.error(error);
    return "Sorry, I encountered an error while trying to help. Please check the server logs.";
  }
}

export async function summarizeExcel(excelData: string): Promise<string> {
  try {
    if (!excelData.startsWith('data:')) {
        throw new Error("Invalid data URI format for Excel file.");
    }
    const result = await getExcelSummary({ excelData });
    return result.summary;
  } catch (error) {
    console.error(error);
    return "Sorry, I was unable to summarize the Excel file. Please ensure it is a valid .xlsx file.";
  }
}

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
        const headers = originalHeaders.map(h => String(h || '')).filter(Boolean);
        const rowsToProcess = jsonData.slice(1);
        
        const nameIndex = originalHeaders.indexOf('Name');
        const bbidIndex = originalHeaders.indexOf('BBID');

        if (nameIndex === -1 || bbidIndex === -1) {
            return { success: false, message: 'Missing "Name" and/or "BBID" columns.' };
        }

        const filteredRows = rowsToProcess.filter(row => row[nameIndex] || row[bbidIndex]);
        if (filteredRows.length === 0) {
            return { success: false, message: 'No valid rows found to import.' };
        }
        
        const dataToReturn = filteredRows.map(row => {
            let rowData: { [key: string]: any } = {};
            headers.forEach((header) => {
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

            // 1. Parse Grid Data (B3:M10)
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

            // 2. Parse Samples Data (B13 onwards)
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
                const headers = allSheetJson[sampleHeaderIndex].slice(1, 7); // B to G -> index 1 to 6
                samplesHeaders = headers.filter(h => h).map(String);

                for (let i = sampleHeaderIndex + 1; i < allSheetJson.length; i++) {
                    const row = allSheetJson[i];
                    if (!row || !row[1]) break; // Stop if row is empty or column B (JobID) is empty
                    
                    const sampleRow: { [key: string]: any } = {};
                    samplesHeaders.forEach((header, index) => {
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

        // plate 1: B5:G12 (cols 1-6), plate 2: J5:O12 (cols 7-12)
        const ranges = [
            { id: 1, range: 'B5:G12', colOffset: 0 },
            { id: 2, range: 'J5:O12', colOffset: 6 }
        ];

        const plates = [];
        
        for (const { id, range } of ranges) {
            const data: any[][] = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                range,
                defval: '',
            });

            const isRangeEmpty = data.flat().every(cell => String(cell).trim() === '');
            if (isRangeEmpty) continue;
            
            const plateData = generatePlateData(8, 6); // Always 6 columns for a 48-well plate format
             for (let i = 0; i < 8; i++) { // Rows A-H
                const rowChar = String.fromCharCode(65 + i);
                for (let j = 0; j < 6; j++) { // 6 columns
                    const wellId = `${rowChar}${j+1}`;
                    if (plateData[wellId]) {
                        plateData[wellId].content = String(data[i]?.[j] || '');
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


export async function previewFile(logType: LogType, fileBuffer: ArrayBuffer): Promise<ParseResult> {
    switch (logType) {
        case 'Ligation':
            return _parseLigationData(fileBuffer);
        case 'Colony PCR':
            return _parseColonyPCRData(fileBuffer);
        case 'DNA Extraction':
            return _parseDnaExtractionData(fileBuffer);
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
                workbook.Sheets[sheetName] = xlsx.utils.json_to_sheet([]);
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
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), sheetName);
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
        
        // Add grid data
        const gridDataWithIds = plate.gridData.map((row: any) => ({
            [idColName]: newId,
            plate_id: plateId,
            ...row
        }));
        allPlatesData.push(...gridDataWithIds);
        
        // Add samples data
        const samplesDataWithIds = plate.samplesData.map((row: any) => ({
            [idColName]: newId,
            plate_id: plateId,
            ...row
        }));
        allPlatesSamples.push(...samplesDataWithIds);
        
        // Add positives data
        const positiveWells = additionalData?.positiveWells?.[plateId] || [];
        const positivesData = positiveWells.map((well: string) => ({
            [idColName]: newId,
            plate_id: plateId,
            well: well
        }));
        allPlatesPositives.push(...positivesData);
    }
    
    // Append to Index sheet
    const indexSheet = workbook.Sheets['Index'];
    const isIndexSheetEmpty = xlsx.utils.sheet_to_json(indexSheet).length === 0;
    xlsx.utils.sheet_add_json(indexSheet, [{ name: entryCode, id: newId }], {
        origin: isIndexSheetEmpty ? 'A1' : -1,
        skipHeader: !isIndexSheetEmpty,
    });

    // Append to Data, Samples, Positives sheets
    const sheetsToUpdate: {name: 'Data' | 'Samples' | 'Positives', data: any[]}[] = [
        { name: 'Data', data: allPlatesData },
        { name: 'Samples', data: allPlatesSamples },
        { name: 'Positives', data: allPlatesPositives },
    ];
    
    for (const sheetInfo of sheetsToUpdate) {
        if (sheetInfo.data.length > 0) {
            const isSheetEmpty = xlsx.utils.sheet_to_json(workbook.Sheets[sheetInfo.name]).length === 0;
            xlsx.utils.sheet_add_json(workbook.Sheets[sheetInfo.name], sheetInfo.data, {
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

    const requiredSheets = ['Index', 'Data', 'Antibiotic', 'Temperature'];

    if (dbBuffer) {
        workbook = xlsx.read(dbBuffer, { type: 'buffer' });
        requiredSheets.forEach(sheetName => {
            if (!workbook.Sheets[sheetName]) {
                workbook.Sheets[sheetName] = xlsx.utils.json_to_sheet([]);
            }
        });
        const indexSheet = workbook.Sheets['Index'];
        const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
        if (indexData.some(item => item.name === entryCode)) {
            return { success: false, message: 'Entry code must be unique.' };
        }
    } else {
        workbook = xlsx.utils.book_new();
        requiredSheets.forEach(sheetName => {
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), sheetName);
        });
    }
    
    const indexSheet = workbook.Sheets['Index'];
    const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
    const newId = indexData.length > 0 ? Math.max(...indexData.map(i => i.id)) + 1 : 1;

    const parseResult = await _parseDnaExtractionData(fileBuffer);
    if (!parseResult.success || !Array.isArray(parseResult.data)) {
        return { success: false, message: parseResult.message };
    }

    const allPlatesData: any[] = [];
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    for (const plate of parseResult.data) {
        // This creates a sparse representation of the plate data for storage
        for(let i=0; i < 8; i++) { // Rows A-H
            const rowLabel = rowLabels[i];
            const row: any = { [idColName]: newId, plate_id: plate.plateId, Row: rowLabel };
            let hasContentInRow = false;

            // The content is in plate.data, which is a 6-column grid
            for(let j=0; j < 6; j++) { // 6 columns
                const wellId = `${rowLabel}${j+1}`;
                const content = plate.data[wellId]?.content;
                if (content && content.trim() !== '') {
                    // The column name in excel is C1, C2, etc.
                    // For plate 2 (cols 7-12), we map 0->6, 1->7, etc.
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
    
    // Append to Index sheet
    const isIndexSheetEmpty = xlsx.utils.sheet_to_json(indexSheet).length === 0;
    xlsx.utils.sheet_add_json(indexSheet, [{ name: entryCode, id: newId }], { origin: isIndexSheetEmpty ? 'A1' : -1, skipHeader: !isIndexSheetEmpty });

    // Append to Data sheet
    if (allPlatesData.length > 0) {
        const isDataSheetEmpty = xlsx.utils.sheet_to_json(workbook.Sheets['Data']).length === 0;
        xlsx.utils.sheet_add_json(workbook.Sheets['Data'], allPlatesData, { origin: isDataSheetEmpty ? 'A1' : -1, skipHeader: !isDataSheetEmpty });
    }
    
    // Append to Params sheets
    if (additionalData?.parameters) {
        const antibiotics = additionalData.parameters.filter(p => p.type === 'antibiotic').map(p => ({ [idColName]: newId, ...p }));
        const temperatures = additionalData.parameters.filter(p => p.type === 'temperature').map(p => ({ [idColName]: newId, ...p }));

        if (antibiotics.length > 0) {
             const isSheetEmpty = xlsx.utils.sheet_to_json(workbook.Sheets['Antibiotic']).length === 0;
            xlsx.utils.sheet_add_json(workbook.Sheets['Antibiotic'], antibiotics, { origin: isSheetEmpty ? 'A1' : -1, skipHeader: !isSheetEmpty });
        }
        if (temperatures.length > 0) {
             const isSheetEmpty = xlsx.utils.sheet_to_json(workbook.Sheets['Temperature']).length === 0;
            xlsx.utils.sheet_add_json(workbook.Sheets['Temperature'], temperatures, { origin: isSheetEmpty ? 'A1' : -1, skipHeader: !isSheetEmpty });
        }
    }

    const newDbBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const newDbBase64 = Buffer.from(newDbBuffer).toString('base64');
    
    return { success: true, message: `Successfully processed "${entryCode}". Added data for ${parseResult.data.length} plate(s).`, data: newDbBase64 };
}

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

        let workbook: xlsx.WorkBook;
        let indexData: { name: string; id: number }[];
        let idCounter: number;
        const idColName = `${logType.toLowerCase().replace(' ', '_')}_id`;

        if (dbBuffer) {
            workbook = xlsx.read(dbBuffer, { type: 'buffer' });
            const indexSheet = workbook.Sheets['Index'];
            if (indexSheet) {
                indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
                if (indexData.some(item => item.name === entryCode)) {
                    return { success: false, message: 'Entry code must be unique.' };
                }
                idCounter = indexData.length > 0 ? Math.max(...indexData.map(i => i.id)) + 1 : 1;
            } else {
                indexData = [];
                idCounter = 1;
                const newSheet = xlsx.utils.json_to_sheet([]);
                xlsx.utils.book_append_sheet(workbook, newSheet, 'Index');
            }
        } else {
            workbook = xlsx.utils.book_new();
            indexData = [];
            idCounter = 1;
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), 'Data');
            xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([]), 'Index');
        }
        
        const parseResult = await previewFile(logType, fileBuffer);
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

export async function persistData(logType: LogType, dbBase64: string, images: Record<string, string[]>) {
    try {
        const buffer = Buffer.from(dbBase64, 'base64');
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        await saveDatabaseFile(logType, arrayBuffer);
        if (images && Object.keys(images).length > 0) {
            await saveImages(logType, images);
        }
        return { success: true, message: "Data persisted to server successfully." };
    } catch (error: any) {
        console.error("Persistence error:", error);
        return { success: false, message: error.message || "Failed to persist data." };
    }
}

export async function fetchPersistedData(logType: LogType) {
    try {
        const buffer = await loadDatabaseFile(logType);
        const images = await loadImages(logType);

        if (!buffer) {
            return { success: false, message: "No persisted data found." };
        }

        const base64 = Buffer.from(buffer).toString('base64');
        return { success: true, data: base64, images };
    } catch (error: any) {
        console.error("Fetch error:", error);
        return { success: false, message: error.message || "Failed to fetch persisted data." };
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

export async function runPythonScript(scriptName: string, inputData: any) {
    return new Promise((resolve) => {
        // Sanitize script name to prevent path traversal
        const sanitizedScriptName = path.basename(scriptName);
        const scriptPath = path.join(process.cwd(), 'scripts', sanitizedScriptName);

        const pythonProcess = spawn('python3', [scriptPath]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Pass data via stdin to avoid command-line length limits (ARG_MAX)
        pythonProcess.stdin.write(JSON.stringify(inputData));
        pythonProcess.stdin.end();

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                resolve({ success: false, message: `Script exited with code ${code}`, error: stderr });
            } else {
                try {
                    const result = JSON.parse(stdout);
                    resolve({ success: true, data: result });
                } catch (e) {
                    resolve({ success: true, rawOutput: stdout });
                }
            }
        });
    });
}
