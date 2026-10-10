"""Parser for Ligation Excel files.

Reads sheet "Plate Name" (legacy) or "Layout" (newer U0417+ files), range
A1:W97. Filters rows that have Name or BBID. Newer 'Layout' files carry
renamed headers which are normalized onto the legacy names below.
Returns { success, message, data: [{header: value, ...}], headers: [str] }.
"""

import openpyxl


def parse(file_bytes: bytes) -> dict:
    try:
        from io import BytesIO
        wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)

        # v0.0.5 Phase 1: 2026_pilot files from U0417 onward renamed the sheet
        # to 'Layout'. Accept both; prefer the legacy 'Plate Name'.
        sheet_name = next(
            (s for s in ('Plate Name', 'Layout') if s in wb.sheetnames), None
        )
        if sheet_name is None:
            return {"success": False, "message": 'Neither "Plate Name" nor "Layout" sheet found.'}

        ws = wb[sheet_name]

        # Read range A1:W97 (rows 1-97, cols 1-23)
        rows = []
        for row in ws.iter_rows(min_row=1, max_row=97, min_col=1, max_col=23, values_only=True):
            rows.append(list(row))

        if len(rows) < 2:
            return {"success": False, "message": "No data rows found."}

        original_headers = rows[0]

        # v0.0.5 Phase 1: newer 'Layout' files renamed columns; map renames
        # onto the legacy names the schema (ligation_data) and viewers expect.
        # Additive — legacy files carry none of these header strings.
        header_aliases = {
            'Work No.': 'Name',
            'BBI ID': 'BBID',
            'Vector LOT': 'Vector Lot',
            'Length (bp)': 'Len',
        }
        original_headers = [
            header_aliases.get(h, h) if isinstance(h, str) else h
            for h in original_headers
        ]

        headers = [str(h) for h in original_headers if h is not None and str(h).strip() != '']

        data_rows = rows[1:]

        # Find Name and BBID column indices
        name_index = None
        bbid_index = None
        for i, h in enumerate(original_headers):
            if h == 'Name':
                name_index = i
            elif h == 'BBID':
                bbid_index = i

        if name_index is None or bbid_index is None:
            return {"success": False, "message": 'Missing "Name" and/or "BBID" columns.'}

        # Filter rows that have Name or BBID
        filtered_rows = [r for r in data_rows if r[name_index] or r[bbid_index]]
        if len(filtered_rows) == 0:
            return {"success": False, "message": "No valid rows found to import."}

        data_to_return = []
        for row in filtered_rows:
            row_data = {}
            for header in headers:
                header_index = next(
                    (i for i, h in enumerate(original_headers) if h == header), None
                )
                if header_index is not None:
                    val = row[header_index]
                    row_data[header] = val if val is not None else None
            data_to_return.append(row_data)

        return {
            "success": True,
            "message": f"{len(filtered_rows)} rows ready.",
            "data": data_to_return,
            "headers": headers,
        }

    except Exception as e:
        return {"success": False, "message": str(e) or "Error parsing ligation file."}
