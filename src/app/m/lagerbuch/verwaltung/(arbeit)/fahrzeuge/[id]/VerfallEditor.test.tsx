// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
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


const mocks = vi.hoisted(() => ({ setzen: vi.fn(), aussondern: vi.fn() }));

vi.mock("../../../../_actions/lagerortVerfall", () => ({
  verfallSetzen: (...args: unknown[]) => mocks.setzen(...args),
}));

vi.mock("../../../../_actions/aussondernLagerort", () => ({
  aussondernVomLagerort: (...args: unknown[]) => mocks.aussondern(...args),
}));

const ZEILEN: VerfallAnzeigeZeile[] = [
  {
    artikelId: "a1",
    artikelName: "Mullbinde",
    fachText: "Fach A · Fach C",
    verfall: "2027-03",
    statusTon: "gelb",
    statusText: "läuft bald ab",
    bestand: 5,
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
    bestand: 0,
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
    bestand: 3,
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

async function monatWaehlen(ariaLabel: string, monat: string): Promise<void> {
  await clickElement(query(`[aria-label='${ariaLabel}']`));
  await warte();
  const zelle = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-picker-cell",
  )).find((element) => element.getAttribute("title") === monat);
  if (!zelle) throw new Error(`Monat nicht gefunden: ${monat}`);
  await clickElement(zelle);
  await warte();
}

async function monatLeeren(artikelId: string): Promise<void> {
  const zeile = query(`tr[data-row-key='${artikelId}']`);
  const clear = zeile.querySelector<HTMLElement>(".ant-picker-clear");
  if (!clear) throw new Error(`Clear-Knopf fehlt für ${artikelId}`);
  await clickElement(clear);
  await warte();
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

describe("VerfallEditor — serverfertige Zeilen und Monatsfelder", () => {
  it("zeigt Artikel, zusammengefuehrte Faecher und den fertigen Status", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      // DRK-303: „Aktion" traegt das Aussondern je Zeile.
      .toEqual(["Artikel", "Fach", "Verfall", "Status", "Aktion"]);
    expect(query("table").getAttribute("aria-label")).toBe("Verfall im Fahrzeug");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(3);
    const mull = query("tr[data-row-key='a1']");
    expect(mull.textContent).toContain("Mullbinde");
    expect(mull.textContent).toContain("Fach A · Fach C");
    expect(mull.textContent).toContain("läuft bald ab");
    expect(query("tr[data-row-key='a2']").textContent).toContain("nicht erfasst");
    expect(query(`tr[data-row-key='a3'] .${s.ok}`).textContent).toBe("bis 08/29");
  });

  it("rendert pro Zeile einen MonthPicker in voller Arbeitsdichte ohne Form", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    expect(queryAll(`${BREIT} .ant-picker`)).toHaveLength(3);
    // KEIN size="small" (Arbeitsdichte, WCAG 2.5.5) -- volle 44px-Bedienhoehe,
    // keine `-small`-Modifikatorklasse.
    expect(queryAll(`${BREIT} .ant-picker-small`)).toHaveLength(0);
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-03");
    expect(query<HTMLInputElement>("[aria-label='Verfall Kompressen']").value)
      .toBe("");
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

describe("VerfallEditor — result-aware Auto-Commit", () => {
  it("setzt einen Monat sofort mit dem exakten Payload", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatWaehlen("Verfall Mullbinde", "2027-05");

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "2027-05",
    });
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-05");
  });

  it("sendet Clear als leeren String statt undefined", async () => {
    mocks.setzen.mockResolvedValueOnce({ ok: true, wert: { verfall: null } });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatLeeren("a1");

    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "",
    });
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value).toBe("");
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
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatWaehlen("Verfall Mullbinde", "2027-06");

    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-06");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Artikel steht an diesem Lagerort nicht im Soll.");
  });

  it("behaelt bei Reject den neuen Monat und zeigt einen festen Warning-Text", async () => {
    mocks.setzen.mockImplementationOnce(async () => {
      throw new Error("Framework-Text");
    });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatWaehlen("Verfall Mullbinde", "2027-06");

    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-06");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Verfall konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
  /**
   * ⚠️ SORTIERT WIRD DER GESPEICHERTE MONAT, NICHT DER MONATSWAEHLER.
   *
   * „YYYY-MM" ordnet als Zeichenkette bereits richtig — deshalb steht hier
   * ausnahmsweise dasselbe Feld fuer Anzeige und Sortierung. Ein Eintrag ohne
   * Verfall traegt `null` und landet aufsteigend hinten.
   */
  it("sortiert die Verfallsspalte über den gespeicherten Monat", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((zelle) => (zelle.textContent ?? "").includes("Verfall"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);

    expect(queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key")))
      .toEqual(["a1", "a3", "a2"]);
  });

  it("filtert nach Fach über den Spaltenkopf", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((zelle) => (zelle.textContent ?? "").includes("Fach"));
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

    expect(queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key")))
      .toEqual(["a2"]);
  });
});

describe("Aussondern je Zeile", () => {
  it("bietet das Aussondern an, wo Bestand im Fahrzeug liegt", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    const knopf = query("tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']");
    expect(knopf.hasAttribute("disabled")).toBe(false);
  });

  it("sperrt den Knopf, wo nichts liegt", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    const knopf = query("tr[data-row-key='a2'] button[aria-label='Kompressen aussondern']");
    expect(knopf.hasAttribute("disabled")).toBe(true);
  });
});

