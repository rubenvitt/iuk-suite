// @vitest-environment jsdom

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
  clickElement,
  clickPortal,
  exists,
  existsPortal,
  fill,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import {
  HandlagerVerfallTabelle,
  sucheTrifft,
  type HandlagerVerfallZeile,
} from "./HandlagerVerfallTabelle";

/**
 * IDA-238 — DIE CHARGEN IM HANDLAGER ALS TABELLE MIT SAMMELAKTION.
 *
 * Die Einzelbuchung samt Ortswahl prueft `AussondernRow.test.tsx`, die
 * Buchungen selbst `_actions/aussondern.test.ts`. Hier steht, was die Insel
 * dazwischen zusagt: nur Abgelaufenes ist waehlbar, EINE Rueckfrage nennt
 * alle, EINE Anfrage schickt Orte und keine Mengen, und eine uebersprungene
 * Charge wird genannt statt verschluckt.
 */
const BREIT = '[data-rolle="breitansicht"]';
const SCHMAL = '[data-rolle="schmalkarten"]';

const mocks = vi.hoisted(() => ({
  aussondern: vi.fn(),
  aussondernSammel: vi.fn(),
}));

vi.mock("../../../_actions/aussondern", () => ({
  aussondern: (...args: unknown[]) => mocks.aussondern(...args),
  aussondernSammel: (...args: unknown[]) => mocks.aussondernSammel(...args),
}));

const ALT: HandlagerVerfallZeile = {
  chargeId: "c-alt",
  chargenNr: "L42",
  artikelName: "Kompressen",
  verfall: "2020-01",
  verfallText: "01/20",
  statusTon: "rot",
  statusText: "abgelaufen",
  abgelaufen: true,
  rest: 10,
  einheit: "Stk.",
  orte: [
    { id: HANDLAGER_ID, name: "Nicht zugeordnet", menge: 4, zugangshinweis: null },
    { id: "schrank-gf", name: "GF-Schrank", menge: 6, zugangshinweis: "Schlüssel beim GF" },
  ],
  draussen: [],
};

const AUCH_ALT: HandlagerVerfallZeile = {
  ...ALT,
  chargeId: "c-auch-alt",
  chargenNr: "M7",
  artikelName: "Mullbinde",
  rest: 2,
  orte: [{ id: HANDLAGER_ID, name: "Nicht zugeordnet", menge: 2, zugangshinweis: null }],
};

const WARNEND: HandlagerVerfallZeile = {
  ...AUCH_ALT,
  chargeId: "c-warn",
  chargenNr: "W1",
  artikelName: "Pflaster",
  verfall: "2026-11",
  verfallText: "11/26",
  statusTon: "gelb",
  statusText: "fällig 11/26",
  abgelaufen: false,
};

/**
 * IDA-379 — abgelaufen, im Handlager NICHTS mehr, draussen an drei Orten. Das
 * Beispiel aus dem Befund: die Schublade zeigte „abgelaufen: Entnahmebox 6,
 * KTW 1 6, Sanitätstasche 1 6", die Verfall-Seite gar nichts.
 */
const NUR_DRAUSSEN: HandlagerVerfallZeile = {
  ...ALT,
  chargeId: "c-draussen",
  chargenNr: "K-2024-118",
  artikelName: "Kompressen",
  rest: 0,
  orte: [],
  draussen: [
    { id: "entnahmebox", name: "Entnahmebox", menge: 6, href: "/verwaltung/entnahmebox" },
    { id: "ktw-1", name: "KTW 1", menge: 6, href: "/verwaltung/fahrzeuge/ktw-1" },
    { id: "san-1", name: "Sanitätstasche 1", menge: 6, href: "/verwaltung/fahrzeuge/san-1" },
  ],
};

