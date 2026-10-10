"use client";

/** Download a base64 xlsx from a bridge action as a file (dev/browser path).
 *  On the Electron desktop shell the save dialog IPC is preferred when wired
 *  (window.gsaDesktop.saveExcel); this fallback works everywhere. */
export async function downloadBase64Excel(base64: string, filename: string) {
    const desktop = (window as any).gsaDesktop;
    if (desktop?.saveExcel) {
        const savedPath = await desktop.saveExcel({ base64, suggestedFilename: filename });
        if (savedPath) return savedPath;
    }
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return null;
}