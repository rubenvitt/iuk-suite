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
  click,
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { artikel } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { INVENTUR_TEXTE } from "../../../_lib/inventurTexte";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { zaehlOrtWert, type ZaehlOrt } from "../../../_lib/inventurOrt";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import { InventurForm } from "./InventurForm";

const ORTE: ZaehlOrt[] = [
  { id: null, label: "Ganzer Handlager" },
  { id: HANDLAGER_ID, label: "Nicht zugeordnet" },
  { id: "schrank-1", label: "Schrank 1" },
].map((o) => ({ ...o, schluessel: zaehlOrtWert(o.id) }));

/**
 * DRK-337 — die Faelle unten pruefen den ZAEHLSTAND, nicht die Ortsauswahl, und
 * bekommen deshalb die Vorgabe „ganzer Handlager". Ein Wrapper statt zweier
 * Vorgabewerte AM BAUTEIL: Vorgaben dort naehmen `page.tsx` die Pflicht ab, den
 * Ort zu uebergeben — und ein vergessener Ort waere dann eine Zaehlung gegen den
 * falschen Bestand, die kein Tor mehr meldet.
 */
function Formular({ zeilen, ortId = null, orte = ORTE }: {
  zeilen: InventurZeile[];
  ortId?: string | null;
  orte?: ZaehlOrt[];
}) {
  return <InventurForm zeilen={zeilen} ortId={ortId} orte={orte} />;
}

const mocks = vi.hoisted(() => ({
  inventurKorrektur: vi.fn(),
  setzeUrl: vi.fn(),
}));

vi.mock("../../../_actions/inventur", () => ({
  inventurKorrektur: (...args: unknown[]) => mocks.inventurKorrektur(...args),
}));

/**
 * DRK-337 — die Ortsauswahl schreibt den URL-Parameter. Gemockt wird
 * `useUrlFilter`, NICHT `next/navigation`: das Formular rendert daneben ein
 * `next/link`, und ein Ersatz fuer das ganze Navigationsmodul naehme ihm
 * Bausteine weg, die es selbst braucht. Was hier geprueft wird, ist ohnehin die
 * Wirkung — welcher Parameter geschrieben wird —, nicht der Router darunter.
 */
vi.mock("../../../_ui/useUrlFilter", () => ({
  useUrlFilter: () => mocks.setzeUrl,
}));

const ZEILEN: InventurZeile[] = [
  { id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: "Hygiene", mindestbestand: 5, bestand: 12,
    chargen: [{ id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 12, ampel: "gelb" }] },
  { id: "a2", name: "Pflaster", einheit: "Pkg", fach: "B2", kategorie: null, mindestbestand: 0, bestand: 4, chargen: [] },
];

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
 * Waehlt im antd-`Select` mit diesem `aria-label` die Option mit diesem Text.
 *
 * ⚠️ `mousedown`, NICHT `click`: rc-select oeffnet die Liste am `mousedown` des
 * Feldes — ein blosser Klick laesst sie zu, und die Option gibt es dann gar
 * nicht. Dieselbe Naht wie in `ArtikelDrawer.test.tsx` und
 * `TemplateVerknuepfung.test.tsx`.
 */
