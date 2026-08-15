import { describe, expect, it } from "vitest";
import type { AufgabeRow, PersonRow, Rolle } from "../_db/schema";
import { aktionsOptionen } from "./aktionsOptionen";
import { uebergang } from "./lebenszyklus";
import { darfNachweisHochladen, type Akteur } from "./zugang";

const HEUTE = "2026-08-13";

let seq = 0;
function person(rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  seq += 1;
  return {
    id: `person-${seq}`,
    sub: `dev:person-${seq}@localtest.me`,
    name: `Person ${seq}`,
    initialen: "PX",
    rolle,
    sollMinutenTag: 468,
    aktivVon: "2026-01-01",
    aktivBis: null,
    erstelltAm: new Date(0),
    ...extra,
  };
}

function aufgabe(extra: Partial<AufgabeRow> = {}): AufgabeRow {
  return {
    id: "aufgabe-1",
    titel: "T",
    beschreibung: "B",
    prioritaet: "mittel",
    erstellerId: "ersteller-id",
    zugewiesenAn: "zugewiesen-id",
    status: "verteilt",
    faelligAm: "2026-08-20",
    faelligUhrzeit: null,
    dauerMinuten: 60,
    nachweisPflicht: false,
    nachweisArt: "text",
    prueferId: "pruefer-id",
    istSelbst: false,
    planDatum: null,
    planUhrzeit: null,
    planRang: 0,
    vorschlagDatum: null,
    vorschlagUhrzeit: null,
    erstelltAm: new Date(0),
    aktualisiertAm: new Date(0),
    ...extra,
  };
}

/**
 * DIE FIXTUR-ZEILE ALS `Akteur` — der Refactor auf `Akteur` (`_lib/zugang.ts`) ändert die
 * AUFRUFFORM der Prädikate, NICHT ihre Antwort: `istKoordination` folgt hier weiterhin genau
 * der Rolle der Zeile, damit jede Zusage dieser Datei unverändert bleibt.
 */
function akteur(p: PersonRow): Akteur {
  return { person: p, istKoordination: p.rolle === "koordination" };
}

const ALLE_AUS: Record<string, boolean> = {
  starten: false,
  zuruecksetzen: false,
  fertig: false,
  freigeben: false,
  zurueckweisen: false,
  wiederaufnehmen: false,
  zurueckziehen: false,
  nachweisHochladen: false,
};

