"""Guard: the frontend and backend stage lists must not drift.

`python_tools/stages.json` is the canonical vocabulary. The frontend mirror
is `src/lib/stages.ts`. This script compares the two and fails loudly on any
difference in stage number or label — the two lists are kept in step by
hand, so a silent divergence is the failure mode to catch.

Run from the app root:

    python python_tools/check_stages.py
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(HERE)

STAGES_JSON = os.path.join(HERE, 'stages.json')
STAGES_TS = os.path.join(APP_ROOT, 'src', 'lib', 'stages.ts')


def parse_json_stages(path):
    with open(path, 'r', encoding='utf-8') as f:
        payload = json.load(f)
    stages = payload.get('stages') or []
    return [(int(s['number']), str(s['label'])) for s in stages]


def parse_ts_stages(path):
    """Pull { number, label } pairs out of the TypeScript mirror."""
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    pairs = []
    pattern = re.compile(
        r"\{\s*number:\s*(\d+),\s*label:\s*'([^']*)'\s*,\s*timeline:\s*'([^']*)'\s*\}"
    )
    for m in pattern.finditer(text):
        pairs.append((int(m.group(1)), m.group(2)))
    return pairs


def main():
    if not os.path.isfile(STAGES_JSON):
        print(f"ERROR: {STAGES_JSON} not found.")
        return 1
    if not os.path.isfile(STAGES_TS):
        print(f"ERROR: {STAGES_TS} not found.")
        return 1

    py_stages = parse_json_stages(STAGES_JSON)
    ts_stages = parse_ts_stages(STAGES_TS)

    if not py_stages:
        print("ERROR: stages.json contains no stages.")
        return 1
    if not ts_stages:
        print("ERROR: no stages parsed from src/lib/stages.ts — the "
              "JOB_STAGES literal shape changed and this checker needs updating.")
        return 1

    problems = []
    if len(py_stages) != len(ts_stages):
        problems.append(
            f"stage count differs: stages.json={len(py_stages)}, stages.ts={len(ts_stages)}"
        )
    for i, (py, ts) in enumerate(zip(py_stages, ts_stages)):
        if py != ts:
            problems.append(f"position {i}: stages.json={py!r}, stages.ts={ts!r}")

    py_numbers = [n for n, _ in py_stages]
    if py_numbers != sorted(py_numbers):
        problems.append(f"stage numbers are not in ascending order: {py_numbers}")
    if len(set(py_numbers)) != len(py_numbers):
        problems.append(f"duplicate stage numbers: {py_numbers}")

    if problems:
        print("FAIL: the frontend and backend stage lists have drifted.")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(f"OK: {len(py_stages)} stages match between stages.json and src/lib/stages.ts.")
    for number, label in py_stages:
        print(f"  {number:>2}. {label}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
