# Job Log conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `job_log` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `work_no` | `VARCHAR` | Yes | — |
| `bbi_id` | `VARCHAR` | Yes | — |
| `order_date` | `VARCHAR` | Yes | — |
| `so` | `VARCHAR` | Yes | — |
| `gene_name` | `VARCHAR` | Yes | — |
| `vector` | `VARCHAR` | Yes | — |
| `cloning_site` | `VARCHAR` | Yes | — |
| `resistance` | `VARCHAR` | Yes | — |
| `length_bp` | `INTEGER` | Yes | — |
| `quantity` | `VARCHAR` | Yes | — |
| `prep` | `VARCHAR` | Yes | — |
| `stage` | `VARCHAR` | Yes | — |
| `insert_sequence` | `VARCHAR` | Yes | — |
| `final_vector_sequence` | `VARCHAR` | Yes | — |
| `plasmid_no` | `VARCHAR` | Yes | — |
| `tube_id` | `VARCHAR` | Yes | — |
| `host` | `VARCHAR` | Yes | — |
| `temperature` | `VARCHAR` | Yes | — |
| `competent_cells` | `VARCHAR` | Yes | — |
| `notes` | `VARCHAR` | Yes | — |
