import { AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_RESULTS, type AuditFilters } from "@/core/audit/types";
export type AuditSearch = Record<string, string | string[] | undefined>;
export const FILTER_KEYS = ["from", "to", "module", "actorId", "action", "result", "objectRefHash", "objectType"] as const;
export class AuditFilterError extends Error {
  constructor(message: string, readonly field?: "from" | "to" | "actorId") { super(message); }
}
/** Days are explicitly UTC, inclusive. Avoid ambiguous local DST boundaries. */
export function parseAuditFilters(search: AuditSearch): AuditFilters {
  const allowed = new Set<string>([...FILTER_KEYS, "cursorTime", "cursorId"]);
  if (Object.keys(search).some(k => !allowed.has(k))) throw Error("Unbekannter Filter. Setze die Filter zurück.");
  const values: Record<string,string> = {};
  for (const [key,value] of Object.entries(search)) {
    if (Array.isArray(value)) throw Error("Jeden Filter bitte nur einmal angeben.");
    if (value) values[key] = value;
  }
  const result: AuditFilters = { limit: 50 };
  const moduleKey = AUDIT_MODULES.find(m => m === values.module);
  const action = AUDIT_ACTIONS.find(a => a === values.action);
  const outcome = AUDIT_RESULTS.find(r => r === values.result);
  if ((values.module && !moduleKey) || (values.action && !action) || (values.result && !outcome)) throw Error("Wähle einen gültigen Filter.");
  if (moduleKey) result.module = moduleKey;
  if (action) result.action = action;
  if (outcome) result.result = outcome;
  if (values.actorId) {
    if (values.actorId.length > 512) throw new AuditFilterError("Die Personenkennung ist zu lang. Verwende höchstens 512 Zeichen.", "actorId");
    result.actorId = values.actorId;
  }
  if (values.objectRefHash || values.objectType) {
    if (!moduleKey || !values.objectType || !/^[a-z][a-z0-9_]{0,63}$/.test(values.objectType) || !values.objectRefHash) throw Error("Der Objektfilter braucht Modul, Objekttyp und Objektkennung. Setze diesen Filter zurück.");
    result.objectType = values.objectType;
    if (!/^[a-f0-9]{64}$/.test(values.objectRefHash)) throw Error("Die Objektkennung ist ungültig. Setze diesen Filter zurück.");
    result.objectRefHash = values.objectRefHash;
  }
  for (const key of ["from", "to"] as const) {
    if (!values[key]) continue;
    const value = values[key];
    const time = Date.parse(value + "T00:00:00.000Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || time < 0 || new Date(time).toISOString().slice(0,10) !== value) throw new AuditFilterError(`${key === "from" ? "Von (UTC)" : "Bis einschließlich (UTC)"}: Gib ein gültiges Datum im Format JJJJ-MM-TT ein.`, key);
    result[key] = time + (key === "to" ? 86_400_000 - 1 : 0);
  }
  if (result.from !== undefined && result.to !== undefined && result.from > result.to) throw new AuditFilterError("Bis einschließlich (UTC): Wähle ein Datum am oder nach dem Anfangsdatum.", "to");
  if (values.cursorTime || values.cursorId) {
    if (!/^\d{1,16}$/.test(values.cursorTime ?? "") || !Number.isSafeInteger(Number(values.cursorTime)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(values.cursorId ?? "")) throw Error("Diese Seitenauswahl ist ungültig. Lade die neuesten Einträge.");
    result.cursor = { occurredAt: Number(values.cursorTime), id: values.cursorId };
  }
  return result;
}
