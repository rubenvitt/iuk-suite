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
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE (Quellenwechsel 2026-08-15): die Koordination kommt aus der Auth-Gruppe und liegt
 * damit auf einer ANDEREN Achse als `rolle`. Jede Zusage dieser Datei bleibt unveraendert — nur die
 * Fixtur sagt jetzt aus, was sie vorher aus der Rolle ableitete.
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

const ALLE_AUS: Record<string, boolean> = {
  starten: false,
  zuruecksetzen: false,
  fertig: false,
  freigeben: false,
  zurueckweisen: false,
  wiederaufnehmen: false,
  zurueckziehen: false,
  umverteilen: false,
  nachweisHochladen: false,
};

describe("aktionsOptionen — ruft uebergang() je Aktion, baut die Tabelle nicht nach", () => {
  /**
   * ECHTE GEGENPROBE STATT BEHAUPTUNG: dieser Test importiert `uebergang` UNABHAENGIG und
   * vergleicht `aktionsOptionen(...)` gegen sieben einzelne `uebergang(...).erlaubt`-Aufrufe —
   * wuerde `aktionsOptionen` die Tabelle nachbauen statt `uebergang()` zu rufen, koennte dieser
   * Vergleich divergieren, sobald sich die Tabelle (`_lib/lebenszyklus.ts`) je aendert.
   */
  it("stimmt fuer eine zugewiesene, aktive BuFDi bei „verteilt“ mit acht direkten uebergang()-Aufrufen ueberein", () => {
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
      umverteilen: uebergang(a, "umverteilen", akteur(bufdi), HEUTE).erlaubt,
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
  it("Selbstaufgabe, Koordination: KEINE Freigabe-Aktion, auch bei (fachlich unerreichbarem) „freigabe_offen“", () => {
    const koordination = person("auftrag", { id: "koord-1" });
    const a = aufgabe({ status: "freigabe_offen", istSelbst: true, prueferId: null });
    expect(aktionsOptionen(a, akteur(koordination, true), HEUTE)).toEqual(ALLE_AUS);
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

  /*
   * ANDERS ZUWEISEN (Oberflaechen-Spec 2026-08-16 §7 Nr. 3, §11.1) — DIE VIER FAELLE, DIE DIE
   * ZEILE `{ von: "verteilt", aktion: "umverteilen", wer: darfVerteilen }` VOLLSTAENDIG EINRAHMEN:
   * der Zustand stimmt UND die Rolle (erlaubt), nur der Zustand (verboten), nur die Rolle
   * (verboten), und die zugewiesene Person selbst (verboten — sie darf nicht verteilen).
   *
   * WARUM DIE ZUSTANDS-GEGENPROBE `in_arbeit` NIMMT UND NICHT IRGENDEINEN ZUSTAND: genau dieses
   * Paar traegt die Aufspaltung von Rang 5 in der Fuehrungskarte (§4.2, 5a gegen 5b). Waere
   * `umverteilen` hier wahr, truege die Karte einen Knopf, den `verteilenGemeinsam` danach mit
   * einem Wurf ablehnt.
   */
  it("„verteilt“, Koordination: umverteilen ist erlaubt — die Zustandsaktion von Rang 5a", () => {
    const koordination = person("auftrag", { id: "koord-um-1" });
    const a = aufgabe({ status: "verteilt", zugewiesenAn: "bufdi-irgendwer" });
    expect(aktionsOptionen(a, akteur(koordination, true), HEUTE)).toEqual({
      ...ALLE_AUS,
      umverteilen: true,
    });
  });

  it("„in_arbeit“, Koordination: KEIN umverteilen — die Tabelle kennt es nur aus „verteilt“", () => {
    const koordination = person("auftrag", { id: "koord-um-2" });
    const a = aufgabe({ status: "in_arbeit", zugewiesenAn: "bufdi-irgendwer" });
    expect(aktionsOptionen(a, akteur(koordination, true), HEUTE)).toEqual(ALLE_AUS);
  });

  it("„verteilt“, Auftraggeber ohne Koordination: KEIN umverteilen — `darfVerteilen` ist falsch", () => {
    const auftrag = person("auftrag", { id: "auftrag-um-3" });
    const a = aufgabe({ status: "verteilt", zugewiesenAn: "bufdi-irgendwer" });
    expect(aktionsOptionen(a, akteur(auftrag), HEUTE)).toEqual(ALLE_AUS);
  });

  it("„verteilt“, die zugewiesene BuFDi selbst: starten ja, umverteilen nein", () => {
    const bufdi = person("bufdi", { id: "bufdi-um-4" });
    const a = aufgabe({ status: "verteilt", zugewiesenAn: bufdi.id });
    expect(aktionsOptionen(a, akteur(bufdi), HEUTE)).toEqual({ ...ALLE_AUS, starten: true });
  });

  /**
   * EINE KOORDINATION MIT ABGELAUFENEM `aktivBis` BEHAELT `umverteilen` — UND DAS IST DIE ZUSAGE
   * VON `darfVerteilen`, NICHT IHR BRUCH. Diese Zeile stand hier zunaechst mit der umgekehrten
   * Erwartung und war rot; nachgelesen (`_lib/zugang.ts`, Kopfkommentar von `darfVerteilen`) traegt
   * das Praedikat ABSICHTLICH KEIN `istAktiv`: die GRUPPENMITGLIEDSCHAFT traegt diese Rolle, nicht
   * die Personenzeile — sonst machten Pocket ID und ein Feld des Personenformulars, das die
   * Koordination sich selbst schreibt, zwei widersprechende Aussagen ueber dieselbe Person. Der
   * Entzug laeuft ueber die Gruppe, mit dem bekannten Verzugsfenster von bis zu einer Stunde.
   *
   * DIE ZEILE BLEIBT ALSO STEHEN, ABER MIT DER RICHTIGEN ERWARTUNG: sie ist die Gegenprobe, dass
   * niemand `istAktiv` beilaeufig in diesen Pfad hineinzieht, weil es „sicherer aussieht". Der
   * Unterschied zu `zurueckziehen` in derselben Fixtur ist der Beleg, dass hier zwei verschiedene
   * Zeitregeln bewusst nebeneinander stehen (`uebergang()`s `zurueckziehen`-Zweig prueft
   * `ersteller && istAktiv` ODER `darfVerteilen` — die zweite Klausel traegt hier).
   */
  it("eine Koordination mit abgelaufenem `aktivBis` behaelt umverteilen — die Gruppe traegt die Rolle", () => {
    const exKoordination = person("auftrag", { id: "koord-um-5", aktivBis: "2020-01-01" });
    const a = aufgabe({ status: "verteilt", zugewiesenAn: "bufdi-irgendwer" });
    expect(aktionsOptionen(a, akteur(exKoordination, true), HEUTE)).toEqual({
      ...ALLE_AUS,
      umverteilen: true,
    });
  });

  it("eine ausgeschiedene, zugewiesene BuFDi bekommt keine einzige Aktion mehr", () => {
    const exBufdi = person("bufdi", { id: "bufdi-g", aktivBis: "2020-01-01" });
    const a = aufgabe({ status: "in_arbeit", zugewiesenAn: exBufdi.id });
    expect(aktionsOptionen(a, akteur(exBufdi), HEUTE)).toEqual(ALLE_AUS);
  });
});
