# Orders conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

DuckDB table `orders` has one row per order. The default seed picks 15 distinct customers at random and inserts one initial order per customer in the sampled order. For a smaller customer seed, it picks all customers. The same seed reproduces the selection and counts. For a shuffled display, specify a sort in the query because DuckDB does not guarantee row order without one.

| Display label | Storage field | DuckDB type | Rule | Example |
| --- | --- | --- | --- | --- |
| Customer ID | `customer_id` | `VARCHAR` | Foreign key referencing `customer_info.customer_id` | `UT` |
| Order Number | `order_number` | `INTEGER` | Starts at 1 per customer. The next order uses that customer's highest existing number plus 1. | `3` |
| Genes Ordered | `genes_ordered` | `INTEGER` | Required count with a minimum of 1. The seed draws a random integer from 1 through 15 for each order. This sample range does not change the schema minimum. | `1` |
| Status | `status` | `VARCHAR` | `Cancelled`, `In Progress`, `Completed`, or `Completed (Partial)`. New orders default to `In Progress`. | `In Progress` |

Customer ID and Order Number form the primary key. With exactly four digits, the supported order range is 1–9999 per customer. Order numbers can repeat across customers. To append fictional orders, use `initiate_order` with an existing Customer ID and an integer count of at least 1. For a batch, insert in one transaction so each successive insert sees the previous order for that customer. DuckDB enforces the customer reference. The full BBI ID is generated in Progress Tracker.

Display Order ID as Customer ID plus four-digit zero-padded Order Number, e.g. `PBC0001`. The database retains separate columns. Default UI filtering shows In Progress; the other three statuses can be included with buttons.

## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `customer_id` | `VARCHAR` | No | — |
| `order_number` | `INTEGER` | No | — |
| `genes_ordered` | `INTEGER` | No | — |
| `status` | `VARCHAR` | No | 'In Progress' |

### Enforced constraints

- `NOT NULL`
- `FOREIGN KEY (customer_id) REFERENCES customer_info(customer_id)`
- `NOT NULL`
- `CHECK((order_number BETWEEN 1 AND 9999))`
- `NOT NULL`
- `CHECK((genes_ordered >= 1))`
- `NOT NULL`
- `CHECK((status IN ('Cancelled', 'In Progress', 'Completed', 'Completed (Partial)')))`
- `PRIMARY KEY(customer_id, order_number)`
