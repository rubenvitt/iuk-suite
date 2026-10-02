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
import { BibliothekKontext } from "./bibliothekKontext";
import type { Bibliothek } from "../../_lib/bibliothek/typen";

const bibAktion = vi.hoisted(() => ({ stelle: vi.fn(), einheiten: vi.fn() }));
vi.mock("../../_actions/bibliothek", () => ({ speichereBibStelleAction: bibAktion.stelle, importiereBibEinheitenAction: bibAktion.einheiten, importiereBibVerbindungenAction: vi.fn() }));
const BIB: Bibliothek = {
  stellen: [
    { id: "b1", titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }], notiz: null },
    { id: "b2", titel: "EA 1", zeichen: null, leiter: null, kontakte: [], notiz: "intern" },
  ],
  einheiten: [
    { id: "be0", typ: "RTW", rufname: "RK 1", zeichen: null, notiz: null },
    { id: "be1", typ: "KTW", rufname: "RK 2", zeichen: null, notiz: null }, { id: "be2", typ: "NEF", rufname: "RK 3", zeichen: null, notiz: null },
  ],
  verbindungen: [{ id: "bv1", art: "dmo", bezeichnung: "DMO 608", notiz: null }],
};
const merke = vi.fn();
const schritte: (string | undefined)[] = [];
const warte = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const INDEX = [
  { schluessel: "rezept:C.1.1", titel: "Löschstaffel", suchtext: "löschstaffel c.1.1" },
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", suchtext: "eal" },
];
const START = baue({
  verbindungen: [{ id: "v1", art: "tmo", bezeichnung: "R_UE_2" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v1", kontakte: { email: "ea1@drk.de", funkrufname: "RK UE 40-00" }, einheiten: ["RTW RK 1"] },
    { id: "b", titel: "EA 2", eltern: "el" },
    { id: "b1", titel: "Trupp", eltern: "b" },
  ],
});

let stand: PlanInhalt = START;
const lade = vi.fn();
const loesche = vi.fn();
const fertig = vi.fn();
// Modulweit, nicht als Vorgabe im Parameter: ein neues Objekt je Rendern löste die Fokus-Effekte bei jeder Eingabe aus.
const FOKUS0 = { ziel: "titel" as const, stelle: "a", n: 0 };
const REF0 = createRef<InputRef>();
function Rahmen({ start = START, stelleId = "a", fokus = FOKUS0, titelRef = REF0 }: {
  start?: PlanInhalt; stelleId?: string; fokus?: { ziel: "titel" | "einheit"; stelle: string | null; n: number }; titelRef?: RefObject<InputRef | null>;
}) {
  const [inhalt, setInhalt] = useState(start);
  const aendere: Aendere = (op, schluessel) => {
    schritte.push(schluessel);
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return (
    <BibliothekKontext.Provider value={{ aktiv: true, pflegen: true, bib: BIB, merke }}>
      <StelleFormular inhalt={inhalt} stelleId={stelleId} aendere={aendere} symbole={{}} zeichenIndex={INDEX} ladeSymbole={lade}
        fokus={fokus} titelRef={titelRef} onLoeschen={loesche} onFertig={fertig} />
    </BibliothekKontext.Provider>
  );
}
const stelle = () => stand.stellen.find((s) => s.id === "a")!;
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
async function druecke(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
}

const feldZu = (name: string) => document.getElementById([...document.querySelectorAll("label")].find((l) => l.textContent === name)!.htmlFor)!;
/** antds Select öffnet auf `mousedown`; gewählt wird in der zuletzt geöffneten, sichtbaren Liste (Portal). */
async function oeffneAuswahl(eingabe: HTMLElement): Promise<HTMLElement> {
  await act(async () => { eingabe.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
  const liste = [...document.querySelectorAll<HTMLElement>(".ant-select-dropdown")].filter((d) => !d.className.includes("-hidden")).at(-1);
  if (!liste) throw new Error("keine offene Auswahlliste");
  return liste;
}
const optionen = (liste: HTMLElement) => [...liste.querySelectorAll<HTMLElement>(".ant-select-item-option")].map((o) => o.textContent);
async function waehleOption(eingabe: HTMLElement, text: string) {
  const option = [...(await oeffneAuswahl(eingabe)).querySelectorAll<HTMLElement>(".ant-select-item-option")].find((o) => o.textContent === text);
  if (!option) throw new Error(`Option fehlt: ${text}`);
  await clickElement(option);
}

afterEach(async () => {
  await unmount(); stand = START; lade.mockReset(); loesche.mockReset(); fertig.mockReset(); window.localStorage.clear();
  schritte.length = 0; merke.mockReset(); bibAktion.stelle.mockReset(); bibAktion.einheiten.mockReset();
});

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

describe("Flyin einer Stelle, Teil 2", () => {
  const radio = (text: string) => queryAll<HTMLInputElement>('input[type="radio"]').find((r) => r.closest("label")?.textContent === text)!;
  it("Lage: seitlich geht nur ohne Unter- und Seitenstellen, oberste Ebene steht immer darunter (Review Focus 3)", async () => {
    await mount(<Rahmen stelleId="b" />);
    expect(radio("links daneben").disabled).toBe(true);
    expect(document.body.textContent).toContain("Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen.");
    await unmount();
    await mount(<Rahmen stelleId="a" />);
    await clickElement(radio("rechts daneben"));
    expect(stelle()).toMatchObject({ eltern: "el", lage: "rechts" });
    await unmount();
    await mount(<Rahmen stelleId="el" />);
    expect(radio("links daneben").disabled).toBe(true);
    expect(document.body.textContent).toContain("Eine Stelle der obersten Ebene steht immer darunter.");
  });
  it("Untersteht: Umhängen über die Auswahl; die Stelle selbst und ihre Nachkommen stehen nicht zur Wahl (Review Focus 3)", async () => {
    await mount(<Rahmen stelleId="b" />);
    expect(optionen(await oeffneAuswahl(feldZu("Elternstelle")))).toEqual(["— oberste Ebene —", "EL", "EA 1"]);
    await unmount();
    await mount(<Rahmen stelleId="a" />);
    await waehleOption(feldZu("Elternstelle"), "EA 2");
    expect(stelle()).toMatchObject({ eltern: "b", lage: "unter" });
    await waehleOption(feldZu("Elternstelle"), "— oberste Ebene —");
    expect(stelle()).toMatchObject({ eltern: null, lage: "unter" });
  });
  it("Zur Elternstelle: vorhandene Verbindung wählen oder keine; Kanäle als Mehrfachauswahl (Entscheidung 10)", async () => {
    await mount(<Rahmen />);
    await waehleOption(feldZu("Zur Elternstelle"), "keine (dünne Linie)");
    expect(stelle().verbindungId).toBeNull();
    await waehleOption(feldZu("Zur Elternstelle"), "R_UE_2 · Digitalfunk TMO");
    expect(stelle().verbindungId).toBe("v1");
    await waehleOption(feldZu("Kanäle an dieser Stelle (ohne Gegenstelle)"), "R_UE_2 · Digitalfunk TMO");
    expect(stelle().kanaele).toEqual(["v1"]);
  });
  it("neue Verbindung eintippen: Bezeichnung + Art legt sie an und verbindet; eine gleichnamige wird wiederverwendet", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Neue Verbindung"));
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "R_UE_3");
    await clickElement(knopf("Anlegen und verbinden"));
    const neu = stand.verbindungen.find((v) => v.bezeichnung === "R_UE_3")!;
    expect(neu.art).toBe("tmo");
    expect(stelle().verbindungId).toBe(neu.id);
    await clickElement(knopf("Neue Verbindung"));
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', " r_ue_2 ");
    await clickElement(knopf("Anlegen und verbinden"));
    expect(stand.verbindungen).toHaveLength(2);
    expect(stelle().verbindungId).toBe("v1");
  });
  it("neue Verbindung per Tastatur: Fokus im Feld, Enter legt an; die Art ist die zuletzt angelegte", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Neue Verbindung"));
    const feld = query<HTMLInputElement>('input[aria-label="Bezeichnung der neuen Verbindung"]');
    expect(document.activeElement).toBe(feld);
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "R_UE_4");
    await druecke(feld, "Enter");
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "R_UE_4", art: "tmo" }); // wie v1, die letzte
    expect(stelle().verbindungId).toBe(stand.verbindungen.at(-1)!.id);
  });
  it("Wechsel der Stelle bei offenem Flyin: offene Liste, Entwurf und Fehler der vorigen Stelle sind weg (Review Focus 7)", async () => {
    await mount(<Rahmen stelleId="a" />);
    await clickElement(knopf("Liste einfügen"));
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', `KTW ${"R".repeat(81)}`);
    await clickElement(knopf("Übernehmen"));
    expect(document.body.textContent).toContain("Zeile 1: Der Rufname ist länger als 80 Zeichen.");
    await clickElement(knopf("Neue Verbindung"));
    await rerender(<Rahmen stelleId="b" />);
    expect(queryAll("textarea")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Zeile 1: Der Rufname");
    expect(queryAll('input[aria-label="Bezeichnung der neuen Verbindung"]')).toHaveLength(0);
  });
  it("eine „+ Einheit“-Anfrage für a zieht nach dem Wechsel zu b den Fokus nicht in b's Typ-Feld", async () => {
    const mitEinheit = baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "A", eltern: "el", einheiten: ["RTW 1"] }, { id: "b", titel: "B", eltern: "el", einheiten: ["KTW 2"] }] });
    const anfrage = { ziel: "einheit" as const, stelle: "a", n: 1 };
    await mount(<Rahmen start={mitEinheit} stelleId="a" fokus={anfrage} />);
    expect(document.activeElement).toBe(query('input[aria-label="Einheit 1: Typ"]'));
    (document.activeElement as HTMLElement).blur();
    await rerender(<Rahmen start={mitEinheit} stelleId="b" fokus={anfrage} />);
    expect(document.activeElement).not.toBe(query('input[aria-label="Einheit 1: Typ"]'));
  });
  it("Einheiten: einzeln anlegen (Fokus im Typ), ändern, entfernen", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("+ Einheit"));
    expect(stelle().einheiten).toHaveLength(2);
    const typ = queryAll<HTMLInputElement>('input[aria-label$=": Typ"]').at(-1)!;
    expect(document.activeElement).toBe(typ);
    await fill(`input[aria-label="${typ.getAttribute("aria-label")}"]`, "KTW");
    expect(stelle().einheiten[1].typ).toBe("KTW");
    await clickElement(queryAll('button[aria-label$="entfernen"]').filter((b) => b.getAttribute("aria-label")!.startsWith("Einheit")).at(0)!);
    expect(stelle().einheiten.map((e) => e.typ)).toEqual(["KTW"]);
  });
  it("Liste einfügen: je Zeile erstes Wort Typ, Rest Rufname", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Liste einfügen"));
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', "KTW RK UE 40-92-1\n\nMTW RK UE 40-17-1");
    await clickElement(knopf("Übernehmen"));
    expect(stelle().einheiten.map((e) => [e.typ, e.rufname])).toEqual([["RTW", "RK 1"], ["KTW", "RK UE 40-92-1"], ["MTW", "RK UE 40-17-1"]]);
    expect(queryAll("textarea")).toHaveLength(0);
  });
  it("Liste einfügen per Tastatur: Fokus in der Textarea, Strg/Cmd+Enter übernimmt, danach Fokus auf „Liste einfügen“", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Liste einfügen"));
    const ta = query<HTMLTextAreaElement>('textarea[aria-label="Einheiten, je Zeile eine"]');
    expect(document.activeElement).toBe(ta);
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', "KTW RK 2");
    await act(async () => { ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(stelle().einheiten.map((e) => e.typ)).toEqual(["RTW", "KTW"]);
    expect(document.activeElement).toBe(knopf("Liste einfügen"));
  });
  it("Liste einfügen mit Fehlern oder über 60: nichts übernommen, Hinweis bleibt am Feld (Review Focus 2)", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Liste einfügen"));
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', `KTW ${"R".repeat(81)}`);
    await clickElement(knopf("Übernehmen"));
    expect(document.body.textContent).toContain("Zeile 1: Der Rufname ist länger als 80 Zeichen.");
    expect(stelle().einheiten).toHaveLength(1);
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', Array.from({ length: 60 }, (_, i) => `RTW ${i}`).join("\n"));
    await clickElement(knopf("Übernehmen"));
    expect(document.body.textContent).toContain("Höchstens 60 Einheiten je Stelle — hier wären es 61.");
    expect(stelle().einheiten).toHaveLength(1);
  });
});

