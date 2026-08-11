// @vitest-environment jsdom

import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  exists,
  fill,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import { artikel, buchungen, chargen, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import { EXCEL_FEHLERTEXT } from "../../../_lib/bestandExportSpalten";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ArtikelTable } from "./ArtikelTable";

const mocks = vi.hoisted(() => ({
  createArtikel: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/artikel", () => ({
  createArtikel: (...args: unknown[]) => mocks.createArtikel(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../../../_ui/ArtikelDrawer", () => ({
  ArtikelDrawer: ({ id }: { id: string }) => (
    <div data-rolle="artikel-drawer" data-artikel-id={id} />
  ),
}));

const ZEILEN = [
  {
    id: "alpha",
    name: "Alpha-Päckchen",
    einheit: "Stk",
    fach: "B2",
    mindestbestand: 20,
    bestand: 10,
    aktiv: true,
    unterMindest: true,
    chargeKritisch: true,
    naechsteCharge: { chargenNr: "LOT-ALPHA", verfall: "2027-03" },
    naechsteAmpel: "gelb" as const,
    naechsteAblaufText: "fällig 03/27",
  },
  {
    id: "zulu",
    name: "Zulu",
    einheit: "Stk",
    fach: "B2",
    mindestbestand: 5,
    bestand: 10,
    aktiv: true,
    unterMindest: false,
    chargeKritisch: false,
    naechsteCharge: { chargenNr: "LOT-ZULU", verfall: "2027-03" },
    naechsteAmpel: "gruen" as const,
    naechsteAblaufText: "bis 03/27",
  },
  {
    id: "beta",
    name: "Beta",
    einheit: "Rol",
    fach: "A1",
    mindestbestand: 0,
    bestand: 5,
    aktiv: true,
    unterMindest: false,
    chargeKritisch: false,
    naechsteCharge: null,
    naechsteAmpel: null,
    naechsteAblaufText: null,
  },
  {
    id: "gamma",
    name: "Gamma",
    einheit: "Stk",
    fach: "C3",
    mindestbestand: 10,
    bestand: 20,
    aktiv: true,
    unterMindest: false,
    chargeKritisch: true,
    naechsteCharge: { chargenNr: "LOT-GAMMA", verfall: "2026-12" },
    naechsteAmpel: "rot" as const,
    naechsteAblaufText: "läuft 12/26 ab",
  },
  {
    id: "delta",
    name: "Delta",
    einheit: "Stk",
    fach: "C3",
    mindestbestand: 30,
    bestand: 20,
    aktiv: false,
    unterMindest: true,
    chargeKritisch: false,
    naechsteCharge: null,
    naechsteAmpel: null,
    naechsteAblaufText: null,
  },
];

const FAHRZEUGE = [
  { id: "rtw-1", name: "RTW 1", kennung: "UE-RK 129" },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function istJsonSicher(wert: unknown): boolean {
  if (wert instanceof Date || isValidElement(wert)) return false;
  if (["function", "symbol", "bigint"].includes(typeof wert)) return false;
  if (Array.isArray(wert)) return wert.every(istJsonSicher);
  if (wert && typeof wert === "object") return Object.values(wert).every(istJsonSicher);
  return true;
}

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

/**
 * Ein Versprechen, das sich genau dann aufloest, wenn `melden()` das erste Mal
 * laeuft — fuer Spione, deren Aufruf selbst der fruehestmoegliche Meldepunkt
 * ist.
 *
 * Fuer den Excel-Export (unten) ist das kein Stil, sondern eine Reparatur: der
 * `toFile`-Aufruf haengt hinter `await import("write-excel-file/browser")`
 * (ArtikelTable.tsx), einem ECHTEN dynamischen Import, den `vi.resetModules()`
 * am Blockanfang jedes Mal neu aufloesen laesst. `warteAuf` pollt dafuer mit
 * einem FESTEN Budget von 30 Versuchen zu je einem `setTimeout(0)`-Tick — unter
 * CPU-Last (voller Lauf: 337 Dateien im Thread-Pool) kann die Modulaufloesung
 * laenger dauern als 30 Ticks, und der Test reisst mit "Nicht rechtzeitig
 * sichtbar: toFile-Aufruf", obwohl der Code korrekt ist (gemessen: zwei
 * Fehlschlaege mit exakt dieser Meldung, an :643 und :676, in einem vollen
 * `vitest run` dieser Sitzung — 337 Dateien, sonst 336 gruen). Ein
 * groesseres Budget verschoebe nur die Grenze. Stattdessen wartet dieser Test
 * auf das Versprechen, das der Spion selbst liefert — nicht auf 30 Ticks,
 * sondern auf Vitests Test-Timeout (Default 5000 ms, ~1000x mehr Kopfraum als
 * die alten 30 Ticks). Bleibt `toFile` aus (z. B. weil ein Mock nicht griff),
 * wird aus der praezisen Meldung "Nicht rechtzeitig sichtbar: toFile-Aufruf"
 * ein generischer 5s-Timeout — ein akzeptabler Tausch fuer den Wegfall des
 * Flackerns, aber kein "wartet fuer immer".
 */
function meldendesVersprechen(): { versprechen: Promise<void>; melden: () => void } {
  let melden!: () => void;
  const versprechen = new Promise<void>((resolve) => {
    melden = resolve;
  });
  return { versprechen, melden };
}

function zeilenIds(): Array<string | null> {
  return queryAll("tbody tr[data-row-key]")
    .map((zeile) => zeile.getAttribute("data-row-key"));
}

function exportIds(): string[] {
  return (query<HTMLButtonElement>("button[data-export-zeilen]")
    .getAttribute("data-export-zeilen") ?? "")
    .split(",")
    .filter(Boolean);
}

function checkboxMitText(text: string): HTMLElement {
  const checkbox = queryAll<HTMLElement>(".ant-checkbox-wrapper")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!checkbox) throw new Error(`Checkbox nicht gefunden: ${text}`);
  return checkbox;
}

function knopfMitText(text: string): HTMLElement {
  const knopf = queryAll<HTMLElement>("button")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function sortierungWaehlen(label: string): Promise<void> {
  const input = query<HTMLInputElement>("[aria-label='Sortierung']");
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const optionen = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-select-item-option",
  ));
  const option = optionen.find((element) => (element.textContent ?? "") === label);
  if (!option) throw new Error(`Sortierung nicht gefunden: ${label}`);
  await clickElement(option);
  await warte();
}

