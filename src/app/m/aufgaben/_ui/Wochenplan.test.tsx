// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AufgabeRow, PersonRow, RoutineRow } from "../_db/schema";
import s from "./aufgaben.module.css";

/*
 * SPIONE UM DIE ECHTEN FUNKTIONEN, NICHT UM ATTRAPPEN: `importOriginal` liefert
 * die wirkliche Implementierung, der Spion zaehlt nur mit. Ein Vergleich der
 * beiden Ausprägungen allein (Text A === Text B) beweist NICHT, dass nur
 * EINMAL gerechnet wurde — zwei reine Funktionen liefern bei gleichen
 * Eingaben ohnehin dasselbe Ergebnis. Die Aufrufzahl ist die einzige Aussage,
 * die den Unterschied zwischen "einmal gerechnet, zweimal gerendert" und
 * "zweimal gerechnet, zufaellig gleich" trifft.
 */
const { tagesOrdnungSpy, tagesBudgetSpy } = vi.hoisted(() => ({
  tagesOrdnungSpy: vi.fn(),
  tagesBudgetSpy: vi.fn(),
}));

vi.mock("../_lib/tagesplan", async (importOriginal) => {
  const echte = await importOriginal<typeof import("../_lib/tagesplan")>();
  return {
    ...echte,
    tagesOrdnung: (...args: Parameters<typeof echte.tagesOrdnung>) => {
      tagesOrdnungSpy(...args);
      return echte.tagesOrdnung(...args);
    },
  };
});

vi.mock("../_lib/anzeige", async (importOriginal) => {
  const echte = await importOriginal<typeof import("../_lib/anzeige")>();
  return {
    ...echte,
    tagesBudget: (...args: Parameters<typeof echte.tagesBudget>) => {
      tagesBudgetSpy(...args);
      return echte.tagesBudget(...args);
    },
  };
});

const { Wochenplan } = await import("./Wochenplan");

afterEach(async () => {
  await unmount();
  tagesOrdnungSpy.mockClear();
  tagesBudgetSpy.mockClear();
});

const MONTAG = "2026-08-10";
const DIENSTAG = "2026-08-11";

const ALINA: PersonRow = {
  id: "alina", sub: "dev:alina@localtest.me", name: "Alina", initialen: "AL",
  rolle: "bufdi", sollMinutenTag: 468, aktivVon: "2026-08-01", aktivBis: null,
  erstelltAm: new Date(0),
};

const aufgabe = (over: Partial<AufgabeRow>): AufgabeRow => ({
  id: "x", titel: "T", beschreibung: "B", prioritaet: "mittel",
  erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
  faelligAm: "2026-08-14", faelligUhrzeit: null, dauerMinuten: 60,
  nachweisPflicht: false, nachweisArt: "text", prueferId: "malte",
  istSelbst: false, planDatum: MONTAG, planUhrzeit: null, planRang: 0,
  vorschlagDatum: null, vorschlagUhrzeit: null,
  erstelltAm: new Date(0), aktualisiertAm: new Date(0),
  ...over,
});

const routine = (over: Partial<RoutineRow>): RoutineRow => ({
  id: "r", personId: "alina", titel: "Frühbesprechung", wochentage: 0b11111,
  uhrzeit: "08:00", dauerMinuten: 15, aktiv: true, erstelltAm: new Date(0),
  ...over,
});

