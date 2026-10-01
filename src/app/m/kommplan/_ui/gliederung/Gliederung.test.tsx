// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useState } from "react";
import { clickElement, existsPortal, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { MELDUNG, zuVieleStellen } from "../../_lib/plan/gliederung";
import { leererPlan, PlanFehler } from "../../_lib/plan/operationen";
import { GRENZE, LAENGE, type PlanInhalt } from "../../_lib/plan/schema";
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
const PruefstandMitIndex = ({ index }: { index: readonly ZeichenIndexEintrag[] }) => <Pruefstand start={START} index={index} />;
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
    // Zeichen und Titel stehen bündig mit den Geschwistern: der Chip folgt dem Titel (Sichtprüfung Phase 3)
    const teile = [...query('[data-zeile="kat"] .kp-g-haupt').children].map((e) => (e.matches(".kp-g-lage") ? "lage" : e.matches(".kp-g-titel") ? "titel" : e.matches(".kp-g-zeichen") ? "zeichen" : "anderes"));
    expect(teile.slice(0, 3)).toEqual(["zeichen", "titel", "lage"]);
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

async function fuegeEin(el: HTMLInputElement, text: string): Promise<boolean> {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", { value: { getData: (t: string) => (t === "text/plain" ? text : "") } });
  await act(async () => { el.dispatchEvent(e); });
  return e.defaultPrevented;
}

describe("Gliederung, Teil 2", () => {
  it("mehrzeilig einfügen: Teilbaum nach der Cursorzeile, EIN Rückgängig-Schritt, Fokus am Ende der letzten Zeile", async () => {
    await zeige();
    await fokus("ea1");
    const schritte = stand.vergangen.length;
    expect(await fuegeEin(feld("ea1"), "EA Nord\n\t- RTW 1\n\t- RTW 2\nEA Süd")).toBe(true);
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA Nord", "RTW 1", "RTW 2", "EA Süd", "EA 2"]);
    expect(ebenen()).toEqual(["0", "1", "1", "1", "2", "2", "1", "1"]);
    expect(stand.vergangen.length).toBe(schritte + 1);
    expect(aktiv()!.value).toBe("EA Süd");
    await taste(aktiv()!, "z", { ctrlKey: true });
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(aktiv()).toBe(feld("ea1")); // die eingefügten Zeilen sind weg — der Fokus steht in der Ausgangszeile, nicht auf body
  });
  it("in eine leere, eben angelegte Zeile: die erste eingefügte Zeile nimmt ihren Platz ein", async () => {
    await zeige();
    await fokus("ea2");
    await taste(feld("ea2"), "Enter");
    await fuegeEin(aktiv()!, "EA 3\n\tRTW");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2", "EA 3", "RTW"]);
  });
  it("eine Zeile: das Feld fügt normal ein (kein Abfangen)", async () => {
    await zeige();
    await fokus("ea1");
    expect(await fuegeEin(feld("ea1"), "nur eine Zeile\n")).toBe(false);
  });
  it("fehlerhafte Liste, Seitenstelle, zu viele Stellen: Hinweis, nichts eingefügt (Review Focus 4)", async () => {
    await zeige();
    await fokus("ea1");
    await fuegeEin(feld("ea1"), `A\n\t${"x".repeat(LAENGE.titel + 1)}`);
    expect(meldung()).toContain("Zeile 2: Der Titel ist länger als");
    expect(titel()).toHaveLength(4);
    await fokus("kat");
    await fuegeEin(feld("kat"), "A\nB");
    expect(meldung()).toBe(MELDUNG.inSeitenstelle);
    await fokus("ea1");
    await fuegeEin(feld("ea1"), Array.from({ length: GRENZE.stellen }, (_, i) => `S${i}`).join("\n"));
    expect(meldung()).toBe(zuVieleStellen(START.stellen.length + GRENZE.stellen));
    expect(titel()).toHaveLength(4);
  });
  it("Verbindung inline: vorhandene wählen; neu tippen legt mit sichtbarer Art an; Wurzel ohne Feld", async () => {
    await zeige();
    await fokus("ea1");
    expect(query('[data-zeile="el"]').textContent).toContain("oberste Ebene");
    // Muster aus StelleFlyin.test.tsx (`oeffneAuswahl`): antds Select öffnet auf `mousedown`, die Liste liegt im Portal.
    const eingabe = query<HTMLInputElement>('[data-zeile="ea1"] [aria-label="Verbindung von EA 1"]');
    await act(async () => { eingabe.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    await schreibe(eingabe, "R_UE_3");
    const liste = [...document.querySelectorAll<HTMLElement>(".ant-select-dropdown")].filter((d) => !d.className.includes("-hidden")).at(-1)!;
    const texte = [...liste.querySelectorAll<HTMLElement>(".ant-select-item-option")].map((o) => o.textContent);
    expect(texte[0]).toBe("Neu: „R_UE_3“ als Digitalfunk TMO");
    expect(texte).toHaveLength(8); // je Art eine Option — die Art steht sichtbar da
    await clickElement([...liste.querySelectorAll<HTMLElement>(".ant-select-item-option")][0]);
    const v = stand.jetzt.verbindungen.find((x) => x.bezeichnung === "R_UE_3")!;
    expect(v.art).toBe("tmo");
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.verbindungId).toBe(v.id);
  });
  it("Einheiten als Zähler: klappt dieselbe Einheitenliste wie im Flyin auf", async () => {
    await zeige(baue({ stellen: [{ id: "el", titel: "EL", einheiten: ["RTW 1", "KTW 2"] }] }));
    const knopf = [...document.querySelectorAll<HTMLButtonElement>('[data-zeile="el"] button')].find((b) => b.textContent === "2 Einheiten")!;
    expect(knopf.getAttribute("aria-expanded")).toBe("false");
    await clickElement(knopf);
    expect(knopf.getAttribute("aria-expanded")).toBe("true");
    expect(queryAll('[data-zeile="el"] [data-einheit-zeile]')).toHaveLength(2);
  });
  it("Zeichen kompakt per Zeiger: Knopf öffnet die Zeichenwahl, eine Wahl setzt das Zeichen, der Fokus bleibt am Zeichenknopf (Entscheidung 16)", async () => {
    const index = [{ schluessel: "k1", titel: "Einsatzleitung", suchtext: "einsatzleitung el" }];
    await mount(<PruefstandMitIndex index={index} />);
    await act(async () => {});
    await fokus("ea1");
    await zeigerKlick(query('[data-zeile="ea1"] [aria-label^="Zeichen von EA 1"]'));
    await schreibe(queryPortal<HTMLInputElement>('[data-zeile-portal="ea1"] input[aria-label="Zeichen suchen"]'), "Einsatz");
    await zeigerKlick(queryPortal('[data-zeile-portal="ea1"] [data-zeichen="k1"]'));
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.zeichen).toBe("k1");
    expect(aktiv()!.getAttribute("aria-label")).toMatch(/^Zeichen von EA 1/);
  });
  it("Alt+Z im Titel: Zeichenwahl offen, Fokus in der Suche; Enter wählt den ersten Treffer, der Fokus ist wieder im Titel (Entscheidung 10)", async () => {
    const index = [{ schluessel: "k1", titel: "Einsatzleitung", suchtext: "einsatzleitung el" }];
    await mount(<PruefstandMitIndex index={index} />);
    await act(async () => {});
    await fokus("ea1");
    await taste(feld("ea1"), "Ω", { altKey: true, code: "KeyZ" });
    expect(aktiv()!.getAttribute("aria-label")).toBe("Zeichen suchen");
    await schreibe(aktiv()!, "Einsatz");
    await taste(aktiv()!, "Enter");
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.zeichen).toBe("k1");
    expect(aktiv()).toBe(feld("ea1"));
  });
  it("Alt+V im Titel: Verbindung per Tastatur; nach der Wahl steht der Fokus im Titel, und Enter legt die nächste Stelle an (Entscheidung 10, A1)", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "√", { altKey: true, code: "KeyV" });
    const eingabe = query<HTMLInputElement>('[data-zeile="ea1"] input[aria-label="Verbindung von EA 1"]');
    expect(aktiv()).toBe(eingabe);
    await schreibe(eingabe, "R_UE_3");
    const erste = queryPortal<HTMLElement>('[data-zeile-portal="ea1"] .ant-select-item-option');
    await clickElement(erste); // „Neu: „R_UE_3“ als Digitalfunk TMO“
    expect(aktiv()).toBe(feld("ea1"));
    await taste(feld("ea1"), "Enter");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "", "EA 2"]);
  });
  it("nur die aktive Zeile trägt ein echtes Select; die übrigen zeigen ihre Verbindung als Knopf, der die Zeile wählt (Entscheidung 15)", async () => {
    await zeige();
    await fokus("ea1");
    expect(queryAll('.kp-gliederung input[aria-label^="Verbindung von"]')).toHaveLength(1);
    const knopf = query<HTMLButtonElement>('[data-zeile="ea2"] button[aria-label^="Verbindung von EA 2"]');
    expect(knopf.textContent).toBe("R_UE_2 · Digitalfunk TMO");
    await zeigerKlick(knopf);
    expect(query('[data-zeile="ea2"]').getAttribute("aria-current")).toBe("true");
    expect(aktiv()).toBe(query('[data-zeile="ea2"] input[aria-label="Verbindung von EA 2"]'));
  });
  it("versetzt eine neue Verbindung die Zeile, sagt der Meldungsplatz wohin (Entscheidung 12)", async () => {
    await zeige(baue({
      verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }, { id: "b", art: "tmo", bezeichnung: "R_UE_3" }],
      stellen: [{ id: "el", titel: "EL" }, { id: "ea1", titel: "EA 1", eltern: "el", verbindung: "a" }, { id: "ea2", titel: "EA 2", eltern: "el", verbindung: "a" },
        { id: "ea3", titel: "EA 3", eltern: "el", verbindung: "b" }, { id: "ea4", titel: "EA 4", eltern: "el", verbindung: "a" }],
    }));
    expect(titel()).toEqual(["EL", "EA 1", "EA 2", "EA 4", "EA 3"]); // Gruppen zusammen, in Folge ihres ersten Vorkommens
    await fokus("ea2");
    await taste(feld("ea2"), "√", { altKey: true, code: "KeyV" });
    await schreibe(query<HTMLInputElement>('[data-zeile="ea2"] input[aria-label="Verbindung von EA 2"]'), "R_UE_3");
    await clickElement([...document.querySelectorAll<HTMLElement>('[data-zeile-portal="ea2"] .ant-select-item-option')].find((o) => o.textContent?.startsWith("R_UE_3"))!);
    expect(titel()).toEqual(["EL", "EA 1", "EA 4", "EA 2", "EA 3"]);
    expect(meldung()).toBe("„EA 2“ steht jetzt in der Gruppe „R_UE_3“.");
    expect(aktiv()).toBe(feld("ea2"));
  });
});

