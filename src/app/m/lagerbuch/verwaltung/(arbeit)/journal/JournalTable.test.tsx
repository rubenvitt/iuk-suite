// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import {
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import { JournalTable, type JournalZeileDTO } from "./JournalTable";

const mocks = vi.hoisted(() => ({ naechsteJournalSeite: vi.fn() }));
vi.mock("../../../_actions/journal", () => ({
  naechsteJournalSeite: mocks.naechsteJournalSeite,
}));

/**
 * ⚠️ DIE TESTDATEN SIND JETZT ROHZEILEN, keine Anzeigezeilen. Die Aufbereitung
 * liegt seit DRK-331 in der Insel selbst — genau damit nachgeladene Zeilen
 * dieselbe Abbildung durchlaufen wie die ersten hundert. Ein Test, der fertige
 * Anzeigezeilen hineinreicht, pruefte diese Abbildung nicht mehr mit.
 */
const ZEILEN: JournalZeileDTO[] = [
  {
    id: "journal-negativ",
    ts: "2026-08-07T12:00:00.000Z",
    artikelName: "Verbandpäckchen",
    typ: "entnahme",
    menge: -1,
    quelleId: "system",
    quelleName: "System",
    kommentar: "Verbraucht",
    referenz: null,
  },
  {
    id: "journal-positiv",
    ts: "2026-08-07T13:00:00.000Z",
    artikelName: "Kompressen",
    typ: "zugang",
    menge: 2,
    quelleId: "111-111",
    quelleName: "Helfer",
    kommentar: null,
    referenz: null,
  },
];

const KEIN_FILTER = {};

/**
 * ⚠️ JSDOM KENNT KEINEN `IntersectionObserver`, und ein blosser Stummel meldete
 * auch nichts: jsdom rechnet keine Layoutboxen, nichts kommt je „in Sicht".
 * Ohne Ersatz waere jeder Nachlade-Test hier gruen, ohne etwas zu messen.
 *
 * Dieser Stummel meldet beim `observe()` sofort einen Treffer — er prueft damit
 * die VERDRAHTUNG (Wache in Sicht → Nachschlag → anhaengen), nicht die
 * Sichtbarkeitsrechnung des Browsers. Dass die Wache im echten Browser
 * tatsaechlich in Sicht kommt, kann nur Playwright sagen.
 */
