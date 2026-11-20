# Database conventions

The application uses one fully fictional database: `data/GSP_database.duckdb`. This index replaces the old Job Log conventions document; edit each table's Markdown independently.

[Exact SQL schema](../data/SCHEMA.sql) · [Synthetic generation and refresh rules](synthetic_data_generation.md)

The SQL snapshot describes the actual database, including constraints, sequences, views and macros. Table documents distinguish implemented constraints, agreed generation rules, and pending decisions. Do not treat documentation-only rules as enforced database validation.

## Current redesigned tables

- [customer_info](customer_info.md)
- [orders](orders.md)
- [progress_tracker](progress_tracker.md)
- [oligo_log](oligo_log.md)
- [primer_log](primer_log.md)
- [vector_log](vector_log.md)

## Retained draft tables

These tables are empty and retained for Layouts and Logs to be redesigned later. Their current schemas are documented without inventing new generation rules.

- [colony_pcr_data](colony_pcr_data.md)
- [colony_pcr_index](colony_pcr_index.md)
- [colony_pcr_positives](colony_pcr_positives.md)
- [colony_pcr_samples](colony_pcr_samples.md)
- [dna_extraction_antibiotic](dna_extraction_antibiotic.md)
- [dna_extraction_bacteria](dna_extraction_bacteria.md)
- [dna_extraction_data](dna_extraction_data.md)
- [dna_extraction_incubation](dna_extraction_incubation.md)
- [dna_extraction_index](dna_extraction_index.md)
- [dna_extraction_prep](dna_extraction_prep.md)
- [dna_extraction_temperature](dna_extraction_temperature.md)
- [dna_quantification_extraction_plate](dna_quantification_extraction_plate.md)
- [dna_quantification_fragments](dna_quantification_fragments.md)
- [dna_quantification_index](dna_quantification_index.md)
- [dna_quantification_nanodrop](dna_quantification_nanodrop.md)
- [dna_quantification_other](dna_quantification_other.md)
- [job_log](job_log.md)
- [ligation_data](ligation_data.md)
- [ligation_index](ligation_index.md)
- [seq_log_data](seq_log_data.md)
- [seq_log_index](seq_log_index.md)
- [sequencing_layout_data](sequencing_layout_data.md)
- [sequencing_layout_index](sequencing_layout_index.md)
- [sequencing_layout_plate](sequencing_layout_plate.md)
- [sequencing_order_data](sequencing_order_data.md)
- [sequencing_order_index](sequencing_order_index.md)
- [sequencing_validation_dilution](sequencing_validation_dilution.md)
- [sequencing_validation_index](sequencing_validation_index.md)
- [sequencing_validation_pending](sequencing_validation_pending.md)

## Compatibility views

- [job_log_rows](job_log_rows.md)

## Shared Date Code

Date Code is `YMMDD`: A=2026, B=2027, through Z=2051; month and day are zero-padded and must form an actual calendar date (including leap-year validation). For example November 19, 2026 is `A1119`. Matching Date Codes across independent logs do not establish relationships or foreign keys. Work Number is the actual reference to Progress Tracker where specified.

## Boundaries still to resolve

The draft `job_log` used by retained layouts is different from `progress_tracker`; sharing one database does not complete their relational redesign. Work Number counter reset rules beyond the current global synthetic allocation, suffix cases beyond P/FRAG, and orders over 99 items remain open. The Oligo Log document identifies its two agreed but missing fields.

The Excel template files were removed at the user's request. Retained layout generation code requires future replacement templates or a programmatic workbook design before its template-dependent actions can generate workbooks again.
