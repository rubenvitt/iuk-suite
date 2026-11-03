/**
 * WAS DAS MODUL `feedback` AN „WAS STEHT AN" HERAUSGIBT (IDA-297, `portal/_lib/faelligkeiten/quellen.ts`).
 *
 * Heute nur „Ehrlich gesagt" (IDA-314, Entscheidung 2026-11-01): neue Mitteilungen und Rückfragen melden sich
 * per Push bei den Vertrauenspersonen — OHNE Inhalt. Fristen hat der Kasten keine, `lesen` ist deshalb leer.
 *
 * ⚠️ Nur feste Wörter in der Meldung: kein Thema, kein Name, kein Auszug. Schon das Thema („Miteinander") auf
 * einem fremden Sperrbildschirm sagt mehr, als eine anonyme Mitteilung preisgeben darf.
 */
import type { Faelligkeit, Sofortmeldung } from "@/core/faelligkeiten";
import { getDb } from "../_db/client";
import { tagVon, ungemeldete, vermerkeGemeldet, type EhrlichDb } from "./ehrlich/daten";
import { istEhrlichLeser } from "./ehrlich/zugang";

export const FEEDBACK_FAELLIGKEITS_ARTEN = ["Ehrlich gesagt"] as const;

export function darfFeedbackFaelligkeitenSehen(groups: readonly string[] | null | undefined): boolean {
  return istEhrlichLeser(groups);
}

export function feedbackFaelligkeiten(): Faelligkeit[] {
  return [];
}

export function feedbackSofortmeldungen(seit: Date, db: EhrlichDb = getDb()): Sofortmeldung[] {
  return ungemeldete(db, tagVon(seit.getTime())).map((u) => ({
    id: u.id,
    art: "Ehrlich gesagt",
    titel: u.art === "mitteilung" ? "Ehrlich gesagt: neue Mitteilung" : "Ehrlich gesagt: neue Rückfrage",
    zeilen: [],
    pfad: "/ehrlich-gesagt",
  }));
}

export function vermerkeFeedbackSofortmeldungen(ids: readonly string[], db: EhrlichDb = getDb()): void {
  vermerkeGemeldet(db, ids);
}
