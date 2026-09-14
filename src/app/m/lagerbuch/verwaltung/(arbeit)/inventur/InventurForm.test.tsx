// @vitest-environment jsdom

import { readFileSync } from "node:fs";
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
  click,
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { artikel } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { INVENTUR_TEXTE } from "../../../_lib/inventurTexte";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { InventurForm } from "./InventurForm";

const mocks = vi.hoisted(() => ({
  inventurKorrektur: vi.fn(),
}));

vi.mock("../../../_actions/inventur", () => ({
  inventurKorrektur: (...args: unknown[]) => mocks.inventurKorrektur(...args),
}));

const ZEILEN: InventurZeile[] = [
  { id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: "Hygiene", mindestbestand: 5, bestand: 12,
    chargen: [{ id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 12, ampel: "gelb" }] },
  { id: "a2", name: "Pflaster", einheit: "Pkg", fach: "B2", kategorie: null, mindestbestand: 0, bestand: 4, chargen: [] },
];

const QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.tsx",
  "utf8",
);
const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => (
    getComputedStyleOhnePseudo(element)
  ));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inventurKorrektur.mockResolvedValue({
    ok: true,
    wert: { korrigiert: 1, inventurId: "lauf-1" },
  });
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
  for (let versuch = 0; versuch < 40; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  return [
    ...(wert.type === typ ? [wert] : []),
    ...Object.values(wert.props as Record<string, ReactNode>)
      .flatMap((prop) => elementeVomTyp(prop, typ)),
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

/**
 * Oeffnet einen Filter-Select wie ArtikelTable.test.tsx (DRK-294) und waehlt die
 * Option mit genau diesem Text — echte Bedienung, kein vorgetaeuschter Zustand.
 */
async function filterWaehlen(ariaLabel: string, text: string): Promise<void> {
  const input = query<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((element) => (element.textContent ?? "") === text);
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

describe("InventurForm — Tabelle und Eingabe", () => {
  it("rendert exakt sieben Spalten, stabile IDs und die verbindlichen Tabellenprops", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);

    // Leere Koepfe (antd-Aufklappspalte, Task 6) zaehlen nicht als Spalte.
    expect(queryAll("thead th").map((zelle) => zelle.textContent).filter((t) => t)).toEqual([
      "Artikel",
      "Fach",
      "MHD",
      "Min.",
      "Bestand",
      "Abweichung",
      "Ist",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Inventur");
    expect(queryAll("tbody tr")
      .map((zeile) => zeile.getAttribute("data-row-key"))
      .filter(Boolean))
      .toEqual(["a1", "a2"]);
    expect(queryAll(".ant-pagination")).toHaveLength(0);
    expect(QUELLE).toMatch(/pagination=\{false\}/);
    expect(QUELLE).toMatch(/scroll=\{\{ x: "max-content" \}\}/);
  });

  it("zeigt einen fachlichen Leertext statt einer leeren Tabellenattrappe", async () => {
    await mount(<InventurForm zeilen={[]} />);
    expect(document.body.textContent).toContain("Keine Artikel vorhanden.");
  });

  it("erlaubt 0 bis 9999 und zeigt Abweichungen mit ASCII-Vorzeichen im Text", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    const feld = query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']");
    expect(feld.getAttribute("aria-valuemin")).toBe("0");
    expect(feld.getAttribute("aria-valuemax")).toBe("9999");

    await fill("input[aria-label='Ist-Bestand Pflaster']", "6");
    expect(document.body.textContent).toContain("+2");
    await fill("input[aria-label='Ist-Bestand Pflaster']", "1");
    expect(document.body.textContent).toContain("-3");
  });

  it("sperrt ohne Kommentar oder ohne berührte Position", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    const knopf = query<HTMLButtonElement>("button[data-rolle='abschluss']");
    expect(knopf.disabled).toBe(true);
    await fill("input[aria-label='Kommentar']", "Quartalsinventur");
    expect(knopf.disabled).toBe(true);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    expect(knopf.disabled).toBe(false);
  });

  it("sendet auch 0 und eine berührt-unveränderte Position, aber nie unberührte IDs", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "12");
    await fill("input[aria-label='Ist-Bestand Pflaster']", "0");
    await fill("input[aria-label='Kommentar']", "  Quartalsinventur  ");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");

    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Quartalsinventur",
      umfang: null,
      positionen: [
        { artikelId: "a1", ist: 12 },
        { artikelId: "a2", ist: 0 },
      ],
    });
  });
});

