"use client";
import type { BrowserExport } from "./browser-schema";
/** Called only after handing the successfully generated file to the browser. Best effort, no queue. */
export function reportBrowserExport(event: BrowserExport): void {
  try {
    void fetch("/api/audit/browser", {
      method: "POST", credentials: "same-origin", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(event),
    }).catch(() => { /* Offline exports remain usable; never replay a claimed success. */ });
  } catch { /* A synchronous browser/network failure must not affect the export either. */ }
}
