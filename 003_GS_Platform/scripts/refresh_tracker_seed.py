"""Refresh existing synthetic tracker rows in place, preserving identities and status."""
import argparse
from datetime import date
from pathlib import Path
from random import Random
import zipfile
import duckdb
from tracker_seed_rules import pool, row_values, january_order_dates


def refresh(path, seed=42):
    # This is deliberately an explicit operation, never part of app startup.
    backup = path.parent.parent / '.local-runtime' / 'seed-backups' / (path.name + '.zip')
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists():
        with zipfile.ZipFile(backup, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.write(path, path.name)
    with duckdb.connect(str(path)) as db:
        db.begin()
        for table in ('oligo_log', 'primer_log'):
            if db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]:
                raise ValueError('Linked logs are populated; migrate their Work Numbers before refreshing')
        columns = {r[1] for r in db.execute("PRAGMA table_info('vector_log')").fetchall()}
        for column in ('source_url', 'verification_status'):
            if column not in columns:
                db.execute(f"ALTER TABLE vector_log ADD COLUMN {column} VARCHAR DEFAULT ''")
        for r in pool('vector_reference.json'):
            db.execute('UPDATE vector_log SET resistance=?, source_url=?, verification_status=? WHERE vector=?',
                       [r['resistance'], r['source_url'], r['verification_status'], r['vector']])
        references = dict(db.execute('SELECT vector,resistance FROM vector_log ORDER BY vector').fetchall())
        rng, dates, delivery = Random(seed), Random(f'{seed}:order-date'), Random(f'{seed}:delivery-format')
        rows = db.execute('SELECT record_id,customer_id,order_number FROM progress_tracker ORDER BY customer_id,order_number,item_number,record_id').fetchall()
        order_dates = january_order_dates([(c, n) for _, c, n in rows], dates)
        for counter, (record_id, customer, order) in enumerate(rows, 1):
            key = (customer, order)
            values = row_values(rng, delivery, order_dates[key], counter, references)
            assignments = ', '.join(f'{column}=?' for column in values)
            db.execute(f'UPDATE progress_tracker SET order_date=?, {assignments} WHERE record_id=?',
                       [order_dates[key], *values.values(), record_id])
        db.commit()
        print(f'Refreshed {len(rows)} rows across {len(order_dates)} orders; backup: {backup}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=Path(__file__).resolve().parents[1] / 'data/GSP_database.duckdb')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    refresh(args.database, args.seed)
