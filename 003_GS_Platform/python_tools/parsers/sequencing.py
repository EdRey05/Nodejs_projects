"""Phase 5 parsers — Sequencing prep trio + analysis logs (v0.0.5).

Real-data structures (verified on pilot 2026_pilot/Original_data):
- Sequencing_layout_<WO>.xlsx: 'Data' r1 headers (c1 Wells, c2 WO#, c3 DNA,
  c4 Primer, c6 FileName; controls c9/c12), 'Template'/'Processing' plate
  form (rows A..H x 12 cols, three field rows WO#/Primer/DNA; marker col 15
  = row letter).
- Sequencing_order_form_<WO>.xlsx: 'Order form' r19 headers c1-c12, data
  from r20 while c1 parses as a well position; Plate Name at r18 c2.
- Sequencing_validation_<WO>.xlsx: 'Sequencing Pending' r1 headers
  (c1 JobID, c2 BBID, c3 Plasmid ID, c4 Notes, c5 ng/ul, c6 260/280,
  c7 260/230, c9 Seq Rx, c10 Seq Plate well), data from r3; 'dilution'
  r1 headers c1-c5 + c7 Conc, c8 Dil fact, c9 Vol to prepare, c10 Water
  vol, c11 DNA vol, data from r3.
- <yymmdd>[ vV.M] Gene Seq Log.xlsx: 'Genes Sequenced' r1 headers c1-c28,
  data from r2.

All parse_* return {"success", "message", ...} and never raise.
"""
import os
import re
import openpyxl


