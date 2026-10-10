# Gene Synthesis Automations

A full-stack lab data management app for gene synthesis workflows. Upload, parse, store, and interactively review laboratory logs (Ligation, Colony PCR, DNA Extraction, DNA Quantification) with rich plate visualizations and AI-assisted analysis.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript |
| UI | Radix UI (shadcn/ui), Tailwind CSS, Embla Carousel |
| Database | DuckDB (via Python) |
| Data Processing | Python (openpyxl, pandas) |
| AI | Google Genkit + Gemini 2.5 Flash |
| Deployment | Firebase App Hosting |

## Architecture

```
Next.js Frontend (React + Tailwind + Radix UI)
        |
   Server Actions
   /      |       \
ai.ts  logs.ts  database.ts
          |
   python-bridge.ts  (spawn wrapper, JSON IPC)
          |
      bridge.py  (unified Python entry point)
      /       \
  parsers/   db_ops.py
      |          |
  openpyxl     DuckDB
```

- **Frontend** handles interactivity, animations, and drag-drop interactions
- **Server Actions** (`src/app/actions/`) are split by domain: AI, logs, database, legacy
- **Python bridge** (`python_tools/bridge.py`) handles all data-heavy work in a single subprocess per operation
- **DuckDB** is the primary data store, with schema defined in `python_tools/schema.yaml`

## Project Structure

```
src/
  app/
    actions/              # Server actions (split by domain)
      ai.ts               # Chatbot + Excel summarization
      logs.ts             # File parsing + persistence via Python bridge
      database.ts         # DB init, export, SQL queries
      python-bridge.ts    # Python subprocess wrapper
      legacy.ts           # Deprecated Excel-based processing
      index.ts            # Barrel re-export
    (app)/                # App routes with shared sidebar layout
      _context/           # React Context providers (App, Database)
      home/               # Landing page
      logs/               # Log viewer pages + uploader
      plate-designer/     # Interactive plate layout designer
      pipelines/          # Pipeline configurations
      developer/          # Dev tools (DB inspector, widget playground)
  ai/                     # Genkit AI flows
  components/ui/          # shadcn/ui component library
  lib/                    # Types, utilities, storage helpers
  hooks/                  # Custom React hooks

python_tools/
  bridge.py               # Unified entry point for all Python operations
  parsers/                # Excel parsers (ligation, colony_pcr, dna_extraction, dna_quantification)
  db_ops.py               # DuckDB CRUD operations
  schema.yaml             # Database schema definition
  migrate_data.py         # Excel-to-DuckDB migration utility

scripts/
  process_data.py         # Data processing scripts
  adapters/               # Placeholder for BBI_projects Python app integrations

data/
  GeneSyn_db.duckdb       # DuckDB database file
  images/                 # Stored plate images by log type
```

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.10+ with `duckdb`, `pandas`, `openpyxl`, `pyyaml`
- A Google AI API key (for Genkit/Gemini features)

### Installation

```bash
# Install Node dependencies
npm install

# Install Python dependencies
pip install duckdb pandas openpyxl pyyaml

# Set up environment variables
# Create .env.local with:
#   GOOGLE_GENAI_API_KEY=your_key_here
```

### Running

```bash
# Development server (port 9002)
npm run dev

# Genkit AI dev server (optional, for AI flow testing)
npm run genkit:dev

# Production build
npm run build
npm start
```

### Initialize Database

On first run, the database initializes automatically when data is first uploaded. To manually initialize:

```bash
cd python_tools
python db_ops.py init
```

## Features

### Log Management
- **Upload & Parse** -- Drag-and-drop Excel files for Ligation, Colony PCR, DNA Extraction, and DNA Quantification logs
- **Interactive Review** -- Carousel-based navigation through log entries with plate grids, sample tables, and result images
- **DuckDB Storage** -- All parsed data persisted in a local DuckDB database

### Plate Designer
- Drag-and-drop sample placement on 96-well and 48-well plates
- Parameter management (antibiotic, temperature, bacteria, incubation, prep)
- Bulk well selection and parameter application

### AI Assistant
- Context-aware chatbot that understands the current page and data state
- Excel file summarization via Gemini

### Developer Tools
- SQL query sandbox against the DuckDB database
- Data export to Excel and ZIP backup
- Widget playground for component testing

## Log Types

| Log Type | Excel Format | Key Data |
|----------|-------------|----------|
| Ligation | Sheet "Plate Name", cols A-W | Vectors, inserts, enzymes, well positions |
| Colony PCR | Sheets "Plate 1", "Plate 2", ... | 96-well grid results, sample metadata, positive wells, gel images |
| DNA Extraction | Sheet "Layout", ranges B5:G12 + J5:O12 | 48-well plate layouts with growth parameters |
| DNA Quantification | First sheet, cols B-G | Concentration data by source type |
