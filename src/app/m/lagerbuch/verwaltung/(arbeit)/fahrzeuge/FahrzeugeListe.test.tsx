// @vitest-environment jsdom

import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
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
  fill,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { checks, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import s from "../../../_ui/verwaltung.module.css";
import {
  FahrzeugeListe,
  sucheTrifft,
  type FahrzeugAnzeigeZeile,
} from "./FahrzeugeListe";

const mocks = vi.hoisted(() => ({
  createFahrzeug: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/fahrzeuge", () => ({
  createFahrzeug: (...args: unknown[]) => mocks.createFahrzeug(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const ZEILEN: FahrzeugAnzeigeZeile[] = [
  {
    id: "f1",
    name: "RTW Nord",
    kennung: "UE-RK 1234",
    aktiv: true,
    einheitenart: "fahrzeug",
    templateName: "Standard-RTW",
    positionen: 12,
    faecher: 3,
    artikelUnterSoll: 2,
    verfallAbgelaufen: 0,
    verfallWarnend: 0,
    verfallErfasst: 3,
    verfallSollArtikel: 3,
    letzterCheckText: "30.07.2026, 10:00",
    letzterCheckIso: "2026-07-30T08:00:00.000Z",
  },
  {
    id: "f2",
    name: "RTW Süd",
    kennung: "UE-RK 5678",
    aktiv: true,
    /* DRK-309: der Zwischenstand aus Migration 0010 steht MITTEN in der
     * Fixture, nicht am Ende — jede Zusicherung ueber die Liste laeuft damit
     * ueber eine nicht zugeordnete Zeile, ohne sie eigens zu suchen. */
    einheitenart: null,
    templateName: null,
    positionen: 4,
    faecher: 2,
    artikelUnterSoll: 0,
    verfallAbgelaufen: 0,
    verfallWarnend: 1,
    verfallErfasst: 4,
    verfallSollArtikel: 4,
    letzterCheckText: null,
    letzterCheckIso: null,
  },
  {
    id: "f3",
    name: "Reserve MTW",
    kennung: null,
    aktiv: false,
    einheitenart: "fahrzeug",
    templateName: "Reserve",
    positionen: 2,
    faecher: 1,
    artikelUnterSoll: 1,
    verfallAbgelaufen: 2,
    verfallWarnend: 1,
    verfallErfasst: 2,
    verfallSollArtikel: 2,
    letzterCheckText: "01.08.2026, 09:15",
    letzterCheckIso: "2026-08-01T07:15:00.000Z",
  },
  {
    id: "f4",
    name: "ELW",
    kennung: "UE-RK 9999",
    aktiv: true,
    einheitenart: "tasche",
    templateName: null,
    positionen: 1,
    faecher: 1,
    artikelUnterSoll: 0,
    verfallAbgelaufen: 0,
    verfallWarnend: 0,
    verfallErfasst: 0,
    verfallSollArtikel: 1,
    letzterCheckText: null,
    letzterCheckIso: null,
  },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createFahrzeug.mockResolvedValue({ ok: true, wert: { id: "fahrzeug-neu" } });
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function knopfMitText(text: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

/**
 * Die Freitextsuche laeuft ueber `useEntprellt` — das FELD steht sofort, die
 * ABLEITUNG erst nach der Entprellzeit. Ohne dieses Warten misst der Test den
 * Zustand VOR dem Filtern und meldet das als „Filter wirkt nicht".
 */
async function suchen(wert: string): Promise<void> {
  await fill("input[type='search']", wert);
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 250));
  });
}

/**
 * Einen Spaltenfilter setzen — den Weg, den auch eine Person nimmt: Trichter im
 * Spaltenkopf, Eintraege ankreuzen, „OK". Ohne Eintraege wird nur
 * zurueckgesetzt.
 *
 * ⚠️ DIE EINTRAEGE WERDEN UMGESCHALTET, NICHT GESETZT: das Menue behaelt seine
 * bisherige Auswahl, ein erneut genannter Eintrag faellt also wieder heraus.
 */
async function spaltenFilter(spalte: string, ...eintraege: string[]): Promise<void> {
  const kopf = queryAll<HTMLElement>("thead th")
    .find((th) => (th.textContent ?? "").includes(spalte));
  const trichter = kopf?.querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!trichter) throw new Error(`Kein Spaltenfilter an: ${spalte}`);
  await clickElement(trichter);

  // ⚠️ NUR DAS OFFENE MENUE. antd laesst ein einmal geoeffnetes Filtermenue im
  // DOM stehen und blendet es nur aus; ohne diese Einschraenkung traefe „OK"
  // den Knopf eines FRUEHER geoeffneten Menues, und der Filter dieser Spalte
  // bliebe still unangewandt.
  const offen = () =>
    document.body.querySelector<HTMLElement>(
      ".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown",
    );
  const menue = () => Array.from(offen()?.querySelectorAll<HTMLElement>("li") ?? []);
  await warteAuf(() => menue().length > 0, `Filtermenü zu ${spalte}`);

  for (const text of eintraege) {
    const eintrag = menue().find((li) => (li.textContent ?? "").includes(text));
    if (!eintrag) throw new Error(`Filtereintrag nicht gefunden: ${text}`);
    await clickElement(eintrag);
  }

  // Ohne `ConfigProvider`-Locale beschriftet antd die beiden Knoepfe englisch
  // („Reset"/„OK"); beide Schreibweisen werden akzeptiert, damit der Test nicht
  // an einer Spracheinstellung haengt, die er gar nicht prueft.
  const knopf = (muster: RegExp) => Array.from(
    offen()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((element) => muster.test(element.textContent ?? ""));

  // „Zuruecksetzen" leert nur die Auswahl; uebernommen wird sie erst mit „OK".
  if (eintraege.length === 0) {
    const leeren = knopf(/Zurücksetzen|Reset/);
    if (!leeren) throw new Error("Kein Zurücksetzen-Knopf im Filtermenü");
    await clickElement(leeren);
  }
  const uebernehmen = knopf(/^OK$/);
  if (!uebernehmen) throw new Error("Kein OK-Knopf im Filtermenü");
  await clickElement(uebernehmen);
  await warte();
}

function zeilenIds(): Array<string | null> {
  return queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key"));
}

async function modalOeffnen(): Promise<void> {
  await clickElement(knopfMitText("Neue Einheit"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Einheiten-Modal",
  );
}

/** Klickt eine der beiden Art-Schaltflaechen im Anlegen-Dialog (DRK-309). */
async function portalArtWaehlen(beschriftung: string): Promise<void> {
  const knopf = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-modal label.ant-radio-button-wrapper"),
  ).find((element) => element.textContent?.trim() === beschriftung);
  if (!knopf) throw new Error(`Art nicht gefunden: ${beschriftung}`);
  await clickElement(knopf.querySelector<HTMLInputElement>("input") ?? knopf);
}

async function portalFuellen(ariaLabel: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`.ant-modal input[aria-label='${ariaLabel}']`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${ariaLabel}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function portalAbsenden(): Promise<void> {
  const form = queryPortal<HTMLFormElement>(".ant-modal form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warte();
}

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  return [
    ...treffer,
    ...elementeVomTyp((wert.props as { children?: ReactNode }).children, typ),
  ];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (
    typeof wert !== "object"
    || wert instanceof Date
    || isValidElement(wert)
    || Object.getPrototypeOf(wert) !== Object.prototype
  ) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

describe("FahrzeugeListe — Spalten und Status", () => {
  it("trägt die sieben Spalten, stabile Zeilen und den äußeren Detail-Link", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    /**
     * ⚠️ „Verfall" IST SEIT DRK-331 (sechste Reviewrunde) EINE EIGENE SPALTE.
     * Der Chip stand vorher im Status, und damit lagen drei UNABHAENGIGE
     * Bedingungen auf zwei Spalten — „unter Soll" UND „laeuft ab" war nicht
     * mehr ausdrueckbar, weil antd innerhalb einer Spalte verodert.
     */
    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      /*
       * ⚠️ „Einheit" UND „Art" SIND DRK-309. Die Liste fuehrt seither
       * Fahrzeuge UND Taschen; „Fahrzeug" als Spaltenkopf ueber einer Zeile,
       * die „Sanitätstasche 1" heisst, waere die Behauptung, es gaebe nur
       * eine Art. Die Art steht DIREKT daneben, weil sie „was ist das hier?"
       * beantwortet — die Frage vor „wie voll ist es?".
       */
      "Einheit",
      "Art",
      "Vorlage",
      "Bestückung",
      "Verfall",
      "Status",
      "Zuletzt geprüft",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Fahrzeuge und Taschen");
    expect(zeilenIds()).toEqual(["f1", "f2", "f3", "f4"]);
    expect(query("tbody a").getAttribute("href")).toBe("/verwaltung/fahrzeuge/f1");
  });

  it("zeigt Vorlage, Bestückung, letzten Check und alle fachlichen Statusvarianten", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    expect(query("tr[data-row-key='f1']").textContent).toContain("Standard-RTW");
    expect(query("tr[data-row-key='f1']").textContent).toContain("12 Positionen · 3 Fächer");
    expect(query("tr[data-row-key='f1']").textContent).toContain("30.07.2026, 10:00");
    expect(query(`tr[data-row-key='f1'] .${s.rot}`).textContent).toContain("2 unter Soll");
    expect(query(`tr[data-row-key='f2'] .${s.gelb}`).textContent).toContain("1 läuft ab");
    expect(query(`tr[data-row-key='f2'] .${s.ok}`).textContent).toContain("auf Soll");
    // Der Verfallschip sitzt in Spalte 4, der Statuschip in Spalte 5.
    expect(query(`tr[data-row-key='f2'] td:nth-child(5) .${s.gelb}`).textContent)
      .toContain("1 läuft ab");
    expect(query(`tr[data-row-key='f3'] td:nth-child(6) .${s.grau}`).textContent)
      .toContain("inaktiv");
    expect(query("tr[data-row-key='f4']").textContent).toContain("noch nie geprüft");
  });

  /**
   * ⚠️ VIER LAGEN, VIER TOENE — UND ZWEI DAVON SAHEN VORHER GLEICH AUS (DRK-298).
   *
   * Bis hierher trug die Spalte EINE Zahl (rot und gelb addiert) und IMMER
   * einen gelben Chip. Ein Fahrzeug mit zwei abgelaufenen Artikeln war von
   * einem, bei dem in drei Monaten etwas faellig wird, nicht zu unterscheiden —
   * auf der Flaeche, auf die man zuerst schaut. Rot traegt in diesem Modul
   * fachliche Bedeutung; hier fehlte sie.
   *
   * Der zweite, stillere Fall ist f4: ohne jede gepflegte Angabe stand dort
   * dasselbe „—" wie bei f1, das geprueft und sauber ist. Die Ansicht
   * behauptete Entwarnung, wo sie nur keine Daten hatte.
   */
  it("zeigt abgelaufen rot, warnend gelb, sauber grün und ungepflegt grau", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    const verfallSpalte = (id: string) =>
      query(`tr[data-row-key='${id}'] td:nth-child(5)`);

    // f3 traegt BEIDES — und dann beide Chips, jeder in seinem eigenen Ton.
    // Ein einziger Chip muesste sich fuer einen Ton entscheiden und wuerde die
    // andere Haelfte verschweigen.
    expect(query(`tr[data-row-key='f3'] td:nth-child(5) .${s.rot}`).textContent)
      .toContain("2 abgelaufen");
    expect(query(`tr[data-row-key='f3'] td:nth-child(5) .${s.gelb}`).textContent)
      .toContain("1 läuft ab");

    // f2 nur warnend — KEIN roter Chip.
    expect(verfallSpalte("f2").querySelector(`.${s.rot}`)).toBeNull();
    expect(query(`tr[data-row-key='f2'] td:nth-child(5) .${s.gelb}`).textContent)
      .toContain("1 läuft ab");

    // f1 gepflegt und unauffaellig, f4 ueberhaupt nicht gepflegt.
    expect(query(`tr[data-row-key='f1'] td:nth-child(5) .${s.ok}`).textContent)
      .toContain("im grünen Bereich");
    expect(query(`tr[data-row-key='f4'] td:nth-child(5) .${s.grau}`).textContent)
      .toContain("0 von 1 erfasst");
  });

  /**
   * ⚠️ DER REVIEWBEFUND ZU DRK-298, UND DER HAEUFIGSTE FALL VON ALLEN.
   *
   * Der Check gibt das Verfallsdatum AUSDRUECKLICH FREIWILLIG ab („nur aendern,
   * wenn auf der Packung ein anderes Datum steht", `CheckFlow.tsx`) — ein halb
   * gepflegtes Fahrzeug ist also der Normalfall. Wer aus EINER vorhandenen
   * Angabe auf „gepflegt" schliesst, stellt einem Fahrzeug mit acht
   * Soll-Artikeln und einer gruenen Angabe eine Entwarnung aus.
   *
   * Der dritte Fall darunter ist das Fahrzeug OHNE Soll: es hat nichts zu
   * erfassen, und „null von null" waere rechnerisch vollstaendig und fachlich
   * eine Aussage ueber nichts.
   */
  it("gibt keine Entwarnung, solange nicht jeder Soll-Artikel angesehen ist", async () => {
    await mount(
      <FahrzeugeListe
        zeilen={[
          { ...ZEILEN[0], id: "halb", name: "Halb gepflegt",
            verfallErfasst: 1, verfallSollArtikel: 8 },
          { ...ZEILEN[0], id: "ganz", name: "Ganz gepflegt",
            verfallErfasst: 8, verfallSollArtikel: 8 },
          { ...ZEILEN[0], id: "ohneSoll", name: "Ohne Soll",
            verfallErfasst: 0, verfallSollArtikel: 0 },
        ]}
      />,
    );

    expect(query(`tr[data-row-key='halb'] td:nth-child(5) .${s.grau}`).textContent)
      .toContain("1 von 8 erfasst");
    expect(query(`tr[data-row-key='halb'] td:nth-child(5)`).querySelector(`.${s.ok}`))
      .toBeNull();
    expect(query(`tr[data-row-key='ganz'] td:nth-child(5) .${s.ok}`).textContent)
      .toContain("im grünen Bereich");
    // Ohne Soll: kein Chip, nur der Gedankenstrich.
    expect(query("tr[data-row-key='ohneSoll'] td:nth-child(5)").textContent).toBe("—");
  });

  /**
   * ⚠️ DIE QUOTE VERSCHWINDET NICHT, SOBALD ETWAS AUFFAELLIG IST (zweiter
   * Reviewbefund zu DRK-298) — und das ist dieselbe stille Luecke wie die
   * erste, nur eine Ebene tiefer.
   *
   * Ein Fahrzeug mit EINEM abgelaufenen und SIEBEN nie angesehenen Artikeln
   * meldete „1 abgelaufen" und sonst nichts. Wer danach handelt, tauscht einen
   * Artikel und haelt das Fahrzeug fuer erledigt — waehrend sieben weitere
   * ungeprueft sind. Die auffaelligen Zahlen und die Erfassung beantworten
   * verschiedene Fragen („was ist faellig?" und „wovon wissen wir es
   * ueberhaupt?"); die eine darf die andere nicht verdecken.
   */
  it("zeigt die Erfassungslücke AUCH neben einer Warnung", async () => {
    await mount(
      <FahrzeugeListe
        zeilen={[
          { ...ZEILEN[0], id: "luecke", name: "Lücke trotz Fund",
            verfallAbgelaufen: 1, verfallWarnend: 0,
            verfallErfasst: 1, verfallSollArtikel: 8 },
        ]}
      />,
    );

    const spalte = query("tr[data-row-key='luecke'] td:nth-child(5)");
    expect(spalte.querySelector(`.${s.rot}`)!.textContent).toContain("1 abgelaufen");
    expect(spalte.querySelector(`.${s.grau}`)!.textContent).toContain("1 von 8 erfasst");
  });

  /** Gegenprobe: vollstaendig erfasst heisst KEIN grauer Chip daneben. */
  it("hängt keine Quote an ein vollständig erfasstes Fahrzeug", async () => {
    await mount(
      <FahrzeugeListe
        zeilen={[
          { ...ZEILEN[0], id: "ganz", name: "Ganz erfasst",
            verfallAbgelaufen: 1, verfallWarnend: 0,
            verfallErfasst: 8, verfallSollArtikel: 8 },
        ]}
      />,
    );

    const spalte = query("tr[data-row-key='ganz'] td:nth-child(5)");
    expect(spalte.querySelector(`.${s.rot}`)!.textContent).toContain("1 abgelaufen");
    expect(spalte.querySelector(`.${s.grau}`)).toBeNull();
  });

  /**
   * ⚠️ DIE SPALTE ORDNET NACH DRINGLICHKEIT, NICHT NACH SUMME.
   *
   * f3 hat 2 abgelaufene und 1 warnende Meldung, f2 nur 1 warnende. Sortiert
   * man ueber die Summe, steht f3 vor f2 — hier zufaellig richtig. Der Beleg
   * ist f2 gegen ein gedachtes Fahrzeug mit fuenf warnenden Meldungen: Summe
   * hiesse „fuenf gelbe vor einer abgelaufenen", und genau das ist die falsche
   * Reihenfolge fuer jemanden, der eine Austauschtour plant. Deshalb zaehlt
   * erst `abgelaufen`, dann `warnend`.
   */
  it("sortiert Verfall nach Dringlichkeit: abgelaufen schlägt Menge", async () => {
    await mount(
      <FahrzeugeListe
        zeilen={[
          { ...ZEILEN[1], id: "viel", name: "Viel Gelb",
            verfallAbgelaufen: 0, verfallWarnend: 5 },
          { ...ZEILEN[1], id: "eins", name: "Eins Rot",
            verfallAbgelaufen: 1, verfallWarnend: 0 },
        ]}
      />,
    );

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Verfall"))!;
    await clickElement(kopf.querySelector<HTMLElement>(".ant-table-column-sorters")!);
    // Aufsteigend: das unauffaelligere Fahrzeug zuerst.
    expect(zeilenIds()).toEqual(["viel", "eins"]);
  });

  /**
   * Die Zusicherung stand bis zur Umstellung auf `@/core/tabelle` im
   * QUELLTEXT (`pagination={false}`, `scroll={{ x: "max-content" }}`). Beides
   * ist jetzt Vorgabe der `Datentabelle` und steht in dieser Datei gar nicht
   * mehr — geprueft wird deshalb die WIRKUNG am DOM, die dieselbe ist.
   */
  it("verriegelt Pagination und den horizontalen Scrollvertrag", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    expect(exists(".ant-pagination")).toBe(false);
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
  });
});

describe("FahrzeugeListe — Suche, Filter und Reset", () => {
  it("sucht nur über Name und Kennung", () => {
    expect(sucheTrifft(ZEILEN[0], "rtw nord")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "UE-RK")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "Standard-RTW")).toBe(false);
    expect(sucheTrifft(ZEILEN[2], "UE-RK")).toBe(false);
  });

  /**
   * Die drei Haken „unter Soll", „läuft ab" und „inaktive ausblenden" standen
   * bis zur Umstellung als Checkbox-Leiste ueber der Tabelle. Sie sind
   * Spaltenfilter geworden — dieselben Praedikate, nur dort, wo ihre Wirkung
   * sichtbar ist. Die Bestueckungszustaende an der Bestueckungsspalte,
   * aktiv/inaktiv an der Statusspalte; warum getrennt, sagt der Test darunter.
   */
  it("filtert die Bestückung über den Spaltenkopf, mehrere Haken verodern sich", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(exists(".ant-checkbox-wrapper")).toBe(false);

    await spaltenFilter("Bestückung", "unter Soll");
    expect(zeilenIds()).toEqual(["f1", "f3"]);

    // „auf Soll" kommt HINZU — der Haken von eben steht noch, und INNERHALB
    // einer Spalte verodert antd. Zwischen Spalten schneidet es; dafuer steht
    // der Test „schneidet „unter Soll" und „laeuft ab"" weiter unten.
    await spaltenFilter("Bestückung", "auf Soll");
    expect(zeilenIds()).toEqual(["f1", "f2", "f3", "f4"]);

    await spaltenFilter("Bestückung");
    expect(zeilenIds()).toEqual(["f1", "f2", "f3", "f4"]);
  });

  /**
   * ⚠️ DER ALTE HAKEN WAR EIN AUSSCHLUSS, EIN SPALTENFILTER IST EIN EINSCHLUSS.
   * „inaktive ausblenden" heisst als Filter „aktiv", nicht „inaktiv" — ohne das
   * Gegenstueck waere der alte Vorgang gar nicht mehr anklickbar. Genau diese
   * Umkehrung hatte die Artikeltabelle (DRK-331, zweite Reviewrunde); hier
   * stand sie noch.
   */
  it("macht „inaktive ausblenden“ wieder ausdrückbar", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    await spaltenFilter("Status", "aktiv");
    expect(zeilenIds()).toEqual(["f1", "f2", "f4"]);

    await spaltenFilter("Status", "inaktiv");
    expect(zeilenIds()).toEqual(["f1", "f2", "f3", "f4"]);
  });

  /**
   * ⚠️ DER GRUND FUER DREI SPALTEN STATT EINER. antd VERODERT innerhalb einer
   * Spalte und VERUNDET zwischen Spalten. Lagen „aktiv" und „unter Soll" auf
   * derselben Spalte, ergaebe diese Auswahl f1, f2, f3 UND f4 — mit den alten,
   * unabhaengigen Haken war es f1. Der Test faellt, sobald jemand die Gruppen
   * „der Einheitlichkeit halber" wieder zusammenlegt.
   */
  it("verundet Status und Bestückung über die Spaltengrenze", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    await spaltenFilter("Status", "aktiv");
    await spaltenFilter("Bestückung", "unter Soll");
    expect(zeilenIds()).toEqual(["f1"]);
  });

  /**
   * ⚠️ DIE DRITTE DIMENSION, UND SIE HAT DEN TEST ERST NOETIG GEMACHT.
   *
   * Die alten Haken „unter Soll" und „laeuft ab" wirkten NACHEINANDER, schnitten
   * sich also: angekreuzt zeigten sie Fahrzeuge, auf die BEIDES zutrifft. Auf
   * einer gemeinsamen Spalte verodert antd sie, und dieser Vorgang war nicht
   * mehr ausdrueckbar (DRK-331, sechste Reviewrunde). „laeuft ab" hat deshalb
   * eine eigene Spalte bekommen.
   *
   * f3 ist der Beleg: es trifft beides. f1 nur „unter Soll", f2 nur „laeuft ab"
   * — mit einer VERODERUNG stuenden alle drei da.
   */
  it("schneidet „unter Soll“ und „läuft ab“, statt sie zu verodern", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    await spaltenFilter("Bestückung", "unter Soll");
    expect(zeilenIds()).toEqual(["f1", "f3"]);

    await spaltenFilter("Verfall", "läuft ab");
    expect(zeilenIds()).toEqual(["f3"]);
  });

  /**
   * ⚠️ VIER ZUSTAENDE, UND JEDER BRAUCHT SEIN GEGENSTUECK (DRK-298).
   *
   * Die Spalte kannte „läuft ab" und „nichts läuft ab". Beide Haelften
   * zerfallen jetzt: „abgelaufen" ist nicht „läuft ab", und „nichts erfasst"
   * ist nicht „nichts fällig". Ohne alle vier waere je ein Vorgang nicht mehr
   * anklickbar — dieselbe Umkehrung, die „inaktive ausblenden" gebraucht hat.
   *
   * ⚠️ „abgelaufen" UND „läuft ab" VERODERN SICH, weil sie auf DERSELBEN Spalte
   * liegen (`zustandsFilter`). Das ist hier richtig: f3 traegt beides und darf
   * nicht dadurch verschwinden, dass man beide Haken setzt.
   */
  /**
   * DRK-309 — die Art ist sichtbar, filterbar und suchbar, und der
   * Zwischenstand ist alle drei ebenfalls.
   *
   * ⚠️ „nicht zugeordnet" IST DER EIGENTLICHE FALL. Fahrzeug und Tasche findet
   * man auch ueber die Suche; die ueber die ganze Liste verstreuten Einheiten
   * OHNE Zuordnung findet man sonst gar nicht — und genau die braucht, wer den
   * Zwischenstand aus Migration 0010 abarbeitet.
   */
  it("zeigt die Art als Chip und macht auch den Zwischenstand anwählbar", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    const artSpalte = (id: string) => query(`tr[data-row-key='${id}'] td:nth-child(2)`);
    expect(artSpalte("f1").textContent).toBe("Fahrzeug");
    expect(artSpalte("f4").textContent).toBe("Tasche");
    expect(artSpalte("f2").textContent).toBe("nicht zugeordnet");

    await spaltenFilter("Art", "Tasche");
    expect(zeilenIds()).toEqual(["f4"]);

    await spaltenFilter("Art");
    await spaltenFilter("Art", "nicht zugeordnet");
    expect(zeilenIds()).toEqual(["f2"]);

    await spaltenFilter("Art");
    // Veroderung INNERHALB der Spalte, wie ueberall sonst auch.
    await spaltenFilter("Art", "Fahrzeug", "Tasche");
    expect(zeilenIds()).toEqual(["f1", "f3", "f4"]);
  });

  /**
   * ⚠️ DER GRAUE CHIP DES ZWISCHENSTANDS TRAEGT KEIN ZEICHEN, und das ist
   * Absicht: es gibt kein Bild fuer „weiss ich noch nicht". Ein geliehenes
   * (etwa ein Fragezeichen oder das Warnzeichen) laese sich als Fehler, nicht
   * als offene Angabe — und Gelb daneben in der Verfallsspalte traegt in
   * diesem Modul fachliche Bedeutung (Falle 3).
   */
  it("faerbt den Zwischenstand grau und nicht warnend", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    const offen = query("tr[data-row-key='f2'] td:nth-child(2)");
    expect(offen.querySelector(`.${s.grau}`)).not.toBeNull();
    expect(offen.querySelector(`.${s.gelb}`)).toBeNull();
    expect(offen.querySelector(`.${s.rot}`)).toBeNull();
    expect(offen.querySelector("[data-zeichen]")).toBeNull();

    expect(query("tr[data-row-key='f4'] td:nth-child(2) [data-zeichen]")
      .getAttribute("data-zeichen")).toBe("tasche");
    expect(query("tr[data-row-key='f1'] td:nth-child(2) [data-zeichen]")
      .getAttribute("data-zeichen")).toBe("fahrzeug");
  });

  it("macht alle vier Verfallslagen einzeln anwählbar", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    await spaltenFilter("Verfall", "abgelaufen");
    expect(zeilenIds()).toEqual(["f3"]);

    // f2 kommt HINZU (Veroderung innerhalb der Spalte) — f3 bleibt, obwohl es
    // beide Zustaende erfuellt.
    await spaltenFilter("Verfall", "läuft ab");
    expect(zeilenIds()).toEqual(["f2", "f3"]);

    await spaltenFilter("Verfall");
    // ⚠️ „nicht vollstaendig erfasst" UND NICHT „nichts erfasst": der stillere
    // Fall ist das halb gepflegte Fahrzeug, und ein Filter nur auf den
    // Nullfall fande genau die nicht.
    await spaltenFilter("Verfall", "nicht vollständig erfasst");
    expect(zeilenIds()).toEqual(["f4"]);

    await spaltenFilter("Verfall");
    // Derselbe Text wie im Chip der Spalte — zwei Namen fuer einen Zustand
    // lassen den Leser einen dritten vermuten.
    await spaltenFilter("Verfall", "im grünen Bereich");
    // NUR f1 — f4 ist NICHT „im grünen Bereich", sondern unangesehen. Faellt dieser
    // Test, hat jemand die beiden Leerfaelle wieder zusammengelegt und die
    // Ansicht behauptet Entwarnung fuer ein nie gepflegtes Fahrzeug.
    expect(zeilenIds()).toEqual(["f1"]);
  });

  it("nennt bei leerem Spaltenfilter den Filter-Leertext, nicht den Anlegehinweis", async () => {
    await mount(<FahrzeugeListe zeilen={[ZEILEN[3]]} />);

    await spaltenFilter("Bestückung", "unter Soll");
    expect(zeilenIds()).toEqual([]);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Keine Einheit passt zu Suche und Filter.");
  });

  /**
   * ⚠️ DER BEWEIS, DASS NICHT UEBER DEN ANZEIGETEXT SORTIERT WIRD.
   * „01.08.2026" steht als Zeichenkette VOR „30.07.2026"; nur ueber
   * `letzterCheckIso` ordnet der 30. Juli vor den 1. August. Fahrzeuge ohne
   * Check tragen `null` und stehen aufsteigend hinten.
   */
  it("sortiert die Spalte Zuletzt geprüft über den ISO-Stempel, nicht über den Text", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Zuletzt geprüft"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);

    expect(zeilenIds()).toEqual(["f1", "f3", "f2", "f4"]);
  });

  it("zeigt die Trefferzahl und den gefilterten Leertext erst bei aktiver Suche", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(queryAll(`.${s.filtertreffer}`)).toHaveLength(0);

    await suchen("keines");
    expect(zeilenIds()).toEqual([]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 4");
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Keine Einheit passt zu Suche und Filter.");
  });

  /**
   * ⚠️ DIE TREFFERANZEIGE ZAEHLT DIE SPALTENFILTER MIT. Zaehlte sie nur die
   * Suche, stuende neben einer Tabelle mit zwei Zeilen „4 von 4" — eine Zahl,
   * die zu keinem Bild auf dem Schirm gehoert. Der zweite Teil ist der
   * eigentliche Beweis: nach der Suche feuert antds `onChange` NICHT (Falle
   * 15), die Zahl muss trotzdem stimmen — sie ist aus dem Zustand ABGELEITET,
   * nicht aus `extra.currentDataSource` gemerkt.
   */
  it("zählt Spaltenfilter mit, auch wenn sich danach nur die Suche ändert", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    await spaltenFilter("Bestückung", "unter Soll");
    expect(zeilenIds()).toEqual(["f1", "f3"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("2 von 4");

    await suchen("RTW");
    expect(zeilenIds()).toEqual(["f1"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 4");
  });

  it("zeigt ohne Daten den ungefilterten Anlegehinweis", async () => {
    await mount(<FahrzeugeListe zeilen={[]} />);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Noch keine Fahrzeuge und Taschen. Lege oben die erste Einheit an.");
  });
});

describe("NeuFahrzeug", () => {
  it("bindet beide Felder direkt, sendet den exakten Payload und schließt nur bei Erfolg", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
    expect(queryPortal(".ant-form-item-control-input-content > input[aria-label='Name']"))
      .toBeTruthy();
    expect(queryPortal(".ant-form-item-control-input-content > input[aria-label='Kennung']"))
      .toBeTruthy();
    await portalArtWaehlen("Fahrzeug");
    await portalFuellen("Name", " RTW Neu ");
    await portalFuellen("Kennung", " UE-RK 130 ");
    await portalAbsenden();

    // ⚠️ DIE ART REIST MIT, UNGETRIMMT WIE DIE ANDEREN FELDER — die Action
    // trimmt, nicht der Dialog (DRK-309).
    expect(mocks.createFahrzeug).toHaveBeenCalledWith({
      name: " RTW Neu ",
      kennung: " UE-RK 130 ",
      einheitenart: "fahrzeug",
    });
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossenes Fahrzeug-Modal",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("bindet Feldfehler, zeigt den allgemeinen Fehler und behält Modal sowie Werte", async () => {
    mocks.createFahrzeug.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: {
        name: "Name darf nicht leer sein",
        phantom: "Unsichtbar",
      },
    });
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
    await portalArtWaehlen("Tasche");
    await portalFuellen("Name", " X ");
    await portalFuellen("Kennung", " ALT ");
    await portalAbsenden();

    await warteAuf(
      () => document.body.querySelector(".ant-form-item-explain-error") !== null,
      "Feldfehler am Namen",
    );
    expect(queryPortal(".ant-form-item-explain-error").textContent)
      .toBe("Name darf nicht leer sein");
    expect(queryPortal(".ant-modal .ant-alert-warning").textContent)
      .toContain("Bitte die markierten Felder prüfen.");
    expect(document.body.textContent).not.toContain("Unsichtbar");
    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Name']").value).toBe(" X ");
    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Kennung']").value)
      .toBe(" ALT ");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "Einheit fachlich abgelehnt." })],
    ["Reject", async () => { throw new Error("SQLITE intern und geheim"); }],
  ])("bleibt bei %s offen und zeigt einen festen Warning-Text", async (_fall, antwort) => {
    mocks.createFahrzeug.mockImplementationOnce(antwort);
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
    await portalArtWaehlen("Fahrzeug");
    await portalFuellen("Name", "Bleibt");
    await portalAbsenden();

    await warteAuf(
      () => document.body.querySelector(".ant-modal .ant-alert-warning") !== null,
      "allgemeine Einheitenwarnung",
    );
    const text = queryPortal(".ant-modal .ant-alert-warning").textContent ?? "";
    expect(text).toContain(
      _fall === "ok:false" ? "Einheit fachlich abgelehnt." : "Einheit konnte nicht angelegt werden.",
    );
    expect(text).not.toContain("SQLITE intern und geheim");
    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Name']").value)
      .toBe("Bleibt");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  /**
   * DRK-309 — „neue Objekte muessen kategorisiert werden", im Dialog.
   *
   * ⚠️ DIE HARTE ZUSICHERUNG STEHT AN DER ACTION (`_actions/fahrzeuge.test.ts`),
   * nicht hier: die Spalte ist nullable, der Riegel ist der Eingangsvalidator.
   * Diese Zusicherung ist die zweite Haelfte und beantwortet eine andere Frage
   * — kommt die Ablehnung AM FELD an, bevor jemand auf eine Serverantwort
   * wartet? Ohne sie waere „Pflichtfeld" eine Aussage ueber eine Fehlermeldung
   * statt ueber ein Formular.
   */
  it("sendet OHNE gewaehlte Art gar nicht erst ab", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
    await portalFuellen("Name", "Ohne Art");
    await portalAbsenden();

    await warteAuf(
      () => document.body.querySelector(".ant-form-item-explain-error") !== null,
      "Feldfehler an der Art",
    );
    expect(queryPortal(".ant-form-item-explain-error").textContent)
      .toBe("Fahrzeug oder Tasche wählen");
    expect(mocks.createFahrzeug).not.toHaveBeenCalled();
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("verriegelt zwei Absendeereignisse synchron bis zur Antwort", async () => {
    let fertig!: (wert: { ok: true; wert: { id: string } }) => void;
    mocks.createFahrzeug.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
    await portalArtWaehlen("Fahrzeug");
    await portalFuellen("Name", "Einmal");
    const form = queryPortal<HTMLFormElement>(".ant-modal form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();

    expect(mocks.createFahrzeug).toHaveBeenCalledTimes(1);
    await act(async () => { fertig({ ok: true, wert: { id: "fahrzeug-neu" } }); });
    await warte();
  });
});

describe("sucheTrifft — DRK-309: die Art ist mitdurchsuchbar", () => {
  /**
   * ⚠️ WEIL DIE ART IM NAMEN FEHLEN DARF. Solange jede Einheit ein Fahrzeug
   * war, trug der Name sie mit („RTW 1", „MTW 1") und „tasche" zu tippen war
   * sinnlos. Eine „Sanitätstasche 1" heisst so, ein „Rucksack Betreuung"
   * nicht — und wer „tasche" sucht, meint die Art, nicht die Schreibweise.
   */
  const zeile = (art: "fahrzeug" | "tasche" | null): FahrzeugAnzeigeZeile =>
    ({ ...ZEILEN[0], name: "Rucksack Betreuung", kennung: null, einheitenart: art });

  it("findet eine Tasche ueber ihre Art, auch ohne das Wort im Namen", () => {
    expect(sucheTrifft(zeile("tasche"), "tasche")).toBe(true);
    expect(sucheTrifft(zeile("fahrzeug"), "tasche")).toBe(false);
  });

  it("findet den Zwischenstand ueber sein Wort", () => {
    expect(sucheTrifft(zeile(null), "nicht zugeordnet")).toBe(true);
    expect(sucheTrifft(zeile("tasche"), "nicht zugeordnet")).toBe(false);
  });
});

describe("Fahrzeugseite als RSC", () => {
  it("formatiert den letzten Check in Europe/Berlin und gibt kein Date an die Insel", async () => {
    const { fahrzeugAnzeigeZeile } = await import("./page");
    const zeile = fahrzeugAnzeigeZeile({
      id: "tz",
      name: "Zeitzonen-RTW",
      kennung: null,
      aktiv: true,
      einheitenart: "fahrzeug",
      templateName: null,
      positionen: 0,
      faecher: 0,
      artikelUnterSoll: 0,
      verfallAbgelaufen: 0,
      verfallWarnend: 0,
      verfallErfasst: 1,
      verfallSollArtikel: 1,
      letzterCheck: new Date("2026-07-30T23:30:00Z"),
    });
    expect(zeile.letzterCheckText).toBe("31.07.2026, 01:30");
    expect(istRekursivJsonSicher(zeile)).toBe(true);
    expect((Object.values(zeile) as unknown[]).some((wert) => wert instanceof Date))
      .toBe(false);
  });

  it("liest die reale Übersicht und reicht rekursiv primitive DTOs an die Client-Insel", async () => {
    const { dynamic, fahrzeugeSeitenInhalt } = await import("./page");
    const testDb = migrierteTestDb("lagerbuch-fahrzeug-liste-");
    const jetzt = new Date("2026-08-07T12:00:00Z");
    try {
      testDb.db.insert(lagerorte).values({
        id: "rsc-fahrzeug",
        name: "RSC RTW",
        typ: "fahrzeug",
        kennung: "UE-RK 131",
        aktiv: true,
      }).run();
      testDb.db.insert(checks).values({
        id: "check-rsc",
        fahrzeugId: "rsc-fahrzeug",
        quelleTyp: "system",
        quelleId: "test",
        startedAt: new Date("2026-08-06T22:30:00Z"),
        completedAt: new Date("2026-08-06T22:30:00Z"),
        ergebnis: null,
      }).run();

      const inhalt = fahrzeugeSeitenInhalt(testDb.db, jetzt);
      const [liste] = elementeVomTyp(inhalt, FahrzeugeListe);
      const props = liste.props as { zeilen: FahrzeugAnzeigeZeile[] };
      expect(props.zeilen).toEqual([expect.objectContaining({
        id: "rsc-fahrzeug",
        name: "RSC RTW",
        letzterCheckText: "07.08.2026, 00:30",
      })]);
      expect(istRekursivJsonSicher(props)).toBe(true);
      expect(dynamic).toBe("force-dynamic");
    } finally {
      testDb.schliessen();
    }
  });
});
