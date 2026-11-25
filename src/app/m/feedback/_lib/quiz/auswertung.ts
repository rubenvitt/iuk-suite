// Runde + Daten → Auswertung für den Abend. Reine Funktion, kein "use client" (Falle 6,
// `CLAUDE.md`). Anders als `beamerSicht` zeigt sie immer alles: die Runde ist ausgewertet oder
// läuft noch, und die Leserin ist Moderation, nicht Publikum.
import type { QuizModus, QuizFrage } from "./fragen";
import { summen, verteilungVon, type RundenDaten } from "./sichten";

export type FragenAuswertung = {
  index: number;
  text: string;
  typ: QuizFrage["typ"];
  optionen: string[];
  antworten: number;
  verteilung: number[];
  richtig: number[];
  /** 0..1; `null` ohne Antwort (kein erfundener Wert). */
  anteilRichtig: number | null;
  erklaerung?: string;
};

export type Auswertung = {
  titel: string;
  modus: QuizModus;
  beendet: boolean;
  teilnehmende: number;
  anteilRichtig: number | null;
  fragen: FragenAuswertung[];
  /** Nur im Wettbewerb. */
  rangliste?: { platz: number; spitzname: string; punkte: number }[];
};

const anteil = (richtig: number, gesamt: number) => (gesamt === 0 ? null : richtig / gesamt);

export function auswertung(daten: RundenDaten, titel: string): Auswertung {
  const { runde } = daten;
  const fragen = JSON.parse(runde.fragen) as QuizFrage[];
  const result: Auswertung = {
    titel,
    modus: runde.modus,
    beendet: runde.beendetAt !== null,
    teilnehmende: daten.teilnahmen.length,
    anteilRichtig: anteil(daten.antworten.filter((a) => a.richtig === 1).length, daten.antworten.length),
    fragen: fragen.map((f, index) => {
      const zu = daten.antworten.filter((a) => a.frageIndex === index);
      return {
        index,
        text: f.text,
        typ: f.typ,
        optionen: f.optionen,
        antworten: zu.length,
        verteilung: verteilungVon(f, zu),
        richtig: f.richtig,
        anteilRichtig: anteil(zu.filter((a) => a.richtig === 1).length, zu.length),
        ...(f.erklaerung !== undefined ? { erklaerung: f.erklaerung } : {}),
      };
    }),
  };
  if (runde.modus === "wettbewerb") {
    const summe = summen(daten, Number.POSITIVE_INFINITY);
    const sortiert = daten.teilnahmen
      .filter((t): t is typeof t & { spitzname: string } => t.spitzname !== null)
      .map((t) => ({ spitzname: t.spitzname, punkte: summe.get(t.id) ?? 0 }))
      .sort((a, b) => b.punkte - a.punkte || a.spitzname.localeCompare(b.spitzname, "de"));
    // Gleichstand teilt sich den Platz (1, 1, 3) — wie auf dem Handy (`handySicht`).
    result.rangliste = sortiert.map((r) => ({
      platz: 1 + sortiert.filter((x) => x.punkte > r.punkte).length,
      ...r,
    }));
  }
  return result;
}
