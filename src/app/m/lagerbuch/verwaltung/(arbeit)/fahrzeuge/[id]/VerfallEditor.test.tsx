// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  VerfallEditor,
  type VerfallAnzeigeZeile,
} from "./VerfallEditor";
import s from "../../../../_ui/verwaltung.module.css";

/**
 * DER RAHMEN UM DIE BREITE DARSTELLUNG (DRK-451).
 *
 * ⚠️ SEIT DIESE TABELLE EINE `Kartentabelle` IST, STEHT JEDE ZEILE ZWEIMAL IM
 * BAUM — einmal als Tabellenzeile, einmal als Karte. jsdom wertet die Media
 * Query nicht aus, dort sind also BEIDE „da", und ein Greifer ueber eine
 * Klasse oder eine `data-rolle` findet jeden Wert doppelt.
 *
 * ⚠️ `thead`- UND `tbody`-GREIFER BRAUCHEN IHN NICHT — eine Karte hat weder
 * das eine noch das andere. Eingerahmt wird nur, was ohne sie greift.
 */
const BREIT = '[data-rolle="breitansicht"]';

const mocks = vi.hoisted(() => ({ setzen: vi.fn(), aussondern: vi.fn(), ruecklauf: vi.fn() }));

vi.mock("../../../../_actions/lagerortVerfall", () => ({
  verfallSetzen: (...args: unknown[]) => mocks.setzen(...args),
}));

vi.mock("../../../../_actions/aussondernLagerort", () => ({
  aussondernVomLagerort: (...args: unknown[]) => mocks.aussondern(...args),
}));

vi.mock("../../../../_actions/ruecklauf", () => ({
  bucheRuecklauf: (...args: unknown[]) => mocks.ruecklauf(...args),
}));

/** DRK-366 — die Ziele des Rücklaufs, wie `zugangsZiele` sie liefert. */
const ZIELE = [
  { id: "handlager", name: "Handlager (ohne Schrank)" },
  { id: "sch-1", name: "Schrank 1" },
];

const ZEILEN: VerfallAnzeigeZeile[] = [
  {
    artikelId: "a1",
    artikelName: "Mullbinde",
    fachText: "Fach A · Fach C",
    verfall: "2027-03",
    statusTon: "gelb",
    statusText: "läuft bald ab",
    abgelaufen: false,
    bestand: 5,
    soll: 4,
    einheit: "Stk.",
    chargen: [{ id: "c1", chargenNr: "CH-1", verfall: "2027-03", rest: 5 }],
  },
  {
    artikelId: "a2",
    artikelName: "Kompressen",
    fachText: "Fach B",
    verfall: null,
    statusTon: null,
    statusText: null,
    abgelaufen: false,
    bestand: 0,
    soll: 2,
    einheit: "Stk.",
    chargen: [],
  },
  {
    artikelId: "a3",
    artikelName: "Dreiecktuch",
    fachText: "Fach D",
    verfall: "2029-08",
    statusTon: "ok",
    statusText: "bis 08/29",
    abgelaufen: false,
    bestand: 3,
    soll: 3,
    einheit: "Stk.",
    chargen: [],
  },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * IDA-232: das Datum ist ein Knopf, bis man es antippt — erst dann steht der
 * Monatswähler da. Gegriffen wird in der BREITEN Darstellung; die Karte trägt
 * denselben Knopf noch einmal.
 */
function verfallKnopf(artikelName: string): HTMLButtonElement {
  return query<HTMLButtonElement>(`${BREIT} button[aria-label='Verfall ${artikelName} ändern']`);
}

/** Was die Zelle gerade als Monat zeigt — „eintragen" heißt: keiner. */
function verfallAnzeige(artikelName: string): string {
  return (verfallKnopf(artikelName).textContent ?? "").trim();
}

async function monatWaehlen(artikelName: string, monat: string): Promise<void> {
  await clickElement(verfallKnopf(artikelName));
  await warte();
  const zelle = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-cell",
  )).find((element) => element.getAttribute("title") === monat);
  if (!zelle) throw new Error(`Monat nicht gefunden: ${monat}`);
  await clickElement(zelle);
  await warte();
}