describe("aktionsOptionen — ruft uebergang() je Aktion, baut die Tabelle nicht nach", () => {
  /**
   * ECHTE GEGENPROBE STATT BEHAUPTUNG: dieser Test importiert `uebergang` UNABHAENGIG und
   * vergleicht `aktionsOptionen(...)` gegen sieben einzelne `uebergang(...).erlaubt`-Aufrufe —
   * wuerde `aktionsOptionen` die Tabelle nachbauen statt `uebergang()` zu rufen, koennte dieser
   * Vergleich divergieren, sobald sich die Tabelle (`_lib/lebenszyklus.ts`) je aendert.
   */
  it("stimmt fuer eine zugewiesene, aktive BuFDi bei „verteilt“ mit sieben direkten uebergang()-Aufrufen ueberein", () => {
    const bufdi = person("bufdi", { id: "bufdi-x" });
    const a = aufgabe({ status: "verteilt", zugewiesenAn: bufdi.id });

    const erwartet = {
      starten: uebergang(a, "starten", akteur(bufdi), HEUTE).erlaubt,
      zuruecksetzen: uebergang(a, "zuruecksetzen", akteur(bufdi), HEUTE).erlaubt,
      fertig: uebergang(a, "fertig", akteur(bufdi), HEUTE).erlaubt,
      freigeben: uebergang(a, "freigeben", akteur(bufdi), HEUTE).erlaubt,
      zurueckweisen: uebergang(a, "zurueckweisen", akteur(bufdi), HEUTE).erlaubt,
      wiederaufnehmen: uebergang(a, "wiederaufnehmen", akteur(bufdi), HEUTE).erlaubt,
      zurueckziehen: uebergang(a, "zurueckziehen", akteur(bufdi), HEUTE).erlaubt,
      // KEIN `uebergang()`-Aufruf hier (Aufgabe 19, Kopfkommentar von `aktionsOptionen`): Nachweis
      // hochladen ist kein Uebergang der Tabelle. `a.status === "verteilt"` in dieser Fixtur macht
      // das Ergebnis ohnehin `false`, unabhaengig von `darfNachweisHochladen`.
      nachweisHochladen:
        a.status === "in_arbeit" && a.nachweisPflicht && darfNachweisHochladen(akteur(bufdi), a, HEUTE),
    };
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual(erwartet);
  });

  it("„verteilt“, zugewiesene BuFDi: NUR starten ist erlaubt", () => {
    const bufdi = person("bufdi", { id: "bufdi-a" });
    const a = aufgabe({ status: "verteilt", zugewiesenAn: bufdi.id });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual({ ...ALLE_AUS, starten: true });
  });

  it("„in_arbeit“, zugewiesene BuFDi, Fremdaufgabe: zuruecksetzen UND fertig sind erlaubt", () => {
    const bufdi = person("bufdi", { id: "bufdi-b" });
    const a = aufgabe({ status: "in_arbeit", zugewiesenAn: bufdi.id, istSelbst: false });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual({
      ...ALLE_AUS,
      zuruecksetzen: true,
      fertig: true,
      // KEIN nachweisHochladen: diese Fixtur setzt `nachweisPflicht` nicht (Vorgabe `false`
      // ueber die `aufgabe()`-Fabrik oben) — ohne Pflicht gibt es nichts, das ein Nachweis
      // erfuellen muesste.
    });
  });

  /**
   * NACHWEIS HOCHLADEN (Aufgabe 19) — braucht ZUSAETZLICH ZU `in_arbeit`+zugewiesen `nachweisPflicht:
   * true`, sonst bleibt es bei der Fixtur direkt oben aus. Isoliert von `fertig`: beide Felder teilen
   * sich hier dieselbe Grundbedingung, `nachweisHochladen` traegt aber die Pflicht zusaetzlich.
   */
  it("„in_arbeit“, zugewiesene BuFDi, nachweisPflicht: nachweisHochladen ist zusaetzlich erlaubt", () => {
    const bufdi = person("bufdi", { id: "bufdi-b2" });
    const a = aufgabe({
      status: "in_arbeit",
      zugewiesenAn: bufdi.id,
      istSelbst: false,
      nachweisPflicht: true,
      nachweisArt: "bild",
    });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual({
      ...ALLE_AUS,
      zuruecksetzen: true,
      fertig: true,
      nachweisHochladen: true,
    });
  });

  it("„freigabe_offen“, eingetragener Pruefer: freigeben UND zurueckweisen sind erlaubt, sonst nichts", () => {
    const pruefer = person("auftrag", { id: "pruefer-y" });
    const a = aufgabe({ status: "freigabe_offen", prueferId: pruefer.id });
    expect(aktionsOptionen(a, akteur(pruefer), HEUTE)).toEqual({
      ...ALLE_AUS,
      freigeben: true,
      zurueckweisen: true,
    });
  });

  /**
   * DIE ZUGEWIESENE PERSON HAT NIEMALS EINE FREIGABE-AKTION (Spec §5.2, `_lib/zugang.ts`s
   * `darfFreigeben`: „der Zugewiesene nie" — auch nicht, wenn sie zufaellig ausserdem als Pruefer
   * einer FREMDEN Aufgabe eingetragen waere, was diese Fixtur bewusst NICHT ist, um den Fall sauber
   * zu isolieren). Diese Zeile ist die konkrete Gegenprobe zur Kernzusage der Aufgabe: „eine
   * Selbstaufgabe hat keine Freigabe-Aktion, auch nicht fuer die Koordination; der Zugewiesene hat
   * sie nie."
   */
  it("„freigabe_offen“, die zugewiesene BuFDi selbst: KEINE Freigabe-Aktion", () => {
    const bufdi = person("bufdi", { id: "bufdi-c" });
    const anderePerson = person("auftrag", { id: "pruefer-z" });
    const a = aufgabe({ status: "freigabe_offen", zugewiesenAn: bufdi.id, prueferId: anderePerson.id });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual(ALLE_AUS);
  });

  /**
   * SELBSTAUFGABE: KEINE FREIGABE-AKTION FUER DIE KOORDINATION (Spec §5.2, Betreiberentscheidung
   * 2026-08-13 in `_lib/zugang.ts`s `darfFreigeben`) — eine Selbstaufgabe kennt gar keine
   * `freigabe_offen`-Zeile, aber die Gegenprobe zeigt hier zusaetzlich: selbst wenn eine Aufgabe
   * (durch einen Dateneingriff) `istSelbst` UND `freigabe_offen` truege, bekaeme die Koordination
   * dafuer keine Freigabe-Aktion.
   */
  it("Selbstaufgabe, koordination: KEINE Freigabe-Aktion, auch bei (fachlich unerreichbarem) „freigabe_offen“", () => {
    const koordination = person("koordination", { id: "koord-1" });
    const a = aufgabe({ status: "freigabe_offen", istSelbst: true, prueferId: null });
    expect(aktionsOptionen(a, akteur(koordination), HEUTE)).toEqual(ALLE_AUS);
  });

  it("„zurueckgewiesen“, zugewiesene BuFDi: NUR wiederaufnehmen ist erlaubt", () => {
    const bufdi = person("bufdi", { id: "bufdi-d" });
    const a = aufgabe({ status: "zurueckgewiesen", zugewiesenAn: bufdi.id });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual({ ...ALLE_AUS, wiederaufnehmen: true });
  });

  it("„eingegangen“, Ersteller: NUR zurueckziehen ist erlaubt", () => {
    const ersteller = person("auftrag", { id: "ersteller-e" });
    const a = aufgabe({ status: "eingegangen", erstellerId: ersteller.id, zugewiesenAn: null });
    expect(aktionsOptionen(a, akteur(ersteller), HEUTE)).toEqual({ ...ALLE_AUS, zurueckziehen: true });
  });

  it("„abgeschlossen“, jede Rolle: gar keine Aktion — Endzustand", () => {
    const bufdi = person("bufdi", { id: "bufdi-f" });
    const a = aufgabe({ status: "abgeschlossen", zugewiesenAn: bufdi.id });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual(ALLE_AUS);
  });

  it("eine ausgeschiedene, zugewiesene BuFDi bekommt keine einzige Aktion mehr", () => {
    const exBufdi = person("bufdi", { id: "bufdi-g", aktivBis: "2020-01-01" });
    const a = aufgabe({ status: "in_arbeit", zugewiesenAn: exBufdi.id });
    expect(aktionsOptionen(a, akteur(exBufdi), HEUTE)).toEqual(ALLE_AUS);
  });
});
