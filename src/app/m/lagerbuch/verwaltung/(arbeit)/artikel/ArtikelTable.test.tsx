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
import {
  artikel, ausgeblendeteKategorien, buchungen, chargen, lagerorte, users,
} from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import { EXCEL_FEHLERTEXT } from "../../../_lib/bestandExportSpalten";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ArtikelTable } from "./ArtikelTable";

const mocks = vi.hoisted(() => ({
  createArtikel: vi.fn(),
  setzeAusgeblendeteKategorien: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/artikel", () => ({
  createArtikel: (...args: unknown[]) => mocks.createArtikel(...args),
}));

vi.mock("../../../_actions/kategorien", () => ({
  setzeAusgeblendeteKategorien: (...args: unknown[]) => mocks.setzeAusgeblendeteKategorien(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../../../_ui/ArtikelDrawer", () => ({
  ArtikelDrawer: ({ id }: { id: string }) => (
    <div data-rolle="artikel-drawer" data-artikel-id={id} />
  ),
}));

// DRK-293. Die Schublade hat ihre eigenen Zusagen (`_ui/SammelDrawer.test.tsx`);
// hier interessiert nur, WAS sie bekommt.
vi.mock("../../../_ui/SammelDrawer", () => ({
  SammelDrawer: ({ zeilen }: { zeilen: readonly { id: string }[] }) => (
    <div data-rolle="sammel-drawer" data-ids={zeilen.map((zeile) => zeile.id).join(",")} />
  ),
}));

const ZEILEN = [
  {
    id: "alpha",
    name: "Alpha-Päckchen",
    einheit: "Stk",
    fach: "B2",
    kategorie: "Verbandmaterial",
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
    kategorie: "Hygiene",
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
    kategorie: null,
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
    // Kleingeschrieben mit Absicht: dieselbe Kategorie wie „Hygiene" bei Zulu.
    kategorie: "hygiene",
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
    kategorie: "Technik",
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

/**
 * Wartet die ENTPRELLUNG der Freitextsuche ab.
 *
 * ⚠️ `warte()` allein reicht dafuer NICHT: es gibt einen einzigen
 * Makrotask-Tick frei, `useEntprellt` haelt den Wert aber 200 ms zurueck. Ohne
 * dieses Warten prueft ein Test die Liste VOR der Suche — und ist gruen,
 * obwohl er nichts gemessen hat. Genau die Sorte Test, die spaeter als
 * „funktioniert doch" zitiert wird.
 */
async function warteAufSuche(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 260));
  });
}

/** Sucht und wartet die Entprellung ab — die beiden gehoeren immer zusammen. */
async function suchen(begriff: string): Promise<void> {
  await fill("input[type='search']", begriff);
  await warteAufSuche();
}

function spaltenKopf(titel: string): HTMLElement {
  const kopf = queryAll<HTMLElement>("thead th")
    .find((th) => (th.textContent ?? "").includes(titel));
  if (!kopf) throw new Error(`Spaltenkopf nicht gefunden: ${titel}`);
  return kopf;
}

/**
 * Schaltet die Sortierung eines Spaltenkopfs weiter. antd macht bei gesetztem
 * `sorter` das ganze `<th>` klickbar; der Zyklus ist aufsteigend → absteigend →
 * aus.
 */
async function spalteSortieren(titel: string, male = 1): Promise<void> {
  for (let i = 0; i < male; i++) {
    await clickElement(spaltenKopf(titel));
    await warte();
  }
}

/**
 * Setzt den Spaltenfilter einer Spalte auf genau diese Eintraege und bestaetigt.
 *
 * Der Weg ist absichtlich der eines Fingers und nicht ein Griff in antds
 * Zustand: Ausloeser im Kopf anklicken, im Menue (es haengt im Portal, nicht in
 * der Tabelle) die Eintraege waehlen, mit dem letzten Knopf der Leiste
 * bestaetigen. Der letzte ist „OK" — auf den TEXT zu pruefen waere eine
 * Kopplung an die Locale, und die ist in diesem Test nicht gesetzt.
 */