async function neuArtikelOeffnen(): Promise<void> {
  await clickElement(knopfMitText("Neuer Artikel"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Dialog für einen neuen Artikel",
  );
}

async function neuesArtikelFormularFuellen(): Promise<void> {
  await fillPortal("[aria-label='Name']", "Wundauflage");
  await fillPortal("[aria-label='Fach']", "D4");
  await fillPortal("[aria-label='Einheit']", "Stk");
  await fillPortal("[aria-label='Mindestbestand']", "12");
}

async function fillPortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${selector}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitNeuArtikel(): Promise<void> {
  const form = queryPortal<HTMLFormElement>("[data-rolle='neuer-artikel']");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
  mocks.createArtikel.mockResolvedValue({ ok: true, wert: { id: "artikel-neu" } });
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await unmount();
});

describe("ArtikelTable: Struktur und Bedienanker", () => {
  it("zeigt sechs Spalten in Fachreihenfolge und öffnet den Drawer über einen echten Knopf", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Artikel", "Fach", "Bestand", "Min.", "Nächster Verfall", "Status"]);
    expect(query("table").getAttribute("aria-label")).toBe("Artikel und Bestand");
    expect(exists(".ant-pagination")).toBe(false);
    expect(exists(".ant-table-column-sorter")).toBe(false);

    const artikelKnopf = query<HTMLButtonElement>("tr[data-row-key='alpha'] button");
    expect(artikelKnopf.textContent).toBe("Alpha-Päckchen");
    await clickElement(artikelKnopf);
    expect(query("[data-rolle='artikel-drawer']").getAttribute("data-artikel-id"))
      .toBe("alpha");
  });

  it("zeigt Fachwerte, Bestands-Einheit, Verfall und Status fachlich", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    const alphaText = query("tr[data-row-key='alpha']").textContent ?? "";
    expect(alphaText).toContain("10 Stk20");
    expect(alphaText).toContain("LOT-ALPHA");
    expect(alphaText).toContain("unter MindestbestandCharge fällig 03/27");
    expect(query("tr[data-row-key='beta']").textContent).toContain("leer");
    expect(query("tr[data-row-key='beta']").textContent).toContain("ok");
    expect(query("tr[data-row-key='delta']").textContent).toContain("inaktiv");
    expect(query("tr[data-row-key='alpha']").querySelector(`.${s.fach}`)?.textContent)
      .toBe("B2");
  });

  /**
   * Teil 6 (T165) loest den Vorgriff aus Teil 5 (T129) ein: der Knopf traegt
   * seither weder `disabled` noch den erklaerenden Tooltip. Die Zusicherungen
   * dazu stehen im Block "Excel-Export (§9.4)" weiter unten.
   */
  it("zeigt den Excel-Knopf mit erklaerendem Titel statt Sperre", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    const exportKnopf = query<HTMLButtonElement>("button[data-export-zeilen]");
    expect(exportKnopf.disabled).toBe(false);
    expect(exportKnopf.textContent).toBe("Excel-Liste");
    expect(exportKnopf.getAttribute("title"))
      .toBe("Erzeugt eine Excel-Datei (.xlsx) mit der aktuell angezeigten Liste");
  });

  it("beginnt jede neue Client-Komponente mit der echten use-client-Direktive", () => {
    for (const datei of ["ArtikelTable.tsx", "NeuArtikel.tsx"]) {
      const quelle = readFileSync(
        `src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/${datei}`,
        "utf8",
      );
      expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
    }
  });
});

