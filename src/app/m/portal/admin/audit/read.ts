import { requireAuditReader } from "@/core/audit/access";
import { queryAuditEvents } from "@/core/audit/storage";
import { transferAuditEvents } from "@/core/audit/transfer";
import type { AuditPage } from "@/core/audit/types";
import { parseAuditFilters, type AuditSearch } from "./filters";
export type AuditView = { state: "ready"; page: AuditPage; filtered: boolean; pending: number; transferFailed: boolean } | { state: "invalid" | "unavailable"; message: string };
/** Kept outside use-server: this helper is not a remotely callable action. */
export async function readAuditView(search: AuditSearch): Promise<AuditView> {
  await requireAuditReader();
  let filters;
  try { filters = parseAuditFilters(search); }
  catch (error) { return { state: "invalid", message: error instanceof Error ? error.message : "Prüfe die Filter." }; }
  try {
    const transfer = transferAuditEvents();
    const page = queryAuditEvents(filters);
    return { state: "ready", page, filtered: Object.keys(filters).some(k => k !== "limit"), pending: transfer.pending, transferFailed: transfer.failures.length > 0 };
  } catch {
    console.error("[audit] Audit-Ansicht konnte nicht geladen werden.");
    return { state: "unavailable", message: "Das Audit-Log ist gerade nicht verfügbar. Lade die Ansicht erneut. Bleibt der Fehler bestehen, prüfe den Speicher und die Ereignisübernahme." };
  }
}