async function spalteFiltern(titel: string, texte: string[]): Promise<void> {
  const ausloeser = spaltenKopf(titel).querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!ausloeser) throw new Error(`Spalte hat keinen Filter: ${titel}`);
  await clickElement(ausloeser);
  await warte();

  const menue = document.body.querySelector(".ant-table-filter-dropdown");
  if (!menue) throw new Error(`Filtermenue nicht geoeffnet: ${titel}`);
  for (const text of texte) {
    const eintrag = Array.from(menue.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item"))
      .find((li) => (li.textContent ?? "").trim() === text);
    if (!eintrag) throw new Error(`Filtereintrag nicht gefunden: ${titel} → ${text}`);
    await clickElement(eintrag);
    await warte();
  }

  const knoepfe = Array.from(
    menue.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown-btns button"),
  );
  const ok = knoepfe.at(-1);
  if (!ok) throw new Error(`Bestaetigungsknopf nicht gefunden: ${titel}`);
  await clickElement(ok);
  await warte();
}

/** Die Filtereintraege, die eine Spalte anbietet — in ihrer Reihenfolge. */
async function filterEintraege(titel: string): Promise<string[]> {
  const ausloeser = spaltenKopf(titel).querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!ausloeser) throw new Error(`Spalte hat keinen Filter: ${titel}`);
  await clickElement(ausloeser);
  await warte();
  const menue = document.body.querySelector(".ant-table-filter-dropdown");
  if (!menue) throw new Error(`Filtermenue nicht geoeffnet: ${titel}`);
  return Array.from(menue.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item"))
    .map((li) => (li.textContent ?? "").trim());
}

