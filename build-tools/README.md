# Portable Windows builds

Run from the repository root in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-tools\Build-Apps.ps1 -All
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-tools\Build-Apps.ps1 -Apps 002_MD_Studio
```

Prerequisites: Windows x64 with Windows Sandbox enabled, PowerShell, Git and internet for the build. No host Node, npm, Python or compiler installation is required. Existing sandboxes are never reused or stopped. Default output: Desktop\Nodejs_standarization\runs\<timestamp>\output. Use -Output to choose the evidence root and -PrepareOnly to inspect source snapshot and generated configuration.

One disposable guest builds all selected apps sequentially. Source is snapshotted from tracked/nonignored files; environment files, remembered configuration, databases, old outputs and dependencies are excluded. Node is checksum verified, npm caches are shared within this guest, and dependencies remain isolated per app. Python is a checksum-pinned complete standalone distribution, with explicit dependency versions. App profiles live in apps.json; add a unique ID, entry, route, kind and optional Python flag for future apps, then add relevant validation.

Each output includes logs, source hashes, Git provenance, resolved locks, artifact SHA256 and a result record. Packaging success is separate from clean-runtime validation. On build failure, diagnostics are exported and the guest shuts down. -KeepOnFailure explicitly retains a failed guest for inspection; close it after review. -RefreshLocks is a deliberate dependency-maintenance operation: review/export updated locks into source and rebuild without this flag before delivery. Ordinary builds use npm ci only. If the host times out, inspect the run folder and close only that owned sandbox. A host crash may require manual cleanup. No publishing occurs.

Extract a portable ZIP into a writable local folder, then double-click Start.cmd. Your default browser opens after the local service is ready. Closing a browser tab does not stop the service: double-click Stop.cmd when finished. Reopening Start.cmd reuses that folder's running instance. Each app uses a random loopback-only port. Keep the whole folder together; moving it while running is unsupported. Stop it before relocation or replacement. No Node/Python installation or WSL is needed on the destination PC. Windows and an installed browser are host prerequisites. Unsigned downloads may receive Windows reputation prompts.

The portable folder stores application.log and temporary portable-state.json. MD Studio stores config.json under app/ and edits the workspace you explicitly mount. Gene Synthesis stores data under app/data. Finance state is in memory: export the workbook before refresh/closing. Back up user data before replacing a version; never copy synthetic demonstration data over personal data.

## Versions and validation

001 is restored as an offline demo at 0.2.0; MD Studio adds portable/security fixes at 1.1.0; Gene Synthesis advances to 0.0.8 for packaging/runtime fixes. 003 remains an incomplete prototype with no showcase demo. No domain redesign or invented workflow completion is included.

Use Test-Apps.ps1 against the matching build output for clean offline validation. Test receipt hashes must match delivered ZIPs. Recordings for 001/002 are produced separately; they demonstrate only the documented synthetic workflows.
