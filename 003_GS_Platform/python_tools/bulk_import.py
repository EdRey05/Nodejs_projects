"""Phase-1 bulk import layer (v0.0.5) — folder-level imports for the viewer logs.

Functions (exposed as bridge.py actions):
- bulk_import(args): walk a real-data folder, parse each file with the SAME
  parser functions the uploader path uses (parsers/), derive entry_code from
  the filename, skip entries already present in the log type's index table,
  and persist via the same insert shape as bridge.action_parse_and_persist.
  dry_run=True parses and validates but inserts nothing.
- Retained bulk log import and master-summary helpers for layout/log drafts.
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
# Job Log upsert import
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