import pandas as pd
import os
import duckdb
import yaml
import json

SCHEMA_PATH = os.path.join('python_tools', 'schema.yaml')
DB_PATH = os.path.join('data', 'GeneSyn_db_v2.duckdb')
DATA_DIR = 'data'

def get_connection():
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

            sql = f"DROP TABLE IF EXISTS {full_table_name}"
            conn.execute(sql)
            sql = f"CREATE TABLE {full_table_name} ({', '.join(cols_def)})"
            conn.execute(sql)
    conn.close()

def migrate():
    # Mapping log types to files
    mapping = {
        'ligation': 'ligation_db.xlsx',
        'colony_pcr': 'colony_pcr_db.xlsx'
    }

    conn = get_connection()

    for log_type, filename in mapping.items():
        file_path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(file_path):
            print(f"File {file_path} not found, skipping...")
            continue

        xl = pd.ExcelFile(file_path)
        for sheet_name in xl.sheet_names:
            table_name = sheet_name.lower()
            full_table_name = f"{log_type}_{table_name}"

            # Check if table exists (case-sensitive because of our creation)
            res = conn.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_name = '{full_table_name}'").fetchone()
            if res[0] == 0:
                print(f"Table {full_table_name} not found in schema, skipping sheet {sheet_name}...")
                continue

            df = xl.parse(sheet_name)

            # Handle empty values
            df = df.where(pd.notnull(df), None)

            # Get table columns
            res = conn.execute(f"PRAGMA table_info({full_table_name})").fetchall()
            table_cols = [r[1] for r in res]

            # Filter df columns to match table columns
            df_cols = [c for c in df.columns if c in table_cols]
            df = df[df_cols]

            # Insert into duckdb
            # duckdb can insert from pandas df directly
            conn.execute(f"INSERT INTO {full_table_name} ({', '.join([f'\"{c}\"' for c in df_cols])}) SELECT * FROM df")
            print(f"Migrated {len(df)} rows to {full_table_name}")

    conn.close()

if __name__ == "__main__":
    init_db()
    migrate()
    print("Migration complete.")
