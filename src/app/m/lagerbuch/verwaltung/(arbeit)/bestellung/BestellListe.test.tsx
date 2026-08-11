// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  clickElement,
  exists,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  BestellListe,
  statusChip,
  type BestellAnzeigeZeile,
} from "./BestellListe";
import type { BestellZeile } from "../../../_lib/lesepfade/bestellung";
import { bestellAnzeigeZeile, dynamic } from "./page";
import { baueBestellCsv, BESTELL_CSV_DATEINAME } from "@/app/m/lagerbuch/_lib/csvBestellung";
import { bestellListeText } from "@/app/m/lagerbuch/_lib/bestellText";

const mocks = vi.hoisted(() => ({
  markiereBestellt: vi.fn(),
}));

vi.mock("../../../_actions/bestellung", () => ({
  markiereBestellt: mocks.markiereBestellt,
}));

const OFFEN = {
  id: "a1",
  name: "Mullbinde",
  einheit: "Stk",
  fach: "A1",
  bestand: 2,
  mindestbestand: 10,
  vorschlag: 8,
  bestellt: false,
  bestelltSeitText: null,
  wareOffenbarDa: false,
} satisfies BestellAnzeigeZeile;

const BESTELLT = {
  id: "a2",
  name: "Pflaster",
  einheit: "Pkg",
  fach: "B2",
  bestand: 0,
  mindestbestand: 5,
  vorschlag: 5,
  bestellt: true,
  bestelltSeitText: "01.08.2026",
  wareOffenbarDa: false,
} satisfies BestellAnzeigeZeile;

const DA = {
  ...BESTELLT,
  id: "a3",
  name: "Kompresse",
  bestand: 5,
  vorschlag: 0,
  wareOffenbarDa: true,
} satisfies BestellAnzeigeZeile;

const ZEILEN = [OFFEN, BESTELLT, DA];
const QUELLE = readFileSync(join(
  process.cwd(),
  "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.tsx",
), "utf8");

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  // rc-table fragt den nicht implementierten jsdom-Pseudoelement-Zweig ab.
  // Fuer diese DOM-Tests genuegt die reale Berechnung des Basiselements.
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  mocks.markiereBestellt.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

afterAll(() => vi.restoreAllMocks());

/**
 * `kopieren()` ist NICHT durch `useTransition` gefuehrt (anders als
 * `markierungAendern`) — sie haengt `.then()`/`.catch()` an ein rohes Promise.
 * Ein `await clickElement(...)` flusht deshalb nicht garantiert bis zur
 * Zustandsaenderung; dass es empirisch klappt, waere ein Zufall der
 * Microtask-Reihenfolge, kein Vertrag (Lehre aus T165s Befund 1). Deshalb
 * hier dasselbe Poll-Idiom wie `ArtikelTable.test.tsx:138-149`.
 */
async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch++) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

describe("statusChip — Auflage 17", () => {
  it("nennt das Datum statt eines blossen Hakens", () => {
    expect(statusChip(BESTELLT)).toEqual({
      ton: "ok",
      text: "bestellt seit 01.08.2026",
    });
  });

  it("nennt die weiterhin stehende, aber inzwischen gedeckte Markierung ehrlich", () => {
    expect(statusChip(DA)).toEqual({
      ton: "gelb",
      text: "Ware offenbar eingetroffen",
    });
  });

  it("nennt eine noch nicht markierte Position offen", () => {
    expect(statusChip(OFFEN)).toEqual({ ton: "rot", text: "offen" });
  });
});

