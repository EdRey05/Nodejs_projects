"""One-time import of Gene Tracker Excel data into DuckDB.

Reads '0-Logs/Gene Tracker.xlsx' (columns A-AE, rows 1-224),
maps Excel headers to snake_case DuckDB column names,
and inserts all rows into the gene_tracker_data table.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_ops
import openpyxl

EXCEL_PATH = os.path.join('0-Logs', 'Gene Tracker.xlsx')

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
    10: 'plasmid_qty',
    11: 'prep',
    12: 'synthesis_progress',
    13: 'job_id_2',
    14: 'internal_progress_notes',
    15: 'need_by',
    16: 'qc_status',
    17: 'insert_sequence',
    18: 'seq_check',
    19: 'insert_vector',
    20: 'plasmid_no',
    21: 'tube_id',
    22: 'position_in_box',
    23: 'host',
    24: 'growth_condition_temperature',
    25: 'competent_cells',
    26: 'od260',
    27: 'od280',
    28: 'od260_od280',
    29: 'conc_ng_ul',
    30: 'shipped',
    31: 'notes_on_order_shipment',
}


def import_gene_tracker():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: Excel file not found at {EXCEL_PATH}")
        sys.exit(1)

    # Ensure database and table exist
    db_ops.init_db()

    # Clear existing data to allow re-import
    conn = db_ops.get_connection()
    conn.execute("DELETE FROM gene_tracker_data")
    conn.close()

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb.active

    rows = []
    for row_num in range(2, 224 + 1):  # rows 2-224 (223 data rows)
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
        db_ops.insert_data('gene_tracker', 'data', rows)
        print(f"Imported {len(rows)} rows into gene_tracker_data table.")
    else:
        print("No data found to import.")


if __name__ == '__main__':
    import_gene_tracker()
