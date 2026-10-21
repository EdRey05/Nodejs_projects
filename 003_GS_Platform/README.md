# Gene Synthesis Automations

A local lab data application for viewing daily gene-synthesis logs, building Excel layouts, and connecting jobs to their experimental history. The interactive interface uses Next.js/React; Python handles file processing and DuckDB storage.

## Current scope — v0.0.7

- **Job Log:** the app's first table and the spine for job relationships — searchable, sortable and filterable master job data.
- **Job stages:** a canonical thirteen-stage pipeline vocabulary, shared by the Python bridge and the frontend.
- **New Job:** create a job from the app, with the stage picker and the pipeline's turnaround estimates.
- **Log review and upload:** Ligation, Colony PCR, DNA Extraction, and DNA Quantification, with tables, plate views, images, and carousel navigation.
- **Sequencing:** preparation and analysis views with Python importers.
- **Layout creation:** Ligation, Colony PCR, and extraction workbook generators, plus an interactive plate designer.
- **Job data:** IDT/PCR fragments, primer add-ons and cross-references, reference-file previews, shipment/QC details, and clone/plasmid lineage data.
- **Sample lookup:** a cross-stage search timeline. Some stages still match entry names rather than resolving the full sample lineage.
- **Dashboard and developer tools:** database counts, SQL inspection, exports, and a widget playground.

The Pipelines section remains a placeholder. There is no longer a separate Nanodrop page; Nanodrop parsing remains in the backend. Features are under active development and are not all covered by automated tests.

## Job stages

The pipeline runs through thirteen stages, from `0. Onboarding` to
`12. Completed - Preparing for Shipment`. The vocabulary is defined once in
`python_tools/stages.json` and mirrored in `src/lib/stages.ts`; the bridge
validates every write against it. `python_tools/check_stages.py` compares the two
lists and fails if they drift.

```bash
python python_tools/check_stages.py
```

Cancelled, moved-to-Sg, and shipped are lifecycle states outside the pipeline.
They are filtered as categories on the Job Log page, not selected as stages.

## Creating a job

The **New Job** page writes the Job Log columns up to `prep` — Work No., BBI ID,
Order Date, SO, Gene Name, Vector, Cloning Site, Resistance, Length (bp),
Quantity, Prep, and the starting stage. Insert Sequence and every column after
it are left empty: the pipeline fills those as the job advances.

| Layer | File |
|---|---|
| Form | `src/app/(app)/job-log/new/page.tsx` |
| Field list | `src/lib/job-log-fields.ts` |
| Server actions | `src/app/actions/job-log.ts` |
| Write path | `python_tools/job_log.py` |
| Bridge actions | `create_job_log_row`, `fetch_stages` |

The write path validates the Work No. (required, must be new), the stage (must be
canonical), Length (bp) (a whole number), and Order Date (`YYYY-MM-DD`), and
commits the insert in one transaction.

## Data model

The Job Log is the app's first table. It is defined in `python_tools/schema.yaml`
under the `job_log` group and maps to the physical DuckDB table `job_log`:

| Column | Type | Notes |
|---|---|---|
| `work_no` | TEXT | Primary job identifier |
| `bbi_id` | TEXT | Internal BBI identifier |
| `order_date` | TEXT | ISO date |
| `so` | TEXT | Sales order |
| `gene_name` | TEXT | |
| `vector` | TEXT | |
| `cloning_site` | TEXT | |
| `resistance` | TEXT | Antibiotic marker |
| `length_bp` | INTEGER | Insert length in bp |
| `quantity` | TEXT | Plasmid quantity |
| `prep` | TEXT | Preparation form |
| `stage` | TEXT | Pipeline stage |
| `insert_sequence` | TEXT | |
| `final_vector_sequence` | TEXT | |
| `plasmid_no` | TEXT | |
| `tube_id` | TEXT | |
| `host` | TEXT | |
| `temperature` | TEXT | Growth temperature |
| `competent_cells` | TEXT | |
| `notes` | TEXT | |

`job_log` is the job spine; `job_log_rows` is a view over it. Schema objects are defined both in `python_tools/schema.yaml` and specialized import modules.

