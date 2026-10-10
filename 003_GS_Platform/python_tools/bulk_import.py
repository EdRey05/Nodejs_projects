"""Phase-1 bulk import layer (v0.0.5) — folder-level imports for the viewer logs.

Functions (exposed as bridge.py actions):
- bulk_import(args): walk a real-data folder, parse each file with the SAME
  parser functions the uploader path uses (parsers/), derive entry_code from
  the filename, skip entries already present in the log type's index table,
  and persist via the same insert shape as bridge.action_parse_and_persist.
  dry_run=True parses and validates but inserts nothing.
- import_gene_tracker(args): header-verified, work_no-based UPSERT of a Gene
  Tracker / In-house Progress "Initiated" sheet into gene_tracker_data.
- import_master_summary(args): stream the Extraction Log 'summary' sheet into
  a NEW master_summary table (drop + recreate, batched inserts).

Runs with cwd = repo root (db_ops.py resolves data/ and python_tools/
relatively). One bad file never kills a batch: every file is wrapped in
try/except and reported individually.
"""

import os
import re
import sys
import json
from datetime import datetime
from io import BytesIO

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_ops
import openpyxl
from parsers import PARSERS

# ---------------------------------------------------------------------------
# Log-type configuration
# ---------------------------------------------------------------------------

# ext filter per log type (lowercase, with dot)
LOG_TYPE_EXT = {
    'ligation': {'.xlsx'},
    'colony_pcr': {'.xlsx'},
    'dna_extraction': {'.xlsx'},
    'dna_quantification': {'.csv'},
}

# filename stem -> entry_code. stem is the filename minus its extension.
def derive_entry_code(log_type: str, stem: str) -> str:
    """Derive the entry_code from the file's name (minus extension)."""
    if log_type == 'dna_quantification':
        # 'dsDNA 1_13_2026 6_12_00 AM' -> dsDNA_YYYYMMDD_HHMMSS (zero-padded, 24h).
        # Other NanoDrop exports (e.g. 'Quantification_U0410P1-V-ER.csv' — the
        # same UTF-16 instrument format under a manual name) fall back to the
        # generic rule: filename minus extension.
        try:
            return derive_quant_entry_code(stem)
        except ValueError:
            return stem
    # ligation / colony_pcr / dna_extraction: filename minus extension IS the code
    return stem


QUANT_STEM_RE = re.compile(
    r'^(?P<name>dsDNA)\s+'
    r'(?P<m>\d{1,2})_(?P<d>\d{1,2})_(?P<y>\d{4})\s+'
    r'(?P<h>\d{1,2})_(?P<min>\d{1,2})_(?P<s>\d{1,2})\s+'
    r'(?P<ampm>AM|PM)$',
    re.IGNORECASE,
)


def derive_quant_entry_code(stem: str) -> str:
    """'dsDNA M_D_YYYY H_M_S AMPM' -> 'dsDNA_YYYYMMDD_HHMMSS' (24h, zero-padded)."""
    m = QUANT_STEM_RE.match(stem.strip())
    if not m:
        raise ValueError(
            f"Filename does not match the NanoDrop export pattern "
            f"'dsDNA M_D_YYYY H_M_S AMPM': {stem!r}"
        )
    try:
        dt = datetime(
            int(m.group('y')), int(m.group('m')), int(m.group('d')),
            int(m.group('h')) % 12 + (12 if m.group('ampm').upper() == 'PM' else 0),
            int(m.group('min')), int(m.group('s')),
        )
    except ValueError as e:
        raise ValueError(f"Invalid date/time in filename {stem!r}: {e}")
    return f"{m.group('name')}_{dt.strftime('%Y%m%d_%H%M%S')}"


def load_index_names(log_type: str) -> set:
    """Codes already present in the log type's index table."""
    rows = db_ops.query_data(log_type, 'index') or []
    return {str(r.get('name')) for r in rows if r.get('name') is not None}


# ---------------------------------------------------------------------------
# Per-file parse + build insert plan (shared by dry-run and real run)
# ---------------------------------------------------------------------------

