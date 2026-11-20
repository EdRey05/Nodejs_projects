"""Read the bundled fictional database for the tracker previews."""
import json
from pathlib import Path

import duckdb


QUERIES = {
    "customers": """
        SELECT customer_id, customer_name, customer_affiliation, sales_order, customer_email
        FROM customer_info ORDER BY customer_id
    """,
    "orders": """
        SELECT customer_id || lpad(CAST(order_number AS VARCHAR), 4, '0') AS order_id,
               genes_ordered, status
        FROM orders ORDER BY customer_id, order_number
    """,
    "progress": """
        SELECT bbi_id, work_number, status, strftime(order_date, '%m/%d/%Y') AS order_date,
               gene_name, vector, cloning_site, resistance, length, quantity,
               delivery_format, notes
        FROM progress_tracker ORDER BY record_id
    """,
}

if __name__ == "__main__":
    database = Path(__file__).resolve().parents[1] / "data" / "GSP_database.duckdb"
    with duckdb.connect(str(database), read_only=True) as connection:
        results = {}
        for name, query in QUERIES.items():
            cursor = connection.execute(query)
            columns = [column[0] for column in cursor.description]
            results[name] = [dict(zip(columns, row)) for row in cursor.fetchall()]
    print(json.dumps(results))
