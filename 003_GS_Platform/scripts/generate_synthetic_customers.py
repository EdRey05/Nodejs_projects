"""Create a new DuckDB file containing fictional customer records."""
import argparse
import json
from itertools import product
from pathlib import Path
from random import Random
from string import ascii_uppercase

import duckdb

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
        INSERT INTO initiated_orders (customer_id, order_number, genes_ordered)
        SELECT ?, COALESCE(MAX(order_number), 0) + 1, ?
        FROM initiated_orders
        WHERE customer_id = ?
        RETURNING order_number
    """, [customer_id, genes_ordered, customer_id]).fetchone()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data' / 'synthetic_customers_seed.duckdb')
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
            CREATE TABLE initiated_orders (
                customer_id VARCHAR NOT NULL REFERENCES customer_info(customer_id),
                order_number INTEGER NOT NULL CHECK (order_number BETWEEN 1 AND 9999),
                genes_ordered INTEGER NOT NULL CHECK (genes_ordered >= 1),
                PRIMARY KEY (customer_id, order_number)
            )
        """)
        db.execute("CREATE SEQUENCE gene_tracker_record_ids")
        db.execute("""
            CREATE TABLE gene_tracker (
                customer_id VARCHAR NOT NULL,
                order_number INTEGER NOT NULL,
                item_number INTEGER NOT NULL CHECK (item_number BETWEEN 1 AND 99),
                bbi_id VARCHAR GENERATED ALWAYS AS (
                    customer_id || lpad(CAST(order_number AS VARCHAR), 4, '0')
                    || '-' || lpad(CAST(item_number AS VARCHAR), 2, '0')
                ) VIRTUAL,
                record_id BIGINT PRIMARY KEY DEFAULT nextval('gene_tracker_record_ids'),
                FOREIGN KEY (customer_id, order_number)
                    REFERENCES initiated_orders(customer_id, order_number)
            )
        """)
        order_rng = Random(args.seed)
        for customer in order_rng.sample(customer_rows, min(15, len(customer_rows))):
            initiate_order(db, customer[0], genes_ordered=order_rng.randint(1, 15))
        db.commit()
    print(f'Created {args.count} fictional customers in {args.output}')


if __name__ == '__main__':
    main()
