# Job Log data conventions

This document describes the implemented synthetic seed schema and how to add fictional rows using Python and DuckDB SQL.

Use fictional records for all examples, fixtures, and development databases.

## 1. Customer Info

DuckDB table `customer_info` has one row per customer. Customer ID is the primary key.

The generator samples unique combinations of first name, last name, and affiliation. Each affiliation combines either University or Company with a randomly selected three-letter uppercase code. Affiliations and full names can each repeat, while the pair must be unique. Each pair gets a unique random Customer ID. Emails use lowercase first and last names followed by an uppercase affiliation suffix. The suffix starts with `U` for University or `C` for Company, followed by the three-letter affiliation code. For example, John Thomas at University XYZ gets `john.thomas.UXYZ@example.com`. Seed 42 reproduces the default sample with the same source pools.

Run from the app folder with `.\.local-runtime\python\python.exe scripts/generate_synthetic_customers.py`. The default creates 50 records in `data/synthetic_customers_seed.duckdb` using seed 42. Use `--output` to choose a fresh file, and `--count` or `--seed` to change the sample. The generator refuses to overwrite an existing database. Git tracks the rules, generator, pools and the verified fictional seed database. Other DuckDB files and write-ahead logs remain ignored.

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
3. Insert the accepted batch in one transaction. Verify the new row count and confirm that the original rows were preserved. A request for Customer Info rows alone adds no Initiated Orders. Add orders separately when requested.

## 2. Initiated Orders

DuckDB table `initiated_orders` has one row per order. The default seed picks 15 distinct customers at random and inserts one initial order per customer in the sampled order. For a smaller customer seed, it picks all customers. The same seed reproduces the selection and counts. For a shuffled display, specify a sort in the query because DuckDB does not guarantee row order without one.

| Display label | Storage field | DuckDB type | Rule | Example |
| --- | --- | --- | --- | --- |
| Customer ID | `customer_id` | `VARCHAR` | Foreign key referencing `customer_info.customer_id` | `UT` |
| Order Number | `order_number` | `INTEGER` | Starts at 1 per customer. The next order uses that customer's highest existing number plus 1. | `3` |
| Genes Ordered | `genes_ordered` | `INTEGER` | Required count with a minimum of 1. The seed draws a random integer from 1 through 15 for each order. This sample range does not change the schema minimum. | `1` |

Customer ID and Order Number form the primary key. With exactly four digits, the supported order range is 1–9999 per customer. Order numbers can repeat across customers. To append fictional orders, use `initiate_order` with an existing Customer ID and an integer count of at least 1. For a batch, insert in one transaction so each successive insert sees the previous order for that customer. DuckDB enforces the customer reference. The full BBI ID is generated in Gene Tracker.

## 3. Gene Tracker

DuckDB table `gene_tracker` can have multiple records per item. Customer ID and Order Number together reference an existing Initiated Orders row.

| Display label | Storage field | DuckDB type | Rule |
| --- | --- | --- | --- |
| Customer ID | `customer_id` | `VARCHAR` | Part of the foreign key to Initiated Orders. |
| Order Number | `order_number` | `INTEGER` | Part of the foreign key to Initiated Orders. |
| Item Number | `item_number` | `INTEGER` | Starts at 1 for each order. The schema allows 1–99. |
| BBI ID | `bbi_id` | Generated `VARCHAR` | Customer ID, four-digit order number, hyphen, and exactly two-digit item number, such as `UT0001-01`. |

An internal generated `record_id` (`BIGINT`) is the primary key. Multiple records can share the same customer, order, and item number and therefore the same BBI ID. When populating this table, use item numbers up to the order's Genes Ordered count. An order with more than 99 items needs a format decision before its tracker rows are generated. The seed starts with an empty Gene Tracker table.

### Work Number convention

Work Number is the second display column, after BBI ID. Store it as unique text. The original record uses a nine-character core. A revision uses the same core followed immediately by a letter suffix. Suffixes generally use one to three letters, with `FRAG` as an explicit four-letter exception. Create a revision by copying the existing row, keeping its BBI ID, assigning the new Work Number, and editing the applicable fields in the copy. Preserve the original row as history.

The first character of the nine-character core is an uppercase project code. The initial allowed set is `X`, `Z`, `S`, `M`, and `R`. Extend this list when a new code is defined.