describe("InventurForm — asynchroner Abschluss", () => {
  it("behält Werte bis zum Resolve, sperrt Doppelklicks und leert erst bei Erfolg", async () => {
    let fertig!: (wert: { ok: true; wert: { korrigiert: number; inventurId: string } }) => void;
    mocks.inventurKorrektur.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "Zählung bleibt");
    const knopf = query<HTMLButtonElement>("button[data-rolle='abschluss']");
    await act(async () => {
      knopf.click();
      knopf.click();
    });
    await warte();

    expect(mocks.inventurKorrektur).toHaveBeenCalledTimes(1);
    expect(knopf.disabled).toBe(true);
    const istFeld = query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']");
    const kommentarFeld = query<HTMLInputElement>("input[aria-label='Kommentar']");
    expect(istFeld.disabled).toBe(true);
    expect(kommentarFeld.disabled).toBe(true);
    expect(istFeld.value).toBe("11");
    expect(kommentarFeld.value).toBe("Zählung bleibt");

    await act(async () => { fertig({ ok: true, wert: { korrigiert: 1, inventurId: "lauf-1" } }); });
    await warteAuf(() => queryAll(".ant-alert-success").length === 1, "Erfolgsmeldung");
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").value)
      .toBe("12");
    expect(query<HTMLInputElement>("input[aria-label='Kommentar']").value).toBe("");
    expect(knopf.disabled).toBe(true);
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Fachdiensttext" })],
    ["Reject", async () => { throw new Error("SQLITE geheim"); }],
  ])("behält bei %s Position und Kommentar und zeigt nur den festen Warning-Text", async (_fall, antwort) => {
    mocks.inventurKorrektur.mockImplementationOnce(antwort);
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "Fehlerretention");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => queryAll(".ant-alert-warning").length === 1, "Inventur-Warnung");

    expect(query(".ant-alert-warning").textContent)
      .toContain("Inventur konnte nicht gebucht werden.");
    expect(document.body.textContent).not.toContain("interner Fachdiensttext");
    expect(document.body.textContent).not.toContain("SQLITE geheim");
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").value)
      .toBe("11");
    expect(query<HTMLInputElement>("input[aria-label='Kommentar']").value)
      .toBe("Fehlerretention");
  });
});

describe("InventurForm — Zeile und Filter", () => {
  it("zeigt das nächste MHD und den Mindestbestand", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    const zeile = query("tr[data-row-key='a1']");
    expect(zeile.textContent).toContain("10/26");
    expect(zeile.textContent).toContain("5");
  });

  it("behält einen gezählten Wert, wenn der Filter die Zeile ausblendet, und bucht ihn mit", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Pflaster']", "3");
    await filterWaehlen("Nach Fach filtern", "A1");
    expect(queryAll("tr[data-row-key='a2']")).toHaveLength(0);
    expect(query("[data-rolle='ausgeblendet-hinweis']").textContent).toContain("1 gezählte Position ist ausgeblendet");
    await fill("input[aria-label='Kommentar']", "Teil");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Teil",
      umfang: { kategorien: [], faecher: ["A1"] },
      positionen: [{ artikelId: "a2", ist: 3 }],
    });
  });

  /*
   * Der Verlauf ist append-only: ein versehentlich geschriebener Schluessel
   * („hygiene") stuende dort fuer immer. Der Umfang traegt deshalb das LABEL.
   */
  it("legt einen Kategorienfilter als Label, nicht als gefalteten Schlüssel, in den Umfang", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await filterWaehlen("Nach Kategorie filtern", "Hygiene");
    expect(queryAll("tr[data-row-key='a2']")).toHaveLength(0);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "Hygiene");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Hygiene",
      umfang: { kategorien: ["Hygiene"], faecher: [] },
      positionen: [{ artikelId: "a1", ist: 11 }],
    });
  });

  it("zeigt einen eigenen Leertext, wenn nur der Filter nichts trifft", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    // Jede Option trifft fuer sich eine Zeile; erst beide zusammen treffen keine.
    await filterWaehlen("Nach Kategorie filtern", "Hygiene");
    await filterWaehlen("Nach Fach filtern", "B2");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(0);
    expect(document.body.textContent).toContain("Kein Artikel passt zum Filter.");
    expect(document.body.textContent).not.toContain("Keine Artikel vorhanden.");
  });

  it("zeigt eine fachliche Abweisung im Wortlaut, alles andere nicht", async () => {
    mocks.inventurKorrektur.mockResolvedValueOnce({ ok: false, fehler: INVENTUR_TEXTE.chargeUnpassend });
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "X");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => queryAll(".ant-alert-warning").length === 1, "Warnung");
    expect(query(".ant-alert-warning").textContent).toContain(INVENTUR_TEXTE.chargeUnpassend);
  });

  it("zählt aufgeklappt je Charge und schickt die Chargenposition", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await click("button[aria-label='Chargen Mullbinde anzeigen']");
    await fill("input[aria-label='Ist Charge L1']", "9");
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").disabled).toBe(true);
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").value).toBe("9");
    expect(query("tr[data-row-key='a1']").textContent).toContain("je Charge");
    await fill("input[aria-label='Kommentar']", "Charge");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Charge", umfang: null,
      positionen: [{ artikelId: "a1", chargen: [{ chargeId: "c1", ist: 9 }], neu: [] }],
    });
  });

  it("verlinkt nach dem Abschluss den gespeicherten Lauf", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "X");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => queryAll(".ant-alert-success").length === 1, "Erfolg");
    expect(query(".ant-alert-success a").getAttribute("href")).toBe("/verwaltung/inventur/verlauf/lauf-1");
  });
});

