// @vitest-environment jsdom

/**
 * DER REITER „Ausgleichen" (Spec 6.4, 6.12) — Zeilen, Dialoge, Absichten.
 *
 * Geprüft wird, was nur die Dialoge entscheiden: welche Absicht aus ihren
 * Feldern in den Zählstand kommt, und was sie gar nicht erst übernehmen
 * (Menge ≤ 0 oder leer, Schrank ohne Charge). Was der Abschluss daraus macht,
 * prüfen `_lib/verwaltungscheck.test.ts` und die Tests der Action.
 */

import { act, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { HANDLAGER_ID } from "../../../../../_lib/konstanten";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import { leererZustand, type ZaehlZustand } from "../../../../../_lib/verwaltungscheck";

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

const getDetail = vi.hoisted(() => vi.fn());
vi.mock("../../../../../_actions/detail", () => ({ getDetail }));

const { AusgleichReiter } = await import("./AusgleichReiter");

const DATEN: VerwaltungscheckDaten = {
  fahrzeug: { id: "fz-1", name: "RTW 1", kennung: "MS-1", einheitenart: "fahrzeug", aktiv: true },
  positionen: [
    { id: "p1", fachLabel: "1", artikelId: "a1", artikelName: "Mullbinde", einheit: "Stk", soll: 4, sollMax: null },
    { id: "p2", fachLabel: "2", artikelId: "a2", artikelName: "Kompresse", einheit: "Stk", soll: 2, sollMax: 3 },
  ],
  buchstand: { a1: 1, a2: 5 },
  verfallFach: {},
  verfallArtikel: {},
  chargenAnEinheit: {
    a2: [
      { chargeId: "c5", label: "L-5 · 05/28", menge: 4 },
      { chargeId: "c6", label: "L-6 · 06/29", menge: 2 },
    ],
  },
  plomben: [],
  geraete: [],
  flaschen: [],
  geraeteWoanders: [],
  flaschenWoanders: [],
  ruecklaufZiele: [{ id: "sch-1", name: "Schrank 1" }],
  entnahmeboxAktiv: true,
  lagerorte: [],
  aufladenArtikel: [],
  schwellen: { rotTage: 30, gelbTage: 90 },
};

/** Mullbinde fehlen 3, Kompresse liegt 3 über „OK bis" und 1 über dem Lagerbuch. */
const GEZAEHLT: ZaehlZustand = { ...leererZustand(), ist: { p1: 1, p2: 6 } };

const ort = (id: string, name: string, menge: number) => ({
  id, name, menge, zugangshinweis: null, typ: "lager" as const, kennung: null, einheitenart: null,
});

const DETAIL = {
  artikel: {
    id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1",
    mindestbestand: 1, aktiv: true, bestand: 9, kategorie: null,
  },
  chargen: [
    {
      id: "c1", chargenNr: "L-ALT", verfall: "2027-01", rest: 4, restGesamt: 4,
      orte: [ort("sch-1", "Schrank 1", 4)], ampel: "gruen" as const, text: "ok",
    },
    {
      id: "c2", chargenNr: "L-NEU", verfall: "2029-06", rest: 5, restGesamt: 5,
      orte: [ort(HANDLAGER_ID, "Handlager", 5)], ampel: "gruen" as const, text: "ok",
    },
  ],
  historie: [],
  mehrVorhanden: false,
  zielOrte: [],
  handlagerOrtIds: [HANDLAGER_ID, "sch-1"],
};

/** Der Stand, den der Reiter zuletzt geschrieben hat — die Insel hielte ihn im Entwurf. */
let stand: ZaehlZustand;

/** Außerhalb der Komponente: die Regel `react-hooks/globals` verbietet das Zuweisen im Rendern. */
function merke(z: ZaehlZustand): void {
  stand = z;
}

function Huelle({ start }: { start: ZaehlZustand }) {
  const [zustand, setZustand] = useState(start);
  useEffect(() => { merke(zustand); }, [zustand]);
  return <AusgleichReiter daten={DATEN} zustand={zustand} aendere={setZustand} gesperrt={false} />;
}

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

function zeile(artikelId: string): HTMLElement {
  return query(`[data-rolle="ausgleich-zeile"][data-artikel="${artikelId}"]`);
}

async function oeffne(artikelId: string, rolle: "auffuellen" | "zuruecklegen" | "aussondern"): Promise<void> {
  const knopf = zeile(artikelId).querySelector<HTMLButtonElement>(`button[data-rolle="${rolle}"]`);
  if (!knopf) throw new Error(`Knopf fehlt: ${rolle}`);
  await clickElement(knopf);
  await warte();
  await warte();
}

function dialog(): HTMLElement {
  const offen = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-modal-wrap"))
    .filter((m) => m.style.display !== "none");
  const d = offen.at(-1);
  if (!d) throw new Error("Kein Dialog offen");
  return d;
}

async function uebernehmen(): Promise<void> {
  const ok = Array.from(dialog().querySelectorAll<HTMLButtonElement>(".ant-modal-footer button"))
    .find((b) => (b.textContent ?? "").includes("Übernehmen"));
  if (!ok) throw new Error("„Übernehmen“ fehlt");
  await clickElement(ok);
  for (let i = 0; i < 4; i += 1) await warte();
}

async function oeffneAuswahl(ariaLabel: string): Promise<HTMLElement> {
  const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const listen = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-dropdown"))
    .filter((l) => !l.classList.contains("ant-select-dropdown-hidden"));
  const liste = listen.at(-1);
  if (!liste) throw new Error(`Keine offene Liste: ${ariaLabel}`);
  return liste;
}

async function waehle(ariaLabel: string, text: string): Promise<void> {
  const liste = await oeffneAuswahl(ariaLabel);
  const option = Array.from(liste.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((o) => (o.textContent ?? "").includes(text));
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function tippe(ariaLabel: string, wert: string): Promise<void> {
  const feld = queryPortal<HTMLInputElement>(`input[aria-label='${ariaLabel}']`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  await act(async () => {
    feld.focus();
    setter!.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    feld.blur();
  });
  await warte();
}

beforeEach(() => {
  getDetail.mockReset();
  getDetail.mockResolvedValue({ ok: true, wert: DETAIL });
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("AusgleichReiter", () => {
  it("zeigt je abweichendem Artikel eine Zeile, den Hinweis auf ein Plus ohne Herkunft und die Vorschau", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    expect(queryAll('[data-rolle="ausgleich-zeile"]').map((z) => z.dataset.artikel)).toEqual(["a1", "a2"]);
    expect(zeile("a1").textContent).toContain("Nach dem Ausgleich: 1");
    expect(zeile("a2").textContent).toContain("Mehr als im Lagerbuch — woher?");
    expect(zeile("a1").textContent).not.toContain("woher?");
  });

  it("sagt ohne gezählten Artikel, wo gezählt wird", async () => {
    await mount(<Huelle start={leererZustand()} />);
    expect(query('[data-rolle="ausgleich-leer"]').textContent).toContain("Bestand");
  });

  it("Auffüllen: Menge vorbelegt, Handlager als Vorgabe, „schon mitgezählt“ landet in der Absicht", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a1", "auffuellen");
    expect(getDetail).toHaveBeenCalledWith("a1");
    expect(queryPortal<HTMLInputElement>("input[aria-label='Menge']").value).toBe("3");

    await clickElement(queryPortal("button[aria-label='Schon eingeräumt und mitgezählt']"));
    await uebernehmen();

    expect(stand.ausgleich.a1).toEqual({
      auffuellen: { menge: 3, herkunft: { art: "handlager" }, mitgezaehlt: true },
    });
    expect(zeile("a1").querySelector('[data-rolle="absicht-auffuellen"]')?.textContent)
      .toContain("Auffüllen 3");
    // Mitgezählt steckt schon im Ist — die Vorschau bleibt.
    expect(zeile("a1").textContent).toContain("Nach dem Ausgleich: 1");
  });

  it("Auffüllen von einem bestimmten Ort nimmt Ort und Charge", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a1", "auffuellen");
    await waehle("Woher", "Schrank 1");
    await uebernehmen();

    expect(stand.ausgleich.a1).toEqual({
      auffuellen: { menge: 3, herkunft: { art: "ort", vonLagerortId: "sch-1", chargeId: "c1" } },
    });
    expect(zeile("a1").textContent).toContain("Nach dem Ausgleich: 4");
  });

  it("Auffüllen mit neuer Charge schreibt den Verfall als YYYY-MM", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a1", "auffuellen");
    await waehle("Woher", "Neu angeliefert");
    await waehle("Charge", "Neue Charge");
    await tippe("Chargennummer", "L-42");
    await tippe("Verfallsmonat", "3/2030");
    await uebernehmen();

    expect(stand.ausgleich.a1?.auffuellen?.herkunft).toEqual({
      art: "neu", charge: { art: "neu", chargenNr: "L-42", verfall: "2030-03" },
    });
  });

  it("Zurücklegen in einen Schrank ohne Charge wird nicht übernommen, in die Entnahmebox schon", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a2", "zuruecklegen");
    expect(queryPortal<HTMLInputElement>("input[aria-label='Menge']").value).toBe("3");

    await waehle("Wohin", "Schrank 1");
    await uebernehmen();
    expect(stand.ausgleich.a2).toBeUndefined();
    expect(dialog().textContent).toContain("Charge wählen");

    await waehle("Wohin", "Entnahmebox");
    await uebernehmen();
    expect(stand.ausgleich.a2).toEqual({ zuruecklegen: { menge: 3, zielLagerortId: "entnahmebox" } });
    expect(zeile("a2").querySelector('[data-rolle="absicht-zuruecklegen"]')?.textContent)
      .toContain("Zurücklegen 3 in Entnahmebox");
  });

  it("Zurücklegen in einen Schrank mit Charge", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a2", "zuruecklegen");
    await waehle("Wohin", "Schrank 1");
    await waehle("Charge", "L-6");
    await uebernehmen();
    expect(stand.ausgleich.a2).toEqual({ zuruecklegen: { menge: 3, zielLagerortId: "sch-1", chargeId: "c6" } });
  });

  it.each([[""], ["0"], ["-2"], ["2.5"]])("Aussondern übernimmt die Menge „%s“ nicht", async (menge) => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a2", "aussondern");
    await tippe("Menge", menge);
    await uebernehmen();
    expect(stand.ausgleich.a2).toBeUndefined();
    expect(dialog().textContent).toMatch(/Menge fehlt\.|Menge: eine ganze Zahl ab 1\./);
  });

  it("Aussondern mit Grund-Vorgabe; der Chip nimmt die Absicht wieder heraus", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    await oeffne("a2", "aussondern");
    expect(queryPortal<HTMLInputElement>("input[aria-label='Grund']").value).toBe("Beim Zählen ausgesondert");
    await tippe("Menge", "2");
    await uebernehmen();
    expect(stand.ausgleich.a2).toEqual({ aussondern: { menge: 2, grund: "Beim Zählen ausgesondert" } });
    expect(zeile("a2").textContent).toContain("Nach dem Ausgleich: 4");

    await clickElement(zeile("a2").querySelector<HTMLButtonElement>('button[aria-label="Aussondern entfernen"]')!);
    expect(stand.ausgleich.a2).toBeUndefined();
  });

  it("Aussondern ist kein roter und kein Primärknopf (Falle 3)", async () => {
    await mount(<Huelle start={GEZAEHLT} />);
    const knopf = zeile("a2").querySelector<HTMLButtonElement>('button[data-rolle="aussondern"]')!;
    expect(knopf.className).not.toMatch(/ant-btn-(primary|dangerous)/);
  });
});
