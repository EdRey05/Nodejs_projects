/** Rows -> xlsx (base64) for the P8 arbitrary-table export buttons. */
export async function rowsToExcelBase64(rows: Record<string, unknown>[], sheetName = 'Sheet1'): Promise<string> {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    return out as unknown as string;
}