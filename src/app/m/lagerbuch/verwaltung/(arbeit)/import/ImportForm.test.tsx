// @vitest-environment jsdom

import { readFileSync } from "node:fs";
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
  exists,
  mount,
  query,
  queryAll,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { parseArtikelCsv } from "../../../_lib/csv";
import {
  Fehlerbericht,
  ImportForm,
  VorschauTabelle,
  vorschauAus,
} from "./ImportForm";
import ImportSeite, { dynamic } from "./page";

const { importArtikelCsvMock } = vi.hoisted(() => ({
  importArtikelCsvMock: vi.fn(),
}));

vi.mock("../../../_actions/csv", () => ({
  importArtikelCsv: importArtikelCsvMock,
}));

const CSV_MIT_FEHLER = [
  "Name;Einheit;Fach;Mindestbestand;Startbestand",
  "",
  "Mullbinde;Stk;A1;20;5",
  "Mullbinde;Pkg;B2;7;3",
  "Kaputt;Stk",
].join("\n");

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  importArtikelCsvMock.mockReset();
  importArtikelCsvMock.mockResolvedValue({
    ok: true,
    wert: { angelegt: 2, fehler: [] },
  });
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

async function dateiWaehlen(text: string): Promise<void> {
  const feld = query<HTMLInputElement>("input[type='file']");
  Object.defineProperty(feld, "files", {
    configurable: true,
    value: [{ name: "artikel.csv", text: async () => text }],
  });
  await act(async () => {
    feld.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function vorschauZeilen(): HTMLTableRowElement[] {
  return queryAll<HTMLTableRowElement>("tbody tr[data-row-key]");
}

describe("vorschauAus", () => {
  it("benutzt den gemeinsamen Parser samt physischen Zeilennummern", () => {
    expect(vorschauAus(CSV_MIT_FEHLER)).toEqual({
      rows: [
        {
          name: "Mullbinde",
          einheit: "Stk",
          fach: "A1",
          mindestbestand: 20,
          startbestand: 5,
          zeile: 3,
        },
        {
          name: "Mullbinde",
          einheit: "Pkg",
          fach: "B2",
          mindestbestand: 7,
          startbestand: 3,
          zeile: 4,
        },
      ],
      fehler: [
        "Zeile 5: erwartet 5 Spalten (Name, Einheit, Fach, Mindestbestand, Startbestand), gefunden 2.",
      ],
    });
  });

  it("veraendert den bisherigen Standardvertrag des Parsers nicht", () => {
    const standard = parseArtikelCsv(CSV_MIT_FEHLER);

    expect(standard.rows).toEqual([
      {
        name: "Mullbinde",
        einheit: "Stk",
        fach: "A1",
        mindestbestand: 20,
        startbestand: 5,
      },
      {
        name: "Mullbinde",
        einheit: "Pkg",
        fach: "B2",
        mindestbestand: 7,
        startbestand: 3,
      },
    ]);
    expect(standard.rows.every((zeile) => !("zeile" in zeile))).toBe(true);
  });
});

describe("VorschauTabelle", () => {
  it("rendert genau die fuenf Fachspalten und physische Zeilen als stabile Schluessel", async () => {
    await mount(<VorschauTabelle rows={vorschauAus(CSV_MIT_FEHLER).rows} />);

    expect(queryAll("thead th").map((th) => th.textContent)).toEqual([
      "Artikel",
      "Fach",
      "Einheit",
      "Mindestbestand",
      "Startbestand",
    ]);
    expect(vorschauZeilen().map((zeile) => zeile.dataset.rowKey)).toEqual(["3", "4"]);
    expect(vorschauZeilen().map((zeile) => zeile.textContent)).toEqual([
      "MullbindeA1Stk205",
      "MullbindeB2Pkg73",
    ]);
    expect(queryAll("tbody tr[data-row-key] td")).toHaveLength(10);
  });

  it("traegt Leertext, Aria-Name, Zahlenrollen und horizontalen Scrollvertrag", async () => {
    await mount(<VorschauTabelle rows={vorschauAus(CSV_MIT_FEHLER).rows} />);

    expect(query("table").getAttribute("aria-label")).toBe("Vorschau");
    expect(exists(".ant-pagination")).toBe(false);
    expect(query<HTMLElement>(".ant-table-content").style.overflowX).toBe("auto");
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
    expect(query<HTMLTableElement>("table").style.minWidth).toBe("100%");
    const zellen = queryAll<HTMLTableCellElement>("tbody tr[data-row-key='3'] td");
    expect(zellen[3]?.style.textAlign).toBe("right");
    expect(zellen[4]?.style.textAlign).toBe("right");
    expect(zellen[3]?.querySelector("span")?.style.fontVariantNumeric).toBe("tabular-nums");

    await unmount();
    await mount(<VorschauTabelle rows={[]} />);
    expect(query(".ant-table-placeholder").textContent).toBe(
      "Keine gültige Zeile in der Datei.",
    );
  });
});

describe("Fehlerbericht", () => {
  it("steht als Warnung mit allen konkreten Zeilen neben der Vorschau", async () => {
    await mount(
      <Fehlerbericht
        fehler={[
          "Zeile 5: falsche Spaltenzahl",
          "Zeile 8: Startbestand ist keine Zahl",
        ]}
      />,
    );

    expect(exists(".ant-alert-warning")).toBe(true);
    expect(exists(".ant-alert-error")).toBe(false);
    expect(document.body.textContent).toContain("2 Zeilen werden übersprungen");
    expect(queryAll(".ant-alert-description li").map((zeile) => zeile.textContent)).toEqual([
      "Zeile 5: falsche Spaltenzahl",
      "Zeile 8: Startbestand ist keine Zahl",
    ]);
  });

  it("verschwindet, wenn es nichts zu melden gibt", async () => {
    await mount(<Fehlerbericht fehler={[]} />);
    expect(exists(".ant-alert")).toBe(false);
  });
});

describe("ImportForm", () => {
  it("ist ein echtes antd-Formular mit nacktem Dateifeld statt Upload", async () => {
    await mount(<ImportForm />);

    expect(exists("form.ant-form")).toBe(true);
    expect(exists(".ant-upload")).toBe(false);
    const feld = query<HTMLInputElement>(".ant-form-item input[type='file']");
    expect(feld.getAttribute("accept")).toBe(".csv,text/csv");
    expect(feld.getAttribute("aria-label")).toBe("CSV-Datei wählen");
    const knopf = query<HTMLButtonElement>("button[data-rolle='import']");
    expect(knopf.type).toBe("submit");
    expect(knopf.disabled).toBe(true);
  });

  it("zeigt gueltige Vorschau und Parserdiagnostik gleichzeitig", async () => {
    await mount(<ImportForm />);
    await dateiWaehlen(CSV_MIT_FEHLER);

    expect(vorschauZeilen().map((zeile) => zeile.dataset.rowKey)).toEqual(["3", "4"]);
    expect(document.body.textContent).toContain("Zeile 5: erwartet 5 Spalten");
    expect(exists(".ant-alert-warning")).toBe(true);
    expect(query<HTMLButtonElement>("button[data-rolle='import']").disabled).toBe(false);
  });

  it("sendet den unveraenderten Text und behaelt Vorschau plus Diagnostik bei Teilerfolg", async () => {
    importArtikelCsvMock.mockResolvedValueOnce({
      ok: true,
      wert: {
        angelegt: 1,
        fehler: ["Zeile 4: „Mullbinde“ konnte nicht angelegt werden."],
      },
    });
    await mount(<ImportForm />);
    await dateiWaehlen(CSV_MIT_FEHLER);
    await submitForm();

    expect(importArtikelCsvMock).toHaveBeenCalledTimes(1);
    expect(importArtikelCsvMock).toHaveBeenCalledWith(CSV_MIT_FEHLER);
    expect(document.body.textContent).toContain("1 Artikel angelegt.");
    expect(document.body.textContent).toContain("Zeile 4: „Mullbinde“ konnte nicht angelegt werden.");
    expect(document.body.textContent).toContain("Zeile 5: erwartet 5 Spalten");
    expect(vorschauZeilen().map((zeile) => zeile.dataset.rowKey)).toEqual(["3", "4"]);
  });

  it("behaelt den Arbeitsstand bei einem fachlichen Action-Fehler", async () => {
    importArtikelCsvMock.mockResolvedValueOnce({
      ok: false,
      fehler: "CSV-Datei konnte nicht importiert werden.",
    });
    await mount(<ImportForm />);
    await dateiWaehlen(CSV_MIT_FEHLER);
    await submitForm();

    expect(document.body.textContent).toContain("CSV-Datei konnte nicht importiert werden.");
    expect(vorschauZeilen()).toHaveLength(2);
    expect(query<HTMLButtonElement>("button[data-rolle='import']").disabled).toBe(false);
  });

  it("faengt Laufzeitfehler mit festem Warntext ab und behaelt den Arbeitsstand", async () => {
    importArtikelCsvMock.mockRejectedValueOnce(new Error("interne Einzelheit"));
    await mount(<ImportForm />);
    await dateiWaehlen(CSV_MIT_FEHLER);
    await submitForm();

    expect(document.body.textContent).toContain(
      "Der CSV-Import konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
    );
    expect(document.body.textContent).not.toContain("interne Einzelheit");
    expect(vorschauZeilen()).toHaveLength(2);
  });

  it("leert den Arbeitsstand erst nach vollstaendigem Erfolg", async () => {
    importArtikelCsvMock.mockResolvedValueOnce({
      ok: true,
      wert: { angelegt: 3, fehler: [] },
    });
    await mount(<ImportForm />);
    await dateiWaehlen(CSV_MIT_FEHLER.replace("Kaputt;Stk", "Kompressen;Pkg;C3;4;0"));
    await submitForm();

    expect(document.body.textContent).toContain("3 Artikel angelegt.");
    expect(vorschauZeilen()).toHaveLength(0);
    expect(query(".ant-table-placeholder").textContent).toBe(
      "Keine gültige Zeile in der Datei.",
    );
    expect(query<HTMLButtonElement>("button[data-rolle='import']").disabled).toBe(true);
  });
});

describe("Routengrenze", () => {
  it("macht die Importseite dynamisch und setzt Kopf samt Formular zusammen", () => {
    expect(dynamic).toBe("force-dynamic");
    const seite = ImportSeite();
    const kinder = Array.isArray(seite.props.children)
      ? seite.props.children
      : [seite.props.children];
    expect(kinder[0].props.titel).toBe("CSV-Import");
    expect(kinder[0].props.beschreibung).toContain("Mindestbestand · Startbestand");
    expect(kinder[1].type).toBe(ImportForm);
  });

  it("haelt die Clientgrenze und antd-v6-Alert-API statisch fest", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/import/ImportForm.tsx",
      "utf8",
    );
    expect(quelle.trimStart().startsWith('"use client";')).toBe(true);
    expect(quelle).not.toMatch(/\bmessage\s*=/);
    expect(quelle).not.toMatch(/\bsuppressHydrationWarning\b|\bssr\s*:\s*false/);
  });
});
