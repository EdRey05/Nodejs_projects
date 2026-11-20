# Primer Log conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

The seed database includes an empty `primer_log` table. Date Code uses the shared `YMMDD` validation and belongs to this log. Matching codes in other logs do not link records.

| Column | DuckDB type | Rule |
| --- | --- | --- |
| Date Code | `VARCHAR` | Required, valid `YMMDD` code. |
| Work Number | `VARCHAR` | Required, references `progress_tracker.work_number`. |
| Colony PCR Primers | `VARCHAR[]` | Ordered display labels, defaults to `[]`. |
| Amplification Primers | `VARCHAR[]` | Ordered display labels, defaults to `[]`. |
| Sequencing Primers | `VARCHAR[]` | Ordered display labels, defaults to `[]`. |

Date Code and Work Number form the primary key. The lists are for labels. Use `array_length()` to count entries and `unnest()` to read them individually. Each list can have a different length.

Each list stores primer labels as individual strings, preserving order; no slash concatenation or fixed twenty-column layout. Typical requested lists contain 1–25 values, but no hard length limit is currently enforced. Empty lists are `[]`. Sequence fields remain empty elsewhere; no sequences are generated.

## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `date_code` | `VARCHAR` | No | — |
| `work_number` | `VARCHAR` | No | — |
| `colony_pcr_primers` | `VARCHAR[]` | No | main.list_value() |
| `amplification_primers` | `VARCHAR[]` | No | main.list_value() |
| `sequencing_primers` | `VARCHAR[]` | No | main.list_value() |

### Enforced constraints

- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
- `CHECK((regexp_full_match(date_code, '[A-Z][0-9]{4}') AND (try_strptime((CAST(((2026 + ascii(substr(date_code, 1, 1))) - ascii('A')) AS VARCHAR) || substr(date_code, 2)), '%Y%m%d') IS NOT NULL)))`
- `FOREIGN KEY (work_number) REFERENCES progress_tracker(work_number)`
- `PRIMARY KEY(date_code, work_number)`
- `NOT NULL`
- `NOT NULL`
