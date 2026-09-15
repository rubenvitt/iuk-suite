import { describe, it, expect } from "vitest";
import {
  artikelTrifft, artikelFiltern, LEERER_FILTER,
  ARTIKEL_BESTAND_ZUSTAENDE, ARTIKEL_CHARGEN_ZUSTAENDE, ARTIKEL_MINDEST_ZUSTAENDE,
  ARTIKEL_STATUS_ZUSTAENDE, ARTIKEL_ZUSTAND_GRUPPEN,
  type ArtikelFilterZeile, type ArtikelZustand,
} from "./artikelFilter";
import { kategorieSchluessel } from "./kategorie";

const z = (p: Partial<ArtikelFilterZeile> = {}): ArtikelFilterZeile => ({
  name: "Verbandpäckchen", fach: "A1", aktiv: true, bestand: 7, unterMindest: false,
  naechsteCharge: { chargenNr: "CH-4711", verfall: "2027-01" }, chargeKritisch: false,
  kategorie: null, ...p,
});

describe("artikelTrifft — der Freitext sucht ueber DREI Felder", () => {
  it("findet ueber den NAMEN", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "verband" })).toBe(true);
  });
  it("findet ueber das FACH", () => {
    // Der Nebenbefund aus §12.1, Punkt 2: die Alt-Spec probiert nur den Namen.
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "a1" })).toBe(true);
  });
  it("findet ueber die CHARGENNUMMER der naechsten Charge", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "4711" })).toBe(true);
  });
  it("findet nicht, was in keinem der drei Felder steht", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "pflaster" })).toBe(false);
  });
  it("sucht NICHT ueber die Kategorie — dafuer gibt es den Kategorienfilter", () => {
    expect(artikelTrifft(z({ kategorie: "Hygiene" }), { ...LEERER_FILTER, suche: "hygiene" }))
      .toBe(false);
  });
  it("ist gross-/kleinschreibungsunabhaengig und trimmt", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "  VERBAND  " })).toBe(true);
  });
  it("laesst bei LEERER Suche alles durch", () => {
    expect(artikelTrifft(z(), LEERER_FILTER)).toBe(true);
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "   " })).toBe(true);
  });
  it("stolpert nicht ueber naechsteCharge === null", () => {
    expect(artikelTrifft(z({ naechsteCharge: null }), { ...LEERER_FILTER, suche: "verband" }))
      .toBe(true);
    expect(artikelTrifft(z({ naechsteCharge: null }), { ...LEERER_FILTER, suche: "4711" }))
      .toBe(false);
  });
});

