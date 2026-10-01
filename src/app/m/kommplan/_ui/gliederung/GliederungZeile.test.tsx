// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useEffect, useState } from "react";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { aendereStelle } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { Aendere } from "../editor/aendere";
import { neuerVerlauf, tue } from "../editor/verlauf";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { Gliederung } from "./Gliederung";

/**
 * Der handgeschriebene Vergleich `gleicheZeile` (Entscheidung 2) entscheidet, ob eine Zeile neu rendert.
 * Seit U6 bleibt eine unveränderte Stelle dasselbe Objekt — jede Bedingung NEBEN dem Stellen-Objekt
 * muss deshalb einzeln tragen. Hier je eine Probe, bei der sich nur diese Bedingung ändert. `seite`
 * (folgt aus `stelle.lage`) und `planZeichen` (wird nur bei offenem Popover gelesen, und Öffnen rendert
 * ohnehin neu) sind gleichwertige Mutanten und haben keine eigene Probe.
 */
const START = baue({
  verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "ea1", titel: "EA 1", eltern: "el", verbindung: "a" },
    { id: "ea2", titel: "EA 2", eltern: "el", verbindung: "a", zeichen: "k1" },
    { id: "x", titel: "Trupp", eltern: "ea2" },
  ],
});
const steuer: { aendere: Aendere; auswahl(id: string | null): void; symbole(s: Symbolsatz): void } = { aendere: () => null, auswahl: () => {}, symbole: () => {} };

function Pruefstand({ start }: { start: PlanInhalt }) {
  const [v, setV] = useState(() => neuerVerlauf(start));
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [symbole, setSymbole] = useState<Symbolsatz>({});
  const aendere: Aendere = (op, schluessel) => { setV((alt) => tue(alt, op(alt.jetzt), new Date().getTime(), schluessel)); return null; };
  // Setter von useState und die funktionale Fortschreibung sind stabil — einmal nach außen reichen genügt.
  useEffect(() => { Object.assign(steuer, { aendere, auswahl: setAuswahl, symbole: setSymbole }); }, []);
  return (
    <Gliederung inhalt={v.jetzt} auswahl={auswahl} aendere={aendere} meldung={null} onAuswahl={setAuswahl} onDetails={() => {}} onLoeschen={() => {}}
      onRueck={() => {}} onWieder={() => {}} onHinweis={() => {}} verwirfUnberuehrt={() => null} symbole={symbole} zeichenIndex={[]} ladeSymbole={() => {}} />
  );
}
const zeige = async () => { await mount(<Pruefstand start={START} />); await act(async () => {}); };
const zeile = (id: string) => query<HTMLLIElement>(`[data-zeile="${id}"]`);
const feld = (id: string) => query<HTMLInputElement>(`[data-zeile="${id}"] input[name="titel"]`);
const aussen = (f: () => void) => act(async () => { f(); });

afterEach(async () => { await unmount(); });

describe("Gliederungszeile rendert neu, wenn sich nur ihre Lage oder ihr Umfeld ändert (gleicheZeile)", () => {
  it("Ebene: Tab auf eine Zeile mit Unterstellen rückt auch die Kindzeile sichtbar ein (Einzug und aria-label)", async () => {
    await zeige();
    await act(async () => { feld("ea2").focus(); });
    await act(async () => { feld("ea2").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    expect(zeile("ea2").style.getPropertyValue("--ebene")).toBe("2");
    expect(zeile("x").style.getPropertyValue("--ebene")).toBe("3");
    expect(feld("x").getAttribute("aria-label")).toBe("Titel, Ebene 4, unter EA 2");
  });
  it("Elterntitel: die Elternstelle umbenennen ändert das aria-label der Kindzeile", async () => {
    await zeige();
    await aussen(() => steuer.aendere((q) => aendereStelle(q, "ea2", { titel: "EA 2 Bühne" })));
    expect(feld("x").getAttribute("aria-label")).toBe("Titel, Ebene 3, unter EA 2 Bühne");
  });
  it("Verbindungen: eine umbenannte Verbindung erscheint auch an einer nicht aktiven Zeile", async () => {
    await zeige();
    await aussen(() => steuer.aendere((q) => ({ ...q, verbindungen: q.verbindungen.map((v) => ({ ...v, bezeichnung: "R_UE_9" })) })));
    expect(query('[data-zeile="ea2"] button[aria-label^="Verbindung von EA 2"]').textContent).toBe("R_UE_9 · Digitalfunk TMO");
  });
  it("Auswahl: wird die erste (und damit weiter aktive) Zeile abgewählt, verliert sie die Markierung", async () => {
    await zeige();
    await aussen(() => steuer.auswahl("el"));
    expect(zeile("el").getAttribute("aria-current")).toBe("true");
    await aussen(() => steuer.auswahl(null));
    expect(zeile("el").getAttribute("aria-current")).toBeNull();
  });
  it("Symbolvorrat: ein nachgeladenes Zeichen erscheint an der Zeile statt des leeren Platzes", async () => {
    await zeige();
    expect(zeile("ea2").querySelector(".kp-g-zeichen svg")).toBeNull();
    await aussen(() => steuer.symbole({ k1: { viewBox: "0 0 10 10", inhalt: "" } }));
    expect(zeile("ea2").querySelector(".kp-g-zeichen svg")).not.toBeNull();
  });
});
