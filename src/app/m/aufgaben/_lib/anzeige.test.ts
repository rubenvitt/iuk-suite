import { describe, expect, it } from "vitest";
import {
  PRIORITAETEN,
  STATUS_WERTE,
  type AufgabeRow,
  type PersonRow,
  type RoutineRow,
} from "../_db/schema";
import {
  PRIORITAET_FORM,
  PRIORITAET_TEXT,
  STATUS_TEXT,
  STATUS_TON,
  WOCHENTAG_BIT,
  fmtDauer,
  fmtStunden,
  istUeberfaellig,
  routineAmTag,
  tagesBudget,
  vorschlagOffen,
} from "./anzeige";

const AUFGABE: AufgabeRow = {
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: null, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
};

const ALINA: PersonRow = {
  id: "alina", sub: "dev:alina@localtest.me", name: "Alina", initialen: "AL",
  rolle: "bufdi", sollMinutenTag: 468, aktivVon: "2026-08-01", aktivBis: null,
  erstelltAm: new Date(0),
};

const routine = (over: Partial<RoutineRow>): RoutineRow => ({
  id: "r", personId: "alina", titel: "R", wochentage: 0b11111,
  uhrzeit: "08:00", dauerMinuten: 45, aktiv: true, erstelltAm: new Date(0),
  ...over,
});

describe("Beschriftungen sind vollstaendig", () => {
  /*
   * ERSCHOEPFEND, NICHT STICHPROBENWEISE: ein fehlender Eintrag ergaebe
   * `undefined` als Beschriftung (im Browser eine leere Stelle) und `undefined`
   * als CSS-Klasse — der Chip bekaeme Polster und Rundung, aber KEINE FARBE.
   */
  it("hat fuer jeden Status Text und Ton", () => {
    for (const s of STATUS_WERTE) {
      expect(STATUS_TEXT[s], `Text ${s}`).toBeTruthy();
      expect(STATUS_TON[s], `Ton ${s}`).toBeTruthy();
    }
  });

  it("hat fuer jede Prioritaet Text und Form", () => {
    for (const p of PRIORITAETEN) {
      expect(PRIORITAET_TEXT[p], `Text ${p}`).toBeTruthy();
      expect(PRIORITAET_FORM[p], `Form ${p}`).toBeTruthy();
    }
  });

  /*
   * `achtung` loest sich in die GETRENNTE Ampel-Rot-Textfarbe auf, nicht in
   * Markenrot — `colorError === colorPrimary === #c8000f`, und ein rotes Chip
   * auf einer Datenflaeche liest sich als Primaeraktion.
   */
  it("gibt genau „zurueckgewiesen“ den Ton achtung", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "achtung")).toEqual(["zurueckgewiesen"]);
  });

  it("gibt genau „abgeschlossen“ den Ton ok", () => {
    expect(STATUS_WERTE.filter((s) => STATUS_TON[s] === "ok")).toEqual(["abgeschlossen"]);
  });

  /*
   * Die Prioritaetsskala traegt ihre Rangfolge in der FORM, absteigend gefuellt →
   * Kontur → nur Text. Waere „hoch" nicht die einzige gefuellte Stufe, verschwaende
   * die Rangfolge in Graustufen.
   */
  it("gibt genau „hoch“ die gefuellte Form", () => {
    expect(PRIORITAETEN.filter((p) => PRIORITAET_FORM[p] === "gefuellt")).toEqual(["hoch"]);
  });
});

describe("vorschlagOffen", () => {
  it("ist wahr, wenn verteilt, ungeplant und ein Vorschlag anhaengt", () => {
    expect(vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13" })).toBe(true);
  });

  it("ist falsch ohne Vorschlag", () => {
    expect(vorschlagOffen(AUFGABE)).toBe(false);
  });

  /*
   * DER FALL, DER DIE ABLEITUNG RECHTFERTIGT: die Vorschlagsfelder BLEIBEN nach
   * dem Einplanen stehen (der Verlauf soll belegen koennen, ob angenommen oder
   * abgewichen wurde). Ohne `planDatum === null` stuende „Vorschlag offen" fuer
   * immer an jeder Aufgabe, die je einen hatte.
   */
  it("ist falsch, sobald die Aufgabe eingeplant ist", () => {
    expect(
      vorschlagOffen({ ...AUFGABE, vorschlagDatum: "2026-08-13", planDatum: "2026-08-14" }),
    ).toBe(false);
  });

  it("ist in jedem anderen Zustand als verteilt falsch", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "verteilt")) {
      expect(vorschlagOffen({ ...AUFGABE, status: s, vorschlagDatum: "2026-08-13" }), s).toBe(false);
    }
  });
});

describe("istUeberfaellig", () => {
  it("zaehlt die Frist, nicht den Zeitplan", () => {
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-12", planDatum: "2026-08-14" }, "2026-08-13"),
    ).toBe(true);
    expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-14" }, "2026-08-13")).toBe(false);
  });

  it("ist am Fristtag selbst noch nicht ueberfaellig", () => {
    expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-13" }, "2026-08-13")).toBe(false);
  });

  it("ist fuer abgeschlossene Aufgaben nie wahr", () => {
    expect(
      istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-01", status: "abgeschlossen" }, "2026-08-13"),
    ).toBe(false);
  });

  it("ist fuer jeden unerledigten Zustand wahr", () => {
    for (const s of STATUS_WERTE.filter((x) => x !== "abgeschlossen")) {
      expect(istUeberfaellig({ ...AUFGABE, faelligAm: "2026-08-01", status: s }, "2026-08-13"), s).toBe(true);
    }
  });
});

