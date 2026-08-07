// @vitest-environment jsdom

import { act } from "react";
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
import {
  SauerstoffListe,
  sucheTrifft,
  type SauerstoffAnzeigeZeile,
} from "./SauerstoffListe";
import { NeuFlasche, lagerortFilter } from "./NeuFlasche";
import { sauerstoffAnzeigeZeilen } from "./page";

const mocks = vi.hoisted(() => ({
  flascheSpeichern: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/sauerstoff", () => ({
  flascheSpeichern: (...args: unknown[]) => mocks.flascheSpeichern(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const ZEILEN: SauerstoffAnzeigeZeile[] = [
  {
    id: "o1", name: "O2 klein", lagerortName: "RTW 1", aktiv: true,
    groesseLiter: 2, nennfuelldruckBar: 200, letzterDruck: 70,
    letzteMessungText: "07.08. 12:34", herkunft: "check",
    status: { prozent: 35, ampel: "rot", niedrig: true },
  },
  {
    id: "o2", name: "O2 Reserve", lagerortName: "Lager Beta", aktiv: true,
    groesseLiter: 10, nennfuelldruckBar: 300, letzterDruck: 240,
    letzteMessungText: "07.08. 11:30", herkunft: "manuell",
    status: { prozent: 80, ampel: "gruen", niedrig: false },
  },
  {
    id: "o3", name: "O2 ohne", lagerortName: "Handlager", aktiv: true,
    groesseLiter: null, nennfuelldruckBar: 200, letzterDruck: null,
    letzteMessungText: null, herkunft: null, status: null,
  },
  {
    id: "o4", name: "O2 alt", lagerortName: "Altbestand", aktiv: false,
    groesseLiter: 2, nennfuelldruckBar: 200, letzterDruck: 40,
    letzteMessungText: "06.08. 09:00", herkunft: "manuell",
    status: { prozent: 20, ampel: "rot", niedrig: true },
  },
];

const LAGERORTE = [
  { id: "handlager", name: "Handlager" },
  { id: "rtw-1", name: "RTW 1" },
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

function knopfMitText(text: string, wurzel: ParentNode = document.body): HTMLElement {
  const knopf = Array.from(wurzel.querySelectorAll<HTMLElement>("button"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

async function oeffneDialog(): Promise<void> {
  await clickElement(knopfMitText("Neue Sauerstoffflasche"));
  await warteAuf(
    () => document.body.querySelector("[role='dialog']") !== null,
    "Dialog fuer neue Sauerstoffflasche",
  );
}

async function fillPortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter fuer ${selector}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function selectOption(ariaLabel: string, text: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function submitPortalForm(): Promise<void> {
  const form = queryPortal<HTMLFormElement>("[data-rolle='neue-o2-flasche']");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.flascheSpeichern.mockResolvedValue({ ok: true, wert: { id: "neu" } });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
});

describe("SauerstoffListe", () => {
  it("traegt exakt die sechs vereinbarten Spalten", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Flasche", "Druck", "Füllstand", "Herkunft", "Größe", "Status"]);
  });

  it("zeigt Herkunft, Detail-Link und die druckbezogenen Werte", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/sauerstoff/o1']").textContent)
      .toBe("O2 klein");
    expect(document.body.textContent).toContain("aus Check");
    expect(document.body.textContent).toContain("manuell");
    const zeile = query("tr[data-row-key='o1']");
    expect(zeile.textContent).toContain("70 bar");
    expect(zeile.textContent).toContain("35 %");
    expect(zeile.textContent).toContain("niedriger Druck");
    expect(zeile.querySelector(`.${s.rot}`)).not.toBeNull();
  });

  it("zeigt status:null exakt als keine Messung, nie als 0 Prozent oder rot", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    const zeile = query("tr[data-row-key='o3']");
    expect(zeile.textContent).toContain("keine Messung");
    expect(zeile.textContent).not.toContain("0 %");
    expect(zeile.querySelector(".ant-progress")).toBeNull();
    expect(zeile.querySelector(`.${s.rot}`)).toBeNull();
  });

  it("sucht ausschliesslich ueber Name und Lagerort", () => {
    expect(sucheTrifft(ZEILEN[0], "o2 klein")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "rtw")).toBe(true);
    expect(sucheTrifft(ZEILEN[0], "70 bar")).toBe(false);
    expect(sucheTrifft(ZEILEN[0], "aus check")).toBe(false);
    expect(sucheTrifft(ZEILEN[0], "Lager Beta")).toBe(false);
  });

  it("kombiniert Suche, niedrigen Druck und ausgeblendete Inaktive", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    const checkboxen = queryAll<HTMLElement>(".ant-checkbox-wrapper");
    const niedrig = checkboxen.find((x) => x.textContent?.includes("nur niedriger Druck"));
    const inaktive = checkboxen.find((x) => x.textContent?.includes("inaktive ausblenden"));
    if (!niedrig || !inaktive) throw new Error("Filtercheckboxen fehlen");

    await clickElement(niedrig);
    expect(queryAll("tbody tr[data-row-key]").map((x) => x.getAttribute("data-row-key")))
      .toEqual(["o1", "o4"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("2 von 4");

    await clickElement(inaktive);
    expect(queryAll("tbody tr[data-row-key]").map((x) => x.getAttribute("data-row-key")))
      .toEqual(["o1"]);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("1 von 4");

    await fill("input[type='search']", "unbekannt");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(0);
    expect(document.body.textContent).toContain("Keine Sauerstoffflasche passt zu den Filtern.");
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 4");
  });

  it("setzt die tragenden Table-Props und keine Ampelfarbe am Progress", async () => {
    await mount(<SauerstoffListe zeilen={ZEILEN} lagerorte={LAGERORTE} />);
    expect(query("table").getAttribute("aria-label")).toBe("Sauerstoffflaschen");
    expect(exists(".ant-pagination")).toBe(false);
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.tsx",
      "utf8",
    );
    expect(quelle).toMatch(/rowKey=["']id["']/);
    expect(quelle).toMatch(/pagination=\{false\}/);
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/);
    expect(quelle).not.toMatch(/strokeColor/);
  });
});

describe("RSC-Grenze", () => {
  it("formatiert die Date im page-Modul und uebergibt rekursiv Date-freie DTOs", () => {
    const dto = sauerstoffAnzeigeZeilen([{ ...ZEILEN[0],
      letzteMessung: new Date("2026-08-07T10:34:00Z"),
    }]);
    expect(dto[0].letzteMessungText).toBe("07.08. 12:34");
    expect(dto[0]).not.toHaveProperty("letzteMessung");
    expect(enthaeltDate(dto)).toBe(false);
  });

  it("bleibt dynamisch und verwendet nur aeussere Verwaltungs-URLs", () => {
    const page = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.tsx",
      "utf8",
    );
    const liste = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/SauerstoffListe.tsx",
      "utf8",
    );
    expect(page).toMatch(/export const dynamic\s*=\s*["']force-dynamic["']/);
    expect(`${page}\n${liste}`).not.toContain("/m/lagerbuch/verwaltung");
    expect(liste).toContain("/verwaltung/sauerstoff/");
  });
});

describe("NeuFlasche", () => {
  it("fordert den Nennfuelldruck sichtbar und ohne stillen 200-bar-Startwert", async () => {
    await mount(<NeuFlasche lagerorte={LAGERORTE} />);
    await oeffneDialog();
    const nenn = queryPortal<HTMLInputElement>("[aria-label='Nennfülldruck in bar']");
    expect(nenn.value).toBe("");

    await submitPortalForm();
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Nennfülldruck angeben"),
      "Pflichtfehler fuer Nennfuelldruck",
    );
    expect(mocks.flascheSpeichern).not.toHaveBeenCalled();

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/NeuFlasche.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/initialValue(?:s)?[^\n]*200/);
  });

  it("haengt jedes benannte Feld direkt an sein Form-Control und filtert Standorte explizit", () => {
    const pfad = "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/NeuFlasche.tsx";
    const quelle = readFileSync(pfad, "utf8");
    const source = ts.createSourceFile(pfad, quelle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const felder: string[] = [];

    function besuche(node: ts.Node) {
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
          expect(kinder, `${nameAttr.initializer.text} hat genau ein direktes Control`).toHaveLength(1);
          const kind = kinder[0];
          expect(
            ts.isJsxElement(kind) || ts.isJsxSelfClosingElement(kind),
            `${nameAttr.initializer.text} hat ein direktes JSX-Control`,
          ).toBe(true);
        }
      }
      ts.forEachChild(node, besuche);
    }
    besuche(source);
    expect(felder).toEqual(["name", "lagerortId", "groesseLiter", "nennfuelldruckBar"]);
    expect(quelle).toMatch(/<Select[\s\S]*?filterOption=\{lagerortFilter\}/);
    expect(quelle).toMatch(/<Select<string,\s*LagerortOption>/);
    expect(lagerortFilter("rtw", { label: "RTW 1", value: "rtw-1" })).toBe(true);
    expect(lagerortFilter("lager", { label: "RTW 1", value: "rtw-1" })).toBe(false);
  });

  it("verwendet fuer allgemeine Fehler die antd-v6-Prop title statt message", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/NeuFlasche.tsx",
      "utf8",
    );
    expect(quelle).toMatch(/<Alert[\s\S]*?title=\{fehler\}/);
    expect(quelle).not.toMatch(/<Alert[\s\S]*?message=\{fehler\}/);
  });

  it("sendet nur explizit eingegebene Werte, schliesst, leert und aktualisiert", async () => {
    await mount(<NeuFlasche lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fillPortal("[aria-label='Name der Sauerstoffflasche']", "O2 neu");
    await selectOption("Standort", "RTW 1");
    await fillPortal("[aria-label='Größe in Litern']", "10");
    await fillPortal("[aria-label='Nennfülldruck in bar']", "300");
    await submitPortalForm();
    await warteAuf(() => mocks.flascheSpeichern.mock.calls.length === 1, "Action-Aufruf");

    expect(mocks.flascheSpeichern).toHaveBeenCalledWith({
      name: "O2 neu", lagerortId: "rtw-1", groesseLiter: 10, nennfuelldruckBar: 300,
    });
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossener Dialog",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await oeffneDialog();
    expect(queryPortal<HTMLInputElement>("[aria-label='Nennfülldruck in bar']").value).toBe("");
  });

  it("zeigt Feldfehler am Feld und den allgemeinen Action-Fehler", async () => {
    mocks.flascheSpeichern.mockResolvedValueOnce({
      ok: false,
      fehler: "Flasche konnte nicht gespeichert werden.",
      feldFehler: { name: "Dieser Name ist bereits vergeben." },
    });
    await mount(<NeuFlasche lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fillPortal("[aria-label='Name der Sauerstoffflasche']", "O2 doppelt");
    await selectOption("Standort", "RTW 1");
    await fillPortal("[aria-label='Nennfülldruck in bar']", "200");
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes("Dieser Name ist bereits vergeben."),
      "Feldfehler",
    );
    expect(document.body.textContent).toContain("Flasche konnte nicht gespeichert werden.");
    expect(queryPortal("[data-rolle='neue-o2-flasche'] .ant-form-item-explain-error").textContent)
      .toBe("Dieser Name ist bereits vergeben.");
  });

  it("zeigt bei einem verworfenen Action-Promise nur den festen Laufzeitfehler", async () => {
    mocks.flascheSpeichern.mockRejectedValueOnce(new Error("internes Framework-Geheimnis"));
    await mount(<NeuFlasche lagerorte={LAGERORTE} />);
    await oeffneDialog();
    await fillPortal("[aria-label='Name der Sauerstoffflasche']", "O2 neu");
    await selectOption("Standort", "RTW 1");
    await fillPortal("[aria-label='Nennfülldruck in bar']", "200");
    await submitPortalForm();

    await warteAuf(
      () => (document.body.textContent ?? "").includes(
        "Sauerstoffflasche konnte nicht angelegt werden.",
      ),
      "fester Laufzeitfehler",
    );
    expect(document.body.textContent).not.toContain("internes Framework-Geheimnis");
  });
});
