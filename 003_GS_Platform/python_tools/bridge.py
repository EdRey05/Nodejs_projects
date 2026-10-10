"""Unified Python bridge for Gene Synthesis Automations.

Single entry point that handles complete workflows in one Python process,
eliminating the need for multiple sequential subprocess spawns.

Actions are dispatched via the 'action' field in JSON stdin.
All responses are JSON on stdout.
"""

import sys
import json
import base64
import os

# Ensure python_tools is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_ops
from parsers import PARSERS


def _log_type_key(log_type: str) -> str:
    """Normalize log type to snake_case key (e.g. 'Colony PCR' -> 'colony_pcr')."""
    return log_type.lower().replace(' ', '_')


def action_parse(data: dict) -> dict:
    """Parse an Excel/CSV file and return preview data."""
    log_type = _log_type_key(data['log_type'])
    source_mode = data.get('source_mode', '')
    file_base64 = data['file_base64']
    file_bytes = base64.b64decode(file_base64)

    # Route Nanodrop CSV to its dedicated parser
    if log_type == 'dna_quantification' and source_mode == 'Nanodrop CSV':
        parser = PARSERS.get('nanodrop')
    else:
        parser = PARSERS.get(log_type)

    if not parser:
        return {"success": False, "message": f"No parser found for log type: {log_type}"}

    return parser(file_bytes)


def action_parse_and_persist(data: dict) -> dict:
    """Parse an Excel file, validate uniqueness, and insert all data into DuckDB.

    This replaces 6-9 sequential db_ops.py spawns with a single operation.
    """
    log_type = _log_type_key(data['log_type'])
    entry_code = data['entry_code']
    file_base64 = data['file_base64']
    additional_data = data.get('additional_data', {})
    file_bytes = base64.b64decode(file_base64)

    # Initialize DB if needed
    if not os.path.exists(db_ops.DB_PATH):
        db_ops.init_db()

    # Check uniqueness
    existing = db_ops.query_data(log_type, 'index', {'name': entry_code})
    if existing and len(existing) > 0:
        return {"success": False, "message": "Entry code must be unique."}

    # Get next ID
    new_id = db_ops.get_next_id(log_type, 'index')

    # Parse the file (route Nanodrop CSV to its dedicated parser)
    source_mode = additional_data.get('sourceMode', '')
    if log_type == 'dna_quantification' and source_mode == 'Nanodrop CSV':
        parser = PARSERS.get('nanodrop')
    else:
        parser = PARSERS.get(log_type)

    if not parser:
        return {"success": False, "message": f"No parser found for log type: {log_type}"}

    parse_result = parser(file_bytes)
    if not parse_result.get('success') or not parse_result.get('data'):
        return {"success": False, "message": parse_result.get('message', 'Parse failed.')}

    id_col_name = f"{log_type}_id"

    # Insert index entry
    index_entry = {"name": entry_code, "id": new_id}
    if log_type == 'dna_quantification':
        index_entry["source"] = additional_data.get('sourceMode', 'Unknown')
        index_entry["source_details"] = json.dumps(additional_data.get('sourceDetails', {}))
    db_ops.insert_data(log_type, 'index', [index_entry])

    # Insert data based on log type
    if log_type == 'ligation':
        rows = [{id_col_name: new_id, **row} for row in parse_result['data']]
        db_ops.insert_data(log_type, 'data', rows)

    elif log_type == 'colony_pcr':
        all_data = []
        all_samples = []
        all_positives = []

        for plate in parse_result['data']:
            plate_id = plate['plateId']
            all_data.extend([
                {'colony_pcr_id': new_id, 'plate_id': plate_id, **row}
                for row in plate['gridData']
            ])
            all_samples.extend([
                {'colony_pcr_id': new_id, 'plate_id': plate_id, **row}
                for row in plate['samplesData']
            ])
            positive_wells = (additional_data.get('positiveWells') or {}).get(str(plate_id), [])
            all_positives.extend([
                {'colony_pcr_id': new_id, 'plate_id': plate_id, 'well': well}
                for well in positive_wells
            ])

        if all_data:
            db_ops.insert_data(log_type, 'data', all_data)
        if all_samples:
            db_ops.insert_data(log_type, 'samples', all_samples)
        if all_positives:
            db_ops.insert_data(log_type, 'positives', all_positives)

    elif log_type == 'dna_extraction':
        row_labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        all_data = []

        for plate in parse_result['data']:
            plate_id = plate['plateId']
            plate_data = plate['data']

            for i in range(8):
                row_label = row_labels[i]
                row = {'dna_extraction_id': new_id, 'plate_id': plate_id, 'Row': row_label}
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

        if all_data:
            db_ops.insert_data(log_type, 'data', all_data)

        # Insert parameters
        parameters = additional_data.get('parameters', [])
        if parameters:
            param_table_map = {
                'antibiotic': 'antibiotic',
                'temperature': 'temperature',
                'bacteria': 'bacteria',
                'incubationTime': 'incubation',
                'prep': 'prep',
            }
            for param_type, table_name in param_table_map.items():
                params = [
                    {
                        'dna_extraction_id': new_id,
                        'plate_id': p['plate_id'],
                        'well_id': p['well_id'],
                        'value': p['value'],
                    }
                    for p in parameters if p['type'] == param_type
                ]
                if params:
                    db_ops.insert_data(log_type, table_name, params)

    elif log_type == 'dna_quantification':
        mode_table = {
            'Extraction Plate': 'extraction_plate',
            'Fragments': 'fragments',
            'Nanodrop CSV': 'nanodrop',
        }.get(additional_data.get('sourceMode', ''), 'other')

        rows = [{'quantification_id': new_id, **row} for row in parse_result['data']]
        db_ops.insert_data(log_type, mode_table, rows)

    # Return fresh payload
    payload = _fetch_all_tables(log_type)
    return {
        "success": True,
        "message": f'Successfully processed "{entry_code}".',
        "payload": payload,
    }


