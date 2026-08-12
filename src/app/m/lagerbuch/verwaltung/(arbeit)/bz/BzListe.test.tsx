// @vitest-environment jsdom

import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { readFileSync } from "node:fs";
import ts from "typescript";
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
import { bzGeraete, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BzListe } from "./BzListe";
import type { BzAnzeigeZeile } from "./bzAnzeige";
import { lagerortFilter, NeuBzGeraet } from "./NeuBzGeraet";
import { bzSeitenInhalt, dynamic } from "./page";

const mocks = vi.hoisted(() => ({
  geraetSpeichern: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/bz", () => ({
  geraetSpeichern: (...args: unknown[]) => mocks.geraetSpeichern(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const ZEILEN: BzAnzeigeZeile[] = [
  {
    id: "nie",
    name: "Accu-Chek Mobile",
    barcode: "SN-NIE-42",
    lagerortName: "RTW Nord",
    aktiv: true,
    faelligkeitTon: "rot",
    faelligkeitText: "noch nie geprüft",
    letzteKontrolleText: null,
    faellig: true,
  },
  {
    id: "ueberfaellig",
    name: "Contour Rot",
    barcode: "OVER-2",
    lagerortName: "Lager Süd",
    aktiv: true,
    faelligkeitTon: "rot",
    faelligkeitText: "überfällig (seit 3 Tagen)",
    letzteKontrolleText: "07.08. 12:34",
    faellig: true,
  },
  {
    id: "heute",
    name: "Gluco Heute",
    barcode: null,
    lagerortName: "Handlager",
    aktiv: false,
    faelligkeitTon: "gelb",
    faelligkeitText: "heute fällig",
    letzteKontrolleText: "07.07. 10:00",
    faellig: true,
  },
  {
    id: "spaeter",
    name: "FreeStyle Zukunft",
    barcode: "FUT-7",
    lagerortName: "RTW West",
    aktiv: true,
    faelligkeitTon: "ok",
    faelligkeitText: "fällig in 8 Tagen",
    letzteKontrolleText: "15.07. 10:00",
    faellig: false,
  },
];

const LAGERORTE = [
  { id: "handlager", name: "Handlager", typ: "lager" as const },
  { id: "rtw-nord", name: "RTW Nord", typ: "fahrzeug" as const },
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

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
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

async function oeffneDialog(): Promise<void> {
  await clickElement(knopfMitText("Neues BZ-Gerät"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Dialog für ein neues BZ-Gerät",
  );
}

async function fillPortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(selector);
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
  const form = queryPortal<HTMLFormElement>("[data-rolle='neues-bz-geraet']");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function fuellPflichtfelder(): Promise<void> {
  await fillPortal("[aria-label='Name des BZ-Geräts']", "Accu-Chek Neu");
  await standortAuswaehlen("RTW Nord");
  await fillPortal("[aria-label='Level-1-Bezeichnung']", "L1");
  await fillPortal("[aria-label='Level-2-Bezeichnung']", "L2");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.geraetSpeichern.mockResolvedValue({ ok: true, wert: { id: "bz-neu" } });
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
});

describe("BzListe", () => {
  it("zeigt exakt fünf Spalten, fachliche Werte sowie Detail- und Scannerlinks", async () => {
    await mount(<BzListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Gerät", "Standort", "Fälligkeit", "Letzte Kontrolle", "Status"]);
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/bz/nie']").textContent)
      .toBe("Accu-Chek Mobile");
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/bz/scan']").textContent)
      .toContain("Scannen");
    expect(knopfMitText("Neues BZ-Gerät")).toBeDefined();
    expect(query("tr[data-row-key='nie']").textContent)
      .toContain("noch nie geprüft");
    expect(query("tr[data-row-key='nie']").textContent).toContain("–");
    expect(query("tr[data-row-key='heute']").textContent).toContain("inaktiv");
    expect(query("tr[data-row-key='spaeter']").textContent).toContain("15.07. 10:00");
    expect(query("table").getAttribute("aria-label")).toBe("BZ-Geräte");
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/BzListe.tsx",
      "utf8",
    );
    expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
    expect(quelle).toMatch(/rowKey=["']id["']/);
    expect(quelle).toMatch(/pagination=\{false\}/);
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/);
    expect(quelle).not.toContain("@ant-design/icons");
  });

  it("sucht ausschließlich über Name, Barcode und Lagerort", async () => {
    await mount(<BzListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);

    await fill("input[type='search']", "accu");
    expect(zeilenIds()).toEqual(["nie"]);
    await fill("input[type='search']", "sn-nie-42");
    expect(zeilenIds()).toEqual(["nie"]);
    await fill("input[type='search']", "rtw nord");
    expect(zeilenIds()).toEqual(["nie"]);

    await fill("input[type='search']", "überfällig");
    expect(zeilenIds()).toEqual([]);
    await fill("input[type='search']", "inaktiv");
    expect(zeilenIds()).toEqual([]);
    await fill("input[type='search']", "Lager Süd");
    expect(zeilenIds()).toEqual(["ueberfaellig"]);
  });

  it("kombiniert alle Filter und behält ein nie geprüftes Gerät im Fälligkeitsfilter", async () => {
    await mount(<BzListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);

    await clickElement(checkboxMitText("fällig/überfällig"));
    expect(zeilenIds()).toEqual(["nie", "ueberfaellig", "heute"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("3 von 4");

    await clickElement(checkboxMitText("inaktive ausblenden"));
    expect(zeilenIds()).toEqual(["nie", "ueberfaellig"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("2 von 4");

    await fill("input[type='search']", "contour");
    expect(zeilenIds()).toEqual(["ueberfaellig"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 4");
  });

  it("setzt Suche und beide Checkboxen gemeinsam zurück", async () => {
    await mount(<BzListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    await fill("input[type='search']", "contour");
    await clickElement(checkboxMitText("fällig/überfällig"));
    await clickElement(checkboxMitText("inaktive ausblenden"));
    expect(zeilenIds()).toEqual(["ueberfaellig"]);

    await clickElement(knopfMitText("Zurücksetzen"));

    expect(zeilenIds()).toEqual(["nie", "ueberfaellig", "heute", "spaeter"]);
    expect(query<HTMLInputElement>("input[type='search']").value).toBe("");
    expect(queryAll<HTMLInputElement>("input[type='checkbox']")
      .map((checkbox) => checkbox.checked)).toEqual([false, false]);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
    expect(queryAll("button").some((knopf) => knopf.textContent?.includes("Zurücksetzen")))
      .toBe(false);
  });

  it("zeigt ohne Daten und ohne Filter den fachlichen Anfangstext", async () => {
    await mount(<BzListe zeilen={[]} lagerorte={LAGERORTE} />);
    expect(document.body.textContent)
      .toContain("Noch keine BZ-Geräte. Lege oben das erste an.");
  });

  it("erkennt den alleinigen Fälligkeitsfilter für den gefilterten Leertext", async () => {
    await mount(<BzListe zeilen={[ZEILEN[3]]} lagerorte={LAGERORTE} />);
    await clickElement(checkboxMitText("fällig/überfällig"));
    expect(zeilenIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Gerät passt zu Suche und Filter.");
  });

  it("erkennt das alleinige Ausblenden Inaktiver für den gefilterten Leertext", async () => {
    await mount(<BzListe zeilen={[ZEILEN[2]]} lagerorte={LAGERORTE} />);
    await clickElement(checkboxMitText("inaktive ausblenden"));
    expect(zeilenIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Gerät passt zu Suche und Filter.");
  });
});

describe("NeuBzGeraet", () => {
  it("fordert beide Level-Bezeichnungen sichtbar vor jedem Action-Aufruf", async () => {
    await mount(<NeuBzGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fillPortal("[aria-label='Name des BZ-Geräts']", "Accu-Chek Neu");
    await standortAuswaehlen("RTW Nord");
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Level-1-Bezeichnung angeben"),
      "Pflichtfehler für Level 1",
    );
    expect(document.body.textContent).toContain("Level-2-Bezeichnung angeben");
    expect(mocks.geraetSpeichern).not.toHaveBeenCalled();
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("bindet exakt alle zehn Action-Felder direkt an echte Controls", () => {
    const pfad = "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/NeuBzGeraet.tsx";
    const quelle = readFileSync(pfad, "utf8");
    const source = ts.createSourceFile(pfad, quelle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const felder: string[] = [];

    function besuche(node: ts.Node): void {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Form.Item") {
        const nameAttr = node.openingElement.attributes.properties.find(
          (attr): attr is ts.JsxAttribute => ts.isJsxAttribute(attr)
            && attr.name.getText(source) === "name",
        );
        if (nameAttr?.initializer && ts.isStringLiteral(nameAttr.initializer)) {
          felder.push(nameAttr.initializer.text);
          const kinder = node.children.filter(
            (kind) => !ts.isJsxText(kind) || kind.getText(source).trim() !== "",
          );
          expect(kinder, `${nameAttr.initializer.text} hat genau ein direktes Control`)
            .toHaveLength(1);
          expect(
            ts.isJsxElement(kinder[0]) || ts.isJsxSelfClosingElement(kinder[0]),
            `${nameAttr.initializer.text} hat ein direktes JSX-Control`,
          ).toBe(true);
        }
      }
      ts.forEachChild(node, besuche);
    }
    besuche(source);

    expect(felder).toEqual([
      "name",
      "barcode",
      "lagerortId",
      "streifenLot",
      "level1Label",
      "level1Min",
      "level1Max",
      "level2Label",
      "level2Min",
      "level2Max",
    ]);
    expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
    expect(quelle).toMatch(/<Select<string,\s*LagerortOption>/);
    expect(quelle).toMatch(/filterOption=\{lagerortFilter\}/);
    expect(quelle).not.toMatch(/\bsize\s*=/);
    expect(quelle).not.toMatch(/initialValue/);
    expect(quelle).toMatch(/<Alert[\s\S]*?title=\{fehler\}/);
    expect(quelle).not.toMatch(/<Alert[\s\S]*?message=\{fehler\}/);
    expect(quelle).not.toContain("@ant-design/icons");
  });

  it("filtert Standortoptionen über den sichtbaren Namen", async () => {
    expect(lagerortFilter("rtw nord", { value: "rtw-nord", label: "RTW Nord" }))
      .toBe(true);
    expect(lagerortFilter("rtw nord", { value: "handlager", label: "Handlager" }))
      .toBe(false);

    await mount(<NeuBzGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await standortAuswaehlen("RTW Nord", "rtw nord");
    expect(queryPortal("[aria-label='Standort']").closest(".ant-select")?.textContent)
      .toContain("RTW Nord");
  });

  it("sendet alle zehn Payload-Schlüssel exakt, schließt, leert und aktualisiert einmal", async () => {
    await mount(<NeuBzGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fillPortal("[aria-label='Name des BZ-Geräts']", "Accu-Chek Neu");
    await fillPortal("[aria-label='Barcode']", "BZ-NEU-1");
    await standortAuswaehlen("RTW Nord");
    await fillPortal("[aria-label='Streifen-Lot']", "LOT-42");
    await fillPortal("[aria-label='Level-1-Bezeichnung']", "L1");
    await fillPortal("[aria-label='Level-1-Untergrenze']", "40");
    await fillPortal("[aria-label='Level-1-Obergrenze']", "60");
    await fillPortal("[aria-label='Level-2-Bezeichnung']", "L2");
    await fillPortal("[aria-label='Level-2-Untergrenze']", "250");
    await fillPortal("[aria-label='Level-2-Obergrenze']", "350");
    await submitPortalForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Action-Aufruf");

    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      name: "Accu-Chek Neu",
      barcode: "BZ-NEU-1",
      lagerortId: "rtw-nord",
      streifenLot: "LOT-42",
      level1Label: "L1",
      level1Min: 40,
      level1Max: 60,
      level2Label: "L2",
      level2Min: 250,
      level2Max: 350,
    });
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossener Dialog",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await oeffneDialog();
    expect(queryPortal<HTMLInputElement>("[aria-label='Name des BZ-Geräts']").value).toBe("");
    expect(queryPortal<HTMLInputElement>("[aria-label='Level-1-Bezeichnung']").value).toBe("");
    expect(queryPortal<HTMLInputElement>("[aria-label='Level-2-Bezeichnung']").value).toBe("");
  });

  it("zeigt einen allgemeinen Actionfehler und erhält Dialog sowie Werte", async () => {
    mocks.geraetSpeichern.mockResolvedValueOnce({
      ok: false,
      fehler: "BZ-Gerät konnte fachlich nicht angelegt werden.",
    });
    await mount(<NeuBzGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes(
        "BZ-Gerät konnte fachlich nicht angelegt werden.",
      ),
      "allgemeiner Actionfehler",
    );
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(queryPortal<HTMLInputElement>("[aria-label='Name des BZ-Geräts']").value)
      .toBe("Accu-Chek Neu");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("bindet bekannte Feldfehler ans Feld und erhält Dialog sowie Werte", async () => {
    mocks.geraetSpeichern.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: {
        barcode: "Barcode bereits vergeben.",
        unbekannt: "darf nicht als Phantomfeld erscheinen",
      },
    });
    await mount(<NeuBzGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await fillPortal("[aria-label='Barcode']", "DOPPELT");
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Barcode bereits vergeben."),
      "Barcode-Feldfehler",
    );
    expect(document.body.textContent).toContain("Bitte die markierten Felder prüfen.");
    expect(document.body.textContent).not.toContain("Phantomfeld");
    expect(queryPortal<HTMLInputElement>("[aria-label='Barcode']").value).toBe("DOPPELT");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("zeigt bei verworfenem Promise nur den festen Clienttext", async () => {
    mocks.geraetSpeichern.mockRejectedValueOnce(new Error("internes Framework-Geheimnis"));
    await mount(<NeuBzGeraet lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fuellPflichtfelder();
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes(
        "BZ-Gerät konnte nicht angelegt werden.",
      ),
      "fester Laufzeitfehler",
    );
    expect(document.body.textContent).not.toContain("internes Framework-Geheimnis");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("BZ-Übersichtsseite als Server Component", () => {
  it("liest, projiziert und übergibt nur Date-freie Zeilen sowie aktive Standorte", () => {
    const testDb = migrierteTestDb("lagerbuch-bz-liste-seite-");
    try {
      testDb.db.insert(lagerorte).values([
        {
          id: "rtw-nord",
          name: "RTW Nord",
          typ: "fahrzeug",
          kennung: "UE-RK 137",
          aktiv: true,
        },
        {
          id: "lager-inaktiv",
          name: "Altlager",
          typ: "lager",
          aktiv: false,
        },
      ]).run();
      testDb.db.insert(bzGeraete).values({
        id: "bz-db",
        name: "Accu-Chek DB",
        barcode: "DB-137",
        lagerortId: "rtw-nord",
        aktiv: true,
        createdAt: new Date("2026-08-01T08:00:00Z"),
      }).run();

      const seite = bzSeitenInhalt(testDb.db, new Date("2026-08-07T10:00:00Z"));
      const kopf = elementeVomTyp(seite, SeitenKopf)[0];
      expect((kopf.props as { titel: string }).titel).toBe("BZ-Kontrolle");

      const liste = elementeVomTyp(seite, BzListe)[0];
      const props = liste.props as {
        zeilen: BzAnzeigeZeile[];
        lagerorte: Array<{ id: string; name: string; typ: string }>;
      };
      expect(props.zeilen).toEqual([{
        id: "bz-db",
        name: "Accu-Chek DB",
        barcode: "DB-137",
        lagerortName: "RTW Nord",
        aktiv: true,
        faelligkeitTon: "rot",
        faelligkeitText: "noch nie geprüft",
        letzteKontrolleText: null,
        faellig: true,
      }]);
      expect(props.lagerorte).toEqual([
        { id: "rtw-nord", name: "RTW Nord", typ: "fahrzeug" },
        { id: "handlager", name: "Handlager", typ: "lager" },
      ]);
      expect(enthaeltDate(props)).toBe(false);
    } finally {
      testDb.schliessen();
    }
  });

  it("bleibt dynamisch, dünn und frei von RSC-gefährlichen UI-Importen", () => {
    expect(dynamic).toBe("force-dynamic");
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.tsx",
      "utf8",
    );
    // EIN Abruf, wiederverwendet fuer Liste UND Kennzahlleiste — kein zweiter,
    // stiller `bzGeraeteUebersicht`-Aufruf fuer die Kacheln.
    expect(quelle.match(/\bbzGeraeteUebersicht\s*\(/g)).toHaveLength(1);
    expect(quelle).toMatch(/const\s+geraete\s*=\s*bzGeraeteUebersicht\s*\(/);
    expect(quelle).toMatch(/bzAnzeigeZeilen\s*\(\s*geraete\s*\)/);
    expect(quelle).not.toContain("/m/lagerbuch/verwaltung");
    expect(quelle).not.toContain("@ant-design/icons");
    // Seit der Kennzahlleiste importiert die Seite aus "antd" — aber NUR die
    // in Falle 1 (docs/design/README.md) gelisteten, COMPOUND-freien Namen.
    const antdImport = quelle.match(/import\s*\{([^}]*)\}\s*from\s*["']antd["']/);
    expect(antdImport).not.toBeNull();
    const antdNamen = antdImport![1].split(",").map((n) => n.trim()).filter(Boolean);
    expect(antdNamen.sort()).toEqual(["Col", "Row"]);
    expect(quelle).not.toMatch(/\b(?:Form|Table|Modal)\./);
  });
});
