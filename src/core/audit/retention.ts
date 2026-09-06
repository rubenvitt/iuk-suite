import { withAuditDatabase } from "./storage";
export function auditRetentionDays(): number {
  const raw = process.env.SUITE_AUDIT_AUFBEWAHRUNG_TAGE ?? "90";
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || !Number.isSafeInteger(Number(raw) * 86400000)) throw new Error("SUITE_AUDIT_AUFBEWAHRUNG_TAGE muss eine positive ganze Zahl sein");
  return Number(raw);
}
export function auditCutoff(now = Date.now()): number { return now - auditRetentionDays() * 86400000; }
export function purgeAuditEvents(now = Date.now()): number {
  const cutoff = auditCutoff(now);
  return withAuditDatabase(db => db.prepare("DELETE FROM audit_events WHERE occurred_at < ?").run(cutoff).changes);
}
