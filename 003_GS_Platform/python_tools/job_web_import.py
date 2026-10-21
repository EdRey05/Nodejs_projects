"""P8 job web importers — all FK-wired to job_log (the spine).

Ed's operating rules (2026-10-04):
- job_log AS ALREADY IMPORTED (262 WOs) is the spine / job log truth.
- Subset rule: rows without a resolvable work_no are EXCLUDED and reported,
  never inserted. This is what keeps "start to end" coherent samples only.
- job_log_rows = SQL VIEW over job_log (no separate table).
- Dry-run default; real writes only behind explicit consent + fresh backup.
- Table shapes follow the canonical pilot pipeline (Databases/03_import_fragments.py
  + Workflows/ligation_layout.py):
    idt_fragments(idt_plate, work_no, position, reference_nbr, purity_pass,
                  yield_pass, sequence, insert_length_bp)
    pcr_fragments(work_no, plasmid_no, reference_nbr, purity_pass, yield_pass,
                  sequence, insert_length_bp, concentration)
  ligation_layout.fetch_idt_fragments/fetch_pcr_fragments reads these exact
  columns, so fragments wire straight into layout generation.
- Per-import single transaction; natural-key dedupe; re-run = skip, not duplicate.
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime

import openpyxl

from db_ops import get_connection, run_query
from seq_import import _insert_rows_plain

PILOT = r'C:/Users/Administrator/Desktop/ERA_BioAutomations/Gene_Synthesis_Agent/Tasks/Pending/Gene_Synthesis_Platform/2026_pilot'
PRIMER_LOG = PILOT + '/Original_data/Primer Log v3.xlsx'
IDT_LOG = PILOT + '/Original_data/Summary IDT Log v2.xlsx'
SHIPMENT_QC = PILOT + '/Original_data/12-Shipment prep and QC/Shipment and QC Log.xlsx'
REF_FILES_DIR = PILOT + '/Original_data/07-Sequencing reference files/Completed projects'
INVENTORY_GROUPS = {
    '05-liquid_handler': PILOT + '/Original_data/05-Liquid Handler transfers',
    '08-sequencing_files': PILOT + '/Original_data/08-Sequencing Files',
    '09-sorted_sequencing': PILOT + '/Original_data/09-Sorted sequencing',
    '13-labels': PILOT + '/Original_data/13-Labels',
    '14-qc_gel_images': PILOT + '/Original_data/14-QC gel images',
    '15-qc_files': PILOT + '/Original_data/15-QC files',
}

WO_RE = re.compile(r'^[A-Z]{2}[0-9A-Z]{5,}$')


def _norm(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _norm_num(v):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return None


def _norm_int(v):
    n = _norm_num(v)
    return int(n) if n is not None else None


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1 << 16)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


TABLE_DDL = {
    'idt_fragments': '''(
        idt_plate TEXT,
        work_no TEXT,
        position TEXT,
        reference_nbr TEXT,
        purity_pass TEXT,
        yield_pass TEXT,
        sequence TEXT,
        insert_length_bp INTEGER
    )''',
    'pcr_fragments': '''(
        work_no TEXT,
        plasmid_no TEXT,
        reference_nbr TEXT,
        purity_pass TEXT,
        yield_pass TEXT,
        sequence TEXT,
        insert_length_bp INTEGER,
        concentration DOUBLE
    )''',
    'primer_input_addon': '''(
        job_id TEXT,
        primer_count TEXT,
        bbi_id TEXT,
        customer_id TEXT,
        vector TEXT,
        re TEXT,
        length_bp TEXT,
        insert_seq TEXT,
        final_vector TEXT,
        colony_pcr_primers TEXT,
        amplification_primers TEXT,
        obsolete BOOLEAN
    )''',
    'reference_files': '''(
        gene_name TEXT,
        path TEXT,
        length_bp INTEGER,
        sha256 TEXT,
        imported_at TEXT
    )''',
    'file_inventory': '''(
        folder_group TEXT,
        relative_path TEXT,
        ext TEXT,
        size_bytes BIGINT
    )''',
    'shipment_rows': '''(
        job_id TEXT,
        prep_date TEXT,
        bbi_id TEXT,
        vector_no TEXT,
        tube_location TEXT,
        ng_ul TEXT,
        ul_higher TEXT,
        ul_lower TEXT,
        ul_transferred TEXT,
        max_ul TEXT,
        min_ul TEXT,
        ul_used TEXT,
        ul_left TEXT,
        notes TEXT
    )''',
    'qc_rows': '''(
        job_id TEXT,
        qc_date TEXT,
        bbi_id TEXT,
        clone TEXT,
        location TEXT,
        ng_ul TEXT,
        re_extracted TEXT,
        digestion TEXT,
        buffer TEXT,
        expected_bands TEXT,
        notes TEXT,
        image_name TEXT
    )'''}


def ensure_job_web_objects():
    """Create canonical pilot-named P8 tables + the job_log_rows view.

    Canonical names follow the pilot pipeline (Workflows/ligation_layout.py reads
    `job_log`, `idt_fragments`, `pcr_fragments` literally), so they are created
    with raw DDL instead of db_init's {log_type}_{table} prefixing.
    """
    conn = get_connection()
    try:
        for name, cols in TABLE_DDL.items():
            conn.execute(f'CREATE TABLE IF NOT EXISTS {name} {cols}')
        conn.execute(
            'CREATE OR REPLACE VIEW job_log_rows AS '
            'SELECT rowid AS jt_rowid, * FROM job_log'
        )
        # FK join helper: suffix variants (XP1610045A) resolve to their spine
        # base (XP1610045); non-spine keys (old families) resolve NULL.
        conn.execute(
            'CREATE OR REPLACE MACRO spine_of(k) AS '
            'CASE '
            'WHEN k IS NULL THEN NULL '
            'WHEN EXISTS (SELECT 1 FROM job_log g WHERE g.work_no = k) THEN k '
            'WHEN EXISTS (SELECT 1 FROM job_log g WHERE g.work_no = left(k, length(k)-1)) '
            'THEN left(k, length(k)-1) '
            'ELSE NULL END'
        )
    finally:
        conn.close()
    return {'tables': list(TABLE_DDL.keys()), 'view': 'job_log_rows',
            'macro': 'spine_of'}


def _spine(conn):
    return {r[0] for r in conn.execute('SELECT work_no FROM job_log').fetchall()}


def _base_candidates(name):
    """Suffix-stripped job-root candidates for resolution.
    XP1470055B1 -> {XP1470055B1, XP1470055, XP1470055B}
    XP1460032A  -> {XP1460032A, XP1460032}
    BATCH 2592-01 -> {BATCH 2592}
    'XP1610021+pUC57-Amp' -> also tries 'XP1610021' (stems carry vector suffixes)."""
    if not name:
        return []
    n = name.strip()
    m = re.match(r'^(BATCH\s+\d+)', n)
    if m:
        return [m.group(1)]
    n = n.split(' + ')[0].split('+')[0].strip()
    cands = {n}
    n2 = re.sub(r'[A-Z]\d{1,2}$', '', n)
    if n2:
        cands.add(n2)
        n3 = re.sub(r'[A-Z]$', '', n2)
        if n3:
            cands.add(n3)
    n4 = re.sub(r'[A-Z]$', '', n)
    if n4:
        cands.add(n4)
    return sorted(cands)


def _resolves_to_spine(name, spine):
    """Exact hit first, then suffix-stripped base (subset rule)."""
    if not name:
        return False
    if name in spine:
        return True
    return any(c in spine for c in _base_candidates(name))


# ============================================================ IDT fragments
def _sniff_idt_sheet(ws):
    """Classify a Summary IDT Log sheet: 'sg_return' (Position|ReferenceNbr|
    Gene Name|Purity|Yield|Sequence), 'order_plate' (Well Position|Name|Sequence
    or bare Name|Sequence like S0509), 'legacy' (headerless: name token col A +
    sequence col C), or None (only if there is no data at all)."""
    rows = list(ws.iter_rows(min_row=1, max_row=2, values_only=True))
    if not rows:
        return None
    cells = [str(v).strip().lower() if v is not None else '' for v in rows[0]]
    if any(c.startswith('reference') for c in cells) and any('gene name' in c for c in cells):
        return 'sg_return'
    if any(c.startswith('well position') for c in cells) or any(c.startswith('position') for c in cells):
        return 'order_plate'
    if any(c == 'name' for c in cells) and any(c == 'sequence' for c in cells):
        return 'order_plate'
    r1 = [str(v).strip() if v is not None else '' for v in rows[0][:4]]
    if r1[0] and 'position' not in r1[0].lower():
        return 'legacy'
    return None


def import_idt(args: dict) -> dict:
    """Import Summary IDT Log v2.xlsx -> idt_fragments + pcr_fragments.

    - sg_return / order_plate / legacy sheets -> idt_fragments (sheet=idt_plate,
      kind column says which layout).
    - 'PCR Fragments' sheet -> pcr_fragments (plasmid_no = Position col,
      concentration included) per the canonical pilot mapping.
    - 'Pending Task' = exception log: counted, reported, not imported.
    - Subset rule: gene/work name must resolve to job_log.work_no
      (exact or suffix-stripped base). Everything else excluded + reported.
    """
    xlsx = args.get('xlsx_path') or IDT_LOG
    dry_run = bool(args.get('dry_run', True))

    counts = {'sheets': 0, 'unrecognized': 0, 'idt_rows': 0, 'pcr_rows': 0,
              'excluded': 0, 'dupes': 0, 'pending_rows': 0,
              'inserted_idt': 0, 'inserted_pcr': 0}
    sheet_report = []
    excluded_samples = []

    conn = None
    try:
        conn = get_connection()
        spine = _spine(conn)
        wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)

        existing_idt = {(r[0], r[1], r[2]) for r in conn.execute(
            'SELECT idt_plate, position, work_no FROM idt_fragments').fetchall()}
        existing_pcr = {(r[0], r[1]) for r in conn.execute(
            'SELECT work_no, plasmid_no FROM pcr_fragments').fetchall()}

        idt_rows = []
        pcr_rows = []
        if not dry_run:
            conn.execute('BEGIN TRANSACTION')

        for sn in wb.sheetnames:
            ws = wb[sn]
            if sn == 'PCR Fragments':
                kind = 'pcr'
            elif sn == 'Pending Task':
                kind = 'pending'
            else:
                kind = _sniff_idt_sheet(ws)
            if kind is None:
                counts['unrecognized'] += 1
                sheet_report.append({'sheet': sn, 'kind': None, 'status': 'failed',
                                     'message': 'unrecognized layout'})
                continue
            counts['sheets'] += 1
            kept = dropped = dups = 0
            for row in ws.iter_rows(min_row=2, values_only=True):
                vals = list(row)
                if kind == 'pcr':
                    # Position(A)=plasmid_no | ReferenceNbr(B) | Gene Name(C)=work_no
                    # | Purity(D) | Yield(E) | Sequence(F) | Concentration(G)
                    work_no = _norm(vals[2] if len(vals) > 2 else None)
                    if work_no is None:
                        continue
                    counts['pcr_rows'] += 1
                    if not _resolves_to_spine(work_no, spine):
                        dropped += 1
                        counts['excluded'] += 1
                        if len(excluded_samples) < 40:
                            excluded_samples.append({'sheet': sn, 'name': work_no,
                                                     'reason': 'no spine match'})
                        continue
                    plasmid_no = _norm(vals[0] if len(vals) > 0 else None)
                    key = (work_no, plasmid_no)
                    if key in existing_pcr:
                        dups += 1
                        counts['dupes'] += 1
                        continue
                    existing_pcr.add(key)
                    seq = _norm(vals[5] if len(vals) > 5 else None)
                    pcr_rows.append({
                        'work_no': work_no, 'plasmid_no': plasmid_no,
                        'reference_nbr': _norm(vals[1] if len(vals) > 1 else None),
                        'purity_pass': _norm(vals[3] if len(vals) > 3 else None),
                        'yield_pass': _norm(vals[4] if len(vals) > 4 else None),
                        'sequence': seq,
                        'insert_length_bp': _norm_int(len(seq)) if seq else None,
                        'concentration': _norm_num(vals[6] if len(vals) > 6 else None),
                    })
                    kept += 1
                elif kind == 'pending':
                    if any(_norm(v) for v in vals[:7]):
                        counts['pending_rows'] += 1
                    continue
                else:
                    if kind == 'sg_return':
                        # Position | ReferenceNbr | Gene Name | Purity | Yield | Sequence
                        position = _norm(vals[0] if len(vals) > 0 else None)
                        reference_nbr = _norm(vals[1] if len(vals) > 1 else None)
                        work_no = _norm(vals[2] if len(vals) > 2 else None)
                        purity = _norm(vals[3] if len(vals) > 3 else None)
                        yld = _norm(vals[4] if len(vals) > 4 else None)
                        seq = _norm(vals[5] if len(vals) > 5 else None)
                    elif kind == 'order_plate':
                        # Well Position | Name | Sequence | (len)
                        position = _norm(vals[0] if len(vals) > 0 else None)
                        work_no = _norm(vals[1] if len(vals) > 1 else None)
                        reference_nbr = None
                        purity = None
                        yld = None
                        seq = _norm(vals[2] if len(vals) > 2 else None)
                    else:  # legacy: name | (frag label) | sequence | (len)
                        work_no = _norm(vals[0] if len(vals) > 0 else None)
                        position = None
                        reference_nbr = None
                        purity = None
                        yld = None
                        seq = _norm(vals[2] if len(vals) > 2 else None)
                    if work_no is None:
                        continue
                    counts['idt_rows'] += 1
                    if not _resolves_to_spine(work_no, spine):
                        dropped += 1
                        counts['excluded'] += 1
                        if len(excluded_samples) < 40:
                            excluded_samples.append({'sheet': sn, 'name': work_no,
                                                     'reason': 'no spine match'})
                        continue
                    key = (sn, position, work_no)
                    if key in existing_idt:
                        dups += 1
                        counts['dupes'] += 1
                        continue
                    existing_idt.add(key)
                    idt_rows.append({
                        'idt_plate': sn, 'work_no': work_no, 'position': position,
                        'reference_nbr': reference_nbr, 'purity_pass': purity,
                        'yield_pass': yld, 'sequence': seq,
                        'insert_length_bp': len(seq) if seq else None,
                    })
                    kept += 1
            sheet_report.append({'sheet': sn, 'kind': kind, 'kept': kept,
                                 'dropped_no_spine': dropped, 'dupes': dups})

        if not dry_run:
            if idt_rows:
                _insert_rows_plain(conn, 'idt_fragments', idt_rows)
                counts['inserted_idt'] = len(idt_rows)
            if pcr_rows:
                _insert_rows_plain(conn, 'pcr_fragments', pcr_rows)
                counts['inserted_pcr'] = len(pcr_rows)
            conn.execute('COMMIT')
        wb.close()

        return {'success': True, 'dry_run': dry_run, 'counts': counts,
                'sheets': sheet_report, 'excluded_samples': excluded_samples}
    except Exception as e:
        if conn is not None:
            try:
                conn.execute('ROLLBACK')
            except Exception:
                pass
        return {'success': False, 'error': str(e), 'counts': counts}
    finally:
        if conn is not None:
            conn.close()


# ============================================================ Primer input addon
def _read_sheet_rows(ws, start_row):
    out = []
    for row in ws.iter_rows(min_row=start_row, values_only=True):
        if any(v is not None and str(v).strip() for v in row):
            out.append(list(row))
    return out


def _cell(row, i):
    return _norm(row[i]) if len(row) > i else None


def import_primer_addon(args: dict) -> dict:
    """Import Primer Log 'input addon' (19 job rows) + 'Obsolete input
    addon(completed)' (1,560 historical rows) -> primer_input_addon.

    JobID-keyed; FK = job_id -> job_log.work_no (subset rule:
    unresolvable JobIDs excluded + reported). obsolete flag marks rows from the
    completed sheet. Dedupe by (job_id, obsolete)."""
    xlsx = args.get('xlsx_path') or PRIMER_LOG
    dry_run = bool(args.get('dry_run', True))

    counts = {'current': 0, 'completed': 0, 'excluded': 0, 'dupes': 0,
              'inserted': 0}
    excluded_samples = []

    conn = None
    try:
        conn = get_connection()
        spine = _spine(conn)
        wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)

        existing = {(r[0], r[1]) for r in conn.execute(
            'SELECT job_id, obsolete FROM primer_input_addon').fetchall()}
        rows_to_insert = []
        if not dry_run:
            conn.execute('BEGIN TRANSACTION')

        for sn, obsolete_flag in [('input addon', False),
                                  ('Obsolete input addon(completed)', True)]:
            if sn not in wb.sheetnames:
                continue
            ws = wb[sn]
            kept = dropped = dups = 0
            for row in _read_sheet_rows(ws, 2):
                job_id = _cell(row, 0)
                if job_id is None:
                    continue
                if obsolete_flag:
                    counts['completed'] += 1
                else:
                    counts['current'] += 1
                if not _resolves_to_spine(job_id, spine):
                    dropped += 1
                    counts['excluded'] += 1
                    if len(excluded_samples) < 40:
                        excluded_samples.append({'sheet': sn, 'name': job_id,
                                                 'reason': 'no spine match'})
                    continue
                key = (job_id, obsolete_flag)
                if key in existing:
                    dups += 1
                    counts['dupes'] += 1
                    continue
                existing.add(key)
                rows_to_insert.append({
                    'job_id': job_id,
                    'primer_count': _cell(row, 1),
                    'bbi_id': _cell(row, 2),
                    'customer_id': _cell(row, 3),
                    'vector': _cell(row, 4),
                    're': _cell(row, 5),
                    'length_bp': _cell(row, 6),
                    'insert_seq': _cell(row, 7),
                    'final_vector': _cell(row, 8),
                    'colony_pcr_primers': _cell(row, 10),
                    'amplification_primers': _cell(row, 12),
                    'obsolete': obsolete_flag,
                })
                kept += 1

        if not dry_run:
            if rows_to_insert:
                _insert_rows_plain(conn, 'primer_input_addon', rows_to_insert)
                counts['inserted'] = len(rows_to_insert)
            conn.execute('COMMIT')
        wb.close()
        return {'success': True, 'dry_run': dry_run, 'counts': counts,
                'excluded_samples': excluded_samples}
    except Exception as e:
        if conn is not None:
            try:
                conn.execute('ROLLBACK')
            except Exception:
                pass
        return {'success': False, 'error': str(e), 'counts': counts}
    finally:
        if conn is not None:
            conn.close()


# ============================================================ Reference files
def import_reference_files(args: dict) -> dict:
    """Walk 07-Sequencing reference files/Completed projects (550 pMON*.txt)
    -> reference_files(gene_name, path, length_bp, sha256, imported_at).

    Subset rule per Ed: only files whose stem resolves to a spine work_no or a
    JobLog-Raw_Input gene name (the spine's gene_name column). Content stays on
    disk; the DB keeps metadata for /reference-files + /search."""
    ref_dir = args.get('ref_dir') or REF_FILES_DIR
    dry_run = bool(args.get('dry_run', True))

    counts = {'files': 0, 'excluded': 0, 'dupes': 0, 'inserted': 0}
    excluded_samples = []

    conn = None
    try:
        conn = get_connection()
        spine = _spine(conn)
        gene_names = {r[0] for r in conn.execute(
            'SELECT DISTINCT gene_name FROM job_log WHERE gene_name IS NOT NULL').fetchall()}
        keys = spine | gene_names

        names = sorted(os.listdir(ref_dir)) if os.path.isdir(ref_dir) else []
        existing = {r[0] for r in conn.execute(
            'SELECT gene_name FROM reference_files').fetchall()}
        rows_to_insert = []
        if not dry_run:
            conn.execute('BEGIN TRANSACTION')

        for fn in names:
            path = os.path.join(ref_dir, fn)
            if not os.path.isfile(path):
                continue
            counts['files'] += 1
            stem = os.path.splitext(fn)[0]
            if not _resolves_to_spine(stem, keys):
                counts['excluded'] += 1
                if len(excluded_samples) < 20:
                    excluded_samples.append({'file': fn, 'reason': 'stem not in spine/gene_name'})
                continue
            if stem in existing:
                counts['dupes'] += 1
                continue
            existing.add(stem)
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                seq = f.read().strip()
            rows_to_insert.append({
                'gene_name': stem,
                'path': path,
                'length_bp': len(seq) if seq else None,
                'sha256': _sha256_file(path),
                'imported_at': datetime.now().isoformat(timespec='seconds'),
            })

        if not dry_run:
            if rows_to_insert:
                _insert_rows_plain(conn, 'reference_files', rows_to_insert)
                counts['inserted'] = len(rows_to_insert)
            conn.execute('COMMIT')
        return {'success': True, 'dry_run': dry_run, 'counts': counts,
                'excluded_samples': excluded_samples}
    except Exception as e:
        if conn is not None:
            try:
                conn.execute('ROLLBACK')
            except Exception:
                pass
        return {'success': False, 'error': str(e), 'counts': counts}
    finally:
        if conn is not None:
            conn.close()


# ============================================================ Primer xref

PRIMER_XREF_DDL = '''(
    job_id TEXT,
    primer_name TEXT,
    slot INTEGER,
    sequence TEXT,
    obsolete BOOLEAN
)'''

PRIMER_SEQ_DDL = '''(
    name TEXT,
    sequence TEXT,
    PRIMARY KEY (name, sequence)
)'''


def import_primer_xref(args: dict) -> dict:
    """Bridge Primer Log `Primer *N` slot values (job-keyed) to actual primer
    sequences. Sources scanned inside the same workbook:
    - per-run Oligo order sheets (S0104..T0xxx etc.) contain rows where col A
      is the primer name (often `XP1660364-F1(*1011)` with a star code) and
      col B is its sequence — 1,032 distinct name->seq pairs (whole-sheet scan,
      headers vary per sheet so no fixed header row is assumed).
    - `Primer *1..*10` slots on input addon / obsolete addon reference these
      names: 988 distinct slot values, 770 resolve to a sequence.
    Tables: primer_sequences(name, sequence) catalog + primer_xref(job_id,
    primer_name, slot, sequence, obsolete). Slot values with no sequence in
    the workbook are still xref'd (sequence NULL) and reported."""
    xlsx = args.get('xlsx_path') or PRIMER_LOG
    dry_run = bool(args.get('dry_run', True))
    import re
    star = re.compile(r'\(\*\d+\)')
    seqre = re.compile(r'^[ACGTRYSWKMBDHVNacgtryswkmbdhvn\-]{12,}$')

    counts = {'catalog': 0, 'slot_values': 0, 'xref_rows': 0,
              'with_sequence': 0, 'without_sequence': 0, 'inserted': 0}
    missing_samples = []

    conn = None
    try:
        conn = get_connection()
        conn.execute('CREATE TABLE IF NOT EXISTS primer_sequences ' + PRIMER_SEQ_DDL)
        conn.execute('CREATE TABLE IF NOT EXISTS primer_xref ' + PRIMER_XREF_DDL)

        wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
        skip = {'Summary', 'SG GSK Vector log', 'Sheet1'}
        catalog = {}
        for sn in wb.sheetnames:
            if sn in skip:
                continue
            ws = wb[sn]
            for row in ws.iter_rows(values_only=True):
                a = row[0] if len(row) > 0 else None
                b = row[1] if len(row) > 1 else None
                if a and b and star.search(str(a)) and seqre.match(str(b).strip()):
                    catalog.setdefault(str(a).strip(), str(b).strip().upper())
        wb.close()
        counts['catalog'] = len(catalog)

        wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
        xref_rows = []
        for sn, obsolete_flag in [('input addon', False),
                                  ('Obsolete input addon(completed)', True)]:
            if sn not in wb.sheetnames:
                continue
            ws = wb[sn]
            for row in _read_sheet_rows(ws, 2):
                job_id = _cell(row, 0)
                if not job_id:
                    continue
                for slot_i, col_i in enumerate(range(16, 26), start=1):
                    val = _cell(row, col_i)
                    if not val:
                        continue
                    counts['slot_values'] += 1
                    seq = catalog.get(str(val).strip())
                    if seq:
                        counts['with_sequence'] += 1
                    else:
                        counts['without_sequence'] += 1
                        if len(missing_samples) < 20:
                            missing_samples.append({'job_id': job_id,
                                                    'name': str(val).strip()})
                    xref_rows.append({
                        'job_id': job_id,
                        'primer_name': str(val).strip(),
                        'slot': slot_i,
                        'sequence': seq,
                        'obsolete': obsolete_flag,
                    })
        wb.close()

        existing = {(r[0], r[1], r[2], r[3]) for r in conn.execute(
            'SELECT job_id, primer_name, slot, obsolete FROM primer_xref').fetchall()}
        new_rows = [r for r in xref_rows
                    if (r['job_id'], r['primer_name'], r['slot'], r['obsolete']) not in existing]
        counts['xref_rows'] = len(xref_rows)
        counts['inserted'] = len(new_rows)
        conn.execute('DELETE FROM primer_xref')
        seq_rows = [{'name': n, 'sequence': s} for n, s in catalog.items()]
        conn.execute('DELETE FROM primer_sequences')
        if not dry_run:
            conn.execute('BEGIN TRANSACTION')
            try:
                if xref_rows:
                    _insert_rows_plain(conn, 'primer_xref', xref_rows)
                if seq_rows:
                    _insert_rows_plain(conn, 'primer_sequences', seq_rows)
                conn.execute('COMMIT')
            except Exception:
                conn.execute('ROLLBACK')
                raise
        return {'success': True, 'dry_run': dry_run, 'counts': counts,
                'missing_samples': missing_samples}
    except Exception as e:
        if conn is not None:
            try:
                conn.execute('ROLLBACK')
            except Exception:
                pass
        return {'success': False, 'error': str(e), 'counts': counts}
    finally:
        if conn is not None:
            conn.close()


def read_reference_file(args: dict) -> dict:
    """Capped text preview for the /reference-files drawer (2 kB)."""
    path = args.get('path')
    if not path or not os.path.isfile(path):
        return {'success': False, 'error': f'file not found: {path}'}
    # guard: only files inside the pilot reference dir
    real = os.path.realpath(path)
    if not real.startswith(os.path.realpath(REF_FILES_DIR)):
        return {'success': False, 'error': 'outside reference-files dir'}
    with open(real, 'r', encoding='utf-8', errors='replace') as f:
        text = f.read(2048)
    return {'success': True, 'path': real, 'preview': text,
            'truncated': os.path.getsize(real) > 2048}


# ============================================================ File inventory
def import_file_inventory(args: dict) -> dict:
    """Walk 05/08/09/13/14/15 folders -> file_inventory(folder_group,
    relative_path, ext, size_bytes). Metadata only — no parsers this round."""
    dry_run = bool(args.get('dry_run', True))

    counts = {'files': 0, 'inserted': 0, 'dupes': 0}
    per_group = {}

    conn = None
    try:
        conn = get_connection()
        existing = {(r[0], r[1]) for r in conn.execute(
            'SELECT folder_group, relative_path FROM file_inventory').fetchall()}
        rows_to_insert = []
        if not dry_run:
            conn.execute('BEGIN TRANSACTION')

        for group, root in INVENTORY_GROUPS.items():
            g_count = 0
            if not os.path.isdir(root):
                per_group[group] = 'missing'
                continue
            for dirpath, _dirnames, filenames in os.walk(root):
                for fn in filenames:
                    path = os.path.join(dirpath, fn)
                    rel = os.path.relpath(path, root)
                    key = (group, rel)
                    counts['files'] += 1
                    if key in existing:
                        counts['dupes'] += 1
                        continue
                    existing.add(key)
                    rows_to_insert.append({
                        'folder_group': group,
                        'relative_path': rel.replace('\\\\', '/'),
                        'ext': os.path.splitext(fn)[1].lower() or None,
                        'size_bytes': os.path.getsize(path),
                    })
                    g_count += 1
            per_group[group] = g_count

        if not dry_run:
            if rows_to_insert:
                _insert_rows_plain(conn, 'file_inventory', rows_to_insert)
                counts['inserted'] = len(rows_to_insert)
            conn.execute('COMMIT')
        return {'success': True, 'dry_run': dry_run, 'counts': counts,
                'per_group': per_group}
    except Exception as e:
        if conn is not None:
            try:
                conn.execute('ROLLBACK')
            except Exception:
                pass
        return {'success': False, 'error': str(e), 'counts': counts}
    finally:
        if conn is not None:
            conn.close()


# ============================================================ Shipment + QC
def import_shipment_qc(args: dict) -> dict:
    """Import 12/Shipment and QC Log.xlsx -> shipment_rows (9) + qc_rows (11).

    JobLog_Row_Input + Label_Output are NOT imported — the spine is
    job_log (Ed: the app's job log = the imported tracker; the live
    sheet deletes completed rows with poor consistency). Shipment/QC rows join
    by Job ID == work_no (subset rule; unresolvable excluded + reported).
    Also reports the join trial to reference_files.gene_name.
    """
    xlsx = args.get('xlsx_path') or SHIPMENT_QC
    dry_run = bool(args.get('dry_run', True))

    counts = {'shipment': 0, 'qc': 0, 'excluded': 0, 'dupes': 0,
              'inserted_shipment': 0, 'inserted_qc': 0}
    excluded_samples = []
    join_trial = {'gene_names_in_reference_files': 0, 'checked': 0}

    conn = None
    try:
        conn = get_connection()
        spine = _spine(conn)
        ref_names = {r[0] for r in conn.execute(
            'SELECT gene_name FROM reference_files').fetchall()} if not dry_run or True else set()
        wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)

        existing_s = {(r[0], r[1]) for r in conn.execute(
            'SELECT job_id, prep_date FROM shipment_rows').fetchall()}
        existing_q = {(r[0], r[1]) for r in conn.execute(
            'SELECT job_id, qc_date FROM qc_rows').fetchall()}
        ship_rows, qc_rows = [], []
        if not dry_run:
            conn.execute('BEGIN TRANSACTION')

        # ---- Shipment: two-row header at r1/r2, data from r3
        ws = wb['Shipment']
        kept = dropped = dups = 0
        for row in ws.iter_rows(min_row=3, values_only=True):
            vals = list(row)
            job_id = _norm(vals[1]) if len(vals) > 1 else None
            if job_id is None:
                continue
            counts['shipment'] += 1
            if not _resolves_to_spine(job_id, spine):
                dropped += 1
                counts['excluded'] += 1
                if len(excluded_samples) < 40:
                    excluded_samples.append({'sheet': 'Shipment', 'name': job_id,
                                             'reason': 'no spine match'})
                continue
            prep_date = _norm(vals[0])
            key = (job_id, prep_date)
            if key in existing_s:
                dups += 1
                counts['dupes'] += 1
                continue
            existing_s.add(key)
            ship_rows.append({
                'job_id': job_id,
                'prep_date': prep_date,
                'bbi_id': _norm(vals[2] if len(vals) > 2 else None),
                'vector_no': _norm(vals[3] if len(vals) > 3 else None),
                'tube_location': _norm(vals[4] if len(vals) > 4 else None),
                'ng_ul': _norm(vals[5] if len(vals) > 5 else None),
                'ul_higher': _norm(vals[7] if len(vals) > 7 else None),
                'ul_lower': _norm(vals[8] if len(vals) > 8 else None),
                'ul_transferred': _norm(vals[9] if len(vals) > 9 else None),
                'max_ul': _norm(vals[11] if len(vals) > 11 else None),
                'min_ul': _norm(vals[12] if len(vals) > 12 else None),
                'ul_used': _norm(vals[13] if len(vals) > 13 else None),
                'ul_left': _norm(vals[15] if len(vals) > 15 else None),
                'notes': _norm(vals[16] if len(vals) > 16 else None),
            })
            kept += 1

        # ---- QC: single header at r1, data from r2
        ws = wb['QC']
        kept = dropped = dups = 0
        for row in ws.iter_rows(min_row=2, values_only=True):
            vals = list(row)
            job_id = _norm(vals[1]) if len(vals) > 1 else None
            if job_id is None:
                continue
            counts['qc'] += 1
            if not _resolves_to_spine(job_id, spine):
                dropped += 1
                counts['excluded'] += 1
                if len(excluded_samples) < 40:
                    excluded_samples.append({'sheet': 'QC', 'name': job_id,
                                             'reason': 'no spine match'})
                continue
            qc_date = _norm(vals[0])
            key = (job_id, qc_date)
            if key in existing_q:
                dups += 1
                counts['dupes'] += 1
                continue
            existing_q.add(key)
            clone = _norm(vals[3] if len(vals) > 3 else None)
            image = _norm(vals[11] if len(vals) > 11 else None)
            # join trial: JobLog gene names hit pMON reference files?
            gene = None
            qc_rows.append({
                'job_id': job_id,
                'qc_date': qc_date,
                'bbi_id': _norm(vals[2] if len(vals) > 2 else None),
                'clone': clone,
                'location': _norm(vals[4] if len(vals) > 4 else None),
                'ng_ul': _norm(vals[5] if len(vals) > 5 else None),
                're_extracted': _norm(vals[6] if len(vals) > 6 else None),
                'digestion': _norm(vals[7] if len(vals) > 7 else None),
                'buffer': _norm(vals[8] if len(vals) > 8 else None),
                'expected_bands': _norm(vals[9] if len(vals) > 9 else None),
                'notes': _norm(vals[10] if len(vals) > 10 else None),
                'image_name': image,
            })
            kept += 1

        # ---- join trial: JobLog_Row_Input Gene Name -> reference_files
        if 'JobLog_Row_Input' in wb.sheetnames:
            ws = wb['JobLog_Row_Input']
            for row in ws.iter_rows(min_row=4, values_only=True):
                vals = list(row)
                gene = _norm(vals[4]) if len(vals) > 4 else None
                if gene is None:
                    continue
                join_trial['checked'] += 1
                if gene in ref_names:
                    join_trial['gene_names_in_reference_files'] += 1

        if not dry_run:
            if ship_rows:
                _insert_rows_plain(conn, 'shipment_rows', ship_rows)
                counts['inserted_shipment'] = len(ship_rows)
            if qc_rows:
                _insert_rows_plain(conn, 'qc_rows', qc_rows)
                counts['inserted_qc'] = len(qc_rows)
            conn.execute('COMMIT')
        wb.close()
        return {'success': True, 'dry_run': dry_run, 'counts': counts,
                'excluded_samples': excluded_samples, 'join_trial': join_trial}
    except Exception as e:
        if conn is not None:
            try:
                conn.execute('ROLLBACK')
            except Exception:
                pass
        return {'success': False, 'error': str(e), 'counts': counts}
    finally:
        if conn is not None:
            conn.close()