async function ortWaehlen(text: string): Promise<void> {
  const feld = query<HTMLInputElement>("[aria-label='Zählort']");
  await act(async () => {
    feld.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((element) => (element.textContent ?? "") === text);
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

function spaltenkopf(beschriftung: string): HTMLElement {
  const kopf = queryAll("thead th").find((zelle) => (zelle.textContent ?? "").includes(beschriftung));
  if (!kopf) throw new Error(`Kein Spaltenkopf: ${beschriftung}`);
  return kopf;
}

/**
 * Oeffnet den Filter IM SPALTENKOPF und kreuzt die Option mit genau diesem Text an —
 * echte Bedienung, kein vorgetaeuschter Zustand.
 *
 * ⚠️ MIT DRK-333 IST DAS DER GANZE UNTERSCHIED ZU FRUEHER: bis dahin standen zwei
 * `Select` UEBER der Tabelle, und dieselben Faelle bedienten sie ueber ihr
 * `aria-label`. Die Zusicherungen darunter sind unveraendert geblieben — was
 * gefiltert wird, was ausgeblendet trotzdem gebucht wird und was als Umfang in den
 * append-only Verlauf geht.
 */
async function filterWaehlen(spalte: string, text: string): Promise<void> {
  const ausloeser = spaltenkopf(spalte).querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!ausloeser) throw new Error(`Spalte ohne Filter: ${spalte}`);
  await clickElement(ausloeser);
  await warte();
  /*
   * ⚠️ NUR IM OFFENEN MENUE SUCHEN. antd laesst das Menue der zuvor bedienten Spalte
   * als `.ant-dropdown-hidden` im Portal stehen; eine Suche ueber `document.body`
   * fand dort gemessen das falsche „OK" und setzte den ERSTEN Filter zurueck —
   * der Fall „beide Filter zusammen treffen nichts" zeigte dann eine Zeile.
   */
  const menue = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown"),
  ).find((element) => !element.closest(".ant-dropdown-hidden"));
  if (!menue) throw new Error(`Filtermenue oeffnet nicht: ${spalte}`);
  const punkt = Array.from(menue.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item"))
    .find((element) => (element.textContent ?? "") === text);
  if (!punkt) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(punkt);
  const ok = Array.from(
    menue.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown-btns button"),
  ).find((knopf) => knopf.textContent === "OK");
  if (!ok) throw new Error("Kein OK im Filtermenue");
  await clickElement(ok);
  await warte();
}

describe("InventurForm — Tabelle und Eingabe", () => {
  it("rendert exakt acht Spalten, stabile IDs und die verbindlichen Tabellenprops", async () => {
    await mount(<Formular zeilen={ZEILEN} />);

    /*
     * Leere Koepfe (antd-Aufklappspalte, Task 6) zaehlen nicht als Spalte.
     * ⚠️ „Kategorie" ist mit DRK-333 dazugekommen: der Filter aus der Leiste ueber
     * der Tabelle gehoert in den Kopf der Spalte, die er betrifft — und eine
     * Kategorie, nach der man filtern kann, muss man auch lesen koennen.
     */
    expect(queryAll("thead th").map((zelle) => zelle.textContent).filter((t) => t)).toEqual([
      "Artikel",
      "Kategorie",
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
    // `pagination={false}` und `scroll={{ x: "max-content" }}` standen bis zur
    // Umstellung auf `@/core/tabelle` hier im Quelltext. Beides ist jetzt
    // Vorgabe der `Datentabelle`; geprueft wird die WIRKUNG am DOM.
    expect(queryAll(".ant-pagination")).toHaveLength(0);
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
  });

  /**
   * ⚠️ DER BEWEIS, DASS DER BESTAND UEBER DIE ZAHL SORTIERT.
   * Gezeigt wird „3 Stk"; als Zeichenkette stuende „12 Stk" vor „3 Stk".
   */
  it("sortiert den Bestand über die Zahl, nicht über den Anzeigetext", async () => {
    await mount(<Formular zeilen={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((zelle) => (zelle.textContent ?? "").includes("Bestand"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);

    const sortiert = queryAll("tbody tr[data-row-key]")
      .map((zeile) => zeile.getAttribute("data-row-key"));
    const erwartet = [...ZEILEN]
      .sort((a, b) => a.bestand - b.bestand)
      .map((zeile) => zeile.id);
    expect(sortiert).toEqual(erwartet);
  });

  it("zeigt einen fachlichen Leertext statt einer leeren Tabellenattrappe", async () => {
    await mount(<Formular zeilen={[]} />);
    expect(document.body.textContent).toContain("Keine Artikel vorhanden.");
  });

  it("erlaubt 0 bis 9999 und zeigt Abweichungen mit ASCII-Vorzeichen im Text", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    const feld = query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']");
    expect(feld.getAttribute("aria-valuemin")).toBe("0");
    expect(feld.getAttribute("aria-valuemax")).toBe("9999");

    await fill("input[aria-label='Ist-Bestand Pflaster']", "6");
    expect(document.body.textContent).toContain("+2");
    await fill("input[aria-label='Ist-Bestand Pflaster']", "1");
    expect(document.body.textContent).toContain("-3");
  });

  it("sperrt ohne Kommentar oder ohne berührte Position", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    const knopf = query<HTMLButtonElement>("button[data-rolle='abschluss']");
    expect(knopf.disabled).toBe(true);
    await fill("input[aria-label='Kommentar']", "Quartalsinventur");
    expect(knopf.disabled).toBe(true);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    expect(knopf.disabled).toBe(false);
  });

  it("sendet auch 0 und eine berührt-unveränderte Position, aber nie unberührte IDs", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "12");
    await fill("input[aria-label='Ist-Bestand Pflaster']", "0");
    await fill("input[aria-label='Kommentar']", "  Quartalsinventur  ");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");

    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Quartalsinventur",
      ortId: null,
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
    await mount(<Formular zeilen={ZEILEN} />);
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
    await mount(<Formular zeilen={ZEILEN} />);
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
    await mount(<Formular zeilen={ZEILEN} />);
    const zeile = query("tr[data-row-key='a1']");
    expect(zeile.textContent).toContain("10/26");
    expect(zeile.textContent).toContain("5");
  });

  it("behält einen gezählten Wert, wenn der Filter die Zeile ausblendet, und bucht ihn mit", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Pflaster']", "3");
    await filterWaehlen("Fach", "A1");
    expect(queryAll("tr[data-row-key='a2']")).toHaveLength(0);
    expect(query("[data-rolle='ausgeblendet-hinweis']").textContent).toContain("1 gezählte Position ist ausgeblendet");
    await fill("input[aria-label='Kommentar']", "Teil");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Teil",
      ortId: null,
      umfang: { kategorien: [], faecher: ["A1"] },
      positionen: [{ artikelId: "a2", ist: 3 }],
    });
  });

  /*
   * Der Verlauf ist append-only: ein versehentlich geschriebener Schluessel
   * („hygiene") stuende dort fuer immer. Der Umfang traegt deshalb das LABEL.
   */
  it("legt einen Kategorienfilter als Label, nicht als gefalteten Schlüssel, in den Umfang", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    await filterWaehlen("Kategorie", "Hygiene");
    expect(queryAll("tr[data-row-key='a2']")).toHaveLength(0);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "Hygiene");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Hygiene",
      ortId: null,
      umfang: { kategorien: ["Hygiene"], faecher: [] },
      positionen: [{ artikelId: "a1", ist: 11 }],
    });
  });

  it("zeigt die Kategorie in ihrer eigenen Spalte und „—“, wo keine vergeben ist", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    expect(query("tr[data-row-key='a1']").textContent).toContain("Hygiene");
    expect(query("tr[data-row-key='a2'] td:nth-child(3)").textContent).toBe("—");
  });

  /**
   * ⚠️ DER ZAEHLER IST ABGELEITET, NICHT GEMERKT (Falle 15). Der naheliegende Weg
   * waere `onChange(…, extra.currentDataSource)` — und der feuert NUR bei Bedienung
   * der Tabelle. Laedt die Seite daneben einen neuen Serverstand, filtert antd zwar
   * korrekt neu, meldet es aber nicht; die Zahl bliebe still auf dem alten Stand.
   * Dieser Fall aendert deshalb die Datenquelle, OHNE die Tabelle anzufassen.
   */
  it("rechnet den Zähler nach, wenn sich die Zeilen ändern statt die Tabelle", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    // Ungefiltert sagt die Trefferanzeige nichts — „2 von 2" waere Laerm.
    expect(queryAll("[data-testid='trefferanzeige']")).toHaveLength(0);

    await filterWaehlen("Fach", "A1");
    expect(query("[data-testid='trefferanzeige']").textContent).toBe("1 von 2");

    await rerender(
      <Formular
        zeilen={[
          ...ZEILEN,
          { id: "a3", name: "Kompresse", einheit: "Stk", fach: "A1", kategorie: "Hygiene",
            mindestbestand: 1, bestand: 7, chargen: [] },
        ]}
      />,
    );
    await warte();
    expect(query("[data-testid='trefferanzeige']").textContent, "gemerkt statt gerechnet")
      .toBe("2 von 3");
  });

  it("zeigt einen eigenen Leertext, wenn nur der Filter nichts trifft", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    // Jede Option trifft fuer sich eine Zeile; erst beide zusammen treffen keine.
    await filterWaehlen("Kategorie", "Hygiene");
    await filterWaehlen("Fach", "B2");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(0);
    expect(document.body.textContent).toContain("Kein Artikel passt zum Filter.");
    expect(document.body.textContent).not.toContain("Keine Artikel vorhanden.");
  });

  it("zeigt eine fachliche Abweisung im Wortlaut, alles andere nicht", async () => {
    mocks.inventurKorrektur.mockResolvedValueOnce({ ok: false, fehler: INVENTUR_TEXTE.chargeUnpassend });
    await mount(<Formular zeilen={ZEILEN} />);
    await fill("input[aria-label='Ist-Bestand Mullbinde']", "11");
    await fill("input[aria-label='Kommentar']", "X");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => queryAll(".ant-alert-warning").length === 1, "Warnung");
    expect(query(".ant-alert-warning").textContent).toContain(INVENTUR_TEXTE.chargeUnpassend);
  });

  it("zählt aufgeklappt je Charge und schickt die Chargenposition", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    await click("button[aria-label='Chargen Mullbinde anzeigen']");
    await fill("input[aria-label='Ist Charge L1']", "9");
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").disabled).toBe(true);
    expect(query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']").value).toBe("9");
    expect(query("tr[data-row-key='a1']").textContent).toContain("je Charge");
    await fill("input[aria-label='Kommentar']", "Charge");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");
    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Charge", ortId: null, umfang: null,
      positionen: [{ artikelId: "a1", chargen: [{ chargeId: "c1", ist: 9 }], neu: [] }],
    });
  });

  it("zeigt eine Chargensumme über 9999 ohne die Fehlerfarbe (Falle 3, docs/design/README.md)", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    await click("button[aria-label='Chargen Mullbinde anzeigen']");
    await fill("input[aria-label='Ist Charge L1']", "12000");
    const summenFeld = query<HTMLInputElement>("input[aria-label='Ist-Bestand Mullbinde']");
    expect(summenFeld.value).toBe("12000");
    expect(summenFeld.closest(".ant-input-number")?.classList.contains("ant-input-number-out-of-range"))
      .toBe(false);
  });

  it("verlinkt nach dem Abschluss den gespeicherten Lauf", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
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
    await mount(<Formular zeilen={ZEILEN} />);
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
    await mount(<Formular zeilen={ZEILEN} />);
    await click(PLUS);
    await click(MINUS);
    await fill('[aria-label="Kommentar"]', "Quartalsinventur");
    await click('[data-rolle="abschluss"]');

    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Quartalsinventur",
      ortId: null,
      umfang: null,
      positionen: [{ artikelId: "a1", ist: 12 }],
    });
  });

  it("zählt eine aufgehobene Änderung nicht als Abweichung", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    await click(PLUS);
    await click(MINUS);
    expect(query('[data-rolle="abschluss"]').textContent)
      .toContain("0 Abweichungen");
  });

  it("sperrt − bei 0 und + bei 9999", async () => {
    await mount(<Formular zeilen={[{ ...ZEILEN[0]!, bestand: 0 }]} />);
    expect(query(MINUS).hasAttribute("disabled")).toBe(true);
    expect(query(PLUS).hasAttribute("disabled")).toBe(false);
  });
});

