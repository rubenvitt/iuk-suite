import { describe, expect, it } from "vitest";
import type { QuizAntwortRow, QuizRundeRow, QuizTeilnahmeRow } from "@/app/m/feedback/_db/schema";
import type { QuizFrage } from "./fragen";
import { beamerSicht, handySicht, vorStartSicht, type RundenDaten } from "./sichten";

const T0 = 1_000_000;

const fragen: QuizFrage[] = [
  { text: "Erste?", typ: "einfach", optionen: ["A", "B", "C"], richtig: [1], zeit_s: 20, erklaerung: "Weil B." },
  { text: "Zweite?", typ: "mehrfach", optionen: ["A", "B", "C"], richtig: [0, 2] },
];

function runde(modus: "lagebild" | "wettbewerb", schritt: number, extra: Partial<QuizRundeRow> = {}): QuizRundeRow {
  return {
    id: 1, quizId: 1, eveningId: 1, beitrittCode: "ABC234", modus, fragen: JSON.stringify(fragen),
    schritt, schrittSeit: T0, hoechsterSchritt: schritt, hoechsterSeit: T0, beendetAt: null, createdAt: new Date(T0), ...extra,
  };
}

const NAMEN = ["Anna", "Bert", "Cora", "Dora", "Emil", "Fritz", "Gabi", "Hans", "Ida", "Jan", "Karl", "Lena"];
const teilnahmen: QuizTeilnahmeRow[] = NAMEN.map((n, i) => ({ id: i + 1, rundeId: 1, spitzname: n, tokenHash: `h${i}` }));

const antwort = (teilnahmeId: number, frageIndex: number, gewaehlt: number[], richtig: boolean, punkte: number): QuizAntwortRow => ({
  teilnahmeId, frageIndex, antwort: JSON.stringify(gewaehlt), richtig: richtig ? 1 : 0, punkte, antwortzeitMs: 1000,
});

const antworten: QuizAntwortRow[] = [
  antwort(1, 0, [1], true, 900),
  antwort(2, 0, [0], false, 0),
  antwort(3, 0, [1], true, 800),
  antwort(4, 0, [1], true, 900),
  // Fragen 1
  antwort(1, 1, [0, 2], true, 1000),
];

const daten = (modus: "lagebild" | "wettbewerb", schritt: number, extra: Partial<QuizRundeRow> = {}): RundenDaten => ({
  runde: runde(modus, schritt, extra),
  teilnahmen: modus === "lagebild" ? teilnahmen.map((t) => ({ ...t, spitzname: null })) : teilnahmen,
  antworten,
});

describe("beamerSicht", () => {
  it("verrät in der Phase frage keine Lösung", () => {
    const s = beamerSicht(daten("wettbewerb", 1), "Funk", new Date(T0 + 1000));
    expect(s.phase).toMatchObject({ art: "frage", index: 0, offen: true });
    expect(s.frage).toMatchObject({ index: 0, anzahl: 2, text: "Erste?", optionen: ["A", "B", "C"], antworten: 4 });
    expect(s.frage?.richtig).toBeUndefined();
    expect(s.frage?.verteilung).toBeUndefined();
    expect(s.frage?.anteilRichtig).toBeUndefined();
    expect(s.frage?.erklaerung).toBeUndefined();
    expect(s.rangliste).toBeUndefined();
    expect(s).toMatchObject({ titel: "Funk", modus: "wettbewerb", schritt: 1, schrittAnzahl: 7, beitrittCode: "ABC234", teilnehmende: 12, beendet: false });
  });

  it("zeigt in der Auflösung Verteilung, Lösung, Anteil und Erklärung", () => {
    const s = beamerSicht(daten("wettbewerb", 2), "Funk", new Date(T0));
    expect(s.frage).toMatchObject({ verteilung: [1, 3, 0], richtig: [1], anteilRichtig: 0.75, erklaerung: "Weil B." });
  });

  it("Rangliste: Top 10, nach Punkten, bei Gleichstand nach Spitzname", () => {
    const s = beamerSicht(daten("wettbewerb", 3), "Funk", new Date(T0)); // Rangliste nach Frage 0
    expect(s.rangliste).toHaveLength(10);
    expect(s.rangliste!.slice(0, 4)).toEqual([
      { spitzname: "Anna", punkte: 900 },
      { spitzname: "Dora", punkte: 900 },
      { spitzname: "Cora", punkte: 800 },
      { spitzname: "Bert", punkte: 0 },
    ]);
    // Am Schluss zählen alle Fragen.
    expect(beamerSicht(daten("wettbewerb", 6), "Funk", new Date(T0)).rangliste![0]).toEqual({ spitzname: "Anna", punkte: 1900 });
  });

  it("hat im Lagebild keine Rangliste und nach dem Beenden keinen Code", () => {
    const s = beamerSicht(daten("lagebild", 5, { beendetAt: T0 }), "Funk", new Date(T0));
    expect(s.phase.art).toBe("schluss");
    expect(s.rangliste).toBeUndefined();
    expect(s.beendet).toBe(true);
    expect(s.beitrittCode).toBeNull();
    // 4 von 5 Antworten der Runde sind richtig.
    expect(s.gesamt).toEqual({ teilnehmende: 12, anteilRichtig: 0.8 });
    expect(beamerSicht(daten("lagebild", 2), "Funk", new Date(T0)).gesamt).toBeUndefined();
  });

  it("zeigt eine schon passierte Frage als geschlossen", () => {
    const s = beamerSicht(daten("lagebild", 1, { hoechsterSchritt: 3 }), "Funk", new Date(T0 + 1000));
    expect(s.phase).toMatchObject({ art: "frage", index: 0, offen: false });
    expect(s.frage?.richtig).toBeUndefined();
  });
});

