"""Colony PCR image naming migration (v0.0.5 Phase 1).

Renames existing files in data/images/colony_pcr/ from the OLD scheme

    {entryCode}_{plate}_{img}.png     (plate 1-based, img 0-based)

to the NEW scheme

    {entryCode}_P{plate}_I{img}.png   (plates start at 1, images start at 1)

where the new img index = old img index + 1.

Example:
    U0102-ColonyPCR-FL_1_0.png -> U0102-ColonyPCR-FL_P1_I1.png

Only touches *.png files matching the old pattern. Dry-run by default;
pass --apply (or set apply=True via the bridge) to perform the renames.

Usage:
    python python_tools/migrate_colony_images.py [--apply]
"""

import os
import re
import sys

IMAGES_DIR = os.path.join('data', 'images', 'colony_pcr')

# old scheme: {entryCode}_{plate}_{img}.png — capture the last two _N groups
# before the extension so entry codes containing digits/underscores are safe.
OLD_SCHEME_RE = re.compile(
    r'^(?P<entry>.+)_(?P<plate>\d+)_(?P<img>\d+)\.png$'
)
NEW_NAME_RE = re.compile(r'^.+_P\d+_I\d+\.png$')


def migrate_colony_images(apply: bool = False) -> dict:
    """Rename old-scheme colony pngs to the new P/I scheme. Returns report."""
    images_dir = IMAGES_DIR
    if not os.path.isdir(images_dir):
        return {"success": False, "message": f"Images dir not found: {images_dir!r}"}

    renames = []
    skipped = []
    for fname in sorted(os.listdir(images_dir)):
        if not fname.lower().endswith('.png') or NEW_NAME_RE.match(fname):
            continue
        m = OLD_SCHEME_RE.match(fname)
        if not m:
            skipped.append((fname, 'does not match old scheme'))
            continue
        plate = int(m.group('plate'))
        img = int(m.group('img'))
        new_name = f"{m.group('entry')}_P{plate}_I{img + 1}.png"
        renames.append((fname, new_name))

    report_pairs = []
    performed = 0
    if apply:
        for old, new in renames:
            old_path = os.path.join(images_dir, old)
            new_path = os.path.join(images_dir, new)
            if os.path.exists(new_path):
                report_pairs.append({"from": old, "to": new, "error": "target exists"})
                continue
            os.rename(old_path, new_path)
            performed += 1
            report_pairs.append({"from": old, "to": new})
    else:
        for old, new in renames:
            report_pairs.append({"from": old, "to": new, "dry_run": True})

    return {
        "success": True,
        "applied": apply,
        "renamed": performed,
        "matched": len(renames),
        "skipped": skipped,
        "pairs": report_pairs,
    }


if __name__ == '__main__':
    do_apply = '--apply' in sys.argv
    res = migrate_colony_images(apply=do_apply)
    for pair in res['pairs']:
        if 'error' in pair:
            print(f"ERROR  {pair['from']} -> {pair['to']} ({pair['error']})")
        else:
            print(f"{pair.get('dry_run') and 'DRY    ' or 'RENAME '} {pair['from']} -> {pair['to']}")
    for name, reason in res['skipped']:
        print(f"SKIP    {name} ({reason})")
    mode = 'APPLIED' if res['applied'] else 'DRY-RUN'
    print(f"{mode}: {res['renamed']} renamed, {res['matched']} matched, {len(res['skipped'])} skipped.")
    if not do_apply:
        print("Re-run with --apply to perform the renames.")