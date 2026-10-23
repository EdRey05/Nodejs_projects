## 002 · MD Studio

<details markdown="1">
<summary>Expand this to read more...</summary>

**Edit local Markdown with source and live preview side by side.** Mount a folder, select a Markdown file, edit it in Split view and save directly to the original file.

[![MD Studio recording](Images_GIFs_Videos/002_MD_Studio.gif)](Images_GIFs_Videos/002_MD_Studio.mp4)

[Watch the MP4](Images_GIFs_Videos/002_MD_Studio.mp4) · [App instructions and source](https://github.com/EdRey05/Nodejs_projects/tree/main/002_MD_Studio) · [Synthetic sample](demo-data/002/Notebook.md)

**How to use it**

1. Extract the Windows portable folder and double-click Start.cmd.
2. Paste your Markdown folder path and select Mount Workspace.
3. Open a .md file. Edit source on the left and inspect the live preview on the right.
4. Click Save or press Ctrl+S. Use Stop.cmd when finished.

**In the demo:** mount a disposable folder, edit a fictional project notebook, inspect the live preview, save and reopen the actual output. Browser automation supplies the synthetic folder path and drives the real editor. Preview HTML is sanitized; external images and links may still need internet. Closing the browser tab does not stop the background app.

[Verified example output](demo-data/002/Notebook-edited.md)

</details>

---

## 001 · Personal Savings & Investing Tracker

<details markdown="1">
<summary>Expand this to read more...</summary>

**Explore savings and investment records from an Excel workbook.** Import accounts and transactions, inspect charts, add a transaction and export the updated workbook. This older personal project is retained as an offline runnable example.

[![Finance tracker recording](Images_GIFs_Videos/001_S_I.gif)](Images_GIFs_Videos/001_S_I.mp4)

[Watch the MP4](Images_GIFs_Videos/001_S_I.mp4) · [App instructions and workbook format](https://github.com/EdRey05/Nodejs_projects/tree/main/001_S_I) · [Synthetic workbook](demo-data/001/Synthetic_FinancialData.xlsx)

**How to use it**

1. Extract the Windows portable folder and double-click Start.cmd.
2. Open Manage & Import and import the synthetic workbook.
3. Select an account, inspect transactions/charts and add entries.
4. Export the workbook before refreshing or closing; changes are held in memory. Use Stop.cmd when finished.

**In the demo:** import three fictional accounts with thirty transactions, verify a $4,290 savings balance, add a $100 contribution and export the resulting workbook. File selection and UI actions are automated against the actual packaged application; no result screens are simulated. Calculations are simplified personal tracking, not brokerage valuation or financial advice. No AI or cloud account is used.

[Verified example output](demo-data/001/FinancialData.xlsx)

</details>