/** Abgelaufen, im Handlager an EINEM Ort, und ausserdem in einer Einheit. */
const AUCH_DRAUSSEN: HandlagerVerfallZeile = {
  ...AUCH_ALT,
  chargeId: "c-auch-draussen",
  chargenNr: "S3",
  artikelName: "Sauerstoffmaske",
  draussen: [{ id: "ktw-1", name: "KTW 1", menge: 1, href: "/verwaltung/fahrzeuge/ktw-1" }],
};

const ZEILEN = [ALT, AUCH_ALT, WARNEND];
const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  mocks.aussondernSammel.mockResolvedValue({
    ok: true,
    wert: { ausgesondert: ["c-alt", "c-auch-alt"], uebersprungen: [] },
  });
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

afterAll(() => vi.restoreAllMocks());

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

function kreuz(id: string): HTMLInputElement {
  return query<HTMLInputElement>(`${BREIT} tr[data-row-key='${id}'] input[type='checkbox']`);
}

async function rueckfrageOeffnen(): Promise<void> {
  const knopf = queryAll<HTMLButtonElement>("[data-testid='verfall-sammelleiste'] button")
    .find((b) => b.textContent === "Ausgewählte aussondern");
  await clickElement(knopf!);
  await warteAuf(() => existsPortal(".ant-modal"), "Rueckfrage");
}

