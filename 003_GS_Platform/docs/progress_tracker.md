# Progress Tracker conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

DuckDB table `progress_tracker` can have multiple records per item. Customer ID and Order Number together reference an existing Orders row.

| Display label | Storage field | DuckDB type | Rule |
| --- | --- | --- | --- |
| Customer ID | `customer_id` | `VARCHAR` | Part of the foreign key to Orders. |
| Order Number | `order_number` | `INTEGER` | Part of the foreign key to Orders. |
| Item Number | `item_number` | `INTEGER` | Starts at 1 for each order. The schema allows 1–99. |
| BBI ID | `bbi_id` | Generated `VARCHAR` | Customer ID, four-digit order number, hyphen, and exactly two-digit item number, such as `UT0001-01`. |

An internal generated `record_id` (`BIGINT`) is the primary key. Multiple records can share the same customer, order, and item number and therefore the same BBI ID. When populating this table, use item numbers up to the order's Genes Ordered count. An order with more than 99 items needs a format decision before its tracker rows are generated. The seed creates one Progress Tracker row per ordered item, with one January 2026 date shared across its order, assigned chronologically in Work Number counter order, sequential SYNGENE names, and populated pool-based fields. New rows start at `0. Onboarding`; sequences and later-stage fields stay NULL. BBI IDs, record IDs, names, and existing status/notes are preserved by the explicit refresh script.

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

The third character is `1` when the original Quantity falls within the standard range for the deliverable code in character 2, including both endpoints. Use `2` for an allowed quantity outside that range.

| Deliverable code | Standard quantity (`1`) |
| --- | --- |
| `P` or `V` | `2-4 ug` |
| `F` | `200-400 ng` |

Compare the numeric amount and unit rather than the label text. The standard range label itself uses `1`. Exact amounts at an endpoint also use `1`, including `4 ug` for plasmids and `400 ng` for fragments. Revisions retain the original nine-character core.

For this synthetic seed, the fourth character is the last digit of Order Date's year, such as `6` for 2026. The fifth character encodes Order Date's month. January through September use `1` through `9`. October uses `A`, November uses `B`, and December uses `C`.

Characters 6–9 are a counter from 1 through 9999, padded on the left with zeros to four digits. The first valid counter is `0001` and the last is `9999`. For the current synthetic seed, allocate one global counter in customer/order/item/record order, without reset, starting at 0001. For new rows, continue after the maximum existing core counter; do not reuse counters. Production reset policy remains open. Revisions retain the original core and add their suffix.

Examples of complete nine-character cores include `XV16B0547`, `ZF16B0569`, and `XP16A0543`.

The nine-character core records the original plan. For a revision, preserve all nine characters, including the original deliverable code in character 2. Append the applicable suffix and record the revised deliverable on the copied row.

| Suffix | Revised deliverable | Example |
| --- | --- | --- |
| `P` | Originally planned as a fragment, now recorded as a pUC57 vector deliverable. | `ZF16B0569` → `ZF16B0569P` |
| `FRAG` | Originally planned in a vector, now recorded as a fragment deliverable. | `XV16B0547` → `XV16B0547FRAG` |

The documented suffixes are uppercase. Capitalization rules for other suffixes are pending. Database validation has yet to be implemented.

### Order Date convention

Order Date is the fourth display column, after Status. Display it as `MM/DD/YYYY`, with forward slashes and a four-digit year. For example, November 8, 2026 is `11/08/2026`.

### Gene Name convention

Gene Name is the fifth display column, after Order Date. Use text (`VARCHAR`) for the label. For each new synthetic name, find the highest numeric suffix among existing names in the `SYNGENE-` series and increment it by one. Start at `SYNGENE-0001` when the series is empty. Pad to at least four digits, so `SYNGENE-0042` is followed by `SYNGENE-0043`. For a batch, increment once per new name. A revision can retain the original Gene Name.

### Vector convention

Vector is the sixth display column, after Gene Name. Store the label as text (`VARCHAR`). The [Vector label pool](../scripts/vector_seed_pool.json) contains the supplied names in their original order and spelling. Spelling and suffix variants are kept as separate labels until alias rules are defined. The seed uses the rules and source pools documented here.

### Cloning Site convention

Cloning Site is the seventh display column, after Vector. Store the label as text (`VARCHAR`). The [Cloning Site label pool](../scripts/cloning_site_seed_pool.json) preserves the supplied labels in order.

For fictional rows, randomly sample Vector and Cloning Site independently from their respective pools. Labels can repeat across rows. The sampled pairs are fixture data and carry no compatibility guarantee. The seed uses the rules and source pools documented here.

### Resistance convention

Resistance is the eighth display column, after Cloning Site. Store the label as text (`VARCHAR`). Resistance is copied from `vector_log` for the selected vector; it is never sampled independently. The seed uses the rules and source pools documented here.

### Length convention

Length is the ninth display column, after Resistance. Store it as an `INTEGER`. The reusable `weighted_integer` helper chooses 20–10,000 with weight 2 or 10,001–20,000 with weight 1, then draws a uniform integer within the chosen interval.

### Quantity convention

Quantity is the tenth display column, after Length. Store it as text (`VARCHAR`) so exact amounts and ranges retain their units. Use `ng` and `ug` in the stored labels.