def action_fetch(data: dict) -> dict:
    """Load all tables for a log type from DuckDB."""
    log_type = _log_type_key(data['log_type'])

    if not os.path.exists(db_ops.DB_PATH):
        return {"success": False, "message": "No persisted data found in DuckDB."}

    payload = _fetch_all_tables(log_type)

    if not payload.get('index'):
        return {"success": False, "message": "No persisted data found in DuckDB."}

    return {"success": True, "payload": payload}


def _fetch_all_tables(log_type: str) -> dict:
    """Fetch all tables for a log type in a single function call."""
    index_data = db_ops.query_data(log_type, 'index')
    data = db_ops.query_data(log_type, 'data')

    payload = {'index': index_data or [], 'data': data or []}

    if log_type == 'colony_pcr':
        payload['samples'] = db_ops.query_data(log_type, 'samples') or []
        payload['positives'] = db_ops.query_data(log_type, 'positives') or []
    elif log_type == 'dna_extraction':
        for table in ['antibiotic', 'temperature', 'bacteria', 'incubation', 'prep']:
            payload[table] = db_ops.query_data(log_type, table) or []
    elif log_type == 'dna_quantification':
        for table in ['extraction_plate', 'fragments', 'other', 'nanodrop']:
            payload[table] = db_ops.query_data(log_type, table) or []

    return payload


def action_fetch_extraction_wells(data: dict) -> dict:
    """Query specific extraction wells by entry name."""
    entry_name = data['entry_name']
    log_type = 'dna_extraction'

    if not os.path.exists(db_ops.DB_PATH):
        return {"success": False, "message": "Database not initialized."}

    index_res = db_ops.query_data(log_type, 'index', {'name': entry_name})
    if not index_res or len(index_res) == 0:
        return {"success": False, "message": "Entry not found in DuckDB."}

    entry = index_res[0]
    data_res = db_ops.query_data(log_type, 'data', {'dna_extraction_id': entry['id']})
    if not data_res:
        return {"success": False, "message": "Error querying Data table."}

    wells = []
    for row in data_res:
        plate_id = int(row.get('plate_id', 0))
        row_label = row.get('Row', '')
        start_col = 1 if plate_id == 1 else 7
        end_col = 6 if plate_id == 1 else 12

        for i in range(1, 13):
            col_key = f"C{i}"
            val = row.get(col_key)
            if val and str(val).strip() and start_col <= i <= end_col:
                wells.append({"well": f"{row_label}{i}", "sample": str(val)})

    wells.sort(key=lambda w: (w['well'][0], int(w['well'][1:])))
    return {"success": True, "wells": wells}


