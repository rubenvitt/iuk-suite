// @vitest-environment jsdom

import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
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
import { geraete, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import {
  GeraeteListe,
  sucheTrifft,
  type GeraetAnzeigeZeile,
} from "./GeraeteListe";
import { lagerortFilter, NeuGeraet } from "./NeuGeraet";
import { dynamic, geraeteSeitenInhalt } from "./page";

const mocks = vi.hoisted(() => ({
  geraetSpeichern: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/geraete", () => ({
  geraetSpeichern: (...args: unknown[]) => mocks.geraetSpeichern(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const ZEILEN: GeraetAnzeigeZeile[] = [
  {
    id: "med-faellig",
    typ: "medizin",
    name: "Corpuls C3",
    barcode: "SN-MED-1",
    lagerortName: "Handlager",
    aktiv: true,
    faelligkeitAmpel: "gelb",
    keinDatum: false,
    chip: { ton: "gelb", text: "MTK in 3 T" },
  },
  {
    id: "med-ohne-datum",
    typ: "medizin",
    name: "Defibrillator Reserve",
    barcode: null,
    lagerortName: "Lager Nord",
    aktiv: false,
    faelligkeitAmpel: "gruen",
    keinDatum: true,
    chip: { ton: "grau", text: "kein MTK-Datum" },
  },
  {
    id: "obj-faellig",
    typ: "objekt",
    name: "Notfallrucksack",
    barcode: "OBJ-ROT-7",
    lagerortName: "RTW 1",
    aktiv: true,
    faelligkeitAmpel: "rot",
    keinDatum: false,
    chip: { ton: "rot", text: "abgelaufen (2 T)" },
  },
  {
    id: "obj-ohne-datum",
    typ: "objekt",
    name: "Spineboard",
    barcode: null,
    lagerortName: "RTW 2",
    aktiv: false,
    faelligkeitAmpel: "gruen",
    keinDatum: true,
    chip: null,
  },
];

const LAGERORTE = [
  { id: "handlager", name: "Handlager", typ: "lager" as const },
  { id: "rtw-1", name: "RTW 1", typ: "fahrzeug" as const },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

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

function zeilenIds(): Array<string | null> {
  return queryAll("tbody tr[data-row-key]")
    .map((zeile) => zeile.getAttribute("data-row-key"));
}

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null) return true;
  if (["string", "number", "boolean"].includes(typeof wert)) return true;
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (typeof wert !== "object" || wert instanceof Date || isValidElement(wert)) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

function checkboxMitText(text: string, portal = false): HTMLElement {
  const wurzel = portal ? document.body : query(".ant-checkbox-group").parentElement;
  const checkbox = Array.from(wurzel?.querySelectorAll<HTMLElement>(".ant-checkbox-wrapper") ?? [])
    .find((element) => (element.textContent ?? "").includes(text));
  if (!checkbox) throw new Error(`Checkbox nicht gefunden: ${text}`);
  return checkbox;
}

function klassenCheckbox(text: string): HTMLElement {
  const checkbox = queryAll<HTMLElement>(".ant-checkbox-group .ant-checkbox-wrapper")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!checkbox) throw new Error(`Klassencheckbox nicht gefunden: ${text}`);
  return checkbox;
}

function knopfMitText(text: string, wurzel: ParentNode = document.body): HTMLElement {
  const knopf = Array.from(wurzel.querySelectorAll<HTMLElement>("button"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function oeffneDialog(): Promise<void> {
  await clickElement(knopfMitText("Neues Gerät"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Dialog für ein neues Gerät",
  );
}

async function fillPortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement | HTMLTextAreaElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${selector}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function standortAuswaehlen(text: string, suche?: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>("[aria-label='Standort']");
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  if (suche !== undefined) await fillPortal("[aria-label='Standort']", suche);
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-select-item-option",
  )).find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Standortoption nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function submitPortalForm(): Promise<void> {
  const form = queryPortal<HTMLFormElement>("[data-rolle='neues-geraet']");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function fuellPflichtfelder(): Promise<void> {
  await fillPortal("input[placeholder='z. B. Corpuls C3']", "Corpuls C3 neu");
  await standortAuswaehlen("RTW 1");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.geraetSpeichern.mockResolvedValue({ ok: true, wert: { id: "geraet-neu" } });
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
});

describe("GeraeteListe", () => {
  it("zeigt exakt fünf Spalten, Fachzeichen, Fälligkeitssemantik und äußere Links", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Gerät", "Klasse", "Standort", "Fälligkeit", "Status"]);
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/geraete/med-faellig']").textContent)
      .toBe("Corpuls C3");
    expect(query("tr[data-row-key='med-faellig']").textContent).toContain("SN-MED-1");
    expect(query("tr[data-row-key='med-ohne-datum']").textContent)
      .toContain("kein MTK-Datum");
    expect(query("tr[data-row-key='obj-ohne-datum']").textContent)
      .not.toContain("kein MTK-Datum");
    expect(query("tr[data-row-key='obj-faellig']").textContent).toContain("abgelaufen (2 T)");
    expect(query("tr[data-row-key='med-faellig'] [data-zeichen]")
      .getAttribute("data-zeichen")).toBe("medizin");
    expect(query("tr[data-row-key='obj-faellig'] [data-zeichen]")
      .getAttribute("data-zeichen")).toBe("objekt");
    expect(query("tr[data-row-key='obj-ohne-datum']").textContent).toContain("inaktiv");
  });

  it("sucht ausschließlich über Name, Barcode und Lagerort", () => {
    expect(sucheTrifft(ZEILEN[0], "corpuls")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "sn-med-1")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "handlager")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "MTK in 3 T")).toBe(false);
    expect(sucheTrifft(ZEILEN[0], "medizin")).toBe(false);
    expect(sucheTrifft(ZEILEN[0], "inaktiv")).toBe(false);
    expect(sucheTrifft(ZEILEN[0], "RTW 1")).toBe(false);
  });

  it("schaltet Medizin zuerst und danach beide Klassen ohne Doppeltoggle", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    expect(exists(".ant-checkbox-group")).toBe(true);
    expect(exists(".ant-segmented")).toBe(false);
    expect(exists(".ant-tag-checkable")).toBe(false);

    await clickElement(klassenCheckbox("Medizin"));
    expect(zeilenIds()).toEqual(["med-faellig", "med-ohne-datum"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("2 von 4");

    await clickElement(klassenCheckbox("Objekt"));
    expect(zeilenIds()).toEqual([
      "med-faellig", "med-ohne-datum", "obj-faellig", "obj-ohne-datum",
    ]);

    await clickElement(klassenCheckbox("Medizin"));
    expect(zeilenIds()).toEqual(["obj-faellig", "obj-ohne-datum"]);
  });

  it("schaltet Objekt zuerst und danach beide Klassen ohne Doppeltoggle", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    await clickElement(klassenCheckbox("Objekt"));
    expect(zeilenIds()).toEqual(["obj-faellig", "obj-ohne-datum"]);

    await clickElement(klassenCheckbox("Medizin"));
    expect(zeilenIds()).toEqual([
      "med-faellig", "med-ohne-datum", "obj-faellig", "obj-ohne-datum",
    ]);

    await clickElement(klassenCheckbox("Objekt"));
    expect(zeilenIds()).toEqual(["med-faellig", "med-ohne-datum"]);
  });

  it("kombiniert Suche, Klasse, Fälligkeit und ausgeblendete Inaktive", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    await clickElement(klassenCheckbox("Objekt"));
    await clickElement(checkboxMitText("nur fällige"));
    await clickElement(checkboxMitText("inaktive ausblenden"));
    await fill("input[type='search']", "rucksack");

    expect(zeilenIds()).toEqual(["obj-faellig"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 4");
  });

  it("setzt Suche, Klassen und beide Einzelschalter vollständig zurück", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    await fill("input[type='search']", "corpuls");
    await clickElement(klassenCheckbox("Medizin"));
    await clickElement(checkboxMitText("nur fällige"));
    await clickElement(checkboxMitText("inaktive ausblenden"));

    await clickElement(knopfMitText("Zurücksetzen", query(".ant-flex")));

    expect(query<HTMLInputElement>("input[type='search']").value).toBe("");
    expect(queryAll<HTMLInputElement>("input[type='checkbox']")
      .map((checkbox) => checkbox.checked)).toEqual([false, false, false, false]);
    expect(zeilenIds()).toEqual([
      "med-faellig", "med-ohne-datum", "obj-faellig", "obj-ohne-datum",
    ]);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    expect(queryAll("button").some((knopf) => knopf.textContent?.includes("Zurücksetzen")))
      .toBe(false);
  });

  it("unterscheidet ungefilterten und gefilterten Leertext samt X-von-Y", async () => {
    await mount(<GeraeteListe zeilen={[]} lagerorte={LAGERORTE} />);
    expect(document.body.textContent).toContain("Noch keine Geräte. Lege oben das erste an.");
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    await unmount();

    await mount(<GeraeteListe zeilen={[ZEILEN[3]]} lagerorte={LAGERORTE} />);
    await clickElement(checkboxMitText("nur fällige"));
    expect(zeilenIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Gerät passt zu Suche und Filter.");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 1");
  });

  it("setzt stabile und zugängliche Table-Props ohne interne Verwaltungs-URL", async () => {
    await mount(<GeraeteListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    expect(query("table").getAttribute("aria-label")).toBe("Geräte");
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.tsx",
      "utf8",
    );
    expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
    expect(quelle).toMatch(/rowKey=["']id["']/);
    expect(quelle).toMatch(/pagination=\{false\}/);
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/);
    expect(quelle).not.toContain("/m/lagerbuch/verwaltung");
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).toMatch(/options=\{\[/);
    expect(quelle).not.toMatch(/<Checkbox\.Group[^>]*\bonChange=/);
  });
});

describe("NeuGeraet", () => {
  it("ist ein echtes Form mit Radio-Typ, Pflichtfeldern und typabhängigen Controls", async () => {
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();

    expect(queryPortal(".ant-radio-group")).toBeDefined();
    expect(document.body.querySelectorAll(".ant-radio-group input[type='radio']")).toHaveLength(2);
    expect(queryPortal("input[placeholder='z. B. Corpuls C3']")).toBeDefined();
    expect(queryPortal("input[placeholder='Barcode / Seriennummer']")).toBeDefined();
    expect(queryPortal("input[role='combobox'][aria-label='Standort']")).toBeDefined();
    expect(queryPortal("input[aria-label='Nächste MTK']")).toBeDefined();
    expect(document.body.querySelector("textarea[aria-label='Beschreibung']")).toBeNull();
    expect(document.body.querySelector("input[aria-label='Ablaufdatum']")).toBeNull();
    expect(knopfMitText("Gerät anlegen")).toBeDefined();

    await clickElement(queryPortal(".ant-radio-group input[value='objekt']"));
    expect(document.body.querySelector("input[aria-label='Nächste MTK']")).toBeNull();
    expect(queryPortal("textarea[aria-label='Beschreibung']")).toBeDefined();
    expect(queryPortal("input[aria-label='Ablaufdatum']")).toBeDefined();
  });

  it("filtert Standortoptionen explizit über ihr sichtbares Label", async () => {
    expect(lagerortFilter("rtw 1", { value: "rtw-1", label: "RTW 1" })).toBe(true);
    expect(lagerortFilter("hand", { value: "rtw-1", label: "RTW 1" })).toBe(false);

    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await standortAuswaehlen("RTW 1", "rtw 1");
    expect(queryPortal("[aria-label='Standort']").closest(".ant-select")?.textContent)
      .toContain("RTW 1");
  });

  it("sendet für Medizin keine Objektfelder und schließt, leert und aktualisiert nur bei Erfolg", async () => {
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await fillPortal("input[placeholder='Barcode / Seriennummer']", " MED-NEU-1 ");
    await fillPortal("textarea[aria-label='Anmerkung']", " bereit ");
    await submitPortalForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Action-Aufruf");

    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      typ: "medizin",
      name: "Corpuls C3 neu",
      barcode: "MED-NEU-1",
      lagerortId: "rtw-1",
      anmerkung: "bereit",
      mtkFaellig: undefined,
    });
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossener Dialog",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await oeffneDialog();
    expect(queryPortal<HTMLInputElement>("input[placeholder='z. B. Corpuls C3']").value).toBe("");
    expect(queryPortal<HTMLInputElement>("input[placeholder='Barcode / Seriennummer']").value)
      .toBe("");
  });

  it("sendet für Objekt Beschreibung und kein MTK-Feld", async () => {
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await clickElement(queryPortal(".ant-radio-group input[value='objekt']"));
    await fuellPflichtfelder();
    await fillPortal("textarea[aria-label='Beschreibung']", " Spineboard mit Gurtspinne ");
    await submitPortalForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Objekt-Action-Aufruf");

    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      typ: "objekt",
      name: "Corpuls C3 neu",
      barcode: undefined,
      lagerortId: "rtw-1",
      anmerkung: undefined,
      beschreibung: "Spineboard mit Gurtspinne",
      ablaufdatum: undefined,
    });
  });

  it("bindet bekannte Feldfehler ans Feld, blendet unbekannte aus und erhält alle Werte", async () => {
    mocks.geraetSpeichern.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: {
        barcode: "Barcode bereits vergeben.",
        unbekannt: "Phantomfeld darf nicht erscheinen",
      },
    });
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await fillPortal("input[placeholder='Barcode / Seriennummer']", "DOPPELT");
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Barcode bereits vergeben."),
      "Barcode-Feldfehler",
    );
    expect(document.body.querySelector(".ant-alert-title")?.textContent)
      .toBe("Bitte die markierten Felder prüfen.");
    expect(document.body.textContent).not.toContain("Phantomfeld darf nicht erscheinen");
    expect(queryPortal<HTMLInputElement>("input[placeholder='Barcode / Seriennummer']").value)
      .toBe("DOPPELT");
    expect(queryPortal<HTMLInputElement>("input[placeholder='z. B. Corpuls C3']").value)
      .toBe("Corpuls C3 neu");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("zeigt Fachfehler über Alert title und behält den Dialogzustand", async () => {
    mocks.geraetSpeichern.mockResolvedValueOnce({
      ok: false,
      fehler: "Lagerort nicht gefunden oder inaktiv.",
    });
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await submitPortalForm();

    await warteAuf(
      () => document.body.querySelector(".ant-alert-title")?.textContent
        === "Lagerort nicht gefunden oder inaktiv.",
      "Fachfehler im Alert-Titel",
    );
    expect(queryPortal<HTMLInputElement>("input[placeholder='z. B. Corpuls C3']").value)
      .toBe("Corpuls C3 neu");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("zeigt bei verworfenem Promise nur den festen Alert-Titel und behält Werte", async () => {
    mocks.geraetSpeichern.mockRejectedValueOnce(new Error("internes Framework-Geheimnis"));
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await submitPortalForm();

    await warteAuf(
      () => document.body.querySelector(".ant-alert-title")?.textContent
        === "Gerät konnte nicht angelegt werden.",
      "fester Reject-Fehler im Alert-Titel",
    );
    expect(document.body.textContent).not.toContain("internes Framework-Geheimnis");
    expect(queryPortal<HTMLInputElement>("input[placeholder='z. B. Corpuls C3']").value)
      .toBe("Corpuls C3 neu");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("blockiert zwei synchrone Submits bereits vor dem ersten Resolve", async () => {
    let aufloesen: ((wert: { ok: true; wert: { id: string } }) => void) | undefined;
    mocks.geraetSpeichern.mockImplementationOnce(() => new Promise((fertig) => {
      aufloesen = fertig;
    }));
    await mount(<NeuGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();

    await submitPortalForm();
    await submitPortalForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length > 0, "erster Action-Aufruf");
    expect(mocks.geraetSpeichern).toHaveBeenCalledTimes(1);

    await act(async () => {
      aufloesen?.({ ok: true, wert: { id: "geraet-neu" } });
      await Promise.resolve();
    });
  });
});

describe("Geräte-Übersichtsseite als Server Component", () => {
  it("projiziert beide Klassen auf rekursiv primitive DTOs ohne DatumFaelligkeit", () => {
    const testDb = migrierteTestDb("lagerbuch-geraete-liste-seite-");
    try {
      testDb.db.insert(lagerorte).values({
        id: "rtw-t143",
        name: "RTW T143",
        typ: "fahrzeug",
        kennung: "UE-T143",
        aktiv: true,
      }).run();
      testDb.db.insert(geraete).values([
        {
          id: "db-med",
          typ: "medizin",
          name: "Corpuls DB",
          barcode: "DB-MED",
          lagerortId: "handlager",
          anmerkung: null,
          mtkFaellig: null,
          beschreibung: null,
          ablaufdatum: null,
          aktiv: true,
          createdAt: new Date("2026-08-01T08:00:00Z"),
        },
        {
          id: "db-obj",
          typ: "objekt",
          name: "Spineboard DB",
          barcode: null,
          lagerortId: "rtw-t143",
          anmerkung: null,
          mtkFaellig: null,
          beschreibung: "mit Gurten",
          ablaufdatum: "2026-08-05",
          aktiv: true,
          createdAt: new Date("2026-08-01T08:00:00Z"),
        },
      ]).run();

      const seite = geraeteSeitenInhalt(testDb.db, new Date("2026-08-07T10:00:00Z"));
      const kopf = elementeVomTyp(seite, SeitenKopf)[0];
      expect((kopf.props as { titel: string }).titel).toBe("Geräte");

      const liste = elementeVomTyp(seite, GeraeteListe)[0];
      const props = liste.props as {
        zeilen: GeraetAnzeigeZeile[];
        lagerorte: Array<{ id: string; name: string; typ: string }>;
      };
      expect(props.zeilen).toEqual([
        {
          id: "db-med",
          typ: "medizin",
          name: "Corpuls DB",
          barcode: "DB-MED",
          lagerortName: "Handlager",
          aktiv: true,
          faelligkeitAmpel: "gruen",
          keinDatum: true,
          chip: { ton: "grau", text: "kein MTK-Datum" },
        },
        {
          id: "db-obj",
          typ: "objekt",
          name: "Spineboard DB",
          barcode: null,
          lagerortName: "RTW T143",
          aktiv: true,
          faelligkeitAmpel: "rot",
          keinDatum: false,
          chip: { ton: "rot", text: "abgelaufen (2 T)" },
        },
      ]);
      expect(istRekursivJsonSicher(props)).toBe(true);
      for (const zeile of props.zeilen) {
        expect(zeile).not.toHaveProperty("faelligkeit");
        expect(zeile).not.toHaveProperty("faelligAm");
        expect(zeile).not.toHaveProperty("mtkFaellig");
        expect(zeile).not.toHaveProperty("ablaufdatum");
      }
    } finally {
      testDb.schliessen();
    }
  });

  it("bleibt dynamisch, dünn und frei von RSC-gefährlichen UI-Importen", () => {
    expect(dynamic).toBe("force-dynamic");
    const page = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.tsx",
      "utf8",
    );
    // EIN Abruf, wiederverwendet fuer Liste UND Kennzahlleiste — kein zweiter,
    // stiller `geraeteUebersicht`-Aufruf fuer die Kacheln.
    expect(page.match(/\bgeraeteUebersicht\s*\(/g)).toHaveLength(1);
    expect(page).not.toContain("/m/lagerbuch/verwaltung");
    expect(page).not.toContain("@ant-design/icons");
    // Seit der Kennzahlleiste importiert die Seite aus "antd" — aber NUR die
    // in Falle 1 (docs/design/README.md) gelisteten, COMPOUND-freien Namen.
    //
    // ⚠️ ALLE Importzeilen pruefen, nicht nur die erste: `.match()` OHNE `/g`
    // liefert nur den ersten Treffer im String, ein zweites `import { Typography }
    // from "antd"` irgendwo darunter waere unsichtbar fuer den Riegel — genau
    // der Schutz, den die fruehere Fassung (`not.toMatch(/from\s+["']antd["']/)`)
    // noch hatte, weil sie auf ein Vorkommen IRGENDWO prueft. `matchAll` mit `/g`
    // haelt diesen Schutz: jede Importzeile bekommt eine eigene Pruefung.
    const antdImports = [...page.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']antd["']/g)];
    expect(antdImports.length).toBeGreaterThan(0);
    for (const [, gruppe] of antdImports) {
      const antdNamen = gruppe.split(",").map((n) => n.trim()).filter(Boolean);
      for (const name of antdNamen) {
        expect(["Col", "Row"]).toContain(name);
      }
    }
    expect(page).not.toMatch(/\b(?:Form|Table|Modal)\./);
  });
});