| Deliverable | Allowed synthetic labels |
| --- | --- |
| DNA fragment | `200-400 ng`, `400 ng`, `1 ug`, `2 ug`, `4 ug` |
| Plasmid | `2-4 ug`, `4 ug`, `10 ug`, `50 ug`, `100 ug`, `200 ug`, `500 ug` |

For each synthetic row, randomly choose one label from the set for its recorded deliverable. When assigning the original Work Number, apply the inclusive range rule for character 3 above. The `1 ug`, `2 ug`, and `4 ug` fragment options fall outside the fragment standard range and use `2`. For a revision, choose the Quantity label for the revised deliverable and retain the original Work Number core. The seed uses the rules and source pools documented here.

### Delivery Format convention

Delivery Format is the eleventh display column, after Quantity. Store the requested delivery format and any add-ons as a text label (`VARCHAR`). The default label is `Lyophilized`. Use `In solution` when explicitly requested.

| Label | Recorded add-ons |
| --- | --- |
| `Lyophilized` | None |
| `In solution` | None |
| `Lyophilized + Gel` | QC gel |
| `Lyophilized + Gly` | Glycerol stock |
| `Lyophilized + Gel + Gly` | QC gel and glycerol stock |
| `In solution + Gel` | QC gel |
| `In solution + Gly` | Glycerol stock |
| `In solution + Gel + Gly` | QC gel and glycerol stock |

Record the gel add-on from the project requirements. The Work Number prefix alone does not determine it. The seed uses the rules and source pools documented here.

### Status convention

Status is the third display column, after Work Number. Store it as text (`VARCHAR`) using one of the literal status labels below. Keep the numeric prefix, period, and space as part of the label. `12. Prepared for shipment` applies regardless of the recorded Delivery Format.

```text
X. Cancelled
0. Onboarding
1. Synthesizing oligos
2. Amplification PCR
3. Fragment assembly
4. Fragment sequencing
5. Correcting errors (fragments)
6. Vector insertion
7. Selecting clones
8. Sequencing gene (first round)
9. Correcting errors (gene)
10. Sequencing gene (final round)
11. QC and lyophilization
12. Prepared for shipment
13. Shipped
```

New Progress Tracker rows start with `0. Onboarding`. Status changes only through an explicit later update. Existing rows retain their current stage; legacy cancellation labels `0. Cancel` and `0. Cancelled` migrate to `X. Cancelled`. Onboarding belongs to the In Progress filter group; only `X. Cancelled` belongs to Cancelled.

### Sequence field conventions

| Display column | Label | Storage type |
| --- | --- | --- |
| 12 | Insert Sequence | `VARCHAR` |
| 13 | Final Vector Sequence | `VARCHAR` |

Both fields accept long text. They are `NULL` in synthetic seed data.

### Fields recorded later

These five fields start blank on new Progress Tracker rows and can be filled in later. No additional validation rules have been defined. The synthetic seed stores these values as `NULL`.

| Display column | Label | Storage type |
| --- | --- | --- |
| 14 | Plasmid Number | `VARCHAR` |
| 15 | Tube ID | `VARCHAR` |
| 16 | Host | `VARCHAR` |
| 17 | Temperature | `VARCHAR` |
| 18 | Competent Cells | `VARCHAR` |

### Notes convention

Notes is the last displayed column. It stores optional free text and starts blank.

## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `customer_id` | `VARCHAR` | No | — |
| `order_number` | `INTEGER` | No | — |
| `item_number` | `INTEGER` | No | — |
| `bbi_id` | `VARCHAR` | Yes | CAST((((customer_id \|\| lpad(CAST(order_number AS VARCHAR), 4, '0')) \|\| '-') \|\| lpad(CAST(item_number AS VARCHAR), 2, '0')) AS VARCHAR) |
| `work_number` | `VARCHAR` | No | — |
| `status` | `VARCHAR` | No | '0. Onboarding' |
| `order_date` | `DATE` | No | — |
| `gene_name` | `VARCHAR` | No | — |
| `vector` | `VARCHAR` | No | — |
| `cloning_site` | `VARCHAR` | No | — |
| `resistance` | `VARCHAR` | No | — |
| `length` | `INTEGER` | No | — |
| `quantity` | `VARCHAR` | No | — |
| `delivery_format` | `VARCHAR` | No | — |
| `insert_sequence` | `VARCHAR` | Yes | — |
| `final_vector_sequence` | `VARCHAR` | Yes | — |
| `plasmid_number` | `VARCHAR` | Yes | — |
| `tube_id` | `VARCHAR` | Yes | — |
| `host` | `VARCHAR` | Yes | — |
| `temperature` | `VARCHAR` | Yes | — |
| `competent_cells` | `VARCHAR` | Yes | — |
| `record_id` | `BIGINT` | No | nextval('progress_tracker_record_ids') |
| `notes` | `VARCHAR` | Yes | — |

### Enforced constraints

- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `CHECK((item_number BETWEEN 1 AND 99))`
- `NOT NULL`
- `UNIQUE(work_number)`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `PRIMARY KEY(record_id)`
- `FOREIGN KEY (customer_id, order_number) REFERENCES orders(customer_id, order_number)`
- `NOT NULL`