describe("ArtikelTable: eine echte Filterquelle", () => {
  it("sucht ausschließlich über Name, Fach und nächste Chargennummer samt Unicode-Faltung", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await fill("input[type='search']", "PÄCKCHEN");
    expect(zeilenIds()).toEqual(["alpha"]);
    await fill("input[type='search']", "a1");
    expect(zeilenIds()).toEqual(["beta"]);
    await fill("input[type='search']", "lot-zulu");
    expect(zeilenIds()).toEqual(["zulu"]);
    await fill("input[type='search']", "unter mindestbestand");
    expect(zeilenIds()).toEqual([]);
  });

  it("kombiniert alle drei Checkboxen mit der Suche und zeigt Treffer gegen die Vollmenge", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await clickElement(checkboxMitText("unter Mindestbestand"));
    expect(zeilenIds()).toEqual(["alpha", "delta"]);
    await clickElement(checkboxMitText("Charge kritisch"));
    expect(zeilenIds()).toEqual(["alpha"]);
    await clickElement(checkboxMitText("inaktive ausblenden"));
    await fill("input[type='search']", "alpha");
    expect(zeilenIds()).toEqual(["alpha"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 5");
    expect(queryAll(".ant-checkbox-input")).toHaveLength(3);
    expect(exists(".ant-radio-group")).toBe(false);
    expect(exists(".ant-segmented")).toBe(false);
  });

  it("setzt Suche und alle drei Filter gemeinsam zurück", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await fill("input[type='search']", "alpha");
    await clickElement(checkboxMitText("unter Mindestbestand"));
    await clickElement(checkboxMitText("Charge kritisch"));
    await clickElement(checkboxMitText("inaktive ausblenden"));

    await clickElement(knopfMitText("Zurücksetzen"));

    expect(query<HTMLInputElement>("input[type='search']").value).toBe("");
    expect(queryAll<HTMLInputElement>("input[type='checkbox']").map((feld) => feld.checked))
      .toEqual([false, false, false]);
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta", "gamma", "zulu"]);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    expect(queryAll("button").some((knopf) => knopf.textContent?.includes("Zurücksetzen")))
      .toBe(false);
  });

  it("zeigt ohne Daten den Anfangstext", async () => {
    await mount(<ArtikelTable zeilen={[]} fahrzeuge={FAHRZEUGE} />);
    expect(document.body.textContent).toContain("Noch keine Artikel. Lege oben den ersten an.");
  });

  it.each([
    ["Suche", async () => fill("input[type='search']", "nicht-da")],
    ["Mindestfilter", async () => clickElement(checkboxMitText("unter Mindestbestand"))],
    ["Chargenfilter", async () => clickElement(checkboxMitText("Charge kritisch"))],
    ["Inaktivfilter", async () => clickElement(checkboxMitText("inaktive ausblenden"))],
  ])("erkennt %s allein für den gefilterten Leertext", async (_name, filtern) => {
    const einzelne = _name === "Inaktivfilter"
      ? [{ ...ZEILEN[4] }]
      : [{ ...ZEILEN[2] }];
    await mount(<ArtikelTable zeilen={einzelne} fahrzeuge={FAHRZEUGE} />);
    await filtern();
    expect(zeilenIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Artikel passt zu Suche und Filter.");
  });
});

