"""Phase 2-4 layout builders (v0.0.5) — bridge actions ported from the pilot.

Ports (P2_4_LAYOUTS_SPEC.md):
- build_ligation_layout  <- pilot Workflows/ligation_layout.py (672 lines), verbatim
  math and grouping; fragment sources = action-input rows until Phase 5
  imports the fragment tables.
- build_colony_pcr_layout <- pilot Workflows/ColonyPCRLayout_app.py
  ::fill_colony_pcr_layout (v1.3), verbatim well-fill order, samples table,
  mix-calc table, Label sheet (item 'ColoPCR' spelling is the pilot's — kept
  for parity), plate headers, and borders.
- build_extraction_layout <- new (no pilot script): two 48-well halves from
  colony PCR positives; must round-trip the existing dna_extraction.py parser.
- import_primer_log      <- Primer Log 'input addon' sheet -> primers table
  (Phase 5 groundwork, P2_4 §6).
- fetch_fragments        <- pcr/idt fragment reads with graceful absence
  (tables arrive in Phase 5).

All actions are JSON in/out and follow bridge.py conventions. Paths resolve
from repo root (templates live in python_tools/templates/).
"""

import os
import re
import sys
import json
import math
import base64
import datetime
from io import BytesIO
from itertools import groupby

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_ops
import openpyxl
from openpyxl.styles import Border, Side, Font
from openpyxl.utils import get_column_letter

from foundations import resolve_initials, default_filename, TEMPLATES_DIR

LIGATION_TEMPLATE = os.path.join(TEMPLATES_DIR, 'Ligation_Template_v5.xlsx')
COLONY_TEMPLATE = os.path.join(TEMPLATES_DIR, 'ColonyPCR_layout_v3.xlsx')
PRIMER_LOG_DEFAULT = os.path.join(
    'C:/Users/Administrator/Desktop/ERA_BioAutomations/Gene_Synthesis_Agent/'
    'Tasks/Pending/Gene_Synthesis_Platform/2026_pilot/Original_data',
    'Primer Log v3.xlsx',
)

# Ported verbatim from pilot ligation_layout.py
DEFAULT_HOST = 'TOP10'
DEFAULT_TEMP = '37C'
DEFAULT_VECTOR_LENGTH_BP = 3000
PLACEHOLDER_VECTORS = ('DNA Fragment - No Vector', 'DNA Fragments - No Vector')
BASE_YEAR = 2024
BASE_CHAR = ord('S')

LAYOUT_COLUMN_MAP = {
    'job_id': 'B',
    'bbid': 'C',
    'vector': 'D',
    'enzyme': 'E',
    'length': 'T',
    'host': 'V',
    'temperature': 'W',
}


class LayoutError(Exception):
    """Structured error surfaced as {success: false, message} by the bridge."""


# ---------------------------------------------------------------------------
# Job + fragment sources
# ---------------------------------------------------------------------------

def fetch_job_log(job_ids: list) -> dict:
    """job_log stand-in: reads job_log (work_no, bbi_id, vector,
    cloning_site, resistance, length_bp)."""
    if not job_ids:
        return {}
    conn = db_ops.get_read_connection()
    try:
        placeholders = ','.join(['?'] * len(job_ids))
        rows = conn.execute(
            'SELECT work_no, bbi_id, vector, cloning_site, resistance, length_bp '
            f'FROM job_log WHERE work_no IN ({placeholders})',
            job_ids,
        ).fetchall()
    finally:
        conn.close()
    return {
        r[0]: {
            'work_no': r[0],
            'bbid': r[1],
            'vector': r[2],
            'enzyme': r[3],
            'resistance': r[4],
            'length': r[5],
        }
        for r in rows
    }


def _table_exists(conn, name: str) -> bool:
    return conn.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name=?", [name]
    ).fetchone()[0] > 0


def fetch_pcr_fragments(job_ids: list) -> dict:
    """pcr_fragments reads (Phase 5 tables); returns {} when the table is absent."""
    conn = db_ops.get_read_connection()
    try:
        if not _table_exists(conn, 'pcr_fragments'):
            return {}
        placeholders = ','.join(['?'] * len(job_ids))
        rows = conn.execute(
            'SELECT work_no, plasmid_no, insert_length_bp, concentration '
            f'FROM pcr_fragments WHERE work_no IN ({placeholders}) AND purity_pass IN (?, ?)',
            job_ids + ['Pass', 'PASS'],
        ).fetchall()
    finally:
        conn.close()
    out: dict = {}
    for work_no, plasmid_no, length, conc in rows:
        out.setdefault(work_no, []).append({
            'name': work_no,
            'location': plasmid_no or '',
            'length': int(length) if length is not None else 0,
            'concentration': float(conc) if conc is not None else None,
        })
    return out


def fetch_idt_fragments(job_ids: list) -> dict:
    """idt_fragments reads (Phase 5 tables); returns {} when absent."""
    if not job_ids:
        return {}
    conn = db_ops.get_read_connection()
    try:
        if not _table_exists(conn, 'idt_fragments'):
            return {}
        candidates = sorted({j + s for j in job_ids for s in ('', 'A', 'B', 'C')} | set(job_ids))
        placeholders = ','.join(['?'] * len(candidates))
        rows = conn.execute(
            'SELECT work_no, idt_plate, position, insert_length_bp '
            f'FROM idt_fragments WHERE work_no IN ({placeholders}) AND purity_pass IN (?, ?) '
            'ORDER BY id',
            candidates + ['Pass', 'PASS'],
        ).fetchall()
    finally:
        conn.close()
    by_job: dict = {j: [] for j in job_ids}
    for work_no, plate, position, length in rows:
        if work_no in by_job:
            target = work_no
        else:
            base = re.sub(r'[A-Z]+$', '', work_no)
            if base in by_job:
                target = base
            else:
                continue
        by_job[target].append({
            'name': work_no,
            'location': f'{plate}-{position}' if plate else (position or ''),
            'length': int(length) if length is not None else 0,
            'concentration': None,
        })
    return by_job