describe("Aussondern und der eine Stand", () => {
  /**
   * ⚠️ DIE ZWEITE SCHREIBSTELLE AUF DEMSELBEN WERT.
   *
   * Der Aussondern-Dialog aendert denselben Wert wie der Monatswaehler daneben,
   * und `revalidatePath` frischt zwar die Server-Props auf, haengt die Insel
   * aber nicht neu ein. Ohne den gemeinsamen Stand zeigte der Waehler danach
   * still den ALTEN Monat, waehrend Status und naechster Dialog schon den neuen
   * fuehren. Seit DRK-345 laufen beide Wege durch denselben Trichter, und der
   * nimmt den Wert aus der ANTWORT.
   */
  it("uebernimmt den im Dialog gesetzten Monat in den Waehler", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: "2027-09" } });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-03");

    await clickElement(query(
      "tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']",
    ));
    await warte();
    const dialog = document.body.querySelector("[role='dialog']");
    if (!dialog) throw new Error("Dialog nicht offen");

    const setzeFeld = async (selector: string, wert: string) => {
      const feld = dialog.querySelector<HTMLInputElement>(selector);
      if (!feld) throw new Error(`Feld fehlt: ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(feld), "value")?.set;
      await act(async () => {
        setter!.call(feld, wert);
        feld.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await setzeFeld("input[aria-label='Menge']", "1");
    await setzeFeld("input[aria-label='Kommentar']", "MHD");
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
    await act(async () => {
      dialog.querySelector<HTMLFormElement>("[data-rolle='aussondern']")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();
    await warte();

    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-09");
  });

  it("leert den Waehler, wenn der ganze Bestand rausgeht", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    await clickElement(query(
      "tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']",
    ));
    await warte();
    const dialog = document.body.querySelector("[role='dialog']");
    if (!dialog) throw new Error("Dialog nicht offen");
    const setzeFeld = async (selector: string, wert: string) => {
      const feld = dialog.querySelector<HTMLInputElement>(selector);
      if (!feld) throw new Error(`Feld fehlt: ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(feld), "value")?.set;
      await act(async () => {
        setter!.call(feld, wert);
        feld.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    // ZEILEN[0] traegt Bestand 5 — die volle Menge.
    await setzeFeld("input[aria-label='Menge']", "5");
    await setzeFeld("input[aria-label='Kommentar']", "alles raus");
    await act(async () => {
      dialog.querySelector<HTMLFormElement>("[data-rolle='aussondern']")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();
    await warte();

    // Kein Bestand, keine Verfallsangabe — die Aktion loescht die Zeile, und der
    // Waehler darf den Monat nicht weiter behaupten.
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value).toBe("");
  });
});

describe("Der Dialog liest denselben Monat wie der Waehler", () => {
  /**
   * ⚠️ DER SPIEGEL IST WAEHREND DES SPEICHERNS DER NEUERE STAND. `monatSetzen`
   * traegt den gewaehlten Monat SOFORT in den Spiegel und schickt ihn erst
   * danach zum Server; bis die Auffrischung zurueck ist, hat die Prop noch den
   * alten Wert. Bekaeme der Dialog die Prop, stuende in seinem Feld der alte
   * Monat — und eine Teilaussonderung schriebe ihn ueber den gerade
   * gespeicherten zurueck.
   */
  it("uebernimmt den frisch gewaehlten Monat in den Dialog", async () => {
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatWaehlen("Verfall Mullbinde", "2027-09");
    // Die Prop bleibt im Test bei 2027-03 — genau der Zustand vor der
    // Auffrischung, den der Dialog nicht uebernehmen darf.
    expect(ZEILEN[0].verfall).toBe("2027-03");

    await clickElement(query(
      "tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']",
    ));
    await warte();
    const dialog = document.body.querySelector("[role='dialog']");
    if (!dialog) throw new Error("Dialog nicht offen");

    expect(dialog.querySelector<HTMLInputElement>("input[aria-label='Verfall']")!.value)
      .toBe("2027-09");
  });
});

