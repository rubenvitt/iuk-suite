// @vitest-environment jsdom
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
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  BestellListe,
  statusChip,
  type BestellAnzeigeZeile,
} from "./BestellListe";

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

  it("CSV und Zwischenablage sind gesperrt und nennen am Tooltip-Traeger den Grund", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(query("[data-rolle='csv'] button").hasAttribute("disabled")).toBe(true);
    expect(query("[data-rolle='clipboard'] button").hasAttribute("disabled")).toBe(true);
    expect(query("[data-rolle='csv']").getAttribute("title")).toContain("Teil 6");
    expect(query("[data-rolle='clipboard']").getAttribute("title")).toContain("Teil 6");
  });

  it("enthaelt vor Teil 6 keinen versteckten Download- oder Zwischenablageweg", async () => {
    await mount(<BestellListe zeilen={ZEILEN} />);
    expect(exists("a[download]")).toBe(false);
    expect(exists("[data-clipboard-text]")).toBe(false);
  });
});
