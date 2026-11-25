// Runde + Daten → das, was Beamer und Handy sehen. Reine Funktionen, kein "use client"
// (Falle 6, `CLAUDE.md`). Ein Ereignis im Strom ist immer eine ganze Sicht, keine Deltas.
//
// ⚠️ GETRENNTE SICHTEN SIND DIE ZUSAGE, nicht nur Gestaltung: das Handy bekommt die Lösung
// erst ab der Auflösung und nie einen fremden Spitznamen. Wer hier ein Feld ergänzt, prüft
// `sichten.test.ts` („enthält nie fremde Spitznamen").
import type { QuizAntwortRow, QuizRundeRow, QuizTeilnahmeRow } from "@/app/m/feedback/_db/schema";
import { phaseMitSperre, schrittAnzahl, type Phase } from "./ablauf";
import type { QuizFrage, QuizModus } from "./fragen";

export type RundenDaten = {
  runde: QuizRundeRow;
  teilnahmen: QuizTeilnahmeRow[];
  antworten: QuizAntwortRow[];
};

export type BeamerSicht = {
  titel: string;
  modus: QuizModus;
  phase: Phase;
  schritt: number;
  schrittAnzahl: number;
  beitrittCode: string | null;
  teilnehmende: number;
  frage?: {
    index: number;
    anzahl: number;
    text: string;
    typ: QuizFrage["typ"];
    optionen: string[];
    antworten: number;
    verteilung?: number[];
    richtig?: number[];
    anteilRichtig?: number;
    erklaerung?: string;
  };
  rangliste?: { spitzname: string; punkte: number }[];
  /** Nur im Schluss: Beigetretene und Anteil richtiger Antworten über alle Fragen (0..1). */
  gesamt?: { teilnehmende: number; anteilRichtig: number };
  beendet: boolean;
};

export type HandySicht = {
  titel: string;
  modus: QuizModus;
  phase: Phase;
  frage?: { index: number; text: string; typ: QuizFrage["typ"]; optionen: string[] };
  eigeneAntwort?: number[];
  eigenesErgebnis?: { richtig: boolean; punkte: number };
  richtig?: number[];
  platz?: number;
  punkteGesamt?: number;
  beendet: boolean;
};

const RANGLISTE_LAENGE = 10;

function phaseVon(runde: QuizRundeRow, fragen: QuizFrage[], jetzt: Date): Phase {
  return phaseMitSperre(runde, fragen, runde.modus, jetzt.getTime());
}

/** Index der gezeigten Frage: in `frage` und `aufloesung`, sonst keiner. */
function frageIndex(phase: Phase): number | null {
  return phase.art === "frage" || phase.art === "aufloesung" ? phase.index : null;
}

/**
 * Bis zu welcher Frage Punkte zählen. Erst ab der Auflösung, damit eine Summe nie verrät, ob
 * die eigene Antwort auf die noch offene Frage stimmt; beim Zurückblättern auf eine frühere
 * Rangliste zählen spätere Fragen nicht mit. `null`: keine Wertung zu zeigen.
 */
function gewertetBis(phase: Phase): number | null {
  if (phase.art === "aufloesung") return phase.index;
  if (phase.art === "rangliste") return phase.nachIndex;
  if (phase.art === "schluss") return Number.POSITIVE_INFINITY;
  return null;
}

export function summen(daten: RundenDaten, bis: number): Map<number, number> {
  const summe = new Map<number, number>(daten.teilnahmen.map((t) => [t.id, 0]));
  for (const a of daten.antworten) {
    if (a.frageIndex <= bis && summe.has(a.teilnahmeId)) {
      summe.set(a.teilnahmeId, summe.get(a.teilnahmeId)! + a.punkte);
    }
  }
  return summe;
}

export const auswahl = (a: QuizAntwortRow): number[] => JSON.parse(a.antwort) as number[];

/** Wie oft jede Option gewählt wurde (Mehrfachauswahl zählt jede gewählte Option). */
export function verteilungVon(frage: QuizFrage, antworten: QuizAntwortRow[]): number[] {
  const verteilung = frage.optionen.map(() => 0);
  for (const a of antworten) for (const i of auswahl(a)) if (i in verteilung) verteilung[i]++;
  return verteilung;
}

