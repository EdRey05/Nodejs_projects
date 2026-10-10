"""Parser for Nanodrop quantification CSV files.

These are UTF-16 encoded, tab-delimited CSVs exported from the NanoDrop equipment.
We only keep columns 3-7 (0-indexed 2-6): Nucleic Acid(ng/uL), A260/A280, A260/A230, A260, A280.
Columns 1 (Date) and 2 (Sample Name) are skipped as the equipment has wrong date/timezone
and uses generic names like "Sample 1".

Returns { success, message, data: [{row_number, concentration_ng_ul, a260_a280, a260_a230, a260, a280}] }.
"""

import csv
import io


def parse(file_bytes: bytes) -> dict:
    try:
        # Decode UTF-16 (handles BOM automatically)
        try:
            text = file_bytes.decode('utf-16')
        except UnicodeDecodeError:
            # Fallback to utf-8 in case format changes
            text = file_bytes.decode('utf-8')

        reader = csv.reader(io.StringIO(text), delimiter='\t')

        # Skip header row
        header = next(reader, None)
        if header is None:
            return {"success": False, "message": "Empty file — no header row found."}

        data = []
        row_number = 0

        for row in reader:
            # Skip empty rows
            if not row or len(row) < 7:
                continue

            # Check if columns 2-6 (the ones we care about) have any data
            values = row[2:7]
            if all(v.strip() == '' for v in values):
                continue

            row_number += 1

            try:
                row_data = {
                    "row_number": row_number,
                    "concentration_ng_ul": float(values[0]) if values[0].strip() else None,
                    "a260_a280": float(values[1]) if values[1].strip() else None,
                    "a260_a230": float(values[2]) if values[2].strip() else None,
                    "a260": float(values[3]) if values[3].strip() else None,
                    "a280": float(values[4]) if values[4].strip() else None,
                }
                data.append(row_data)
            except (ValueError, IndexError) as e:
                # Skip rows that can't be parsed as numbers
                continue

        if not data:
            return {"success": False, "message": "No valid data rows found in the CSV file."}

        return {
            "success": True,
            "message": f"{len(data)} rows parsed successfully.",
            "data": data,
        }

    except Exception as e:
        return {"success": False, "message": str(e) or "Error parsing Nanodrop CSV file."}