async function monatLeeren(artikelId: string, artikelName: string): Promise<void> {
  await clickElement(verfallKnopf(artikelName));
  await warte();
  const zeile = query(`tr[data-row-key='${artikelId}']`);
  const clear = zeile.querySelector<HTMLElement>(".ant-picker-clear");
  if (!clear) throw new Error(`Clear-Knopf fehlt für ${artikelId}`);
  await clickElement(clear);
  await warte();
}

/**
 * Öffnet das Zeilenmenü (IDA-232: Aussondern und Zurückbuchen stehen hinter
 * EINEM Knopf) und liefert den Eintrag. antd rendert das Menü ins Portal.
 */
async function menuePunkt(artikelId: string, artikelName: string, text: string): Promise<HTMLElement> {
  const offen = () => Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-dropdown:not(.ant-dropdown-hidden) [role='menuitem']",
  ));
  const ausloeser = query(
    `tr[data-row-key='${artikelId}'] button[aria-label='Aktionen für ${artikelName}']`,
  );
  // Offene Menüs ANDERER Zeilen zuerst über ihren eigenen Auslöser schließen —
  // sonst träfe der Greifer deren Eintrag.
  for (const anderer of queryAll(".ant-dropdown-open")) {
    if (anderer !== ausloeser) await clickElement(anderer);
  }
  await warte();
  if (!ausloeser.classList.contains("ant-dropdown-open")) await clickElement(ausloeser);
  await warte();
  const punkt = offen().find((element) => (element.textContent ?? "").includes(text));
  if (!punkt) throw new Error(`Menüeintrag fehlt: ${text}`);
  return punkt;
}

function gesperrt(punkt: HTMLElement): boolean {
  return punkt.getAttribute("aria-disabled") === "true";
}

