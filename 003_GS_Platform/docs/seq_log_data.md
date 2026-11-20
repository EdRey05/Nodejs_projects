# Seq Log Data conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

Table `seq_log_data` belongs to the retained Layouts/Logs draft model. It starts empty in this fictional database. Its current column names, types, defaults and enforced constraints are listed below; no new synthetic row-generation conventions have been agreed for this draft table.

The implementation remains in `python_tools/schema.yaml`, the corresponding parsers, and shared bridge/layout modules. Preserve parser-defined column names and relationships until that workflow is redesigned. Do not infer a relationship to the new Progress Tracker from similarly named text fields: no such migration has been implemented.


## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `seq_log_id` | `INTEGER` | Yes | — |
| `row_number` | `INTEGER` | Yes | — |
| `folder_name` | `VARCHAR` | Yes | — |
| `job_id` | `VARCHAR` | Yes | — |
| `vector_id` | `VARCHAR` | Yes | — |
| `sg_ss_ok` | `VARCHAR` | Yes | — |
| `sg_ds_ok` | `VARCHAR` | Yes | — |
| `sg_mutation_or_fail` | `VARCHAR` | Yes | — |
| `sg_primer_to_repeat` | `VARCHAR` | Yes | — |
| `requirement` | `VARCHAR` | Yes | — |
| `qc_file_name` | `VARCHAR` | Yes | — |
| `work_no` | `VARCHAR` | Yes | — |
| `bbi_id` | `VARCHAR` | Yes | — |
| `gene_name` | `VARCHAR` | Yes | — |
| `vector` | `VARCHAR` | Yes | — |
| `length_bp` | `VARCHAR` | Yes | — |
| `plasmid_no` | `VARCHAR` | Yes | — |
| `cloning_site` | `VARCHAR` | Yes | — |
| `resistance` | `VARCHAR` | Yes | — |
| `growth_condition_temperature` | `VARCHAR` | Yes | — |
| `order_date` | `VARCHAR` | Yes | — |
| `delivery_date` | `VARCHAR` | Yes | — |
| `storage` | `VARCHAR` | Yes | — |
| `host` | `VARCHAR` | Yes | — |
| `plasmid_qty` | `VARCHAR` | Yes | — |
| `competent_cells` | `VARCHAR` | Yes | — |
| `od260` | `VARCHAR` | Yes | — |
| `od280` | `VARCHAR` | Yes | — |
| `od260_280` | `VARCHAR` | Yes | — |
| `ng_ul` | `VARCHAR` | Yes | — |
