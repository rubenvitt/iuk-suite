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
    templateName: "Standard-RTW",
    positionen: 12,
    faecher: 3,
    artikelUnterSoll: 2,
    verfallAuffaellig: 0,
    letzterCheckText: "30.07.2026, 10:00",
    letzterCheckIso: "2026-07-30T08:00:00.000Z",
  },
  {
    id: "f2",
    name: "RTW Süd",
    kennung: "UE-RK 5678",
    aktiv: true,
    templateName: null,
    positionen: 4,
    faecher: 2,
    artikelUnterSoll: 0,
    verfallAuffaellig: 1,
    letzterCheckText: null,
    letzterCheckIso: null,
  },
  {
    id: "f3",
    name: "Reserve MTW",
    kennung: null,
    aktiv: false,
    templateName: "Reserve",
    positionen: 2,
    faecher: 1,
    artikelUnterSoll: 1,
    verfallAuffaellig: 2,
    letzterCheckText: "01.08.2026, 09:15",
    letzterCheckIso: "2026-08-01T07:15:00.000Z",
  },
  {
    id: "f4",
    name: "ELW",
    kennung: "UE-RK 9999",
    aktiv: true,
    templateName: null,
    positionen: 1,
    faecher: 1,
    artikelUnterSoll: 0,
    verfallAuffaellig: 0,
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
  await clickElement(knopfMitText("Neues Fahrzeug"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Fahrzeug-Modal",
  );
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
  it("trägt die fünf abgelesenen Spalten, stabile Zeilen und den äußeren Detail-Link", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Fahrzeug",
      "Vorlage",
      "Bestückung",
      "Status",
      "Zuletzt geprüft",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Fahrzeuge");
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
    expect(query(`tr[data-row-key='f3'] td:nth-child(4) .${s.grau}`).textContent)
      .toContain("inaktiv");
    expect(query("tr[data-row-key='f4']").textContent).toContain("noch nie geprüft");
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
   * Spaltenfilter der Statusspalte geworden — dieselben Praedikate, nur dort,
   * wo ihre Wirkung sichtbar ist.
   */
  it("filtert den Status über den Spaltenkopf, mehrere Haken verodern sich", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(exists(".ant-checkbox-wrapper")).toBe(false);

    await spaltenFilter("Status", "unter Soll");
    expect(zeilenIds()).toEqual(["f1", "f3"]);

    // „läuft ab" kommt HINZU — der Haken von eben steht noch.
    await spaltenFilter("Status", "läuft ab");
    expect(zeilenIds()).toEqual(["f1", "f2", "f3"]);

    await spaltenFilter("Status");
    expect(zeilenIds()).toEqual(["f1", "f2", "f3", "f4"]);
  });

  it("nennt bei leerem Spaltenfilter den Filter-Leertext, nicht den Anlegehinweis", async () => {
    await mount(<FahrzeugeListe zeilen={[ZEILEN[3]]} />);

    await spaltenFilter("Status", "unter Soll");
    expect(zeilenIds()).toEqual([]);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Kein Fahrzeug passt zu Suche und Filter.");
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
      .toBe("Kein Fahrzeug passt zu Suche und Filter.");
  });

  it("zeigt ohne Daten den ungefilterten Anlegehinweis", async () => {
    await mount(<FahrzeugeListe zeilen={[]} />);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Noch keine Fahrzeuge. Lege oben das erste an.");
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
    await portalFuellen("Name", " RTW Neu ");
    await portalFuellen("Kennung", " UE-RK 130 ");
    await portalAbsenden();

    expect(mocks.createFahrzeug).toHaveBeenCalledWith({
      name: " RTW Neu ",
      kennung: " UE-RK 130 ",
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
    ["ok:false", async () => ({ ok: false as const, fehler: "Fahrzeug fachlich abgelehnt." })],
    ["Reject", async () => { throw new Error("SQLITE intern und geheim"); }],
  ])("bleibt bei %s offen und zeigt einen festen Warning-Text", async (_fall, antwort) => {
    mocks.createFahrzeug.mockImplementationOnce(antwort);
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
    await portalFuellen("Name", "Bleibt");
    await portalAbsenden();

    await warteAuf(
      () => document.body.querySelector(".ant-modal .ant-alert-warning") !== null,
      "allgemeine Fahrzeugwarnung",
    );
    const text = queryPortal(".ant-modal .ant-alert-warning").textContent ?? "";
    expect(text).toContain(
      _fall === "ok:false" ? "Fahrzeug fachlich abgelehnt." : "Fahrzeug konnte nicht angelegt werden.",
    );
    expect(text).not.toContain("SQLITE intern und geheim");
    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Name']").value)
      .toBe("Bleibt");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("verriegelt zwei Absendeereignisse synchron bis zur Antwort", async () => {
    let fertig!: (wert: { ok: true; wert: { id: string } }) => void;
    mocks.createFahrzeug.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    await modalOeffnen();
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

describe("Fahrzeugseite als RSC", () => {
  it("formatiert den letzten Check in Europe/Berlin und gibt kein Date an die Insel", async () => {
    const { fahrzeugAnzeigeZeile } = await import("./page");
    const zeile = fahrzeugAnzeigeZeile({
      id: "tz",
      name: "Zeitzonen-RTW",
      kennung: null,
      aktiv: true,
      templateName: null,
      positionen: 0,
      faecher: 0,
      artikelUnterSoll: 0,
      verfallAuffaellig: 0,
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