def load_vector_lookups() -> tuple:
    """(resistance, length_map, digested) from the vector_db table
    (imported from Vector_database.xlsx by foundations.import_vector_db)."""
    resistance = {}
    length_map = {}
    digested = {}
    conn = db_ops.get_read_connection()
    try:
        if not _table_exists(conn, 'vector_db'):
            raise LayoutError('vector_db table not found — run the import_vector_db action first.')
        rows = conn.execute(
            'SELECT vector_name, enzyme, lot, box_position, concentration, '
            'vector_length_bp, resistance, source_sheet FROM vector_db'
        ).fetchall()
    finally:
        conn.close()
    for name, enzyme, lot, box, conc, length, res, sheet in rows:
        name = name or ''
        enzyme = (enzyme or '').strip()
        length = float(length) if length is not None else None
        if sheet == 'Vector':
            if res:
                resistance[name] = res
            if length:
                length_map[name] = length
        else:  # Digested_Vectors
            if res and name not in resistance:
                resistance[name] = res
            if length and name not in length_map:
                length_map[name] = length
            digested[(name, enzyme)] = {
                'lot': lot or '',
                'box_position': box or '',
                'concentration': conc,
            }
    return resistance, length_map, digested


# ---------------------------------------------------------------------------
# build_ligation_rows (pilot port, verbatim semantics)
# ---------------------------------------------------------------------------

def build_ligation_rows(job_ids, job_log_rows, pcr_frags, idt_frags,
                        manual_vectors, conditions):
    """Returns (final_rows, manual_set). Raises LayoutError on the same cases
    the pilot dies on (missing jobs, placeholder vectors)."""
    rows: dict = {}
    missing_from_log: list = []
    placeholder_jobs: list = []
    manual_set: set = set()

    for jid in job_ids:
        if jid in manual_vectors:
            parts = manual_vectors[jid]
            if len(parts) != 3:
                raise LayoutError(
                    f'Manual vector override for {jid} must have exactly 3 values: '
                    f'vector,enzyme,resistance (got {len(parts)})'
                )
            existing = job_log_rows.get(jid, {})
            rows[jid] = {
                'job_id': jid,
                'bbid': existing.get('bbid', ''),
                'vector': parts[0],
                'enzyme': parts[1],
                'resistance': parts[2],
                'length': existing.get('length'),
            }
            manual_set.add(jid)
            continue

        if jid not in job_log_rows:
            missing_from_log.append(jid)
            continue

        info = job_log_rows[jid]
        vector = info.get('vector')
        if not vector or vector in PLACEHOLDER_VECTORS:
            placeholder_jobs.append(jid)
            continue

        rows[jid] = {
            'job_id': jid,
            'bbid': info.get('bbid'),
            'vector': vector,
            'enzyme': info.get('enzyme'),
            'resistance': info.get('resistance'),
            'length': info.get('length'),
        }

    if missing_from_log:
        raise LayoutError(
            'These Job IDs are missing from job_log (job log):\n  - '
            + '\n  - '.join(sorted(missing_from_log))
            + '\nProvide a manual_vector override for each, or remove them from the request.'
        )
    if placeholder_jobs:
        raise LayoutError(
            "These Job IDs have vector='DNA Fragment - No Vector' or empty vector:\n  - "
            + '\n  - '.join(sorted(placeholder_jobs))
            + '\nProvide a manual_vector override for each, or remove them from the request.'
        )

    sorted_rows = sorted(
        rows.values(),
        key=lambda r: (str(r['vector']), str(r['enzyme']), str(r['job_id'])),
    )

    final: list = []
    for (vec, enz), group in groupby(sorted_rows, key=lambda r: (r['vector'], r['enzyme'])):
        group_list = list(group)
        final.extend(group_list)
        first_resistance = group_list[0].get('resistance', '') or ''
        final.append({
            'job_id': f'CK-{vec}-{enz}',
            'bbid': '',
            'vector': vec,
            'enzyme': enz,
            'length': '',
            'resistance': first_resistance,
        })

    final.append({
        'job_id': 'CK+pUC19',
        'bbid': '',
        'vector': 'pUC19',
        'enzyme': '',
        'length': '',
        'resistance': 'Amp',
    })
    return final, manual_set


