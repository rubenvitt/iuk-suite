// @vitest-environment jsdom

import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { existsSync, readFileSync } from "node:fs";
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
import {
  TokenTable,
  sucheTrifft,
  zielVon,
  type TokenAnzeigeZeile,
} from "./TokenTable";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import TokensSeite, { dynamic, tokenAnzeigeZeilen } from "./page";

/**
 * ⚠️ ENTSCHEIDUNG 8-F (T160): Hier standen bis T160 eine `LoeschProbeProps`,
 * ein Mock fuer `_ui/LoeschButton` und drei Mocks fuer `_actions/loeschen`.
 * Sie sind mit dem `LoeschButton`-AUFRUF entfallen — diese Seite kennt keinen
 * Loeschweg mehr. `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx` selbst
 * bleiben unangetastet; fuenf andere Verwaltungsseiten benutzen sie weiter.
 */
const mocks = vi.hoisted(() => ({
  setTokenAktiv: vi.fn(),
  setzeOrtCodeZurueck: vi.fn(),
  refresh: vi.fn(),
  getDb: vi.fn(),
  tokenListe: vi.fn(),
  etikettOrte: vi.fn(),
}));

vi.mock("../../../_actions/tokens", () => ({
  setTokenAktiv: (...args: unknown[]) => mocks.setTokenAktiv(...args),
}));

vi.mock("../../../_actions/ortCodes", () => ({
  setzeOrtCodeZurueck: (...args: unknown[]) => mocks.setzeOrtCodeZurueck(...args),
}));

vi.mock("../../../_lib/lesepfade/ortEtiketten", () => ({
  etikettOrte: (...args: unknown[]) => mocks.etikettOrte(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../../../_db/client", () => ({
  getDb: (...args: unknown[]) => mocks.getDb(...args),
}));

vi.mock("../../../_lib/lesepfade/tokens", () => ({
  tokenListe: (...args: unknown[]) => mocks.tokenListe(...args),
}));

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4), Vorbild
 * `_lib/pwaIcons.test.ts:19-39`. Der 8-F-Scan weiter unten waere sonst rot an
 * seiner eigenen Begruendung: `TokenTable.tsx` erklaert im Kopfkommentar der
 * Komponente woertlich, dass der `LoeschButton`-Aufruf samt `pruefeLoeschbar`
 * und `loescheElement` entfallen ist — und genau diese Woerter sucht der Scan.
 * Der Kommentar wird NICHT umformuliert, um einen Test gruen zu machen.
 * `bauform.test.ts` exportiert die Funktion nicht, deshalb die lokale Kopie.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const FAHRZEUG = {
  id: "t1",
  code: "111-111",
  label: "RTW 1 Kärtchen",
  aktiv: true,
  lastUsedText: "30.07.2026, 12:00:00",
  lastUsedIso: "2026-07-30T10:00:00.000Z",
  ortId: "rtw-1",
  ortName: "RTW 1",
  ortMeta: "Fahrzeug · MS-1",
  zuruecksetzbar: true,
  ersetztText: null,
  zielTyp: "fahrzeug" as const,
  zielId: "rtw-1",
  zielName: "RTW 1",
  zielMeta: "Fahrzeug · MS-1",
  zielEinheitenart: "fahrzeug",
} satisfies TokenAnzeigeZeile;

/**
 * DRK-309 — EIN KAERTCHEN AN EINER TASCHE, und sie traegt die Art WEDER im
 * Namen NOCH in einer Kennung. Genau dafuer steht das Feld: `zielTyp` ist auch
 * hier „fahrzeug", der Name hilft nicht, und ohne `zielEinheitenart` bekaeme
 * die Zeile den Lastwagen und waere ueber „tasche" nicht zu finden.
 */
const TASCHE = {
  id: "t4",
  code: "444-444",
  label: "Rucksack Kärtchen",
  aktiv: true,
  lastUsedText: "nie benutzt",
  lastUsedIso: null,
  ortId: "rucksack-1",
  ortName: "Rucksack Betreuung",
  ortMeta: "Tasche",
  zuruecksetzbar: true,
  ersetztText: null,
  zielTyp: "fahrzeug" as const,
  zielId: "rucksack-1",
  zielName: "Rucksack Betreuung",
  zielMeta: "Tasche",
  zielEinheitenart: "tasche",
} satisfies TokenAnzeigeZeile;

const ARTIKEL = {
  id: "t2",
  code: "222-222",
  label: "Verband direkt",
  aktiv: false,
  lastUsedText: "nie benutzt",
  lastUsedIso: null,
  ortId: null,
  ortName: null,
  ortMeta: null,
  zuruecksetzbar: false,
  ersetztText: null,
  zielTyp: "artikel" as const,
  zielId: "a1",
  zielName: "Ärzte-Verband",
  zielMeta: null,
  zielEinheitenart: null,
} satisfies TokenAnzeigeZeile;