describe("Der Spiegel folgt der Antwort, nicht der Eingabe", () => {
  /**
   * ⚠️ DER FALL, DEN NUR DIE ANTWORT KENNT. Hat jemand anders zwischendurch
   * gebucht, leert die hier gesendete Teilmenge den Bestand — die Transaktion
   * schreibt dann `null`, obwohl im Feld ein Datum stand. Spiegelte die Tabelle
   * ihre eigene EINGABE, zeigte der Waehler danach ein Datum, das in der
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
   * (ein Fremdschreibvorgang lag dazwischen). Der Waehler zeigt danach den
   * gemeldeten, nicht den getippten.
   */
  it("nimmt am Monatswaehler den gemeldeten Wert, nicht den gewaehlten", async () => {
    mocks.setzen.mockResolvedValueOnce({ ok: true, wert: { verfall: "2028-01" } });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    await monatWaehlen("Verfall Mullbinde", "2027-06");

    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "2027-06",
    });
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2028-01");
  });

  it("leert den Waehler, wenn die Aktion null meldet — trotz Datum im Feld", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    await clickElement(query(
      "tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']",
    ));
    await warte();
    const dialog = document.body.querySelector("[role='dialog']");
    if (!dialog) throw new Error("Dialog nicht offen");
    const setzeFeld = async (selector: string, wert: string) => {
      const feld = dialog.querySelector<HTMLInputElement>(selector);
      if (!feld) throw new Error(`Feld fehlt: ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(feld), "value")?.set;
      await act(async () => {
        setter!.call(feld, wert);
        feld.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    // Teilmenge (Bestand 5) UND ein Datum steht im Feld — aus Sicht des Dialogs
    // bleibt also etwas liegen.
    await setzeFeld("input[aria-label='Menge']", "2");
    await setzeFeld("input[aria-label='Kommentar']", "MHD");
    await act(async () => {
      dialog.querySelector<HTMLFormElement>("[data-rolle='aussondern']")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();
    await warte();

    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value).toBe("");
  });
});

describe("Der Dialog beim ZWEITEN Öffnen", () => {
  /**
   * ⚠️ DER ERSTE TEST DECKT DAS NICHT AB. Er aendert den Monat, BEVOR der Dialog
   * je offen war — dann traegt der erste Aufbau die neuen `initialValues`. Hier
   * geht es um den Fall danach: antd gleicht `initialValues` nach der
   * Erstinitialisierung NICHT mehr ab, und die Form-Instanz gehoert der
   * Dialogkomponente, ueberlebt `destroyOnHidden` also. Zeigt der Waehler dann
   * den alten Monat, schreibt ein Absenden den neueren zurueck.
   */
  it("zeigt nach dem Schliessen den inzwischen geaenderten Monat", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true, wert: { verfall: null } });
    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);

    const oeffne = async () => {
      await clickElement(query(
        "tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']",
      ));
      await warte();
      const dialog = document.body.querySelector("[role='dialog']");
      if (!dialog) throw new Error("Dialog nicht offen");
      return dialog;
    };

    // 1. Runde: oeffnen und wieder abbrechen — damit ist die Form initialisiert.
    let dialog = await oeffne();
    const abbrechen = Array.from(dialog.querySelectorAll<HTMLElement>("button"))
      .find((knopf) => (knopf.textContent ?? "").includes("Abbrechen"));
    if (!abbrechen) throw new Error("Abbrechen-Knopf fehlt");
    await clickElement(abbrechen);
    await warte();

    // Danach erst den Monat aendern.
    await monatWaehlen("Verfall Mullbinde", "2027-09");

    dialog = await oeffne();
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
   * Der Monatswaehler daneben ist aus demselben Grund schon `disabled={laeuft}`;
   * der Aussondern-Knopf war die letzte offene Tuer.
   */
  it("sperrt das Aussondern, solange der Monat noch gespeichert wird", async () => {
    let freigeben: (() => void) | null = null;
    mocks.setzen.mockReturnValue(new Promise((fertig) => {
      freigeben = () => fertig({ ok: true, wert: { verfall: "2027-09" } });
    }));

    await mount(<VerfallEditor einheitenart="fahrzeug" lagerortId="fz-1" eintraege={ZEILEN} />);
    const knopf = () => query<HTMLButtonElement>(
      "tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']",
    );
    expect(knopf().disabled).toBe(false);

    await monatWaehlen("Verfall Mullbinde", "2027-09");
    expect(knopf().disabled).toBe(true);

    await act(async () => { freigeben!(); });
    await warte();
    expect(knopf().disabled).toBe(false);
  });
});
