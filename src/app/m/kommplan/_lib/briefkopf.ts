import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AvErgebnis } from "@/core/av/scanner";
import type { KommplanDb } from "../_db/client";
import { briefkopf } from "../_db/schema";
import { LAENGE_ORGANISATION } from "./angaben";
import type { EinfachErgebnis, LogoErgebnis } from "./ergebnis";
import { LOGO_MAX_BYTES, pruefeLogoDatei, type LogoTyp } from "./logo/logoTyp";
import { bereinigeSvg } from "./logo/svg";
import type { Bearbeiter } from "./speichern";

/**
 * BRIEFKOPF (Spec §4.4; Umsetzungsplan Phase 4, Entscheidungen 2, 4–6) — nur Server. Organisationsname
 * und Logo kommen aus der Datenbank, nie aus dem Code; ohne Eintrag bleibt der Kopf leer (kein Ersatz).
 *
 * LOGO-KETTE (`speichereLogo`): Größe und Typ aus den Bytes → Virenscan der hochgeladenen Bytes (fail-
 * closed) → bei SVG Bereinigung → speichern samt SHA-256. Erst wenn alles durch ist, wird geschrieben;
 * eine abgelehnte Datei hinterlässt nichts. Zeit kommt als `jetzt` herein (testbar, kein `Date.now()`).
 */
export interface Briefkopf { organisation: string | null; logo: { typ: LogoTyp; bytes: number } | null; aktualisiertAm: number | null; aktualisiertVon: string | null }
/** Was der Kopf der Zeichnung braucht (`Rahmen.organisation`, `Rahmen.logo`). */
export interface KopfAngaben { organisation: string | null; logo: { href: string } | null }
export type LogoScan = (bytes: Uint8Array) => Promise<AvErgebnis>;
export const LOGO_MELDUNG = {
  befund: "Der Virenscanner hat in der Datei etwas gefunden. Sie wurde nicht übernommen.",
  pruefung: "Die Virenprüfung ist gerade nicht möglich. Versuch es später noch einmal.",
  svg: (grund: string) => `Das SVG lässt sich nicht sicher übernehmen: ${grund}`,
  grossNachBereinigung: "Das bereinigte SVG ist größer als 1 MB.",
} as const;

type Leser = Pick<KommplanDb, "select">;
type Schreiber = Pick<KommplanDb, "insert">;
const zeile = (db: Leser) => db.select().from(briefkopf).where(eq(briefkopf.id, 1)).get();

export function ladeBriefkopf(db: Leser): Briefkopf {
  const z = zeile(db);
  return {
    organisation: z?.organisation ?? null,
    logo: z?.logo && z.logoMime ? { typ: z.logoMime as LogoTyp, bytes: z.logo.length } : null,
    aktualisiertAm: z?.aktualisiertAm.getTime() ?? null,
    aktualisiertVon: z?.aktualisiertVon ?? null,
  };
}

export function kopfFuerZeichnung(db: Leser): KopfAngaben {
  const z = zeile(db);
  return {
    organisation: z?.organisation ?? null,
    logo: z?.logo && z.logoMime ? { href: `data:${z.logoMime};base64,${Buffer.from(z.logo).toString("base64")}` } : null,
  };
}

/** Eine Zeile, `id = 1`: anlegen oder ändern (Entscheidung 2). */
function schreibe(db: Schreiber, werte: Partial<typeof briefkopf.$inferInsert>, wer: Bearbeiter, jetzt: number): void {
  const stand = { aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name };
  db.insert(briefkopf).values({ id: 1, ...werte, ...stand }).onConflictDoUpdate({ target: briefkopf.id, set: { ...werte, ...stand } }).run();
}

const organisationSchema = z.object({
  organisation: z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v),
    z.string().max(LAENGE_ORGANISATION, `Höchstens ${LAENGE_ORGANISATION} Zeichen.`).nullable()),
}).strict();

export function setzeOrganisation(db: Schreiber, eingabe: unknown, wer: Bearbeiter, jetzt: number): EinfachErgebnis {
  const r = organisationSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: r.error.issues[0]?.message ?? "Ungültige Anfrage." };
  schreibe(db, { organisation: r.data.organisation }, wer, jetzt);
  return { ok: true };
}

export async function speichereLogo(db: Schreiber, bytes: Uint8Array, wer: Bearbeiter, jetzt: number, scan: LogoScan): Promise<LogoErgebnis> {
  const p = pruefeLogoDatei(bytes);
  if (!p.ok) return p;
  const befund = await scan(bytes);
  if (befund.art === "infected") return { ok: false, fehler: LOGO_MELDUNG.befund };
  if (befund.art !== "clean") return { ok: false, fehler: LOGO_MELDUNG.pruefung };
  let ablage = Buffer.from(bytes);
  if (p.typ === "image/svg+xml") {
    const r = bereinigeSvg(new TextDecoder().decode(bytes));
    if (!r.ok) return { ok: false, fehler: LOGO_MELDUNG.svg(r.grund) };
    ablage = Buffer.from(r.svg, "utf8");
    if (ablage.length > LOGO_MAX_BYTES) return { ok: false, fehler: LOGO_MELDUNG.grossNachBereinigung };
  }
  schreibe(db, { logo: ablage, logoMime: p.typ, logoSha256: createHash("sha256").update(ablage).digest("hex") }, wer, jetzt);
  return { ok: true, typ: p.typ };
}

export function entferneLogo(db: Schreiber, wer: Bearbeiter, jetzt: number): EinfachErgebnis {
  schreibe(db, { logo: null, logoMime: null, logoSha256: null }, wer, jetzt);
  return { ok: true };
}