def _parse_file(log_type: str, file_path: str) -> dict:
    """Run the SAME parser the uploader path uses, on bytes read from disk."""
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    if log_type == 'dna_quantification':
        parser = PARSERS['nanodrop']
    else:
        parser = PARSERS[log_type]
    return parser(file_bytes)


def _plan_rows(log_type: str, new_id: int, entry_code: str, parse_result: dict) -> dict:
    """Build the per-table insert plan exactly like bridge.action_parse_and_persist."""
    plan = {'data': {}, 'counts': {}}
    id_col = f"{log_type}_id"

    if log_type == 'ligation':
        rows = [{id_col: new_id, **row} for row in parse_result['data']]
        plan['data']['data'] = rows
        plan['counts']['data'] = len(rows)

    elif log_type == 'colony_pcr':
        all_data, all_samples = [], []
        for plate in parse_result['data']:
            plate_id = plate['plateId']
            all_data.extend(
                {id_col: new_id, 'plate_id': plate_id, **row} for row in plate['gridData']
            )
            all_samples.extend(
                {id_col: new_id, 'plate_id': plate_id, **row} for row in plate['samplesData']
            )
        plan['data']['data'] = all_data
        plan['data']['samples'] = all_samples
        plan['counts']['data'] = len(all_data)
        plan['counts']['samples'] = len(all_samples)
        # positives come from the uploader UI for manual uploads; bulk import
        # has none (empty by design).

    elif log_type == 'dna_extraction':
        row_labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        all_data = []
        for plate in parse_result['data']:
            plate_id = plate['plateId']
            plate_data = plate['data']
            for i in range(8):
                row_label = row_labels[i]
                row = {id_col: new_id, 'plate_id': plate_id, 'Row': row_label}
                has_content = False
                for j in range(6):
                    well_id = f"{row_label}{j + 1}"
                    content = plate_data.get(well_id, {}).get('content', '')
                    if content and content.strip():
                        col_offset = 0 if plate_id == 1 else 6
                        row[f"C{j + 1 + col_offset}"] = content
                        has_content = True
                if has_content:
                    all_data.append(row)
        # NOTE (P1 spec §3.1): per-entry parameters are NOT parsed this round —
        # they come from the root 'Extraction Log v19.xlsx' master log in a
        # later step, after Ed confirms the column mapping.
        plan['data']['data'] = all_data
        plan['counts']['data'] = len(all_data)

    elif log_type == 'dna_quantification':
        # NOTE: the quant sub-tables key on 'quantification_id' (NOT
        # f'{log_type}_id') — same literal the uploader path uses in bridge.
        rows = [{'quantification_id': new_id, **row} for row in parse_result['data']]
        plan['data']['nanodrop'] = rows
        plan['counts']['nanodrop'] = len(rows)

    return plan


# ---------------------------------------------------------------------------
# bulk_import action
# ---------------------------------------------------------------------------

def _insert_rows(conn, log_type: str, table_name: str, rows: list) -> None:
    """db_ops.insert_data equivalent bound to an OPEN connection, so a file's
    index + data inserts run inside ONE transaction (all-or-nothing per file)."""
    import pandas as pd
    if not rows:
        return
    df = pd.DataFrame(rows)
    full_table_name = f"{log_type}_{table_name}"
    res = conn.execute(f"PRAGMA table_info({full_table_name})").fetchall()
    table_cols = [r[1] for r in res]
    # Loud guard: refuse to silently drop keys that have no table column
    # (a silently dropped id column would orphan every row).
    unknown = [c for c in df.columns if c not in table_cols]
    if unknown:
        raise ValueError(
            f"Insert refused for {full_table_name}: keys with no table column: {unknown}"
        )
    df_cols = [c for c in df.columns if c in table_cols]
    df = df[df_cols]
    quoted_cols = ', '.join('"' + c + '"' for c in df_cols)
    conn.execute(f"INSERT INTO {full_table_name} ({quoted_cols}) SELECT * FROM df")


