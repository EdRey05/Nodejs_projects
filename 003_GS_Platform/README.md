# Gene Synthesis Automations

A local lab data application for viewing daily gene-synthesis logs, building Excel layouts, and connecting jobs to their experimental history. The interactive interface uses Next.js/React; Python handles file processing and DuckDB storage.

## Development data

Use only synthetic data for the redevelopment on `dev-GSP`, including database records, imports, test fixtures, and demos. Build the new development databases from scratch and populate them with fictional records. Keep real lab records and production database exports out of the development workflow.

## Current development scope

The redevelopment uses a fictional system inspired by familiar workflows, designed for consistent data and reliable relationships before implementing further operations. It does not reproduce the inconsistencies or responsibilities of a live workplace system.

- **Customers & Orders:** searchable, sortable tables backed by the synthetic Customer Info and Orders tables, including order status filters.
- **Progress Tracker:** synthetic per-item records, generated Work Numbers, statuses, metadata, and notes.
- **Home:** an empty page reserved for later design.
- **Retained drafts:** log review/upload, sequencing views, layout generators, and developer tools. These older drafts still need review and adaptation to the new synthetic schema before being treated as complete workflows.

New Job, Sample Lookup, IDT Fragments, Reference Files, and Shipping & QC were removed along with their dedicated UI/actions and obsolete legacy import/write helpers. Their previous routes are no longer available.

## Synthetic data model and statuses

The tracked fictional database is `data/GSP_database.duckdb`. See [database conventions](docs/database_conventions.md) for table definitions, source pools, generation weights, identifier rules, and reproducible scripts. Customer Info and Orders are related to Progress Tracker; Oligo Log and Primer Log are initially empty; Vector Log holds reference metadata.

New tracker rows default to `0. Onboarding`. Cancellation is `X. Cancelled`; stages 1–13 describe the subsequent progress steps. The conventions document is the current vocabulary reference. The deleted New Job draft's old stage list and turnaround assumptions are no longer used.

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

## Project map

```text
src/app/(app)/        Pages, shared navigation, database context
  customers-orders/  Customer Info and Orders tabs
  job-log/           Progress Tracker
  logs/              Retained experimental and sequencing drafts
  layouts/           Retained layout generator drafts
  developer/         Database tools and component playground
src/app/actions/     Shared log, database, layout, and subprocess actions
scripts/             Synthetic seed generators, rules, pools and readers
python_tools/        Shared bridge, parsers, imports, layouts and legacy schema
docs/                Per-table conventions and generation rules
data/SCHEMA.sql      Exact DuckDB schema snapshot
data/                Tracked fictional seed; ignored local runtime databases
```

## Live development on Windows

Use **Start Development** in the Desktop's **Gene Synthesis Development** folder,
or double-click `Start-Development.cmd` in this app folder. It opens the actual
repository source in your browser, normally at `http://127.0.0.1:9002/home`.
If that port is occupied it chooses another available development port.

Keep that browser tab open while editing this checkout. Saved interface changes
usually appear automatically; refresh if needed. Python scripts run from the
checkout on each backend operation. Restart development after changing server
configuration, environment settings or dependencies. There is no copying into
an extracted release and no portable rebuild between edits.

Use **Stop Development** or `Stop-Development.cmd` when finished. Closing the
browser tab does not stop the background server. Starting again reuses an
already running development session rather than opening a second server.

The one-time local setup reuses the portable ZIP's Node/Python runtimes in
`.local-runtime/` and installs the complete JavaScript development libraries in
`node_modules/`. Both folders, `.next/`, local environment files and generated
databases are ignored by Git. Launcher state and logs are under
`.local-runtime/`; the application still uses this checkout's `data/` folder.
The launcher supplies `GSA_PYTHON` automatically, so no Python activation is needed.

The launchers are small source files; bundled runtimes and dependencies do not
belong in commits. They must be prepared again on a new machine or checkout.
The standardized portable build remains the release workflow.

## Manual local setup

Install Node.js 22–24 and Python 3.10+ with pip. Run commands from `003_GS_Platform`. On Windows, the bridge uses `GSA_PYTHON` if supplied, otherwise `python` on PATH.

```powershell
npm ci
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
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

`npm run build` now works in native Windows shells. `npm start` normally serves on port 3000.

### Data and another computer

Use the tracked fictional seed and documented generation rules for redevelopment. Do not copy real lab records, historical exports, or real reference files into the development workflow. All retained pages share `data/GSP_database.duckdb`. Layouts and Logs still use their retained draft tables inside that same file; linking them to the new relational model is future work.

## Development status

- Source version is `0.0.10`; a portable rebuild has not been made for this version.
- Run `npm run typecheck` separately; production builds now enforce TypeScript checks. No separate ESLint configuration is supplied.
- Retained layout and log drafts need verification and adaptation to the synthetic model.

Development proceeds in small workflow-focused increments. Validate generated workbooks and database relationships with representative test data before depending on a changed workflow.

## Standardized portable build

Use the repository build-tools/Build-Apps.ps1 registry workflow. The portable folder bundles Next standalone output, Node, complete Python, parsers and schema and a writable app/data folder containing only the tracked fictional seed initially. Start.cmd opens the local browser; Stop.cmd stops the service. No checkout, host Python/Node, API key or WSL is required. The server invokes GSA_PYTHON set by the launcher. Developer mode can still use PATH Python. Optional import defaults use GSA_IMPORT_ROOT and GSA_PRIMER_LOG; no original-machine folder is required.

The retained Layouts and Logs drafts are still incomplete and await adaptation to the new model. There is no public demo or recording for 003 yet. Keep production files out of portable builds; back up data before replacing versions. No live or legacy user database was used to validate this packaging.

Portable runtime note: DuckDB needs MSVCP140.dll. The build stages an app-local copy from the pinned NumPy wheel beside the bundled Python interpreter, preserving its original file/notices and recording its hash. End users do not install a C++ runtime separately.


## Database documentation

- [Database conventions index](docs/database_conventions.md): one Markdown per table, plus the compatibility view.
- [Synthetic generation and refresh](docs/synthetic_data_generation.md): reproducibility, weighting, chronological dates, and refresh boundaries.
- [Exact database schema](data/SCHEMA.sql): generated DDL for the single `GSP_database.duckdb` file. Regenerate it using `python scripts/export_database_schema.py` after schema changes.

The former data-folder README and cleanup audit were removed. `docs/` is tracked by Git.

## Removed workbook templates

The two Excel templates and `python_tools/templates/` were deleted at the user's request. Layout pages and their code remain for later redesign; template-dependent workbook generation needs replacement templates or programmatic workbook creation before it works again.