describe("ArtikelTable: sechs totale Sortierungen und eine Exportquelle", () => {
  it.each([
    ["Name A–Z", ["alpha", "beta", "delta", "gamma", "zulu"]],
    ["Name Z–A", ["zulu", "gamma", "delta", "beta", "alpha"]],
    ["Fach", ["beta", "alpha", "zulu", "delta", "gamma"]],
    ["Bestand aufsteigend", ["beta", "alpha", "zulu", "delta", "gamma"]],
    ["Bestand absteigend", ["delta", "gamma", "alpha", "zulu", "beta"]],
    ["Nächster Verfall", ["gamma", "alpha", "zulu", "beta", "delta"]],
  ])("sortiert mit %s deterministisch und reicht exakt diese Reihenfolge weiter", async (
    label,
    erwartet,
  ) => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await sortierungWaehlen(label);
    expect(zeilenIds()).toEqual(erwartet);
    expect(exportIds()).toEqual(erwartet);
  });

  it("ändert Filter und Sortierung gemeinsam für Tabelle und künftigen Export", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(checkboxMitText("unter Mindestbestand"));
    await sortierungWaehlen("Bestand absteigend");

    expect(zeilenIds()).toEqual(["delta", "alpha"]);
    expect(exportIds()).toEqual(["delta", "alpha"]);
  });

  it("entscheidet einen FEFO-Gleichstand nach Name statt Eingabereihenfolge", async () => {
    // Verlierer zuerst: ohne Namens-Tiebreaker bliebe Zulu durch stabile
    // Array-Sortierung vor Alpha stehen.
    await mount(<ArtikelTable zeilen={[ZEILEN[1], ZEILEN[0]]} fahrzeuge={FAHRZEUGE} />);
    await sortierungWaehlen("Nächster Verfall");
    expect(zeilenIds()).toEqual(["alpha", "zulu"]);
    expect(exportIds()).toEqual(["alpha", "zulu"]);
  });
});