describe("Bibliothek im Flyin (Entscheidung 13)", () => {
  it("„Aus Bibliothek“ füllt Titel, Zeichen, Leiter, Kontakte in EINEM Schritt, lädt das Zeichen nach; danach Fokus im Titel", async () => {
    await mount(<Rahmen />);
    await waehleOption(feldZu("Aus Bibliothek"), "Leitstelle Uelzen · Disponent");
    expect(stelle()).toMatchObject({ titel: "Leitstelle Uelzen", zeichen: "zusatz:eal", leiter: "Disponent", kontakte: [{ art: "telefon", wert: "0581 1" }] });
    expect(stelle().einheiten).toHaveLength(1);
    expect(schritte).toEqual([undefined]); // ohne Bündelschlüssel = ein eigener Rückgängig-Schritt
    expect(lade).toHaveBeenCalledWith(["zusatz:eal"]); // der Kopierweg lädt selbst nach, nicht jedes `aendere`
    await warte();
    expect(document.activeElement).toBe(REF0.current?.input); // das Select montiert neu — der Fokus fällt nicht auf body
  });
  it("Titelvorschläge auch im Flyin: Tippen zeigt sie (Tabstopps), Alt+Enter füllt in EINEM Schritt, Fokus bleibt, kein „fertig“", async () => {
    await mount(<Rahmen />);
    await fill('[data-flyin-stelle] input[name="titel"]', "Leit");
    const gruppe = query('[role="group"][aria-label="Vorschläge aus der Bibliothek"]');
    expect(gruppe.textContent).toContain("Leitstelle Uelzen · Disponent");
    expect(gruppe.querySelector("[data-vorschlag]")!.getAttribute("tabindex")).not.toBe("-1");
    schritte.length = 0;
    const feld = query<HTMLInputElement>('[data-flyin-stelle] input[name="titel"]');
    feld.focus();
    await act(async () => { feld.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true })); });
    expect(stelle().titel).toBe("Leitstelle Uelzen");
    expect(schritte).toEqual([undefined]);
    expect(document.activeElement).toBe(feld);
    expect(fertig).not.toHaveBeenCalled(); // Alt+Enter ist nicht das Enter, das das Flyin schließt
  });
  it("„In Bibliothek übernehmen“: Angaben der Stelle, Kontext ergänzt; Dublette bietet „aktualisieren“ an (Notiz bleibt); Fokus bleibt am Knopf", async () => {
    bibAktion.stelle
      .mockResolvedValueOnce({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "„EA 1“ steht schon in der Bibliothek." } })
      .mockResolvedValueOnce({ ok: true, eintrag: { id: "b2", titel: "EA 1", zeichen: null, leiter: null, kontakte: [], notiz: "intern" } });
    await mount(<Rahmen />);
    const uebernehmen = knopf("In Bibliothek übernehmen");
    uebernehmen.focus();
    await clickElement(uebernehmen);
    await warte();
    expect(bibAktion.stelle).toHaveBeenCalledWith(expect.objectContaining({ id: null, titel: "EA 1", kontakte: expect.arrayContaining([{ art: "email", wert: "ea1@drk.de" }]) }));
    expect(document.body.textContent).toContain("„EA 1“ steht schon in der Bibliothek.");
    expect(document.activeElement).toBe(uebernehmen); // nur `loading`, nie gesperrt — der Fokus fällt nicht auf body
    await clickElement(knopf("Eintrag in der Bibliothek aktualisieren"));
    await warte();
    expect(bibAktion.stelle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "b2", titel: "EA 1", notiz: "intern" }));
    expect(merke).toHaveBeenCalledWith({ stellen: [expect.objectContaining({ id: "b2" })] });
    expect(document.body.textContent).toContain("„EA 1“ in der Bibliothek aktualisiert.");
  });
  it("ohne Titel ist „In Bibliothek übernehmen“ gesperrt", async () => {
    await mount(<Rahmen />);
    await fill('[data-flyin-stelle] input[name="titel"]', "");
    expect(knopf("In Bibliothek übernehmen").disabled).toBe(true);
  });
  it("Einheiten aus der Bibliothek: freie zuerst, hier vorhandene gesperrt, anderswo eingesetzte mit Hinweis; der Suchtext bleibt", async () => {
    await mount(<Rahmen stelleId="b" />);
    const auswahl = query<HTMLInputElement>('input[aria-label="Einheiten aus der Bibliothek"]');
    const liste = await oeffneAuswahl(auswahl);
    expect(optionen(liste)).toEqual(["KTW RK 2", "NEF RK 3", "RTW RK 1 — schon bei EA 1"]);
    await fill('input[aria-label="Einheiten aus der Bibliothek"]', "RK");
    await waehleOption(auswahl, "KTW RK 2");
    expect(auswahl.value).toBe("RK"); // autoClearSearchValue: false — einmal tippen, mehrere wählen
  });
  it("Einheiten aus der Bibliothek: an DIESER Stelle schon vorhandene sind gesperrt; „Hinzufügen“ ist EIN Schritt, danach Fokus zurück in die Auswahl", async () => {
    await mount(<Rahmen />);
    const auswahl = query<HTMLInputElement>('input[aria-label="Einheiten aus der Bibliothek"]');
    const liste = await oeffneAuswahl(auswahl);
    const gesperrt = [...liste.querySelectorAll<HTMLElement>(".ant-select-item-option-disabled")].map((o) => o.textContent);
    expect(gesperrt).toEqual(["RTW RK 1 — steht schon hier"]);
    await waehleOption(auswahl, "KTW RK 2");
    await waehleOption(auswahl, "NEF RK 3");
    schritte.length = 0;
    await clickElement(knopf("Hinzufügen"));
    expect(stelle().einheiten.map((e) => `${e.typ} ${e.rufname}`)).toEqual(["RTW RK 1", "KTW RK 2", "NEF RK 3"]);
    expect(schritte).toEqual([undefined]);
    await warte();
    expect(document.activeElement).toBe(auswahl);
  });
  it("„Einheiten in Bibliothek übernehmen“: alle Einheiten der Stelle in EINEM Aufruf, Meldung mit Zahlen", async () => {
    bibAktion.einheiten.mockResolvedValue({ ok: true, angelegt: 0, uebersprungen: 1, eintraege: [] });
    await mount(<Rahmen />);
    await clickElement(knopf("Einheiten in Bibliothek übernehmen"));
    await warte();
    expect(bibAktion.einheiten).toHaveBeenCalledWith([{ typ: "RTW", rufname: "RK 1", notiz: null, zeichen: null }]);
    expect(document.body.textContent).toContain("0 angelegt, 1 schon vorhanden.");
  });
  it("Verbindung aus der Bibliothek: eigene Gruppe, Wahl legt eine Kopie an und verbindet", async () => {
    await mount(<Rahmen />);
    const liste = await oeffneAuswahl(feldZu("Zur Elternstelle"));
    expect(liste.textContent).toContain("Aus der Bibliothek");
    expect(optionen(liste)).toContain("DMO 608 · Digitalfunk DMO");
    // Die Liste steht schon offen — ein zweites mousedown (waehleOption) schlösse sie wieder.
    await clickElement([...liste.querySelectorAll<HTMLElement>(".ant-select-item-option")].find((o) => o.textContent === "DMO 608 · Digitalfunk DMO")!);
    const v = stand.verbindungen.find((x) => x.bezeichnung === "DMO 608")!;
    expect(v.art).toBe("dmo");
    expect(stelle().verbindungId).toBe(v.id);
  });
});