const LISTE = {
  id: "t3",
  code: "333-333",
  label: "Regalrunde",
  aktiv: true,
  lastUsedText: "nie benutzt",
  lastUsedIso: null,
  ortId: null,
  ortName: null,
  ortMeta: null,
  zuruecksetzbar: false,
  ersetztText: null,
  zielTyp: null,
  zielId: null,
  zielName: null,
  zielMeta: null,
  zielEinheitenart: null,
} satisfies TokenAnzeigeZeile;

/**
 * DER HANDLAGER-CODE — DRK-406, und er ist die Zeile, an der jede Annahme
 * dieser Tabelle bricht, die „Ortscode" mit „Einheit" gleichsetzt: er GEHÖRT
 * einem Ort und hat trotzdem KEIN Ziel. `ortName` trägt seinen einzigen
 * Namen; wer ihn über die Zielspalte sucht, findet nichts.
 */
const HANDLAGER = {
  id: "t5",
  code: "555-555",
  label: "Handlager",
  aktiv: true,
  lastUsedText: "nie benutzt",
  lastUsedIso: null,
  ortId: "handlager",
  ortName: "Handlager",
  ortMeta: "Lager",
  zuruecksetzbar: true,
  ersetztText: null,
  zielTyp: null,
  zielId: null,
  zielName: null,
  zielMeta: null,
  zielEinheitenart: null,
} satisfies TokenAnzeigeZeile;

/*
 * ⚠️ MIT DEM ANLEGEDIALOG SIND FÜNF HILFSFUNKTIONEN ENTFALLEN (DRK-406):
 * `oeffneNeuToken`, `portalFeldSetzen`, `zielartWaehlen`, `zielWaehlen` und
 * `tokenFormAbsenden`. Sie bedienten ein Formular, das es nicht mehr gibt —
 * `lint` meldete sie als unbenutzt, und eine aufbewahrte Bedienhilfe für eine
 * entfernte Fläche liest sich beim nächsten Mal wie eine Fläche, die es noch
 * gibt.
 */
const ZEILEN = [FAHRZEUG, ARTIKEL, LISTE];
const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setTokenAktiv.mockResolvedValue({ ok: true });
  mocks.setzeOrtCodeZurueck.mockResolvedValue({ ok: true, wert: { code: "999-999" } });
  mocks.getDb.mockReturnValue({ kennung: "token-test-db" });
  mocks.tokenListe.mockReturnValue([]);
  mocks.etikettOrte.mockReturnValue([{ id: "rtw-1" }, { id: "handlager" }]);
  window.confirm = () => true;
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

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
 * Spaltenkopf, Eintraege ankreuzen, „OK". Ohne Eintraege wird zurueckgesetzt.
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
  for (let versuch = 0; versuch < 30 && menue().length === 0; versuch += 1) await warte();
  if (menue().length === 0) throw new Error(`Filtermenü zu ${spalte} nicht sichtbar`);

  for (const text of eintraege) {
    const eintrag = menue().find((li) => (li.textContent ?? "").includes(text));
    if (!eintrag) throw new Error(`Filtereintrag nicht gefunden: ${text}`);
    await clickElement(eintrag);
  }

  // Ohne `ConfigProvider`-Locale beschriftet antd die beiden Knoepfe englisch
  // („Reset"/„OK"); beide Schreibweisen werden akzeptiert.
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

