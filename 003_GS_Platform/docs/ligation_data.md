# Ligation Data conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `ligation_data` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `ligation_id` | `INTEGER` | Yes | — |
| `Well ` | `VARCHAR` | Yes | — |
| `Name` | `VARCHAR` | Yes | — |
| `BBID` | `VARCHAR` | Yes | — |
| `Vector ` | `VARCHAR` | Yes | — |
| `Enzyme` | `VARCHAR` | Yes | — |
| `Vector Lot` | `VARCHAR` | Yes | — |
| `Vector Position` | `VARCHAR` | Yes | — |
| `Vol of Vector` | `VARCHAR` | Yes | — |
| `Insert 1` | `VARCHAR` | Yes | — |
| `Well position` | `VARCHAR` | Yes | — |
| `Vol of Insert` | `VARCHAR` | Yes | — |
| `Insert 2` | `VARCHAR` | Yes | — |
| `Insert 3` | `VARCHAR` | Yes | — |
| `H2O Volume` | `VARCHAR` | Yes | — |
| `2XHF` | `VARCHAR` | Yes | — |
| `Len` | `VARCHAR` | Yes | — |
| `Resistance` | `VARCHAR` | Yes | — |
| `worksheet1` | `VARCHAR` | Yes | — |
| `worksheet2` | `VARCHAR` | Yes | — |