describe("Die Spaltenfilter der Artikelliste", () => {
  const ALLE: ArtikelZustand[] = ARTIKEL_ZUSTAND_GRUPPEN.flatMap((g) => [...g]);

  function trifft(wert: string, zeile: ReturnType<typeof z>): boolean {
    const zustand = ALLE.find((x) => x.wert === wert);
    if (!zustand) throw new Error(`Zustand nicht gefunden: ${wert}`);
    return zustand.trifft(zeile);
  }

  it("unter Mindestbestand", () => {
    expect(trifft("unter-mindest", z())).toBe(false);
    expect(trifft("unter-mindest", z({ unterMindest: true }))).toBe(true);
  });

  it("Charge kritisch", () => {
    expect(trifft("charge-kritisch", z())).toBe(false);
    expect(trifft("charge-kritisch", z({ chargeKritisch: true }))).toBe(true);
  });

  it("inaktiv", () => {
    expect(trifft("inaktiv", z({ aktiv: false }))).toBe(true);
    expect(trifft("inaktiv", z({ aktiv: true }))).toBe(false);
  });

  /**
   * DRK-295. Die Schwelle ist GENAU 0 und nicht „wenig" — „unter
   * Mindestbestand" ist der andere Zustand und bleibt es.
   */
  it("Bestand 0", () => {
    expect(trifft("bestand-null", z({ bestand: 0 }))).toBe(true);
    expect(trifft("bestand-null", z({ bestand: 1 }))).toBe(false);
  });

  /**
   * ⚠️ DER TEST, DER DEN ZURUECKGEDREHTEN AUSSCHLUSS FAENGT.
   *
   * Die alten Haken waren AUSSCHLUESSE („inaktive ausblenden", „Bestand 0
   * ausblenden"), ein Spaltenfilter ist ein EINSCHLUSS. Ohne Gegenstueck waere
   * der alte Vorgang — die inaktiven loswerden — gar nicht mehr ausdrueckbar,
   * und wer den scheinbaren Ersatz ankreuzt, bekaeme das GEGENTEIL. Jede Gruppe
   * schuldet deshalb eine vollstaendige Zerlegung: jede Zeile trifft genau
   * einen Zustand je Gruppe.
   */
  it.each([
    ["Bestand", ARTIKEL_BESTAND_ZUSTAENDE],
    ["Min.", ARTIKEL_MINDEST_ZUSTAENDE],
    ["Verfall", ARTIKEL_CHARGEN_ZUSTAENDE],
    ["Status", ARTIKEL_STATUS_ZUSTAENDE],
  ])("die Gruppe %s zerlegt jede Zeile vollstaendig und ueberschneidungsfrei", (_name, gruppe) => {
    const proben = [
      z(), z({ bestand: 0 }), z({ bestand: -3 }), z({ aktiv: false }),
      z({ unterMindest: true }), z({ chargeKritisch: true }),
      z({ naechsteCharge: null }), z({ naechsteCharge: null, bestand: 0 }),
    ];
    for (const probe of proben) {
      expect((gruppe as readonly ArtikelZustand[]).filter((x) => x.trifft(probe))).toHaveLength(1);
    }
  });

  it("macht das alte Ausblenden der inaktiven wieder ausdrueckbar", () => {
    const zeilen = [z({ aktiv: true }), z({ aktiv: false }), z({ aktiv: true })];
    expect(zeilen.filter((x) => trifft("aktiv", x))).toHaveLength(2);
  });

  it("macht das alte Ausblenden von Bestand 0 wieder ausdrueckbar", () => {
    const zeilen = [z({ bestand: 0 }), z({ bestand: 5 }), z({ bestand: -3 })];
    // ⚠️ Der NEGATIVE Bestand zaehlt als vorhanden und bleibt damit sichtbar:
    // er ist ein Buchungsfehler, und genau den darf ein Aufraeumfilter nicht
    // schlucken.
    expect(zeilen.filter((x) => trifft("bestand-vorhanden", x))).toHaveLength(2);
  });

  /**
   * ⚠️ MEHRERE ANGEKREUZTE ZUSTAENDE EINER SPALTE SIND EINE VEREINIGUNG, KEIN
   * SCHNITT. antd ruft `onFilter` je angekreuztem Wert auf und verodert das
   * Ergebnis (`useFilter/index.js`, `realKeys.some(...)`). Deshalb liegen die
   * Gruppen auf VERSCHIEDENEN Spalten — zwischen Spalten verundet antd, und nur
   * so bleibt „aktiv UND unter Mindestbestand" moeglich, was die alte Leiste
   * mit ihren unabhaengigen Haken konnte.
   */
  it("verodert innerhalb einer Gruppe und verundet zwischen Gruppen", () => {
    const aktivUnterMindest = z({ aktiv: true, unterMindest: true });
    const inaktivOhneMangel = z({ aktiv: false, unterMindest: false });

    const beide = ["aktiv", "inaktiv"];
    expect([aktivUnterMindest, inaktivOhneMangel]
      .filter((x) => beide.some((w) => trifft(w, x)))).toHaveLength(2);

    expect([aktivUnterMindest, inaktivOhneMangel]
      .filter((x) => trifft("aktiv", x) && trifft("unter-mindest", x))).toHaveLength(1);
  });

  it("nennt jeden Zustand genau einmal und mit einem Text", () => {
    const werte = ALLE.map((x) => x.wert);
    expect(new Set(werte).size).toBe(werte.length);
    for (const zustand of ALLE) expect(zustand.text.trim()).not.toBe("");
  });
});

describe("artikelTrifft — ausgeblendete Kategorien (DRK-294)", () => {
  const ohneHygiene = new Set([kategorieSchluessel("Hygiene")]);

  it("blendet einen Artikel der ausgeblendeten Kategorie aus", () => {
    expect(artikelTrifft(z({ kategorie: "Hygiene" }), LEERER_FILTER, ohneHygiene)).toBe(false);
    expect(artikelTrifft(z({ kategorie: "Technik" }), LEERER_FILTER, ohneHygiene)).toBe(true);
  });

  it("vergleicht gefaltet: eine andere Schreibweise ist dieselbe Kategorie", () => {
    expect(artikelTrifft(z({ kategorie: "HYGIENE" }), LEERER_FILTER, ohneHygiene)).toBe(false);
    expect(artikelTrifft(
      z({ kategorie: "Sanitätsmaterial" }), LEERER_FILTER,
      new Set([kategorieSchluessel("SANITÄTSMATERIAL")]),
    )).toBe(false);
  });

  it("laesst einen Artikel OHNE Kategorie immer stehen", () => {
    expect(artikelTrifft(z({ kategorie: null }), LEERER_FILTER, ohneHygiene)).toBe(true);
    // Auch ein Leerschluessel in der Auswahl blendet ihn nicht aus.
    expect(artikelTrifft(z({ kategorie: null }), LEERER_FILTER, new Set([""]))).toBe(true);
  });

  it("laesst ohne Auswahl alles durch — auch ohne drittes Argument", () => {
    expect(artikelTrifft(z({ kategorie: "Hygiene" }), LEERER_FILTER)).toBe(true);
    expect(artikelTrifft(z({ kategorie: "Hygiene" }), LEERER_FILTER, new Set())).toBe(true);
  });

  it("verknuepft UND mit der Suche", () => {
    const zeile = z({ kategorie: "Technik", unterMindest: true });
    const auswahl = new Set([kategorieSchluessel("Hygiene")]);
    expect(artikelTrifft(zeile, { suche: "verband" }, auswahl)).toBe(true);
    expect(artikelTrifft(zeile, { suche: "pflaster" }, auswahl)).toBe(false);
    // Der Riegel greift auch bei passender Suche, wenn die Kategorie
    // ausgeblendet ist — sonst holte ein Suchbegriff sie still zurueck.
    const versteckt = z({ kategorie: "Hygiene" });
    expect(artikelTrifft(versteckt, { suche: "verband" }, auswahl)).toBe(false);
  });
});

