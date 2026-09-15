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
  mocks.setzen.mockResolvedValue({ ok: true, wert: { gesetzt: true } });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("VerfallEditor — serverfertige Zeilen und Monatsfelder", () => {
  it("zeigt Artikel, zusammengefuehrte Faecher und den fertigen Status", async () => {
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

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
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

    expect(queryAll(".ant-picker")).toHaveLength(3);
    // KEIN size="small" (Arbeitsdichte, WCAG 2.5.5) -- volle 44px-Bedienhoehe,
    // keine `-small`-Modifikatorklasse.
    expect(queryAll(".ant-picker-small")).toHaveLength(0);
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-03");
    expect(query<HTMLInputElement>("[aria-label='Verfall Kompressen']").value)
      .toBe("");
    expect(queryAll(".ant-form-item")).toHaveLength(0);

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
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
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
    mocks.setzen.mockResolvedValueOnce({ ok: true, wert: { gesetzt: false } });
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
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
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
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
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
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
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((zelle) => (zelle.textContent ?? "").includes("Verfall"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);

    expect(queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key")))
      .toEqual(["a1", "a3", "a2"]);
  });

  it("filtert nach Fach über den Spaltenkopf", async () => {
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

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
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

    const knopf = query("tr[data-row-key='a1'] button[aria-label='Mullbinde aussondern']");
    expect(knopf.hasAttribute("disabled")).toBe(false);
  });

  it("sperrt den Knopf, wo nichts liegt", async () => {
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

    const knopf = query("tr[data-row-key='a2'] button[aria-label='Kompressen aussondern']");
    expect(knopf.hasAttribute("disabled")).toBe(true);
  });
});

describe("Aussondern und der Monatsspiegel", () => {
  /**
   * ⚠️ DIE ZWEITE SCHREIBSTELLE AUF DEMSELBEN WERT.
   *
   * `spiegel` wird EINMAL beim Einhaengen aus den Props gefuellt — fuer JEDEN
   * Artikel, weshalb `monatFuer` danach IMMER den Spiegel nimmt und nie wieder
   * die Prop. Solange nur der Monatswaehler schrieb, stimmte das. Der
   * Aussondern-Dialog aendert denselben Wert, und `revalidatePath` frischt zwar
   * die Server-Props auf, haengt die Insel aber nicht neu ein: der Waehler
   * zeigte danach still den ALTEN Monat, waehrend Status und naechster Dialog
   * schon den neuen fuehren.
   */
  it("uebernimmt den im Dialog gesetzten Monat in den Waehler", async () => {
    mocks.aussondern.mockResolvedValue({ ok: true });
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
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
    mocks.aussondern.mockResolvedValue({ ok: true });
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

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
