import type Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { moduleDbPath, openModuleDatabase } from "@/core/db";
import { AUDIT_SOURCES } from "./catalog";
import { auditCutoff, purgeAuditEvents } from "./retention";
import { AUDIT_COLUMNS, insertAuditRow, withAuditDatabase, type AuditRow } from "./storage";

export type AuditTransferResult = { transferred: number; expired: number; pending: number; failures: string[] };
/** Central commit precedes acknowledgement. A crash between them retries the same stable event IDs. */
export function transferAuditSource(source: Database.Database, central: Database.Database, now = Date.now()): { transferred: number; expired: number } {
  const cutoff = auditCutoff(now);
  const rows = source.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_outbox ORDER BY occurred_at, id LIMIT 500`).all() as AuditRow[];
  let transferred = 0; let expired = 0;
  central.transaction(() => {
    for (const row of rows) {
      if (row.occurred_at < cutoff) { expired++; continue; }
      insertAuditRow(central, row); transferred++;
    }
  })();
  source.transaction(() => {
    const acknowledge = source.prepare("DELETE FROM audit_outbox WHERE id = ?");
    for (const row of rows) acknowledge.run(row.id);
  })();
  return { transferred, expired };
}
export function transferAuditEvents(): AuditTransferResult {
  const result: AuditTransferResult = { transferred: 0, expired: 0, pending: 0, failures: [] };
  for (const sourceKey of AUDIT_SOURCES) {
    const path = moduleDbPath(sourceKey);
    if (!existsSync(path)) continue;
    let source: Database.Database | undefined;
    try {
      source = openModuleDatabase(path);
      const transferred = withAuditDatabase(central => transferAuditSource(source!, central));
      result.transferred += transferred.transferred; result.expired += transferred.expired;
    } catch { result.failures.push(sourceKey); }
    finally {
      if (source) {
        try { result.pending += (source.prepare("SELECT count(*) n FROM audit_outbox").get() as { n: number }).n; }
        catch { if (!result.failures.includes(sourceKey)) result.failures.push(sourceKey); }
        source.close();
      }
    }
  }
  return result;
}
const root = globalThis as typeof globalThis & { __suiteAuditTimer?: ReturnType<typeof setInterval> };
export function startAuditBackgroundWork(): void {
  if (process.env.NODE_ENV === "test" || root.__suiteAuditTimer) return;
  const work = () => {
    try {
      const result = transferAuditEvents();
      if (result.failures.length) console.error("[audit] Übernahme fehlgeschlagen; Ausgangsereignisse bleiben erhalten.");
      purgeAuditEvents();
    } catch { console.error("[audit] Wartung fehlgeschlagen."); }
  };
  root.__suiteAuditTimer = setInterval(work, 30_000);
  root.__suiteAuditTimer.unref();
}