function sichtbareIds(): Array<string | null> {
  return queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key"));
}

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function knopfMitText(text: string): HTMLElement {
  const knopf = Array.from(document.body.querySelectorAll<HTMLElement>("button"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf fehlt: ${text}`);
  return knopf;
}






function elementeVomTyp(
  wert: ReactNode,
  typ: unknown,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ
    ? [wert as ReactElement<Record<string, unknown>>]
    : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
}

describe("TokenTable — Suche, Filter und Tabelle", () => {
  it("sucht über Code, Label und Zielname und ordnet das Nullziel der Liste zu", () => {
    expect(sucheTrifft(FAHRZEUG, "111-111")).toBe(true);
    expect(sucheTrifft(FAHRZEUG, "kärtchen")).toBe(true);
    expect(sucheTrifft(ARTIKEL, "ÄRZTE-VERBAND")).toBe(true);
    expect(sucheTrifft(FAHRZEUG, "regal")).toBe(false);
    expect(zielVon(FAHRZEUG)).toBe("fahrzeug");
    expect(zielVon(ARTIKEL)).toBe("artikel");
    expect(zielVon(LISTE)).toBe("liste");
  });

  /**
   * DRK-309, Reviewrunde 6 — DIE ART DES ZIELS, IM TEXT UND IM SCHLUESSEL.
   *
   * ⚠️ `zielTyp` HILFT HIER NICHT: `tokens.ziel_typ` kennt nur „fahrzeug" und
   * „artikel", ein Kaertchen an einer Tasche traegt dort „fahrzeug" wie jedes
   * andere. Ohne `zielEinheitenart` findet „tasche" kein einziges Kaertchen,
   * und wer Codes sperrt, sieht zwei gleich benannte Ziele als dieselbe Zeile.
   * Die Fixture-Tasche traegt die Art deshalb WEDER im Namen NOCH in einer
   * Kennung.
   */
  it("findet ein Kaertchen an einer Tasche ueber die ART des Ziels", () => {
    expect(sucheTrifft(TASCHE, "tasche")).toBe(true);
    expect(sucheTrifft(FAHRZEUG, "tasche")).toBe(false);
    // Und die Kennung bleibt daneben durchsuchbar, wo es eine gibt.
    expect(sucheTrifft(FAHRZEUG, "MS-1")).toBe(true);
    // Ein ARTIKEL-Ziel hat keine Art — „nicht zugeordnet" waere dort falsch.
    expect(sucheTrifft(ARTIKEL, "nicht zugeordnet")).toBe(false);
  });

  it("zeigt Art und Kennung des Ziels in der Zeile — und das Zeichen der Art", async () => {
    await mount(<TokenTable zeilen={[FAHRZEUG, TASCHE, ARTIKEL]} />);
    // ⚠️ VIERTE SPALTE SEIT DRK-406 — „Ort" steht jetzt an zweiter Stelle.
    const ziele = queryAll("tbody tr[data-row-key] td:nth-child(4)")
      .map((z) => z.textContent);
    expect(ziele).toEqual([
      "RTW 1 · Fahrzeug · MS-1",
      "Rucksack Betreuung · Tasche",
      "Ärzte-Verband",
    ]);
  });

  it("trägt sieben Spalten, stabile IDs und die vollständigen sichtbaren Werte", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Code",
      /*
       * ⚠️ „Ort" STEHT VOR „Bezeichnung" — DRK-406. Das ist keine Kosmetik:
       * diese Seite wird mit der Frage geöffnet „welchen Code hat das RTW?",
       * und die Bezeichnung ist der Name von DAMALS (sie wandert bei einer
       * Umbenennung nicht mit, weil sie im Journal steht).
       */
      "Ort",
      "Bezeichnung",
      "Ziel",
      "Status",
      "Zuletzt benutzt",
      "",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Zugangs-Codes");
    expect(sichtbareIds()).toEqual(["t1", "t2", "t3"]);
    expect(exists(".ant-pagination")).toBe(false);
    const erste = query("tr[data-row-key='t1']");
    expect(erste.textContent).toContain("111-111");
    expect(erste.textContent).toContain("RTW 1 Kärtchen");
    expect(erste.textContent).toContain("RTW 1");
    expect(erste.textContent).toContain("aktiv");
    expect(erste.textContent).toContain("30.07.2026, 12:00:00");
    const zweite = query("tr[data-row-key='t2']");
    expect(zweite.textContent).toContain("Ärzte-Verband");
    expect(zweite.textContent).toContain("gesperrt");
    expect(zweite.textContent).toContain("nie benutzt");
    expect(query("tr[data-row-key='t3']").textContent).toContain("Artikel-Liste");
  });

  /**
   * Der Haken „gesperrt" und die Ziel-`Checkbox.Group` standen bis zur
   * Umstellung ueber der Tabelle. Beide sind Spaltenfilter geworden — dieselben
   * Praedikate, nur dort, wo ihre Wirkung sichtbar ist. Mehrere Haken EINER
   * Spalte verodern sich, Filter VERSCHIEDENER Spalten schneiden sich.
   */
  it("addiert Zielfilter, entfernt genau einen und kombiniert alle Filterregime", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(exists(".ant-checkbox-wrapper")).toBe(false);

    await spaltenFilter("Ziel", "Fahrzeug");
    expect(sichtbareIds()).toEqual(["t1"]);

    await spaltenFilter("Ziel", "Artikel");
    expect(sichtbareIds()).toEqual(["t1", "t2"]);

    await spaltenFilter("Ziel", "Fahrzeug");
    expect(sichtbareIds()).toEqual(["t2"]);

    await spaltenFilter("Status", "gesperrt");
    expect(sichtbareIds()).toEqual(["t2"]);

    await suchen("rtw");
    expect(sichtbareIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Code passt zu Suche und Filter.");
    /**
     * ⚠️ „0 von 3", UND DIESER TEST HAT BIS DRK-331 (dritte Reviewrunde) „1 von
     * 3" VERLANGT — also eine Zahl, die zu keinem Bild auf dem Schirm gehoerte.
     * Die Tabelle ist an dieser Stelle LEER, und darueber stand „1 von 3", weil
     * die Anzeige allein die Freitextsuche zaehlte. Die alte Begruendung („die
     * Wirkung der Spaltenfilter steht im Spaltenkopf") erklaert, warum man auf
     * einen Zaehler verzichten KOENNTE — nicht, warum ein falscher richtig
     * waere. Ein Zaehler neben einer Tabelle ist eine Aussage UEBER DIESE
     * TABELLE.
     */
    expect(document.querySelector("[data-testid='trefferanzeige']")?.textContent).toBe("0 von 3");
  });

  /**
   * ⚠️ DER BEWEIS, DASS „Zuletzt benutzt" NICHT UEBER DEN TEXT SORTIERT.
   * „nie benutzt" stuende als Zeichenkette hinter „30.07.2026, 12:00:00" — und
   * damit an derselben Stelle wie ein echtes Datum. Ueber `lastUsedIso` ist
   * `null` dagegen „fehlt" und landet aufsteigend hinten.
   */
  it("sortiert Zuletzt benutzt über den ISO-Stempel, nicht über den Text", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Zuletzt benutzt"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);

    expect(sichtbareIds()).toEqual(["t1", "t2", "t3"]);
  });

  it("unterscheidet leeren Bestand von einer leeren Filtermenge", async () => {
    await mount(<TokenTable zeilen={[]} />);
    expect(document.body.textContent)
      .toContain("Noch keine Codes. Öffne Verwaltung → Ortsetiketten — dort entstehen sie.");
    await unmount();
    await mount(<TokenTable zeilen={ZEILEN} />);
    await suchen("ohne Treffer");
    expect(document.body.textContent).toContain("Kein Code passt zu Suche und Filter.");
    expect(document.body.textContent).not.toContain("Noch keine Codes");
  });

  /**
   * Die `Checkbox.Group` der Zielfilter ist ein Spaltenfilter geworden und
   * steht hier gar nicht mehr; die alten Zusicherungen auf ihre Verdrahtung
   * sind damit gegenstandslos. `pagination={false}` und
   * `scroll={{ x: "max-content" }}` sind Vorgabe der `Datentabelle` —
   * geprueft wird ihre WIRKUNG am DOM.
   */
  it("hält die Tabellenprops fest und trägt keine Checkbox-Leiste mehr", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(exists(".ant-pagination")).toBe(false);
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/<Checkbox\.Group/);
    expect(quelle).toMatch(/rowKey=["']id["']/);
  });
});

describe("TokenTable — Aktionen (8-F: nur noch Sperren)", () => {
  it("beobachtet beide Statusrichtungen ohne optimistischen Zustand", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    const sperren = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((knopf) => knopf.textContent === "Sperren");
    const reaktivieren = Array.from(query("tr[data-row-key='t2']").querySelectorAll("button"))
      .find((knopf) => knopf.textContent === "Reaktivieren");
    if (!sperren || !reaktivieren) throw new Error("Statusknöpfe fehlen");
    await clickElement(sperren);
    await warte();
    await clickElement(reaktivieren);
    await warte();

    expect(mocks.setTokenAktiv.mock.calls).toEqual([
      [{ id: "t1", aktiv: false }],
      [{ id: "t2", aktiv: true }],
    ]);
    expect(sperren.textContent).toBe("Sperren");
    expect(reaktivieren.textContent).toBe("Reaktivieren");
  });

  async function sperrenKlicken(): Promise<HTMLElement> {
    await mount(<TokenTable zeilen={ZEILEN} />);
    const sperren = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((knopf) => knopf.textContent === "Sperren");
    if (!sperren) throw new Error("Sperrknopf fehlt");
    await clickElement(sperren);
    await warte();
    return sperren;
  }

  /**
   * ⚠️ DIESE ZUSICHERUNG HIESS BIS DRK-406 „zeigt nur den FESTEN Warntext" —
   * fuer den Wurf UND fuer die fachliche Ablehnung. Ihr Anliegen war und ist:
   * KEINE INTERNA AUF DEM SCHIRM. Sie ist verengt worden, nicht aufgegeben,
   * und der Grund ist ein zweiter Ablehnungsgrund, den es vorher nicht gab:
   * „fuer diesen Ort gilt bereits ein neuerer Code" ist ein NORMALZUSTAND mit
   * einem Weg heraus, den die Action ausdruecklich formuliert. Ihn durch den
   * festen Satz zu ersetzen hiess, die Erklaerung auf dem letzten Meter
   * wegzuwerfen — die Verwaltende saehe einen Defekt statt einer Absicht.
   *
   * Das Anliegen traegt jetzt der Quelltext-Scan darunter: die Action gibt
   * ausschliesslich ihre eigenen festen Saetze zurueck, nie eine gefangene
   * Ausnahme. WO die Zusicherung sitzt, hat sich geaendert; WAS sie zusagt,
   * nicht.
   */
  it("reicht den Satz des Servers durch, wenn er einen hat", async () => {
    mocks.setTokenAktiv.mockResolvedValueOnce({
      ok: false,
      fehler: "Ein Code, der zu einer Ortskarte gehört, wird nicht wieder aktiviert.",
    });
    const sperren = await sperrenKlicken();

    expect(query(".ant-alert-warning").textContent ?? "")
      .toContain("wird nicht wieder aktiviert");
    expect(sperren.textContent).toBe("Sperren");
  });

  it("zeigt bei einem WURF den festen Warntext und nie die Ausnahme", async () => {
    mocks.setTokenAktiv.mockRejectedValueOnce(new Error("SQLITE geheim"));
    const sperren = await sperrenKlicken();

    const warnung = query(".ant-alert-warning").textContent ?? "";
    expect(warnung).toContain("Zugangs-Code-Status konnte nicht geändert werden.");
    expect(warnung).not.toContain("SQLITE");
    expect(sperren.textContent).toBe("Sperren");
  });

  /**
   * DAS ANLIEGEN DER ALTEN ZUSICHERUNG, AN SEINER WIRKSAMEN STELLE — DRK-406.
   *
   * ⚠️ DIE HUELLE ZEIGT JETZT `ergebnis.fehler`, also ist die Frage „was kann
   * dort ueberhaupt stehen?" von der Insel zur ACTION gewandert. Dort ist sie
   * beantwortbar und hier gepinnt: jedes `fehler:` in `_actions/tokens.ts` ist
   * eine benannte Konstante DIESER Datei. Ein `fehler: String(e)` oder
   * `e.message` waere der Weg, auf dem eine Datenbankmeldung auf den Schirm
   * kaeme (§11.2 d) — und kein Tor sonst saehe ihn.
   */
  it("laesst die Action nur ihre eigenen festen Saetze zurueckgeben", () => {
    const quelle = ohneKommentare(readFileSync(
      "src/app/m/lagerbuch/_actions/tokens.ts",
      "utf8",
    ));

    const werte = [...quelle.matchAll(/fehler:\s*([^,}\n]+)/g)].map((m) => m[1].trim());
    expect(werte.length, "keine `fehler:`-Zuweisung gefunden").toBeGreaterThan(0);
    for (const wert of werte) {
      expect(wert, `unerwarteter Fehlerwert: ${wert}`)
        .toMatch(/^(STATUS_FEHLER|ORTSCODE_FEHLER|ERSETZT_FEHLER|"[^"]*")$/);
    }
    // Und der offensichtliche Weg daran vorbei steht namentlich da.
    expect(quelle).not.toMatch(/fehler:\s*(String\(|`|.*\.message)/);
  });

  /**
   * ENTSCHEIDUNG 8-F (§8.3): Der Namensraum der Zugangs-Codes ist gesperrt —
   * ein Code kann nur noch gesperrt, nie mehr gelöscht werden. Auf dieser Seite
   * entfällt damit der `LoeschButton`-AUFRUF, und die Zeile behält genau eine
   * Aktion.
   *
   * ⚠️ NICHT der Dialog. `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx`
   * gehören Teil 5 und bleiben unangetastet: Artikel, Fahrzeuge, BZ-Geräte,
   * O₂-Flaschen, Geräte und Vorlagen benutzen sie weiter. Wer sie beim
   * Aufräumen mitnimmt, reißt fünf andere Seiten ein.
   *
   * ⚠️ ANKÜNDIGUNGSPFLICHT (Runbook R34): Verwaltende, die heute einen
   * versehentlich angelegten Code löschen, finden den Knopf nicht mehr. Der
   * Weg heißt jetzt „Sperren", und `pruefeLoeschbar("token", …)` erklärt das
   * serverseitig weiterhin in Worten (`_lib/tokenForm.ts`, TOKEN_LOESCHGRUND).
   */
  it("bietet an einem Ortscode Neu erzeugen und Sperren an, keinen Löschweg", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);

    expect(
      Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
        .map((knopf) => knopf.textContent),
    ).toEqual(["Neu erzeugen", "Sperren"]);
    expect(
      Array.from(query("tr[data-row-key='t2']").querySelectorAll("button"))
        .map((knopf) => knopf.textContent),
    ).toEqual(["Reaktivieren"]);
    expect(document.body.textContent).not.toContain("Löschen");
  });

  /**
   * ⚠️ „NEU ERZEUGEN" STEHT NUR AN AKTIVEN ORTSCODES — DRK-406, und beide
   * Ausschlüsse tragen. Am ALTBESTAND gibt es keinen Ort, an den ein neuer
   * Code ginge; an einem GESPERRTEN Ortscode hat der Ort längst einen neuen
   * aktiven, und ein Klick sperrte genau den.
   */
  it("bietet Neu erzeugen weder am Altbestand noch an einem gesperrten Code an", async () => {
    const gesperrterOrtscode = { ...FAHRZEUG, id: "t9", code: "999-111", aktiv: false };
    await mount(<TokenTable zeilen={[LISTE, gesperrterOrtscode]} />);

    const knoepfe = (id: string) => Array.from(
      query(`tr[data-row-key='${id}']`).querySelectorAll("button"),
    ).map((knopf) => knopf.textContent);

    expect(knoepfe("t3"), "Altbestand hat keinen Ort").not.toContain("Neu erzeugen");
    expect(knoepfe("t9"), "gesperrt: der Ort hat längst einen neuen Code")
      .not.toContain("Neu erzeugen");
  });

  /**
   * ⚠️ „REAKTIVIEREN" GIBT ES NUR AM ALTBESTAND — DRK-406, gefunden in der
   * Durchsicht. Ein Code, der zu einer Ortskarte gehört oder gehört HAT, kommt
   * nie zurück; die Action lehnt genau so ab. Stünde der Knopf trotzdem da,
   * wäre er ein Versprechen, das der Server bricht — und der einzige Weg zur
   * Erklärung führte über einen Fehlversuch.
   *
   * ⚠️ DER ZWEITE FALL BRAUCHT `ortId: null` UND IST TROTZDEM GESPERRT: so
   * sieht der Code einer GELÖSCHTEN Einheit aus (dort muss die Bindung fallen,
   * Fremdschlüssel). Ohne `ersetztText` wäre er von Altbestand nicht zu
   * unterscheiden — das ist der ganze Grund, warum es das Feld gibt.
   */
  it("bietet Reaktivieren weder am Ortscode noch an einem ersetzten Code an", async () => {
    const gesperrterOrtscode = { ...FAHRZEUG, id: "t9", code: "999-111", aktiv: false };
    const verwaist = {
      ...FAHRZEUG,
      id: "t8",
      code: "999-222",
      aktiv: false,
      ortId: null,
      ortName: null,
      ortMeta: null,
      zuruecksetzbar: false,
      ersetztText: "17.9.2026",
    } satisfies TokenAnzeigeZeile;
    await mount(<TokenTable zeilen={[ARTIKEL, gesperrterOrtscode, verwaist]} />);

    const knoepfe = (id: string) => Array.from(
      query(`tr[data-row-key='${id}']`).querySelectorAll("button"),
    ).map((knopf) => knopf.textContent);

    expect(knoepfe("t2"), "Altbestand bleibt reaktivierbar").toContain("Reaktivieren");
    expect(knoepfe("t9")).not.toContain("Reaktivieren");
    expect(knoepfe("t8")).not.toContain("Reaktivieren");

    // ⚠️ AN SEINER STELLE STEHT EINE AUSKUNFT, KEINE LÜCKE — und am ersetzten
    // Code beantwortet sie die Frage, die am Tresen wirklich gestellt wird.
    expect(query("tr[data-row-key='t9']").textContent).toContain("dauerhaft gesperrt");
    expect(query("tr[data-row-key='t8']").textContent).toContain("ersetzt am 17.9.2026");
  });

  /**
   * DER NEUE CODE STEHT AM SCHIRM — DRK-406. Er kommt aus der Action zurück,
   * und die Insel zeigt ihn, statt ihn nur in die revalidierte Tabelle fallen
   * zu lassen: wer zurücksetzt, muss die Karte JETZT neu drucken, und welche
   * der sechsstelligen Zahlen die neue ist, sieht man einer Zeile nicht an.
   */
  it("setzt den Code des Ortes zurück und nennt den neuen", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    const knopf = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((k) => k.textContent === "Neu erzeugen");
    if (!knopf) throw new Error("Knopf „Neu erzeugen“ fehlt");
    await clickElement(knopf);
    await warte();

    /*
     * ⚠️ DIE ORT-ID WANDERT, NICHT DIE TOKEN-ID. Die Action erzeugt für einen
     * ORT neu; eine Token-Id sagte nicht, welche Karte gemeint ist.
     *
     * ⚠️ UND DER CODE WANDERT MIT — der Riegel gegen den Wettlauf zweier
     * Verwaltender (gefunden in der Durchsicht). Er ist der Code, der auf
     * DIESEM Schirm stand; ohne ihn setzte die Action „den gerade aktiven"
     * zurück und damit im Wettlauf den, den die andere Seite eben erzeugt hat.
     * Fällt das Feld hier weg, bleibt der Server grün und die Sperre wirkungslos.
     */
    expect(mocks.setzeOrtCodeZurueck.mock.calls)
      .toEqual([[{ ortId: "rtw-1", bisher: "111-111" }]]);
    expect(query("[data-testid='lb-token-neuer-code']").textContent)
      .toContain("999-999");
  });

  /**
   * ⚠️ DIE RÜCKFRAGE IST TEIL DER HANDLUNG, NICHT IHRE VERZIERUNG. Die Wirkung
   * tritt ANDERSWO ein — an einer laminierten Karte am Fahrzeug, die ab dem
   * Klick ins Leere führt. Wer sie abbricht, darf keinen Code verlieren.
   */
  it("erzeugt nichts, wenn die Rückfrage abgelehnt wird", async () => {
    window.confirm = () => false;
    await mount(<TokenTable zeilen={ZEILEN} />);
    const knopf = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((k) => k.textContent === "Neu erzeugen");
    if (!knopf) throw new Error("Knopf „Neu erzeugen“ fehlt");
    await clickElement(knopf);
    await warte();

    expect(mocks.setzeOrtCodeZurueck).not.toHaveBeenCalled();
  });

  it.each([
    ["fachlich", { ok: false, fehler: "Zu dieser Adresse gehört keine Ortskarte." }],
    ["Runtime", new Error("SQLITE geheim")],
  ] as const)("zeigt bei %s fehlgeschlagenem Zurücksetzen keinen neuen Code", async (
    _art,
    ausgang,
  ) => {
    if (ausgang instanceof Error) mocks.setzeOrtCodeZurueck.mockRejectedValueOnce(ausgang);
    else mocks.setzeOrtCodeZurueck.mockResolvedValueOnce(ausgang);
    await mount(<TokenTable zeilen={ZEILEN} />);
    const knopf = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((k) => k.textContent === "Neu erzeugen");
    if (!knopf) throw new Error("Knopf „Neu erzeugen“ fehlt");
    await clickElement(knopf);
    await warte();

    expect(document.querySelector("[data-testid='lb-token-neuer-code']")).toBeNull();
    expect(query(".ant-alert-warning").textContent ?? "").not.toContain("SQLITE");
  });

  it("bietet für aktive Codes „Einsteigen“ über den QR-Weg im neuen Tab an, für gesperrte nicht", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);

    const einstiege = (id: string) => Array.from(
      query(`tr[data-row-key='${id}']`).querySelectorAll<HTMLAnchorElement>("a"),
    ).filter((anker) => (anker.textContent ?? "").includes("Einsteigen"));

    const [fahrzeug] = einstiege("t1");
    expect(fahrzeug?.getAttribute("href")).toBe("/t/111-111");
    expect(fahrzeug?.getAttribute("target")).toBe("_blank");
    expect(fahrzeug?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(einstiege("t3").map((anker) => anker.getAttribute("href"))).toEqual(["/t/333-333"]);
    expect(einstiege("t2"), "gesperrt: am Gate wäre es ein Fehlversuch").toEqual([]);
  });

  it("kennt in der Quelle weder den Löschknopf noch die generische Löschaction", () => {
    // K-4: über ohneKommentare(), nicht über den Rohtext — der Kopfkommentar
    // der Komponente nennt alle drei gesuchten Namen in seiner Begründung.
    const quelle = ohneKommentare(readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.tsx",
      "utf8",
    ));

    expect(quelle, "8-F: der LoeschButton-Aufruf entfällt").not.toContain("LoeschButton");
    expect(quelle).not.toContain("loescheElement");
    expect(quelle).not.toContain("pruefeLoeschbar");
    expect(quelle, "gesperrt wird über setTokenAktiv").toContain("setTokenAktiv");

    // Der Dialog bleibt: er gehört Teil 5 und trägt die übrigen Seiten.
    expect(existsSync("src/app/m/lagerbuch/_ui/LoeschDialog.tsx")).toBe(true);
    expect(existsSync("src/app/m/lagerbuch/_ui/LoeschButton.tsx")).toBe(true);
  });
});

