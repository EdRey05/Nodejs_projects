"""Job Log write path (v0.0.7) — create one job row from the app.

The Job Log is the app's job spine. Rows reach it two ways:

- ``bulk_import.import_job_log``  — header-verified Excel upsert (bulk path)
- ``job_log.create_job_log_row``  — a single row created from the app's
  New Job form (interactive path)

The canonical stage vocabulary lives in ``stages.json`` next to this module
and is shared with the frontend (``src/lib/stages.ts``). This module
validates against that file; it never restates the list.

Only the columns BEFORE ``insert_sequence`` are written here. Insert
Sequence and every column after it are deferred by design: they are filled
later by the pipeline (sequence reads, clone selection, extraction, QC) and
stay NULL on a freshly created job.
"""

import json
import os
import re
from datetime import datetime

import db_ops

STAGES_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'stages.json'
)

# Columns the New Job form writes. Everything from 'insert_sequence' on is
# deferred (see the module docstring) and is left NULL.
WRITABLE_FIELDS = [
    'work_no', 'bbi_id', 'order_date', 'so', 'gene_name', 'vector',
    'cloning_site', 'resistance', 'length_bp', 'quantity', 'prep', 'stage',
]

_STAGES_CACHE = None


# ---------------------------------------------------------------- stages

def load_stages() -> list:
    """Canonical stage definitions, ordered by stage number."""
    global _STAGES_CACHE
    if _STAGES_CACHE is None:
        with open(STAGES_PATH, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        stages = payload.get('stages') or []
        _STAGES_CACHE = sorted(stages, key=lambda s: int(s['number']))
    return _STAGES_CACHE


def _stage_by_label() -> dict:
    """canonical label (lower-cased) -> stage definition."""
    return {
        str(s['label']).strip().lower(): s for s in load_stages()
    }


def _stage_by_number() -> dict:
    return {int(s['number']): s for s in load_stages()}


def _norm_stage(value) -> str:
    """Validate a stage and return its canonical label.

    Accepts the canonical label (case-insensitive) or the bare stage
    number ('5', '5.'). Anything else is rejected with the full list so
    the caller can see the valid choices.
    """
    label = _norm_text(value)
    if label is None:
        raise ValueError("Stage is required.")

    by_label = _stage_by_label()
    found = by_label.get(label.lower())
    if found is not None:
        return str(found['label'])

    m = re.match(r'^(\d{1,2})\.?\s*$', label)
    if m:
        stage = _stage_by_number().get(int(m.group(1)))
        if stage is not None:
            return str(stage['label'])

    valid = ', '.join(str(s['label']) for s in load_stages())
    raise ValueError(f"Stage must be one of the canonical stages: {valid}")


# ------------------------------------------------------------- normalizers

def _norm_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _norm_int(value):
    text = _norm_text(value)
    if text is None:
        return None
    try:
        return int(text)
    except ValueError:
        raise ValueError(f"Length (bp) must be a whole number, got {text!r}.")


def _norm_date(value):
    text = _norm_text(value)
    if text is None:
        return None
    try:
        return datetime.strptime(text[:10], '%Y-%m-%d').strftime('%Y-%m-%d')
    except ValueError:
        raise ValueError(f"Order Date must be YYYY-MM-DD, got {text!r}.")


# ------------------------------------------------------------ create action

def create_job_log_row(args: dict) -> dict:
    """Bridge action: insert one Job Log row (the New Job form).

    Validation: Work No. is required and must be new; the stage must be one
    of the canonical stages; Length (bp) must be a whole number; Order Date
    must be an ISO date. Everything else is optional and stored trimmed.
    """
    args = args or {}

    work_no = _norm_text(args.get('work_no'))
    if work_no is None:
        return {"success": False, "message": "Work No. is required."}

    try:
        stage = _norm_stage(args.get('stage'))
        length_bp = _norm_int(args.get('length_bp'))
        order_date = _norm_date(args.get('order_date'))
    except ValueError as e:
        return {"success": False, "message": str(e)}

    values = {
        'work_no': work_no,
        'bbi_id': _norm_text(args.get('bbi_id')),
        'order_date': order_date,
        'so': _norm_text(args.get('so')),
        'gene_name': _norm_text(args.get('gene_name')),
        'vector': _norm_text(args.get('vector')),
        'cloning_site': _norm_text(args.get('cloning_site')),
        'resistance': _norm_text(args.get('resistance')),
        'length_bp': length_bp,
        'quantity': _norm_text(args.get('quantity')),
        'prep': _norm_text(args.get('prep')),
        'stage': stage,
    }

    columns = [c['name'] for c in db_ops.schema_columns('job_log', 'data')]
    if not columns:
        return {
            "success": False,
            "message": "job_log columns not found in schema.yaml.",
        }
    missing = [f for f in WRITABLE_FIELDS if f not in columns]
    if missing:
        return {
            "success": False,
            "message": f"schema.yaml job_log is missing columns: {missing}",
        }

    # Deferred columns (insert_sequence and everything after it) stay NULL.
    deferred = [c for c in columns if c not in WRITABLE_FIELDS]
    row = dict(values)
    for column in columns:
        row.setdefault(column, None)

    conn = db_ops.get_connection()
    try:
        conn.execute("BEGIN TRANSACTION")
        clash = conn.execute(
            "SELECT work_no FROM job_log WHERE lower(work_no) = lower(?) LIMIT 1",
            [work_no],
        ).fetchone()
        if clash is not None:
            conn.execute("ROLLBACK")
            return {
                "success": False,
                "message": f"Work No. {work_no} already exists in the Job Log.",
            }
        quoted = ", ".join('"' + c + '"' for c in columns)
        placeholders = ", ".join("?" for _ in columns)
        conn.execute(
            f"INSERT INTO job_log ({quoted}) VALUES ({placeholders})",
            [row.get(c) for c in columns],
        )
        conn.execute("COMMIT")
    except Exception as e:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        return {"success": False, "message": f"Insert failed (rolled back): {e}"}
    finally:
        conn.close()

    return {
        "success": True,
        "message": f"Job {work_no} created at stage {stage}.",
        "row": {c: row.get(c) for c in columns},
        "deferred_columns": deferred,
    }