def action_fetch_gene_tracker(_data: dict) -> dict:
    """Fetch all gene tracker data from DuckDB."""
    if not os.path.exists(db_ops.DB_PATH):
        return {"success": False, "message": "Database not initialized."}

    data = db_ops.query_data('gene_tracker', 'data')
    if not data:
        return {"success": False, "message": "No gene tracker data found."}

    return {"success": True, "data": data}


def action_db_init(_data: dict) -> dict:
    """Initialize the database."""
    db_ops.init_db()
    return {"status": "success", "message": "Database initialized"}


def action_db_export(data: dict) -> dict:
    """Export a log type to Excel."""
    log_type = _log_type_key(data['log_type'])
    b64 = db_ops.export_to_excel(log_type)
    if b64:
        return {"excel_base64": b64}
    return {"error": "Export failed"}


def action_db_run_query(data: dict) -> dict:
    """Execute a read-only SQL query."""
    return db_ops.run_query(data.get('sql', ''))


def action_db_clear(data: dict) -> dict:
    """Clear all data for a log type."""
    log_type = _log_type_key(data['log_type'])
    db_ops.clear_log_type_data(log_type)
    return {"status": "success"}


def action_bulk_import(data: dict) -> dict:
    """Bulk-import a folder of real-data files for one log type."""
    from bulk_import import bulk_import as _bulk_import
    return _bulk_import(data)


def action_import_gene_tracker(data: dict) -> dict:
    """Header-verified, work_no-based upsert of a Gene Tracker sheet."""
    from bulk_import import import_gene_tracker as _import_gt
    return _import_gt(data)


def action_import_idt(data: dict) -> dict:
    """Summary IDT Log v2 -> idt_fragments + pcr_fragments (P8 job web)."""
    from job_web_import import import_idt as _imp
    return _imp(data)


def action_import_primer_addon(data: dict) -> dict:
    """Primer Log input addon sheets -> primer_input_addon (P8 job web)."""
    from job_web_import import import_primer_addon as _imp
    return _imp(data)


def action_import_reference_files(data: dict) -> dict:
    """07 reference pMON*.txt walk -> reference_files (P8 job web)."""
    from job_web_import import import_reference_files as _imp
    return _imp(data)


def action_import_file_inventory(data: dict) -> dict:
    """05/08/09/13/14/15 walks -> file_inventory (P8 job web)."""
    from job_web_import import import_file_inventory as _imp
    return _imp(data)


def action_import_shipment_qc(data: dict) -> dict:
    """12 Shipment and QC Log -> shipment_rows + qc_rows (P8 job web)."""
    from job_web_import import import_shipment_qc as _imp
    return _imp(data)


def action_read_reference_file(data: dict) -> dict:
    """Capped 2 kB preview of a reference pMON*.txt (P8 /reference-files UI)."""
    from job_web_import import read_reference_file as _imp
    return _imp(data)


def action_import_primer_xref(data: dict) -> dict:
    """Primer *N slot -> sequence bridge (primer_xref + primer_sequences)."""
    from job_web_import import import_primer_xref as _imp
    return _imp(data)


def action_ensure_job_web(data: dict) -> dict:
    """Create canonical P8 tables (raw DDL) + job_log_rows view."""
    from job_web_import import ensure_job_web_objects as _ensure
    return {'status': 'success', 'created': _ensure()}


def action_import_master_summary(data: dict) -> dict:
    """Stream an Extraction Log 'summary' sheet into master_summary."""
    from bulk_import import import_master_summary as _import_ms
    return _import_ms(data)