const PLUS = '[aria-label="Ist-Bestand Mullbinde erhöhen"]';
const MINUS = '[aria-label="Ist-Bestand Mullbinde verringern"]';

describe("±-Knöpfe", () => {
  it("erhöht und verringert den Ist-Wert über wertSetzen", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    const feld = query<HTMLInputElement>('[aria-label="Ist-Bestand Mullbinde"]');

    expect(feld.value).toBe("12");
    await click(PLUS);
    expect(feld.value).toBe("13");
    await click(MINUS);
    await click(MINUS);
    expect(feld.value).toBe("11");
  });

  /*
   * DIE EIGENSCHAFT, DIE HIER NICHT KAPUTTGEHEN DARF: `positionenAus` reicht
   * eine BERUEHRTE Zeile auch dann ein, wenn ihr Wert dem Seitenladebestand
   * entspricht -- der Server vergleicht gegen den LIVE-Bestand und verhindert
   * so Lost Updates. Plus-dann-Minus muss die Zeile also eingereicht lassen.
   * Wer hier "unveraenderte Zeilen herausfiltert", entfernt den Schutz.
   */
  it("lässt eine berührte Zeile eingereicht, auch wenn + und − sich aufheben", async () => {
    mocks.inventurKorrektur.mockResolvedValue({ ok: true, wert: { korrigiert: 0, inventurId: "lauf-0" } });
    await mount(<InventurForm zeilen={ZEILEN} />);
    await click(PLUS);
    await click(MINUS);
    await fill('[aria-label="Kommentar"]', "Quartalsinventur");
    await click('[data-rolle="abschluss"]');

    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Quartalsinventur",
      umfang: null,
      positionen: [{ artikelId: "a1", ist: 12 }],
    });
  });

  it("zählt eine aufgehobene Änderung nicht als Abweichung", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await click(PLUS);
    await click(MINUS);
    expect(query('[data-rolle="abschluss"]').textContent)
      .toContain("0 Abweichungen");
  });

  it("sperrt − bei 0 und + bei 9999", async () => {
    await mount(<InventurForm zeilen={[{ ...ZEILEN[0]!, bestand: 0 }]} />);
    expect(query(MINUS).hasAttribute("disabled")).toBe(true);
    expect(query(PLUS).hasAttribute("disabled")).toBe(false);
  });
});

describe("Inventurseite als RSC", () => {
  it("liefert force-dynamic und nur primitive Zeilenprops", async () => {
    const { dynamic, inventurSeitenInhalt } = await import("./page");
    const testDb = migrierteTestDb("lagerbuch-inventur-seite-");
    try {
      testDb.db.insert(artikel).values({
        id: "inventur-rsc",
        name: "RSC Mullbinde",
        einheit: "Stk",
        fach: "R1",
        mindestbestand: 3,
        aktiv: true,
        createdAt: new Date("2026-08-07T10:00:00Z"),
      }).run();

      const inhalt = inventurSeitenInhalt(testDb.db);
      const [form] = elementeVomTyp(inhalt, InventurForm);
      expect(form.props).toEqual({ zeilen: [{
        id: "inventur-rsc", name: "RSC Mullbinde", einheit: "Stk", fach: "R1",
        kategorie: null, mindestbestand: 3, bestand: 0, chargen: [],
      }] });
      expect(istRekursivJsonSicher(form.props)).toBe(true);
      expect(dynamic).toBe("force-dynamic");
    } finally {
      testDb.schliessen();
    }
  });
});