function knopfMitText(text: string): HTMLElement {
  const knopf = queryAll<HTMLElement>("button")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
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
  it("zeigt sieben Spalten in Fachreihenfolge und öffnet den Drawer über einen echten Knopf", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    // Die leere erste Spalte ist die Auswahlspalte (DRK-293); sie traegt das
    // „alle auswaehlen"-Kreuzchen und keinen Text.
    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual([
        "", "Artikel", "Fach", "Kategorie", "Bestand", "Min.", "Nächster Verfall", "Status",
      ]);
    expect(query("table").getAttribute("aria-label")).toBe("Artikel und Bestand");
    expect(exists(".ant-pagination")).toBe(false);
    // Seit DRK-331 sortieren die Spaltenkoepfe selbst — vorher stand dafuer ein
    // Auswahlfeld ueber der Tabelle, und diese Zusicherung lautete umgekehrt.
    expect(queryAll(".ant-table-column-sorter").length).toBeGreaterThan(0);
    // Und die Spalten, an denen fachlich gefiltert wird, tragen einen Ausloeser.
    expect(spaltenKopf("Fach").querySelector(".ant-table-filter-trigger")).not.toBeNull();
    expect(spaltenKopf("Status").querySelector(".ant-table-filter-trigger")).not.toBeNull();

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

    await suchen("PÄCKCHEN");
    expect(zeilenIds()).toEqual(["alpha"]);
    await suchen("a1");
    expect(zeilenIds()).toEqual(["beta"]);
    await suchen("lot-zulu");
    expect(zeilenIds()).toEqual(["zulu"]);
    await suchen("unter mindestbestand");
    expect(zeilenIds()).toEqual([]);
  });

  /**
   * ⚠️ DIE ENTPRELLUNG IST HIER DER PRUEFGEGENSTAND, nicht nur eine Wartezeit.
   * Ohne sie filterte die Tabelle bei jedem Tastendruck neu; mit ihr steht
   * unmittelbar nach dem Tippen noch die ALTE Liste. Ein Test, der das nicht
   * weiss, misst die Liste vor der Suche und ist trotzdem gruen.
   */
  it("filtert erst nach der Entprellung, nicht bei jedem Tastendruck", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await fill("input[type='search']", "PÄCKCHEN");
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta", "gamma", "zulu"]);
    // Das Feld selbst hinkt ausdruecklich NICHT hinterher.
    expect(query<HTMLInputElement>("input[type='search']").value).toBe("PÄCKCHEN");

    await warteAufSuche();
    expect(zeilenIds()).toEqual(["alpha"]);
  });

  /**
   * Die vier Haken von frueher, jetzt als Filter der Status-Spalte. Mehrere
   * angekreuzte Zustaende sind eine VEREINIGUNG (antd verodert) — genau wie die
   * abgeloeste Knopfleiste sich verhielt.
   */
  it("filtert über die Status-Spalte und verodert mehrere Zustände", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    expect(await filterEintraege("Status")).toEqual([
      "unter Mindestbestand", "Charge kritisch", "inaktiv", "Bestand 0",
    ]);

    await spalteFiltern("Status", ["unter Mindestbestand"]);
    expect(zeilenIds()).toEqual(["alpha", "delta"]);

    // Zweiter Zustand dazu: die Menge waechst, sie schrumpft nicht.
    await spalteFiltern("Status", ["inaktiv"]);
    expect(zeilenIds()).toEqual(["alpha", "delta"]);
  });

  it("verknüpft Spaltenfilter UND Suche", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await spalteFiltern("Status", ["unter Mindestbestand"]);
    expect(zeilenIds()).toEqual(["alpha", "delta"]);

    await suchen("alpha");
    expect(zeilenIds()).toEqual(["alpha"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 5");
  });

  it("bietet Fach und Kategorie als Spaltenfilter an", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    // Die Liste entsteht aus den Daten — es steht keine Option darin, die
    // keine Zeile trifft.
    const faecher = await filterEintraege("Fach");
    expect(faecher.length).toBeGreaterThan(0);
    for (const fach of faecher) {
      expect(ZEILEN.some((zeile) => zeile.fach === fach)).toBe(true);
    }
  });

  it("setzt die Suche zurück", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await suchen("alpha");
    expect(zeilenIds()).toEqual(["alpha"]);

    await clickElement(knopfMitText("Zurücksetzen"));
    await warteAufSuche();

    expect(query<HTMLInputElement>("input[type='search']").value).toBe("");
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta", "gamma", "zulu"]);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    expect(queryAll("button").some((knopf) => knopf.textContent?.includes("Zurücksetzen")))
      .toBe(false);
  });

  it("zeigt ohne Daten den Anfangstext", async () => {
    await mount(<ArtikelTable zeilen={[]} fahrzeuge={FAHRZEUGE} />);
    expect(document.body.textContent).toContain("Noch keine Artikel. Lege oben den ersten an.");
  });

  it("erkennt die Suche für den gefilterten Leertext", async () => {
    await mount(<ArtikelTable zeilen={[{ ...ZEILEN[2] }]} fahrzeuge={FAHRZEUGE} />);
    await suchen("nicht-da");
    expect(zeilenIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Artikel passt zu Suche und Filter.");
  });
});

/**
 * DER FILTER AUS DRK-295 („0 Stueck ausblenden koennen?").
 *
 * Eigener Block, weil er zwei Dinge festhaelt, die die Zeilen oben nicht
 * zeigen: die SCHWELLE (genau 0, nicht „wenig") und die FOLGE FUER DEN EXPORT.
 *
 * ⚠️ DIE FOLGE FUER DEN EXPORT IST SEIT DRK-331 DIE EIGENTLICHE ZUSAGE. Der
 * Filter liegt jetzt in antds Tabellenzustand — genau der Fall, vor dem §9.4
 * warnte („wandert Filtern in antds Table-eigenen Zustand, MUSS der Export
 * dieselbe Liste lesen"). Die Tabelle liest die angezeigte Menge deshalb ueber
 * `onChange(…, extra.currentDataSource)`. Dieser Test ist der Riegel davor,
 * dass jemand das zurueckdreht und der Knopf still wieder alles exportiert.
 */