describe("RSC-/Client-Grenze", () => {
  it("formatiert Europe/Berlin und reicht kein Date in die Client-Insel weiter", () => {
    const roh: BestellZeile = {
      id: "a4",
      name: "Pflaster",
      einheit: "Pkg",
      fach: "B2",
      bestand: 0,
      mindestbestand: 5,
      vorschlag: 5,
      bestellt: true,
      // In UTC noch am Vortag, in Berlin bereits am Folgetag.
      bestelltSeit: new Date("2026-08-01T23:30:00Z"),
      wareOffenbarDa: false,
    };
    const anzeige = bestellAnzeigeZeile(roh);
    expect(anzeige.bestelltSeitText).toBe("02.08.2026");
    expect("bestelltSeit" in anzeige).toBe(false);
    expect((Object.values(anzeige) as unknown[]).some((wert) => wert instanceof Date)).toBe(false);
  });

  it("erfindet ohne Markierung kein Datum und haelt die Route dynamisch", () => {
    const roh: BestellZeile = {
      id: "a5",
      name: "Mullbinde",
      einheit: "Stk",
      fach: "A1",
      bestand: 2,
      mindestbestand: 10,
      vorschlag: 8,
      bestellt: false,
      bestelltSeit: null,
      wareOffenbarDa: false,
    };
    expect(bestellAnzeigeZeile(roh).bestelltSeitText).toBeNull();
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("BestellListe", () => {
  it("traegt die sechs verbindlichen Spalten und stabile Tabellenattribute", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(queryAll("thead th").map((th) => th.textContent)).toEqual([
      "",
      "Artikel",
      "Fach",
      "Bestand / Min.",
      "Status",
      "Vorschlag",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Bestellvorschlag");
    expect(
      queryAll("tbody tr")
        .map((tr) => tr.getAttribute("data-row-key"))
        .filter(Boolean),
    ).toEqual(["a1", "a2", "a3"]);
  });

  it("der Kreis-Knopf sagt in beiden Richtungen, was er tut", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(queryAll("tbody button[aria-label]").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Als bestellt markieren",
      "Bestellung zurücknehmen",
      "Bestellung zurücknehmen",
    ]);
  });

  it("uebergibt die neue Markierung vollstaendig und faelscht den Zustand nicht optimistisch", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    const knopf = queryAll<HTMLButtonElement>("tbody button[aria-label]")[0];
    await clickElement(knopf);
    expect(mocks.markiereBestellt).toHaveBeenCalledWith({
      artikelId: "a1",
      bestellt: true,
    });
    expect(knopf.getAttribute("aria-label")).toBe("Als bestellt markieren");
  });

  it("nimmt eine Bestellung mit `bestellt: false` zurueck, ebenfalls ohne Optimismus", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    const knopf = queryAll<HTMLButtonElement>("tbody button[aria-label]")[1];
    await clickElement(knopf);
    expect(mocks.markiereBestellt).toHaveBeenCalledWith({
      artikelId: "a2",
      bestellt: false,
    });
    expect(knopf.getAttribute("aria-label")).toBe("Bestellung zurücknehmen");
  });

  it("beobachtet fachliche Actionfehler als Warnung und laesst die Serverzeile stehen", async () => {
    mocks.markiereBestellt.mockResolvedValueOnce({
      ok: false,
      fehler: "Die Bestellmarkierung konnte nicht gespeichert werden.",
    });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(queryAll<HTMLButtonElement>("tbody button[aria-label]")[0]);
    expect(query(".ant-alert-warning").textContent).toContain(
      "Die Bestellmarkierung konnte nicht gespeichert werden.",
    );
    expect(queryAll("tbody button[aria-label]")[0].getAttribute("aria-label")).toBe(
      "Als bestellt markieren",
    );
  });

  it("zeigt bei einem Runtimefehler eine allgemeine Warnung ohne Interna", async () => {
    mocks.markiereBestellt.mockRejectedValueOnce(new Error("SQLITE intern und geheim"));
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(queryAll<HTMLButtonElement>("tbody button[aria-label]")[0]);
    const text = query(".ant-alert-warning").textContent ?? "";
    expect(text).toContain("Bestellmarkierung konnte nicht gespeichert werden.");
    expect(text).not.toContain("SQLITE intern und geheim");
  });

  it("verriegelt pagination und den horizontalen Scrollvertrag", async () => {
    const elf = Array.from({ length: 11 }, (_, index) => ({
      ...OFFEN,
      id: `viele-${index}`,
      name: `Artikel ${index}`,
    }));
    await mount(<BestellListe zeilen={elf} />);
    expect(exists(".ant-pagination")).toBe(false);
    expect(QUELLE).toContain("pagination={false}");
    expect(QUELLE).toContain('scroll={{ x: "max-content" }}');
  });
});

/**
 * ENTSCHEIDUNG 9-A / 9-D (Task 166). Teil 5 (T145) legte beide Knoepfe mit
 * `disabled` an; hier faellt es. Die beiden Wege liefern absichtlich
 * VERSCHIEDEN VIELE ZEILEN — CSV alle, Zwischenablage nur die offenen —,
 * und das wird an den Beschriftungen sichtbar statt still vereinheitlicht.
 */
describe("Ausgabewege der Bestellliste (§9.1–§9.3)", () => {
  it("stellt beide Knoepfe frei", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(query("[data-testid='lb-kopieren']").hasAttribute("disabled")).toBe(false);
    expect(query("[data-testid='lb-csv']").hasAttribute("disabled")).toBe(false);
  });

  /**
   * ENTSCHEIDUNG 9-A: die beiden Wege liefern verschieden viele Zeilen, und das
   * bleibt so. Geaendert werden nur die Beschriftungen — heute verraten sie
   * nichts, und eine stille Vereinheitlichung waere eine Fachentscheidung im
   * Gewand einer Aufraeumarbeit.
   *
   * `textContent` NICHT per `toBe`: der Knopf traegt ein `<Ikone>` vor dem
   * Text, `textContent` sammelt also mehr ein als nur die Beschriftung.
   */
  it("beschriftet den Zeilenumfang", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(query("[data-testid='lb-kopieren']").textContent).toContain("Liste kopieren (nur offene)");
    expect(query("[data-testid='lb-csv']").textContent).toContain("CSV (alle Zeilen)");
  });

  it("baut die CSV aus allen Zeilen und benennt sie konstant", async () => {
    const blobs: string[] = [];
    vi.stubGlobal("Blob", class {
      constructor(teile: string[]) { blobs.push(teile.join("")); }
    });
    const erzeugt = vi.fn().mockReturnValue("blob:x");
    const frei = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: erzeugt, revokeObjectURL: frei });
    // Ersetzt den echten Klick: jsdom kann `blob:x` nicht navigieren
    // ("Not implemented: navigation") und ist ohnehin nicht der Pruefgegenstand
    // — der Vertrag ist der `download`-Dateiname am Anker, byte-genau die
    // Konstante aus `_lib/csvBestellung.ts`, nicht ein Datum.
    let heruntergeladenAls: string | null = null;
    const klick = vi.spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        heruntergeladenAls = this.download;
      });

    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-csv']"));

    expect(blobs[0]).toBe(baueBestellCsv(ZEILEN.map((z) => ({
      name: z.name, bestand: z.bestand, mindestbestand: z.mindestbestand,
      vorschlag: z.vorschlag, einheit: z.einheit, bestellt: z.bestellt,
    }))));
    // Literalwerte gegen den Zeilenumfang: die CSV nimmt AUCH die bereits
    // bestellten Zeilen (BESTELLT, DA) mit — Kopfzeile + 3 Zeilen, alle drei
    // Namen vertreten. Ein Vergleich nur gegen `baueBestellCsv(ZEILEN...)`
    // (oben) waere zirkulaer, wenn dieselbe fehlerhafte Filterung an beiden
    // Stellen einträte.
    expect(blobs[0].split("\n")).toHaveLength(4);
    expect(blobs[0]).toContain("Mullbinde");
    expect(blobs[0]).toContain("Pflaster");
    expect(blobs[0]).toContain("Kompresse");
    expect(heruntergeladenAls).toBe(BESTELL_CSV_DATEINAME);
    // Die Objekt-URL wird wieder freigegeben — sonst haelt jeder Download den
    // Blob bis zum Seitenwechsel im Speicher.
    expect(frei).toHaveBeenCalledWith("blob:x");
    klick.mockRestore();
    vi.unstubAllGlobals();
  });

  /**
   * ENTSCHEIDUNG 9-A: der Gegentest zu oben. `bestellListeText(ZEILEN)` filtert
   * SELBST auf `!bestellt` — ein Vergleich nur dagegen waere zirkulaer, gruen
   * auch dann, wenn die Komponente versehentlich ALLE Zeilen uebergaebe. Der
   * Literalwert "8 × Mullbinde" pinnt den Unterschied: von den drei Zeilen ist
   * OFFEN (Vorschlag 8) die einzige mit `bestellt: false`.
   */
  it("kopiert nur die offenen Zeilen", async () => {
    const schreiben = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: schreiben } });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(schreiben).toHaveBeenCalledWith("8 × Mullbinde");
    expect(schreiben).toHaveBeenCalledWith(bestellListeText(ZEILEN));
    vi.unstubAllGlobals();
  });

  /**
   * 1:1 aus BestellListe.tsx — beide Meldungen bleiben wortgleich.
   *
   * `kopieren()` haengt an KEIN `useTransition` (anders als
   * `markierungAendern`) — ein manuell aufloesbares Promise plus `warteAuf`
   * beweist den Uebergang echt, statt sich auf die Microtask-Reihenfolge
   * innerhalb von `clickElement`s `act()` zu verlassen (Lehre aus T165s
   * Befund 1: ein Quelltext-Scan oder ein zufaellig gruener Timing-Zufall
   * ist keine Verhaltenszusicherung).
   */
  it("meldet den Erfolg wortgleich, nach Abschluss des Schreibvorgangs", async () => {
    let geschrieben: (() => void) | undefined;
    const schreiben = vi.fn(() => new Promise<void>((resolve) => { geschrieben = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText: schreiben } });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(document.body.textContent).not.toContain("Bestellliste kopiert");
    await act(async () => { geschrieben?.(); });
    await warteAuf(
      () => document.body.textContent?.includes("Bestellliste kopiert") === true,
      "Erfolgsmeldung nach aufgeloestem writeText",
    );
    vi.unstubAllGlobals();
  });

  /**
   * ENTSCHEIDUNG 9-D — DER RUECKFALLWEG. `navigator.clipboard` verlangt einen
   * secure context; unter `lagerbuch.localtest.me` gibt es den nicht, weil
   * Browser die HOSTZEICHENKETTE bewerten (localhost, *.localhost, 127.0.0.1)
   * und nicht die aufgeloeste Adresse. Ohne diese Pruefung meldet die Oberflaeche
   * „Kopieren fehlgeschlagen" — das liest sich wie ein Fehler des Moduls und ist
   * eine Eigenschaft der Umgebung.
   */
  it("zeigt ohne secure context den Text zum Markieren statt einer Fehlermeldung", async () => {
    vi.stubGlobal("navigator", {});   // kein clipboard
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    expect(document.body.textContent).not.toContain("Kopieren fehlgeschlagen");
    expect(document.body.textContent).toContain(
      "Diese Umgebung erlaubt keinen Zugriff auf die Zwischenablage. Text markieren und kopieren.",
    );
    // DER VERTRAG IST DER TEXTINHALT, NICHT DER TRANSPORTWEG: zeichengleich
    // derselbe String wie im Erfolgsfall.
    expect(queryPortal<HTMLTextAreaElement>("textarea").value).toBe(bestellListeText(ZEILEN));
    vi.unstubAllGlobals();
  });

  /**
   * Der echte Fehlerfall bleibt und behaelt seinen Wortlaut. Manuell
   * ablehnbares Promise aus demselben Grund wie beim Erfolgsfall oben: der
   * `.catch()`-Zweig haengt nicht an einem `useTransition`.
   */
  it("meldet einen echten Fehlschlag wortgleich", async () => {
    let ablehnen: ((grund: Error) => void) | undefined;
    const schreiben = vi.fn(() => new Promise<void>((_resolve, reject) => { ablehnen = reject; }));
    vi.stubGlobal("navigator", { clipboard: { writeText: schreiben } });
    await mount(<BestellListe zeilen={ZEILEN} />);
    await clickElement(query("[data-testid='lb-kopieren']"));
    await act(async () => { ablehnen?.(new Error("nope")); });
    await warteAuf(
      () => document.body.textContent?.includes("Kopieren fehlgeschlagen") === true,
      "Fehlermeldung nach abgelehntem writeText",
    );
    expect(document.body.textContent).not.toContain("nope");
    vi.unstubAllGlobals();
  });
});