The database file is `data/GeneSyn_db_v2.duckdb`. The previous production database
(`data/GeneSyn_db.duckdb`) is never deleted — on first use it is renamed into
`data/obsolete/` and the new database is created empty from the schema.

## Architecture

```text
Next.js / React interface
        ↓
Next.js server actions
        ↓ JSON over subprocess stdin/stdout
Python bridge → parsers / importers / layout generators
        ↓
DuckDB + local files / downloadable Excel workbooks
```

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| UI | Tailwind CSS, Radix/shadcn components, Embla Carousel |
| Processing | Python, openpyxl, pandas |
| Storage | DuckDB, local images and reference files |
| Optional desktop shell | Electron in `_electron_sidecar/` |

## Project map

```text
src/app/(app)/        Pages, shared navigation, database context
  job-log/            The Job Log table: filters, sorting, column visibility
  logs/              Experimental and sequencing log views, uploader
  layouts/           Ligation, Colony PCR, extraction generators
  plate-designer/    Interactive plate editor
  fragments/         Fragment browser
  reference-files/   Reference metadata and previews
  shipping-qc/       Job, shipment, and QC views
  search/            Sample lookup timeline
  developer/         Database tools and component playground
src/app/actions/     Logs, database, layouts, job web, lookup, dashboard,
                     and Python subprocess wrapper
python_tools/        Bridge, parsers, imports, layout generation, schema
python_tools/templates/  Excel output templates
data/                GeneSyn_db_v2.duckdb and supporting files/images
0-Logs/              Source laboratory files
_electron_sidecar/   Electron launcher and packaging scripts
docs/                Historical plans (some descriptions are outdated)
```

## Local setup

Install Node.js 20+ and Python 3.10+ with pip. Run commands from the repository root. On Windows, the bridge invokes `python`, so the selected environment must put that executable on PATH.

```powershell
npm ci
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install duckdb pandas openpyxl pyyaml pillow
```

Pillow supports embedded workbook images. On macOS/Linux, create the environment with `python3 -m venv .venv` and activate it with `source .venv/bin/activate`.

### Start when ready

```powershell
npm run dev
```

Open http://localhost:9002 manually. Keep the Python environment active in the terminal that launches Node.

For a production build on Windows PowerShell:

```powershell
$env:NODE_ENV = 'production'
npx next build
npm start
```

The root `npm run build` script uses POSIX environment-variable syntax; use the explicit PowerShell commands above on Windows. `npm start` normally serves on port 3000.

### Data and another computer

Keep a backup of `data/GeneSyn_db_v2.duckdb` before imports or migrations. To reproduce the current populated application on another computer, bring the required database, images, templates, and source/reference files in addition to the code. Some import defaults and stored file paths refer to the original machine; adjust them before relying on imports or previews.

The generic schema initializer does not populate historical data or establish every specialized job-web object. Do not treat a fresh empty database as equivalent to the populated development database.

## Optional Electron launcher

The desktop shell uses a Next.js standalone build and bundled Node/Python runtimes. It locates a checkout using `GSA_REPO_ROOT` or nearby folders, then normally serves on `127.0.0.1:4177`. The executable still requires the checkout, build, and data; it is not a self-contained data package.

See [`_electron_sidecar/BUILD.md`](_electron_sidecar/BUILD.md) for packaging background. That document contains older version/AI references and should be checked against the current scripts. Electron is not required to run the application in a browser.

## Development status

- Electron release version is `0.0.5`; the root package still has the generic `nextn` / `0.1.0` metadata.
- Run `npm run typecheck` separately: production build configuration currently ignores TypeScript and ESLint errors.
- The October 5, 2026 baseline check found stale generated `.next` route types and calendar component typing errors. A clean build may refresh route types; the calendar issue needs a source fix.
- Layout job-eligibility filtering and full relational sample lookup need follow-up verification.
- Existing planning documents include completed ideas still marked pending; consult the current code before selecting work.

Development proceeds in small workflow-focused increments. Validate generated workbooks and database relationships with representative test data before depending on a changed workflow.