describe("handySicht", () => {
  it("verrät in der Phase frage keine Lösung, zeigt aber die eigene Antwort", () => {
    const s = handySicht(daten("wettbewerb", 1), "Funk", 1, new Date(T0 + 1000));
    expect(s.frage).toEqual({ index: 0, text: "Erste?", typ: "einfach", optionen: ["A", "B", "C"] });
    expect(s.eigeneAntwort).toEqual([1]);
    expect(s.richtig).toBeUndefined();
    expect(s.eigenesErgebnis).toBeUndefined();
    expect(s.punkteGesamt).toBeUndefined();
    expect(s.platz).toBeUndefined();
  });

  it("zeigt in der Auflösung Lösung, eigenes Ergebnis, Platz und Punkte", () => {
    const s = handySicht(daten("wettbewerb", 2), "Funk", 3, new Date(T0));
    expect(s.richtig).toEqual([1]);
    expect(s.eigenesErgebnis).toEqual({ richtig: true, punkte: 800 });
    expect(s.punkteGesamt).toBe(800);
    expect(s.platz).toBe(3);
  });

  it("enthält nie fremde Spitznamen", () => {
    for (let schritt = 0; schritt < 7; schritt++) {
      const s = handySicht(daten("wettbewerb", schritt), "Funk", 2, new Date(T0));
      const text = JSON.stringify(s);
      for (const n of NAMEN.filter((n) => n !== "Bert")) expect(text).not.toContain(n);
    }
  });

  it("Lagebild: kein Platz, keine Punkte; ohne Teilnahme kein eigenes Ergebnis", () => {
    const s = handySicht(daten("lagebild", 2), "Funk", 1, new Date(T0));
    expect(s.richtig).toEqual([1]);
    expect(s.eigenesErgebnis).toEqual({ richtig: true, punkte: 900 });
    expect(s.platz).toBeUndefined();
    expect(s.punkteGesamt).toBeUndefined();
    const ohne = handySicht(daten("wettbewerb", 2), "Funk", null, new Date(T0));
    expect(ohne.eigenesErgebnis).toBeUndefined();
    expect(ohne.eigeneAntwort).toBeUndefined();
    expect(ohne.platz).toBeUndefined();
  });
});

describe("vorStartSicht", () => {
  it("zeigt nur Titel und Schrittzahl, keinen Code und keine Frage", () => {
    const s = vorStartSicht("Funk", "wettbewerb", JSON.stringify(fragen));
    expect(s).toEqual({
      titel: "Funk",
      modus: "wettbewerb",
      phase: { art: "vorStart" },
      schritt: 0,
      schrittAnzahl: 7,
      beitrittCode: null,
      teilnehmende: 0,
      beendet: false,
    });
  });

  it("verträgt eine kaputte Vorlage (0 Fragen)", () => {
    expect(vorStartSicht("X", "lagebild", "kein json").schrittAnzahl).toBe(2);
  });
});
