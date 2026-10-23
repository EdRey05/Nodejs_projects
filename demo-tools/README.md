# Real packaged-app demonstrations

Run build-tools/Test-Apps.ps1 against a packaged build output. It opens a fresh Windows Sandbox with networking disabled, extracts each ZIP into a folder with spaces, and launches only the bundled runtimes. Edge is the Windows-provided browser. No developer runtime is installed in this test guest.

001 imports the fictional workbook through the actual file input (CDP supplies the path), verifies the dashboard balance, enters a contribution using the real form, and exports through the application's workbook writer. 002 mounts a disposable folder, opens and edits the notebook, inspects live preview, saves and reopens the real file. Tests capture the real app renderer continuously, with measured timestamps. Captions describe automation steps; no results are simulated. 003 receives HTTP/runtime/bridge smoke checks only and is never recorded.

Encode captured frames with an existing FFmpeg/ffprobe installation:

```powershell
pwsh -NoProfile -File .\demo-tools\Encode-Demos.ps1 -Validation <validation-run-folder>
```

The encoder uses an existing PowerShell 7 host (the Codex bundled runtime was used here) and FFmpeg. These are recording-only tools, not build or end-user prerequisites. It can run in a disposable tooling environment if not already available on the host. MP4 preserves measured timing at 12 fps; GIF previews are 720 pixels wide, 5 fps and 2x speed. recordings.json ties media hashes and encoding metadata to the exact portable ZIP validation hash. Synthetic source/output files are under demo-data; session logs and frame timings are in the Desktop work folder.
