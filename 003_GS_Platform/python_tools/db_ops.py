import duckdb
import yaml
import sys
import json
import os

# --- Database locations -------------------------------------------------
# The app is being rebuilt around a fresh, synthetic-data-only database.
# The legacy production database is never deleted: on first use it is
# renamed into data/obsolete/ and the new schema is created from scratch.
DATA_DIR = 'data'
DB_FILENAME = 'GeneSyn_db_v2.duckdb'
LEGACY_DB_FILENAME = 'GeneSyn_db.duckdb'
OBSOLETE_DIR = os.path.join(DATA_DIR, 'obsolete')

DB_PATH = os.path.join(DATA_DIR, DB_FILENAME)
LEGACY_DB_PATH = os.path.join(DATA_DIR, LEGACY_DB_FILENAME)
SCHEMA_PATH = os.path.join('python_tools', 'schema.yaml')

_bootstrap_done = False
_schema_cache = None


# --- Schema helpers -----------------------------------------------------
def load_schema():
    """Load schema.yaml once and cache it."""
    global _schema_cache
    if _schema_cache is None:
        with open(SCHEMA_PATH, 'r') as f:
            _schema_cache = yaml.safe_load(f)
    return _schema_cache


def resolve_table_name(log_type, table_name):
    """Physical table name for a (log_type, table_name) pair.

    Default is "{log_type}_{table_name}". A schema group may override it
    with a `table:` key — the job_log group maps to the physical table
    `job_log` so the app's first table keeps a clean, unprefixed name.
    """
    group = load_schema().get(log_type)
    if isinstance(group, dict) and group.get('table'):
        return group['table']
    return f"{log_type}_{table_name}"


def schema_columns(log_type, table_name):
    """Column definitions for a (log_type, table_name) pair."""
    group = load_schema().get(log_type)
    if not isinstance(group, dict):
        return []
    return group.get(table_name) or []


# --- Bootstrap ----------------------------------------------------------
def _unique_obsolete_path(legacy_path):
    """Pick a free path inside the obsolete folder (never overwrite)."""
    base = os.path.basename(legacy_path)
    stem, ext = os.path.splitext(base)
    candidate = os.path.join(OBSOLETE_DIR, base)
    n = 2
    while os.path.exists(candidate):
        candidate = os.path.join(OBSOLETE_DIR, f"{stem} ({n}){ext}")
        n += 1
    return candidate


def _bootstrap_db():
    """Rename the legacy database to obsolete and create the new empty one.

    Idempotent: the rename happens only once, and only when the new
    database does not exist yet. The legacy file is moved, never deleted.
    """
    global _bootstrap_done
    if _bootstrap_done:
        return
    _bootstrap_done = True

    os.makedirs(DATA_DIR, exist_ok=True)

    if not os.path.exists(DB_PATH):
        if os.path.exists(LEGACY_DB_PATH):
            os.makedirs(OBSOLETE_DIR, exist_ok=True)
            target = _unique_obsolete_path(LEGACY_DB_PATH)
            os.replace(LEGACY_DB_PATH, target)
            print(f"Legacy database moved to obsolete: {target}", file=sys.stderr)
        init_db()


def get_connection():
    """Read-write connection (for imports, schema changes, inserts)."""
    _bootstrap_db()
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return duckdb.connect(DB_PATH)


def get_read_connection():
    """Read-only connection.

    DuckDB refuses a second read-WRITE connection to the same file while
    another process holds it, which breaks the app's parallel initial load
    (the layout fires several bridge calls at once). A read-only connection
    has no such restriction, so every read path uses this.
    """
    _bootstrap_db()
    if not os.path.exists(DB_PATH):
        return None
    try:
        return duckdb.connect(DB_PATH, read_only=True)
    except Exception as e:
        print(f"Read-only connection failed: {e}", file=sys.stderr)
        return None


def create_core_views(conn):
    """Views/macros the app's SQL contract expects, over the job_log table."""
    conn.execute(
        'CREATE OR REPLACE VIEW job_log_rows AS '
        'SELECT rowid AS jt_rowid, * FROM job_log'
    )
    conn.execute(
        'CREATE OR REPLACE MACRO spine_of(k) AS '
        'CASE '
        'WHEN k IS NULL THEN NULL '
        'WHEN EXISTS (SELECT 1 FROM job_log g WHERE g.work_no = k) THEN k '
        'WHEN EXISTS (SELECT 1 FROM job_log g WHERE g.work_no = left(k, length(k)-1)) '
        'THEN left(k, length(k)-1) '
        'ELSE NULL END'
    )


def init_db():
    schema = load_schema()

    conn = get_connection()
    for log_type, tables in schema.items():
        if not isinstance(tables, dict):
            continue
        for table_name, columns in tables.items():
            if table_name == 'table':
                continue
            full_table_name = resolve_table_name(log_type, table_name)
            cols_def = []
            for col in columns:
                col_name = col["name"]
                col_type = col["type"]
                col_def = f'"{col_name}" {col_type}'
                if col.get('primary_key'):
                    col_def += " PRIMARY KEY"
                cols_def.append(col_def)

            sql = f"CREATE TABLE IF NOT EXISTS {full_table_name} ({', '.join(cols_def)})"
            conn.execute(sql)
    create_core_views(conn)
    conn.close()

