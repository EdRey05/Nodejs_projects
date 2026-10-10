# Gene Synthesis Automations — portable exe (Electron shell)

Portable Windows exe that runs the Gene Synthesis Automations web app as a desktop app.

## What the exe is

- `Gene_Synthesis_Automations-0.0.4-x64.exe` — single-file portable Electron launcher.
- Bundles its own runtimes: portable **Node 22.14** (`resources/runtime/node/`) and
  **CPython 3.11.9 + duckdb + pandas + openpyxl + pyyaml** (`resources/runtime/python/`).
- The app itself still lives in the repo checkout. The exe boots the Next.js
  **standalone** production server (`.next/standalone/server.js`) on
  `http://127.0.0.1:4177` and opens it in the window. This is deliberate: the exe
  always shows the **current state of the repo** — rebuild the Next bundle and the
  same exe picks it up. The database (`data/GeneSyn_db.duckdb`) is likewise read
  live from the repo's `data/` folder.

## Repo discovery

The exe finds the repo by probing, in order:

1. `GSA_REPO_ROOT` environment variable (explicit override)
2. cwd, climbing 5 levels up
3. the exe's own folder, climbing 6 levels up

A candidate counts as the repo when both exist:

- `python_tools/bridge.py`
- `.next/standalone/server.js`

Launch it from anywhere inside the repo tree, or set `GSA_REPO_ROOT`.
If none of these hit, an error box explains exactly what it looked for.

## Rebuilding the exe (all steps, from `_electron_sidecar/`)

Run `BUILD_EXE.bat` (double-click) or step manually:

```bat
cd _electron_sidecar

rem 1. Node deps of the app itself (root package.json)
cd .. && npm install && cd _electron_sidecar

rem 2. Next.js production standalone bundle
set NODE_ENV=production
npx next build

rem 3. Keep the standalone bundle servable
xcopy /E /I /Y .next\static .next\standalone\.next\static

rem 4. Sidecar Electron deps (first time only)
cd _electron_sidecar && npm install
rem if electron's postinstall was blocked by npm install-scripts allowlist:
node node_modules\electron\install.js

rem 5. Runtimes (first time only)
npm run build:runtime
npm run build:python

rem 6. Package
npx electron-builder --win portable --x64
```

Output: `release\Gene_Synthesis_Automations-<version>-x64.exe` (single-file portable)
plus `release\win-unpacked\` — the same app as a folder; either works. The
single-file exe self-extracts to %TEMP% at launch (first launch ~10–20 s),
`win-unpacked` starts faster. The `.nsis.7z` intermediate in `release/` is a
build artifact and can be deleted.

## What was NOT rebuilt when the underlying app changes

The exe only needs a rebuild when `electron/main.js`, `preload.js`, the runtimes,
or the version string change. App changes (src/, python_tools/) just need
steps 2–3, then relaunch the exe.

## Known limitations

- Built for the machine that has the repo checkout. Without the repo next to the
  exe (or `GSA_REPO_ROOT`), it errors on purpose — the exe is a viewer/runner,
  not a data container.
- AI chatbot features need `GOOGLE_GENAI_API_KEY` in the environment (Genkit).
- App pages that rely on `next/image` with remote patterns work (built-in).