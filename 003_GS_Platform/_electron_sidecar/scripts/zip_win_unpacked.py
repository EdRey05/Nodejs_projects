"""Zip the win-unpacked exe bundle + copy launcher for the Gene_Synthesis_Platform task folder.
Writes to Desktop first (timestamped), then moves into the task folder (Defender lock retries)."""
import shutil, time, zipfile, os
from datetime import datetime
from pathlib import Path

sidecar = Path(r"C:\Users\Administrator\Desktop\Github_EdRey05\Gene_Synthesis_Automations\_electron_sidecar")
src = sidecar / "release" / "win-unpacked"
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
desktop = Path(r"C:\Users\Administrator\Desktop")
zip_desktop = desktop / f"Gene_Synthesis_Automations_status_view_v0.0.4_{stamp}.zip"

EXCLUDE_DIRS = {"__pycache__"}

def add_tree(zf, folder: Path, prefix: str):
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            p = Path(root) / f
            if p.suffix in {".pyc"}:
                continue
            rel = p.relative_to(folder)
            zf.write(p, prefix / rel)

with zipfile.ZipFile(zip_desktop, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    add_tree(zf, src, "win-unpacked")
print("zipped:", zip_desktop, zip_desktop.stat().st_size)

task = Path(r"C:\Users\Administrator\Desktop\ERA_BioAutomations\Gene_Synthesis_Agent\Tasks\Pending\Gene_Synthesis_Platform\status_view_v0.0.4")
task.mkdir(parents=True, exist_ok=True)
dest = task / "Gene_Synthesis_Automations_status_view_v0.0.4.zip"
for attempt in range(8):
    try:
        shutil.move(str(zip_desktop), str(dest))
        break
    except PermissionError:
        print(f"locked, retry {attempt}")
        time.sleep(15)
print("task folder zip:", dest, dest.stat().st_size)

with zipfile.ZipFile(dest) as zf:
    names = zf.namelist()
    print("entries:", len(names))
    assert "win-unpacked/Gene Synthesis Automations.exe" in names
    assert "win-unpacked/resources/app.asar" in names
    assert "win-unpacked/resources/runtime/python/python.exe" in names
    assert "win-unpacked/resources/runtime/node/node.exe" in names
print("zip contents verified")