def bulk_import(args: dict) -> dict:
    log_type = str(args.get('log_type', '')).lower().replace(' ', '_')
    folder_path = args.get('folder_path', '')
    dedupe = args.get('dedupe', 'skip')
    dry_run = bool(args.get('dry_run', True))

    if log_type not in LOG_TYPE_EXT:
        return {"success": False, "message": f"Unknown log_type: {log_type!r}"}
    if log_type == 'dna_quantification':
        # Nanodrop CSV only this round
        allowed_exts = {'.csv'}
    else:
        allowed_exts = LOG_TYPE_EXT[log_type]

    if not folder_path or not os.path.isdir(folder_path):
        return {"success": False, "message": f"Folder not found: {folder_path!r}"}

    if not os.path.exists(db_ops.DB_PATH):
        db_ops.init_db()

    report = []
    inserted = skipped = failed = 0
    total_rows = 0

    existing = load_index_names(log_type)  # dry-run also reports skips

    files = sorted(
        f for f in os.listdir(folder_path)
        if os.path.splitext(f)[1].lower() in allowed_exts
    )

    next_id = db_ops.get_next_id(log_type, 'index')

    for fname in files:
        file_path = os.path.join(folder_path, fname)
        stem = os.path.splitext(fname)[0]
        item = {
            "file": fname,
            "status": "failed",
            "message": "",
            "entry_code": None,
            "rows": 0,
        }
        try:
            entry_code = derive_entry_code(log_type, stem)
            item["entry_code"] = entry_code

            if dedupe == 'skip' and entry_code in existing:
                item["status"] = "skipped"
                item["message"] = "Entry code already present in index table."
                skipped += 1
                report.append(item)
                continue

            parse_result = _parse_file(log_type, file_path)
            if not parse_result.get('success') or not parse_result.get('data'):
                # Parser-level rejection (no exception): report, don't fail batch.
                # With the colony_pcr hardening, False here means the file had
                # no recognizable plates/layout at all.
                item["status"] = "failed"
                item["message"] = parse_result.get('message', 'Parse failed.')
                failed += 1
                report.append(item)
                continue

            plan = _plan_rows(log_type, next_id, entry_code, parse_result)
            row_total = sum(plan['counts'].values())
            item["rows"] = row_total
            total_rows += row_total

            # surface parser notes (e.g. missing samples table) without failing
            if parse_result.get('notes'):
                item["message"] = '; '.join(parse_result['notes'])

            if not dry_run:
                conn = db_ops.get_connection()
                try:
                    conn.execute("BEGIN TRANSACTION")
                    index_entry = {"name": entry_code, "id": next_id}
                    if log_type == 'dna_quantification':
                        index_entry["source"] = 'Nanodrop CSV'
                        index_entry["source_details"] = json.dumps({})
                    _insert_rows(conn, log_type, 'index', [index_entry])
                    for table_name, rows in plan['data'].items():
                        _insert_rows(conn, log_type, table_name, rows)
                    conn.execute("COMMIT")
                except Exception:
                    try:
                        conn.execute("ROLLBACK")
                    except Exception:
                        pass
                    raise
                finally:
                    conn.close()
                next_id += 1
                existing.add(entry_code)
                item["status"] = "inserted"
                if not item["message"]:
                    item["message"] = f"OK: {row_total} rows."
            else:
                item["status"] = "would_insert"
                if not item["message"]:
                    item["message"] = f"Dry-run OK: {row_total} rows."
                next_id += 1  # ids would advance in the real run
            inserted += 1

        except Exception as e:
            item["status"] = "failed"
            item["message"] = f"{type(e).__name__}: {e}"
            failed += 1

        report.append(item)

    return {
        "success": True,
        "log_type": log_type,
        "folder_path": folder_path,
        "dry_run": dry_run,
        "report": report,
        "inserted": (0 if dry_run else inserted),
        "would_insert": (inserted if dry_run else 0),
        "skipped": skipped,
        "failed": failed,
        "total_rows": total_rows,
    }


# ---------------------------------------------------------------------------
# Gene Tracker upsert import
# ---------------------------------------------------------------------------

