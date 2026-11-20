"""Create a new DuckDB file containing fictional customer records."""
import argparse
import sys
import json
from itertools import product
from pathlib import Path
from datetime import date
from random import Random
from string import ascii_uppercase

import duckdb
from tracker_seed_rules import pool, row_values, january_order_dates

POOLS = json.loads(Path(__file__).with_name('customer_seed_pools.json').read_text(encoding='utf-8'))
FIRST_NAMES = POOLS['first_names']
LAST_NAMES = POOLS['last_names']
AFFILIATION_TYPES = ("University", "Company")
AFFILIATION_COUNT = len(AFFILIATION_TYPES) * 26**3
MAX_CUSTOMERS = min(len(FIRST_NAMES) * len(LAST_NAMES) * AFFILIATION_COUNT,
                    sum(26**length for length in range(2, 6)))


def customers(count, seed):
    rng = Random(seed)
    names = list(product(FIRST_NAMES, LAST_NAMES))
    combinations = rng.sample(range(len(names) * AFFILIATION_COUNT), count)
    used_ids = set()
    used_sales_orders = set()
    for combination in combinations:
        name_index, affiliation_index = divmod(combination, AFFILIATION_COUNT)
        first, last = names[name_index]
        kind, code = divmod(affiliation_index, 26**3)
        letters = ''.join(ascii_uppercase[(code // place) % 26] for place in (676, 26, 1))
        affiliation = f'{AFFILIATION_TYPES[kind]} {letters}'
        while True:
            customer_id = ''.join(rng.choices(ascii_uppercase, k=rng.randint(2, 5)))
            if customer_id not in used_ids:
                used_ids.add(customer_id)
                break
        sales_order = rng.randint(10000000, 29999999)
        while sales_order in used_sales_orders:
            sales_order = rng.randint(10000000, 29999999)
        used_sales_orders.add(sales_order)
        local_part = f'{first.lower()}.{last.lower()}'
        email_suffix = f'{AFFILIATION_TYPES[kind][0]}{letters}'
        yield (customer_id, f'{first} {last}', affiliation,
               sales_order, f'{local_part}.{email_suffix}@example.com')


def initiate_order(db, customer_id, genes_ordered):
    """Allocate the next order number for an existing customer."""
    return db.execute("""
        INSERT INTO orders (customer_id, order_number, genes_ordered)
        SELECT ?, COALESCE(MAX(order_number), 0) + 1, ?
        FROM orders
        WHERE customer_id = ?
        RETURNING order_number
    """, [customer_id, genes_ordered, customer_id]).fetchone()


def weighted_choice(rng, options):
    """Choose one value from (value, weight) pairs."""
    values, weights = zip(*options)
    return rng.choices(values, weights=weights, k=1)[0]


DELIVERY_FORMAT_WEIGHTS = [
    (base + suffix, weight)
    for base, weight in [('Lyophilized', 5), ('In solution', 1)]
    for suffix in ('', ' + Gel', ' + Gly', ' + Gel + Gly')
]


def fixture_delivery_format(rng):
    return weighted_choice(rng, DELIVERY_FORMAT_WEIGHTS)


def weighted_integer(rng, ranges):
    """Pick a weighted inclusive range, then a uniform integer inside it."""
    low, high = weighted_choice(rng, [((low, high), weight) for low, high, weight in ranges])
    return rng.randint(low, high)


def seed_progress_tracker(db, seed):
    """Create one synthetic row per ordered item using the shared rules."""
    rng, dates, delivery = Random(seed), Random(f'{seed}:order-date'), Random(f'{seed}:delivery-format')
    references = dict(db.execute('SELECT vector, resistance FROM vector_log ORDER BY vector').fetchall())
    serial = 0
    orders = db.execute('SELECT customer_id, order_number, genes_ordered FROM orders ORDER BY customer_id, order_number').fetchall()
    order_dates = january_order_dates([(c, n) for c, n, _ in orders], dates)
    for customer_id, order_number, count in orders:
        if count > 99:
            raise ValueError('Two-digit item numbers support up to 99 items per order')
        order_date = order_dates[(customer_id, order_number)]
        for item in range(1, count + 1):
            serial += 1
            values = row_values(rng, delivery, order_date, serial, references)
            db.execute("""INSERT INTO progress_tracker
                (customer_id, order_number, item_number, order_date, gene_name,
                 vector, cloning_site, resistance, length, quantity, delivery_format, work_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [customer_id, order_number, item, order_date, f'SYNGENE-{serial:04d}', *values.values()])


DATE_CODE_COLUMN = """date_code VARCHAR NOT NULL CHECK (
                regexp_full_match(date_code, '[A-Z][0-9]{4}')
                AND try_strptime(
                    CAST(2026 + ascii(substr(date_code, 1, 1)) - ascii('A') AS VARCHAR)
                    || substr(date_code, 2), '%Y%m%d'
                ) IS NOT NULL
            )"""


def create_oligo_log(db):
    """Create the administrative batch-to-work register."""
    db.execute(f"""
        CREATE TABLE oligo_log (
            {DATE_CODE_COLUMN},
            work_number VARCHAR NOT NULL REFERENCES progress_tracker(work_number),
            sequence VARCHAR CHECK (sequence IS NULL),
            purity VARCHAR CHECK (purity IN ('Pass', 'Fail')),
            yield VARCHAR CHECK (yield IN ('Pass', 'Fail')),
            PRIMARY KEY (date_code, work_number)
        )
    """)


def create_primer_log(db):
    """Create an empty register of ordered display labels."""
    db.execute(f"""
        CREATE TABLE primer_log (
            {DATE_CODE_COLUMN},
            work_number VARCHAR NOT NULL REFERENCES progress_tracker(work_number),
            colony_pcr_primers VARCHAR[] NOT NULL DEFAULT [],
            amplification_primers VARCHAR[] NOT NULL DEFAULT [],
            sequencing_primers VARCHAR[] NOT NULL DEFAULT [],
            PRIMARY KEY (date_code, work_number)
        )
    """)


def create_vector_log(db):
    """Reference metadata includes provenance and explicitly unresolved labels."""
    db.execute("""CREATE TABLE vector_log (
        vector VARCHAR PRIMARY KEY, resistance VARCHAR NOT NULL DEFAULT '',
        sequence VARCHAR NOT NULL DEFAULT '', source_url VARCHAR NOT NULL DEFAULT '',
        verification_status VARCHAR NOT NULL DEFAULT 'Unverified')""")
    db.executemany('INSERT INTO vector_log (vector,resistance,source_url,verification_status) VALUES (?,?,?,?)',
        [(r['vector'],r['resistance'],r['source_url'],r['verification_status']) for r in pool('vector_reference.json')])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data' / 'GSP_database.duckdb')
    parser.add_argument('--count', type=int, default=50)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    if not 1 <= args.count <= MAX_CUSTOMERS:
        parser.error(f'count must be between 1 and {MAX_CUSTOMERS}')
    if args.output.exists():
        parser.error('output already exists; choose a new filename')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(args.output)) as db:
        db.begin()
        db.execute("""
            CREATE TABLE customer_info (
                customer_id VARCHAR PRIMARY KEY CHECK (regexp_full_match(customer_id, '[A-Z]{2,5}')),
                customer_name VARCHAR NOT NULL,
                customer_affiliation VARCHAR NOT NULL CHECK (regexp_full_match(customer_affiliation, '(University|Company) [A-Z]{3}')),
                sales_order INTEGER NOT NULL UNIQUE CHECK (sales_order BETWEEN 10000000 AND 29999999),
                customer_email VARCHAR NOT NULL UNIQUE,
                UNIQUE (customer_name, customer_affiliation)
            )
        """)
        customer_rows = list(customers(args.count, args.seed))
        db.executemany('INSERT INTO customer_info VALUES (?, ?, ?, ?, ?)', customer_rows)
        db.execute("""
            CREATE TABLE orders (
                customer_id VARCHAR NOT NULL REFERENCES customer_info(customer_id),
                order_number INTEGER NOT NULL CHECK (order_number BETWEEN 1 AND 9999),
                genes_ordered INTEGER NOT NULL CHECK (genes_ordered >= 1),
                status VARCHAR NOT NULL DEFAULT 'In Progress'
                    CHECK (status IN ('Cancelled', 'In Progress', 'Completed', 'Completed (Partial)')),
                PRIMARY KEY (customer_id, order_number)
            )
        """)
        db.execute("CREATE SEQUENCE progress_tracker_record_ids")
        db.execute("""
            CREATE TABLE progress_tracker (
                customer_id VARCHAR NOT NULL,
                order_number INTEGER NOT NULL,
                item_number INTEGER NOT NULL CHECK (item_number BETWEEN 1 AND 99),
                bbi_id VARCHAR GENERATED ALWAYS AS (
                    customer_id || lpad(CAST(order_number AS VARCHAR), 4, '0')
                    || '-' || lpad(CAST(item_number AS VARCHAR), 2, '0')
                ) VIRTUAL,
                work_number VARCHAR NOT NULL UNIQUE,
                status VARCHAR NOT NULL DEFAULT '0. Onboarding',
                order_date DATE NOT NULL,
                gene_name VARCHAR NOT NULL,
                vector VARCHAR NOT NULL,
                cloning_site VARCHAR NOT NULL,
                resistance VARCHAR NOT NULL,
                length INTEGER NOT NULL,
                quantity VARCHAR NOT NULL,
                delivery_format VARCHAR NOT NULL,
                insert_sequence VARCHAR,
                final_vector_sequence VARCHAR,
                plasmid_number VARCHAR,
                tube_id VARCHAR,
                host VARCHAR,
                temperature VARCHAR,
                competent_cells VARCHAR,
                record_id BIGINT PRIMARY KEY DEFAULT nextval('progress_tracker_record_ids'),
                notes VARCHAR,
                FOREIGN KEY (customer_id, order_number)
                    REFERENCES orders(customer_id, order_number)
            )
        """)
        order_rng = Random(args.seed)
        for customer in order_rng.sample(customer_rows, min(15, len(customer_rows))):
            initiate_order(db, customer[0], genes_ordered=order_rng.randint(1, 15))
        # Include examples of each status in the synthetic preview.
        for status, limit, offset in [('Completed', 2, 0), ('Cancelled', 2, 2),
                                      ('Completed (Partial)', 1, 4)]:
            db.execute("""
                UPDATE orders SET status = ?
                WHERE (customer_id, order_number) IN (
                    SELECT customer_id, order_number FROM orders
                    ORDER BY customer_id, order_number LIMIT ? OFFSET ?
                )
            """, [status, limit, offset])
        create_vector_log(db)
        seed_progress_tracker(db, args.seed)
        create_oligo_log(db)
        create_primer_log(db)
        db.commit()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python_tools'))
    import db_ops
    db_ops.DB_PATH = str(args.output.resolve())
    db_ops.DATA_DIR = str(args.output.resolve().parent)
    db_ops.SCHEMA_PATH = str(Path(__file__).resolve().parents[1] / 'python_tools/schema.yaml')
    db_ops._bootstrap_done = True
    db_ops.init_db()
    print(f'Created {args.count} fictional customers in {args.output}')


if __name__ == '__main__':
    main()
