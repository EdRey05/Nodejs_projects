const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gsaDesktop", {
  /** Run python_tools/bridge.py with the bundled Python. Same contract as runBridge(). */
  runBridge: (inputData) => ipcRenderer.invoke("python:runBridge", inputData),
  /** Desktop save dialog for a base64 xlsx -> returns chosen path or null. */
  saveExcel: (payload) => ipcRenderer.invoke("dialog:saveExcel", payload),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  isDesktop: true,
});