export function beamerSicht(daten: RundenDaten, titel: string, jetzt: Date): BeamerSicht {
  const { runde } = daten;
  const fragen = JSON.parse(runde.fragen) as QuizFrage[];
  const phase = phaseVon(runde, fragen, jetzt);
  const beendet = runde.beendetAt !== null;
  const sicht: BeamerSicht = {
    titel,
    modus: runde.modus,
    phase,
    schritt: runde.schritt,
    schrittAnzahl: schrittAnzahl(fragen.length, runde.modus),
    beitrittCode: beendet ? null : runde.beitrittCode,
    teilnehmende: daten.teilnahmen.length,
    beendet,
  };

  const index = frageIndex(phase);
  if (index !== null) {
    const f = fragen[index];
    const zuDieser = daten.antworten.filter((a) => a.frageIndex === index);
    sicht.frage = {
      index,
      anzahl: fragen.length,
      text: f.text,
      typ: f.typ,
      optionen: f.optionen,
      antworten: zuDieser.length,
    };
    if (phase.art === "aufloesung") {
      sicht.frage.verteilung = verteilungVon(f, zuDieser);
      sicht.frage.richtig = f.richtig;
      sicht.frage.anteilRichtig = zuDieser.length === 0 ? 0 : zuDieser.filter((a) => a.richtig === 1).length / zuDieser.length;
      if (f.erklaerung !== undefined) sicht.frage.erklaerung = f.erklaerung;
    }
  }

  if (phase.art === "schluss") {
    const alle = daten.antworten;
    sicht.gesamt = {
      teilnehmende: daten.teilnahmen.length,
      anteilRichtig: alle.length === 0 ? 0 : alle.filter((a) => a.richtig === 1).length / alle.length,
    };
  }

  const bis = gewertetBis(phase);
  if (runde.modus === "wettbewerb" && bis !== null && phase.art !== "aufloesung") {
    const summe = summen(daten, bis);
    sicht.rangliste = daten.teilnahmen
      .filter((t): t is QuizTeilnahmeRow & { spitzname: string } => t.spitzname !== null)
      .map((t) => ({ spitzname: t.spitzname, punkte: summe.get(t.id) ?? 0 }))
      .sort((a, b) => b.punkte - a.punkte || a.spitzname.localeCompare(b.spitzname, "de"))
      .slice(0, RANGLISTE_LAENGE);
  }
  return sicht;
}

/**
 * `teilnahmeId` kommt aus dem Cookie der Person (Hash in `quiz_teilnahmen`); eine fremde oder
 * unbekannte Kennung zählt wie keine.
 */
export function handySicht(daten: RundenDaten, titel: string, teilnahmeId: number | null, jetzt: Date): HandySicht {
  const { runde } = daten;
  const fragen = JSON.parse(runde.fragen) as QuizFrage[];
  const phase = phaseVon(runde, fragen, jetzt);
  const eigene = teilnahmeId === null ? undefined : daten.teilnahmen.find((t) => t.id === teilnahmeId);
  const sicht: HandySicht = { titel, modus: runde.modus, phase, beendet: runde.beendetAt !== null };

  const index = frageIndex(phase);
  if (index !== null) {
    const f = fragen[index];
    sicht.frage = { index, text: f.text, typ: f.typ, optionen: f.optionen };
    const antwort = eigene && daten.antworten.find((a) => a.teilnahmeId === eigene.id && a.frageIndex === index);
    if (antwort) sicht.eigeneAntwort = auswahl(antwort);
    if (phase.art === "aufloesung") {
      sicht.richtig = f.richtig;
      if (antwort) sicht.eigenesErgebnis = { richtig: antwort.richtig === 1, punkte: antwort.punkte };
    }
  }

  const bis = gewertetBis(phase);
  if (runde.modus === "wettbewerb" && eigene && bis !== null) {
    const summe = summen(daten, bis);
    const meine = summe.get(eigene.id) ?? 0;
    sicht.punkteGesamt = meine;
    // Gleichstand teilt sich den Platz (1, 1, 3); Namen anderer fließen nicht ein.
    sicht.platz = 1 + [...summe.values()].filter((p) => p > meine).length;
  }
  return sicht;
}

/**
 * Beamer ohne Runde von heute: Titel und „Lobby öffnen". Das Laden schreibt nichts (§5.3), die
 * Runde entsteht erst mit dem ersten Schritt. `fragenJson` ist die Vorlage (`quizze.fragen`).
 */
export function vorStartSicht(titel: string, modus: QuizModus, fragenJson: string): BeamerSicht {
  let anzahl = 0;
  try {
    const f: unknown = JSON.parse(fragenJson);
    if (Array.isArray(f)) anzahl = f.length;
  } catch {
    // Eine kaputte Vorlage startet ohnehin nicht (`starteOderHoleRunde`); hier zählt sie als leer.
  }
  return {
    titel,
    modus,
    phase: { art: "vorStart" },
    schritt: 0,
    schrittAnzahl: schrittAnzahl(anzahl, modus),
    beitrittCode: null,
    teilnehmende: 0,
    beendet: false,
  };
}