describe("HandlagerVerfallTabelle", () => {
  it("zeigt die Ampel einmal, als Chip mit Text, und die Liegeplaetze in der Zeile", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    const zeile = query(`${BREIT} tr[data-row-key='c-alt']`);

    // Keine Plakette mehr neben dem Chip — dieselbe Farbe stand dort zweimal.
    expect(zeile.querySelector("svg[role='img']")).toBeNull();
    expect(zeile.textContent).toContain("abgelaufen");
    expect(zeile.textContent).toContain("Nicht zugeordnet: 4 Stk.");
    expect(zeile.textContent).toContain("GF-Schrank: 6 Stk.");
    expect(zeile.textContent).toContain("Rest 10 Stk.");
    // Ein Liegeplatz: die Summe faellt weg (DRK-339).
    expect(query(`${BREIT} tr[data-row-key='c-auch-alt']`).textContent).not.toContain("Rest");
  });

  it("laesst nur abgelaufene Chargen auswaehlen — in Tabelle UND Karte", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);

    expect(kreuz("c-alt").disabled).toBe(false);
    expect(kreuz("c-warn").disabled).toBe(true);
    const karte = query(`${SCHMAL} [data-karte-key='c-warn'] input[type='checkbox']`);
    expect((karte as HTMLInputElement).disabled).toBe(true);
  });

  /**
   * IDA-379, Befund 3: der Knopf stand nur an Chargen mit MEHR als einem
   * Liegeplatz — „Sauerstoffmaske" hatte ihn, „Kompressen" darueber nicht,
   * und warum, stand nirgends. Jetzt: jede abgelaufene Zeile mit
   * Handlager-Rest, egal an wie vielen Orten.
   */
  it("setzt den Einzelknopf an JEDE abgelaufene Charge mit Handlager-Rest", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={[...ZEILEN, NUR_DRAUSSEN]} />);
    expect(queryAll(`${BREIT} button[aria-label$='aussondern']`)
      .map((knopf) => knopf.getAttribute("aria-label")))
      .toEqual(["L42 · Kompressen aussondern", "M7 · Mullbinde aussondern"]);
    expect(queryAll(`${SCHMAL} button[aria-label$='aussondern']`)).toHaveLength(2);
  });

  /**
   * IDA-379, Befund 2: eine abgelaufene Charge ohne Handlager-Rest steht in der
   * Liste, mit ihren Orten und einem Sprung je Ort — aber ohne Knopf und ohne
   * Kaestchen: `aussondern` bucht nur den Handlager-Rest und wiese sie ab.
   */
  it("fuehrt eine Charge, die nur draussen liegt, mit Orten und ohne Aussondern", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={[NUR_DRAUSSEN]} />);
    const zeile = query(`${BREIT} tr[data-row-key='c-draussen']`);

    expect(zeile.querySelector("[data-rolle='aussen-orte']")?.textContent)
      .toBe("liegt in: Entnahmebox (6 Stk.), KTW 1 (6 Stk.), Sanitätstasche 1 (6 Stk.)");
    expect([...zeile.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]))
      .toEqual([
        ["Entnahmebox", "/verwaltung/entnahmebox"],
        ["KTW 1", "/verwaltung/fahrzeuge/ktw-1"],
        ["Sanitätstasche 1", "/verwaltung/fahrzeuge/san-1"],
      ]);
    expect(zeile.textContent).not.toContain("Rest");
    expect(zeile.querySelector("button[aria-label$='aussondern']")).toBeNull();
    expect(kreuz("c-draussen").disabled).toBe(true);
    const karte = query(`${SCHMAL} [data-karte-key='c-draussen'] input[type='checkbox']`);
    expect((karte as HTMLInputElement).disabled).toBe(true);
  });

  it("nennt neben den Liegeplaetzen, wo die Charge ausserdem liegt", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={[AUCH_DRAUSSEN]} />);
    const zeile = query(`${BREIT} tr[data-row-key='c-auch-draussen']`);
    expect(zeile.textContent).toContain("Nicht zugeordnet: 2 Stk.");
    expect(zeile.querySelector("[data-rolle='aussen-orte']")?.textContent)
      .toBe("liegt außerdem in: KTW 1 (1 Stk.)");
    expect(zeile.querySelector("a")?.getAttribute("href")).toBe("/verwaltung/fahrzeuge/ktw-1");
    expect(sucheTrifft(AUCH_DRAUSSEN, "ktw")).toBe(true);
  });

  it("nennt in der Sammel-Rueckfrage auch, was draussen liegen bleibt", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={[AUCH_DRAUSSEN, NUR_DRAUSSEN]} />);
    await clickElement(kreuz("c-auch-draussen"));
    await rueckfrageOeffnen();

    expect(
      [...queryPortal("[data-testid='verfall-sammelliste']").querySelectorAll("li")]
        .map((li) => li.textContent),
    ).toEqual([
      "S3 · Sauerstoffmaske — Nicht zugeordnet: 2 Stk. · liegt außerdem in: KTW 1 (1 Stk.)",
    ]);
    expect(queryPortal("[data-testid='verfall-sammelliste'] a").getAttribute("href"))
      .toBe("/verwaltung/fahrzeuge/ktw-1");
  });

  it("nennt in EINER Rueckfrage alle gewaehlten Chargen samt Orten", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    await clickElement(kreuz("c-alt"));
    await clickElement(kreuz("c-auch-alt"));

    expect(query("[data-testid='verfall-sammelleiste']").textContent).toContain("2 Chargen ausgewählt");
    await rueckfrageOeffnen();

    expect(queryPortal(".ant-modal-title").textContent).toBe("2 Chargen aussondern?");
    expect(
      [...queryPortal("[data-testid='verfall-sammelliste']").querySelectorAll("li")]
        .map((li) => li.textContent),
    ).toEqual([
      "L42 · Kompressen — Nicht zugeordnet: 4 Stk., GF-Schrank: 6 Stk.",
      "M7 · Mullbinde — Nicht zugeordnet: 2 Stk.",
    ]);
    expect(mocks.aussondernSammel).not.toHaveBeenCalled();
  });

  it("schickt EINE Anfrage mit den gezeigten Orten und ohne Menge", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    await clickElement(kreuz("c-alt"));
    await clickElement(kreuz("c-auch-alt"));
    await rueckfrageOeffnen();

    await clickPortal(".ant-modal .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-success"), "Erfolgsmeldung");

    expect(mocks.aussondernSammel).toHaveBeenCalledTimes(1);
    expect(mocks.aussondernSammel).toHaveBeenCalledWith({
      chargen: [
        { chargeId: "c-alt", lagerortIds: [HANDLAGER_ID, "schrank-gf"] },
        { chargeId: "c-auch-alt", lagerortIds: [HANDLAGER_ID] },
      ],
    });
    expect(JSON.stringify(mocks.aussondernSammel.mock.calls[0]?.[0])).not.toContain("menge");
    expect(mocks.aussondern).not.toHaveBeenCalled();
    expect(query(".ant-alert-success").textContent).toContain("2 Chargen ausgesondert.");
    // Die Auswahl ist verbraucht.
    expect(exists("[data-testid='verfall-sammelleiste']")).toBe(false);
  });

  /**
   * DER TEILFEHLER AUS DEM TICKET: eine Charge war schon weg. Gemeldet werden
   * beide Haelften — was gebucht ist, und was mit welchem Grund stehen blieb.
   */
  it("nennt eine uebersprungene Charge mit Namen und Grund", async () => {
    mocks.aussondernSammel.mockResolvedValueOnce({
      ok: true,
      wert: {
        ausgesondert: ["c-auch-alt"],
        uebersprungen: [{ chargeId: "c-alt", grund: "bereits ausgesondert" }],
      },
    });
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    await clickElement(kreuz("c-alt"));
    await clickElement(kreuz("c-auch-alt"));
    await rueckfrageOeffnen();
    await clickPortal(".ant-modal .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-warning"), "Hinweis auf die uebersprungene");

    expect(query(".ant-alert-success").textContent).toContain("1 Charge ausgesondert.");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Nicht ausgesondert: L42 · Kompressen (bereits ausgesondert)");
  });

  it("zeigt einen fachlichen Fehler als Warnung und laesst die Auswahl stehen", async () => {
    mocks.aussondernSammel.mockResolvedValueOnce({ ok: false, fehler: "Aussondern fehlgeschlagen." });
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    await clickElement(kreuz("c-alt"));
    await rueckfrageOeffnen();
    await clickPortal(".ant-modal .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-warning"), "Warnung");

    expect(query(".ant-alert-warning").textContent).toContain("Aussondern fehlgeschlagen.");
    expect(query("[data-testid='verfall-sammelleiste']").textContent).toContain("1 Charge ausgewählt");
  });

  it("zeigt bei einem Laufzeitfehler einen festen Satz ohne Interna", async () => {
    mocks.aussondernSammel.mockRejectedValueOnce(new Error("SQLITE intern"));
    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    await clickElement(kreuz("c-alt"));
    await rueckfrageOeffnen();
    await clickPortal(".ant-modal .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-warning"), "Warnung");

    const text = query(".ant-alert-warning").textContent ?? "";
    expect(text).toContain("Die Chargen konnten nicht ausgesondert werden.");
    expect(text).not.toContain("SQLITE");
  });

  it("sucht ueber Artikel, Charge und Liegeplatz", async () => {
    expect(sucheTrifft(ALT, "kompr")).toBe(true);
    expect(sucheTrifft(ALT, "l42")).toBe(true);
    expect(sucheTrifft(ALT, "gf-schrank")).toBe(true);
    expect(sucheTrifft(AUCH_ALT, "gf-schrank")).toBe(false);

    await mount(<HandlagerVerfallTabelle zeilen={ZEILEN} />);
    await fill("input[type='search']", "GF");
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 250));
    });

    expect(queryAll(`${BREIT} tr[data-row-key]`).map((tr) => tr.getAttribute("data-row-key")))
      .toEqual(["c-alt"]);
    expect(query("[data-testid='trefferanzeige']").textContent).toBe("1 von 3");
  });

  it("behaelt die Reihenfolge nach Dringlichkeit, die der Server liefert", async () => {
    await mount(<HandlagerVerfallTabelle zeilen={[WARNEND, ALT]} />);
    expect(queryAll(`${BREIT} tr[data-row-key]`).map((tr) => tr.getAttribute("data-row-key")))
      .toEqual(["c-warn", "c-alt"]);
  });
});
