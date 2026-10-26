# Real packaged-app demonstrations

Run build-tools/Test-Apps.ps1 against a packaged build output. It opens a fresh Windows Sandbox with networking disabled, extracts each ZIP into a folder with spaces, and launches only the bundled runtimes. Edge is the Windows-provided browser. No developer runtime is installed in this test guest.

001 imports the fictional workbook through the actual file input (CDP supplies the path), verifies the dashboard balance, enters a contribution using the real form, and exports through the application's workbook writer. 002 mounts a disposable folder, opens and edits the notebook, inspects live preview, saves and reopens the real file. Tests capture the real app renderer continuously, with measured timestamps. Captions describe automation steps; no results are simulated. 003 receives HTTP/runtime/bridge smoke checks only and is never recorded.

Encode captured frames with an existing FFmpeg/ffprobe installation:

```powershell
pwsh -NoProfile -File .\demo-tools\Encode-Demos.ps1 -Validation <validation-run-folder>
```

The encoder uses an existing PowerShell 7 host (the Codex bundled runtime was used here) and FFmpeg. These are recording-only tools, not build or end-user prerequisites. It can run in a disposable tooling environment if not already available on the host. MP4 preserves measured timing at 12 fps; GIF previews are 720 pixels wide, 5 fps and 2x speed. recordings.json ties media hashes and encoding metadata to the exact portable ZIP validation hash. Synthetic source/output files are under demo-data; session logs and frame timings are in the Desktop work folder.

## Expanded MD Studio showcase

The current 1.2.0 showcase goes beyond the short validation workflow above. It captures the actual offline guest desktop with FFmpeg so the native Windows folder picker is visible, uses native UI control to select the package's examples folder, edits Notebook.md, creates Markdown-showcase.md through the app's New Markdown File prompt, and enters the document in sections through the editor. The saved/reopened content is compared with demo-data/002/Markdown-showcase.md. Checks verify the rendered headings, emphasis, underline, crossed-out text, lists, table, quotations and code blocks, plus stable stopping after real wheel scrolling. Underline and crossed-out examples use allowed inline HTML.

The launch screen, native selection and editor work were captured in guest sessions of the same validated package. The video combines those real captures, removes idle waits, accelerates native folder navigation 6x, and preserves editor timing. Its 720px GIF uses 4 fps at 2x speed. The receipt records these edits explicitly. The simple renderer-frame encoder does not recreate this desktop-dialog edit automatically; retain the capture recipe/evidence with the task when refreshing it. No simulated app screens or personal files are used. The committed document/media additions do not change the application sources in the validated 1.2.0 ZIP.
