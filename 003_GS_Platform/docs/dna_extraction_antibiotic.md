# Dna Extraction Antibiotic conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `dna_extraction_antibiotic` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `dna_extraction_id` | `INTEGER` | Yes | — |
| `plate_id` | `INTEGER` | Yes | — |
| `well_id` | `VARCHAR` | Yes | — |
| `value` | `VARCHAR` | Yes | — |