def insert_data(log_type, table_name, data):
    """
    data: list of dicts
    """
    if not data:
        return

    import pandas as pd
    df = pd.DataFrame(data)

    conn = get_connection()
    full_table_name = f"{log_type}_{table_name}"

    # Get columns of the table to handle missing keys in dicts
    try:
        res = conn.execute(f"PRAGMA table_info({full_table_name})").fetchall()
        table_cols = [r[1] for r in res]

        # Filter and reorder columns to match table
        df_cols = [c for c in df.columns if c in table_cols]
        df = df[df_cols]

        # Bulk insert using DuckDB's native integration with pandas
        quoted_cols = ', '.join(['"' + c + '"' for c in df_cols])
        conn.execute(f"INSERT INTO {full_table_name} ({quoted_cols}) SELECT * FROM df")
    except Exception as e:
        print(f"Error inserting into {full_table_name}: {str(e)}", file=sys.stderr)
    finally:
        conn.close()

def clear_log_type_data(log_type):
    schema = load_schema()

    if log_type not in schema:
        return

    conn = get_connection()
    try:
        for table_name in schema[log_type].keys():
            if table_name == 'table':
                continue
            full_table_name = resolve_table_name(log_type, table_name)
            # Check if table exists
            exists = conn.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_name = '{full_table_name}'").fetchone()[0]
            if exists > 0:
                conn.execute(f"DELETE FROM {full_table_name}")
    except Exception as e:
        print(f"Error clearing {log_type}: {str(e)}", file=sys.stderr)
    finally:
        conn.close()

def export_to_excel(log_type):
    import pandas as pd
    import io
    import base64

    schema = load_schema()

    if log_type not in schema:
        return None

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        for table_name in schema[log_type].keys():
            if table_name == 'table':
                continue
            data = query_data(log_type, table_name)
            if data:
                df = pd.DataFrame(data)
                sheet_name = table_name.capitalize()
                df.to_excel(writer, sheet_name=sheet_name, index=False)
            else:
                pd.DataFrame().to_excel(writer, sheet_name=table_name.capitalize(), index=False)

    excel_data = output.getvalue()
    return base64.b64encode(excel_data).decode('utf-8')

def query_data(log_type, table_name, filters=None):
    conn = get_read_connection()
    if conn is None:
        return []
    full_table_name = resolve_table_name(log_type, table_name)
    
    # Check table existence
    res = conn.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_name = '{full_table_name}'").fetchone()
    if res[0] == 0:
        conn.close()
        return []

    sql = f"SELECT * FROM {full_table_name}"
    try:
        if filters:
            where_clauses = []
            params = []
            for k, v in filters.items():
                where_clauses.append(f'"{k}" = ?')
                params.append(v)
            sql += " WHERE " + " AND ".join(where_clauses)
            df = conn.execute(sql, params).df()
        else:
            df = conn.execute(sql).df()

        # Handle empty df
        if df.empty:
            return []

        # NULL must become None, not NaN. A pandas float NaN in a text
        # column serializes as bare `NaN`, which is NOT valid JSON and
        # makes the client's JSON.parse throw — taking down the whole
        # payload. run_query already does this; query_data must too.
        df = df.astype(object).where(df.notna(), None)

        return df.to_dict(orient='records')
    except Exception as e:
        print(f"Query error on {full_table_name}: {str(e)}", file=sys.stderr)
        return []
    finally:
        conn.close()

def run_query(sql):
    """Run a read-only SQL query and return columns + rows."""
    sql_stripped = sql.strip()
    sql_upper = sql_stripped.upper()
    allowed_starts = ('SELECT', 'SHOW', 'DESCRIBE', 'PRAGMA', 'EXPLAIN', 'WITH')
    if not any(sql_upper.startswith(s) for s in allowed_starts):
        return {"error": "Only SELECT, SHOW, DESCRIBE, PRAGMA, EXPLAIN, or WITH queries are allowed."}

    if not os.path.exists(DB_PATH):
        # First read of a fresh checkout: create the database + schema now.
        _bootstrap_db()

    try:
        conn = duckdb.connect(DB_PATH, read_only=True)
        df = conn.execute(sql_stripped).df()
        conn.close()
        # Replace NaN with None for JSON serialization
        df = df.where(df.notna(), None)
        return {"columns": list(df.columns), "rows": df.to_dict(orient='records')}
    except Exception as e:
        return {"error": str(e)}

def get_next_id(log_type, table_name, id_col='id'):
    conn = get_connection()
    full_table_name = resolve_table_name(log_type, table_name)
    try:
        res = conn.execute(f"SELECT MAX({id_col}) FROM {full_table_name}").fetchone()
        if res[0] is None:
            return 1
        return res[0] + 1
    except:
        return 1
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        action = sys.argv[1]
        if action == "init":
            init_db()
            print(json.dumps({"status": "success", "message": "Database initialized"}))
        elif action == "query":
            input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
            log_type = input_data.get('log_type')
            table_name = input_data.get('table_name')
            filters = input_data.get('filters')
            results = query_data(log_type, table_name, filters)
            print(json.dumps(results))
        elif action == "insert":
             input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
             insert_data(input_data['log_type'], input_data['table_name'], input_data['data'])
             print(json.dumps({"status": "success"}))
        elif action == "clear":
             input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
             clear_log_type_data(input_data['log_type'])
             print(json.dumps({"status": "success"}))
        elif action == "export":
             input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
             b64_excel = export_to_excel(input_data['log_type'])
             print(json.dumps({"excel_base64": b64_excel}))
        elif action == "get_next_id":
             input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
             next_id = get_next_id(input_data['log_type'], input_data['table_name'], input_data.get('id_col', 'id'))
             print(json.dumps({"next_id": next_id}))
        elif action == "run_query":
             input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
             result = run_query(input_data.get('sql', ''))
             print(json.dumps(result))