def write_layout(final_rows, pcr_frags, idt_frags, digested_lookup,
                 vector_resistance_lookup, vector_length_lookup,
                 conditions, manual_set, template_path, output_path) -> int:
    """Pilot write_layout port. Returns the number of layout rows written."""
    wb = openpyxl.load_workbook(template_path)
    if 'Layout' not in wb.sheetnames:
        raise LayoutError("'Layout' sheet not found in the ligation template.")
    ws = wb['Layout']

    insert_cols: dict = {}
    for cell in ws[1]:
        if cell.value in ('Insert 1', 'Insert 2', 'Insert 3'):
            insert_cols[cell.value] = cell.column

    row_idx = 2
    for item in final_rows:
        job_id = item.get('job_id', '')
        if job_id.startswith('CK'):
            host, temp = DEFAULT_HOST, DEFAULT_TEMP
        elif job_id in conditions:
            cs = conditions[job_id]
            if len(cs) != 2:
                raise LayoutError(
                    f'Conditions override for {job_id} must have exactly 2 values: host,temp'
                )
            host, temp = cs[0], cs[1]
        else:
            host, temp = DEFAULT_HOST, DEFAULT_TEMP
        item['host'] = host
        item['temperature'] = temp

        for key, col_letter in LAYOUT_COLUMN_MAP.items():
            value = item.get(key, '')
            if value is None:
                value = ''
            ws[f'{col_letter}{row_idx}'] = value

        vector_name = (item.get('vector') or '')
        vector_name = vector_name.strip() if isinstance(vector_name, str) else vector_name
        enzyme = (item.get('enzyme') or '')
        enzyme = enzyme.strip() if isinstance(enzyme, str) else enzyme

        if job_id and not job_id.startswith('CK'):
            dv = digested_lookup.get((vector_name, enzyme))
            if dv:
                ws[f'F{row_idx}'] = dv['lot']
                ws[f'G{row_idx}'] = dv['box_position']
                conc = dv['concentration']
                if conc and conc > 0:
                    ws[f'H{row_idx}'] = math.ceil(40 / conc / 0.5) * 0.5
                else:
                    ws[f'H{row_idx}'] = ''
            else:
                ws[f'F{row_idx}'] = ''
                ws[f'G{row_idx}'] = ''
                ws[f'H{row_idx}'] = ''

            resistance = vector_resistance_lookup.get(vector_name)
            ws[f'U{row_idx}'] = resistance if resistance else ''

            fragments = []
            if job_id in pcr_frags and pcr_frags[job_id]:
                fragments = pcr_frags[job_id]
            elif job_id in idt_frags and idt_frags[job_id]:
                fragments = idt_frags[job_id]

            if fragments and insert_cols:
                vec_len = vector_length_lookup.get(vector_name) or DEFAULT_VECTOR_LENGTH_BP
                if job_id in manual_set and fragments:
                    item['length'] = sum(int(f.get('length', 0)) for f in fragments)
                    ws[f'T{row_idx}'] = item['length']

                for i, frag in enumerate(fragments):
                    insert_key = f'Insert {i + 1}'
                    if insert_key not in insert_cols:
                        break
                    col = insert_cols[insert_key]
                    ws.cell(row=row_idx, column=col).value = frag['name']
                    ws.cell(row=row_idx, column=col + 1).value = frag['location']

                    insert_length = float(frag.get('length') or 0)
                    if vec_len > 0 and insert_length > 0:
                        volume = (insert_length / vec_len) * 12
                        conc = frag.get('concentration')
                        if conc and conc > 0:
                            volume = volume / (conc / 10)
                        ws.cell(row=row_idx, column=col + 2).value = round(volume, 2)
        else:
            ws[f'F{row_idx}'] = ''
            ws[f'G{row_idx}'] = ''
            ws[f'H{row_idx}'] = ''
            ws[f'U{row_idx}'] = ''

        row_idx += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(output_path))
    return row_idx - 2


def build_ligation_layout(args: dict) -> dict:
    """Bridge action: generate a Ligation Layout xlsx (pilot port).

    Input: { jobs: [work_no,...] (ordered), fragments?: {work_no: [{name,
    location, length, concentration},...]}, manual_vectors?: {work_no:
    [vector,enzyme,resistance]}, conditions?: {work_no: [host,temp]},
    initials?: 'ER' (resolved from data/user_profiles.json when omitted),
    output_path?: str } Output: { success, excel_base64?, filename,
    rows_written, warnings }.
    """
    jobs = args.get('jobs') or []
    if not jobs:
        return {"success": False, "message": "No jobs provided ('jobs' list is empty)."}
    seen = set()
    job_ids = [j for j in jobs if not (j in seen or seen.add(j))]

    manual_vectors = {str(k): list(v) for k, v in (args.get('manual_vectors') or {}).items()}
    conditions = {str(k): list(v) for k, v in (args.get('conditions') or {}).items()}
    inline_frags = args.get('fragments') or {}

    job_log_rows = fetch_job_log(job_ids)
    pcr_frags = dict(inline_frags)
    # DB fragment tables (Phase 5) take PRIORITY over inline rows when present,
    # mirroring the pilot where the DB is the source. Inline rows fill the gaps.
    db_pcr = fetch_pcr_fragments(job_ids)
    for k, v in db_pcr.items():
        pcr_frags[k] = v
    idt_frags = fetch_idt_fragments(job_ids)

    try:
        vector_res, vector_len, digested = load_vector_lookups()
        final_rows, manual_set = build_ligation_rows(
            job_ids, job_log_rows, pcr_frags, idt_frags, manual_vectors, conditions,
        )
    except LayoutError as e:
        return {"success": False, "message": str(e)}

    # Output: file path (parity runs) and/or base64 (download path).
    date = args.get('date')  # iso 'YYYY-MM-DD' (parity replays); default today
    if date:
        as_of = datetime.date.fromisoformat(date)
    else:
        as_of = datetime.date.today()
    output_arg = args.get('output_path')
    output_path = (
        __import__('pathlib').Path(output_arg)
        if output_arg
        else __import__('pathlib').Path('_layouts_out') / default_filename('Ligation', 'ER', as_of)
    )

    rows_written = write_layout(
        final_rows, pcr_frags, idt_frags, digested, vector_res, vector_len,
        conditions, manual_set, LIGATION_TEMPLATE, output_path,
    )

    res = {
        'success': True,
        'filename': output_path.name,
        'output_path': str(output_path),
        'rows_written': rows_written,
        'warnings': [],
    }
    for jid in job_ids:
        if not (pcr_frags.get(jid) or idt_frags.get(jid)):
            res['warnings'].append(f'{jid}: no fragment rows — insert columns will be blank.')
    if args.get('return_base64', True):
        with open(output_path, 'rb') as f:
            res['excel_base64'] = base64.b64encode(f.read()).decode('utf-8')
    return res


