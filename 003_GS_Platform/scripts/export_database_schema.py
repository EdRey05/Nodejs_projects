"""Export the GSP schema snapshot; generated temporary records are discarded."""
import tempfile
from pathlib import Path
import duckdb


def export_schema(database, output):
    with tempfile.TemporaryDirectory() as folder:
        export_path = Path(folder) / 'schema-export'
        with duckdb.connect(str(database), read_only=True) as db:
            db.execute("EXPORT DATABASE '" + str(export_path).replace("'", "''") + "'")
        schema = (export_path / 'schema.sql').read_text(encoding='utf-8')
    output.write_text('-- Schema snapshot of GSP_database.duckdb; no records.\n' + schema, encoding='utf-8')


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    export_schema(root / 'data/GSP_database.duckdb', root / 'data/SCHEMA.sql')