# Same A-AE map as python_tools/import_gene_tracker.py (column 1-based)
GT_COLUMN_MAP = {
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


def _gt_schema_columns() -> list:
    with open(db_ops.SCHEMA_PATH, 'r') as f:
        import yaml
        schema = yaml.safe_load(f)
    return [c['name'] for c in schema['gene_tracker']['data']]


def _gt_read_rows(xlsx_path: str, sheet: str):
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        if sheet not in wb.sheetnames:
            return None, f"Sheet {sheet!r} not found. Available: {wb.sheetnames}"
        ws = wb[sheet]

        header_row = next(ws.iter_rows(min_row=1, max_row=1, max_col=45, values_only=True))
        # NO strip here: the historical workbook legitimately carries header
        # cells like ' ' (col R) and a trailing '\n' (col X); comparing raw
        # values keeps drift detection honest without false positives.
        headers = [("" if v is None else str(v)) for v in header_row]

        # Build expected headers by reading the schema names back as the
        # canonical map, and comparing against what import_gene_tracker.py
        # historically produced. We verify MAPPING INTEGRITY (every schema
        # column has a mapped source column) and HEADER-PRESENCE drift.
        missing_map = []
        for col_num, col_name in GT_COLUMN_MAP.items():
            if col_name not in _gt_schema_columns():
                missing_map.append(col_name)

        data_rows = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row is None or all(v is None or (isinstance(v, str) and not v.strip()) for v in row[:31]):
                continue
            row_data = {}
            has_data = False
            for col_num, col_name in GT_COLUMN_MAP.items():
                if col_num > len(row):
                    break
                val = row[col_num - 1]
                if val is not None:
                    has_data = True
                    if hasattr(val, 'strftime'):
                        val = val.strftime('%Y-%m-%d')
                    else:
                        val = str(val).strip()
                        if not val:
                            val = None
                row_data[col_name] = val
            if has_data:
                data_rows.append(row_data)

        return {"headers": headers, "rows": data_rows}, None
    finally:
        wb.close()


def import_gene_tracker(args: dict) -> dict:
    """Bridge action: header-verified upsert of an 'Initiated' sheet by work_no."""
    xlsx_path = args.get('xlsx_path', '')
    sheet = args.get('sheet', 'Initiated')
    mode = args.get('mode', 'upsert')
    dry_run = bool(args.get('dry_run', True))
    commit = bool(args.get('commit', False))

    if not xlsx_path or not os.path.isfile(xlsx_path):
        return {"success": False, "message": f"File not found: {xlsx_path!r}"}

    try:
        schema_cols = _gt_schema_columns()
    except Exception as e:
        return {"success": False, "message": f"Cannot load schema: {e}"}

    result, err = _gt_read_rows(xlsx_path, sheet)
    if err:
        return {"success": False, "message": err}

    headers = result["headers"]
    rows = result["rows"]

    # --- Header drift verification -----------------------------------------
    # Expected readable headers (A-AE) per the historical importer map:
    EXPECTED_HEADERS = [
        'Work No.', 'BBI ID', 'Order Date', 'SO', 'Gene Name', 'Vector',
        'Cloning Site', 'Resistance', 'Length (bp)', 'Plasmid Qty.', 'Prep',
        'Synthesis Progress', 'Work No. 2', 'Internal PROGRESS NOTES',
        'NEED BY:', 'QC Status', 'Insert Sequence', ' ', 'Insert+Vector',
        'Plasmid No.', 'Tube ID', 'Position in Box', 'Host',
        'Growth Condition/\nTemperature\n', 'Competent Cells',
        'OD260 (BATCH ONLY)', 'OD280 (BATCH ONLY)', 'OD260/OD280 (BATCH ONLY)',
        'Conc. ng/uL (BATCH ONLY)', 'Shipped', 'Notes on ORDER/SHIPMENT',
    ]
    drift = []
    for col_num, col_name in GT_COLUMN_MAP.items():
        actual = headers[col_num - 1] if col_num <= len(headers) else None
        expected = EXPECTED_HEADERS[col_num - 1] if col_num - 1 < len(EXPECTED_HEADERS) else None
        if actual != expected:
            drift.append(f"col {col_num} ({col_name}): expected {expected!r}, found {actual!r}")

    # Every schema column must be produced by the map
    unmapped_schema_cols = [c for c in schema_cols if c not in set(GT_COLUMN_MAP.values())]

    if drift or unmapped_schema_cols:
        return {
            "success": False,
            "message": "Header drift detected — import aborted. Diff list follows.",
            "drift": drift,
            "unmapped_schema_cols": unmapped_schema_cols,
            "headers_found": headers[:31],
        }

    inserted = updated = skipped = 0
    conn = db_ops.get_connection()
    try:
        existing = {
            str(r[0]) for r in conn.execute("SELECT work_no FROM gene_tracker_data").fetchall()
            if r[0] is not None
        }
    finally:
        conn.close()

    upsert_rows, seen_work_nos = [], set()
    for row_data in rows:
        wn = str(row_data.get('work_no') or '').strip()
        if not wn:
            skipped += 1
            continue
        if wn in seen_work_nos:
            skipped += 1
            continue
        seen_work_nos.add(wn)
        if wn in existing:
            updated += 1
        else:
            inserted += 1
        upsert_rows.append(row_data)

    if dry_run or not commit:
        return {
            "success": True,
            "dry_run": True,
            "sheet": sheet,
            "rows_in_sheet": len(rows),
            "would_insert": inserted,
            "would_update": updated,
            "skipped": skipped,
            "message": (
                f"Dry-run: {len(rows)} data rows, {inserted} new work_no, "
                f"{updated} existing, {skipped} skipped. No DB writes."
            ),
        }

    # --- Real upsert in ONE transaction ------------------------------------
    import pandas as pd
    conn = db_ops.get_connection()
    try:
        conn.execute("BEGIN TRANSACTION")
        for row_data in upsert_rows:
            conn.execute(
                "DELETE FROM gene_tracker_data WHERE work_no = ?", [row_data['work_no']]
            )
        df = pd.DataFrame(upsert_rows)
        quoted_cols = ', '.join(f'"{c}"' for c in schema_cols)
        df = df[schema_cols]
        conn.execute(f"INSERT INTO gene_tracker_data ({quoted_cols}) SELECT * FROM df")
        conn.execute("COMMIT")
    except Exception as e:
        conn.execute("ROLLBACK")
        return {"success": False, "message": f"Upsert failed (rolled back): {e}"}
    finally:
        conn.close()

    return {
        "success": True,
        "dry_run": False,
        "sheet": sheet,
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "message": f"Upserted {len(upsert_rows)} rows ({inserted} new, {updated} updated).",
    }


# ---------------------------------------------------------------------------
# master_summary import (Extraction Log v19 'summary' sheet)
# ---------------------------------------------------------------------------

MASTER_SUMMARY_COLUMNS = [
    ("work_no", "TEXT"),
    ("bbi_id", "TEXT"),
    ("clone_and_plate_source", "TEXT"),
    ("comments", "TEXT"),
    ("glycerol_lot", "TEXT"),
    ("vector_lot", "TEXT"),
    ("plasmid_no", "TEXT"),
    ("concentration_ng_ul", "DOUBLE"),
    ("a260_280", "DOUBLE"),
    ("a260_230", "DOUBLE"),
    ("a260", "DOUBLE"),
    ("a280", "DOUBLE"),
]

# 1-based Excel column -> field name (cols 13+ are empty; never read)
MS_COL_MAP = {
    1: 'work_no', 2: 'bbi_id', 3: 'clone_and_plate_source', 4: 'comments',
    5: 'glycerol_lot', 6: 'vector_lot', 7: 'plasmid_no',
    8: 'concentration_ng_ul', 9: 'a260_280', 10: 'a260_230',
    11: 'a260', 12: 'a280',
}

MS_EXPECTED_HEADERS = [
    'Work No.', 'BBI ID', 'Clone and Plate Source', 'Comments', 'Glycerol LOT',
    'Vector LOT', 'Plasmid No.', 'Concentration [ng/ul]', 'A260/280',
    'A260/230', 'A260', 'A280',
]


def _ms_to_text(v):
    if v is None:
        return None
    if hasattr(v, 'strftime'):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    return s if s else None


def _ms_to_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _ms_verify_headers(xlsx_path: str, sheet: str):
    """Open once, verify the first 12 headers, return (ws, wb) or (None, error)."""
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        wb.close()
        return None, f"Sheet {sheet!r} not found. Available: {wb.sheetnames}"
    ws = wb[sheet]
    header = next(ws.iter_rows(min_row=1, max_row=1, max_col=12, values_only=True))
    headers = [("" if v is None else str(v).strip()) for v in header]
    diffs = []
    for idx, expected in enumerate(MS_EXPECTED_HEADERS):
        actual = headers[idx] if idx < len(headers) else None
        if actual != expected:
            diffs.append(f"col {idx + 1}: expected {expected!r}, found {actual!r}")
    if diffs:
        wb.close()
        return None, "Header drift detected: " + "; ".join(diffs)
    return (ws, wb), None


def _ms_row_tuples(ws, max_rows=None):
    """Yield (row_number, value_tuple) with fully-empty rows skipped."""
    text_fields = {1, 2, 3, 4, 5, 6, 7}
    for i, row in enumerate(
        ws.iter_rows(min_row=2, max_col=12, values_only=True), start=2
    ):
        if max_rows and i > max_rows:
            break
        vals = list(row) + [None] * (12 - len(row)) if len(row) < 12 else list(row)
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in vals):
            continue  # fully-empty
        out = []
        for col in range(1, 13):
            v = vals[col - 1]
            out.append(_ms_to_text(v) if col in text_fields else _ms_to_float(v))
        yield i, tuple(out)


