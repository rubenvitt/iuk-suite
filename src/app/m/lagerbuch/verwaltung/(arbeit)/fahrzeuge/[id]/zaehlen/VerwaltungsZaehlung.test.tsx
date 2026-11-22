// @vitest-environment jsdom

/**
 * DIE INSEL DER ZÄHLSEITE (Verwaltungscheck) — Gerüst, Bestand, Abschluss.
 *
 * ⚠️ DIE KARTEN SIND HIER DIE SICHTBAREN ZEILEN (Falle 14): beide Darstellungen
 * stehen im DOM, die Karte zuerst, und eine virtualisierte Tabelle rendert in
 * jsdom keine Zeilen. Gegriffen wird deshalb in `[data-rolle="schmalkarten"]`.
 * Was auf 390px sichtbar ist, entscheidet die Media Query — das sieht nur
 * Playwright (`docs/design/README.md`, „Tests für Responsives").
 */

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vergissFluechtig } from "@/core/entwurf/ablage";
import {
  clickElement, fillElement, mount, query, queryAll, unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import { baueNutzlast, leererZustand } from "../../../../../_lib/verwaltungscheck";

const abschluss = vi.hoisted(() => vi.fn());
vi.mock("../../../../../_actions/verwaltungscheck", () => ({ verwaltungscheckAbschluss: abschluss }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { VerwaltungsZaehlung } = await import("./VerwaltungsZaehlung");

const DATEN: VerwaltungscheckDaten = {
  fahrzeug: { id: "fz-1", name: "RTW 1", kennung: "MS-1", einheitenart: "fahrzeug", aktiv: true },
  positionen: [
    { id: "p1", fachLabel: "1", artikelId: "a1", artikelName: "Mullbinde", einheit: "Stk", soll: 4, sollMax: null },
    { id: "p2", fachLabel: "1", artikelId: "a2", artikelName: "Verbandpäckchen", einheit: "Stk", soll: 2, sollMax: null },
    { id: "p3", fachLabel: "3", artikelId: "a2", artikelName: "Verbandpäckchen", einheit: "Stk", soll: 1, sollMax: null },
  ],
  buchstand: { a1: 4, a2: 3 },
  verfallFach: {},
  verfallArtikel: {},
  chargenAnEinheit: {},
  plomben: [],
  geraete: [{ id: "g1", name: "Defi", typ: "medizin", barcode: null, selbsttest: false }],
  flaschen: [],
  geraeteWoanders: [],
  flaschenWoanders: [],
  ruecklaufZiele: [],
  entnahmeboxAktiv: false,
  lagerorte: [],
  aufladenArtikel: [],
  schwellen: { rotTage: 30, gelbTage: 90 },
};

const WERT = {
  checkId: "chk-1", korrigiert: 0, ausgesondert: 0, zurueckgelegt: 0, aufgefuellt: 0, offen: 0,
  geraeteAuffaellig: 0, flaschenAuffaellig: 0, plombenGesetzt: 0, geraeteGemeldet: 0,
};

const KARTEN = '[data-rolle="schmalkarten"]';

function inKarten<T extends HTMLElement = HTMLElement>(selektor: string): T {
  const el = query(KARTEN).querySelector<T>(selektor);
  if (!el) throw new Error(`Nicht in den Karten: ${selektor}`);
  return el;
}

function reiter(): string[] {
  return queryAll('[role="tab"]').map((t) => t.textContent ?? "");
}

function abschliessenKnopf(): HTMLButtonElement {
  return query<HTMLButtonElement>('[data-rolle="abschluss"]');
}

/** Die ausstehende Antwort der gemockten Action abwarten. */
async function warteAufAntwort(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  abschluss.mockReset();
});

afterEach(async () => { await unmount(); });

describe("VerwaltungsZaehlung", () => {
  it("zeigt alle fünf Reiter mit Zählern, auch ohne Plomben und Flaschen", async () => {
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    expect(reiter()).toEqual(["Bestand 0/3", "Ausgleichen 0", "Plomben", "Geräte 0/1", "Sauerstoff 0/0"]);
  });

  it("„Stimmt“ setzt Ist = Soll und zählt die Position", async () => {
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    const feld = inKarten<HTMLInputElement>('input[aria-label="Ist Mullbinde, Fach 1"]');
    // Keine Vorgabe: ungezählt steht das Feld leer.
    expect(feld.value).toBe("");
    // Falle 20: `.stepper > :global(.ant-input-number)` in `zaehlen.module.css` greift nur, solange
    // antd das Feld unter dieser Klasse als direktes Kind des Steppers rendert.
    expect(feld.closest(".ant-input-number")?.parentElement?.dataset.rolle).toBe("stepper");

    await clickElement(inKarten('button[aria-label="Mullbinde, Fach 1 stimmt"]'));

    expect(inKarten<HTMLInputElement>('input[aria-label="Ist Mullbinde, Fach 1"]').value).toBe("4");
    expect(inKarten('button[aria-label="Mullbinde, Fach 1 stimmt"]').getAttribute("aria-pressed")).toBe("true");
    expect(reiter()[0]).toBe("Bestand 1/3");
    expect(query('[data-rolle="fortschritt"]').textContent).toContain("1 von 3 Positionen gezählt");
  });

  it("sperrt das Verfallsfeld, solange die Position nicht gezählt ist", async () => {
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    const verfall = () => inKarten<HTMLInputElement>('input[aria-label="Verfall Mullbinde, Fach 1"]');
    expect(verfall().disabled).toBe(true);
    await clickElement(inKarten('button[aria-label="Mullbinde, Fach 1 stimmt"]'));
    expect(verfall().disabled).toBe(false);
  });

  it("nennt einen angefangenen Artikel als Sperrgrund und sperrt „Abschließen“", async () => {
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    await clickElement(inKarten('button[aria-label="Verbandpäckchen, Fach 1 stimmt"]'));

    const gruende = query('[data-rolle="sperrgruende"]').textContent ?? "";
    expect(gruende).toContain("Verbandpäckchen: auch in Fach 3 zählen");
    expect(abschliessenKnopf().disabled).toBe(true);

    await clickElement(inKarten('button[aria-label="Verbandpäckchen, Fach 3 stimmt"]'));
    expect(queryAll('[data-rolle="sperrgruende"]')).toHaveLength(0);
    expect(abschliessenKnopf().disabled).toBe(false);
  });

  it("sendet beim Abschließen die Nutzlast aus `baueNutzlast` mit der Sendungs-ID des Entwurfs", async () => {
    abschluss.mockResolvedValue({ ok: true, wert: WERT });
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    await clickElement(inKarten('button[aria-label="Mullbinde, Fach 1 stimmt"]'));
    await clickElement(inKarten('button[aria-label="Verbandpäckchen, Fach 1 stimmt"]'));
    await clickElement(inKarten('button[aria-label="Verbandpäckchen, Fach 3 erhöhen"]'));
    await clickElement(inKarten('button[aria-label="Verbandpäckchen, Fach 3 erhöhen"]'));
    await fillElement(query<HTMLInputElement>('input[aria-label="Kommentar"]'), "Erstbestückung");

    await clickElement(abschliessenKnopf());
    await warteAufAntwort();

    expect(abschluss).toHaveBeenCalledTimes(1);
    const gesendet = abschluss.mock.calls[0]![0] as { sendungId: string };
    expect(gesendet.sendungId).toMatch(/^[0-9a-f-]{36}$/);
    expect(gesendet).toEqual(baueNutzlast(DATEN, {
      ...leererZustand(),
      ist: { p1: 4, p2: 2, p3: 2 },
      kommentar: "Erstbestückung",
    }, gesendet.sendungId));
  });

  it("zeigt nach dem Erfolg das Ergebnis mit Link auf den Check und leert den Entwurf", async () => {
    abschluss.mockResolvedValue({ ok: true, wert: { ...WERT, korrigiert: 1, aufgefuellt: 3 } });
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    await clickElement(inKarten('button[aria-label="Mullbinde, Fach 1 stimmt"]'));
    expect(localStorage.length).toBeGreaterThan(0);

    await clickElement(abschliessenKnopf());
    await warteAufAntwort();

    const ergebnis = query('[data-rolle="ergebnis"]');
    expect(ergebnis.textContent).toContain("Check gespeichert");
    expect(ergebnis.textContent).toContain("3 aufgefüllt");
    const links = Array.from(ergebnis.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toContainEqual(["Zum Check", "/verwaltung/checks/chk-1"]);
    expect(links).toContainEqual(["Zurück zur Einheit", "/verwaltung/fahrzeuge/fz-1"]);
    expect(Object.keys(localStorage).filter((k) => k.includes("lagerbuch:verwaltungscheck:fz-1"))).toEqual([]);
  });

  it("zeigt eine Absage des Servers wörtlich und behält die Zählung", async () => {
    abschluss.mockResolvedValue({ ok: false, fehler: "Mullbinde: höchstens 4 aussondern." });
    await mount(<VerwaltungsZaehlung daten={DATEN} />);
    await clickElement(inKarten('button[aria-label="Mullbinde, Fach 1 stimmt"]'));

    await clickElement(abschliessenKnopf());
    await warteAufAntwort();

    expect(query('[data-rolle="abschluss-fehler"]').textContent).toBe("Mullbinde: höchstens 4 aussondern.");
    expect(inKarten<HTMLInputElement>('input[aria-label="Ist Mullbinde, Fach 1"]').value).toBe("4");
    expect(queryAll('[data-rolle="ergebnis"]')).toHaveLength(0);
  });
});
