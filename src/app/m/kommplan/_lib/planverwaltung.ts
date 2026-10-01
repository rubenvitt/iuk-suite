import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan } from "../_db/schema";
import { tagZuMs, type PlanTyp } from "./angaben";
import type { DuplikatErgebnis, EinfachErgebnis } from "./ergebnis";
import { lies } from "./plaene";
import type { Bearbeiter } from "./speichern";
import { heuteIso, titelFuerKopie } from "./tagesfassung";

/**
 * PLANVERWALTUNG (Spec §6.7, §8.3; Umsetzungsplan Phase 4, Entscheidungen 7–10) — nur Server. Jede ID wird hier
 * gegen die Datenbank aufgelöst (IDOR); jeder Schreibvorgang ist eine Audit-Zeile über den Trigger von `plan`
 * (`ist_vorlage`, `archiviert_am`, Anlegen). Archivieren und Vorlage ändern den „Stand" NICHT — der Stand ist der
 * Inhalt, nicht seine Ablage. „Jetzt" kommt als Argument.
 */
export const PLAN_WEG = "Diesen Plan gibt es nicht mehr.";
/** Was „Neuer Plan" zum Vorbelegen braucht (Entscheidung 8): Art, Anlass und Titel der Vorlage. */
export interface VorlageWahl { id: string; titel: string; typ: PlanTyp; anlass: string | null }

export function vorlagenZurAuswahl(db: KommplanDb): VorlageWahl[] {
  return db.select({ id: plan.id, titel: plan.titel, typ: plan.typ, anlass: plan.anlass }).from(plan)
    .where(and(eq(plan.istVorlage, true), isNull(plan.archiviertAm))).orderBy(asc(plan.titel), plan.id).all();
}

export function dupliziere(db: KommplanDb, id: string, wer: Bearbeiter, jetzt: number): DuplikatErgebnis {
  const q = db.select().from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).get();
  if (!q) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const inhalt = lies(q).inhalt;
  if (!inhalt) return { ok: false, fehler: "Dieser Plan lässt sich nicht lesen und deshalb nicht duplizieren.", feldFehler: {} };
  const heute = heuteIso(jetzt);
  const neu = randomUUID();
  const titel = titelFuerKopie(q.titel, heute);
  db.insert(plan).values({
    id: neu, titel: titel.titel, typ: q.typ, anlass: q.anlass, datum: new Date(tagZuMs(heute)),
    istVorlage: false, aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(inhalt),
  }).run();
  return { ok: true, id: neu, titel: titel.art };
}

export function setzeVorlage(db: KommplanDb, id: string, vorlage: boolean): EinfachErgebnis {
  const r = db.update(plan).set({ istVorlage: vorlage }).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}

export function archiviere(db: KommplanDb, id: string, jetzt: number): EinfachErgebnis {
  const r = db.update(plan).set({ archiviertAm: new Date(jetzt) }).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}

export function stelleWiederHer(db: KommplanDb, id: string): EinfachErgebnis {
  const r = db.update(plan).set({ archiviertAm: null }).where(and(eq(plan.id, id), isNotNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}
