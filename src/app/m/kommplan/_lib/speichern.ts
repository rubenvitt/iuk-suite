import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan, planBearbeitung } from "../_db/schema";
import { angabenSchema, feldFehlerAus, msZuTag, tagZuMs } from "./angaben";
import type { AnlageErgebnis, SpeicherErgebnis, Speicherstand } from "./ergebnis";
import { leererPlan } from "./plan/operationen";
import { leseInhalt } from "./plan/schema";
import { lies } from "./plaene";

/**
 * SPEICHERN (Spec §6.6) — nur Server. Die Actions in `_actions/plan.ts` prüfen Zugang und setzen
 * den Audit-Kontext; hier stehen Versionsprüfung und gebündeltes Audit, testbar ohne Next.
 *
 * VERSIONSPRÜFUNG ATOMAR: ein bedingtes `UPDATE … WHERE id = ? AND version = ? AND archiviert_am
 * IS NULL`; erst wenn es keine Zeile trifft, wird gelesen, WARUM (Konflikt oder weg). Ein vorheriges
 * SELECT mit anschließendem UPDATE ließe zwei gleichzeitige Speicherungen beide durch.
 *
 * GRÖSSE: nach den Feldgrenzen allein wäre ein Plan rund 16 100 000 Byte groß (gemessen, Umlaute), weit
 * über dem Aufruflimit der Server Actions von 1 MB; die große Stab-Lage hat 25 199 Byte. Die
 * Gesamtgrenze `GRENZE.bytes` im Schema (`plan/schema.ts`) hält jedes gültige Dokument darunter —
 * `leseInhalt` weist Größeres hier genauso ab wie jede Operation im Editor.
 */
export const BEARBEITUNGSFENSTER_MS = 15 * 60 * 1000;
export interface Bearbeiter { nutzer: string; name: string }
type Schreiber = Pick<KommplanDb, "select" | "insert" | "update">;

/** Entscheidung 1: höchstens EINE Audit-Zeile je Person und Plan in einem 15-Minuten-Fenster. */
export function merkeBearbeitung(db: Schreiber, planId: string, nutzer: string, jetzt: number): void {
  const wo = and(eq(planBearbeitung.planId, planId), eq(planBearbeitung.nutzer, nutzer));
  const z = db.select().from(planBearbeitung).where(wo).get();
  if (!z) db.insert(planBearbeitung).values({ planId, nutzer, seit: new Date(jetzt) }).run();
  else if (jetzt - z.seit.getTime() >= BEARBEITUNGSFENSTER_MS) db.update(planBearbeitung).set({ seit: new Date(jetzt) }).where(wo).run();
}

/** Der Serverstand eines Plans — für den Konflikt und für die Prüfung beim Montieren des Editors (Entscheidung 21). */
export function ladeStand(db: Schreiber, id: string): Speicherstand | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z || z.archiviertAm !== null) return null;
  return {
    version: z.version, inhalt: lies(z).inhalt,
    angaben: { titel: z.titel, typ: z.typ, anlass: z.anlass, datum: msZuTag(z.datum?.getTime() ?? null) },
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon,
  };
}

const FELDER = "Bitte die markierten Felder prüfen.";

export function legePlanAn(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): AnlageErgebnis {
  const a = angabenSchema.safeParse(eingabe);
  if (!a.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(a.error) };
  const id = randomUUID();
  db.insert(plan).values({
    id, titel: a.data.titel, typ: a.data.typ, anlass: a.data.anlass,
    datum: a.data.datum === null ? null : new Date(tagZuMs(a.data.datum)),
    aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(leererPlan()),
  }).run();
  return { ok: true, id };
}

function bedingtesUpdate(db: KommplanDb, id: string, version: number, werte: Partial<typeof plan.$inferInsert>, jetzt: number, wer: Bearbeiter, nachErfolg: (tx: Schreiber) => void): SpeicherErgebnis {
  return db.transaction((tx) => {
    const r = tx.update(plan)
      .set({ ...werte, version: sql`${plan.version} + 1`, aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name })
      .where(and(eq(plan.id, id), eq(plan.version, version), isNull(plan.archiviertAm))).run();
    if (r.changes === 1) {
      nachErfolg(tx);
      return { ok: true as const, version: version + 1, aktualisiertAm: jetzt };
    }
    const s = ladeStand(tx, id);
    return s ? { ok: false as const, grund: "konflikt" as const, stand: s } : { ok: false as const, grund: "weg" as const };
  });
}

export function speichereInhalt(db: KommplanDb, eingabe: { id: string; version: number; inhalt: unknown }, wer: Bearbeiter, jetzt: number): SpeicherErgebnis {
  const r = leseInhalt(eingabe.inhalt);
  if (!r.ok) return { ok: false, grund: "ungueltig", fehler: r.fehler };
  return bedingtesUpdate(db, eingabe.id, eingabe.version, { inhalt: JSON.stringify(r.inhalt) }, jetzt, wer,
    (tx) => merkeBearbeitung(tx, eingabe.id, wer.nutzer, jetzt));
}

/** Planangaben: je Änderung eine Audit-Zeile über den Trigger von `plan` (Entscheidung 1). */
export function speichereAngaben(db: KommplanDb, eingabe: { id: string; version: number; angaben: unknown }, wer: Bearbeiter, jetzt: number): SpeicherErgebnis {
  const a = angabenSchema.safeParse(eingabe.angaben);
  if (!a.success) return { ok: false, grund: "ungueltig", fehler: FELDER, feldFehler: feldFehlerAus(a.error) };
  return bedingtesUpdate(db, eingabe.id, eingabe.version, {
    titel: a.data.titel, typ: a.data.typ, anlass: a.data.anlass,
    datum: a.data.datum === null ? null : new Date(tagZuMs(a.data.datum)),
  }, jetzt, wer, () => {});
}