describe("routineAmTag", () => {
  it("liest die Bitmaske", () => {
    // Mo, Mi, Fr = Bits 0, 2, 4
    const r = routine({ wochentage: 0b10101 });
    expect(routineAmTag(r, 0)).toBe(true);
    expect(routineAmTag(r, 1)).toBe(false);
    expect(routineAmTag(r, 2)).toBe(true);
    expect(routineAmTag(r, 4)).toBe(true);
  });

  it("gilt nie, wenn die Routine ruht", () => {
    expect(routineAmTag(routine({ wochentage: 0b11111, aktiv: false }), 0)).toBe(false);
  });

  it("bildet die fuenf Wochentage auf Bits ab", () => {
    expect([...WOCHENTAG_BIT]).toEqual([1, 2, 4, 8, 16]);
  });

  /*
   * Ein Index ausserhalb Mo–Fr darf nicht still `true` ergeben. Ohne die
   * Undefined-Pruefung waere `r.wochentage & undefined` = 0 — hier zufaellig
   * richtig, aber `NaN`-Arithmetik ist keine Zusicherung.
   */
  it("gilt an einem Index ausserhalb der Woche nicht", () => {
    expect(routineAmTag(routine({ wochentage: 0b11111 }), 5)).toBe(false);
  });
});

describe("tagesBudget", () => {
  const MO = "2026-08-10";

  it("summiert eingeplante Aufgaben des Tages", () => {
    const b = tagesBudget(
      [
        { ...AUFGABE, id: "a", planDatum: MO, dauerMinuten: 120 },
        { ...AUFGABE, id: "b", planDatum: MO, dauerMinuten: 60 },
      ],
      [], ALINA, MO,
    );
    expect(b.verplantMinuten).toBe(180);
    expect(b.sollMinuten).toBe(468);
    expect(b.ueberbucht).toBe(false);
  });

  it("zaehlt Aufgaben anderer Tage und anderer Personen nicht mit", () => {
    const b = tagesBudget(
      [
        { ...AUFGABE, id: "a", planDatum: MO, dauerMinuten: 120 },
        { ...AUFGABE, id: "b", planDatum: "2026-08-11", dauerMinuten: 999 },
        { ...AUFGABE, id: "c", planDatum: MO, zugewiesenAn: "bendix", dauerMinuten: 999 },
        { ...AUFGABE, id: "d", planDatum: null, dauerMinuten: 999 },
      ],
      [], ALINA, MO,
    );
    expect(b.verplantMinuten).toBe(120);
  });

  /*
   * ROUTINEN BELEGEN BUDGET, ERZEUGEN ABER KEINE AUFGABEN. Genau deshalb muessen
   * sie HIER mitgerechnet werden — sonst zeigte der Tag Luft, die es nicht gibt,
   * und der Zeitvorschlag der Koordination liefe genau dorthin.
   */
  it("rechnet aktive Routinen des Wochentags mit ein", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: MO, dauerMinuten: 60 }],
      [
        routine({ id: "r1", wochentage: 0b00001, dauerMinuten: 45 }),
        routine({ id: "r2", wochentage: 0b00001, dauerMinuten: 300, aktiv: false }),
        routine({ id: "r3", wochentage: 0b00010, dauerMinuten: 300 }),
        routine({ id: "r4", wochentage: 0b00001, dauerMinuten: 300, personId: "bendix" }),
      ],
      ALINA, MO,
    );
    expect(b.verplantMinuten).toBe(105);
  });

  it("meldet Ueberbuchung erst oberhalb des Solls", () => {
    expect(tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 468 }], [], ALINA, MO).ueberbucht).toBe(false);
    expect(tagesBudget([{ ...AUFGABE, planDatum: MO, dauerMinuten: 469 }], [], ALINA, MO).ueberbucht).toBe(true);
  });

  it("nimmt am Wochenende die Aufgaben, aber keine Routinen", () => {
    const b = tagesBudget(
      [{ ...AUFGABE, planDatum: "2026-08-15", dauerMinuten: 60 }],
      [routine({ wochentage: 0b11111, dauerMinuten: 60 })],
      ALINA, "2026-08-15",
    );
    expect(b.verplantMinuten).toBe(60);
  });
});

describe("Formatierung", () => {
  it("schreibt Dauern unter einer Stunde in Minuten", () => {
    expect(fmtDauer(45)).toBe("45 Min.");
  });

  it("schreibt ganze Stunden ohne Komma", () => {
    expect(fmtDauer(60)).toBe("1 Std.");
    expect(fmtDauer(120)).toBe("2 Std.");
  });

  it("schreibt Bruchteile mit deutschem Komma", () => {
    expect(fmtDauer(90)).toBe("1,5 Std.");
    expect(fmtDauer(105)).toBe("1,75 Std.");
  });

  it("schreibt Stundenzahlen ohne Nullen am Ende", () => {
    expect(fmtStunden(468)).toBe("7,8");
    expect(fmtStunden(120)).toBe("2");
    expect(fmtStunden(165)).toBe("2,75");
    expect(fmtStunden(0)).toBe("0");
  });

  /** Runde Zehnerwerte verlieren den gesamten Nachkommaanteil samt Komma, nicht nur Nullen. */
  it("schreibt runde Zehnerwerte ohne Komma", () => {
    expect(fmtStunden(600)).toBe("10");
  });

  /** Eine halbe Stunde behaelt genau eine Nachkommastelle. */
  it("schreibt eine halbe Stunde als 0,5", () => {
    expect(fmtStunden(30)).toBe("0,5");
  });
});
