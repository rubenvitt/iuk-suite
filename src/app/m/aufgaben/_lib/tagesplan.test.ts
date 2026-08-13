import { describe, expect, it } from "vitest";
import type { AufgabeRow, RoutineRow } from "../_db/schema";
import { TAGESBEGINN_MINUTEN, tagesOrdnung } from "./tagesplan";

const MO = "2026-08-10"; // Montag
const DI = "2026-08-11"; // Dienstag derselben Woche

const aufgabe = (over: Partial<AufgabeRow>): AufgabeRow => ({
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: MO, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
  ...over,
});

const routine = (over: Partial<RoutineRow>): RoutineRow => ({
  id: "r", personId: "alina", titel: "R", wochentage: 0b11111,
  uhrzeit: "08:00", dauerMinuten: 45, aktiv: true, erstelltAm: new Date(0),
  ...over,
});

describe("tagesOrdnung — die Anker-Regel", () => {
  it("ein Tag nur aus freien Aufgaben: alle bei TAGESBEGINN, Reihenfolge nach planRang", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "b", titel: "Zweite", planRang: 2 }),
        aufgabe({ id: "a", titel: "Erste", planRang: 1 }),
      ],
      [],
      "alina",
      MO,
    );
    expect(ordnung.map((e) => e.id)).toEqual(["a", "b"]);
    expect(ordnung.every((e) => e.minuten === TAGESBEGINN_MINUTEN)).toBe(true);
    expect(ordnung.every((e) => e.zeigtUhrzeit === false)).toBe(true);
    expect(ordnung[0]).toMatchObject({ art: "aufgabe" });
    expect(ordnung[0].aufgabe?.id).toBe("a");
  });

  /*
   * Zwei ANKER, deren PLANRANG-REIHENFOLGE die falsche Zeitreihenfolge ist —
   * das Endergebnis ist trotzdem nach `minuten` sortiert (Schritt 3), nicht
   * nach `planRang`: `planRang` steuert nur die VERERBUNG in Schritt 1, nicht
   * die endgueltige Position.
   */
  it("ein Tag nur aus Ankern: jeder zeigt seine eigene Uhrzeit, sortiert nach Zeit", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "a", planRang: 1, planUhrzeit: "10:00" }),
        aufgabe({ id: "b", planRang: 2, planUhrzeit: "09:00" }),
      ],
      [],
      "alina",
      MO,
    );
    expect(
      ordnung.map((e) => ({ id: e.id, minuten: e.minuten, zeigtUhrzeit: e.zeigtUhrzeit })),
    ).toEqual([
      { id: "b", minuten: 540, zeigtUhrzeit: true },
      { id: "a", minuten: 600, zeigtUhrzeit: true },
    ]);
  });

  /** Der gemischte Fall aus Spec §8.1: Anker → freie → Anker → freie. */
  it("mischt Anker und freie Eintraege in der Reihenfolge Anker → freie → Anker → freie", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "a1", planRang: 1, planUhrzeit: "09:00" }),
        aufgabe({ id: "f1", planRang: 2, planUhrzeit: null }),
        aufgabe({ id: "a2", planRang: 3, planUhrzeit: "11:00" }),
        aufgabe({ id: "f2", planRang: 4, planUhrzeit: null }),
      ],
      [],
      "alina",
      MO,
    );
    expect(
      ordnung.map((e) => ({ id: e.id, minuten: e.minuten, zeigtUhrzeit: e.zeigtUhrzeit })),
    ).toEqual([
      { id: "a1", minuten: 540, zeigtUhrzeit: true },
      { id: "f1", minuten: 540, zeigtUhrzeit: false },
      { id: "a2", minuten: 660, zeigtUhrzeit: true },
      { id: "f2", minuten: 660, zeigtUhrzeit: false },
    ]);
  });

  /*
   * DER GLEICHSTANDSFALL AUS SCHRITT 3 — der Kern dieser Aufgabe. Anker und
   * Routine tragen absichtlich DIESELBE Minutenzahl (10:00 = 600): faellt die
   * Feldreihenfolge in Schritt 3 aus "Routinen zuerst, dann Aufgaben" heraus
   * (z. B. vertauscht zu "Aufgaben zuerst"), aendert `sort` an der Reihenfolge
   * gleicher Werte nichts — die Routine liefe dann NACH der Aufgabenkette,
   * statt davor zu stehen. Und waere Schritt 1 NICHT als Vorwaertslauf ueber
   * die planRang-sortierte Liste gebaut (sondern die freie Aufgabe kaeme in
   * der urspruenglichen Feldreihenfolge VOR ihrem Anker in die Liste), rutschte
   * die freie Aufgabe bei diesem Gleichstand sichtbar VOR ihren eigenen Anker.
   * Dieser Test haelt beide Zusagen zugleich fest.
   */
  it("der Gleichstandsfall: eine freie Aufgabe bleibt hinter ihrem eigenen Anker, eine gleichzeitige Routine steht davor", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "anker", planRang: 1, planUhrzeit: "10:00" }),
        aufgabe({ id: "frei", planRang: 2, planUhrzeit: null }),
      ],
      [routine({ id: "routine", uhrzeit: "10:00", wochentage: 0b11111 })],
      "alina",
      MO,
    );
    expect(ordnung.map((e) => e.id)).toEqual(["routine", "anker", "frei"]);
    expect(ordnung.every((e) => e.minuten === 600)).toBe(true);
  });

  /*
   * FIX-RUNDE 1 (Review): DER GLEICHSTANDSTEST OBEN BRICHT NUR, WEIL DORT
   * KEIN ANKER AN DER FALSCHEN STELLE BETEILIGT IST — er sagt nichts darueber,
   * ob Schritt 1 wirklich ALS VORWAERTSLAUF UEBER DIE PLANRANG-SORTIERTE
   * LISTE gebaut ist. Haette jemand das `.sort((a, b) => a.planRang -
   * b.planRang)` in Schritt 1 entfernt, waere die gesamte bisherige Suite
   * gruen geblieben: kein Test uebergab Anker und Nachfolger in einer
   * ROHREIHENFOLGE, die von ihrer `planRang`-Reihenfolge abweicht.
   *
   * HIER SCHON: der Anker ("anker") steht im FELD VOR seinem freien
   * Vorgaenger ("frei"), aber `planRang` sagt das Gegenteil (frei=1,
   * anker=2). Richtig sortiert erbt "frei" NICHTS von "anker" (er kommt
   * planRang-maessig VOR ihm) und bleibt bei TAGESBEGINN_MINUTEN; wird
   * dagegen die Rohreihenfolge des Feldes verwendet, verankert "anker" ZUERST
   * (er steht im Feld vorn) und "frei" erbt dessen 600 statt bei 480 zu
   * bleiben — GENAU der Fehler, den die Korrektur der Ursachenbeschreibung
   * benennt. GEGENGEPRUEFT: mit entferntem `.sort()` in Schritt 1 wird dieser
   * Test tatsaechlich rot (`frei` landet bei 600 statt 480, in der Reihenfolge
   * ["anker", "frei"] statt ["frei", "anker"]).
   */
  it("baut Schritt 1 als Vorwaertslauf ueber die planRang-sortierte Liste, nicht ueber die Feld-Rohreihenfolge", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "anker", planRang: 2, planUhrzeit: "10:00" }),
        aufgabe({ id: "frei", planRang: 1, planUhrzeit: null }),
      ],
      [],
      "alina",
      MO,
    );
    expect(ordnung.map((e) => e.id)).toEqual(["frei", "anker"]);
    expect(ordnung[0]).toMatchObject({ id: "frei", minuten: TAGESBEGINN_MINUTEN, zeigtUhrzeit: false });
    expect(ordnung[1]).toMatchObject({ id: "anker", minuten: 600, zeigtUhrzeit: true });
  });

  /**
   * Dieselbe Zusage ueber eine LAENGERE Kette (zwei Anker, je ein freier
   * Nachfolger dazwischen), UND in verwuerfelter Rohreihenfolge — die
   * Eingabe steht absichtlich NICHT in `planRang`-Reihenfolge im Feld.
   */
  it("baut auch eine laengere Kette korrekt, wenn die Eingabe in verwuerfelter Rohreihenfolge kommt", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "f2", planRang: 4, planUhrzeit: null }),
        aufgabe({ id: "a1", planRang: 1, planUhrzeit: "09:00" }),
        aufgabe({ id: "f1", planRang: 2, planUhrzeit: null }),
        aufgabe({ id: "a2", planRang: 3, planUhrzeit: "11:00" }),
      ],
      [],
      "alina",
      MO,
    );
    expect(
      ordnung.map((e) => ({ id: e.id, minuten: e.minuten, zeigtUhrzeit: e.zeigtUhrzeit })),
    ).toEqual([
      { id: "a1", minuten: 540, zeigtUhrzeit: true },
      { id: "f1", minuten: 540, zeigtUhrzeit: false },
      { id: "a2", minuten: 660, zeigtUhrzeit: true },
      { id: "f2", minuten: 660, zeigtUhrzeit: false },
    ]);
  });

  it("Routinen liegen richtig zwischen den Aufgaben, nach ihrer eigenen Uhrzeit", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "a1", planRang: 1, planUhrzeit: "09:00" }),
        aufgabe({ id: "a2", planRang: 2, planUhrzeit: "10:00" }),
      ],
      [routine({ id: "r1", uhrzeit: "09:30", wochentage: 0b11111 })],
      "alina",
      MO,
    );
    expect(ordnung.map((e) => e.id)).toEqual(["a1", "r1", "a2"]);
    expect(ordnung[1]).toMatchObject({ art: "routine", zeigtUhrzeit: true, minuten: 570 });
    expect(ordnung[1].aufgabe).toBeUndefined();
  });

  it("eine Routine an einem Wochentag, an dem sie nicht gilt, kommt nicht vor", () => {
    // Bit 1 = Dienstag; MO ist Wochentag-Index 0 (Montag).
    const ordnung = tagesOrdnung([], [routine({ wochentage: 0b00010 })], "alina", MO);
    expect(ordnung).toEqual([]);
  });

  it("Aufgaben anderer Personen und anderer Tage kommen nicht vor, ebenso Routinen anderer Personen", () => {
    const ordnung = tagesOrdnung(
      [
        aufgabe({ id: "eigene", planDatum: MO, zugewiesenAn: "alina" }),
        aufgabe({ id: "fremd", planDatum: MO, zugewiesenAn: "bendix" }),
        aufgabe({ id: "andererTag", planDatum: DI, zugewiesenAn: "alina" }),
        aufgabe({ id: "ungeplant", planDatum: null, zugewiesenAn: "alina" }),
      ],
      [routine({ id: "fremdeRoutine", personId: "bendix", wochentage: 0b11111 })],
      "alina",
      MO,
    );
    expect(ordnung.map((e) => e.id)).toEqual(["eigene"]);
  });

  it("ein leerer Tag ergibt ein leeres Feld, kein undefined", () => {
    const ordnung = tagesOrdnung([], [], "alina", MO);
    expect(ordnung).toEqual([]);
    expect(ordnung).not.toBeUndefined();
  });

  /*
   * Routinen haben, anders als Aufgaben, keinen `planRang` — es gibt also
   * nichts, von dem eine Routine ohne Uhrzeit erben koennte. Sie faellt auf
   * `TAGESBEGINN_MINUTEN` zurueck, genau wie ein freier Eintrag vor dem ersten
   * Anker. Vorbild ist `seedLokal.ts`s "Nachtbereitschaft-Übergabe" — eine
   * echte, im Modul geseedete Routine ohne feste Uhrzeit, die sonst hier zum
   * ersten Mal auf `minutenVon(null)` treffen und werfen wuerde.
   */
  it("eine Routine ohne Uhrzeit faellt auf TAGESBEGINN zurueck und zeigt keine Uhrzeit", () => {
    const ordnung = tagesOrdnung(
      [],
      [routine({ id: "r", uhrzeit: null, wochentage: 0b11111, dauerMinuten: 20 })],
      "alina",
      MO,
    );
    expect(ordnung).toEqual([
      { art: "routine", id: "r", titel: "R", minuten: TAGESBEGINN_MINUTEN, zeigtUhrzeit: false, dauerMinuten: 20 },
    ]);
  });

  /*
   * `minutenVon` wirft seit Aufgabe 7 bei einer ungueltigen Uhrzeit (der
   * vertagte Befund aus Aufgabe 3, s. `datum.ts`). `tagesOrdnung` faengt das
   * nicht ab — ein stiller Rueckfall waere hier genau der Fehler, den der
   * Wurf verhindern soll.
   */
  it("wirft, wenn eine Aufgabe eine ungueltige planUhrzeit trägt", () => {
    expect(() =>
      tagesOrdnung([aufgabe({ planRang: 1, planUhrzeit: "" })], [], "alina", MO),
    ).toThrow(/gueltige Uhrzeit/);
  });
});