function beobachterStellen(): { ausloesen: () => void } {
  let melden: (() => void) | null = null;
  class Stummel {
    constructor(private rueckruf: IntersectionObserverCallback) {
      melden = () => this.rueckruf(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    observe() { /* der Treffer wird von Hand ausgeloest */ }
    disconnect() { melden = null; }
    unobserve() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", Stummel);
  return { ausloesen: () => melden?.() };
}

/** Ein Makrotask-Tick, damit React die Wirkung eines Klicks ausspielt. */
async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

function ersteDirektive(quelle: string): string | null {
  const source = ts.createSourceFile(
    "JournalTable.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const [ersteAnweisung] = source.statements;
  return ersteAnweisung
    && ts.isExpressionStatement(ersteAnweisung)
    && ts.isStringLiteral(ersteAnweisung.expression)
    ? ersteAnweisung.expression.text
    : null;
}

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

describe("JournalTable", () => {
  it("traegt use client kommentarrobust als echte erste Direktive", () => {
    expect(ersteDirektive('/* Lizenz */\n"use client";\nconst wert = 1;'))
      .toBe("use client");
    expect(ersteDirektive('const wert = 1;\n"use client";')).toBeNull();

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/JournalTable.tsx",
      "utf8",
    );
    expect(ersteDirektive(quelle)).toBe("use client");
  });

  it("rendert eine gefuellte DTO-Zeile erst innerhalb der Client-Insel", async () => {
    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );

    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Zeit",
      "Artikel",
      "Vorgang",
      "Δ",
      "Quelle",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Buchungsjournal");
    // ⚠️ NEUESTE ZUERST. Die Zeitspalte traegt `defaultSortOrder: "descend"`;
    // die 13:00-Zeile steht deshalb ueber der 12:00-Zeile, obwohl sie im Feld
    // dahinter steht. Genau das soll ein Journal tun.
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.getAttribute("data-row-key"))).toEqual([
      "journal-positiv",
      "journal-negativ",
    ]);

    const negativ = query("tr[data-row-key='journal-negativ']");
    // Die Zeit entsteht in der Insel aus dem Rohzeitstempel — nicht aus einem
    // vorgefertigten Text.
    expect(negativ.textContent).toContain("07.08.");
    expect(negativ.textContent).toContain("Verbandpäckchen");
    expect(negativ.textContent).toContain("Entnahme · Verbraucht");
    expect(negativ.textContent).toContain("-1");
    expect(negativ.textContent).toContain("System");
    expect(negativ.querySelector(`.${s.jts}`)).not.toBeNull();
    expect(negativ.querySelector(`.${s.jdelta}.${s.jminus}`)).not.toBeNull();
    expect(
      (negativ.querySelectorAll("td")[1].querySelector("span") as HTMLElement).style.fontWeight,
    ).toBe("600");
    expect(negativ.querySelector(`.${s.chip}.${s.grau}`)).not.toBeNull();
    // Ruling A15: der rohe Code/die rohe Kennung steht im `title` des
    // Quelle-Chips, 1:1 aus der Alt-Anwendung
    // (`lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`).
    expect(negativ.querySelector(`.${s.chip}`)?.getAttribute("title")).toBe("system");

    const positiv = query("tr[data-row-key='journal-positiv']");
    expect(positiv.querySelector(`.${s.jdelta}.${s.jplus}`)).not.toBeNull();
    expect(exists(".ant-pagination")).toBe(false);
    expect(query(".ant-table-content").getAttribute("style")).toContain("overflow-x: auto");
  });

  it("zeigt den vom Server gewaehlten Leertext", async () => {
    await mount(
      <JournalTable
        ersteZeilen={[]}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    expect(document.body.textContent).toContain("Noch keine Buchung.");

    await unmount();
    await mount(
      <JournalTable
        ersteZeilen={[]}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Keine Buchung passt zu Suche, Vorgang und Zeitraum."
      />,
    );
    expect(document.body.textContent).toContain(
      "Keine Buchung passt zu Suche, Vorgang und Zeitraum.",
    );
  });

  /**
   * DAS NACHLADEN (DRK-331).
   */
  it("haengt eine nachgeladene Seite an, statt die Liste zu ersetzen", async () => {
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({
      ok: true,
      cursor: null,
      zeilen: [{
        id: "journal-nachgeladen",
        ts: "2026-08-07T11:00:00.000Z",
        artikelName: "Dreiecktuch",
        typ: "zugang",
        menge: 5,
        quelleId: "system",
        quelleName: "System",
        kommentar: null,
        referenz: null,
      }],
    });

    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(2);

    await act(async () => { ausloesen(); });
    await warte();

    // ANGEHAENGT, nicht ersetzt — und die nachgeladene Zeile hat dieselbe
    // Aufbereitung durchlaufen wie die ersten beiden.
    const ids = queryAll("tbody tr[data-row-key]")
      .map((zeile) => zeile.getAttribute("data-row-key"));
    expect(ids).toHaveLength(3);
    expect(ids).toContain("journal-nachgeladen");
    expect(query("tr[data-row-key='journal-nachgeladen']").textContent).toContain("Dreiecktuch");
    // Die aelteste Zeile steht unten — die Sortierung gilt fuer die ganze Liste,
    // nicht nur fuer die erste Seite.
    expect(ids.at(-1)).toBe("journal-nachgeladen");
  });

  it("reicht Filter UND Schluesselposition an den Nachschlag weiter", async () => {
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({ ok: true, cursor: null, zeilen: [] });

    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={{ typ: "entnahme", q: "binde" }}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();

    // Ohne den Filter lieferte Seite zwei andere Zeilen als Seite eins — der
    // Nachschlag sieht sonst die ganze Historie.
    expect(mocks.naechsteJournalSeite).toHaveBeenCalledWith({
      typ: "entnahme",
      q: "binde",
      cursor: { ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" },
    });
  });

  it("zaehlt eine doppelt gelieferte Zeile nicht zweimal", async () => {
    // Ein doppelter `rowKey` waere in React ein stiller Renderfehler.
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({
      ok: true,
      cursor: null,
      zeilen: [ZEILEN[0]],
    });

    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();

    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(2);
  });

  it("bietet nach einem Fehler einen Knopf und laedt NICHT von selbst weiter", async () => {
    // Sonst liefe bei abgerissenem Netz eine stille Endlosschleife gegen den
    // Server.
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({
      ok: false,
      fehler: "Weitere Buchungen konnten nicht geladen werden.",
    });

    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();

    expect(document.body.textContent).toContain("Weitere Buchungen konnten nicht geladen werden.");
    const knopf = queryAll<HTMLElement>("button")
      .find((k) => (k.textContent ?? "").includes("Erneut versuchen"));
    expect(knopf).toBeDefined();

    const aufrufeVorher = mocks.naechsteJournalSeite.mock.calls.length;
    await act(async () => { ausloesen(); });
    await warte();
    expect(mocks.naechsteJournalSeite.mock.calls.length).toBe(aufrufeVorher);
  });

  it("sagt am Ende der Liste, dass nichts mehr kommt", async () => {
    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    expect(document.body.textContent).toContain("Keine weiteren Buchungen.");
  });

  it("sagt das NICHT, solange es weitergeht", async () => {
    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    expect(document.body.textContent).not.toContain("Keine weiteren Buchungen.");
  });
});