describe("NeuArtikel", () => {
  it("bindet die vier Felder, sendet exakte Werte und schließt nur bei Erfolg", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await neuArtikelOeffnen();
    await neuesArtikelFormularFuellen();
    await submitNeuArtikel();
    await warteAuf(() => mocks.createArtikel.mock.calls.length === 1, "Artikel-Action");

    expect(mocks.createArtikel).toHaveBeenCalledWith({
      name: "Wundauflage",
      fach: "D4",
      einheit: "Stk",
      mindestbestand: 12,
    });
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossener Artikeldialog",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("zeigt allgemeinen und bekannten Feldfehler, erhält Dialog sowie Werte", async () => {
    mocks.createArtikel.mockResolvedValueOnce({
      ok: false,
      fehler: "Artikel konnte fachlich nicht angelegt werden.",
      feldFehler: {
        fach: "Fach ist bereits belegt.",
        unbekannt: "Phantomfeld darf nicht erscheinen.",
      },
    });
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await neuArtikelOeffnen();
    await neuesArtikelFormularFuellen();
    await submitNeuArtikel();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Fach ist bereits belegt."),
      "Feldfehler am Fach",
    );
    expect(document.body.textContent).toContain("Artikel konnte fachlich nicht angelegt werden.");
    expect(document.body.textContent).not.toContain("Phantomfeld");
    expect(queryPortal<HTMLInputElement>("[aria-label='Name']").value).toBe("Wundauflage");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("zeigt bei verworfenem Promise nur einen festen Clienttext", async () => {
    mocks.createArtikel.mockRejectedValueOnce(new Error("internes Framework-Geheimnis"));
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await neuArtikelOeffnen();
    await neuesArtikelFormularFuellen();
    await submitNeuArtikel();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Artikel konnte nicht angelegt werden."),
      "fester Laufzeitfehler",
    );
    expect(document.body.textContent).not.toContain("internes Framework-Geheimnis");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("Artikelseite als Server Component", () => {
  it("lädt inklusive inaktiver Artikel und projiziert Zeitwerte vor der Client-Grenze", async () => {
    const { artikelSeitenInhalt } = await import("./page");
    const jetzt = new Date("2026-06-15T10:00:00Z");
    const testDb = migrierteTestDb("lagerbuch-artikel-seite-");
    try {
      testDb.db.insert(lagerorte).values([
        {
          id: "rtw-aktiv",
          name: "RTW Aktiv",
          typ: "fahrzeug",
          kennung: "UE-RK 129",
          aktiv: true,
        },
        {
          id: "rtw-inaktiv",
          name: "RTW Inaktiv",
          typ: "fahrzeug",
          kennung: null,
          aktiv: false,
        },
      ]).run();
      testDb.db.insert(artikel).values([
        {
          id: "artikel-aktiv",
          name: "Kompressen",
          einheit: "Stk",
          fach: "A1",
          mindestbestand: 20,
          aktiv: true,
          createdAt: jetzt,
        },
        {
          id: "artikel-inaktiv",
          name: "Altbestand",
          einheit: "Stk",
          fach: "Z9",
          mindestbestand: 0,
          aktiv: false,
          createdAt: jetzt,
        },
      ]).run();
      testDb.db.insert(chargen).values({
        id: "charge-naechste",
        artikelId: "artikel-aktiv",
        chargenNr: "L-129",
        verfall: "2026-07",
        createdAt: jetzt,
      }).run();
      testDb.db.insert(buchungen).values({
        id: "buchung-129",
        ts: jetzt,
        typ: "zugang",
        artikelId: "artikel-aktiv",
        chargeId: "charge-naechste",
        lagerortId: HANDLAGER_ID,
        menge: 7,
        quelleTyp: "system",
        quelleId: "test",
        referenz: null,
        kommentar: null,
      }).run();

      const inhalt = artikelSeitenInhalt(testDb.db, jetzt);
      const kopf = elementeVomTyp(inhalt, SeitenKopf)[0];
      expect((kopf.props as { titel: string }).titel).toBe("Artikel & Bestand");

      const tabelle = elementeVomTyp(inhalt, ArtikelTable)[0];
      const props = tabelle.props as {
        zeilen: typeof ZEILEN;
        fahrzeuge: typeof FAHRZEUGE;
      };
      expect(props.zeilen).toEqual([
        {
          id: "artikel-aktiv",
          name: "Kompressen",
          einheit: "Stk",
          fach: "A1",
          mindestbestand: 20,
          bestand: 7,
          aktiv: true,
          unterMindest: true,
          chargeKritisch: true,
          naechsteCharge: { chargenNr: "L-129", verfall: "2026-07" },
          naechsteAmpel: "gelb",
          naechsteAblaufText: "fällig 07/26",
        },
        {
          id: "artikel-inaktiv",
          name: "Altbestand",
          einheit: "Stk",
          fach: "Z9",
          mindestbestand: 0,
          bestand: 0,
          aktiv: false,
          unterMindest: false,
          chargeKritisch: false,
          naechsteCharge: null,
          naechsteAmpel: null,
          naechsteAblaufText: null,
        },
      ]);
      expect(props.fahrzeuge).toEqual([
        { id: "rtw-aktiv", name: "RTW Aktiv", kennung: "UE-RK 129" },
      ]);
      expect(istJsonSicher(props)).toBe(true);
    } finally {
      testDb.schliessen();
    }
  });

  it("bleibt dynamisch und lässt Zeitrechnung sowie Datenzugriff auf dem Server", async () => {
    const { dynamic } = await import("./page");
    expect(dynamic).toBe("force-dynamic");
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/page.tsx",
      "utf8",
    );
    expect(quelle).toMatch(/artikelListe\s*\(\s*db\s*,\s*\{\s*inklInaktiv:\s*true\s*\}\s*,\s*jetzt\s*\)/);
    expect(quelle).toMatch(/verfallStatus\s*\(/);
    expect(quelle).toMatch(/chargeText\s*\(/);
    expect(quelle).not.toMatch(/from\s+["']antd["']/);
    expect(quelle).not.toContain("@ant-design/icons");
  });
});

/**
 * §9.4, Entscheidungen 9-E und 9-H. Teil 5 (T129) hat den Knopf mit `disabled`
 * und erklaerendem Tooltip angelegt; dieser Block loest den Vorgriff ein.
 *
 * Anker `data-testid="lb-excel"` wurde beim Anbinden neu gesetzt — der Brief
 * (Vorab-Scan) haelt fest, dass es ihn vorher nicht gab: der Knopf war nur ueber
 * den Text „Excel-Liste" erreichbar. `data-export-zeilen` bleibt daneben
 * bestehen, weil die Sortierungstests weiter oben ihn lesen.
 *
 * `afterEach` hebt jede `vi.doMock("write-excel-file/browser", …)` dieses
 * Blocks wieder auf: ohne das erbt ein spaeter angehaengter Fall den
 * WERFENDEN Mock aus dem Fehlertest, ohne selbst je `vi.doMock` gerufen zu
 * haben (Review-Befund, Minor 2).
 */
describe("Excel-Export (§9.4)", () => {
  afterEach(() => {
    vi.doUnmock("write-excel-file/browser");
    vi.resetModules();
  });

  it("ist nicht mehr abgestellt", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    const knopf = query("[data-testid='lb-excel']");
    expect(knopf.hasAttribute("disabled")).toBe(false);
  });

  /** Bei leerer Liste bleibt er abgestellt — es gibt nichts zu exportieren. */
  it("bleibt bei leerer Liste abgestellt", async () => {
    await mount(<ArtikelTable zeilen={[]} fahrzeuge={FAHRZEUGE} />);
    expect(query("[data-testid='lb-excel']").hasAttribute("disabled")).toBe(true);
  });

  /**
   * DIE BIBLIOTHEK WIRD BEIM KLICK NACHGELADEN (9-E). Der Test mockt den
   * dynamischen Import — ein echter Lauf braeuchte einen Browser, und die
   * Aussage „es kommt wirklich eine .xlsx an" gehoert deshalb in den E2E (T168).
   * Hier zaehlt: wird die Bibliothek mit den RICHTIGEN Argumenten gerufen.
   *
   * `vi.resetModules()` vor jedem `vi.doMock` dieses Blocks: ohne den Reset
   * haelt Vitest den dynamischen Import aus einem frueheren Fall im
   * Modul-Cache fest, und der neue Mock griffe nie (Muster aus
   * `qr/HistoryOwner.test.tsx:19-23`).
   */
  it("uebergibt Blattname, fixierte Kopfzeile und den datierten Dateinamen", async () => {
    vi.resetModules();
    const { versprechen: toFileAufgerufen, melden: toFileMelden } = meldendesVersprechen();
    const toFile = vi.fn(() => {
      toFileMelden();
      return Promise.resolve();
    });
    const schreiben = vi.fn().mockReturnValue({ toFile });
    vi.doMock("write-excel-file/browser", () => ({ default: schreiben }));

    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(query("[data-testid='lb-excel']"));
    await act(async () => {
      await toFileAufgerufen;
    });

    const [zeilen, optionen] = schreiben.mock.calls[0];
    expect(zeilen).toHaveLength(ZEILEN.length);
    expect(optionen.sheet).toBe("Bestand Handlager");
    expect(optionen.stickyRowsCount).toBe(1);
    expect(optionen.columns).toHaveLength(9);
    expect(optionen.columns[0].header).toMatchObject({ value: "Artikel", fontWeight: "bold" });
    // `bestandExportDateiname(expect.any(Date))` liesse sich nicht direkt
    // aufrufen (kein echtes Date-Objekt) — die Form allein zeigt, dass der
    // Aufruf ueber `bestandExportDateiname(new Date())` gelaufen ist; die
    // Werte-Fixierung fuer LOKALE Zeit steckt bereits in `bestandExport.test.ts`.
    expect(toFile).toHaveBeenCalledWith(
      expect.stringMatching(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/),
    );
  });

  /**
   * §12.1, PUNKT 2 — DIE KOPPLUNG AN DER OBERFLAECHE. Die reine Fassung steht in
   * _lib/bestandExport.test.ts (T156); hier wird geprueft, dass die INSEL
   * dieselbe abgeleitete Liste durchreicht, die auch in dataSource geht. Wandert
   * das Filtern in antds Table-eigenen Zustand, exportiert der Knopf still
   * wieder alles (§6.15, Auflage 9).
   */
  it("exportiert nur die gefilterten Zeilen", async () => {
    vi.resetModules();
    const { versprechen: toFileAufgerufen, melden: toFileMelden } = meldendesVersprechen();
    const toFile = vi.fn(() => {
      toFileMelden();
      return Promise.resolve();
    });
    const schreiben = vi.fn().mockReturnValue({ toFile });
    vi.doMock("write-excel-file/browser", () => ({ default: schreiben }));

    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await fill("input[type='search']", "alpha");
    await clickElement(query("[data-testid='lb-excel']"));
    await act(async () => {
      await toFileAufgerufen;
    });

    expect(schreiben.mock.calls[0][0]).toHaveLength(1);
  });

  /**
   * §11.2 (d): der Fehler kommt als RUECKGABEWERT an die Stelle, nie ueber
   * e.message — der waere in Produktion der englische Satz (Falle 66).
   */
  it("zeigt bei einem Fehler den deutschen Satz mit Halbgeviertstrich", async () => {
    vi.resetModules();
    vi.doMock("write-excel-file/browser", () => { throw new Error("boom"); });

    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(query("[data-testid='lb-excel']"));
    await warteAuf(
      () => (document.body.textContent ?? "").includes(EXCEL_FEHLERTEXT),
      "deutscher Fehlertext",
    );
    expect(document.body.textContent).not.toContain("boom");
  });

  /**
   * REVIEW-BEFUND 1: ein Quelltext-Scan auf "Erzeuge…" bliebe gruen, wenn der
   * Ternaer zu `{false ? "Erzeuge…" : "Excel-Liste"}` verkaeme oder der String
   * nur noch in einem Kommentar stuende — die Stripper-Regel (A13) rettet das
   * hier NICHT, weil das Ziel selbst ein Stringliteral ist. Deshalb haengt
   * dieser Test `toFile` an ein manuell aufloesbares Promise: solange es
   * offen ist, MUSS der Knopf "Erzeuge…" zeigen und gesperrt sein; danach
   * faellt beides zurueck. Das ist eine Verhaltenszusage, keine Textbehauptung.
   */
  it("sperrt den Knopf und zeigt Erzeuge…, bis die Datei fertig ist — dann faellt beides zurueck", async () => {
    vi.resetModules();
    const { versprechen: toFileAufgerufen, melden: toFileMelden } = meldendesVersprechen();
    let dateiFertig: (() => void) | undefined;
    const toFile = vi.fn(() => {
      toFileMelden();
      return new Promise<void>((resolve) => { dateiFertig = resolve; });
    });
    const schreiben = vi.fn().mockReturnValue({ toFile });
    vi.doMock("write-excel-file/browser", () => ({ default: schreiben }));

    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(query("[data-testid='lb-excel']"));
    await act(async () => {
      await toFileAufgerufen;
    });

    const knopf = () => query<HTMLButtonElement>("[data-testid='lb-excel']");
    expect(knopf().textContent).toBe("Erzeuge…");
    expect(knopf().hasAttribute("disabled")).toBe(true);

    await act(async () => {
      dateiFertig?.();
      await Promise.resolve();
    });
    await warteAuf(() => knopf().textContent === "Excel-Liste", "zurueckgefallene Beschriftung");
    expect(knopf().hasAttribute("disabled")).toBe(false);
  });
});
