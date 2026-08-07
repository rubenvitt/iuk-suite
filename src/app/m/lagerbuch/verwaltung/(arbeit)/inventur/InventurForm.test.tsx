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
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { artikel } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import {
  InventurForm,
  positionenAus,
  type InventurZeile,
} from "./InventurForm";

const mocks = vi.hoisted(() => ({
  inventurKorrektur: vi.fn(),
}));

vi.mock("../../../_actions/inventur", () => ({
  inventurKorrektur: (...args: unknown[]) => mocks.inventurKorrektur(...args),
}));

const ZEILEN: InventurZeile[] = [
  { id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", bestand: 12 },
  { id: "a2", name: "Pflaster", einheit: "Pkg", fach: "B2", bestand: 4 },
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
    wert: { korrigiert: 1 },
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

describe("positionenAus — Lost-Update-Riegel", () => {
  it("schickt ausschließlich berührte IDs", () => {
    expect(positionenAus({ a1: 11 })).toEqual([{ artikelId: "a1", ist: 11 }]);
    expect(positionenAus({})).toEqual([]);
  });

  it("behält berührt-und-unverändert sowie die Randwerte 0 und 9999", () => {
    expect(positionenAus({ a1: 12, a2: 0, a3: 9999 })).toEqual([
      { artikelId: "a1", ist: 12 },
      { artikelId: "a2", ist: 0 },
      { artikelId: "a3", ist: 9999 },
    ]);
  });
});

describe("InventurForm — Tabelle und Eingabe", () => {
  it("rendert exakt fünf Spalten, stabile IDs und die verbindlichen Tabellenprops", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);

    expect(queryAll("thead th").map((zelle) => zelle.textContent)).toEqual([
      "Artikel",
      "Fach",
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
      positionen: [
        { artikelId: "a1", ist: 12 },
        { artikelId: "a2", ist: 0 },
      ],
    });
  });
});

describe("InventurForm — asynchroner Abschluss", () => {
  it("behält Werte bis zum Resolve, sperrt Doppelklicks und leert erst bei Erfolg", async () => {
    let fertig!: (wert: { ok: true; wert: { korrigiert: number } }) => void;
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

    await act(async () => { fertig({ ok: true, wert: { korrigiert: 1 } }); });
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
      expect(form.props).toEqual({
        zeilen: [{
          id: "inventur-rsc",
          name: "RSC Mullbinde",
          einheit: "Stk",
          fach: "R1",
          bestand: 0,
        }],
      });
      expect(istRekursivJsonSicher(form.props)).toBe(true);
      expect(dynamic).toBe("force-dynamic");
    } finally {
      testDb.schliessen();
    }
  });
});