async function dialogOeffnen(artikelId: string, artikelName: string, text: string): Promise<Element> {
  await clickElement(await menuePunkt(artikelId, artikelName, text));
  await warte();
  const dialog = document.body.querySelector("[role='dialog']");
  if (!dialog) throw new Error("Dialog nicht offen");
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  /*
   * ⚠️ DIE ATTRAPPE MELDET DEN WERT, den die echte Aktion nach dem Schreiben
   * zurueckliest (DRK-345). Ein `{ gesetzt: true }` waere hier keine Kleinigkeit
   * mehr: der Stand der Tabelle uebernimmt AUSSCHLIESSLICH `wert.verfall`, und
   * eine Attrappe ohne Wert leerte den Waehler bei jedem Speichern.
   */
  mocks.setzen.mockImplementation(async (eingabe: { verfall: string }) => ({
    ok: true,
    wert: { verfall: eingabe.verfall || null },
  }));
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

function mountListe(eintraege: VerfallAnzeigeZeile[] = ZEILEN, ziele = ZIELE) {
  return mount(
    <VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" ruecklaufZiele={ziele} eintraege={eintraege} />,
  );
}

function zeilenFolge(): (string | null)[] {
  return queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key"));
}

describe("VerfallEditor — Bestand und Verfall je Artikel (IDA-232)", () => {
  it("zeigt Artikel, Fächer, Ist/Soll und den fertigen Status", async () => {
    await mountListe();

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Artikel", "Fach", "Ist / Soll", "Verfall", "Status", "Aktion"]);
    // DRK-309: art-bewusst — für ein Fahrzeug „im Fahrzeug".
    expect(query("table").getAttribute("aria-label")).toBe("Bestand und Verfall im Fahrzeug");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(3);
    const mull = query("tr[data-row-key='a1']");
    expect(mull.textContent).toContain("Mullbinde");
    expect(mull.textContent).toContain("Fach A · Fach C");
    expect(mull.textContent).toContain("läuft bald ab");
    expect(query("tr[data-row-key='a1'] [data-rolle='ist']").textContent).toBe("5");
    expect(mull.textContent).toContain("/ 4 Stk.");
    expect(query("tr[data-row-key='a2']").textContent).toContain("nicht erfasst");
    expect(query(`tr[data-row-key='a3'] .${s.ok}`).textContent).toBe("bis 08/29");
  });

  it("sagt „unter Soll“, wo der Bestand die Summe des Solls nicht erreicht", async () => {
    await mountListe();
    // a2: 0 von 2 — unter Soll. a1 (5 von 4) und a3 (3 von 3) nicht.
    expect(query("tr[data-row-key='a2']").textContent).toContain("unter Soll");
    expect(query("tr[data-row-key='a1']").textContent).not.toContain("unter Soll");
    expect(query("tr[data-row-key='a3']").textContent).not.toContain("unter Soll");
  });

  /**
   * AUFFÄLLIGES ZUERST: „läuft ab" (a1) vor „unter Soll" (a2) vor dem
   * Unauffälligen (a3) — unabhängig von der Reihenfolge, in der die Zeilen
   * kommen.
   */
  it("ordnet ohne Sortierung nach Dringlichkeit", async () => {
    await mountListe([ZEILEN[2]!, ZEILEN[1]!, ZEILEN[0]!]);
    expect(zeilenFolge()).toEqual(["a1", "a2", "a3"]);
  });

  it("zeigt das Datum als Text und öffnet den Wähler erst beim Antippen", async () => {
    await mountListe();

    // Kein offenes Eingabefeld je Zeile mehr — das war der Befund.
    expect(queryAll(`${BREIT} .ant-picker`)).toHaveLength(0);
    // Das Monatsformat des Moduls (`fmtVerfall`), wie auf der Verfallsseite.
    expect(verfallAnzeige("Mullbinde")).toBe("03/27");
    expect(verfallAnzeige("Kompressen")).toBe("eintragen");

    await clickElement(verfallKnopf("Mullbinde"));
    await warte();
    expect(queryAll(`${BREIT} .ant-picker`)).toHaveLength(1);
    // KEIN size="small" (Arbeitsdichte, WCAG 2.5.5) — volle 44px-Bedienhoehe.
    expect(queryAll(`${BREIT} .ant-picker-small`)).toHaveLength(0);
    expect(query<HTMLInputElement>(`${BREIT} [aria-label='Verfall Mullbinde']`).value)
      .toBe("2027-03");
    expect(queryAll(`${BREIT} .ant-form-item`)).toHaveLength(0);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/VerfallEditor.tsx",
      "utf8",
    );
    expect(quelle).toContain('from "../../../../_ui/monat"');
    expect(quelle).not.toContain("AMPEL_TON");
    expect(quelle).not.toContain("ArtikelDrawer");
    expect(quelle).not.toMatch(/\bForm(?:\.Item)?\b/);
  });
});

