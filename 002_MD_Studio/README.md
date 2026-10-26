# Markdown Studio

A focused local Markdown editor with source and rendered preview side by side.

In Split view, the pane you scroll drives the other pane by relative position. Wheel/trackpad, keyboard navigation and scrollbar interaction can switch the driving pane; synchronized updates do not feed back into it. Use Sync to scroll the panes independently. Positions are proportional, rather than exact paragraph-to-paragraph alignment.

1. Extract the portable ZIP into a writable folder and double-click Start.cmd.
2. Choose Browse folders and select your Markdown folder, or paste its Windows path and choose Save path (Enter). The workspace opens immediately and is remembered; later launches open it automatically. Change lets you select a different folder; canceling does not forget the old one.
3. Select a .md file. Split is the default: edit source on the left and inspect the live preview on the right.
4. Click Save (or the existing keyboard shortcut) to write changes to the original file. Keep backups for important files. Use Preview/Edit/Split to switch views.
5. Use Stop.cmd when finished; closing the browser tab alone leaves the local server running.

The workspace path is remembered in app/config.json next to the portable app. Change Workspace lets you choose another folder. Moving the app does not move your workspace files. Only mount folders you intend to edit. Markdown HTML is sanitized; active scripts and event handlers are removed. External links/images can require a network connection; the editor itself works offline.

Windows x64 and a browser are required; Node, npm and WSL are bundled/unnecessary on the destination PC. Source development: npm ci, npm test, npm start, then open http://127.0.0.1:3000. [Shared builds](../build-tools/README.md), [MIT](../LICENSE).