describe("TokensSeite", () => {
  const ROHZEILE = {
    id: "t-nacht",
    code: "444-444",
    label: "Nachtschicht",
    aktiv: true,
    lastUsedAt: new Date("2026-01-01T23:30:00Z"),
    createdAt: new Date("2026-01-01T22:00:00Z"),
    zielTyp: "fahrzeug" as const,
    zielId: "rtw-1",
    zielName: "RTW Alpha",
    zielKennung: "UE-RK 1234",
    zielEinheitenart: "fahrzeug" as const,
    ortId: "rtw-1",
    ortName: "RTW Alpha",
    ortTyp: "fahrzeug" as const,
    ortKennung: "UE-RK 1234",
    ortEinheitenart: "fahrzeug" as const,
    ersetztAm: null,
  };

  const KARTEN = new Set(["rtw-1", "handlager"]);

  it("formatiert Zeitstempel serverseitig in Europe/Berlin und reicht keine Dates durch", () => {
    const [zeile] = tokenAnzeigeZeilen([ROHZEILE], KARTEN);

    expect(zeile).toEqual({
      id: "t-nacht",
      code: "444-444",
      label: "Nachtschicht",
      aktiv: true,
      lastUsedText: "2.1.2026, 00:30:00",
      lastUsedIso: "2026-01-01T23:30:00.000Z",
      ortId: "rtw-1",
      ortName: "RTW Alpha",
      ortMeta: "Fahrzeug · UE-RK 1234",
      zuruecksetzbar: true,
      ersetztText: null,
      zielTyp: "fahrzeug",
      zielId: "rtw-1",
      zielName: "RTW Alpha",
      zielMeta: "Fahrzeug · UE-RK 1234",
      zielEinheitenart: "fahrzeug",
    });
    expect(enthaeltDate(zeile)).toBe(false);
    expect(Object.hasOwn(zeile, "createdAt")).toBe(false);
    expect(tokenAnzeigeZeilen([{ ...ROHZEILE, lastUsedAt: null }], KARTEN)[0].lastUsedText)
      .toBe("nie benutzt");
  });

  /**
   * DER HANDLAGER IST EIN `typ: "lager"` — DRK-406, und diese Zusicherung
   * riegelt den naheliegenden Fehlgriff ab: `einheitMeta` machte daraus „nicht
   * zugeordnet", also eine Einheit, bei der jemand die Art vergessen hat
   * (DRK-309). Die Beizeile des WICHTIGSTEN Codes der Suite läse sich dann wie
   * ein Datenfehler.
   */
  it("nennt den Handlager „Lager“ und nicht „nicht zugeordnet“", () => {
    const [zeile] = tokenAnzeigeZeilen([{
      ...ROHZEILE,
      zielTyp: null, zielId: null, zielName: null,
      zielKennung: null, zielEinheitenart: null,
      ortId: "handlager", ortName: "Handlager", ortTyp: "lager" as const,
      ortKennung: null, ortEinheitenart: null,
    }], KARTEN);

    expect(zeile.ortMeta).toBe("Lager");
    expect(zeile.zielMeta).toBeNull();
    expect(zeile.zuruecksetzbar).toBe(true);
  });

  /**
   * ⚠️ „HAT EINE ORT-ID" IST NICHT „IST ZURÜCKSETZBAR". Eine stillgelegte
   * Tasche behält ihren Code samt Zugehörigkeit — es gibt nur keine Karte
   * mehr, auf die ein neuer käme. Ohne diese Unterscheidung stünde der Knopf
   * da und die Action wiese ihn ab.
   */
  it("hält einen Code an einer stillgelegten Einheit für nicht zurücksetzbar", () => {
    const [zeile] = tokenAnzeigeZeilen(
      [{ ...ROHZEILE, ortId: "ausgemustert" }],
      KARTEN,
    );

    expect(zeile.ortId).toBe("ausgemustert");
    expect(zeile.zuruecksetzbar).toBe(false);
  });

  /** Altbestand: keine Zugehörigkeit, kein Knopf, aber weiterhin gelistet. */
  it("lässt den Altbestand ohne Ort und ohne Zurücksetzen stehen", () => {
    const [zeile] = tokenAnzeigeZeilen([{
      ...ROHZEILE,
      ortId: null, ortName: null, ortTyp: null,
      ortKennung: null, ortEinheitenart: null,
    }], KARTEN);

    expect(zeile.ortName).toBeNull();
    expect(zeile.ortMeta).toBeNull();
    expect(zeile.zuruecksetzbar).toBe(false);
  });

  it("verdrahtet Lesepfade, Seitenkopf und die Tabelle ohne inneren Verwaltungspfad", () => {
    mocks.tokenListe.mockReturnValue([ROHZEILE]);
    const seite = TokensSeite();

    expect(dynamic).toBe("force-dynamic");
    expect(mocks.getDb).toHaveBeenCalledOnce();
    expect(mocks.tokenListe).toHaveBeenCalledWith({ kennung: "token-test-db" });
    expect(mocks.etikettOrte).toHaveBeenCalledWith({ kennung: "token-test-db" });

    const kopf = elementeVomTyp(seite, SeitenKopf)[0];
    expect(kopf.props.titel).toBe("Zugangs-Codes");
    /*
     * ⚠️ DRK-406 — DER SEITENKOPF TRÄGT KEINE AKTION MEHR. Bis hierher hing
     * dort „Neuen Code anlegen". Die Zusicherung prüft die ABWESENHEIT, weil
     * genau das der Auftrag war: ein Code entsteht ab jetzt nur noch als
     * Ortscode.
     */
    expect(kopf.props.aktionen).toBeUndefined();

    const tabelle = elementeVomTyp(seite, TokenTable)[0];
    expect(tabelle.props.zeilen).toEqual(tokenAnzeigeZeilen([ROHZEILE], KARTEN));
    expect(enthaeltDate(tabelle.props.zeilen)).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/page.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/\/m\/lagerbuch\/verwaltung\//);
    expect(quelle).not.toMatch(/columns\s*=|\brender\s*:|rowKey=\{/);
  });
});
