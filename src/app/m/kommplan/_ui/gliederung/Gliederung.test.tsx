// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useState } from "react";
import { clickElement, existsPortal, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { MELDUNG } from "../../_lib/plan/gliederung";
import { leererPlan, PlanFehler } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Aendere } from "../editor/aendere";
import { kannWiederholen, neuerVerlauf, rueckgaengig, tue, verwirf, wiederholen, type Verlauf } from "../editor/verlauf";
import { Gliederung } from "./Gliederung";

const START = baue({
  verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "kat", titel: "KatSL", eltern: "el", lage: "links" },
    { id: "ea1", titel: "EA 1", eltern: "el", verbindung: "a" },
    { id: "ea2", titel: "EA 2", eltern: "el", verbindung: "a" },
  ],
});
let stand: Verlauf = neuerVerlauf(START);
const details = vi.fn();
const loeschen = vi.fn();

/** Prüfstand wie der Editor: ein Verlauf, `aendere` mit PlanFehler → Hinweis im Meldungsplatz. */
function Pruefstand({ start, index = [] }: { start: PlanInhalt; index?: readonly ZeichenIndexEintrag[] }) {
  const [v, setV] = useState(() => neuerVerlauf(start));
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  useEffect(() => { stand = v; });
  const aendere: Aendere = (op, schluessel) => {
    try { setV(tue(v, op(v.jetzt), new Date().getTime(), schluessel)); setHinweis(null); return null; }
    catch (e) { if (e instanceof PlanFehler) { setHinweis(e.message); return e.message; } throw e; }
  };
  return (
    <Gliederung inhalt={v.jetzt} auswahl={auswahl} aendere={aendere} meldung={hinweis ? <p>{hinweis}</p> : null}
      onAuswahl={setAuswahl} onDetails={details} onLoeschen={loeschen} onHinweis={setHinweis}
      onRueck={() => setV(rueckgaengig(v))} onWieder={() => setV(wiederholen(v))}
      verwirfUnberuehrt={(nach, dann) => {
        if (v.jetzt !== nach) return null;
        const w = verwirf(v);
        const x = dann ? tue(w, dann(w.jetzt), new Date().getTime()) : w;
        setV(x);
        return x.jetzt;
      }}
      symbole={{}} zeichenIndex={index} ladeSymbole={() => {}} />
  );
}
const zeige = async (start: PlanInhalt = START) => { await mount(<Pruefstand start={start} />); await act(async () => {}); };
const feld = (id: string) => query<HTMLInputElement>(`[data-zeile="${id}"] input[name="titel"]`);
const titel = () => queryAll<HTMLInputElement>('[data-zeile] input[name="titel"]').map((i) => i.value);
const ebenen = () => queryAll("[data-zeile]").map((z) => z.style.getPropertyValue("--ebene"));
const aktiv = () => (document.activeElement as HTMLInputElement | null);
async function taste(el: Element, key: string, mehr: KeyboardEventInit = {}) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mehr })); });
}
async function fokus(id: string) { await act(async () => { feld(id).focus(); }); }
async function schreibe(el: HTMLInputElement, wert: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(el, wert); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const meldung = () => query("[data-meldung]").textContent;
/** Klick mit Zeiger: erst `pointerdown` (daran erkennt die Gliederung die Herkunft, Entscheidung 16), dann `click`. */
async function zeigerKlick(el: HTMLElement) {
  const E = typeof PointerEvent === "function" ? PointerEvent : MouseEvent; // React hört auf den Typnamen
  await act(async () => { el.dispatchEvent(new E("pointerdown", { bubbles: true })); });
  await clickElement(el);
}

afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("Gliederung (Spec §6.5)", () => {
  it("Zeilen in Anzeigereihenfolge, eingerückt; Seitenstellen erkennbar; Fokus wählt die Zeile", async () => {
    await zeige();
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(ebenen()).toEqual(["0", "1", "1", "1"]);
    expect(query('[data-zeile="kat"] [data-seite="links"]').textContent).toBe("Seitenstelle links");
    expect(feld("kat").getAttribute("aria-label")).toBe("Titel, Ebene 2, Seitenstelle links von EL");
    await fokus("ea1");
    expect(query('[data-zeile="ea1"]').getAttribute("aria-current")).toBe("true");
  });
  it("Tippen ändert den Titel — ein Rückgängig-Schritt je Feld und Bündel", async () => {
    await zeige();
    await fokus("ea1");
    await schreibe(feld("ea1"), "EA 1 Nord");
    await schreibe(feld("ea1"), "EA 1 Nordost");
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.titel).toBe("EA 1 Nordost");
    expect(stand.vergangen).toHaveLength(1);
  });
  it("Enter: neue Stelle direkt darunter, gleiche Verbindung, Fokus im neuen Titel", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "Enter");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "", "EA 2"]);
    const neu = aktiv()!.closest("[data-zeile]")!.getAttribute("data-zeile")!;
    expect(stand.jetzt.stellen.find((s) => s.id === neu)).toMatchObject({ eltern: "el", verbindungId: "a" });
  });
  it("Enter auf der eben angelegten, leeren Zeile rückt aus — EIN Schritt, keine leere Karte bleibt zurück (Entscheidung 5)", async () => {
    await zeige();
    await fokus("ea2");
    const schritte = stand.vergangen.length;
    await taste(feld("ea2"), "Enter");
    await taste(aktiv()!, "Enter");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2", ""]);
    expect(ebenen()).toEqual(["0", "1", "1", "1", "0"]); // hinter EL, oberste Ebene
    expect(stand.vergangen.length).toBe(schritte + 1);
    expect(kannWiederholen(stand)).toBe(false);
    await taste(aktiv()!, "Enter"); // leere Wurzel: Hinweis, nichts geschieht
    expect(meldung()).toBe(MELDUNG.erstTitel);
    expect(titel()).toHaveLength(5);
  });
  it("gehaltene Enter- und Rücktaste (repeat) legen nichts an und löschen nichts (Entscheidung 8)", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Enter", { repeat: true });
    expect(titel()).toHaveLength(4);
    await schreibe(feld("ea2"), "");
    await taste(feld("ea2"), "Backspace"); // der erste Druck löscht die leere Zeile …
    expect(titel()).toEqual(["EL", "KatSL", "EA 1"]);
    await schreibe(feld("ea1"), "");
    await taste(feld("ea1"), "Backspace", { repeat: true }); // … der gehaltene Rest frisst die Zeile darüber nicht
    expect(titel()).toEqual(["EL", "KatSL", ""]);
  });
  it("Tab rückt ein, Umschalt+Tab aus; der Fokus bleibt im selben Titel", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Tab");
    expect(ebenen()).toEqual(["0", "1", "1", "2"]);
    expect(aktiv()).toBe(feld("ea2"));
    await taste(feld("ea2"), "Tab", { shiftKey: true });
    expect(ebenen()).toEqual(["0", "1", "1", "1"]);
    expect(aktiv()).toBe(feld("ea2"));
  });
  it("Tab auf der ersten Unterstelle: Hinweis, nichts ändert sich, der Fokus bleibt (Review Focus 3)", async () => {
    await zeige();
    await fokus("ea1");
    const vorher = stand.jetzt;
    await taste(feld("ea1"), "Tab");
    expect(stand.jetzt).toBe(vorher);
    expect(meldung()).toBe(MELDUNG.ersteEinruecken);
    expect(aktiv()).toBe(feld("ea1"));
    await fokus("el");
    await taste(feld("el"), "Tab", { shiftKey: true });
    expect(meldung()).toBe(MELDUNG.wurzelAusruecken);
    expect(aktiv()).toBe(feld("el"));
  });
  it("Alt+↑/↓ verschiebt, der Fokus wandert mit", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "ArrowUp", { altKey: true });
    expect(titel()).toEqual(["EL", "KatSL", "EA 2", "EA 1"]);
    expect(aktiv()).toBe(feld("ea2"));
  });
  it("↑/↓ wandern; eine per Enter angelegte, unberührte Zeile verschwindet beim Verlassen ohne Wiederholen-Schritt", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "ArrowDown");
    expect(aktiv()).toBe(feld("ea2"));
    await taste(feld("ea2"), "Enter");
    expect(titel()).toHaveLength(5);
    await taste(aktiv()!, "ArrowUp");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(aktiv()).toBe(feld("ea2"));
    expect(kannWiederholen(stand)).toBe(false);
  });
  it("Rücktaste auf leerem Titel löscht die Zeile, der Fokus geht nach oben; mit Unterstellen: Hinweis", async () => {
    await zeige();
    await fokus("ea1");
    await schreibe(feld("ea1"), "");
    await taste(feld("ea1"), "Backspace");
    expect(titel()).toEqual(["EL", "KatSL", "EA 2"]);
    expect(aktiv()).toBe(feld("kat"));
    await fokus("el");
    await schreibe(feld("el"), "");
    await taste(feld("el"), "Backspace");
    expect(meldung()).toBe(MELDUNG.nichtLeer);
  });
  it("Strg/Cmd+Z im Titel ist das Rückgängig des Dokuments (Entscheidung 10)", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Tab");
    await taste(feld("ea2"), "z", { ctrlKey: true });
    expect(ebenen()).toEqual(["0", "1", "1", "1"]);
    await taste(feld("ea2"), "z", { ctrlKey: true, shiftKey: true });
    expect(ebenen()).toEqual(["0", "1", "1", "2"]);
  });
  it("die unberührte neue Zeile verschwindet auch, wenn der Fokus sie per Klick verlässt — ohne Wiederholen-Schritt", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Enter");
    expect(titel()).toHaveLength(5);
    await fokus("ea1"); // blur mit relatedTarget = anderes Titelfeld
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(kannWiederholen(stand)).toBe(false);
    expect(aktiv()).toBe(feld("ea1"));
  });
  it("Strg+Z, das die Zeile mit dem Fokus entfernt: der Fokus geht auf den Nachbarn, nie auf body (Entscheidung 10)", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "Enter");
    await schreibe(aktiv()!, "Neu"); // berührt
    await taste(aktiv()!, "z", { ctrlKey: true }); // Titel zurück
    await taste(aktiv()!, "z", { ctrlKey: true }); // Zeile zurück
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(aktiv()).toBe(feld("ea1"));
  });
  it("Enter während einer IME-Komposition legt nichts an", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "Enter", { isComposing: true } as KeyboardEventInit);
    expect(titel()).toHaveLength(4);
  });
  it("Roving Tabindex: nur die aktive Zeile ist in der Tab-Folge; Esc verlässt das Titelfeld auf „Aktionen“", async () => {
    await zeige();
    expect(queryAll('input[name="titel"]').map((i) => i.tabIndex)).toEqual([0, -1, -1, -1]);
    await fokus("ea1");
    expect(queryAll('input[name="titel"]').map((i) => i.tabIndex)).toEqual([-1, -1, 0, -1]);
    await taste(feld("ea1"), "Escape");
    expect(aktiv()!.getAttribute("aria-label")).toBe("Aktionen für EA 1");
  });
  it("Aktionen-Menü: Einrücken per Tipp (Touch-Weg), Fokus zurück auf „⋯“ statt in den Titel; unerreichbare Einträge deaktiviert; F2 und Strg+Enter öffnen Details", async () => {
    await zeige();
    await fokus("ea2");
    await zeigerKlick(query<HTMLElement>('[data-zeile="ea2"] [aria-label="Aktionen für EA 2"]'));
    await zeigerKlick(queryPortal('[data-zeile-portal="ea2"] [data-menu-id$="einruecken"]'));
    expect(ebenen()).toEqual(["0", "1", "1", "2"]);
    expect(aktiv()!.getAttribute("aria-label")).toBe("Aktionen für EA 2"); // Zeiger: keine Bildschirmtastatur (Entscheidung 16)
    await clickElement(query<HTMLElement>('[data-zeile="ea1"] [aria-label="Aktionen für EA 1"]'));
    expect(existsPortal('[data-zeile-portal="ea1"] [data-menu-id$="einruecken"][aria-disabled="true"]')).toBe(true);
    await taste(feld("ea1"), "F2");
    expect(details).toHaveBeenCalledWith("ea1");
    await taste(feld("ea2"), "Enter", { ctrlKey: true });
    expect(details).toHaveBeenCalledWith("ea2");
  });
  it("Aktionen-Menü legt an — ohne Tastatur: neue Stelle darunter und Seitenstelle, Fokus im neuen Titel (Entscheidung 11)", async () => {
    await zeige();
    await zeigerKlick(query<HTMLElement>('[data-zeile="ea1"] [aria-label="Aktionen für EA 1"]'));
    await zeigerKlick(queryPortal('[data-zeile-portal="ea1"] [data-menu-id$="rechts"]'));
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "", "EA 2"]);
    expect(queryAll("[data-zeile] [data-seite]").map((c) => c.textContent)).toEqual(["Seitenstelle links", "Seitenstelle rechts"]);
    expect(aktiv()!.getAttribute("name")).toBe("titel"); // anlegen: hier wird als Nächstes getippt
    await zeigerKlick(query<HTMLElement>('[data-zeile="el"] [aria-label="Aktionen für EL"]'));
    expect(existsPortal('[data-zeile-portal="el"] [data-menu-id$="unterstelle"]:not([aria-disabled="true"])')).toBe(true);
    await zeigerKlick(query<HTMLElement>('[data-zeile="kat"] [aria-label="Aktionen für KatSL"]'));
    expect(existsPortal('[data-zeile-portal="kat"] [data-menu-id$="links"][aria-disabled="true"]')).toBe(true);
  });
  it("leerer Plan: „Erste Stelle anlegen“ legt eine Zeile an und setzt den Fokus hinein", async () => {
    await zeige(leererPlan());
    await clickElement([...document.querySelectorAll<HTMLButtonElement>(".kp-gliederung button")].find((b) => b.textContent === "Erste Stelle anlegen")!);
    expect(titel()).toEqual([""]);
    expect(aktiv()).toBe(queryAll<HTMLInputElement>('input[name="titel"]')[0]);
  });
});
