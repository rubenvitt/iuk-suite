import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { KommplanDb } from "../_db/client";
import { eigenesZeichen, plan } from "../_db/schema";
import { feldFehlerAus } from "./angaben";
import { vergleichsform } from "./bibliothek/typen";
import type { EigenesZeichenErgebnis, EinfachErgebnis } from "./ergebnis";
import type { Bearbeiter } from "./speichern";
import { eigenerSchluessel } from "./zeichen/eigen/schluessel";
import { EIGENE_ZEICHEN_MAX, EIGENER_TITEL_MAX, type EigenesZeichen } from "./zeichen/eigen/typen";
import { liesSpec, zeichneEigenes } from "./zeichen/eigen/zeichne";

/**
 * EIGENE ZEICHEN IN DER DATENBANK — nur Server. Jede ID wird hier aufgelöst (IDOR); die Zusammenstellung wird in
 * der Form (`parseSpec`) UND im Bild (`checkSpec` über `zeichneEigenes`) geprüft, bevor sie gespeichert wird: was
 * hier steht, lässt sich zeichnen. Auditiert über die Trigger der Tabelle (Migration 0003).
 */
export const ZEICHEN_WEG = "Dieses Zeichen gibt es nicht mehr.";
const SCHON = (name: string) => `„${name}“ heißt schon ein eigenes Zeichen.`;

const eingabeSchema = z.object({
  id: z.uuid().nullable(),
  titel: z.string().trim().min(1, "Bitte einen Namen eintragen.").max(EIGENER_TITEL_MAX, `Höchstens ${EIGENER_TITEL_MAX} Zeichen.`),
  spec: z.unknown(),
}).strict();
const loeschSchema = z.object({ id: z.uuid() }).strict();

/** In wie vielen Plänen der Schlüssel steht — als JSON-Zeichenkette mit Anführungszeichen, also kein Teiltreffer. */
function nutzung(db: Pick<KommplanDb, "select">, id: string): number {
  const nadel = JSON.stringify(eigenerSchluessel(id));
  return db.select({ n: sql<number>`count(*)` }).from(plan).where(sql`instr(${plan.inhalt}, ${nadel}) > 0`).get()!.n;
}

/** Die Zeichen mit Beschreibung; eine Zeile, die (nach einem Paketwechsel) nicht mehr zeichnet, steht trotzdem da. */
export function ladeEigeneZeichen(db: Pick<KommplanDb, "select">): EigenesZeichen[] {
  return db.select().from(eigenesZeichen).all().flatMap((z): EigenesZeichen[] => {
    const r = liesSpec(JSON.parse(z.spec));
    if (!r.ok) return [];
    const bild = zeichneEigenes(r.spec, "kpe-liste");
    return [{
      id: z.id, schluessel: eigenerSchluessel(z.id), titel: z.titel, spec: r.spec, nutzung: nutzung(db, z.id),
      beschreibung: bild.ok ? bild.beschreibung : "Lässt sich mit der heutigen Zeichenfassung nicht mehr zeichnen.",
    }];
  }).sort((a, b) => a.titel.localeCompare(b.titel, "de") || (a.id < b.id ? -1 : 1));
}

export function speichereEigenesZeichen(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): EigenesZeichenErgebnis {
  const r = eingabeSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: feldFehlerAus(r.error) };
  const s = liesSpec(r.data.spec);
  if (!s.ok) return { ok: false, fehler: s.fehler };
  const bild = zeichneEigenes(s.spec, "kpe-probe");
  if (!bild.ok) return { ok: false, fehler: "Diese Zusammenstellung lässt sich nicht zeichnen — die Vorschau sagt, woran es liegt." };
  const { id, titel } = r.data;
  const werte = { titel, spec: JSON.stringify(s.spec), aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name };
  return db.transaction((tx): EigenesZeichenErgebnis => {
    const doppelt = tx.select({ id: eigenesZeichen.id, titel: eigenesZeichen.titel }).from(eigenesZeichen).all()
      .find((x) => x.id !== id && vergleichsform(x.titel) === vergleichsform(titel));
    if (doppelt) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: SCHON(doppelt.titel) } };
    if (id === null) {
      if (tx.select({ n: sql<number>`count(*)` }).from(eigenesZeichen).get()!.n >= EIGENE_ZEICHEN_MAX) {
        return { ok: false, fehler: `Höchstens ${EIGENE_ZEICHEN_MAX} eigene Zeichen.` };
      }
      const neu = randomUUID();
      tx.insert(eigenesZeichen).values({ id: neu, ...werte }).run();
      return { ok: true, id: neu, schluessel: eigenerSchluessel(neu), titel };
    }
    const u = tx.update(eigenesZeichen).set(werte).where(eq(eigenesZeichen.id, id)).run();
    return u.changes === 1 ? { ok: true, id, schluessel: eigenerSchluessel(id), titel } : { ok: false, fehler: ZEICHEN_WEG };
  });
}

/** Löschen. Pläne behalten den Schlüssel; ihre Karte zeigt danach nur den Titel (wie bei jedem unbekannten Zeichen). */
export function loescheEigenesZeichen(db: KommplanDb, eingabe: unknown): EinfachErgebnis {
  const r = loeschSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Ungültige Anfrage." };
  return db.delete(eigenesZeichen).where(eq(eigenesZeichen.id, r.data.id)).run().changes === 1 ? { ok: true } : { ok: false, fehler: ZEICHEN_WEG };
}

/** Die Zusammenstellungen zu Schlüsseln (`symbole.ts`) — unbekannte und unlesbare fallen still weg. */
export function eigeneSpecs(db: Pick<KommplanDb, "select">, ids: readonly string[]): Map<string, { titel: string; spec: ReturnType<typeof liesSpec> }> {
  if (ids.length === 0) return new Map();
  const zeilen = db.select().from(eigenesZeichen).where(sql`${eigenesZeichen.id} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`).all();
  return new Map(zeilen.map((z) => [z.id, { titel: z.titel, spec: liesSpec(JSON.parse(z.spec)) }]));
}

/** Titel und Suchtext aller eigenen Zeichen, ohne zu zeichnen — für den Zeichen-Index. */
export function eigeneTitel(db: Pick<KommplanDb, "select">): { id: string; titel: string }[] {
  return db.select({ id: eigenesZeichen.id, titel: eigenesZeichen.titel }).from(eigenesZeichen).all();
}