describe("ArtikelTable: „Bestand 0“ als Spaltenfilter (DRK-295)", () => {
  const MIT_NULL = [
    { ...ZEILEN[2], id: "leer", name: "Leerer Artikel", bestand: 0, unterMindest: false },
    { ...ZEILEN[2], id: "eins", name: "Ein Stueck", bestand: 1 },
  ];

  it("blendet genau die Zeilen mit 0 aus — 1 bleibt stehen", async () => {
    await mount(<ArtikelTable zeilen={MIT_NULL} fahrzeuge={FAHRZEUGE} />);
    expect(zeilenIds()).toEqual(["eins", "leer"]);

    await spalteFiltern("Status", ["Bestand 0"]);
    expect(zeilenIds()).toEqual(["leer"]);
  });

  it("loescht nichts: erneutes Abwaehlen bringt die Zeile zurueck", async () => {
    // Das zweite Akzeptanzkriterium aus DRK-295 woertlich — „Ausgeblendete
    // Artikel werden nicht geloescht und koennen wieder angezeigt werden".
    await mount(<ArtikelTable zeilen={MIT_NULL} fahrzeuge={FAHRZEUGE} />);
    await spalteFiltern("Status", ["Bestand 0"]);
    expect(zeilenIds()).toEqual(["leer"]);
    await spalteFiltern("Status", ["Bestand 0"]);
    expect(zeilenIds()).toEqual(["eins", "leer"]);
  });

  it("ist beim Aufschlagen AUS", async () => {
    // Ein vorgewaehltes Ausblenden zeigte beim ersten Aufschlagen eine
    // verkuerzte Liste, ohne dass jemand danach gefragt haette.
    await mount(<ArtikelTable zeilen={MIT_NULL} fahrzeuge={FAHRZEUGE} />);
    expect(zeilenIds()).toEqual(["eins", "leer"]);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    expect(queryAll("button").some((k) => k.textContent?.includes("Zurücksetzen"))).toBe(false);
  });

  it("kuerzt die Excel-Liste mit, nicht nur die Tabelle", async () => {
    await mount(<ArtikelTable zeilen={MIT_NULL} fahrzeuge={FAHRZEUGE} />);
    expect(exportIds()).toEqual(["eins", "leer"]);

    await spalteFiltern("Status", ["Bestand 0"]);
    expect(exportIds()).toEqual(["leer"]);
  });
});

/**
 * DRK-294 — ausgeblendete Kategorien.
 *
 * Die Auswahl kommt als gespeicherter Startwert vom Server (gefaltete
 * Schluessel) und laeuft durch DASSELBE Praedikat wie Suche und Chips — deshalb
 * haengt auch hier jede Zusicherung zugleich an Tabelle UND Export. Die drei
 * Zusagen, die kein Unit-Test des Praedikats sehen kann: der Hinweis beim
 * Aufschlagen, das Speichern der ganzen Liste, und dass „Zuruecksetzen" die
 * gespeicherte Auswahl stehen laesst.
 */
