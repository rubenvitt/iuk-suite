// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createRef, useState, type RefObject } from "react";
import type { InputRef } from "antd";
import { clickElement, fill, mount, query, queryAll, rerender, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { PlanFehler } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { StelleFormular } from "./StelleFlyin";

const INDEX = [
  { schluessel: "rezept:C.1.1", titel: "Löschstaffel", suchtext: "löschstaffel c.1.1" },
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", suchtext: "eal" },
];
const START = baue({
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", kontakte: { email: "ea1@drk.de", funkrufname: "RK UE 40-00" } },
  ],
});

let stand: PlanInhalt = START;
const lade = vi.fn();
const loesche = vi.fn();
const fertig = vi.fn();
// Modulweit, nicht als Vorgabe im Parameter: ein neues Objekt je Rendern löste die Fokus-Effekte bei jeder Eingabe aus.
const FOKUS0 = { ziel: "titel" as const, stelle: "a", n: 0 };
const REF0 = createRef<InputRef>();
function Rahmen({ fokus = FOKUS0, titelRef = REF0 }: { fokus?: { ziel: "titel" | "einheit"; stelle: string | null; n: number }; titelRef?: RefObject<InputRef | null> }) {
  const [inhalt, setInhalt] = useState(START);
  const aendere: Aendere = (op) => {
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return <StelleFormular inhalt={inhalt} stelleId="a" aendere={aendere} symbole={{}} zeichenIndex={INDEX} ladeSymbole={lade}
    fokus={fokus} titelRef={titelRef} onLoeschen={loesche} onFertig={fertig} />;
}
const stelle = () => stand.stellen.find((s) => s.id === "a")!;
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
async function druecke(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
}

afterEach(async () => { await unmount(); stand = START; lade.mockReset(); loesche.mockReset(); fertig.mockReset(); window.localStorage.clear(); });

describe("Flyin einer Stelle (Spec §6.4)", () => {
  it("Titel und Leiter schreiben sofort ins Dokument; ein geleerter Leiter ist null", async () => {
    await mount(<Rahmen />);
    await fill('input[name="titel"]', "EA Nord");
    await fill('input[name="leiter"]', "Jana");
    expect(stelle()).toMatchObject({ titel: "EA Nord", leiter: "Jana" });
    await fill('input[name="leiter"]', "");
    expect(stelle().leiter).toBeNull();
    expect(query<HTMLInputElement>('input[name="titel"]').maxLength).toBe(200);
  });
  it("Hervorheben", async () => {
    await mount(<Rahmen />);
    await clickElement(query(".kp-hervorheben input"));
    expect(stelle().hervorheben).toBe(true);
  });
  it("Zeichen: Suche lädt die Symbole der Treffer nach, Wahl setzt das Zeichen und merkt es als zuletzt genutzt", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Zeichen suchen"]', "lösch");
    expect(lade).toHaveBeenLastCalledWith(["rezept:C.1.1"]);
    await clickElement(query('[data-zeichen="rezept:C.1.1"]'));
    expect(stelle().zeichen).toBe("rezept:C.1.1");
    expect(JSON.parse(window.localStorage.getItem("kommplan:zeichen:zuletzt")!)).toEqual(["rezept:C.1.1"]);
    await clickElement(knopf("Kein Zeichen"));
    expect(stelle().zeichen).toBeNull();
  });
  it("Zeichen: Enter im Suchfeld wählt den ersten Treffer, ↓ springt ins Raster", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Zeichen suchen"]', "e");
    await druecke(query('input[aria-label="Zeichen suchen"]'), "ArrowDown");
    expect(document.activeElement).toBe(queryAll("[data-zeichen]")[0]);
    await fill('input[aria-label="Zeichen suchen"]', "lösch");
    await druecke(query('input[aria-label="Zeichen suchen"]'), "Enter");
    expect(stelle().zeichen).toBe("rezept:C.1.1");
  });
  it("Enter im Titelfeld heißt „fertig“ (Entscheidung 17)", async () => {
    await mount(<Rahmen />);
    await druecke(query('input[name="titel"]'), "Enter");
    expect(fertig).toHaveBeenCalledTimes(1);
  });
  it("Kontakte: ein festes Feld je Art in der Reihenfolge der Karte — Tippen legt an, Leeren entfernt (Entscheidung 16)", async () => {
    await mount(<Rahmen />);
    const felder = () => queryAll<HTMLInputElement>("[data-kontakt] input");
    const namen = () => queryAll("[data-kontakt] .kp-feldname").map((l) => l.textContent);
    expect(namen()).toEqual(["Funkrufname", "Digitalfunk", "Telefon", "Mobil", "Fax", "E-Mail", "Sonstiges"]);
    expect(felder().map((i) => i.value)).toEqual(["RK UE 40-00", "", "", "", "", "ea1@drk.de", ""]);
    // DOM-Reihenfolge = Tab-Reihenfolge: ein Kontakt kostet Tippen plus Tab, keine Auswahl, kein Knopf
    await fill('[data-kontakt="telefon:0"] input', "0581 1");
    expect(stelle().kontakte).toContainEqual({ art: "telefon", wert: "0581 1" });
    await fill('[data-kontakt="email:0"] input', "");
    expect(stelle().kontakte.map((k) => k.art).sort()).toEqual(["funkrufname", "telefon"]);
    expect(felder()).toHaveLength(7); // das E-Mail-Feld bleibt stehen, jetzt leer
  });
  it("Kontakte: „Weiterer Kontakt“ legt eine zweite Zeile derselben Art an (Fokus hinein), sie hat „Entfernen“", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Weiterer Kontakt")); // Art vorbelegt: Telefon; noch keins da → nur Fokus ins leere Feld
    expect(document.activeElement).toBe(query('[data-kontakt="telefon:0"] input'));
    expect(stelle().kontakte.some((k) => k.art === "telefon")).toBe(false);
    await fill('[data-kontakt="telefon:0"] input', "0581 1");
    await clickElement(knopf("Weiterer Kontakt"));
    expect(document.activeElement).toBe(query('[data-kontakt="telefon:1"] input'));
    await fill('[data-kontakt="telefon:1"] input', "0581 2");
    expect(stelle().kontakte.filter((k) => k.art === "telefon").map((k) => k.wert)).toEqual(["0581 1", "0581 2"]);
    await clickElement(query('button[aria-label="Telefon 2 entfernen"]'));
    expect(stelle().kontakte.filter((k) => k.art === "telefon").map((k) => k.wert)).toEqual(["0581 1"]);
  });
  it("Löschen meldet sich beim Editor (Rückgängig statt Nachfrage)", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Stelle löschen"));
    expect(loesche).toHaveBeenCalledTimes(1);
  });
  it("eine neue Fokusanfrage setzt den Fokus ins Titelfeld", async () => {
    const titelRef = createRef<InputRef>();
    await mount(<Rahmen titelRef={titelRef} fokus={{ ziel: "titel", stelle: "a", n: 0 }} />);
    (document.activeElement as HTMLElement | null)?.blur();
    await rerender(<Rahmen titelRef={titelRef} fokus={{ ziel: "titel", stelle: "a", n: 1 }} />);
    expect(document.activeElement).toBe(query('input[name="titel"]'));
  });
});
