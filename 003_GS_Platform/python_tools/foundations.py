"""Phase 2-4 foundations (v0.0.5): vector DB import + user profiles + templates.

Bridges the pilot resources into the app per P2_4_LAYOUTS_SPEC.md §1:
- import_vector_db(xlsx_path): Vector_database.xlsx -> vector_db table
  (per-lot digested-vector rows with resistance/base-length joined from the
  Vector sheet), upsert by (vector_name, enzyme, lot).
- get_user_profiles()/resolve_initials: data/user_profiles.json lookup.
- list_templates(): available shipped templates in python_tools/templates/.

Naming convention (ported from pilot): year letters S=2024, T=2025, U=2026,
V=2027 ... wraps at Z; default filenames carry the caller's initials.
"""

import os
import re
import sys
import json
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_ops
import openpyxl

VECTOR_DB_XLSX_DEFAULT = os.path.join(
    'data', 'Vector_database.xlsx'
)
USER_PROFILES_PATH = os.path.join('data', 'user_profiles.json')
TEMPLATES_DIR = os.path.join('python_tools', 'templates')

# Year-letter convention (pilot parity): S=2024, T=2025, ... wraps at Z.
BASE_YEAR = 2024
BASE_CHAR = ord('S')

SCHEMA_COLS = {
    'vector_name': 'TEXT',
    'enzyme': 'TEXT',
    'lot': 'TEXT',
    'box_position': 'TEXT',
    'concentration': 'DOUBLE',
    'vector_length_bp': 'DOUBLE',
    'resistance': 'TEXT',
    'notes': 'TEXT',
    'source_sheet': 'TEXT',
}


def year_letter(today: datetime.date | None = None) -> str:
    """S=2024, T=2025, U=2026, ... (wraps after Z)."""
    today = today or datetime.date.today()
    offset = (today.year - BASE_YEAR) % 26
    return chr(BASE_CHAR + offset)


def default_filename(kind: str, initials: str, today: datetime.date | None = None) -> str:
    """'{year_letter}{MMDD}-{Kind}-{initials}.xlsx'."""
    today = today or datetime.date.today()
    safe_kind = re.sub(r'[^A-Za-z]', '', kind).title() or 'Ligation'
    return f"{year_letter(today)}{today.strftime('%m%d')}-{safe_kind}-{initials}.xlsx"


# ---------------------------------------------------------------------------
# User profiles
# ---------------------------------------------------------------------------

def load_user_profiles() -> list:
    """Read data/user_profiles.json: {"profiles": [{"username","initials"},...]}"""
    if not os.path.exists(USER_PROFILES_PATH):
        return []
    try:
        with open(USER_PROFILES_PATH, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        return cfg.get('profiles', []) or []
    except Exception:
        return []


def resolve_initials(username: str | None = None, fallback: str | None = None) -> str:
    """Resolve initials for a username; explicit fallback beats failure."""
    profiles = load_user_profiles()
    if username:
        uname = username.lower()
        for p in profiles:
            if str(p.get('username', '')).lower() == uname:
                return p.get('initials', '')
    if fallback:
        return fallback
    if profiles:
        return profiles[0].get('initials', '')
    raise ValueError(
        f"No user profile matched username={username!r} and no initial/fallback provided."
    )


# ---------------------------------------------------------------------------
# vector_db table
# ---------------------------------------------------------------------------

def _ensure_vector_db_table(conn) -> None:
    cols_sql = ', '.join(f'"{n}" {t}' for n, t in SCHEMA_COLS.items())
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vector_db " + "({})"
        .format(', '.join(f'"{n}" {t}' for n, t in SCHEMA_COLS.items()))
    )


