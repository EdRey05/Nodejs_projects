"""Phase 5 sequencing importers (v0.0.5) — same conventions as bulk_import.py.

bulk_import_sequencing_prep(folder_path): walks 06-Sequencing prep/<WO>/
  project folders; per folder imports the three files (layout / order form /
  validation) through the Phase-5 parsers. Dedupe per table index. Per-file
  try/except; per-file atomic transaction on real runs.
bulk_import_seq_logs(folder_path): walks 10-Sequencing analysis request /
  11-Sequencing analysis results; latest-version-wins per date
  ('260107 Gene Seq Log 1.8.xlsx' beats '260107 Gene Seq Log.xlsx').
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parsers import sequencing as seqp
from bulk_import import _insert_rows  # noqa: F401 (kept for prefix-style callers)


def _insert_rows_plain(conn, table_name: str, rows: list) -> None:
    """Full-name variant of bulk_import._insert_rows (no log_type prefix)."""
    import pandas as pd
    if not rows:
        return
    df = pd.DataFrame(rows)
    res = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    table_cols = [r[1] for r in res]
    unknown = [c for c in df.columns if c not in table_cols]
    if unknown:
        raise ValueError(f'Insert refused for {table_name}: keys with no table column: {unknown}')
    df_cols = [c for c in df.columns if c in table_cols]
    df = df[df_cols]
    quoted_cols = ', '.join('"' + c + '"' for c in df_cols)
    conn.execute(f'INSERT INTO "{table_name}" ({quoted_cols}) SELECT * FROM df')


def _existing_index_names(conn, table):
    try:
        return {str(r[0]) for r in conn.execute(f'SELECT name FROM {table}').fetchall()}
    except Exception:
        return set()


def _next_id(conn, table):
    try:
        r = conn.execute(f'SELECT COALESCE(MAX(id), 0) FROM {table}').fetchone()
        return int(r[0]) + 1
    except Exception:
        return 1


def _report_entry(path, status, message, wo, rows):
    return {'file': path, 'status': status, 'message': message,
            'entry_code': wo, 'rows': rows}


def _import_one_sequencing_prep(project_dir, fname, wo, existing, next_ids):
    """Import one of the three files of a sequencing-prep project folder.
    Returns (code, report, plan) where plan = {table: rows} for real insert."""
    path = os.path.join(project_dir, fname)
    lname = fname.lower()
    src = f'06-Sequencing prep/{wo}'
    plans = {}
    if 'layout' in lname:
        res = seqp.parse_sequencing_layout(path)
        if not res['success']:
            return None, _report_entry(path, 'failed', res['message'], wo, 0), None
        code = f'{wo}-SeqLayout'
        if code in existing.get('sequencing_layout_index', set()):
            return None, _report_entry(path, 'skipped', 'already in index', wo, len(res['rows'])), None
        plans = {
            'sequencing_layout_index': [{'name': code, 'id': next_ids['sequencing_layout_index'], 'source': src}],
            'sequencing_layout_data': [{'sequencing_layout_id': next_ids['sequencing_layout_index'], 'well': r['well'], 'wo': r['wo'], 'dna': r['dna'], 'primer': r['primer'], 'file_name': r['file_name'], 'row_number': r['row_id']} for r in res['rows']],
            'sequencing_layout_plate': [{'sequencing_layout_id': next_ids['sequencing_layout_index'], 'row_letter': c['row_letter'], 'col': c['col'], 'field': c['field'], 'value': str(c['value'])} for c in res['plate']],
        }
        return code, _report_entry(path, 'ok', res['message'], wo, len(res['rows'])), plans
    if 'order' in lname:
        res = seqp.parse_sequencing_order_form(path)
        if not res['success']:
            return None, _report_entry(path, 'failed', res['message'], wo, 0), None
        code = f'{wo}-SeqOrder'
        if code in existing.get('sequencing_order_index', set()):
            return None, _report_entry(path, 'skipped', 'already in index', wo, len(res['rows'])), None
        plans = {
            'sequencing_order_index': [{'name': code, 'id': next_ids['sequencing_order_index'], 'source': src, 'plate_name': res['plate_name']}],
            'sequencing_order_data': [{'sequencing_order_id': next_ids['sequencing_order_index'], 'well_pos': r['well_pos'], 'sample_type': r['sample_type'], 'seq_sample_id': r['seq_sample_id'], 'seq_primer_id': r['seq_primer_id'], 'file_name_request': r['file_name_request'], 'conc_est': r['conc_est'], 'comment': r['comment'], 'dna_position': r['dna_position'], 'layout_wo': r['layout_wo'], 'new_primer_id': r['new_primer_id'], 'new_file_name': r['new_file_name'], 'row_number': r['row_id']} for r in res['rows']],
        }
        return code, _report_entry(path, 'ok', res['message'], wo, len(res['rows'])), plans
    if 'validation' in lname:
        res = seqp.parse_sequencing_validation(path)
        if not res['success']:
            return None, _report_entry(path, 'failed', res['message'], wo, 0), None
        code = f'{wo}-SeqValid'
        if code in existing.get('sequencing_validation_index', set()):
            return None, _report_entry(path, 'skipped', 'already in index', wo, len(res['pending'])), None
        pend_keys = ('row_id', 'jobid', 'bbid', 'plasmid_id', 'notes', 'ng_ul', 'a260_280', 'a260_230', 'seq_rx', 'seq_plate_well')
        dil_keys = ('row_id', 'jobid', 'bbid', 'plasmid_id', 'seq_rx', 'seq_plate_well', 'conc', 'dil_fact', 'vol_to_prepare', 'water_vol', 'dna_vol')
        plans = {
            'sequencing_validation_index': [{'name': code, 'id': next_ids['sequencing_validation_index'], 'source': src}],
            'sequencing_validation_pending': [{'sequencing_validation_id': next_ids['sequencing_validation_index'], **{k: r.get(k, '') for k in pend_keys if k != 'row_id'}, 'row_number': r['row_id']} for r in res['pending']],
            'sequencing_validation_dilution': [{'sequencing_validation_id': next_ids['sequencing_validation_index'], **{k: r.get(k, '') for k in dil_keys if k != 'row_id'}, 'row_number': r['row_id']} for r in res['dilution']],
        }
        return code, _report_entry(path, 'ok', res['message'], wo, len(res['pending'])), plans
    return None, _report_entry(path, 'failed', 'unknown sequencing-prep file name', wo, 0), None


def bulk_import_sequencing_prep(args):
    """args: {folder_path, dry_run=True} — walk project folders, 3 files each."""
    dry_run = bool(args.get('dry_run', True))
    folder = args.get('folder_path', '')
    report = []
    inserted = skipped = failed = 0
    conn = None
    try:
        import db_ops
        conn = db_ops.get_connection()
    except Exception as e:
        return {'success': False, 'message': f'cannot open DB: {e}', 'report': [],
                'inserted': 0, 'skipped': 0, 'failed': 0}
    try:
        if not os.path.isdir(folder):
            return {'success': False, 'message': f'folder not found: {folder}',
                    'report': [], 'inserted': 0, 'skipped': 0, 'failed': 0}
        tables = ('sequencing_layout_index', 'sequencing_order_index', 'sequencing_validation_index')
        existing = {t: _existing_index_names(conn, t) for t in tables}
        next_ids = {t: _next_id(conn, t) for t in tables}
        for d in sorted(os.listdir(folder)):
            pdir = os.path.join(folder, d)
            if not os.path.isdir(pdir):
                continue
            if not os.path.basename(pdir).upper().startswith('U'):
                continue
            wo = os.path.basename(pdir)
            files = os.listdir(pdir)
            for fname in sorted(files):
                lname = fname.lower()
                if not (lname.endswith('.xlsx') and ('layout' in lname or 'order' in lname or 'validation' in lname)):
                    continue
                try:
                    code, rep, plans = _import_one_sequencing_prep(pdir, fname, wo, existing, next_ids)
                except Exception as e:
                    report.append(_report_entry(os.path.join(pdir, fname), 'failed', f'exception: {e}', wo, 0))
                    failed += 1
                    continue
                report.append(rep)
                if rep['status'] == 'failed':
                    failed += 1
                    continue
                if rep['status'] == 'skipped':
                    skipped += 1
                    continue
                if dry_run:
                    inserted += 1
                    continue
                # real: one atomic transaction per file
                try:
                    conn.execute('BEGIN TRANSACTION')
                    for table, rows in plans.items():
                        _insert_rows_plain(conn, table, rows)
                    conn.execute('COMMIT')
                    for t in plans:
                        if t.endswith('_index'):
                            next_ids[t] += 1
                    inserted += 1
                except Exception as e:
                    try:
                        conn.execute('ROLLBACK')
                    except Exception:
                        pass
                    rep['status'] = 'failed'
                    rep['message'] = f'insert failed: {e}'
                    failed += 1
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return {'success': True, 'dry_run': dry_run, 'report': report,
            'inserted': inserted, 'skipped': skipped, 'failed': failed}


def _table_for_code(plans):
    for t in plans:
        if t.endswith('_index'):
            return t
    return ''


def bulk_import_seq_logs(args):
    """args: {folder_path, dry_run=True} — request (10) and result (11) logs.
    Latest-version-wins per date: '260107 Gene Seq Log 1.8.xlsx' beats the
    unversioned file. Entry code = date portion ('SEQ-260107')."""
    dry_run = bool(args.get('dry_run', True))
    folder = args.get('folder_path', '')
    report = []
    inserted = skipped = failed = superseded = 0
    conn = None
    try:
        import db_ops
        conn = db_ops.get_connection()
    except Exception as e:
        return {'success': False, 'message': f'cannot open DB: {e}', 'report': [],
                'inserted': 0, 'skipped': 0, 'failed': 0}
    try:
        if not os.path.isdir(folder):
            return {'success': False, 'message': f'folder not found: {folder}',
                    'report': [], 'inserted': 0, 'skipped': 0, 'failed': 0}
        # group files by date
        cands = {}
        for f in os.listdir(folder):
            p = seqp.seq_log_parse_name(f)
            if not p:
                continue
            cands.setdefault(p[0], []).append((p[1], f))
        existing = _existing_index_names(conn, 'seq_log_index')
        try:
            next_id = _next_id(conn, 'seq_log_index')
        except Exception:
            next_id = 1
        for date in sorted(cands):
            versions = sorted(cands[date], key=lambda t: t[0], reverse=True)
            latest_ver, latest_f = versions[0]
            path = os.path.join(folder, latest_f)
            code = f'SEQ-{date}'
            try:
                res = seqp.parse_sequencing_analysis(path)
            except Exception as e:
                report.append(_report_entry(path, 'failed', f'exception: {e}', code, 0))
                failed += 1
                superseded += len(versions) - 1
                continue
            for ver, fname in versions[1:]:
                report.append(_report_entry(os.path.join(folder, fname), 'superseded',
                                            f'superseded by {latest_f}', code, 0))
                superseded += 1
            if not res['success']:
                report.append(_report_entry(path, 'failed', res['message'], code, 0))
                failed += 1
                continue
            if code in existing:
                report.append(_report_entry(path, 'skipped', 'already in index', code, len(res['rows'])))
                skipped += 1
                continue
            plans = {
                'seq_log_index': [{'name': code, 'id': next_id, 'log_date': date, 'version': latest_ver,
                                   'source': os.path.basename(folder)}],
                'seq_log_data': [{'seq_log_id': next_id, 'row_number': r['row_id'],
                                  **{k: r[k] for k in ('folder_name', 'job_id', 'vector_id', 'sg_ss_ok', 'sg_ds_ok', 'sg_mutation_or_fail', 'sg_primer_to_repeat', 'requirement', 'qc_file_name', 'work_no', 'bbi_id', 'gene_name', 'vector', 'length_bp', 'plasmid_no', 'cloning_site', 'resistance', 'growth_condition_temperature', 'order_date', 'delivery_date', 'storage', 'host', 'plasmid_qty', 'competent_cells', 'od260', 'od280', 'od260_280', 'ng_ul')}} for r in res['rows']],
            }
            report.append(_report_entry(path, 'ok', f'version {latest_ver}: {res["message"]}', code, len(res['rows'])))
            if dry_run:
                inserted += 1
                continue
            try:
                conn.execute('BEGIN TRANSACTION')
                for table, rows in plans.items():
                    _insert_rows_plain(conn, table, rows)
                conn.execute('COMMIT')
                existing.add(code)
                next_id += 1
                inserted += 1
            except Exception as e:
                try:
                    conn.execute('ROLLBACK')
                except Exception:
                    pass
                report[-1]['status'] = 'failed'
                report[-1]['message'] = f'insert failed: {e}'
                failed += 1
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return {'success': True, 'dry_run': dry_run, 'report': report,
            'inserted': inserted, 'skipped': skipped, 'failed': failed,
            'superseded': superseded}