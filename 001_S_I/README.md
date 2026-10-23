# Personal Savings & Investing Tracker

Offline personal finance workbook viewer/editor. This older app is retained as a runnable example, with generated AI/cloud scaffolding removed. It is not connected to any financial institution.

Extract the portable ZIP and double-click Start.cmd. Open **Manage & Import**, import the synthetic workbook under examples/ in the portable folder (demo-data/001 in the repository), choose an account, and inspect savings/investment transactions and charts. Use **Export** in account management to save your changes. Refreshing/closing loses unsaved in-memory changes. Stop.cmd stops the background service.

Workbook sheets: Accounts (required), S_Transactions, I_M_Transactions and I_SD_Transactions. Accounts use id, name, bank, type (savings/investment), optional interestRate and subtype (managed/self-directed). Transactions use id, accountId, type, amount and ISO date, with optional assetName/assetCode/assetCategory/shares for holdings. Use the supplied synthetic workbook as the format reference. Keep account IDs unique and transaction accountId values linked to them.

Charts and projections reflect the app's simplified calculations, not brokerage valuation or financial advice. Workbook import/export is the persistence contract. No AI, cloud account or API key is required. System fonts work offline.

Source development: npm ci, npm run typecheck, npm run build, npm start. Portable builds: [shared instructions](../build-tools/README.md). [MIT license](../LICENSE).