/**
 * DRK-337 — DIE ORTSAUSWAHL.
 *
 * ⚠️ WAS JSDOM HIER NICHT SIEHT und deshalb `e2e/lagerbuch-inventur.spec.ts`
 * misst: dass der Wechsel die Insel ueber `key` neu einsteigen laesst. Dieser
 * Riegel sitzt in `page.tsx`, nicht im Formular — hier laesst sich nur pruefen,
 * dass das Formular ihn ueberhaupt ausloest (der URL-Schreibvorgang) und dass
 * es einen laufenden Zaehlstand nicht unter der Hand verwirft.
 */
describe("InventurForm — Zählort (DRK-337)", () => {
  it("zeigt ohne Ortswahl „Ganzer Handlager“ und schreibt den gewählten Schrank in die URL", async () => {
    await mount(<Formular zeilen={ZEILEN} />);
    expect(query("[aria-label='Zählort']").closest(".ant-select")?.textContent)
      .toContain("Ganzer Handlager");

    await ortWaehlen("Schrank 1");
    /*
     * ⚠️ MIT PRAEFIX (DRK-371). Die rohe Kennung stuende im selben Wertebereich
     * wie der Waechter `alle`; ein importierter Schrank mit genau dieser Kennung
     * waere dann nicht waehlbar, und sein Klick zaehlte den ganzen Handlager.
     */
    expect(mocks.setzeUrl).toHaveBeenCalledWith({ ort: "ort:schrank-1" });
  });

  /**
   * `alle` ist die Vorgabe: ein LEERER Wert loescht den Parameter
   * (`useUrlFilter`). Stuende `?ort=alle` in der Adresse, traege ein geteilter
   * Link eine Angabe, die nichts aendert — und beim naechsten Ticket haette
   * jemand zwei Schreibweisen fuer denselben Zustand zu beruecksichtigen.
   */
  it("nimmt die Vorgabe wieder aus der URL heraus", async () => {
    await mount(<Formular zeilen={ZEILEN} ortId="schrank-1" />);
    await ortWaehlen("Ganzer Handlager");
    expect(mocks.setzeUrl).toHaveBeenCalledWith({ ort: "" });
  });

  /**
   * ⚠️ DER RIEGEL. Der Wechsel steigt die Insel neu ein und verwirft damit den
   * Zaehlstand. Passierte das unter der Hand, waeren die Zahlen weg, die jemand
   * gerade vor einem Schrank erfasst hat — und das faellt erst auf, wenn die
   * Liste schon zu ist.
   */
  it("sperrt die Auswahl, sobald gezählt ist, und gibt sie nach dem Verwerfen frei", async () => {
    await mount(<Formular zeilen={ZEILEN} ortId="schrank-1" />);
    expect(query("[aria-label='Zählort']").hasAttribute("disabled")).toBe(false);

    await fill("input[aria-label='Ist-Bestand Pflaster']", "6");
    expect(query("[aria-label='Zählort']").hasAttribute("disabled")).toBe(true);
    expect(query("[data-rolle='ort-gesperrt']").textContent)
      .toBe("1 Position ist gezählt — der Zählort ist bis zum Abschluss festgelegt.");

    await click("[data-rolle='zaehlung-verwerfen']");
    expect(query("[aria-label='Zählort']").hasAttribute("disabled")).toBe(false);
    expect(queryAll("[data-rolle='ort-gesperrt']")).toHaveLength(0);
    expect(query('[data-rolle="abschluss"]').hasAttribute("disabled")).toBe(true);
  });

  it("sendet den gewählten Ort als Kennung mit, nicht als Namen", async () => {
    await mount(<Formular zeilen={ZEILEN} ortId="schrank-1" />);
    await fill("input[aria-label='Ist-Bestand Pflaster']", "6");
    await fill("input[aria-label='Kommentar']", "Schrank 1");
    await click("button[data-rolle='abschluss']");
    await warteAuf(() => mocks.inventurKorrektur.mock.calls.length === 1, "Inventur-Action");

    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Schrank 1",
      ortId: "schrank-1",
      umfang: null,
      positionen: [{ artikelId: "a2", ist: 6 }],
    });
  });

  it("nennt den Ort im Leertext einer Zeile ohne Charge", async () => {
    await mount(<Formular zeilen={ZEILEN} ortId="schrank-1" />);
    await clickElement(query("button[aria-label='Chargen Pflaster anzeigen']"));
    await warte();
    expect(document.body.textContent).toContain("Keine Charge mit Bestand an diesem Zählort.");
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
          id: "inventur-rsc", name: "RSC Mullbinde", einheit: "Stk", fach: "R1",
          kategorie: null, mindestbestand: 3, bestand: 0, chargen: [],
        }],
        // DRK-337: ohne Suchparameter der ganze Handlager — das Verhalten vor
        // diesem Ticket. Die Auswahl kennt ausserdem die Wurzel als eigenen Ort.
        ortId: null,
        // ⚠️ `null` UND NICHT `"alle"` (DRK-371): der Waechter steht ausserhalb
        // des Wertebereichs der Lagerort-Kennungen, sonst waere ein Schrank mit
        // der Kennung `alle` von ihm nicht zu unterscheiden.
        orte: [
          { id: null, schluessel: "alle", label: "Ganzer Handlager" },
          { id: "handlager", schluessel: "ort:handlager", label: "Nicht zugeordnet" },
        ],
      });
      expect(istRekursivJsonSicher(form.props)).toBe(true);
      expect(dynamic).toBe("force-dynamic");
    } finally {
      testDb.schliessen();
    }
  });

  /**
   * DRK-337 — DER ORT KOMMT AUS DER URL, und die Seite rechnet die
   * Erwartungszahlen dafuer aus. Der `key` ist dabei kein Schoenheitsfehler,
   * sondern der Riegel: ohne ihn behielte die Insel ihren Zaehlstand ueber den
   * Ortswechsel hinweg und buchte in Schrank 1 gezaehlte Werte gegen Schrank 2.
   */
  it("grenzt Zeilen, Auswahl und Insel-key auf den Ort aus den Suchparametern ein", async () => {
    const { inventurSeitenInhalt } = await import("./page");
    const { buchungen, chargen, lagerorte } = await import("../../../_db/schema");
    const testDb = migrierteTestDb("lagerbuch-inventur-seite-ort-");
    try {
      testDb.db.insert(lagerorte).values([
        { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null, aktiv: true,
          templateId: null, parentId: "handlager", sortierung: 10 },
        { id: "schrank-alt", name: "Altschrank", typ: "lager", kennung: null, aktiv: false,
          templateId: null, parentId: "handlager", sortierung: 20 },
      ]).run();
      testDb.db.insert(artikel).values({
        id: "a-ort", name: "Ortsartikel", einheit: "Stk", fach: "R1",
        mindestbestand: 0, aktiv: true, createdAt: new Date("2026-08-07T10:00:00Z"),
      }).run();
      testDb.db.insert(chargen).values({
        id: "c-ort", artikelId: "a-ort", chargenNr: "L1", verfall: "2029-01",
        createdAt: new Date("2026-08-07T10:00:00Z"),
      }).run();
      for (const [ort, menge] of [["handlager", 4], ["schrank-1", 6]] as const) {
        testDb.db.insert(buchungen).values({
          id: `b-${ort}`, ts: new Date("2026-08-07T10:00:00Z"), typ: "zugang",
          artikelId: "a-ort", chargeId: "c-ort", lagerortId: ort, menge,
          quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null,
        }).run();
      }

      const jetzt = new Date("2026-09-14T10:00:00Z");
      const [schrank] = elementeVomTyp(
        inventurSeitenInhalt(testDb.db, jetzt, { ort: "ort:schrank-1" }), InventurForm,
      );
      expect(schrank.props).toMatchObject({ ortId: "schrank-1" });
      expect((schrank.props as { zeilen: InventurZeile[] }).zeilen[0]!.bestand).toBe(6);
      expect(schrank.key).toBe("ort:schrank-1");
      // Ein stillgelegter Schrank steht NICHT zur Wahl — er haelt aber weiter
      // Bestand und bleibt ueber die URL erreichbar.
      expect((schrank.props as { orte: ZaehlOrt[] }).orte.map((o) => o.id))
        .toEqual([null, "handlager", "schrank-1"]);

      // Die Wurzel meint NUR die Wurzel: „noch keinem Schrank zugeordnet".
      const [wurzel] = elementeVomTyp(
        inventurSeitenInhalt(testDb.db, jetzt, { ort: "ort:handlager" }), InventurForm,
      );
      expect((wurzel.props as { zeilen: InventurZeile[] }).zeilen[0]!.bestand).toBe(4);

      /*
       * ⚠️ EIN UNBEKANNTER ORT IST HIER KEIN FEHLER, sondern faellt auf den
       * ganzen Handlager zurueck (wie `checks/page.tsx` mit einem unbekannten
       * Fahrzeug). Die Action ist an derselben Stelle STRENGER — dort wuerde
       * derselbe Rueckfall gegen einen anderen Bestand buchen als gezaehlt.
       */
      const [fremd] = elementeVomTyp(
        inventurSeitenInhalt(testDb.db, jetzt, { ort: "ort:rtw-1" }), InventurForm,
      );
      expect(fremd.props).toMatchObject({ ortId: null });
      expect((fremd.props as { zeilen: InventurZeile[] }).zeilen[0]!.bestand).toBe(10);
      expect(fremd.key).toBe("alle");

      /*
       * ⚠️ EIN WIEDERHOLTER PARAMETER WIRFT NICHT (Codex-Befund zum PR).
       * `?ort=a&ort=b` liefert ein ARRAY; die Seite fiel damit mit HTTP 500 aus,
       * und weder `typecheck` noch `build` sahen es. Zwei verschiedene Orte sind
       * kein Zustand, den diese Seite darstellen kann — sie faellt auf die
       * Vorgabe zurueck. Die Form pruefen `inventurOrt.test.ts`, hier steht,
       * dass die SEITE damit noch rendert.
       */
      const doppelt = () => inventurSeitenInhalt(
        testDb.db, jetzt, { ort: ["ort:schrank-1", "ort:handlager"] },
      );
      expect(doppelt).not.toThrow();
      expect(elementeVomTyp(doppelt(), InventurForm)[0]!.props).toMatchObject({ ortId: null });

      // Ein stillgelegter Schrank aus der URL bleibt waehlbar, damit die
      // Auswahl nicht einen Ort anzeigt, den sie nicht kennt.
      const [alt] = elementeVomTyp(
        inventurSeitenInhalt(testDb.db, jetzt, { ort: "ort:schrank-alt" }), InventurForm,
      );
      expect((alt.props as { orte: ZaehlOrt[] }).orte.map((o) => o.id))
        .toEqual([null, "handlager", "schrank-1", "schrank-alt"]);
    } finally {
      testDb.schliessen();
    }
  });

  /**
   * DRK-371 — DER SCHRANK, DER WIE DER WAECHTER HEISST.
   *
   * ⚠️ DAS IST KEIN NAMENSWITZ, SONDERN DER EINZIGE ABRUF, DER DEN FEHLER
   * ZEIGTE. Kennungen des importierten Altbestands sind beliebige
   * Zeichenketten; keine wird beim Import neu vergeben. Solange Waechter und
   * Kennung denselben Wertebereich teilten, zaehlte `?ort=alle` den GANZEN
   * Handlager statt diesen einen Schrank — samt der Korrekturbuchungen, die aus
   * der Zaehlung folgen —, und die Seite sah dabei richtig aus.
   *
   * ⚠️ DER `key` GEHOERT MIT IN DIE ZUSICHERUNG. Er war der zweite Ort
   * derselben Ueberschneidung: `ortId ?? "alle"` gab diesem Schrank denselben
   * Schluessel wie „ganzer Handlager", und die Insel haette beim Wechsel ihren
   * Zaehlstand behalten — also Werte aus dem einen Bereich gegen die
   * Erwartungszahlen des anderen gebucht.
   */
  it("macht den Schrank mit der Kennung „alle“ wählbar und zählt nur ihn", async () => {
    const { inventurSeitenInhalt } = await import("./page");
    const { buchungen, chargen, lagerorte } = await import("../../../_db/schema");
    const testDb = migrierteTestDb("lagerbuch-inventur-seite-alle-");
    try {
      testDb.db.insert(lagerorte).values({
        id: "alle", name: "Importschrank", typ: "lager", kennung: null, aktiv: true,
        templateId: null, parentId: "handlager", sortierung: 10,
      }).run();
      testDb.db.insert(artikel).values({
        id: "a-alle", name: "Ortsartikel", einheit: "Stk", fach: "R1",
        mindestbestand: 0, aktiv: true, createdAt: new Date("2026-08-07T10:00:00Z"),
      }).run();
      testDb.db.insert(chargen).values({
        id: "c-alle", artikelId: "a-alle", chargenNr: "L1", verfall: "2029-01",
        createdAt: new Date("2026-08-07T10:00:00Z"),
      }).run();
      for (const [ort, menge] of [["handlager", 4], ["alle", 6]] as const) {
        testDb.db.insert(buchungen).values({
          id: `b-${ort}`, ts: new Date("2026-08-07T10:00:00Z"), typ: "zugang",
          artikelId: "a-alle", chargeId: "c-alle", lagerortId: ort, menge,
          quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null,
        }).run();
      }

      const jetzt = new Date("2026-09-14T10:00:00Z");
      const [schrank] = elementeVomTyp(
        inventurSeitenInhalt(testDb.db, jetzt, { ort: "ort:alle" }), InventurForm,
      );
      expect(schrank.props).toMatchObject({ ortId: "alle" });
      // 6 und nicht 10: gezaehlt wird der Schrank, nicht der ganze Handlager.
      expect((schrank.props as { zeilen: InventurZeile[] }).zeilen[0]!.bestand).toBe(6);
      expect(schrank.key).toBe("ort:alle");
      // Er steht als eigene Zeile neben dem Waechter, nicht statt seiner.
      expect((schrank.props as { orte: ZaehlOrt[] }).orte.map((o) => o.id))
        .toEqual([null, "handlager", "alle"]);

      // Der Waechter meint weiterhin den ganzen Handlager — 4 + 6.
      const [ganz] = elementeVomTyp(
        inventurSeitenInhalt(testDb.db, jetzt, { ort: "alle" }), InventurForm,
      );
      expect(ganz.props).toMatchObject({ ortId: null });
      expect((ganz.props as { zeilen: InventurZeile[] }).zeilen[0]!.bestand).toBe(10);
      expect(ganz.key).toBe("alle");
      expect(schrank.key).not.toBe(ganz.key);
    } finally {
      testDb.schliessen();
    }
  });
});