| Prefix | Project category |
| --- | --- |
| `X` | Standard project that does not require gel. |
| `Z` | Standard project requiring gel. |
| `S` | Subcontracted subcloning project. |
| `M` | Mutagenesis project. |
| `R` | Re-prep of a previous project, for example after a QC issue, shipping issue, or customer complaint. |

Non-standard projects may or may not require QC gel. Determine the requirement for each project without relying solely on the Work Number prefix.

The second character of the core is an uppercase code for the requested deliverable.

| Code | Deliverable |
| --- | --- |
| `P` | Project in the standard pUC57 vector. |
| `F` | Fragment delivered as-is, without a vector. |
| `V` | Project in a vector other than the standard pUC57 vector. |

The third character is `1` for a standard quantity or `2` for a non-standard quantity. Standard quantities depend on the deliverable code in character 2. The ranges include both endpoints.

| Deliverable code | Standard quantity (`1`) |
| --- | --- |
| `P` or `V` | 2–4 µg |
| `F` | 200–400 ng |

Quantities outside the applicable range use `2`. A separate column will record the quantity once that column is defined.

The fourth character is the last digit of the current year at assignment, such as `6` for 2026. The fifth character encodes the month at assignment. January through September use `1` through `9`. October uses `A`, November uses `B`, and December uses `C`.

Characters 6–9 are a counter from 1 through 9999, padded on the left with zeros to four digits. The first valid counter is `0001` and the last is `9999`. The scope of the counter and when it resets are still to be defined.

Examples of complete nine-character cores include `XV16B0547`, `ZF16B0569`, and `XP16A0543`.

The nine-character core records the original plan. For a revision, preserve all nine characters, including the original deliverable code in character 2. Append the applicable suffix and record the revised deliverable on the copied row.

| Suffix | Revised deliverable | Example |
| --- | --- | --- |
| `P` | Originally planned as a fragment, now recorded as a pUC57 vector deliverable. | `ZF16B0569` → `ZF16B0569P` |
| `FRAG` | Originally planned in a vector, now recorded as a fragment deliverable. | `XV16B0547` → `XV16B0547FRAG` |

The documented suffixes are uppercase. Capitalization rules for other suffixes are pending. Database validation has yet to be implemented.

### Order Date convention

Order Date is the third display column, after Work Number. Display it as `MM/DD/YYYY`, with forward slashes and a four-digit year. For example, November 8, 2026 is `11/08/2026`.

### Gene Name convention

Gene Name is the fourth display column, after Order Date. Use text (`VARCHAR`) for the label. For each new synthetic name, find the highest numeric suffix among existing names in the `SYNGENE-` series and increment it by one. Start at `SYNGENE-0001` when the series is empty. Pad to at least four digits, so `SYNGENE-0042` is followed by `SYNGENE-0043`. For a batch, increment once per new name. A revision can retain the original Gene Name. Database implementation is pending.

### Vector convention

Vector is the fifth display column, after Gene Name. Store the label as text (`VARCHAR`). The [Vector label pool](scripts/vector_seed_pool.json) contains the supplied names in their original order and spelling. Spelling and suffix variants are kept as separate labels until alias rules are defined. Database implementation is pending.

### Cloning Site convention

Cloning Site is the sixth display column, after Vector. Store the label as text (`VARCHAR`). The [Cloning Site label pool](scripts/cloning_site_seed_pool.json) preserves the supplied labels in order.

For fictional rows, randomly sample Vector and Cloning Site independently from their respective pools. Labels can repeat across rows. The sampled pairs are fixture data and carry no compatibility guarantee. Database implementation is pending.

### Resistance convention

Resistance is the seventh display column, after Cloning Site. Store the label as text (`VARCHAR`). The [Resistance label pool](scripts/resistance_seed_pool.json) preserves the supplied options in order for synthetic rows. These labels are fixture data. Database implementation is pending.

## Rules to confirm

- What one row represents and how it is uniquely identified.
- Which values are entered, imported, or calculated.
- How blanks, defaults, duplicates, and edits are handled.
- Which columns need a fixed list of values and how those lists are maintained.

The editable source pools are in `scripts/customer_seed_pools.json`. The surname list uses the [2010 U.S. Census top 100](https://www.census.gov/data/developers/data-sets/surnames/2010.html). Generated people, organizational associations, and email addresses are fictional.
