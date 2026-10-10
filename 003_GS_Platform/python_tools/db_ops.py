import duckdb
import yaml
import sys
import json
import os

DB_PATH = os.path.join('data', 'GeneSyn_db.duckdb')
SCHEMA_PATH = os.path.join('python_tools', 'schema.yaml')

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return duckdb.connect(DB_PATH)

def init_db():
    with open(SCHEMA_PATH, 'r') as f:
        schema = yaml.safe_load(f)

    conn = get_connection()
    for log_type, tables in schema.items():
        for table_name, columns in tables.items():
            full_table_name = f"{log_type}_{table_name}"
            cols_def = []
            for col in columns:
                col_def = f'"{col["name"]}" {col["type"]}'
                if col.get('primary_key'):
                    col_def += " PRIMARY KEY"
                cols_def.append(col_def)

            sql = f"CREATE TABLE IF NOT EXISTS {full_table_name} ({', '.join(cols_def)})"
            conn.execute(sql)
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
        conn.execute(f"INSERT INTO {full_table_name} ({', '.join([f'\"{c}\"' for c in df_cols])}) SELECT * FROM df")
    except Exception as e:
        print(f"Error inserting into {full_table_name}: {str(e)}", file=sys.stderr)
    finally:
        conn.close()

def clear_log_type_data(log_type):
    with open(SCHEMA_PATH, 'r') as f:
        schema = yaml.safe_load(f)

    if log_type not in schema:
        return

    conn = get_connection()
    try:
        for table_name in schema[log_type].keys():
            full_table_name = f"{log_type}_{table_name}"
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

    with open(SCHEMA_PATH, 'r') as f:
        schema = yaml.safe_load(f)

    if log_type not in schema:
        return None

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        for table_name in schema[log_type].keys():
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
    conn = get_connection()
    full_table_name = f"{log_type}_{table_name}"
    
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
        return {"error": f"Database file not found at {DB_PATH}"}

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
    full_table_name = f"{log_type}_{table_name}"
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
