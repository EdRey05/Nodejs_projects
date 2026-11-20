# Customer Info conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

DuckDB table `customer_info` has one row per customer. Customer ID is the primary key.

The generator samples unique combinations of first name, last name, and affiliation. Each affiliation combines either University or Company with a randomly selected three-letter uppercase code. Affiliations and full names can each repeat, while the pair must be unique. Each pair gets a unique random Customer ID. Emails use lowercase first and last names followed by an uppercase affiliation suffix. The suffix starts with `U` for University or `C` for Company, followed by the three-letter affiliation code. For example, John Thomas at University XYZ gets `john.thomas.UXYZ@example.com`. Seed 42 reproduces the default sample with the same source pools.

Run from the app folder with `.\.local-runtime\python\python.exe scripts/generate_synthetic_customers.py`. The default creates 50 records in `data/GSP_database.duckdb` using seed 42. Use `--output` to choose a fresh file, and `--count` or `--seed` to change the sample. The generator refuses to overwrite an existing database. Git tracks the rules, generator, pools and the verified fictional seed database. Other DuckDB files and write-ahead logs remain ignored.

| Display label | Storage field | Data type | Required in seed DB? | Accepted values and rules | Fictional example |
| --- | --- | --- | --- | --- | --- |
| Customer ID | `customer_id` | `VARCHAR` | Yes | Unique, 2 to 5 uppercase letters (`A`–`Z`) | `UT` |
| Customer Name | `customer_name` | `VARCHAR` | Yes | First name and surname from the editable pools. Unique together with affiliation. | `Alex Sample` |
| Customer Affiliation | `customer_affiliation` | `VARCHAR` | Yes | `University` or `Company`, a space, and three random uppercase letters. May repeat. | `University ABC` |
| Sales Order | `sales_order` | `INTEGER` | Yes | Unique eight-digit number beginning with 1 or 2. The generator randomizes the remaining seven digits and retries duplicates. | `18402735` |
| Customer Email | `customer_email` | `VARCHAR` | Yes | Unique. Lowercase first and last names, then `U` or `C` and the affiliation code, under `example.com`. | `alex.sample.UABC@example.com` |

### Append synthetic customers

“Generate 20 more Customer Info rows” means inserting 20 rows into the existing `customer_info` table. A database with 50 customers ends with 70. The current generator CLI creates a fresh database, so use its candidate generator from Python for an append.

1. Read the existing Customer IDs, name and affiliation pairs, Sales Orders, and emails from the target seed database.
2. Pick and record a seed. Generate candidates with the existing name pools and affiliation rules. Skip any candidate whose ID, name and affiliation pair, Sales Order, or email already exists in the database or in the accepted batch. Draw more candidates as needed until the batch has the requested size.
3. Insert the accepted batch in one transaction. Verify the new row count and confirm that the original rows were preserved. A request for Customer Info rows alone adds no Orders. Add orders separately when requested.

## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `customer_id` | `VARCHAR` | No | — |
| `customer_name` | `VARCHAR` | No | — |
| `customer_affiliation` | `VARCHAR` | No | — |
| `sales_order` | `INTEGER` | No | — |
| `customer_email` | `VARCHAR` | No | — |

### Enforced constraints

- `PRIMARY KEY(customer_id)`
- `CHECK(regexp_full_match(customer_id, '[A-Z]{2,5}'))`
- `NOT NULL`
- `NOT NULL`
- `CHECK(regexp_full_match(customer_affiliation, '(University|Company) [A-Z]{3}'))`
- `NOT NULL`
- `UNIQUE(sales_order)`
- `CHECK((sales_order BETWEEN 10000000 AND 29999999))`
- `NOT NULL`
- `UNIQUE(customer_email)`
- `UNIQUE(customer_name, customer_affiliation)`
- `NOT NULL`

The source first-name/surname pools are in [customer_seed_pools.json](../scripts/customer_seed_pools.json). Surnames were drawn from the [2010 U.S. Census top 100](https://www.census.gov/data/developers/data-sets/surnames/2010.html). Generated people, affiliations, and email associations are fictional.
