/**
 * WAS DAS MODUL `feedback` AN „WAS STEHT AN" HERAUSGIBT (IDA-297, `portal/_lib/faelligkeiten/quellen.ts`).
 *
 * Heute nur „Ehrlich gesagt" (IDA-314, Entscheidung 2026-11-01): neue Mitteilungen und Rückfragen melden sich
 * per Push bei den Vertrauenspersonen — OHNE Inhalt. Fristen hat der Kasten keine, `lesen` ist deshalb leer.
 *
 * ⚠️ Nur feste Wörter in der Meldung: kein Thema, kein Name, kein Auszug. Schon das Thema („Miteinander") auf
 * einem fremden Sperrbildschirm sagt mehr, als eine anonyme Mitteilung preisgeben darf.
 *
 * ⚠️ Und nicht sofort: ein Push eine Minute nach dem Einwurf verrät die Uhrzeit, die der Kasten nicht
 * speichert — wer jemanden am Aushang sah, könnte zuordnen. Gemeldet wird deshalb gebündelt am Folgetag ab
 * `MELDESTUNDE` (Suite-Zone), passend zur Zusage „nur der Tag".
 */
import type { Faelligkeit, Sofortmeldung } from "@/core/faelligkeiten";
import { getDb } from "../_db/client";
import { zeitFormat } from "@/core/zeit";
import { tagVon, ungemeldete, vermerkeGemeldet, type EhrlichDb } from "./ehrlich/daten";
import { istEhrlichLeser } from "./ehrlich/zugang";

export const FEEDBACK_FAELLIGKEITS_ARTEN = ["Ehrlich gesagt"] as const;

export function darfFeedbackFaelligkeitenSehen(groups: readonly string[] | null | undefined): boolean {
  return istEhrlichLeser(groups);
}

export function feedbackFaelligkeiten(): Faelligkeit[] {
  return [];
}

export const MELDESTUNDE = 8;

function stundeVon(ms: number): number {
  const teil = zeitFormat("de-DE", { hour: "2-digit", hourCycle: "h23" }).formatToParts(ms).find((t) => t.type === "hour");
  return Number(teil?.value ?? 0);
}

export function feedbackSofortmeldungen(seit: Date, db: EhrlichDb = getDb(), jetzt: number = Date.now()): Sofortmeldung[] {
  if (stundeVon(jetzt) < MELDESTUNDE) return [];
  const heute = tagVon(jetzt);
  // Einen Tag weiter zurück als das Portal-Fenster: der früheste Versand ist der Folgetag des Einwurfs,
  // und ein dort ausgefallener Push soll noch einen Tag nachgeholt werden.
  return ungemeldete(db, tagVon(seit.getTime() - 24 * 60 * 60_000)).filter((u) => u.tag < heute).map((u) => ({
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
