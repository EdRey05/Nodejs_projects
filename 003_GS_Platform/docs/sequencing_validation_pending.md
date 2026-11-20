# Sequencing Validation Pending conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `sequencing_validation_pending` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `sequencing_validation_id` | `INTEGER` | Yes | — |
| `row_number` | `INTEGER` | Yes | — |
| `jobid` | `VARCHAR` | Yes | — |
| `bbid` | `VARCHAR` | Yes | — |
| `plasmid_id` | `VARCHAR` | Yes | — |
| `notes` | `VARCHAR` | Yes | — |
| `ng_ul` | `VARCHAR` | Yes | — |
| `a260_280` | `VARCHAR` | Yes | — |
| `a260_230` | `VARCHAR` | Yes | — |
| `seq_rx` | `VARCHAR` | Yes | — |
| `seq_plate_well` | `VARCHAR` | Yes | — |