# ---------------------------------------------------------------------------
# Primer log import (Phase 5 groundwork)
# ---------------------------------------------------------------------------

PRIMER_SCHEMA_COLS = {
    'job_id': 'TEXT',
    'primer_count': 'TEXT',
    'bbid': 'TEXT',
    'primer_pair': 'TEXT',
}


def import_primer_log(args: dict) -> dict:
    """Bridge action: Primer Log 'input addon' -> primers table (drop+recreate)."""
    xlsx_path = args.get('xlsx_path', PRIMER_LOG_DEFAULT)
    sheet = args.get('sheet', 'input addon')
    dry_run = bool(args.get('dry_run', True))
    commit = bool(args.get('commit', False))

    if not os.path.isfile(xlsx_path):
        return {"success": False, "message": f"File not found: {xlsx_path!r}"}

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    rows = []
    try:
        if sheet not in wb.sheetnames:
            return {"success": False, "message": f'Sheet {sheet!r} not found. Available: {wb.sheetnames[:12]}...'}
        ws = wb[sheet]
        for row in ws.iter_rows(min_row=2, values_only=True):
            job_id = str(row[0]).strip() if row and row[0] is not None else ''
            if not job_id:
                continue
            # pilot mapping: col A -> col K (index 10), ' Colony PCR primers'
            primer = str(row[10]).strip() if len(row) > 10 and row[10] is not None else ''
            bbid = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ''
            pcount = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ''
            rows.append({
                'job_id': job_id,
                'primer_count': pcount,
                'bbid': bbid,
                'primer_pair': primer,
            })
    finally:
        wb.close()

    if dry_run or not commit:
        return {
            'success': True,
            'dry_run': True,
            'rows_found': len(rows),
            'with_primer_pair': sum(1 for r in rows if r['primer_pair']),
            'message': f'Dry-run: {len(rows)} rows found. No DB writes.',
        }

    conn = db_ops.get_connection()
    try:
        cols_sql = ', '.join(f'"{n}" {t}' for n, t in PRIMER_SCHEMA_COLS.items())
        conn.execute('DROP TABLE IF EXISTS primers')
        conn.execute(f'CREATE TABLE primers ({cols_sql})')
        conn.execute('BEGIN TRANSACTION')
        placeholders = ', '.join('?' * len(PRIMER_SCHEMA_COLS))
        quoted = ', '.join(f'"{n}"' for n in PRIMER_SCHEMA_COLS)
        conn.executemany(
            f'INSERT INTO primers ({quoted}) VALUES ({placeholders})',
            [tuple(r[n] for n in PRIMER_SCHEMA_COLS) for r in rows],
        )
        conn.execute('COMMIT')
        total = conn.execute('SELECT count(*) FROM primers').fetchone()[0]
    except Exception as e:
        return {"success": False, "message": f'primers import failed (rolled back): {e}'}
    finally:
        conn.close()
    return {
        'success': True,
        'dry_run': False,
        'rows_imported': total,
        'message': f'primers recreated with {total} rows.',
    }


def fetch_primer_map(args: dict) -> dict:
    """Bridge action: {job_id: primer_pair} — prefers the primers table, falls
    back to reading the Primer Log xlsx directly."""
    conn = db_ops.get_read_connection()
    try:
        if _table_exists(conn, 'primers'):
            rows = conn.execute(
                "SELECT job_id, primer_pair FROM primers WHERE primer_pair IS NOT NULL AND primer_pair != ''"
            ).fetchall()
            return {'success': True, 'mapping': {r[0]: r[1] for r in rows}, 'source': 'primers table'}
    finally:
        conn.close()
    # direct xlsx fallback
    xlsx_path = args.get('xlsx_path') or PRIMER_LOG_DEFAULT
    if not os.path.isfile(xlsx_path):
        return {'success': False, 'message': 'primers table missing and Primer Log file not found.'}
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        ws = wb['input addon']
        mapping = {}
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and row[0] is not None and len(row) > 10 and row[10] is not None:
                mapping[str(row[0]).strip()] = str(row[10]).strip()
        return {'success': True, 'mapping': mapping, 'source': 'Primer Log xlsx'}
    finally:
        wb.close()


# ---------------------------------------------------------------------------
# Colony PCR layout (pilot ColonyPCRLayout_app.py port)
# ---------------------------------------------------------------------------

def _colonies_from_ligation_entries(entries: list) -> list:
    """Normalize ligation rows (from DuckDB or parsed file) to the summary shape:
    {JobID, BBID, Vector, Resistance, Length, Host, Temperature, SourceFile}."""
    out = []
    for e in entries:
        name = e.get('Name') or ''
        if not name or str(name).startswith('CK'):
            continue
        out.append({
            'JobID': str(name).strip(),
            'BBID': e.get('BBID') or '',
            'Vector': e.get('Vector') or ''
                      or e.get('Vector ') or '',
            'Resistance': e.get('Resistance') or '',
            'Length': e.get('Len') if e.get('Len') is not None else (e.get('Length (bp)') or ''),
            'Host': e.get('Host') or DEFAULT_HOST,
            'Temperature': e.get('Growth Condition/\\nTemperature') or e.get('Growth Condition/Temperature') or DEFAULT_TEMP,
            'SourceFile': e.get('SourceFile') or e.get('_source', ''),
        })
    return out