describe("ArtikelTable: ausgeblendete Kategorien (DRK-294)", () => {
  beforeEach(() => {
    mocks.setzeAusgeblendeteKategorien.mockResolvedValue({ ok: true });
  });

  async function kategorienOeffnen(): Promise<HTMLElement[]> {
    const input = query<HTMLInputElement>("[aria-label='Kategorien dauerhaft ausblenden']");
    await act(async () => {
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await warte();
    return Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"));
  }

  async function kategorieWaehlen(label: string): Promise<void> {
    const option = (await kategorienOeffnen())
      .find((element) => (element.textContent ?? "").toLowerCase() === label.toLowerCase());
    if (!option) throw new Error(`Kategorie nicht gefunden: ${label}`);
    await clickElement(option);
    await warte();
  }

  it("zeigt die Kategorie je Zeile und bietet jede Kategorie genau einmal an", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    expect(query("tr[data-row-key='zulu']").textContent).toContain("Hygiene");
    expect(query("tr[data-row-key='beta']").textContent).toContain("–");
    // „Hygiene" (Zulu) und „hygiene" (Gamma) sind EINE Option.
    const optionen = (await kategorienOeffnen()).map((element) => element.textContent?.toLowerCase());
    expect(optionen).toEqual(["hygiene", "technik", "verbandmaterial"]);
  });

  it("blendet die gespeicherte Auswahl schon beim Aufschlagen aus und sagt es", async () => {
    await mount(
      <ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} ausgeblendeteKategorien={["hygiene"]} />,
    );

    // Beta hat KEINE Kategorie und bleibt stehen.
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta"]);
    expect(exportIds()).toEqual(["alpha", "beta", "delta"]);
    expect(query("[data-testid='kategorien-hinweis']").textContent)
      .toContain("2 Artikel in ausgeblendeten Kategorien");
    expect(mocks.setzeAusgeblendeteKategorien).not.toHaveBeenCalled();
  });

  it("speichert beim Waehlen die ganze Liste und blendet sofort aus", async () => {
    await mount(
      <ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} ausgeblendeteKategorien={["hygiene"]} />,
    );
    await kategorieWaehlen("Technik");

    expect(mocks.setzeAusgeblendeteKategorien).toHaveBeenCalledWith({ kategorien: ["hygiene", "technik"] });
    expect(zeilenIds()).toEqual(["alpha", "beta"]);
    expect(exportIds()).toEqual(["alpha", "beta"]);
  });

  it("„alle zeigen“ leert die gespeicherte Auswahl", async () => {
    await mount(
      <ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} ausgeblendeteKategorien={["hygiene"]} />,
    );
    await clickElement(knopfMitText("alle zeigen"));
    await warte();

    expect(mocks.setzeAusgeblendeteKategorien).toHaveBeenCalledWith({ kategorien: [] });
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta", "gamma", "zulu"]);
    expect(exists("[data-testid='kategorien-hinweis']")).toBe(false);
  });

  it("„Zurücksetzen“ laesst die gespeicherte Auswahl stehen", async () => {
    await mount(
      <ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} ausgeblendeteKategorien={["hygiene"]} />,
    );
    // Die gespeicherte Auswahl blendet „hygiene" aus; uebrig bleiben drei.
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta"]);

    await suchen("alpha");
    expect(zeilenIds()).toEqual(["alpha"]);

    await clickElement(knopfMitText("Zurücksetzen"));
    await warteAufSuche();

    // „Zuruecksetzen" raeumt die Suche — die GESPEICHERTE Auswahl bleibt, sonst
    // loeschte der Knopf still eine Einstellung des Kontos.
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta"]);
    expect(mocks.setzeAusgeblendeteKategorien).not.toHaveBeenCalled();
  });

  it("nennt einen abgelehnten und einen abgebrochenen Speicherversuch mit festem Satz", async () => {
    mocks.setzeAusgeblendeteKategorien
      .mockResolvedValueOnce({ ok: false, fehler: "Die Auswahl konnte nicht gespeichert werden." })
      .mockRejectedValueOnce(new Error("internes Framework-Geheimnis"));
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await kategorieWaehlen("Technik");
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Die Auswahl konnte nicht gespeichert werden."),
      "abgelehnte Speicherung",
    );

    await kategorieWaehlen("Verbandmaterial");
    await warteAuf(
      () => (document.body.textContent ?? "").includes("bitte erneut versuchen"),
      "abgebrochene Speicherung",
    );
    expect(document.body.textContent).not.toContain("internes Framework-Geheimnis");
  });

  it("zeigt ohne vergebene Kategorie kein Auswahlfeld", async () => {
    await mount(
      <ArtikelTable
        zeilen={ZEILEN.map((zeile) => ({ ...zeile, kategorie: null }))}
        fahrzeuge={FAHRZEUGE}
      />,
    );
    expect(exists("[aria-label='Kategorien dauerhaft ausblenden']")).toBe(false);
  });

  it("zeigt den gefilterten Leertext, wenn allein die Kategorien alles ausblenden", async () => {
    await mount(
      <ArtikelTable zeilen={[ZEILEN[1]]} fahrzeuge={FAHRZEUGE} ausgeblendeteKategorien={["hygiene"]} />,
    );
    expect(zeilenIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Artikel passt zu Suche und Filter.");
  });
});

