# Oligo Log conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

The seed database includes an empty administrative register named `oligo_log`. Each row links one batch date to one existing Progress Tracker Work Number. Date Code and Work Number together identify a register entry.

### Date Code convention

Date Code is a five-character text value in `YMMDD` format. `Y` is the uppercase year code, starting with `A` for 2026, `B` for 2027, and `C` for 2028. This convention ends at `Z` for 2051. `MM` and `DD` are the zero-padded month and day. Validate the actual calendar date, including leap days. November 19, 2026 is `A1119`.

| Column | DuckDB type | Rule |
| --- | --- | --- |
| Date Code | `VARCHAR` | Required, valid `YMMDD` code. |
| Work Number | `VARCHAR` | Required, references `progress_tracker.work_number`. |
| Sequence | `VARCHAR` | Empty placeholder. Must be `NULL`. |
| Purity | `VARCHAR` | `Pass`, `Fail`, or blank if unrecorded. |
| Yield | `VARCHAR` | `Pass`, `Fail`, or blank if unrecorded. |

### Agreed fields pending implementation

The requested Well Position is one of the 96 strings A01–A12, B01–B12, through H01–H12. Fragment Number is flexible text such as A, B, C, A1, A2, B1, B2; it may describe sub-fragments. These two columns were omitted from the earlier implementation and are **not yet present in the database**. The schema below describes what actually exists. No rows should be prefilled yet. Date Codes in different logs are independent, not cross-log foreign keys.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `date_code` | `VARCHAR` | No | — |
| `work_number` | `VARCHAR` | No | — |
| `sequence` | `VARCHAR` | Yes | — |
| `purity` | `VARCHAR` | Yes | — |
| `yield` | `VARCHAR` | Yes | — |

### Enforced constraints

- `CHECK((regexp_full_match(date_code, '[A-Z][0-9]{4}') AND (try_strptime((CAST(((2026 + ascii(substr(date_code, 1, 1))) - ascii('A')) AS VARCHAR) || substr(date_code, 2)), '%Y%m%d') IS NOT NULL)))`
- `FOREIGN KEY (work_number) REFERENCES progress_tracker(work_number)`
- `CHECK(("sequence" IS NULL))`
- `CHECK((purity IN ('Pass', 'Fail')))`
- `CHECK((yield IN ('Pass', 'Fail')))`
- `PRIMARY KEY(date_code, work_number)`
- `NOT NULL`
- `NOT NULL`