def _read_ligation_entries_from_db(entry_codes: list) -> list:
    """Read ligation entries (data rows) from DuckDB by index name."""
    conn = db_ops.get_read_connection()
    try:
        entries = []
        for code in entry_codes:
            idx = conn.execute(
                'SELECT id FROM ligation_index WHERE name=?', [code]
            ).fetchone()
            if not idx:
                continue
            rows = conn.execute(
                'SELECT * FROM ligation_data WHERE ligation_id=?', [idx[0]]
            ).fetchall()
            cols = [c[0] for c in conn.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='ligation_data'"
            ).fetchall()]
            for r in rows:
                entry = dict(zip(cols, r))
                entry['_source'] = os.path.splitext(code)[0]
                entries.append(entry)
        return entries
    finally:
        conn.close()


def _read_ligation_entries_from_file(xlsx_path: str, parse_file=None) -> list:
    """Read a dropped Ligation Layout file: Well(B), Name(C), BBID(D), Vector(E),
    Length(T), Resistance(U), Host(V), Temperature(W) on sheet Layout."""
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    try:
        sheet = 'Layout' if 'Layout' in wb.sheetnames else 'Plate Name'
        if sheet not in wb.sheetnames:
            return []
        ws = wb[sheet]
        header = [str(c.value) if c.value is not None else '' for c in ws[1][:23]]
        def hidx(needle):
            for i, h in enumerate(header):
                if needle.lower() in h.lower():
                    return i
            return None
        idx = {
            'Well': hidx('well'), 'Name': hidx('work no') if hidx('work no') is not None else hidx('name'),
            'BBID': hidx('bbi'), 'Vector': hidx('vector '), 'Length': hidx('length'),
            'Resistance': hidx('resistance'), 'Host': hidx('host'), 'Temp': hidx('temperature'),
        }
        src = os.path.splitext(os.path.basename(xlsx_path))[0]
        entries = []
        for row in ws.iter_rows(min_row=2, max_row=97, max_col=23, values_only=True):
            def cell(key):
                i = idx.get(key)
                return row[i] if (i is not None and i < len(row)) else None
            name = cell('Name')
            if name is None or str(name).strip() == '':
                continue
            entries.append({
                'Name': str(name).strip(),
                'BBID': str(cell('BBID')).strip() if cell('BBID') is not None else '',
                'Vector': str(cell('Vector')).strip() if cell('Vector') is not None else '',
                'Resistance': str(cell('Resistance')).strip() if cell('Resistance') is not None else '',
                'Len': str(cell('Length')) if cell('Length') is not None else '',
                'Host': str(cell('Host')).strip() if cell('Host') is not None else DEFAULT_HOST,
                'Temperature': str(cell('Temp')).strip() if cell('Temp') is not None else DEFAULT_TEMP,
                'SourceFile': src,
            })
        return entries
    finally:
        wb.close()


def set_plate_header(sheet, p_num, now=None):
    """Plate header '{year_char}{MMDD}ColonyPCR-P{p}' in A1, bold (pilot port).
    year_char = chr(now.year - 1941): 2026 -> 'U'."""
    now = now or datetime.datetime.now()
    year_char = chr(now.year - 1941)
    cell = sheet['A1']
    cell.value = f'{year_char}{now.strftime("%m%d")}ColonyPCR-P{p_num}'
    cell.font = Font(bold=True)


def apply_range_borders(sheet, start_row, start_col, end_row, end_col, border_style='thin'):
    """Pilot port: thin interior, thick optional outline."""
    side = Side(style=border_style)
    inner_side = Side(style='thin') if border_style == 'thick' else side
    for r in range(start_row, end_row + 1):
        for c in range(start_col, end_col + 1):
            cell = sheet.cell(row=r, column=c)
            is_top, is_bottom = r == start_row, r == end_row
            is_left, is_right = c == start_col, c == end_col
            cell.border = Border(
                left=side if is_left else inner_side,
                right=side if is_right else inner_side,
                top=side if is_top else inner_side,
                bottom=side if is_bottom else inner_side,
            )


def write_samples_table(sheet, data_rows, start_row=13):
    """Samples table (headers B13, unique jobs; pilot column set)."""
    seen = set()
    uniq = []
    for row in data_rows:
        jid = row['JobID']
        if jid in seen:
            continue
        seen.add(jid)
        uniq.append(row)

    headers = ['JobID', 'BBID', 'Vector', 'Resistance', 'Primers', 'Length', 'Host', 'Temperature']
    for r in range(start_row, max(start_row + 1 + len(uniq) + 2, sheet.max_row + 1)):
        for c in range(2, 10):
            sheet.cell(row=r, column=c).value = None

    for c_idx, header in enumerate(headers, 1):
        cell = sheet.cell(row=start_row, column=c_idx + 1, value=header)
        cell.font = Font(bold=True)

    for r_idx, row in enumerate(uniq, start_row + 1):
        for c_idx, col in enumerate(headers, 1):
            sheet.cell(row=r_idx, column=c_idx + 1, value=row.get(col, ''))

    if uniq:
        end_row = start_row + len(uniq)
        apply_range_borders(sheet, start_row, 2, end_row, 9, border_style='thin')
    return start_row + len(uniq) + 1