def _norm(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _wb_readonly(path):
    return openpyxl.load_workbook(path, read_only=True, data_only=True)


def _cells(ws, min_row, min_col, max_col):
    rows = ws.iter_rows(min_row=min_row, max_row=ws.max_row, min_col=min_col, max_col=max_col, values_only=True)
    return [list(_norm(v) for v in row) for row in rows]


def parse_sequencing_layout(xlsx_path, sheet='Data'):
    """Data sheet rows + Template/Processing plate form."""
    out = {'success': False, 'message': '', 'rows': [], 'plate': []}
    try:
        wb = _wb_readonly(xlsx_path)
    except Exception as e:
        out['message'] = f'cannot open: {e}'
        return out
    try:
        if sheet not in wb.sheetnames:
            out['message'] = f'Sheet "{sheet}" not found'
            return out
        ws = wb[sheet]
        for i, r in enumerate(_cells(ws, 2, 1, 6), 2):
            well, wo, dna, primer, _, file_name = (str(r[j]).strip() if r[j] not in (None, '') else '' for j in range(6))
            if not (well and (wo or dna or primer)):
                continue
            out['rows'].append({'row_id': i, 'well': well, 'wo': wo, 'dna': dna,
                                'primer': primer, 'file_name': file_name})

        # Plate form: Template sheet preferred, Processing fallback
        ps = 'Template' if 'Template' in wb.sheetnames else ('Processing' if 'Processing' in wb.sheetnames else None)
        if ps:
            pw = wb[ps]
            grid = _cells(pw, 1, 1, 16)
            field = None
            for r_i, vals in enumerate(grid, 1):
                c1 = str(vals[0]).strip() if vals[0] is not None else ''
                c2 = str(vals[1]).strip() if vals[1] is not None else ''
                row_letter = c1 if re.fullmatch(r'[A-H]', c1.upper() if c1 else '') else None
                if c2 in ('WO#', 'Primer', 'DNA'):
                    field = c2
                    if row_letter is None:
                        # Template sheet: letter lives on the WO# row (c1)
                        row_letter = c1.upper() if c1.upper() in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H') else ''
                        if not row_letter:
                            # infer from position of the previous letter row
                            row_letter = ''
                    for col_i in range(3, 15):
                        v = vals[col_i - 1]
                        if v in (None, ''):
                            continue
                        out['plate'].append({
                            'row_letter': row_letter,
                            'col': col_i - 2,
                            'field': field,
                            'value': str(v).strip() if not isinstance(v, (int, float)) else _norm(v),
                        })
                elif row_letter and field:
                    pass  # marker col only; fields handled above
        out['success'] = True
        out['message'] = f'{len(out["rows"])} Data rows, {len(out["plate"])} plate cells'
    except Exception as e:
        out['message'] = f'parse failed: {e}'
    finally:
        wb.close()
    return out


ORDER_HDR = {1: 'well_pos', 2: 'sample_type', 3: 'seq_sample_id', 4: 'seq_primer_id',
             5: 'file_name_request', 6: 'conc_est', 7: 'comment', 9: 'dna_position',
             10: 'layout_wo', 11: 'new_primer_id', 12: 'new_file_name'}


def parse_sequencing_order_form(xlsx_path, sheet='Order form'):
    """Tabular region under r19 (Bio Basic header block), rows while c1 is a well."""
    out = {'success': False, 'message': '', 'rows': [], 'plate_name': ''}
    try:
        wb = _wb_readonly(xlsx_path)
    except Exception as e:
        out['message'] = f'cannot open: {e}'
        return out
    try:
        if sheet not in wb.sheetnames:
            out['message'] = f'Sheet "{sheet}" not found'
            return out
        ws = wb[sheet]
        p = _cells(ws, 18, 1, 12)
        r18 = p[0] if p else []
        pn = str(r18[1]).strip() if len(r18) > 1 and r18[1] else ''
        out['plate_name'] = pn
        body = p[1:] if pn else p
        for i, r in enumerate(body, 19):
            c1 = str(r[0]).strip() if r[0] is not None else ''
            if not re.fullmatch(r'([A-H])(0[1-9]|1[0-2])', c1.upper() if c1 else '') or not pn:
                # stop when past the table (works because data rows are contiguous from r20)
                if out['rows']:
                    break
                if not re.fullmatch(r'([A-H])(0[1-9]|1[0-2])', c1.upper() if c1 else ''):
                    continue
            rowdict = {'row_id': i}
            for c, key in ORDER_HDR.items():
                rowdict[key] = str(r[c - 1]).strip() if c - 1 < len(r) and r[c - 1] is not None else ''
            out['rows'].append(rowdict)
        out['success'] = True
        out['message'] = f'plate {pn}: {len(out["rows"])} rows'
    except Exception as e:
        out['message'] = f'parse failed: {e}'
    finally:
        wb.close()
    return out


def parse_sequencing_validation(xlsx_path, pending_sheet='Sequencing Pending', dilution_sheet='dilution'):
    out = {'success': False, 'message': '', 'pending': [], 'dilution': []}
    try:
        wb = _wb_readonly(xlsx_path)
    except Exception as e:
        out['message'] = f'cannot open: {e}'
        return out
    try:
        # Sequencing Pending: fixed positions c1..c7, c9, c10, data from r3
        if pending_sheet in wb.sheetnames:
            ws = wb[pending_sheet]
            for i, r in enumerate(_cells(ws, 3, 1, 10), 3):
                jobid = str(r[0]).strip() if r[0] is not None else ''
                if not jobid or jobid.lower() in ('none', '#n/a', '#ref!'):
                    continue
                def g(j):
                    v = r[j - 1]
                    if v in (None, ''):
                        return ''
                    if isinstance(v, (int, float)):
                        return _norm(v)
                    return str(v).strip()
                out['pending'].append({'row_id': i, 'jobid': g(1), 'bbid': g(2), 'plasmid_id': g(3),
                                       'notes': g(4), 'ng_ul': g(5), 'a260_280': g(6), 'a260_230': g(7),
                                       'seq_rx': g(9), 'seq_plate_well': g(10)})
        # dilution: c1-c5 + c7-c11, data from r3
        if dilution_sheet in wb.sheetnames:
            ws = wb[dilution_sheet]
            for i, r in enumerate(_cells(ws, 3, 1, 11), 3):
                jobid = str(r[0]).strip() if r[0] is not None else ''
                if not jobid or jobid.lower() in ('none', '#n/a', '#ref!'):
                    continue
                def g2(j):
                    v = r[j - 1]
                    if v in (None, ''):
                        return ''
                    if isinstance(v, (int, float)):
                        return _norm(v)
                    return str(v).strip()
                out['dilution'].append({'row_id': i, 'jobid': g2(1), 'bbid': g2(2), 'plasmid_id': g2(3),
                                        'seq_rx': g2(4), 'seq_plate_well': g2(5), 'conc': g2(7),
                                        'dil_fact': g2(8), 'vol_to_prepare': g2(9), 'water_vol': g2(10),
                                        'dna_vol': g2(11)})
        out['success'] = True
        out['message'] = f'pending {len(out["pending"])} rows, dilution {len(out["dilution"])} rows'
    except Exception as e:
        out['message'] = f'parse failed: {e}'
    finally:
        wb.close()
    return out


SEQ_LOG_COLS = {1: 'folder_name', 2: 'job_id', 3: 'vector_id', 4: 'sg_ss_ok', 5: 'sg_ds_ok',
                6: 'sg_mutation_or_fail', 7: 'sg_primer_to_repeat', 8: 'requirement',
                9: 'qc_file_name', 10: 'work_no', 11: 'bbi_id', 12: 'gene_name', 13: 'vector',
                14: 'length_bp', 15: 'plasmid_no', 16: 'cloning_site', 17: 'resistance',
                18: 'growth_condition_temperature', 19: 'order_date', 20: 'delivery_date',
                21: 'storage', 22: 'host', 23: 'plasmid_qty', 24: 'competent_cells',
                25: 'od260', 26: 'od280', 27: 'od260_280', 28: 'ng_ul'}


def parse_sequencing_analysis(xlsx_path, sheet='Genes Sequenced'):
    out = {'success': False, 'message': '', 'rows': []}
    try:
        wb = _wb_readonly(xlsx_path)
    except Exception as e:
        out['message'] = f'cannot open: {e}'
        return out
    try:
        if sheet not in wb.sheetnames:
            out['message'] = f'Sheet "{sheet}" not found'
            return out
        ws = wb[sheet]
        for i, r in enumerate(_cells(ws, 2, 1, 28), 2):
            first = str(r[0]).strip() if r[0] is not None else ''
            if not first:
                continue
            rowdict = {'row_id': i}
            for c, key in SEQ_LOG_COLS.items():
                v = r[c - 1]
                if v in (None, ''):
                    rowdict[key] = ''
                elif isinstance(v, (int, float)):
                    rowdict[key] = _norm(v)
                else:
                    s = str(v).strip()
                    rowdict[key] = s
            out['rows'].append(rowdict)
        out['success'] = True
        out['message'] = f'{len(out["rows"])} rows'
    except Exception as e:
        out['message'] = f'parse failed: {e}'
    finally:
        wb.close()
    return out


SEQ_LOG_NAME_RE = re.compile(r'^(?P<date>\d{6})(?:\s+Gene Seq Log(?:\s+v?(?P<version>\d+(?:\.\d+)?))?)?\.xlsx$', re.IGNORECASE)


def seq_log_parse_name(filename):
    """'260106 Gene Seq Log 1.8.xlsx' -> ('260106', 1.8); plain -> ('260106', 1.0)."""
    m = SEQ_LOG_NAME_RE.match(os.path.basename(filename).strip())
    if not m:
        return None
    v = m.group('version')
    return m.group('date'), float(v) if v else 1.0