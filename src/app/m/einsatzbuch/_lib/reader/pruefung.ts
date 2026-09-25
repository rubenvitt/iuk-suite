import { z } from "zod";
import { ausBase64 } from "../kern/bytes";
import type { Einsatz, Exportinhalt } from "../kern/format";

/**
 * zod-Prüfung für alles, woran die Anzeige nach dem Entschlüsseln abstürzen könnte (Plan Stufe 3,
 * `docs/superpowers/plans/2026-09-24-einsatzbuch-v2-stufe-3-reader.md`, Entscheidung 1). Der Kern
 * prüft die Form bereits (`istExportinhalt`, `istEinsatz`); zod verschärft Datums-, Uhrzeit- und
 * Zeitpunktformate (echter Kalendertag), Hex-Längen, Längengrenzen und den CEK (Base64, 32 Byte).
 */
const ZEITPUNKT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;
function echterTag(j: number, m: number, t: number) { const d = new Date(Date.UTC(j, m - 1, t)); return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t; }

/** ISO-Zeitpunkt mit Pflicht-Offset UND echtem Kalendertag (strenger als `zeitpunktText` im Kern). */
export function istEchterZeitpunkt(s: string): boolean {
  const m = ZEITPUNKT.exec(s);
  if (!m) return false;
  const [, j, mo, t, h, mi, se, , oh, om] = m;
  if (!echterTag(+j, +mo, +t) || +h > 23 || +mi > 59 || (se !== undefined && +se > 59)) return false;
  return oh === undefined || (+oh <= 14 && +om <= 59);
}
const zeitpunkt = z.string().refine(istEchterZeitpunkt, "kein Zeitpunkt mit Offset");
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => { const [j, m, t] = s.split("-").map(Number); return echterTag(j, m, t); });
const uhrzeit = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hex = (n: number) => z.string().regex(new RegExp(`^[0-9a-f]{${n}}$`));
const kurzText = (max: number) => z.string().max(max);
const zahl = z.number().int().min(0).max(999);

export const einsatzSchema = z.object({
  v: z.literal(1), nummer: kurzText(40), stichwort: kurzText(80),
  beginnDatum: datum, beginnZeit: uhrzeit,
  endeDatum: datum.nullable(), endeZeit: uhrzeit.nullable(),
  strasse: kurzText(200), ort: kurzText(200), objekt: kurzText(500),
  fahrzeuge: z.array(z.object({ id: kurzText(80), typ: kurzText(40), kennung: kurzText(40), ruf: kurzText(120), standort: kurzText(80) }).strict()).max(200),
  personal: z.array(z.object({ id: kurzText(80), name: kurzText(120), quali: kurzText(40), ov: kurzText(80), fahrzeugId: kurzText(80).nullable() }).strict()).max(1000),
  vorOrt: zahl, transport: zahl, notizen: kurzText(20_000),
}).strict().refine((e) => (e.endeDatum === null) === (e.endeZeit === null), "Ende nur vollständig");

/** Kopf, Umschlag und CEK einzeln exportiert: `anbindung/vertrag.ts` prüft `schluessel/freigeben` damit gleich streng. */
export const cekSchema = z.string().refine((s) => { try { return ausBase64(s).length === 32; } catch { return false; } });
export const kopfSchema = z.object({ v: z.literal(1), block: z.number().int().min(1), prev: hex(64), versiegelt: zeitpunkt, schluesselId: hex(16), umgebung: z.enum(["echt", "test"]) }).strict();
export const umschlagSchema = z.object({ epk: z.string(), iv: z.string(), ct: z.string() }).strict();
const block = z.object({ kopf: kopfSchema, iv: z.string(), daten: z.string(), hash: hex(64), umschlag: umschlagSchema }).strict();

export const exportinhaltSchema = z.object({
  bloecke: z.array(block).min(1).max(10_000),
  schluessel: z.record(z.string().regex(/^[1-9]\d*$/), cekSchema),
  exportiertVon: kurzText(200), quelle: kurzText(200),
  anker: z.object({ block: z.number().int().min(1), hash: hex(64), gemeldetAm: zeitpunkt }).strict().nullable(),
}).strict().refine((i) => { const da = new Set(i.bloecke.map((b) => String(b.kopf.block))); return Object.keys(i.schluessel).every((k) => da.has(k)); }, "Schlüssel ohne Block");

export const exportkopfSchema = z.object({
  erstellt: zeitpunkt, umfang: z.enum(["alle", "einzeln"]), von: z.number().int().min(1), bis: z.number().int().min(1),
  anzahl: z.number().int().min(1), quelle: kurzText(200),
}).strict().refine((k) => k.von <= k.bis);

// Typassertion: zod-Ergebnis und Kern-Typen dürfen nicht auseinanderlaufen.
type Gleich<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _einsatzPasst: Gleich<z.infer<typeof einsatzSchema>, Einsatz> = true;
const _inhaltPasst: Gleich<z.infer<typeof exportinhaltSchema>["anker"], Exportinhalt["anker"]> = true;
void _einsatzPasst; void _inhaltPasst;