describe("VerfallEditor — Suche und Statusfilter (IDA-232)", () => {
  it("findet über Artikel und Fach", async () => {
    await mountListe();
    await fill(`input[aria-label='Artikel oder Fach suchen…']`, "fach d");
    await act(async () => { await new Promise((fertig) => setTimeout(fertig, 250)); });

    expect(zeilenFolge()).toEqual(["a3"]);
    expect(query("[data-testid='trefferanzeige']").textContent).toBe("1 von 3");
  });

  it("filtert nach Status und zählt je Status in der Auswahl", async () => {
    await mountListe();
    const feld = query<HTMLInputElement>("input[aria-label='Status filtern']");
    await act(async () => {
      feld.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await warte();
    const optionen = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
      .map((option) => option.textContent);
    expect(optionen).toEqual([
      "alle · 3",
      "auffällig · 2",
      "abgelaufen · 0",
      "läuft ab · 1",
      "unter Soll · 1",
      "nicht erfasst · 1",
    ]);
    const unterSoll = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
      .find((option) => option.textContent === "unter Soll · 1");
    await clickElement(unterSoll!);
    await warte();

    expect(zeilenFolge()).toEqual(["a2"]);
    // Der Filter steht in der Adresse — dorthin zeigen die Kacheln.
    expect(window.location.search).toContain("status=unter-soll");
  });

  it("übernimmt den Filter aus der Adresse", async () => {
    window.history.replaceState(null, "", "?reiter=bestand&status=laeuft-ab");
    try {
      await mountListe();
      expect(zeilenFolge()).toEqual(["a1"]);
    } finally {
      window.history.replaceState(null, "", window.location.pathname);
    }
  });
});

describe("VerfallEditor — result-aware Auto-Commit", () => {
  it("setzt einen Monat sofort mit dem exakten Payload", async () => {
    await mountListe();
    await monatWaehlen("Mullbinde", "2027-05");

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "2027-05",
    });
    expect(verfallAnzeige("Mullbinde")).toBe("05/27");
  });

  it("sendet Clear als leeren String statt undefined", async () => {
    mocks.setzen.mockResolvedValueOnce({ ok: true, wert: { verfall: null } });
    await mountListe();
    await monatLeeren("a1", "Mullbinde");

    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "",
    });
    expect(verfallAnzeige("Mullbinde")).toBe("eintragen");
  });

  /**
   * ZWEI GETRENNTE ZUSAGEN, die beide an dieser Stelle haengen:
   *
   * 1. Der gewaehlte Monat BLEIBT stehen. Die Eingabe einer Person zu
   *    verwerfen, weil das Speichern scheiterte, ist schlimmer als eine
   *    Statusspalte, die bis zum naechsten Laden den alten Stand nennt.
   * 2. Bei `ok:false` steht der Satz AUS DER ACTION da, nicht die
   *    Modulkonstante — nur er unterscheidet „Artikel steht an diesem Lagerort
   *    nicht im Soll." von einem Schreibfehler und sagt der Person, was hilft.
   *    Im Wurf bleibt die Konstante: dort ist `e.message` in Produktion
   *    Framework-Englisch (siehe `_lib/actionErgebnis`).
   */
  it("behaelt bei ok:false den neuen Monat und zeigt den Satz der Action", async () => {
    mocks.setzen.mockImplementationOnce(async () => ({
      ok: false as const,
      fehler: "Artikel steht an diesem Lagerort nicht im Soll.",
    }));
    await mountListe();
    await monatWaehlen("Mullbinde", "2027-06");

    expect(verfallAnzeige("Mullbinde")).toBe("06/27");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Artikel steht an diesem Lagerort nicht im Soll.");
  });

  it("behaelt bei Reject den neuen Monat und zeigt einen festen Warning-Text", async () => {
    mocks.setzen.mockImplementationOnce(async () => {
      throw new Error("Framework-Text");
    });
    await mountListe();
    await monatWaehlen("Mullbinde", "2027-06");

    expect(verfallAnzeige("Mullbinde")).toBe("06/27");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Verfall konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
  /**
   * ⚠️ SORTIERT WIRD DER GESPEICHERTE MONAT, NICHT DIE ANZEIGE.
   *
   * „YYYY-MM" ordnet als Zeichenkette bereits richtig — deshalb steht hier
   * ausnahmsweise dasselbe Feld fuer Anzeige und Sortierung. Ein Eintrag ohne
   * Verfall traegt `null` und landet aufsteigend hinten.
   */
  it("sortiert die Verfallsspalte über den gespeicherten Monat", async () => {
    await mountListe();

    const kopf = queryAll<HTMLElement>("thead th")
      .find((zelle) => (zelle.textContent ?? "") === "Verfall");
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);

    expect(zeilenFolge()).toEqual(["a1", "a3", "a2"]);
  });

  it("filtert nach Fach über den Spaltenkopf", async () => {
    await mountListe();

    const kopf = queryAll<HTMLElement>("thead th")
      .find((zelle) => (zelle.textContent ?? "") === "Fach");
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-filter-trigger")!);

    const offen = () => document.body.querySelector<HTMLElement>(
      ".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown",
    );
    const eintrag = Array.from(offen()?.querySelectorAll<HTMLElement>("li") ?? [])
      .find((li) => li.textContent === "Fach B");
    await clickElement(eintrag!);
    // Ohne `ConfigProvider`-Locale heisst der Knopf englisch; „OK" gilt in beiden.
    const ok = Array.from(offen()?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((knopf) => knopf.textContent === "OK");
    await clickElement(ok!);

    expect(zeilenFolge()).toEqual(["a2"]);
  });
});

