# Colony Pcr Data conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `colony_pcr_data` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `colony_pcr_id` | `INTEGER` | Yes | — |
| `plate_id` | `INTEGER` | Yes | — |
| `Row` | `VARCHAR` | Yes | — |
| `C1` | `VARCHAR` | Yes | — |
| `C2` | `VARCHAR` | Yes | — |
| `C3` | `VARCHAR` | Yes | — |
| `C4` | `VARCHAR` | Yes | — |
| `C5` | `VARCHAR` | Yes | — |
| `C6` | `VARCHAR` | Yes | — |
| `C7` | `VARCHAR` | Yes | — |
| `C8` | `VARCHAR` | Yes | — |
| `C9` | `VARCHAR` | Yes | — |
| `C10` | `VARCHAR` | Yes | — |
| `C11` | `VARCHAR` | Yes | — |
| `C12` | `VARCHAR` | Yes | — |