def write_mix_calculation_table(sheet, plate_jobs, summary_rows, clone_counts, start_row=13):
    """Mix calc table per unique primer on the plate (pilot numbers)."""
    plate_summary = [r for r in summary_rows if r['JobID'] in plate_jobs]
    unique_primers = []
    for r in plate_summary:
        p = r.get('Primers') or ''
        if p and p not in unique_primers:
            unique_primers.append(p)

    sheet.cell(row=start_row, column=2, value='Mix Calculation').font = Font(bold=True)
    sheet.cell(row=start_row + 1, column=2, value='Taq')
    sheet.cell(row=start_row + 2, column=2, value='H2O')
    sheet.cell(row=start_row + 3, column=2, value='Fwd')
    sheet.cell(row=start_row + 4, column=2, value='Rev')

    current_mix_col = 3
    for primer_pair in unique_primers:
        jobs_with = {r['JobID'] for r in plate_summary if r.get('Primers') == primer_pair}
        n = sum(cnt for (job, _src), cnt in clone_counts.items() if job in jobs_with)
        if n > 0:
            sheet.cell(row=start_row, column=current_mix_col, value=primer_pair).font = Font(bold=True)
            sheet.cell(row=start_row + 1, column=current_mix_col, value=10 * (n + 1))
            sheet.cell(row=start_row + 2, column=current_mix_col, value=8.4 * (n + 1))
            sheet.cell(row=start_row + 3, column=current_mix_col, value=0.8 * (n + 1))
            sheet.cell(row=start_row + 4, column=current_mix_col, value=0.8 * (n + 1))
            current_mix_col += 1

    if current_mix_col > 3:
        apply_range_borders(sheet, start_row, 2, start_row + 4, current_mix_col - 1, border_style='thin')


def generate_labels_sheet(workbook, summary_rows, clone_counts, now=None):
    """Labels sheet (pilot port: static values; 'ColoPCR' spelling kept)."""
    if 'Label' in workbook.sheetnames:
        del workbook['Label']
    label_ws = workbook.create_sheet('Label')
    headers = ['Date', 'PRINTED', 'ITEM #', 'SIZE', 'QTY', 'LOT#1', 'PERSON', 'REASSAY DATE', 'LOT#2']
    label_ws.append(headers)

    now = now or datetime.datetime.now()
    date_str = now.strftime('%m-%d-%Y')
    year_char = chr(now.year - 1941)
    colopcr_date_code = f'{year_char}{now.strftime("%m%d")}'

    for job_row in summary_rows:
        job_id = job_row['JobID']
        ligation_filename = job_row['SourceFile']
        if clone_counts.get((job_id, ligation_filename), 0) == 0:
            continue
        item_num = f'{job_id}-ColoPCR'
        lot1 = f'{colopcr_date_code}-{item_num}-FL'
        basename = os.path.splitext(ligation_filename)[0]
        if basename.upper().endswith('-FL'):
            basename = basename[:-3]
        lot2 = f'{basename}._.{colopcr_date_code}-ColoPCR._.{job_id}'
        label_ws.append([date_str, None, item_num, '2x1', 1, lot1, None, None, lot2])

    for col in label_ws.columns:
        max_length = max((len(str(c.value)) for c in col if c.value is not None), default=0)
        label_ws.column_dimensions[col[0].column_letter].width = max_length + 2


def apply_thick_border_to_range(sheet, start_row_idx, start_col_idx, end_row_idx, end_col_idx, clone_count=None):
    """Pilot port: thick outline around a clone group (L-shaped for partial
    columns in uneven groups)."""
    thick_side = Side(style='thick')
    thin_side_inner = Side(style='thin')

    excel_start_row = start_row_idx + 3
    excel_end_row = end_row_idx + 3
    excel_start_col = start_col_idx + 2
    excel_end_col = end_col_idx + 2

    num_columns = end_col_idx - start_col_idx + 1
    use_l_shaped = False
    filled_cells = set()

    if clone_count is not None and num_columns > 1:
        cur_row, cur_col = start_row_idx, start_col_idx
        for _ in range(clone_count):
            filled_cells.add((cur_row, cur_col))
            cur_row += 1
            if cur_row >= 8:
                cur_row = 0
                cur_col += 1
        cells_in_first_cols = (num_columns - 1) * 8
        remaining_in_last_col = clone_count - cells_in_first_cols
        available_in_first_col = 8 - start_row_idx
        if clone_count > available_in_first_col:
            remaining_after_first = clone_count - available_in_first_col
            remaining_in_last_col = remaining_after_first % 8
        if 0 < remaining_in_last_col < 8:
            use_l_shaped = True

    for r in range(excel_start_row, excel_end_row + 1):
        for c in range(excel_start_col, excel_end_col + 1):
            cell = sheet.cell(row=r, column=c)
            plate_row, plate_col = r - 3, c - 2
            if use_l_shaped:
                if (plate_row, plate_col) not in filled_cells:
                    cell.border = Border(top=thin_side_inner, bottom=thin_side_inner,
                                         left=thin_side_inner, right=thin_side_inner)
                    continue
                cell.border = Border(
                    top=thick_side if (plate_row - 1, plate_col) not in filled_cells else thin_side_inner,
                    bottom=thick_side if (plate_row + 1, plate_col) not in filled_cells else thin_side_inner,
                    left=thick_side if plate_col - 1 < start_col_idx or (plate_row, plate_col - 1) not in filled_cells else thin_side_inner,
                    right=thick_side if (plate_row, plate_col + 1) not in filled_cells else thin_side_inner,
                )
            else:
                cell.border = Border(
                    top=thick_side if r == excel_start_row else thin_side_inner,
                    bottom=thick_side if r == excel_end_row else thin_side_inner,
                    left=thick_side if c == excel_start_col else thin_side_inner,
                    right=thick_side if c == excel_end_col else thin_side_inner,
                )