describe("Aussondern je Zeile", () => {
  it("bietet das Aussondern im Zeilenmenü an, wo Bestand im Fahrzeug liegt", async () => {
    await mountListe();
    expect(gesperrt(await menuePunkt("a1", "Mullbinde", "Aussondern"))).toBe(false);
  });

  it("sperrt den Eintrag, wo nichts liegt", async () => {
    await mountListe();
    expect(gesperrt(await menuePunkt("a2", "Kompressen", "Aussondern"))).toBe(true);
  });

  it("öffnet den Dialog für genau die gewählte Zeile", async () => {
    await mountListe();
    const dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    expect(dialog.textContent).toContain("Mullbinde aussondern");
  });
});

/** Füllt ein Feld im Dialog über den Prototyp-Setter (Begründung bei `fill`). */
async function setzeFeld(dialog: Element, selector: string, wert: string): Promise<void> {
  const feld = dialog.querySelector<HTMLInputElement>(selector);
  if (!feld) throw new Error(`Feld fehlt: ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  await act(async () => {
    setter!.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function absenden(dialog: Element, rolle: string): Promise<void> {
  await act(async () => {
    dialog.querySelector<HTMLFormElement>(`[data-rolle='${rolle}']`)!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warte();
  await warte();
}

describe("Aussondern und der eine Stand", () => {
  /**
   * ⚠️ DIE ZWEITE SCHREIBSTELLE AUF DEMSELBEN WERT.
   *
   * Der Aussondern-Dialog aendert denselben Wert wie der Monatswaehler daneben,
   * und `revalidatePath` frischt zwar die Server-Props auf, haengt die Insel
   * aber nicht neu ein. Ohne den gemeinsamen Stand zeigte die Zelle danach
   * still den ALTEN Monat, waehrend Status und naechster Dialog schon den neuen
   * fuehren. Seit DRK-345 laufen beide Wege durch denselben Trichter, und der
   * nimmt den Wert aus der ANTWORT.
   */
  it("uebernimmt den im Dialog gesetzten Monat in die Zelle", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: "2027-09" } });
    await mountListe();
    expect(verfallAnzeige("Mullbinde")).toBe("03/27");

    const dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    await setzeFeld(dialog, "input[aria-label='Menge']", "1");
    await setzeFeld(dialog, "input[aria-label='Kommentar']", "MHD");
    // Der Monat wird GEWAEHLT, nicht getippt: ein roher `input` auf dem Feld
    // laesst den Picker ohne bestaetigten Wert zurueck, und das Formular traegt
    // dann gar keinen Monat. Gleiches Jahr wie der Ausgangswert, damit die
    // Zelle ohne Jahreswechsel im Feld steht.
    await clickElement(dialog.querySelector<HTMLElement>("input[aria-label='Verfall']")!);
    await warte();
    const zelle = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-picker-cell"))
      .find((element) => element.getAttribute("title") === "2027-09");
    if (!zelle) throw new Error("Monatszelle 2027-09 nicht gefunden");
    await clickElement(zelle);
    await warte();
    await absenden(dialog, "aussondern");

    expect(verfallAnzeige("Mullbinde")).toBe("09/27");
  });

  it("leert die Zelle, wenn der ganze Bestand rausgeht", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
    await mountListe();

    const dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    // ZEILEN[0] traegt Bestand 5 — die volle Menge.
    await setzeFeld(dialog, "input[aria-label='Menge']", "5");
    await setzeFeld(dialog, "input[aria-label='Kommentar']", "alles raus");
    await absenden(dialog, "aussondern");

    // Kein Bestand, keine Verfallsangabe — die Aktion loescht die Zeile, und die
    // Zelle darf den Monat nicht weiter behaupten.
    expect(verfallAnzeige("Mullbinde")).toBe("eintragen");
  });
});

describe("Der Dialog liest denselben Monat wie die Zelle", () => {
  /**
   * ⚠️ DER SPIEGEL IST WAEHREND DES SPEICHERNS DER NEUERE STAND. `monatSetzen`
   * traegt den gewaehlten Monat SOFORT in den Spiegel und schickt ihn erst
   * danach zum Server; bis die Auffrischung zurueck ist, hat die Prop noch den
   * alten Wert. Bekaeme der Dialog die Prop, stuende in seinem Feld der alte
   * Monat — und eine Teilaussonderung schriebe ihn ueber den gerade
   * gespeicherten zurueck.
   */
  it("uebernimmt den frisch gewaehlten Monat in den Dialog", async () => {
    await mountListe();
    await monatWaehlen("Mullbinde", "2027-09");
    // Die Prop bleibt im Test bei 2027-03 — genau der Zustand vor der
    // Auffrischung, den der Dialog nicht uebernehmen darf.
    expect(ZEILEN[0].verfall).toBe("2027-03");

    const dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    expect(dialog.querySelector<HTMLInputElement>("input[aria-label='Verfall']")!.value)
      .toBe("2027-09");
  });
});

describe("Der Spiegel folgt der Antwort, nicht der Eingabe", () => {
  /**
   * ⚠️ DER FALL, DEN NUR DIE ANTWORT KENNT. Hat jemand anders zwischendurch
   * gebucht, leert die hier gesendete Teilmenge den Bestand — die Transaktion
   * schreibt dann `null`, obwohl im Feld ein Datum stand. Spiegelte die Tabelle
   * ihre eigene EINGABE, zeigte die Zelle danach ein Datum, das in der
   * Datenbank nicht steht.
   */
  /**
   * ⚠️ DIESELBE ZUSAGE AUF DEM ZWEITEN SCHREIBWEG (DRK-345). Der Monatswaehler
   * hat sie bis dahin nicht gehalten: `verfallSetzen` meldete nur „gesetzt
   * ja/nein", also blieb ihm gar nichts anderes, als seine EIGENE Eingabe zu
   * spiegeln. Solange die Aktion bedingungslos schrieb, fiel das nicht auf —
   * und genau so eine Stelle ist die naechste, die auseinanderlaeuft.
   *
   * Gepruefter Fall: die Aktion meldet einen ANDEREN Monat als den gewaehlten
   * (ein Fremdschreibvorgang lag dazwischen). Die Zelle zeigt danach den
   * gemeldeten, nicht den gewaehlten.
   */
  it("nimmt am Monatswaehler den gemeldeten Wert, nicht den gewaehlten", async () => {
    mocks.setzen.mockResolvedValueOnce({ ok: true, wert: { verfall: "2028-01" } });
    await mountListe();

    await monatWaehlen("Mullbinde", "2027-06");

    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "2027-06",
    });
    expect(verfallAnzeige("Mullbinde")).toBe("01/28");
  });

  it("leert die Zelle, wenn die Aktion null meldet — trotz Datum im Feld", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
    await mountListe();

    const dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    // Teilmenge (Bestand 5) UND ein Datum steht im Feld — aus Sicht des Dialogs
    // bleibt also etwas liegen.
    await setzeFeld(dialog, "input[aria-label='Menge']", "2");
    await setzeFeld(dialog, "input[aria-label='Kommentar']", "MHD");
    await absenden(dialog, "aussondern");

    expect(verfallAnzeige("Mullbinde")).toBe("eintragen");
  });
});

describe("Der Dialog beim ZWEITEN Öffnen", () => {
  /**
   * ⚠️ DER ERSTE TEST DECKT DAS NICHT AB. Er aendert den Monat, BEVOR der Dialog
   * je offen war. Hier geht es um den Fall danach: antd gleicht `initialValues`
   * nach der Erstinitialisierung NICHT mehr ab. Seit IDA-232 haengt die Liste
   * den Dialog je Öffnen neu ein (ein Dialog für alle Zeilen), die Zusage bleibt
   * trotzdem stehen: zeigt das Feld den alten Monat, schreibt ein Absenden den
   * neueren zurueck.
   */
  it("zeigt nach dem Schliessen den inzwischen geaenderten Monat", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
    await mountListe();

    // 1. Runde: oeffnen und wieder abbrechen — damit ist die Form initialisiert.
    let dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    const abbrechen = Array.from(dialog.querySelectorAll<HTMLElement>("button"))
      .find((knopf) => (knopf.textContent ?? "").includes("Abbrechen"));
    if (!abbrechen) throw new Error("Abbrechen-Knopf fehlt");
    await clickElement(abbrechen);
    await warte();

    // Danach erst den Monat aendern.
    await monatWaehlen("Mullbinde", "2027-09");

    dialog = await dialogOeffnen("a1", "Mullbinde", "Aussondern");
    expect(dialog.querySelector<HTMLInputElement>("input[aria-label='Verfall']")!.value)
      .toBe("2027-09");
  });
});

describe("Die beiden Schreibwege schliessen einander aus", () => {
  /**
   * ⚠️ EIN WETTLAUF, KEIN ANZEIGEFEHLER. Solange `verfallSetzen` unterwegs ist
   * und jemand in derselben Zeile den GANZEN Bestand aussondert, kann die
   * Antwort NACH dem Loeschen eintreffen: `verfallSetzen` prueft nur die
   * Soll-Zugehoerigkeit und schreibt den Monat dann bedingungslos zurueck. Am
   * Ende stuende eine Verfallszeile fuer einen Artikel ohne Bestand.
   *
   * Die Verfallszelle ist aus demselben Grund schon `disabled={laeuft}`; der
   * Menüeintrag „Aussondern" folgt derselben Sperre.
   */
  it("sperrt das Aussondern, solange der Monat noch gespeichert wird", async () => {
    let freigeben: (() => void) | null = null;
    mocks.setzen.mockReturnValue(new Promise((fertig) => {
      freigeben = () => fertig({ ok: true, wert: { verfall: "2027-09" } });
    }));

    await mountListe();
    expect(gesperrt(await menuePunkt("a1", "Mullbinde", "Aussondern"))).toBe(false);

    await monatWaehlen("Mullbinde", "2027-09");
    expect(gesperrt(await menuePunkt("a1", "Mullbinde", "Aussondern"))).toBe(true);

    await act(async () => { freigeben!(); });
    await warte();
    expect(gesperrt(await menuePunkt("a1", "Mullbinde", "Aussondern"))).toBe(false);
  });
});

describe("Der Rücklauf je Zeile (DRK-366)", () => {
  it("steht neben dem Aussondern und ist nur mit Charge an der Einheit bedienbar", async () => {
    await mountListe();

    expect(gesperrt(await menuePunkt("a1", "Mullbinde", "Zurück ins Handlager"))).toBe(false);
    // Ohne Charge an der Einheit gibt es nichts, was mitwandern koennte — auch
    // dann nicht, wenn der Bestand (a3) aus dem Soll-Lesepfad etwas meldet.
    expect(gesperrt(await menuePunkt("a2", "Kompressen", "Zurück ins Handlager"))).toBe(true);
    expect(gesperrt(await menuePunkt("a3", "Dreiecktuch", "Zurück ins Handlager"))).toBe(true);
  });

  it("bucht ueber denselben Trichter und leert die Zelle, wenn die Angabe faellt", async () => {
    mocks.ruecklauf.mockResolvedValue({
      ok: true, wert: { verfall: null, umgelagert: 5, ziel: "Schrank 1" },
    });
    // EIN Ziel und EINE Charge: beides steht beim Oeffnen schon im Formular.
    await mountListe(ZEILEN, [ZIELE[1]!]);

    const dialog = await dialogOeffnen("a1", "Mullbinde", "Zurück ins Handlager");
    await setzeFeld(dialog, "input[aria-label='Menge']", "5");
    await absenden(dialog, "ruecklauf");

    expect(mocks.ruecklauf).toHaveBeenCalledWith({
      fahrzeugId: "fz-1", artikelId: "a1", chargeId: "c1", menge: 5, zielLagerortId: "sch-1",
    });
    expect(verfallAnzeige("Mullbinde")).toBe("eintragen");
  });
});
