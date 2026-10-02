import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNotNull, isNull, or } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan, planFreigabe } from "../_db/schema";
import { tagZuMs, type PlanTyp } from "./angaben";
import type { DuplikatErgebnis, EinfachErgebnis, VorlageErgebnis } from "./ergebnis";
import { lies } from "./plaene";
import { NICHT_ERLAUBT, rechteAn, sichtbarFuer, type Person } from "./rechte";
import type { Bearbeiter } from "./speichern";
import { heuteIso, titelFuerKopie } from "./tagesfassung";

/**
 * PLANVERWALTUNG (Spec §6.7, §8.3; Umsetzungsplan Phase 4, Entscheidungen 7–10; Phase 5 Entscheidungen 3, 16) — nur Server. Jede ID wird hier
 * gegen die Datenbank aufgelöst (IDOR); jeder Schreibvorgang ist eine Audit-Zeile über den Trigger von `plan`
 * (`ist_vorlage`, `archiviert_am`, Anlegen). Archivieren und Vorlage ändern den „Stand" NICHT — der Stand ist der
 * Inhalt, nicht seine Ablage. „Jetzt" kommt als Argument.
 */
export const PLAN_WEG = "Diesen Plan gibt es nicht mehr.";
/** Was „Neuer Plan" zum Vorbelegen braucht (Entscheidung 8): Art, Anlass und Titel der Vorlage. */
export interface VorlageWahl { id: string; titel: string; typ: PlanTyp; anlass: string | null }

export function vorlagenZurAuswahl(db: KommplanDb, person: Person): VorlageWahl[] {
  return db.select({ id: plan.id, titel: plan.titel, typ: plan.typ, anlass: plan.anlass }).from(plan)
    .where(and(eq(plan.istVorlage, true), isNull(plan.archiviertAm), sichtbarFuer(person))).orderBy(asc(plan.titel), plan.id).all();
}

/**
 * Jede Kopie (Duplizieren, Als Vorlage speichern) ist PRIVAT und gehört dem, der kopiert — auch die Kopie eines
 * geteilten Plans: wer kopiert, will damit erst einmal allein arbeiten. Kopieren darf, wer den Plan sehen darf.
 */
const kopieVon = (wer: Bearbeiter) => ({ eigentuemer: wer.nutzer, sichtbarkeit: "privat" as const });

export function dupliziere(db: KommplanDb, id: string, wer: Bearbeiter, jetzt: number, person: Person): DuplikatErgebnis {
  const q = db.select().from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).get();
  if (!q || !rechteAn(db, id, person).sehen) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const inhalt = lies(q).inhalt;
  if (!inhalt) return { ok: false, fehler: "Dieser Plan lässt sich nicht lesen und deshalb nicht duplizieren.", feldFehler: {} };
  const heute = heuteIso(jetzt);
  const neu = randomUUID();
  const titel = titelFuerKopie(q.titel, heute);
  db.insert(plan).values({
    id: neu, titel: titel.titel, typ: q.typ, anlass: q.anlass, datum: new Date(tagZuMs(heute)),
    istVorlage: false, aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(inhalt), ...kopieVon(wer),
  }).run();
  return { ok: true, id: neu, titel: titel.art };
}

/**
 * „ALS VORLAGE SPEICHERN" LEGT EINE KOPIE AN (Umsetzungsplan Phase 5, Entscheidung 16; ändert Phase-4-Entscheidung 7):
 * ein laufender Plan soll nicht unbemerkt in die Vorlagenliste wandern, und spätere Korrekturen am Einsatz sollen die
 * Vorlage nicht still ändern. Titel bleibt, Datum leer (eine Vorlage hat keinen Einsatztag; „Neu aus Vorlage" setzt
 * heute), Links werden nicht kopiert. Nur aus einem aktiven Plan, der selbst keine Vorlage ist.
 * Gibt es schon eine aktive Vorlage gleichen Titels, legt erst `trotzdem` eine zweite an (Review Phase 5): zwei
 * Vorlagen mit gleichem Titel und Datum „—“ sind in der Vorlagenliste und bei „Neu aus Vorlage“ nicht zu unterscheiden.
 * Verglichen wird nur mit Vorlagen, die `person` sieht — sonst verriete die Rückfrage eine fremde private.
 */
export function speichereAlsVorlage(db: KommplanDb, id: string, wer: Bearbeiter, jetzt: number, person: Person, trotzdem = false): VorlageErgebnis {
  const q = db.select().from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm), eq(plan.istVorlage, false))).get();
  if (!q || !rechteAn(db, id, person).sehen) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const inhalt = lies(q).inhalt;
  if (!inhalt) return { ok: false, fehler: "Dieser Plan lässt sich nicht lesen und deshalb nicht als Vorlage speichern.", feldFehler: {} };
  if (!trotzdem) {
    const da = db.select({ id: plan.id }).from(plan)
      .where(and(eq(plan.istVorlage, true), isNull(plan.archiviertAm), eq(plan.titel, q.titel), sichtbarFuer(person))).orderBy(plan.id).get();
    if (da) return { ok: false, fehler: `Eine Vorlage „${q.titel}“ gibt es schon — sie steht unter „Vorlagen“.`, feldFehler: {}, vorhanden: da.id };
  }
  const neu = randomUUID();
  db.insert(plan).values({
    id: neu, titel: q.titel, typ: q.typ, anlass: q.anlass, datum: null, istVorlage: true,
    aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(inhalt), ...kopieVon(wer),
  }).run();
  return { ok: true, id: neu };
}

/**
 * Archivieren widerruft die gültigen Links des Plans in DERSELBEN Transaktion (Umsetzungsplan Phase 5,
 * Entscheidung 3): Wiederherstellen erweckt keinen wieder. Je Link eine Audit-Zeile über den Trigger von
 * `plan_freigabe`; abgelaufene und schon widerrufene bleiben, wie sie sind.
 */
export function archiviere(db: KommplanDb, id: string, jetzt: number, person: Person): EinfachErgebnis {
  const r = rechteAn(db, id, person);
  if (!r.verwalten) return { ok: false, fehler: r.sehen ? NICHT_ERLAUBT : PLAN_WEG };
  return db.transaction((tx): EinfachErgebnis => {
    const r = tx.update(plan).set({ archiviertAm: new Date(jetzt) }).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).run();
    if (r.changes !== 1) return { ok: false, fehler: PLAN_WEG };
    tx.update(planFreigabe).set({ widerrufenAm: new Date(jetzt) }).where(and(
      eq(planFreigabe.planId, id), isNull(planFreigabe.widerrufenAm),
      or(isNull(planFreigabe.ablauf), gt(planFreigabe.ablauf, new Date(jetzt))),
    )).run();
    return { ok: true };
  });
}

export function stelleWiederHer(db: KommplanDb, id: string, person: Person): EinfachErgebnis {
  const recht = rechteAn(db, id, person);
  if (!recht.verwalten) return { ok: false, fehler: recht.sehen ? NICHT_ERLAUBT : PLAN_WEG };
  const r = db.update(plan).set({ archiviertAm: null }).where(and(eq(plan.id, id), isNotNull(plan.archiviertAm))).run();
  return r.changes === 1 ? { ok: true } : { ok: false, fehler: PLAN_WEG };
}