def action_import_vector_db(data: dict) -> dict:
    """Import Vector_database.xlsx into the vector_db table."""
    from foundations import import_vector_db
    return import_vector_db(data)


def action_lookup_vector(data: dict) -> dict:
    """Find vector rows by name (+optional enzyme) in vector_db."""
    from foundations import lookup_vector as _fn
    return _fn(data)


def action_list_templates(data: dict) -> dict:
    """List shipped layout templates in python_tools/templates/."""
    from foundations import list_templates as _fn
    return _fn(data or {})


def action_build_ligation_layout(data: dict) -> dict:
    """Generate a Ligation Layout xlsx (pilot ligation_layout.py port)."""
    from layouts import build_ligation_layout as _fn
    return _fn(data)


def action_import_primer_log(data: dict) -> dict:
    """Primer Log 'input addon' -> primers table (drop+recreate)."""
    from layouts import import_primer_log as _fn
    return _fn(data)


def action_fetch_primer_map(data: dict) -> dict:
    """{job_id: primer_pair} mapping (primers table / Primer Log xlsx)."""
    from layouts import fetch_primer_map as _fn
    return _fn(data)


def action_build_colony_pcr_layout(data: dict) -> dict:
    """Colony PCR layout builder (pilot ColonyPCRLayout_app port)."""
    from layouts import build_colony_pcr_layout as _fn
    return _fn(data)


def action_build_extraction_layout(data: dict) -> dict:
    """Extraction layout builder from colony PCR positives (round-trips
    the dna_extraction parser)."""
    from layouts import build_extraction_layout as _fn
    return _fn(data)


def action_bulk_import_sequencing_prep(data: dict) -> dict:
    """Walk 06-Sequencing prep project folders and import the three files."""
    from seq_import import bulk_import_sequencing_prep as _fn
    return _fn(data)


def action_bulk_import_seq_logs(data: dict) -> dict:
    """Walk a Gene Seq Log folder (request or results); latest version wins."""
    from seq_import import bulk_import_seq_logs as _fn
    return _fn(data)


# Action dispatcher
ACTIONS = {
    'parse': action_parse,
    'parse_and_persist': action_parse_and_persist,
    'fetch': action_fetch,
    'fetch_extraction_wells': action_fetch_extraction_wells,
    'fetch_gene_tracker': action_fetch_gene_tracker,
    'bulk_import': action_bulk_import,
    'import_gene_tracker': action_import_gene_tracker,
    'import_master_summary': action_import_master_summary,
    'import_vector_db': action_import_vector_db,
    'lookup_vector': action_lookup_vector,
    'list_templates': action_list_templates,
    'build_ligation_layout': action_build_ligation_layout,
    'import_primer_log': action_import_primer_log,
    'fetch_primer_map': action_fetch_primer_map,
    'build_colony_pcr_layout': action_build_colony_pcr_layout,
    'build_extraction_layout': action_build_extraction_layout,
    'bulk_import_sequencing_prep': action_bulk_import_sequencing_prep,
    'bulk_import_seq_logs': action_bulk_import_seq_logs,
    'import_idt': action_import_idt,
    'import_primer_addon': action_import_primer_addon,
    'import_reference_files': action_import_reference_files,
    'import_file_inventory': action_import_file_inventory,
    'import_shipment_qc': action_import_shipment_qc,
    'read_reference_file': action_read_reference_file,
    'import_primer_xref': action_import_primer_xref,
    'ensure_job_web': action_ensure_job_web,
    'db_init': action_db_init,
    'db_export': action_db_export,
    'db_run_query': action_db_run_query,
    'db_clear': action_db_clear,
}


if __name__ == '__main__':
    try:
        input_data = json.load(sys.stdin)
        action = input_data.get('action')

        if not action or action not in ACTIONS:
            print(json.dumps({"success": False, "message": f"Unknown action: {action}"}))
            sys.exit(1)

        result = ACTIONS[action](input_data)
        print(json.dumps(result, default=str))

    except Exception as e:
        print(json.dumps({"success": False, "message": str(e)}), file=sys.stdout)
        sys.exit(1)