def import_master_summary(args: dict) -> dict:
    """Bridge action: stream 'summary' sheet into master_summary (drop+recreate)."""
    xlsx_path = args.get('xlsx_path', '')
    sheet = args.get('sheet', 'summary')
    dry_run = bool(args.get('dry_run', True))
    commit = bool(args.get('commit', False))

    if not xlsx_path or not os.path.isfile(xlsx_path):
        return {"success": False, "message": f"File not found: {xlsx_path!r}"}

    opened, err = _ms_verify_headers(xlsx_path, sheet)
    if err:
        return {"success": False, "message": err}
    ws, wb = opened

    try:
        # Dry-run: count data rows only (single pass, no writes)
        n_rows = 0
        for _ in _ms_row_tuples(ws):
            n_rows += 1
        if dry_run or not commit:
            return {
                "success": True,
                "dry_run": True,
                "sheet": sheet,
                "header_verified": True,
                "data_rows": n_rows,
                "message": (
                    f"Dry-run: headers verified, {n_rows} non-empty data rows "
                    f"found. No DB writes."
                ),
            }

        # Real run: drop + recreate, then batched inserts (5000/chunk)
        conn = db_ops.get_connection()
        try:
            cols_sql = ", ".join(f'"{n}" {t}' for n, t in MASTER_SUMMARY_COLUMNS)
            conn.execute("DROP TABLE IF EXISTS master_summary")
            conn.execute(f"CREATE TABLE master_summary ({cols_sql})")
            placeholders = ", ".join("?" * 12)
            quoted = ", ".join(f'"{n}"' for n, _ in MASTER_SUMMARY_COLUMNS)
            insert_sql = f"INSERT INTO master_summary ({quoted}) VALUES ({placeholders})"
            conn.execute("BEGIN TRANSACTION")
            chunk = []
            for _, tup in _ms_row_tuples(ws):
                chunk.append(tup)
                if len(chunk) >= 5000:
                    conn.executemany(insert_sql, chunk)
                    chunk = []
            if chunk:
                conn.executemany(insert_sql, chunk)
            conn.execute("COMMIT")
            total = conn.execute("SELECT count(*) FROM master_summary").fetchone()[0]
        finally:
            conn.close()
        return {
            "success": True,
            "dry_run": False,
            "rows_imported": total,
            "message": f"master_summary recreated with {total} rows.",
        }
    finally:
        wb.close()