describe("ArtikelTable: Sortierung in den Spaltenköpfen und eine Exportquelle", () => {
  /**
   * ⚠️ WAS DIESER BLOCK BESITZT, ist nicht „antd kann sortieren" — das ist
   * fremder Code. Er besitzt die Zusage, dass die Tabelle und der EXPORT
   * dieselbe Reihenfolge und dieselbe Menge sehen. Bis DRK-331 stand dafuer ein
   * Auswahlfeld ueber der Tabelle und der Export las dieselbe abgeleitete
   * Liste; jetzt sortiert und filtert antd, und der Export liest, was antd
   * anzeigt.
   */
  it("sortiert über den Spaltenkopf auf- und absteigend", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    // Beim Aufschlagen aufsteigend nach Name — `defaultSortOrder`.
    expect(zeilenIds()).toEqual(["alpha", "beta", "delta", "gamma", "zulu"]);

    // Ein Klick schaltet auf absteigend.
    await spalteSortieren("Artikel");
    expect(zeilenIds()).toEqual(["zulu", "gamma", "delta", "beta", "alpha"]);
  });

  it("sortiert den Bestand als ZAHL, nicht als Text", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await spalteSortieren("Bestand");
    const bestaende = queryAll("tbody tr[data-row-key]").map((zeile) => {
      const zellen = zeile.querySelectorAll("td");
      return Number.parseInt(zellen[4]?.textContent ?? "", 10);
    });
    const aufsteigend = [...bestaende].sort((a, b) => a - b);
    expect(bestaende).toEqual(aufsteigend);
  });

  it("reicht die angezeigte Reihenfolge an den Export weiter", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await spalteSortieren("Artikel");
    expect(exportIds()).toEqual(zeilenIds());
  });

  it("reicht Filter UND Sortierung gemeinsam an den Export weiter", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await spalteFiltern("Status", ["unter Mindestbestand"]);
    expect(zeilenIds()).toEqual(["alpha", "delta"]);
    expect(exportIds()).toEqual(["alpha", "delta"]);

    await spalteSortieren("Artikel");
    expect(exportIds()).toEqual(zeilenIds());
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

      // DRK-294: die Auswahl zweier Konten — die Seite darf nur die des
      // aufrufenden lesen.
      testDb.db.insert(users).values([{ id: "u-anna" }, { id: "u-bert" }]).run();
      testDb.db.insert(ausgeblendeteKategorien).values([
        { userId: "u-anna", kategorie: "hygiene" },
        { userId: "u-bert", kategorie: "technik" },
      ]).run();

      const inhalt = artikelSeitenInhalt(testDb.db, jetzt, "u-anna");
      const kopf = elementeVomTyp(inhalt, SeitenKopf)[0];
      expect((kopf.props as { titel: string }).titel).toBe("Artikel & Bestand");

      const tabelle = elementeVomTyp(inhalt, ArtikelTable)[0];
      const props = tabelle.props as {
        zeilen: typeof ZEILEN;
        fahrzeuge: typeof FAHRZEUGE;
        ausgeblendeteKategorien: string[];
      };
      expect(props.zeilen).toEqual([
        {
          id: "artikel-aktiv",
          name: "Kompressen",
          einheit: "Stk",
          fach: "A1",
          kategorie: null,
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
          kategorie: null,
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
      expect(props.ausgeblendeteKategorien).toEqual(["hygiene"]);
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
    expect(optionen.columns).toHaveLength(10);
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
    await suchen("alpha");
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

/**
 * DRK-293 — mehrere Artikel gemeinsam bearbeiten.
 *
 * Geprueft wird die NAHT, nicht die Schublade: die steht mit ihren eigenen
 * Zusagen in `_ui/SammelDrawer.test.tsx` und ist hier ein Platzhalter. Was nur
 * hier zu sehen ist: das Kreuzchen liegt in derselben `<tr>` wie der
 * Zeilenklick, und die Auswahl ueberlebt einen Filterwechsel.
 */
describe("ArtikelTable: Auswahl mehrerer Artikel (DRK-293)", () => {
  function auswahlKreuzchen(id: string): HTMLInputElement {
    return query<HTMLInputElement>(`tr[data-row-key='${id}'] input[type='checkbox']`);
  }

  const LEISTE = "[data-testid='sammel-leiste']";

  function leisteText(): string | null {
    return exists(LEISTE) ? query(LEISTE).textContent : null;
  }

  it("zeigt die Leiste erst mit der ersten Auswahl und zählt mit", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    expect(leisteText()).toBeNull();

    await clickElement(auswahlKreuzchen("alpha"));
    expect(leisteText()).toContain("1 ausgewählt");

    await clickElement(auswahlKreuzchen("zulu"));
    expect(leisteText()).toContain("2 ausgewählt");
  });

  it("öffnet beim Ankreuzen NICHT die Artikelschublade", async () => {
    // Die Auswahlspalte liegt in derselben `<tr>` wie der Zeilenklick; ohne den
    // Riegel in `onRow` beantwortet jedes Ankreuzen sich selbst mit den
    // Artikeldetails.
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await clickElement(auswahlKreuzchen("alpha"));

    expect(exists("[data-rolle='artikel-drawer']")).toBe(false);
    expect(leisteText()).toContain("1 ausgewählt");
  });

  it("öffnet bei einem Klick auf die Zeile weiterhin die Artikelschublade", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);

    await clickElement(query<HTMLElement>("tr[data-row-key='alpha'] td:nth-child(3)"));

    expect(query("[data-rolle='artikel-drawer']").getAttribute("data-artikel-id"))
      .toBe("alpha");
  });

  it("hebt die Auswahl auf Wunsch wieder auf", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(auswahlKreuzchen("alpha"));

    await clickElement(knopfMitText("Auswahl aufheben"));

    expect(leisteText()).toBeNull();
    expect(auswahlKreuzchen("alpha").checked).toBe(false);
  });

  it("hält die Auswahl über einen Filterwechsel hinweg", async () => {
    // Der Vorgang, um den es geht: erst die einen suchen und ankreuzen, dann
    // die anderen. Eine Auswahl, die beim Tippen verschwindet, kann das nicht.
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(auswahlKreuzchen("alpha"));

    await suchen("zulu");
    expect(zeilenIds()).toEqual(["zulu"]);
    expect(leisteText()).toContain("1 ausgewählt");

    await clickElement(auswahlKreuzchen("zulu"));
    expect(leisteText()).toContain("2 ausgewählt");

    await suchen("");
    expect(auswahlKreuzchen("alpha").checked).toBe(true);
    expect(auswahlKreuzchen("zulu").checked).toBe(true);
  });

  it("reicht genau die ausgewählten Artikel an die Sammelschublade", async () => {
    await mount(<ArtikelTable zeilen={ZEILEN} fahrzeuge={FAHRZEUGE} />);
    await clickElement(auswahlKreuzchen("zulu"));
    await clickElement(auswahlKreuzchen("alpha"));

    await clickElement(knopfMitText("Auswahl bearbeiten"));

    const drawer = query("[data-rolle='sammel-drawer']");
    // Nach Namen sortiert („Alpha-Päckchen" vor „Zulu"), nicht in Klickfolge:
    // die Vorschau soll lesbar sein, nicht die Reihenfolge der Mausklicks
    // nacherzählen.
    expect(drawer.getAttribute("data-ids")).toBe("alpha,zulu");
  });
});
