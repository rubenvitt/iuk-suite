// Fragenmodell des Live-Quiz und seine Prüfung. Reine Funktionen, kein "use client"
// (Server Components lesen diese Werte, Falle 6, `CLAUDE.md`).

export type QuizModus = "lagebild" | "wettbewerb";

export type QuizFrage = {
  text: string;
  typ: "einfach" | "mehrfach" | "wahrfalsch";
  optionen: string[];
  /** Indizes in `optionen`. */
  richtig: number[];
  /** Antwortzeit in Sekunden; fehlt sie, bleibt die Frage bis zur Auflösung offen. */
  zeit_s?: number;
  erklaerung?: string;
};

export const MAX_FRAGEN = 50;
const WAHR_FALSCH = ["Wahr", "Falsch"];

export type FragenPruefung =
  | { ok: true; fragen: QuizFrage[] }
  | { ok: false; fehler: string[] };

function istZeichenkette(x: unknown, min: number, max: number): x is string {
  return typeof x === "string" && x.length >= min && x.length <= max;
}

/** Prüft eine Frage; Fehler tragen die Fragenummer (ab 1). */
function pruefeFrage(roh: unknown, nr: number, fehler: string[]): QuizFrage | null {
  const vor = `Frage ${nr}: `;
  if (typeof roh !== "object" || roh === null) {
    fehler.push(vor + "keine gültige Frage");
    return null;
  }
  const r = roh as Record<string, unknown>;
  const start = fehler.length;

  if (!istZeichenkette(r.text, 1, 300)) fehler.push(vor + "Text muss 1 bis 300 Zeichen haben");
  const typ = r.typ;
  if (typ !== "einfach" && typ !== "mehrfach" && typ !== "wahrfalsch") {
    fehler.push(vor + "Typ muss einfach, mehrfach oder wahrfalsch sein");
  }

  let optionen: string[] = [];
  if (!Array.isArray(r.optionen) || r.optionen.length < 2 || r.optionen.length > 6) {
    fehler.push(vor + "2 bis 6 Optionen nötig");
  } else if (!r.optionen.every((o) => istZeichenkette(o, 1, 120))) {
    fehler.push(vor + "Jede Option muss 1 bis 120 Zeichen haben");
  } else {
    optionen = r.optionen as string[];
    if (typ === "wahrfalsch" && (optionen.length !== 2 || optionen[0] !== WAHR_FALSCH[0] || optionen[1] !== WAHR_FALSCH[1])) {
      fehler.push(vor + "Wahr/Falsch hat genau die Optionen Wahr und Falsch");
    }
  }

  let richtig: number[] = [];
  if (!Array.isArray(r.richtig) || r.richtig.length === 0) {
    fehler.push(vor + "Mindestens eine richtige Antwort nötig");
  } else if (
    !r.richtig.every((i) => Number.isInteger(i) && i >= 0 && i < optionen.length) ||
    new Set(r.richtig).size !== r.richtig.length
  ) {
    fehler.push(vor + "Richtige Antworten müssen gültige, verschiedene Optionen sein");
  } else {
    richtig = r.richtig as number[];
    if ((typ === "einfach" || typ === "wahrfalsch") && richtig.length !== 1) {
      fehler.push(vor + "Genau eine richtige Antwort nötig");
    }
  }

  if (r.zeit_s !== undefined && !(typeof r.zeit_s === "number" && Number.isInteger(r.zeit_s) && r.zeit_s >= 5 && r.zeit_s <= 300)) {
    fehler.push(vor + "Zeit muss 5 bis 300 Sekunden sein");
  }
  if (r.erklaerung !== undefined && typeof r.erklaerung !== "string") {
    fehler.push(vor + "Erklärung muss Text sein");
  }

  if (fehler.length > start) return null;
  const frage: QuizFrage = { text: r.text as string, typ: typ as QuizFrage["typ"], optionen, richtig };
  if (r.zeit_s !== undefined) frage.zeit_s = r.zeit_s as number;
  if (typeof r.erklaerung === "string") frage.erklaerung = r.erklaerung;
  return frage;
}

export function pruefeFragen(roh: unknown): FragenPruefung {
  if (!Array.isArray(roh) || roh.length < 1 || roh.length > MAX_FRAGEN) {
    return { ok: false, fehler: [`Ein Quiz hat 1 bis ${MAX_FRAGEN} Fragen`] };
  }
  const fehler: string[] = [];
  const fragen: QuizFrage[] = [];
  roh.forEach((f, i) => {
    const g = pruefeFrage(f, i + 1, fehler);
    if (g) fragen.push(g);
  });
  return fehler.length > 0 ? { ok: false, fehler } : { ok: true, fragen };
}