describe("Wochenplan", () => {
  it("rendert beide data-rolle-Ausprägungen ins DOM", async () => {
    await mount(
      <Wochenplan aufgaben={[]} routinen={[]} person={ALINA} montag={MONTAG} heute={MONTAG} />,
    );
    expect(query('[data-rolle="wochengitter"]').className.split(" ")).toContain(s.wochenGitter);
    expect(query('[data-rolle="tagesliste"]').className.split(" ")).toContain(s.tagesListe);
  });

  it("zeigt in beiden Ausprägungen dieselben Einträge in derselben Reihenfolge", async () => {
    await mount(
      <Wochenplan
        aufgaben={[
          aufgabe({ id: "a1", planRang: 1, planUhrzeit: "09:00", titel: "Anker" }),
          aufgabe({ id: "f1", planRang: 2, planUhrzeit: null, titel: "Frei" }),
        ]}
        routinen={[routine({})]}
        person={ALINA}
        montag={MONTAG}
        heute={MONTAG}
      />,
    );
    // Beide Ausprägungen rendern ALLE fuenf Tage; wir vergleichen die Zeilen-
    // TEXTE der ersten Spalte (Montag) in beiden Ausprägungen, in Reihenfolge.
    const zeilenGitter = queryAll(
      `[data-rolle="wochengitter"] .${s.tagSpalte}`,
    )[0]!.querySelectorAll("li");
    const zeilenListe = queryAll(
      `[data-rolle="tagesliste"] .${s.tagSpalte}`,
    )[0]!.querySelectorAll("li");
    const textGitter = Array.from(zeilenGitter).map((li) => li.textContent);
    const textListe = Array.from(zeilenListe).map((li) => li.textContent);
    expect(textGitter.length).toBeGreaterThan(0);
    expect(textGitter).toEqual(textListe);
  });

  /*
   * FUENF SPALTEN, ZWEI AUSPRAEGUNGEN — GENAU ZEHN BUDGETZEILEN. Eine blosse
   * "gibt es mindestens eine" waere schon erfuellt, wenn nur eine einzige
   * Spalte ueberhaupt ein Budget zeigt; die Zaehlung deckt beide
   * Ausprägungen UND alle fuenf Tage ab.
   */
  it("zeigt das Budget je Spalte — in jeder der fünf Spalten, in beiden Ausprägungen", async () => {
    await mount(
      <Wochenplan
        aufgaben={[aufgabe({ dauerMinuten: 165 })]}
        routinen={[]}
        person={ALINA}
        montag={MONTAG}
        heute={MONTAG}
      />,
    );
    const budgets = queryAll(`.${s.budget}`);
    expect(budgets).toHaveLength(10);
    expect(budgets[0].textContent).toContain("2,75");
    expect(budgets[0].textContent).toContain("7,8 Std.");
  });

  it("markiert einen überbuchten Tag mit .budgetUeberbucht UND dem Text „überbucht“", async () => {
    await mount(
      <Wochenplan
        aufgaben={[aufgabe({ planDatum: DIENSTAG, dauerMinuten: 500 })]}
        routinen={[]}
        person={ALINA}
        montag={MONTAG}
        heute={MONTAG}
      />,
    );
    const ueberbucht = query(`.${s.budgetUeberbucht}`);
    expect(ueberbucht.className.split(" ")).toContain(s.budget);
    expect(ueberbucht.textContent).toContain("überbucht");
  });

  it("zeigt bei einem Anker die Uhrzeit, bei einem freien Eintrag keine", async () => {
    await mount(
      <Wochenplan
        aufgaben={[
          aufgabe({ id: "a1", planRang: 1, planUhrzeit: "09:00", titel: "Anker" }),
          aufgabe({ id: "f1", planRang: 2, planUhrzeit: null, titel: "Frei" }),
        ]}
        routinen={[]}
        person={ALINA}
        montag={MONTAG}
        heute={MONTAG}
      />,
    );
    // Genau EIN Anker und EIN freier Eintrag, je einmal in jeder der zwei
    // Ausprägungen — die Zaehlung ist die eigentliche Aussage: eine bloße
    // "der freie Eintrag zeigt keine Uhrzeit" waere per Konstruktion nie
    // rot, der eigentliche Fehlerfall (der FREIE Eintrag traegt faelschlich
    // eine `.ankerSpur`) faellt nur auf, wenn man die Anzahl zaehlt.
    const anker = queryAll(`.${s.ankerSpur}`);
    const ohneAnker = queryAll(`.${s.ohneAnker}`);
    expect(anker).toHaveLength(2);
    expect(ohneAnker).toHaveLength(2);
    expect(anker[0]!.textContent).toBe("09:00");
    expect(ohneAnker[0]!.textContent).not.toMatch(/\d\d:\d\d/);
  });

  it("markiert Routinen sichtbar und rendert dafür keine Aktionen (kein Knopf)", async () => {
    await mount(
      <Wochenplan aufgaben={[]} routinen={[routine({})]} person={ALINA} montag={MONTAG} heute={MONTAG} />,
    );
    const routineZeile = query(`.${s.routineZeile}`);
    expect(routineZeile.textContent).toContain("Frühbesprechung");
    expect(query("svg").getAttribute("data-zeichen")).toBe("routine");
    expect(queryAll("button")).toHaveLength(0);
  });

  it("zeigt für einen leeren Tag den eigenen Satz", async () => {
    await mount(
      <Wochenplan aufgaben={[]} routinen={[]} person={ALINA} montag={MONTAG} heute={MONTAG} />,
    );
    expect(queryAll(`.${s.tagSpalte}`)[0].textContent).toContain("Nichts eingeplant.");
  });

  it("markiert den heutigen Tag", async () => {
    await mount(
      <Wochenplan aufgaben={[]} routinen={[]} person={ALINA} montag={MONTAG} heute={DIENSTAG} />,
    );
    const spalten = queryAll(`.${s.tagSpalte}`);
    // Montag ist die erste Spalte, Dienstag die zweite (wochenTage liefert Mo..Fr).
    expect(spalten[0].getAttribute("aria-current")).toBeNull();
    expect(spalten[1].getAttribute("aria-current")).toBe("date");
  });

  /*
   * DIE ZUSAGE „EINMAL GERECHNET, ZWEIMAL GERENDERT": fuenf Tage in der Woche,
   * also GENAU fuenf Aufrufe von `tagesOrdnung` und `tagesBudget` — nicht
   * zehn. Zwei getrennte Berechnungen (eine je Ausprägung) waeren hier zehn
   * Aufrufe und liefen auseinander, sobald sich die Eingaben zwischen den
   * beiden Aufrufen aendern koennten, genau dann, wenn niemand hinsieht.
   */
  it("rechnet tagesOrdnung und tagesBudget genau fünfmal — einmal je Tag, nicht je Ausprägung", async () => {
    await mount(
      <Wochenplan
        aufgaben={[aufgabe({})]}
        routinen={[routine({})]}
        person={ALINA}
        montag={MONTAG}
        heute={MONTAG}
      />,
    );
    expect(tagesOrdnungSpy).toHaveBeenCalledTimes(5);
    expect(tagesBudgetSpy).toHaveBeenCalledTimes(5);
  });
});