/**
 * ⚠️ Reine ASCII-Begriffe ("verband", "pflaster") beweisen nichts ueber die
 * Faltung — sie verhalten sich unter jeder Kleinschreibung identisch. Diese
 * Faelle nageln das FALTUNGS-VERHALTEN fest, das `falte()` heute hat: Umlaute
 * korrekt klein/gross, ß/ss NICHT vereinheitlicht (§5.20).
 *
 * ⚠️ WAS DIESE TESTS NICHT BEWEISEN: dass `artikelTrifft` tatsaechlich
 * `falte()` RUFT statt eine eigene, aequivalente Kleinschreibung zu bauen.
 * `falte(s) === s.toLowerCase()` gilt heute buchstaeblich (`suche.ts`), also
 * waere ein direkter `.toLowerCase()`-Aufruf an dieser Stelle fuer BEIDE
 * Faelle unten ebenfalls gruen. Dass die Implementierung `falte()` importiert
 * statt `.toLowerCase()` zu rufen, ist eine BAUFORM-Zusicherung (Teil 3,
 * scharf gebunden: "wird nicht nachgebaut und nicht durch `toLowerCase()`
 * ersetzt") — kein Verhaltenstest kann sie heute tragen, weil kein
 * beobachtbarer Unterschied existiert. Die Absicherung dieser Bauform gehoert
 * strukturell zu `_lib/bauform.test.ts` (fremde Datei, siehe Bericht).
 */
describe("artikelTrifft — Faltungsverhalten wie `falte()`: Umlaute und die ss/ß-Luecke", () => {
  it("findet Umlaute unabhaengig von Gross-/Kleinschreibung UND Diakritika in derselben Zusicherung", () => {
    const zeile = z({ name: "Verbandpäckchen" });
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "PÄCKCHEN" })).toBe(true);
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "päckchen" })).toBe(true);
  });
  it("faltet NICHT ss/ß — dieselbe Luecke wie `falte()`, keine eigene Kleinschreibung (§5.20)", () => {
    const zeile = z({ name: "Straßenset" });
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "STRASSE" })).toBe(false);
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "straße" })).toBe(true);
  });
});

describe("artikelFiltern — DIESELBE abgeleitete Liste fuer Tabelle und Export", () => {
  it("behaelt die Reihenfolge und reicht Zusatzfelder durch", () => {
    /**
     * ⚠️ DIE KOPPLUNG, DIE DEN EXPORT STILL BRICHT (§5.13.3, Punkt 3, §9.4):
     * der Export enthaelt „genau das, was gerade in der Tabelle steht".
     * Seit DRK-331 ist Filtern zum Teil in antds Table-eigenen Zustand
     * gewandert — genau der Fall, vor dem diese Auflage warnte. Die Tabelle
     * liest die angezeigte Menge deshalb ueber
     * `onChange(…, extra.currentDataSource)` und gibt SIE an den Export;
     * dieses Praedikat ist nur noch die Vorfilterung davor.
     */
    const zeilen = [
      { ...z({ name: "Alpha" }), id: "1" },
      { ...z({ name: "Beta", aktiv: false }), id: "2" },
      { ...z({ name: "Alpha zwei" }), id: "3" },
    ];
    expect(artikelFiltern(zeilen, { ...LEERER_FILTER, suche: "alpha" }).map((r) => r.id))
      .toEqual(["1", "3"]);
    // Ein inaktiver Artikel faellt hier NICHT mehr heraus: das entscheidet
    // seit DRK-331 der Spaltenfilter der Status-Spalte, nicht dieses Praedikat.
    expect(artikelFiltern(zeilen, LEERER_FILTER).map((r) => r.id))
      .toEqual(["1", "2", "3"]);
  });

  it("reicht die ausgeblendeten Kategorien an das Praedikat durch", () => {
    const zeilen = [
      { ...z({ kategorie: "Hygiene" }), id: "1" },
      { ...z({ kategorie: null }), id: "2" },
      { ...z({ kategorie: "Technik" }), id: "3" },
    ];
    expect(artikelFiltern(zeilen, LEERER_FILTER, new Set([kategorieSchluessel("Hygiene")]))
      .map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("veraendert die Eingabeliste NICHT", () => {
    const zeilen = [z({ name: "A" }), z({ name: "B" })];
    artikelFiltern(zeilen, { ...LEERER_FILTER, suche: "A" });
    expect(zeilen).toHaveLength(2);
  });
});
