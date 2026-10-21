"""One-time import of Job Log Excel data into DuckDB.

Reads '0-Logs/Job Log.xlsx' (columns A-T),
maps Excel headers to snake_case DuckDB column names,
and inserts all rows into the job_log table.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_ops
import openpyxl

EXCEL_PATH = os.path.join('0-Logs', 'Job Log.xlsx')

# Map Excel column index (1-based) to DuckDB column name
COLUMN_MAP = {
    1: 'work_no',
    2: 'bbi_id',
    3: 'order_date',
    4: 'so',
    5: 'gene_name',
    6: 'vector',
    7: 'cloning_site',
    8: 'resistance',
    9: 'length_bp',
    10: 'quantity',
    11: 'prep',
    12: 'stage',
    13: 'insert_sequence',
    14: 'final_vector_sequence',
    15: 'plasmid_no',
    16: 'tube_id',
    17: 'host',
    18: 'temperature',
    19: 'competent_cells',
    20: 'notes',
}


def import_job_log():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: Excel file not found at {EXCEL_PATH}")
        sys.exit(1)

    # Ensure database and table exist
    db_ops.init_db()

    # Clear existing data to allow re-import
    conn = db_ops.get_connection()
    conn.execute("DELETE FROM job_log")
    conn.close()

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb.active

    rows = []
    for row_num in range(2, 100000):  # all data rows below the header
        row_data = {}
        has_data = False
        for col_num, col_name in COLUMN_MAP.items():
            cell = ws.cell(row=row_num, column=col_num)
            val = cell.value
            if val is not None:
                has_data = True
                # Convert datetime to ISO string
                if hasattr(val, 'strftime'):
                    val = val.strftime('%Y-%m-%d')
                else:
                    val = str(val).strip()
                    if not val:
                        val = None
            row_data[col_name] = val if val else ''
        if has_data:
            rows.append(row_data)

    if rows:
        db_ops.insert_data('job_log', 'data', rows)
        print(f"Imported {len(rows)} rows into job_log table.")
    else:
        print("No data found to import.")


if __name__ == '__main__':
    import_job_log()