def _norm(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _to_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def import_vector_db(args: dict) -> dict:
    """Bridge action: Vector_database.xlsx -> vector_db (upsert by 3-key).

    Vector sheet rows (no lot) become lot='' base rows carrying size and
    resistance. Digested_Vectors rows carry per-(vector,enzyme,lot)
    concentration + box position, with per-row length overrides.
    """
    xlsx_path = args.get('xlsx_path', VECTOR_DB_XLSX_DEFAULT)
    dry_run = bool(args.get('dry_run', True))
    commit = bool(args.get('commit', False))

    if not os.path.isfile(xlsx_path):
        return {"success": False, "message": f"File not found: {xlsx_path!r}"}

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    rows: list[dict] = []

    try:
        if 'Vector' not in wb.sheetnames:
            return {"success": False, "message": 'Sheet "Vector" not found.'}

        # --- Vector sheet: name, size, resistance, (sequence ignored) ---
        for row in wb['Vector'].iter_rows(min_row=2, values_only=True):
            name = _norm(row[0]) if row else None
            if not name:
                continue
            rows.append({
                'vector_name': name,
                'enzyme': '',
                'lot': '',
                'box_position': None,
                'concentration': None,
                'vector_length_bp': _to_float(row[1]) if len(row) > 1 else None,
                'resistance': _norm(row[2]) if len(row) > 2 else None,
                'notes': None,
                'source_sheet': 'Vector',
            })

        # --- Digested_Vectors sheet: per-lot rows ---
        if 'Digested_Vectors' in wb.sheetnames:
            for row in wb['Digested_Vectors'].iter_rows(min_row=2, values_only=True):
                if not row or _norm(row[1]) is None:
                    continue
                vec_name = _norm(row[1])
                enzyme = _norm(row[2]) or ''
                lot = _norm(row[3]) or ''
                box = _norm(row[0])
                conc = _to_float(row[4]) if len(row) > 4 else None
                # per-row length override only when present
                length = _to_float(row[5]) if len(row) > 5 else None
                if length is None:
                    # inherit base length from the vector sheet rows we built
                    base = next(
                        (r for r in rows if r['vector_name'] == vec_name and r['source_sheet'] == 'Vector'),
                        None,
                    )
                    length = base['vector_length_bp'] if base else None
                # resistance lives on the Vector sheet
                res = next(
                    (r['resistance'] for r in rows
                     if r['vector_name'] == vec_name and r['source_sheet'] == 'Vector' and r['resistance']),
                    None,
                )
                rows.append({
                    'vector_name': vec_name,
                    'enzyme': enzyme,
                    'lot': lot,
                    'box_position': box,
                    'concentration': conc,
                    'vector_length_bp': length,
                    'resistance': res,
                    'notes': _norm(row[6]) if len(row) > 6 else None,
                    'source_sheet': 'Digested_Vectors',
                })
    finally:
        wb.close()

    # de-dup exact 3-key repeats (idempotent re-import)
    seen = set()
    unique_rows = []
    for r in rows:
        key = (r['vector_name'], r['enzyme'], r['lot'])
        if key in seen:
            continue
        seen.add(key)
        unique_rows.append(r)

    if dry_run or not commit:
        return {
            "success": True,
            "dry_run": True,
            "rows_found": len(unique_rows),
            "base_vectors": sum(1 for r in unique_rows if r['source_sheet'] == 'Vector'),
            "digested_lots": sum(1 for r in unique_rows if r['source_sheet'] == 'Digested_Vectors'),
            "message": f"Dry-run: {len(unique_rows)} rows would be upserted. No DB writes.",
        }

    conn = db_ops.get_connection()
    try:
        cols_sql = ', '.join(f'"{n}" {t}' for n, t in SCHEMA_COLS.items())
        conn.execute("DROP TABLE IF EXISTS vector_db")
        conn.execute(f"CREATE TABLE vector_db ({cols_sql})")
        conn.execute("BEGIN TRANSACTION")
        placeholders = ', '.join('?' * len(SCHEMA_COLS))
        quoted = ', '.join(f'"{n}"' for n in SCHEMA_COLS)
        conn.executemany(
            f"INSERT INTO vector_db ({quoted}) VALUES ({placeholders})",
            [tuple(r[n] for n in SCHEMA_COLS) for r in unique_rows],
        )
        conn.execute("COMMIT")
        total = conn.execute("SELECT count(*) FROM vector_db").fetchone()[0]
    except Exception as e:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        return {"success": False, "message": f"vector_db import failed (rolled back): {e}"}
    finally:
        conn.close()

    return {
        "success": True,
        "dry_run": False,
        "rows_imported": total,
        "message": f"vector_db recreated with {total} rows.",
    }


def lookup_vector(args: dict) -> dict:
    """Bridge action: find vector rows by name (+optional enzyme).

    {vector: 'pUC57-Amp', enzyme?: 'EcoRI'} ->
      {success, matches: [{vector_name, enzyme, lot, box_position,
                           concentration, vector_length_bp, resistance}]}
    """
    name = str(args.get('vector', '')).strip()
    enzyme = args.get('enzyme')
    enzyme = str(enzyme).strip() if enzyme is not None else None

    if not name:
        return {"success": False, "message": "Missing 'vector'."}

    os.makedirs(os.path.dirname(db_ops.DB_PATH), exist_ok=True)
    conn = db_ops.get_read_connection()
    if conn is None:
        return {"success": False, "message": "Database not initialized."}
    try:
        tbl = conn.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name='vector_db'"
        ).fetchone()[0]
        if tbl == 0:
            return {"success": False, "message": "vector_db table not found — run import_vector_db first."}
        if enzyme:
            # exact enzyme first, then the bare vector row
            rows = conn.execute(
                'SELECT vector_name, enzyme, lot, box_position, concentration, '
                'vector_length_bp, resistance FROM vector_db '
                "WHERE vector_name=? AND enzyme=? ORDER BY lot", [name, enzyme]
            ).fetchall()
        else:
            rows = conn.execute(
                'SELECT vector_name, enzyme, lot, box_position, concentration, '
                'vector_length_bp, resistance FROM vector_db WHERE vector_name=? ORDER BY lot',
                [name],
            ).fetchall()
        matches = [
            {
                'vector_name': r[0], 'enzyme': r[1], 'lot': r[2],
                'box_position': r[3], 'concentration': r[4],
                'vector_length_bp': r[5], 'resistance': r[6],
            }
            for r in rows
        ]
        return {"success": True, "vector": name, "matches": matches}
    except Exception as e:
        return {"success": False, "message": str(e)}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Templates inventory (Ligation_Template_v5 etc. shipped into the repo)