def build_colony_pcr_layout(args: dict) -> dict:
    """Bridge action: Colony PCR layout from ligation entries (pilot port).

    Input: { ligation_entry_codes?: [name,...], ligation_xlsx_path?: str,
    clones?: {job_id: n} (default 4, skips 0), primer_map provided via the
    primers table or primer_log_path, initials?, now? (iso datetime for
    parity replays), output_path? } Returns { success, excel_base64,
    filename, plates }.
    """
    now = datetime.datetime.fromisoformat(args['now']) if args.get('now') else datetime.datetime.now()

    # --- Source ligation rows: DB entries or dropped file ---
    if args.get('ligation_xlsx_path'):
        entries = _read_ligation_entries_from_file(args['ligation_xlsx_path'])
        if not entries:
            return {"success": False, "message": "No ligation rows found in the provided file."}
    else:
        codes = args.get('ligation_entry_codes') or []
        if not codes:
            return {"success": False, "message": "Provide ligation_entry_codes or ligation_xlsx_path."}
        entries = _read_ligation_entries_from_db(codes)

    pl_path = args.get('primer_log_path')
    pm = fetch_primer_map({'xlsx_path': pl_path} if pl_path else {})
    primer_map = pm.get('mapping', {}) if pm.get('success') else {}

    summary_rows = _colonies_from_ligation_entries(entries)
    for r in summary_rows:
        r['Primers'] = primer_map.get(r['JobID'], '')

    clones_arg = args.get('clones') or {}
    clone_counts = {}
    for r in summary_rows:
        n = int(clones_arg.get(r['JobID'], args.get('default_clones', 4)))
        clone_counts[(r['JobID'], r['SourceFile'])] = n
    summary_rows = [r for r in summary_rows if clone_counts[(r['JobID'], r['SourceFile'])] > 0]
    if not summary_rows:
        return {"success": False, "message": "No clones selected (all counts are 0)."}

    # --- Load template ---
    wb = openpyxl.load_workbook(COLONY_TEMPLATE)
    ws = wb[wb.sheetnames[0]]
    ws.title = 'Plate 1'
    set_plate_header(ws, 1, now)
    template_plate = wb['Plate 1']

    thin_border = Border(left=Side(style='thin'), right=Side(style='thin'),
                         top=Side(style='thin'), bottom=Side(style='thin'))
    for r in range(3, 11):
        for c in range(2, 14):
            cell = ws.cell(row=r, column=c)
            cell.value = None
            cell.border = thin_border

    current_row = 0
    current_col = 0
    primers_in_current_col = None
    plate_number = 1
    plate_job_ids: set = set()

    def close_current_plate():
        nonlocal ws
        plate_summary = [r for r in summary_rows if r['JobID'] in plate_job_ids]
        samples_end = write_samples_table(ws, plate_summary)
        write_mix_calculation_table(ws, plate_job_ids, summary_rows, clone_counts,
                                    start_row=samples_end + 1)

    def advance_plate():
        nonlocal ws, plate_number, current_col, current_row, plate_job_ids, primers_in_current_col
        close_current_plate()
        plate_number += 1
        current_col, current_row = 0, 0
        ws = wb.copy_worksheet(template_plate)
        ws.title = f'Plate {plate_number}'
        set_plate_header(ws, plate_number, now)
        for r in range(3, 11):
            for c in range(2, 14):
                cell = ws.cell(row=r, column=c)
                cell.value = None
                cell.border = thin_border
                cell.font = Font()
        plate_job_ids = set()
        primers_in_current_col = None

    # --- Fill grid (pilot well order + column-block rules) ---
    for job_row in sorted(summary_rows, key=lambda r: str(r['Vector'])):
        job_id = job_row['JobID']
        primers = job_row['Primers']
        num_clones = clone_counts[(job_id, job_row['SourceFile'])]

        starts_in_new_col = (
            (current_row > 0 and primers_in_current_col is not None and primers != primers_in_current_col)
            or (current_row + num_clones > 8 and current_row > 0)
        )
        if (current_col + (1 if starts_in_new_col else 0)) >= 12:
            advance_plate()

        new_col_needed = (
            (current_row > 0 and primers_in_current_col is not None and primers != primers_in_current_col)
            or (current_row + num_clones > 8 and current_row > 0)
        )
        if new_col_needed:
            current_col += 1
            current_row = 0
            primers_in_current_col = None

        group_start_row, group_start_col = current_row, current_col
        group_end_col = current_col

        for i in range(1, num_clones + 1):
            if current_row >= 8:
                current_col += 1
                current_row = 0
                primers_in_current_col = None
                group_end_col = current_col
            if current_col >= 12:
                advance_plate()
            if current_row == 0 and primers_in_current_col is None:
                primers_in_current_col = primers
            ws.cell(row=current_row + 3, column=current_col + 2, value=f'{job_id}-Clone{i}')
            plate_job_ids.add(job_id)
            current_row += 1

        apply_thick_border_to_range(ws, group_start_row, group_start_col,
                                    current_row - 1, group_end_col, clone_count=num_clones)

    # --- Controls (CK+ then CK-) ---
    control_start_row, control_start_col = current_row, current_col
    for control in ['CK+', 'CK-']:
        if current_row >= 8:
            current_col += 1
            current_row = 0
        if current_col >= 12:
            advance_plate()
        ws.cell(row=current_row + 3, column=current_col + 2, value=control)
        current_row += 1
    if current_row > control_start_row:
        apply_thick_border_to_range(ws, control_start_row, control_start_col,
                                    current_row - 1, control_start_col)

    close_current_plate()

    # column widths + labels
    for sheet in wb.worksheets:
        if sheet.title.startswith('Plate'):
            for col_idx in range(2, 14):
                sheet.column_dimensions[get_column_letter(col_idx)].width = 25

    generate_labels_sheet(wb, summary_rows, clone_counts, now)

    output_arg = args.get('output_path')
    if output_arg:
        out_path = __import__('pathlib').Path(output_arg)
    else:
        out_name = f"{chr(now.year - 1941)}{now.strftime('%m%d')}-ColonyPCR-{resolve_initials(args.get('username'), fallback=args.get('initials') or 'ER')}.xlsx"
        out_path = __import__('pathlib').Path('_layouts_out') / out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)

    res = {
        'success': True,
        'filename': out_path.name,
        'output_path': str(out_path),
        'plates': plate_number,
        'excel_base64': base64.b64encode(open(out_path, 'rb').read()).decode('utf-8'),
    }
    return res


