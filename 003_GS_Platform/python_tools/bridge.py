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
    """Parse an Excel file and return preview data."""
    log_type = _log_type_key(data['log_type'])
    file_base64 = data['file_base64']
    file_bytes = base64.b64decode(file_base64)

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

    # Parse the file
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
        for table in ['extraction_plate', 'fragments', 'other']:
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


# Action dispatcher
ACTIONS = {
    'parse': action_parse,
    'parse_and_persist': action_parse_and_persist,
    'fetch': action_fetch,
    'fetch_extraction_wells': action_fetch_extraction_wells,
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