/** Wie `taste`, meldet aber, ob die Gliederung die Standardaktion verhindert hat (jsdom führt Tab selbst nicht aus). */
async function tasteVerhindert(el: Element, key: string, mehr: KeyboardEventInit = {}): Promise<boolean> {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mehr });
  await act(async () => { el.dispatchEvent(e); });
  return e.defaultPrevented;
}

describe("Gliederung, Review Phase 3", () => {
  it("Entf auf leerem Titel löscht, der Fokus geht nach UNTEN; auf der letzten Zeile nach oben (Entscheidung 8)", async () => {
    await zeige();
    await fokus("ea1");
    await schreibe(feld("ea1"), "");
    await taste(feld("ea1"), "Delete");
    expect(titel()).toEqual(["EL", "KatSL", "EA 2"]);
    expect(aktiv()).toBe(feld("ea2"));
    await schreibe(feld("ea2"), "");
    await taste(feld("ea2"), "Delete");
    expect(titel()).toEqual(["EL", "KatSL"]);
    expect(aktiv()).toBe(feld("kat"));
  });
  it("Rücktaste auf leerem Titel löscht keine Stelle mit Einheiten oder anderen Angaben — Hinweis statt stillem Verlust", async () => {
    await zeige(baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "", eltern: "el", leiter: "Müller", einheiten: ["RTW RK 1"] }] }));
    await fokus("a");
    const vorher = stand.jetzt;
    await taste(feld("a"), "Backspace");
    expect(stand.jetzt).toBe(vorher);
    expect(titel()).toEqual(["EL", ""]);
    expect(meldung()).toBe(MELDUNG.mitAngaben);
    expect(aktiv()).toBe(feld("a"));
  });
  it("Menü „Verbindung … für Geschwister übernehmen“ setzt sie an allen Geschwistern ohne Verbindung — EIN Schritt", async () => {
    await zeige(baue({
      verbindungen: [{ id: "a", art: "tmo", bezeichnung: "R_UE_2" }],
      stellen: [{ id: "el", titel: "EL" }, { id: "ea1", titel: "EA 1", eltern: "el", verbindung: "a" }, { id: "ea2", titel: "EA 2", eltern: "el" }, { id: "ea3", titel: "EA 3", eltern: "el" }],
    }));
    const schritte = stand.vergangen.length;
    await zeigerKlick(query<HTMLElement>('[data-zeile="ea1"] [aria-label="Aktionen für EA 1"]'));
    await zeigerKlick(queryPortal('[data-zeile-portal="ea1"] [data-menu-id$="uebernehmen"]'));
    expect(stand.jetzt.stellen.filter((s) => s.eltern === "el").map((s) => s.verbindungId)).toEqual(["a", "a", "a"]);
    expect(stand.vergangen.length).toBe(schritte + 1);
  });
  it("Verbindung inline auf „keine (dünne Linie)“ setzen entfernt sie", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "√", { altKey: true, code: "KeyV" });
    const keine = [...document.querySelectorAll<HTMLElement>('[data-zeile-portal="ea1"] .ant-select-item-option')].find((o) => o.textContent?.startsWith("keine"))!;
    await clickElement(keine);
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.verbindungId).toBeNull();
    expect(queryAll("[data-meldung]")).toHaveLength(0); // kein PlanFehler (der Sentinel wäre keine gültige Verbindung)
  });
  it("eine eben angelegte Zeile bleibt, wenn der Fokus in ihre eigenen Bedienelemente wandert (Alt+V, Alt+Z, „⋯“)", async () => {
    const index = [{ schluessel: "k1", titel: "Einsatzleitung", suchtext: "einsatzleitung el" }];
    await mount(<PruefstandMitIndex index={index} />);
    await act(async () => {});
    await fokus("ea2");
    await taste(feld("ea2"), "Enter");
    const neu = () => aktiv()!.closest("[data-zeile]")!.getAttribute("data-zeile")!;
    const id = neu();
    await taste(feld(id), "√", { altKey: true, code: "KeyV" }); // Fokus ins Select derselben Zeile
    expect(titel()).toHaveLength(5);
    await fokus(id);
    await taste(feld(id), "Ω", { altKey: true, code: "KeyZ" }); // Fokus in die Zeichensuche (Portal der Zeile)
    expect(aktiv()!.getAttribute("aria-label")).toBe("Zeichen suchen");
    expect(titel()).toHaveLength(5);
    await taste(aktiv()!, "Escape");
    await fokus(id);
    await act(async () => { query<HTMLButtonElement>(`[data-zeile="${id}"] [aria-label="Aktionen für (ohne Titel)"]`).focus(); });
    expect(titel()).toHaveLength(5);
  });
  it("Esc auf einer eben angelegten, unberührten Zeile räumt sie weg; der Fokus geht auf den Nachbarn darüber", async () => {
    await zeige();
    await fokus("ea1");
    await taste(feld("ea1"), "Enter");
    expect(titel()).toHaveLength(5);
    await taste(aktiv()!, "Escape");
    expect(titel()).toEqual(["EL", "KatSL", "EA 1", "EA 2"]);
    expect(aktiv()).toBe(feld("ea1"));
    expect(kannWiederholen(stand)).toBe(false);
  });
  it("Esc in der Zeichensuche (nach Alt+Z) gibt den Fokus an den Titel zurück, nicht an body (Entscheidung 16)", async () => {
    const index = [{ schluessel: "k1", titel: "Einsatzleitung", suchtext: "einsatzleitung el" }];
    await mount(<PruefstandMitIndex index={index} />);
    await act(async () => {});
    await fokus("ea1");
    await taste(feld("ea1"), "Ω", { altKey: true, code: "KeyZ" });
    expect(aktiv()!.getAttribute("aria-label")).toBe("Zeichen suchen");
    await taste(aktiv()!, "Escape");
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(aktiv()).toBe(feld("ea1"));
    expect(stand.jetzt.stellen.find((s) => s.id === "ea1")!.zeichen).toBeNull();
  });
  it("Tab ohne Wirkung und Umschalt+Tab ohne Wirkung verhindern die Standardaktion — der Fokus verlässt das Feld nie (Review Focus 3)", async () => {
    await zeige();
    await fokus("ea1");
    expect(await tasteVerhindert(feld("ea1"), "Tab")).toBe(true);
    await fokus("el");
    expect(await tasteVerhindert(feld("el"), "Tab", { shiftKey: true })).toBe(true);
  });
  it("Alt+↑/↓ am Ende der Reihe: Hinweis statt Stille, das Dokument bleibt", async () => {
    await zeige();
    await fokus("ea1");
    const vorher = stand.jetzt;
    await taste(feld("ea1"), "ArrowUp", { altKey: true });
    expect(stand.jetzt).toBe(vorher);
    expect(meldung()).toBe(MELDUNG.reiheAnfang);
    await fokus("ea2");
    await taste(feld("ea2"), "ArrowDown", { altKey: true });
    expect(meldung()).toBe(MELDUNG.reiheEnde);
    expect(aktiv()).toBe(feld("ea2"));
  });
});

describe("Gliederung, Aktionen-Menü am Bildrand (Review Phase 3)", () => {
  it("das Menü bekommt beim Öffnen eine Höchsthöhe aus dem freien Platz und scrollt statt über den Rand zu ragen", async () => {
    await zeige();
    await zeigerKlick(query<HTMLElement>('[data-zeile="ea1"] [aria-label="Aktionen für EA 1"]'));
    const menue = queryPortal<HTMLElement>('[data-zeile-portal="ea1"] [role="menu"]');
    expect(menue.style.overflowY).toBe("auto");
    expect(menue.style.maxHeight).toBe(`${window.innerHeight - 16}px`); // jsdom: Rechteck 0 — Platz darunter = Fensterhöhe
  });
});