# ---------------------------------------------------------------------------
# Extraction layout (Phase 4 §4 — no pilot script; parser round-trip contract)
# ---------------------------------------------------------------------------

EXTRACTION_ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']


def build_extraction_layout(args: dict) -> dict:
    """Bridge action: Extraction Log xlsx from colony PCR positives.

    Input: { source_entry_code: colony PCR entry name (positives table) } or
    { wells: ['A1', ...] } directly; now? (parity), output_path?.
    Fills two 48-well halves (B5:G12 / J5:O12 on 'Layout') in well order.
    Round-trips dna_extraction.py (C1-6 plate1, C7-12 plate2 conventions).
    """
    now = datetime.datetime.fromisoformat(args['now']) if args.get('now') else datetime.datetime.now()

    wells: list = []
    if args.get('wells'):
        wells = [str(w).strip().upper() for w in args['wells'] if str(w).strip()]
    elif args.get('source_entry_code'):
        code = args['source_entry_code']
        conn = db_ops.get_read_connection()
        try:
            idx = conn.execute('SELECT id FROM colony_pcr_index WHERE name=?', [code]).fetchone()
            if not idx:
                return {"success": False, "message": f"Colony PCR entry {code!r} not found."}
            pos = conn.execute(
                'SELECT plate_id, well FROM colony_pcr_positives WHERE colony_pcr_id=? '
                'ORDER BY plate_id, well', [idx[0]]
            ).fetchall()
        finally:
            conn.close()
        # Well order: plate1 wells (A1..H6) then plate2 (A1..H6); map plate2
        # wells 1-6 to columns 7-12 (the shared 12-col row layout).
        def well_key(pw):
            p, w = pw
            row, col = w[0], int(w[1:])
            return (row, (col if p == 1 else col + 6))
        wells = [w for _, w in sorted(pos, key=well_key)]
    else:
        return {"success": False, "message": "Provide source_entry_code or wells."}

    if not wells:
        return {"success": False, "message": "No positive wells found to fill."}
    if len(wells) > 96:
        return {"success": False, "message": f"Too many wells ({len(wells)}) — two 48-well plates max."}

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Layout'
    year_char = chr(now.year - 1941)
    ws['A1'] = f'{year_char}{now.strftime("%m%d")}-Extraction'
    ws['A1'].font = Font(bold=True)

    # Plate-half label blocks (matching the real-file grid origin B5/J5)
    for half in (0, 1):
        origin_col = 2 + half * 8  # B or J
        for i in range(8):
            ws.cell(row=5 + i, column=origin_col - 1, value=EXTRACTION_ROW_LABELS[i])
        for j in range(6):
            ws.cell(row=4, column=origin_col + j, value=j + 1)

    filled = 0
    for well_name in wells:
        m = re.match(r'^([A-H])(\d{1,2})$', well_name)
        if not m:
            continue
        row_label, col_num = m.group(1), int(m.group(2))
        if 1 <= col_num <= 6:
            exc_row, exc_col = 5 + EXTRACTION_ROW_LABELS.index(row_label), 2 + col_num - 1
        elif 7 <= col_num <= 12:
            exc_row, exc_col = 5 + EXTRACTION_ROW_LABELS.index(row_label), 10 + (col_num - 7)
        else:
            continue
        ws.cell(row=exc_row, column=exc_col, value=well_name)
        filled += 1

    output_arg = args.get('output_path')
    if output_arg:
        out_path = __import__('pathlib').Path(output_arg)
    else:
        out_path = __import__('pathlib').Path('_layouts_out') / (
            f"{year_char}{now.strftime('%m%d')}-Extraction-{resolve_initials(args.get('username'), fallback=args.get('initials') or 'ER')}.xlsx"
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)

    return {
        'success': True,
        'filename': out_path.name,
        'output_path': str(out_path),
        'wells_filled': filled,
        'wells': wells,
        'excel_base64': base64.b64encode(open(out_path, 'rb').read()).decode('utf-8'),
    }