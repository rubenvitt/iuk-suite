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
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import { JournalTable } from "./JournalTable";
import type { JournalZeileDTO } from "../../../_lib/journalDTO";

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
  // ⚠️ NEUESTE ZUERST — so und nicht anders liefert der Lesepfad
  // (`ts DESC, id DESC`, dieselbe Ordnung, in der der Cursor blaettert). Die
  // Tabelle sortiert NICHT mehr selbst; eine Testliste in anderer Reihenfolge
  // behauptete also etwas, das der Server nie schickt.
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
    ortName: "Schrank 1",
    ortStandort: { name: "Schrank 1", typ: "lager" as const, kennung: null, einheitenart: null },
  },
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
    ortName: "Handlager",
    ortStandort: { name: "Handlager", typ: "lager" as const, kennung: null, einheitenart: null },
  },
];

const KEIN_FILTER = {};

/** Die Kennungen der gerenderten Zeilen, in ihrer Reihenfolge. */
function zeilenIds(): Array<string | null> {
  return queryAll("tbody tr[data-row-key]")
    .map((zeile) => zeile.getAttribute("data-row-key"));
}

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
      // DRK-338 — zwischen Vorgang und Δ: eine Umlagerung besteht aus zwei
      // Zeilen mit demselben Vorgangstext, und erst Ort plus Δ sagen, welche
      // die Quelle ist.
      "Ort",
      "Δ",
      "Quelle",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Buchungsjournal");
    /**
     * ⚠️ DIE REIHENFOLGE IST DIE DES SERVERS, UNVERAENDERT. Die Tabelle traegt
     * keinen Vergleicher mehr: das Journal ist serverseitig geblaettert, und
     * ein clientseitiger Sortierer ordnete nur das geladene Praefix — „Zeit
     * aufsteigend" zeigte dann die aelteste unter den neuesten Hundert, nicht
     * die aelteste Buchung.
     */
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.getAttribute("data-row-key"))).toEqual([
      "journal-positiv",
      "journal-negativ",
    ]);
    // Und kein Spaltenkopf bietet Sortierung oder Filter an.
    expect(queryAll(".ant-table-column-sorter")).toHaveLength(0);
    expect(queryAll(".ant-table-filter-trigger")).toHaveLength(0);

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
    // Angehaengt heisst: hinten. Die Reihenfolge bleibt die des Servers.
    expect(ids.at(-1)).toBe("journal-nachgeladen");
  });

  /**
   * ⚠️ DIE TREFFERZAHL WAECHST MIT, UND DER NACHSATZ VERSCHWINDET.
   *
   * Bis DRK-331 (vierte Reviewrunde) stand sie im SEITENKOPF und entstand dort
   * serverseitig aus der ersten Seite. Sie blieb danach stehen: „2 Treffer
   * geladen — weitere beim Scrollen" auch dann noch, wenn drei Zeilen auf dem
   * Schirm standen und der Cursor leer war. Beide Haelften des Satzes waren
   * falsch, die Zahl und die Ankuendigung.
   *
   * Der Test prueft deshalb den Uebergang, nicht den Endzustand: vor dem
   * Nachladen zwei Treffer MIT Ankuendigung, danach drei OHNE — dieselbe
   * Bedingung, nach der auch die Wache unten aufhoert.
   */
  it("fuehrt die Trefferzahl mit der nachgeladenen Seite nach", async () => {
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
    expect(query("[data-testid='journal-treffer']").textContent)
      .toBe("2 Treffer geladen — weitere beim Scrollen");

    await act(async () => { ausloesen(); });
    await warte();

    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(3);
    expect(query("[data-testid='journal-treffer']").textContent).toBe("3 Treffer");
  });

  it("reicht Filter UND Schluesselposition an den Nachschlag weiter", async () => {
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({ ok: true, cursor: null, zeilen: [] });

    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={{ vorgang: "entnahme", q: "binde" }}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();

    // Ohne den Filter lieferte Seite zwei andere Zeilen als Seite eins — der
    // Nachschlag sieht sonst die ganze Historie.
    expect(mocks.naechsteJournalSeite).toHaveBeenCalledWith({
      vorgang: "entnahme",
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

  /**
   * ⚠️ DIESE DREI FAELLE STEHEN HIER, WEIL EIN REVIEW SIE GEFUNDEN HAT UND KEIN
   * LAUF. Alle drei Fehler waren in einem gruenen Baum vorhanden.
   */

  it("verwirft eine Antwort, die unter einem ANDEREN Filter losgeschickt wurde", async () => {
    /**
     * Das Rennen: jemand wechselt den Filter, waehrend ein Nachschlag unterwegs
     * ist. Der Abgleich in der Renderphase laeuft zuerst — und die eintreffende
     * Antwort haengte danach die Zeilen des ALTEN Filters an den neuen Stand.
     * Die Liste zeigte Buchungen, die der gewaehlte Filter ausschliesst.
     */
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();

    let antworten!: (wert: unknown) => void;
    mocks.naechsteJournalSeite.mockReturnValue(new Promise((fertig) => { antworten = fertig; }));

    await mount(
      <JournalTable
        ersteZeilen={ZEILEN}
        ersterCursor={{ ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" }}
        abrufFilter={{ vorgang: "zugang" }}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });

    // Filterwechsel, WAEHREND der Abruf laeuft: neue erste Seite vom Server.
    await rerender(
      <JournalTable
        ersteZeilen={[ZEILEN[1]!]}
        ersterCursor={null}
        abrufFilter={{ vorgang: "entnahme" }}
        leertext="Noch keine Buchung."
      />,
    );
    // ZEILEN[1] ist die Entnahme — passend zum neuen Filter `vorgang: "entnahme"`.
    expect(zeilenIds()).toEqual(["journal-negativ"]);

    // Jetzt erst antwortet der alte Abruf.
    await act(async () => {
      antworten({
        ok: true,
        cursor: { ts: "2026-08-07T10:00:00.000Z", id: "alt" },
        zeilen: [{
          id: "journal-aus-altem-filter",
          ts: "2026-08-07T09:00:00.000Z",
          artikelName: "Darf nicht erscheinen",
          typ: "zugang",
          menge: 1,
          quelleId: "system",
          quelleName: "System",
          kommentar: null,
          referenz: null,
        }],
      });
    });
    await warte();

    // Die alte Zeile ist NICHT angehaengt, und der alte Cursor hat den neuen
    // Stand nicht uebernommen ("Keine weiteren Buchungen." steht weiter da).
    expect(zeilenIds()).toEqual(["journal-negativ"]);
    expect(document.body.textContent).not.toContain("Darf nicht erscheinen");
    expect(document.body.textContent).toContain("Keine weiteren Buchungen.");
  });

  it("setzt zurueck, wenn sich NUR der Filter aendert — bei gleicher erster Seite", async () => {
    /**
     * Der Schluessel bestand urspruenglich nur aus erster Zeile und
     * Schluesselposition. Laesst ein Filterwechsel die NEUESTE Seite
     * unveraendert — die neuesten Buchungen sind ohnehin alle Zugaenge, jemand
     * filtert auf „Zugang" —, blieb der Schluessel gleich, und die zuvor
     * nachgeladenen AELTEREN Zeilen standen weiter da, obwohl sie den neuen
     * Filter verletzen.
     */
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({
      ok: true,
      cursor: null,
      zeilen: [{
        id: "journal-alt-entnahme",
        ts: "2026-08-07T09:00:00.000Z",
        artikelName: "Alte Entnahme",
        typ: "entnahme",
        menge: -1,
        quelleId: "system",
        quelleName: "System",
        kommentar: null,
        referenz: null,
      }],
    });

    const ersteSeite = ZEILEN;
    const cursor = { ts: "2026-08-07T12:00:00.000Z", id: "journal-negativ" };

    await mount(
      <JournalTable
        ersteZeilen={ersteSeite}
        ersterCursor={cursor}
        abrufFilter={{}}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();
    expect(zeilenIds()).toContain("journal-alt-entnahme");

    // IDENTISCHE erste Seite, IDENTISCHE Schluesselposition — nur der Filter
    // ist neu. Ohne den Filter im Schluessel bliebe die alte Entnahme stehen.
    await rerender(
      <JournalTable
        ersteZeilen={ersteSeite}
        ersterCursor={cursor}
        abrufFilter={{ vorgang: "zugang" }}
        leertext="Noch keine Buchung."
      />,
    );
    expect(zeilenIds()).not.toContain("journal-alt-entnahme");
  });

});

/**
 * DIE RSC-GRENZE DES JOURNALS (Falle 6).
 *
 * ⚠️ DIESER TEST HAT EIN SUBJEKT, DAS ES FAST NICHT GAEBE. `journalZeileDTO`
 * stand kurzzeitig in dieser Client-Insel und wurde von `journal/page.tsx`
 * (Server Component) UND `_actions/journal.ts` gerufen — ein WERT aus einem
 * `"use client"`-Modul, HTTP 500 fuer die ganze Seite. `typecheck`, `lint`,
 * `build` und 10 000 Vitests blieben dabei gruen; in Vitest ist `"use client"`
 * eine wirkungslose Zeichenkette, die Funktion laeuft im selben Prozess und tut
 * genau das Richtige.
 *
 * Ein VERHALTENSTEST kann das strukturell nicht sehen. Dieser Scan kann es.
 */
describe("Journal — die Serverleser holen den Umwandler aus einem Modul OHNE Direktive", () => {
  const DTO_DATEI = "src/app/m/lagerbuch/_lib/journalDTO.ts";

  it("journalDTO.ts traegt KEINE use-client-Direktive", () => {
    const quelle = readFileSync(DTO_DATEI, "utf8");
    expect(ersteDirektive(quelle)).not.toBe("use client");
  });

  it.each([
    ["src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx", "Server Component"],
    ["src/app/m/lagerbuch/_actions/journal.ts", "Server Action"],
  ])("%s (%s) importiert ihn aus _lib, nicht aus der Client-Insel", (datei) => {
    const quelle = readFileSync(datei, "utf8");
    expect(quelle).toMatch(/journalZeileDTO[\s\S]*?from "[^"]*_lib\/journalDTO"/);
    // Und ausdruecklich NICHT aus `JournalTable`: ein `import type` von dort
    // waere unbedenklich, ein Wert nicht — der Scan trennt das nicht, also
    // verbietet er die Herkunft ganz.
    expect(quelle).not.toMatch(/journalZeileDTO[^;]*from "[^"]*JournalTable"/);
  });
});

/**
 * DIE AUSSONDERUNG IST OHNE DEN KOMMENTAR ERKENNBAR (DRK-344).
 *
 * ⚠️ DIESER TEST GEHOERT HIERHER UND NICHT NUR ZU `journalZeile`. Die reine
 * Funktion ist dort geprueft; hier steht die VERDRAHTUNG — dass `anzeigeZeile`
 * die `referenz` ueberhaupt weiterreicht. Genau die war der Fund: das Feld lag
 * in der Zeile, wurde aber nicht gelesen.
 */
describe("JournalTable — die Vorgangsspalte liest die Referenz", () => {
  const MIT_REFERENZ: JournalZeileDTO[] = [
    {
      id: "journal-aussonderung",
      ts: "2026-08-07T14:00:00.000Z",
      artikelName: "Kompressen",
      typ: "korrektur",
      menge: -6,
      quelleId: "111-111",
      quelleName: "Helfer",
      kommentar: "Verfallskontrolle",
      referenz: "aussondern:handlager",
      ortName: "Handlager",
      ortStandort: { name: "Handlager", typ: "lager" as const, kennung: null, einheitenart: null },
    },
    {
      id: "journal-inventur",
      ts: "2026-08-07T13:30:00.000Z",
      artikelName: "NaCl",
      typ: "korrektur",
      menge: 2,
      quelleId: "111-111",
      quelleName: "Helfer",
      kommentar: "Jahresinventur",
      referenz: "inventur:iv-1",
      ortName: "Handlager",
      ortStandort: { name: "Handlager", typ: "lager" as const, kennung: null, einheitenart: null },
    },
    {
      id: "journal-handkorrektur",
      ts: "2026-08-07T13:00:00.000Z",
      artikelName: "Pflaster",
      typ: "korrektur",
      menge: -1,
      quelleId: "111-111",
      quelleName: "Helfer",
      kommentar: "verzählt",
      referenz: null,
      ortName: "Handlager",
      ortStandort: { name: "Handlager", typ: "lager" as const, kennung: null, einheitenart: null },
    },
  ];

  it("nennt Aussonderung, Inventur und Korrektur beim Namen", async () => {
    await mount(
      <JournalTable
        ersteZeilen={MIT_REFERENZ}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );

    // Alle drei tragen `typ: "korrektur"` — unterschieden werden sie allein
    // durch die Referenz. Ohne sie stuende dreimal dasselbe da.
    expect(query("tr[data-row-key='journal-aussonderung']").textContent)
      .toContain("Aussonderung · Verfallskontrolle");
    expect(query("tr[data-row-key='journal-inventur']").textContent)
      .toContain("Inventur · Jahresinventur");
    expect(query("tr[data-row-key='journal-handkorrektur']").textContent)
      .toContain("Korrektur · verzählt");
  });

  it("die Aussonderung steht auch OHNE Kommentar in der Spalte", async () => {
    /**
     * ⚠️ DAS IST DAS AKZEPTANZKRITERIUM, WOERTLICH: „im Journal ist eine
     * Aussonderung OHNE LESEN DES KOMMENTARS als solche erkennbar". Vorher war
     * der eingetippte Grund das einzige Kennzeichen — und der ist Freitext, in
     * einem Fall also auch leer oder nichtssagend.
     */
    await mount(
      <JournalTable
        ersteZeilen={[{ ...MIT_REFERENZ[0]!, kommentar: null }]}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    const zelle = query("tr[data-row-key='journal-aussonderung']").querySelectorAll("td")[2];
    expect(zelle?.textContent).toBe("Aussonderung");
  });

  it("eine nachgeladene Zeile laeuft durch DIESELBE Abbildung", async () => {
    /**
     * ⚠️ DIE ZWEITE HAELFTE DER VERDRAHTUNG. Die erste Seite kommt aus einer
     * Server Component, jede weitere aus einer Server Action. Liesse der
     * Nachladepfad die `referenz` fallen, unterschieden sich Zeile 101 und
     * Zeile 1 in genau der Kleinigkeit, die niemand sucht — und zwar erst nach
     * dem ersten Scrollen.
     */
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({
      ok: true,
      cursor: null,
      zeilen: [MIT_REFERENZ[0]],
    });

    await mount(
      <JournalTable
        ersteZeilen={[MIT_REFERENZ[2]!]}
        ersterCursor={{ ts: "2026-08-07T13:00:00.000Z", id: "journal-handkorrektur" }}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();

    expect(query("tr[data-row-key='journal-aussonderung']").textContent)
      .toContain("Aussonderung");
  });
});


/**
 * DRK-338 — DIE ORTSSPALTE, und warum sie eine SPALTE ist.
 *
 * Eine Umlagerung schreibt ZWEI Zeilen: denselben Vorgangstext, dieselbe
 * Referenz, entgegengesetztes Vorzeichen. Welche die QUELLE ist und welche das
 * ZIEL, sagt allein der Ort. Ohne die Spalte stand im Journal zweimal
 * „Umlagerung", einmal −5 und einmal +5 — und wohin das Material gewandert
 * ist, war aus der Oberflaeche ueberhaupt nicht zu erfahren.
 *
 * ⚠️ GEPRUEFT WIRD DAS PAAR, NICHT EINE ZEILE. Eine einzelne Zeile mit einem
 * Ortsnamen waere auch dann gruen, wenn beide Legs denselben Ort trugen — und
 * genau das ist der Fehler, der eine Umlagerung wertlos macht.
 */
describe("JournalTable — die Ortsspalte macht Quelle und Ziel lesbar (DRK-338)", () => {
  const UMLAGERUNG: JournalZeileDTO[] = [
    {
      id: "journal-um-ziel",
      ts: "2026-09-15T09:00:01.000Z",
      artikelName: "Ringer-Lactat",
      typ: "umlagerung",
      menge: 5,
      quelleId: "u-admin",
      quelleName: "A. Verwaltung",
      kommentar: null,
      referenz: "umlagerung:schrank-gf",
      ortName: "GF-Schrank",
      ortStandort: { name: "GF-Schrank", typ: "lager" as const, kennung: null, einheitenart: null },
    },
    {
      id: "journal-um-quelle",
      ts: "2026-09-15T09:00:00.000Z",
      artikelName: "Ringer-Lactat",
      typ: "umlagerung",
      menge: -5,
      quelleId: "u-admin",
      quelleName: "A. Verwaltung",
      kommentar: null,
      referenz: "umlagerung:schrank-gf",
      ortName: "Schrank 1",
      ortStandort: { name: "Schrank 1", typ: "lager" as const, kennung: null, einheitenart: null },
    },
  ];

  it("nennt an beiden Legs den Ort, der fuer dieses Leg gilt", async () => {
    await mount(
      <JournalTable
        ersteZeilen={UMLAGERUNG}
        ersterCursor={null}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );

    const quelle = query("tr[data-row-key='journal-um-quelle']");
    const ziel = query("tr[data-row-key='journal-um-ziel']");

    // Spalte 4 ist „Ort" — Zeit, Artikel, Vorgang, Ort, Δ, Quelle.
    expect(quelle.querySelectorAll("td")[3]?.textContent).toBe("Schrank 1");
    expect(ziel.querySelectorAll("td")[3]?.textContent).toBe("GF-Schrank");

    // ⚠️ Der Vorgangstext ist an BEIDEN Zeilen derselbe — deshalb braucht es
    // die Spalte ueberhaupt.
    expect(quelle.querySelectorAll("td")[2]?.textContent).toBe("Umlagerung");
    expect(ziel.querySelectorAll("td")[2]?.textContent).toBe("Umlagerung");
    expect(quelle.textContent).toContain("-5");
    expect(ziel.textContent).toContain("+5");
  });

  it("reicht den Ort auch auf dem Nachladepfad durch", async () => {
    const { ausloesen } = beobachterStellen();
    mocks.naechsteJournalSeite.mockReset();
    mocks.naechsteJournalSeite.mockResolvedValue({
      ok: true, cursor: null, zeilen: [UMLAGERUNG[1]],
    });

    await mount(
      <JournalTable
        ersteZeilen={[UMLAGERUNG[0]!]}
        ersterCursor={{ ts: "2026-09-15T09:00:01.000Z", id: "journal-um-ziel" }}
        abrufFilter={KEIN_FILTER}
        leertext="Noch keine Buchung."
      />,
    );
    await act(async () => { ausloesen(); });
    await warte();

    expect(query("tr[data-row-key='journal-um-quelle']").querySelectorAll("td")[3]?.textContent)
      .toBe("Schrank 1");
  });
});
