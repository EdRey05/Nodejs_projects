# Sequencing Order Data conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `sequencing_order_data` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `sequencing_order_id` | `INTEGER` | Yes | — |
| `row_number` | `INTEGER` | Yes | — |
| `well_pos` | `VARCHAR` | Yes | — |
| `sample_type` | `VARCHAR` | Yes | — |
| `seq_sample_id` | `VARCHAR` | Yes | — |
| `seq_primer_id` | `VARCHAR` | Yes | — |
| `file_name_request` | `VARCHAR` | Yes | — |
| `conc_est` | `VARCHAR` | Yes | — |
| `comment` | `VARCHAR` | Yes | — |
| `dna_position` | `VARCHAR` | Yes | — |
| `layout_wo` | `VARCHAR` | Yes | — |
| `new_primer_id` | `VARCHAR` | Yes | — |
| `new_file_name` | `VARCHAR` | Yes | — |
