# Synthetic data generation

[All table conventions](database_conventions.md)

Use fictional records only. Keep the one application database at `data/GSP_database.duckdb`. Temporary `--output` files are validation artifacts; remove them after use.

- `scripts/tracker_seed_rules.py` contains the shared per-row rules. `row_values` takes seeded RNGs, order date, counter, and the vector-to-resistance mapping. `weighted_choice` and `weighted_integer` in the generator are generic helpers for future fields.
- Vector: uniform over all 52 supplied labels plus `DNA Fragment - No Vector`. Preserve supplied spellings/variants. Cloning Site: uniform over the supplied 48-label pool, sampled independently. These synthetic pairings do not certify experimental compatibility.
- Resistance: lookup by exact vector label in Vector Log. Unverified: pUCm-T, pUCP-18, pUC-SPK, pUC-SP. Their resistance remains empty. Do not infer a mapping from a similar name.
- Length: select inclusive range 20–10000 at weight 2, or 10001–20000 at weight 1, then choose an integer uniformly within that range.
- Quantity: fragments use `200-400 ng`, `400 ng`, `1 ug`, `2 ug`, `4 ug`. Plasmids use `2-4 ug`, `4 ug`, `10 ug`, `50 ug`, `100 ug`, `200 ug`, `500 ug`. The first (default range) label has weight 2; each other label has weight 1. This weights the default label, not all numerically standard labels.
- Delivery Format: each of the four Lyophilized options has weight 5, each of the four In solution options weight 1. Expected proportions are statistical, not exact quotas.
- Work Number is calculated last for each row: initial synthetic standard projects use X without Gel and Z with Gel; no S/M/R projects are fabricated. P means pUC57-Amp or pUC57-Kan, F means no vector, V means every other supplied vector. Character 3 compares numeric amounts with units converted to ng: F 200–400 ng inclusive, P/V 2000–4000 ng inclusive. Thus 400 ng is standard for F, 4 ug is standard for plasmids but not F. Year digit and month code come from Order Date, not the day the script runs. January 2026 gives `61`. Counter is zero-padded to four digits. No revision suffix is added to initial rows.
- Display Order ID concatenates Customer ID and four-digit Order Number (e.g. PBC0001); database columns remain separate. Orders statuses are Cancelled, In Progress, Completed, Completed (Partial). Default display shows In Progress; buttons include other groups. Tracker Status is third display column, Notes last. Hidden database relationship columns precede display fields.

Run from the app folder using the local Python runtime:

```powershell
# Refresh the existing synthetic file in place; preserve customer/order identities.
& .local-runtime/python/python.exe scripts/refresh_tracker_seed.py --seed 42
# Create a separate new database; refuses to overwrite an existing file.
& .local-runtime/python/python.exe scripts/generate_synthetic_customers.py --output .local-runtime/new-seed.duckdb --seed 42
```

Refresh is explicit, never automatic on app startup. It keeps a first-run compressed ZIP backup in ignored `.local-runtime/seed-backups`, updates in one transaction, and refuses to rewrite Work Numbers when Oligo/Primer Logs contain references. It intentionally replaces randomized fields for all existing tracker rows. Do not use it on a production database or as an append operation. For adding rows, allocate new counters and gene names after the current maximum and check existing uniqueness constraints.

Metadata sources and per-label verification are stored in `scripts/vector_reference.json`. Sources include the Novagen pET manual (manufacturer-authored, university-hosted), Genosphere, Addgene's vector catalog, NEB, Agilent, GenScript, and Thermo Fisher. Vector sequences remain empty.


### Chronological synthetic order dates

Start the first order at January 3, 2026. Process orders in Work Number sample-counter order, assigning the same date to all items sharing the BBI ID prefix before the hyphen. For each subsequent order, add a seeded random 0–3 days. Dates may repeat but never decrease. Limit the increment to the days remaining in January so every date stays in January; once January 31 is reached subsequent orders stay there. `january_order_dates` is shared by fresh generation and refresh. Delivery Format uses `Gly` (glycerol stock) consistently.

Regenerate the SQL snapshot with `python scripts/export_database_schema.py` after schema changes. Table Markdown documents must be reviewed alongside the snapshot.
