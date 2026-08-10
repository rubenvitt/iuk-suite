// @vitest-environment jsdom

import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { readFileSync } from "node:fs";
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

function checkboxMitText(text: string): HTMLElement {
  const treffer = queryAll<HTMLElement>(".ant-checkbox-wrapper")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Checkbox nicht gefunden: ${text}`);
  return treffer;
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

  it("verriegelt Pagination und den horizontalen Scrollvertrag", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/FahrzeugeListe.tsx",
      "utf8",
    );
    expect(quelle).toContain("pagination={false}");
    expect(quelle).toContain('scroll={{ x: "max-content" }}');
  });
});

describe("FahrzeugeListe — Suche, Filter und Reset", () => {
  it("sucht nur über Name und Kennung", () => {
    expect(sucheTrifft(ZEILEN[0], "rtw nord")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "UE-RK")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "Standard-RTW")).toBe(false);
    expect(sucheTrifft(ZEILEN[2], "UE-RK")).toBe(false);
  });

  it("wendet alle drei Checkboxen gemeinsam an und setzt wirklich alles zurück", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);

    await clickElement(checkboxMitText("unter Soll"));
    expect(zeilenIds()).toEqual(["f1", "f3"]);
    await clickElement(checkboxMitText("läuft ab"));
    expect(zeilenIds()).toEqual(["f3"]);
    await clickElement(checkboxMitText("inaktive ausblenden"));
    expect(zeilenIds()).toEqual([]);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Kein Fahrzeug passt zu Suche und Filter.");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 4");

    await clickElement(knopfMitText("Zurücksetzen"));
    expect(zeilenIds()).toEqual(["f1", "f2", "f3", "f4"]);
    expect(queryAll("button").some((button) => button.textContent?.includes("Zurücksetzen")))
      .toBe(false);
  });

  it("zeigt die Trefferzahl und den gefilterten Leertext erst bei aktiver Suche", async () => {
    await mount(<FahrzeugeListe zeilen={ZEILEN} />);
    expect(queryAll(`.${s.filtertreffer}`)).toHaveLength(0);

    await fill("input[type='search']", "keines");
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