# ---------------------------------------------------------------------------

TEMPLATE_META = {
    'Ligation_Template_v5.xlsx': {
        'kind': 'ligation',
        'sheet': 'Layout',
        'description': 'Ligation layout template (Layout + Labels, A1 header, row 2 start)',
    },
    'ColonyPCR_layout_v3.xlsx': {
        'kind': 'colony_pcr',
        'sheet': None,
        'description': 'Colony PCR layout template (B3:M10 grid, samples from row 13)',
    },
    'Sequencing_layout_v5.xlsx': {'kind': 'sequencing', 'sheet': None, 'description': 'Phase 5'},
    'Sequencing_order_form_v4.xlsx': {'kind': 'sequencing', 'sheet': None, 'description': 'Phase 5'},
    'Sequencing_validation_v5.xlsx': {'kind': 'sequencing', 'sheet': None, 'description': 'Phase 5'},
}


def list_templates(_args: dict | None = None) -> dict:
    """Bridge action: which shipped templates exist in python_tools/templates/."""
    found = []
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    for fname, meta in TEMPLATE_META.items():
        path = os.path.join(TEMPLATES_DIR, fname)
        found.append({
            'file': fname,
            'present': os.path.isfile(path),
            'kind': meta['kind'],
            'sheet': meta['sheet'],
            'description': meta['description'],
        })
    return {"success": True, "templates_dir": TEMPLATES_DIR, "templates": found}