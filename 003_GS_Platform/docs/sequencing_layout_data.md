# Sequencing Layout Data conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `sequencing_layout_data` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `sequencing_layout_id` | `INTEGER` | Yes | — |
| `row_number` | `INTEGER` | Yes | — |
| `well` | `VARCHAR` | Yes | — |
| `wo` | `VARCHAR` | Yes | — |
| `dna` | `VARCHAR` | Yes | — |
| `primer` | `VARCHAR` | Yes | — |
| `file_name` | `VARCHAR` | Yes | — |
