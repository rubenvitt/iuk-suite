import { describe, expect, it } from "vitest";
import { STATUS_WERTE, type AufgabeRow, type PersonRow, type Rolle, type Status } from "../_db/schema";
import { anfangsZustand, uebergang, type Aktion } from "./lebenszyklus";
import type { Akteur } from "./zugang";

/*
 * ERSCHOEPFEND UEBER STATUS × AKTION — SECHS ZUSTAENDE MAL ZEHN AKTIONEN, ALLE SECHZIG PAARE, KEINE
 * STICHPROBE. Die Erwartungstabelle (`ERLAUBTE_UEBERGAENGE` unten) ist von Hand aus Spec §5.2
 * abgeschrieben und importiert NICHTS aus `lebenszyklus.ts` ausser den beiden Funktionen und dem
 * `Aktion`-Typ — sie teilt sich keine Datenstruktur mit der Implementierung. Nur so kann der Test
 * ueberhaupt rot werden, wenn dort eine Zeile verschwindet oder eine neue auftaucht.
 *
 * BEFUND (an den Auftraggeber, nicht still aufgeloest, Aufgabe 8): Brief und urspruengliche
 * Spec-Tabelle listeten ELF Zeilen, weil `fertig` zweimal auftaucht (Fremd- und Selbstaufgabe mit
 * unterschiedlichem `nach`). Im SECHS-MAL-ZEHN-RASTER ist das aber dieselbe Zelle
 * `(in_arbeit, fertig)` — die Verzweigung laeuft ueber `istSelbst`, eine Eigenschaft der AUFGABE,
 * nicht ueber Status oder Aktion. Im Raster gab es deshalb ZEHN erlaubte Zellen, nicht elf, wie der
 * Brief in seinem Test-Abschnitt behauptet hatte. Die Selbstaufgaben-Verzweigung wird weiter unten
 * als eigene Sonderregel mit eigener Gegenprobe getestet (`describe("Sonderregel 1 ...")`) — sie
 * fehlt nirgends, sie zaehlt im 60er-Raster nur nicht als zweite Zelle.
 *
 * NACHTRAG VOM 2026-08-13 (Aufgabe 10, Spec-Commit `72ef235`): eine ECHTE elfte Zelle kam hinzu —
 * `(in_arbeit, einplanen) → in_arbeit` —, aus einem voellig anderen Grund als der obige Befund: eine
 * neue, tatsaechlich zusaetzliche Spec-Zeile, keine Doppelzaehlung. Das Raster hat damit wieder ELF
 * erlaubte Zellen und NEUNUNDVIERZIG abgelehnte — zufaellig dieselbe Zahl, die der Brief-Fehler aus
 * Aufgabe 8 schon einmal (aus falschem Grund) nannte. `ERLAUBTE_UEBERGAENGE.length` wird unten auf
 * genau 11 geprueft, damit diese Zaehlung eine gewachte Tatsache ist und keine Behauptung im Bericht.
 */

let seq = 0;
function person(rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  seq += 1;
  return {
    id: `p${seq}`,
    sub: `dev:p${seq}@localtest.me`,
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
    id: "a1",
    titel: "T",
    beschreibung: "B",
    prioritaet: "mittel",
    erstellerId: "ersteller-id",
    zugewiesenAn: "bufdi-id",
    status: "eingegangen",
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

const HEUTE = "2026-08-13";

/** Die zehn Aktionen als LITERAL-TUPEL, unabhaengig vom Aktion-Typ konstruiert und ueber
 * `_EXHAUSTIV` gegen ihn geprueft: fehlt hier eine Aktion oder ist eine zu viel, schlaegt der
 * Typecheck fehl — die Liste kann nicht leise veralten, wenn `Aktion` sich aendert. */
const _EXHAUSTIV: Record<Aktion, true> = {
  verteilen: true,
  umverteilen: true,
  einplanen: true,
  starten: true,
  zuruecksetzen: true,
  fertig: true,
  freigeben: true,
  zurueckweisen: true,
  wiederaufnehmen: true,
  zurueckziehen: true,
};
const AKTIONEN = Object.keys(_EXHAUSTIV) as Aktion[];

/**
 * Die vier Rollen-Slots, mit denen das Raster arbeitet — dieselben IDs wie in `aufgabe()`.
 *
 * DER SLOT `koordination` IST SEIT DEM QUELLENWECHSEL (2026-08-15) KEIN ROLLENWERT MEHR, SONDERN
 * EINE GRUPPENZUGEHOERIGKEIT: `ROLLEN` kennt nur noch `auftrag`/`bufdi`, und wer koordiniert, steht
 * in `Akteur.istKoordination` (aus der Auth-Gruppe). Die Zeile traegt deshalb `auftrag` — fachlich
 * richtig, weil die Koordination fuer andere einstellt —, und die Koordinationseigenschaft haengt
 * am `Akteur`, nicht an der Person. Der Slot behaelt seinen Namen, weil er die FACHLICHE Rolle im
 * Raster benennt, nicht den Datenbankwert.
 */
interface Akteure {
  koordination: PersonRow;
  ersteller: PersonRow;
  bufdi: PersonRow;
  pruefer: PersonRow;
}

function akteure(): Akteure {
  return {
    koordination: person("auftrag", { id: "koordination-id" }),
    ersteller: person("auftrag", { id: "ersteller-id" }),
    bufdi: person("bufdi", { id: "bufdi-id" }),
    pruefer: person("auftrag", { id: "pruefer-id" }),
  };
}

/**
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE: die Koordination kommt aus der Auth-Gruppe und liegt damit auf einer ANDEREN Achse
 * als `rolle`. Jede Zusage dieser Datei bleibt unveraendert — nur die Fixtur sagt jetzt aus, was sie
 * vorher aus der Rolle ableitete.
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

/**
 * DERSELBE AKTEUR, ABER FUER DIE RASTERLAEUFE: dort waehlt `privilegiert()` die handelnde Person
 * erst zur Laufzeit aus den vier Slots aus, und nur der Slot `koordination` traegt die Gruppe. Ohne
 * diese eine Stelle muesste jede Rasterzelle die Fallunterscheidung selbst treffen.
 */
function akteurImRaster(p: PersonRow, a: Akteure): Akteur {
  return akteur(p, p.id === a.koordination.id);
}

/**
 * Die Person, die laut Spec §5.2 fuer eine Aktion "wer darf" zustaendig ist — fuer das
 * SECHZIG-Zellen-Raster braucht jede Zelle GENAU EINE privilegierte Akteurin, unabhaengig davon,
 * ob die Zelle im Zustand des Rasters ueberhaupt erlaubt ist (bei einer abgelehnten Zelle bleibt
 * sie trotzdem abgelehnt, weil Status × Aktion nicht zusammenpassen — die Person ist dann
 * irrelevant fuer das Ergebnis, muss aber eine gueltige Person SEIN, damit der Aufruf nicht aus
 * einem anderen Grund als dem geprueften scheitert).
 */
function privilegiert(aktion: Aktion, a: Akteure): PersonRow {
  switch (aktion) {
    case "verteilen":
    case "umverteilen":
      return a.koordination;
    case "einplanen":
    case "starten":
    case "zuruecksetzen":
    case "fertig":
    case "wiederaufnehmen":
      return a.bufdi;
    case "freigeben":
    case "zurueckweisen":
      return a.pruefer;
    case "zurueckziehen":
      return a.ersteller;
    default: {
      const nie: never = aktion;
      throw new Error(`Keine privilegierte Akteurin fuer unbekannte Aktion: ${nie}`);
    }
  }
}

type ErwarteterUebergang =
  | { von: Status; aktion: Aktion; wirkung: "aendern"; nach: Status }
  | { von: Status; aktion: Aktion; wirkung: "loeschen" };

/**
 * SPEC §5.2, VON HAND ABGESCHRIEBEN — die elf erlaubten Zellen des 60er-Rasters (Nachtrag vom
 * 2026-08-13: `in_arbeit`×`einplanen` kam hinzu, Aufgabe 10). `fertig` steht hier mit der
 * FREMDAUFGABEN-Ausrichtung (`freigabe_offen`); die Selbstaufgaben-Kurzstrecke ist Sonderregel 1
 * weiter unten, nicht eine zweite Zelle (siehe Kopfkommentar-Befund).
 */
const ERLAUBTE_UEBERGAENGE: ErwarteterUebergang[] = [
  { von: "eingegangen", aktion: "verteilen", wirkung: "aendern", nach: "verteilt" },
  { von: "eingegangen", aktion: "zurueckziehen", wirkung: "loeschen" },
  { von: "verteilt", aktion: "umverteilen", wirkung: "aendern", nach: "verteilt" },
  { von: "verteilt", aktion: "einplanen", wirkung: "aendern", nach: "verteilt" },
  { von: "verteilt", aktion: "starten", wirkung: "aendern", nach: "in_arbeit" },
  { von: "in_arbeit", aktion: "einplanen", wirkung: "aendern", nach: "in_arbeit" },
  { von: "in_arbeit", aktion: "zuruecksetzen", wirkung: "aendern", nach: "verteilt" },
  { von: "in_arbeit", aktion: "fertig", wirkung: "aendern", nach: "freigabe_offen" },
  { von: "freigabe_offen", aktion: "freigeben", wirkung: "aendern", nach: "abgeschlossen" },
  { von: "freigabe_offen", aktion: "zurueckweisen", wirkung: "aendern", nach: "zurueckgewiesen" },
  { von: "zurueckgewiesen", aktion: "wiederaufnehmen", wirkung: "aendern", nach: "in_arbeit" },
];

describe("uebergang — das 60-Zellen-Raster (6 Zustaende × 10 Aktionen)", () => {
  it("genau elf Zellen sind erlaubt — die Befund-Zaehlung ist eine gewachte Tatsache", () => {
    expect(ERLAUBTE_UEBERGAENGE.length).toBe(11);
  });

  it.each(STATUS_WERTE.flatMap((von) => AKTIONEN.map((aktion) => [von, aktion] as const)))(
    "%s × %s",
    (von, aktion) => {
      const erwartet = ERLAUBTE_UEBERGAENGE.find((e) => e.von === von && e.aktion === aktion);
      const a = akteure();
      const p = privilegiert(aktion, a);
      const t = aufgabe({ status: von, erstellerId: a.ersteller.id, zugewiesenAn: a.bufdi.id, prueferId: a.pruefer.id });
      const ergebnis = uebergang(t, aktion, akteurImRaster(p, a), HEUTE);

      if (!erwartet) {
        expect(ergebnis.erlaubt).toBe(false);
        if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
        return;
      }
      expect(ergebnis.erlaubt).toBe(true);
      if (!ergebnis.erlaubt) return;
      if (erwartet.wirkung === "loeschen") {
        expect(ergebnis.wirkung).toBe("loeschen");
      } else {
        expect(ergebnis.wirkung).toBe("aendern");
        if (ergebnis.wirkung === "aendern") expect(ergebnis.nach).toBe(erwartet.nach);
      }
    },
  );
});

describe("uebergang — dieselben 60 Zellen fuer eine AUSGESCHIEDENE privilegierte Person", () => {
  /*
   * KEINER der zehn erlaubten Uebergaenge darf einer ausgeschiedenen Person offenstehen — nicht
   * zehn einzeln handgeschriebene Faelle, sondern derselbe Rasterlauf mit `aktivBis` in der
   * Vergangenheit. `zurueckziehen` haengt an ZWEI Praedikaten (Ersteller ODER Koordination); die
   * Koordination im Raster ist hier ebenfalls ausgeschieden, `darfVerteilen` faellt also auch dort
   * weg, und der Ersteller-Zweig scheitert an `istAktiv` direkt.
   */
  it.each(STATUS_WERTE.flatMap((von) => AKTIONEN.map((aktion) => [von, aktion] as const)))(
    "%s × %s — ausgeschieden → immer abgelehnt",
    (von, aktion) => {
      const a: Akteure = {
        koordination: person("auftrag", { id: "koordination-id", aktivBis: "2026-08-01" }),
        ersteller: person("auftrag", { id: "ersteller-id", aktivBis: "2026-08-01" }),
        bufdi: person("bufdi", { id: "bufdi-id", aktivBis: "2026-08-01" }),
        pruefer: person("auftrag", { id: "pruefer-id", aktivBis: "2026-08-01" }),
      };
      const p = privilegiert(aktion, a);
      const t = aufgabe({ status: von, erstellerId: a.ersteller.id, zugewiesenAn: a.bufdi.id, prueferId: a.pruefer.id });
      const ergebnis = uebergang(t, aktion, akteurImRaster(p, a), HEUTE);
      expect(ergebnis.erlaubt).toBe(false);
      if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
    },
  );
});

describe("uebergang — dieselben 60 Zellen fuer eine UNBETEILIGTE AKTIVE Person", () => {
  /*
   * FIX-RUNDE 1 (Review): der Ausgeschieden-Lauf oben deckt nur `istAktiv` ab — er reicht immer
   * DIE PRIVILEGIERTE Person herein, nur mit `aktivBis` in der Vergangenheit. Fuer die vier
   * "zugewiesener BuFDi"-Aktionen `zuruecksetzen`/`fertig`/`wiederaufnehmen` (und `starten`, dort
   * bereits einzeln getestet) bleibt die IDENTITAETSPRUEFUNG `p.id === a.zugewiesenAn` damit
   * ungeprueft: ersetzte man sie durch blosses `istAktiv(p, heute)`, blieb die gesamte Suite gruen
   * — jeder aktive BuFDi haette die Aufgaben aller anderen zuruecksetzen, fertigmelden und
   * wiederaufnehmen koennen. Dieser Lauf schliesst die Luecke mit demselben Bauplan wie der
   * Ausgeschieden-Lauf: eine AKTIVE, aber an dieser Aufgabe UNBETEILIGTE Person (Rolle `bufdi`,
   * fremde `id`) darf KEINEN der sechzig Faelle.
   */
  it.each(STATUS_WERTE.flatMap((von) => AKTIONEN.map((aktion) => [von, aktion] as const)))(
    "%s × %s — unbeteiligt, aber aktiv → immer abgelehnt",
    (von, aktion) => {
      const a = akteure();
      const unbeteiligt = person("bufdi", { id: "unbeteiligt-id" });
      const t = aufgabe({ status: von, erstellerId: a.ersteller.id, zugewiesenAn: a.bufdi.id, prueferId: a.pruefer.id });
      const ergebnis = uebergang(t, aktion, akteur(unbeteiligt), HEUTE);
      expect(ergebnis.erlaubt).toBe(false);
      if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
    },
  );

  /*
   * DIE ZWEITE BETREIBERKLAUSEL AUS `darfFreigeben` (zugang.ts): der ZUGEWIESENE gibt seine
   * eigene Fremdaufgabe nicht frei, auch wenn er aktiv ist und selbst gar nicht `pruefer_id`
   * trifft. Ohne einen eigenen Fall dafuer waere dieser Zweig in `uebergang` (Zeile
   * `freigabe_offen` × `freigeben`) nirgends verdrahtet geprueft — der 60-Zellen-Lauf oben prueft
   * `unbeteiligt-id`, nicht `a.bufdi.id` selbst, faende diese Luecke also nicht.
   */
  it("freigeben durch den zugewiesenen aktiven BuFDi: abgelehnt, auch wenn er nicht Pruefer ist", () => {
    const a = akteure();
    const t = aufgabe({
      status: "freigabe_offen",
      erstellerId: a.ersteller.id,
      zugewiesenAn: a.bufdi.id,
      prueferId: a.pruefer.id,
      istSelbst: false,
    });
    const ergebnis = uebergang(t, "freigeben", akteur(a.bufdi), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
    if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
  });
});

describe("Sonderregel 1 — Selbstaufgaben nehmen die Kurzstrecke bei 'fertig'", () => {
  it("Fremdaufgabe: in_arbeit -> freigabe_offen", () => {
    const a = akteure();
    const t = aufgabe({ status: "in_arbeit", zugewiesenAn: a.bufdi.id, istSelbst: false });
    const ergebnis = uebergang(t, "fertig", akteur(a.bufdi), HEUTE);
    expect(ergebnis).toMatchObject({ erlaubt: true, wirkung: "aendern", nach: "freigabe_offen" });
  });

  it("Selbstaufgabe: in_arbeit -> abgeschlossen, OHNE freigabe_offen zu durchlaufen", () => {
    const a = akteure();
    const t = aufgabe({ status: "in_arbeit", zugewiesenAn: a.bufdi.id, erstellerId: a.bufdi.id, istSelbst: true, prueferId: null });
    const ergebnis = uebergang(t, "fertig", akteur(a.bufdi), HEUTE);
    expect(ergebnis).toMatchObject({ erlaubt: true, wirkung: "aendern", nach: "abgeschlossen" });
  });
});

describe("Sonderregel 2 — zurueckziehen geht NUR aus 'eingegangen'", () => {
  it.each(STATUS_WERTE.filter((s) => s !== "eingegangen"))("aus %s: abgelehnt", (status) => {
    const a = akteure();
    const t = aufgabe({ status, erstellerId: a.ersteller.id });
    const ergebnis = uebergang(t, "zurueckziehen", akteur(a.ersteller), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
    if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
  });

  it("aus eingegangen: die Erstellerin darf zurueckziehen — Loeschung, kein Zielzustand", () => {
    const a = akteure();
    const t = aufgabe({ status: "eingegangen", erstellerId: a.ersteller.id });
    expect(uebergang(t, "zurueckziehen", akteur(a.ersteller), HEUTE)).toEqual({ erlaubt: true, wirkung: "loeschen" });
  });

  it("aus eingegangen: die Koordination darf ebenfalls zurueckziehen, auch als Nicht-Erstellerin", () => {
    const a = akteure();
    const t = aufgabe({ status: "eingegangen", erstellerId: a.ersteller.id });
    expect(uebergang(t, "zurueckziehen", akteur(a.koordination, true), HEUTE)).toEqual({ erlaubt: true, wirkung: "loeschen" });
  });

  it("aus eingegangen: ein Dritter (weder Erstellerin noch Koordination) darf nicht zurueckziehen", () => {
    const a = akteure();
    const dritte = person("auftrag");
    const t = aufgabe({ status: "eingegangen", erstellerId: a.ersteller.id });
    const ergebnis = uebergang(t, "zurueckziehen", akteur(dritte), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
  });
});

describe("Sonderregel 3 — umverteilen raeumt die Planung (Wirkung, kein Zielzustand)", () => {
  it("planLoeschen ist true bei umverteilen", () => {
    const a = akteure();
    const t = aufgabe({ status: "verteilt", planDatum: "2026-08-14", planUhrzeit: "09:00", planRang: 2 });
    const ergebnis = uebergang(t, "umverteilen", akteur(a.koordination, true), HEUTE);
    expect(ergebnis).toMatchObject({ erlaubt: true, wirkung: "aendern", nach: "verteilt", planLoeschen: true });
  });

  /*
   * Ueber `ERLAUBTE_UEBERGAENGE` selbst iteriert, NICHT ueber `AKTIONEN` gefiltert mit einem
   * fruehen `return` fuer den Nichttreffer (`zurueckziehen`, das nicht "aendern" ist): ein `return`
   * vor der `expect`-Zeile waere ein GRUENER TEST, DER NICHTS GEPRUEFT HAT — genau die Form, die
   * Aufgabe 7 schon einmal eine ganze Suite gruen liess, obwohl der Mechanismus fehlte. Diese Liste
   * hat nur "aendern"-Eintraege ausser `umverteilen`, jede Zeile fuehrt also zu einer echten
   * Zusicherung.
   */
  const ANDERE_AENDERNDE_UEBERGAENGE = ERLAUBTE_UEBERGAENGE.filter(
    (e): e is ErwarteterUebergang & { wirkung: "aendern" } => e.wirkung === "aendern" && e.aktion !== "umverteilen",
  );

  it.each(ANDERE_AENDERNDE_UEBERGAENGE.map((e) => [e.aktion, e] as const))(
    "planLoeschen ist false bei jeder anderen erlaubten Aktion (%s)",
    (aktion, erwartet) => {
      const a = akteure();
      const p = privilegiert(aktion, a);
      const t = aufgabe({ status: erwartet.von, erstellerId: a.ersteller.id, zugewiesenAn: a.bufdi.id, prueferId: a.pruefer.id });
      const ergebnis = uebergang(t, aktion, akteurImRaster(p, a), HEUTE);
      expect(ergebnis).toMatchObject({ erlaubt: true, planLoeschen: false });
    },
  );
});

describe("Berechtigung je erlaubtem Uebergang — die vorgesehene Rolle darf, andere nicht", () => {
  /*
   * EINSCHLIESSLICH DER KOORDINATION DORT, WO SIE AUSDRUECKLICH NICHT DARF (Brief-Vorgabe):
   * fremde Plaene aendern (einplanen) und eine Aufgabe freigeben, die ihr selbst zugewiesen ist.
   */
  it("Koordination darf NICHT einplanen — das ist Sache des zugewiesenen BuFDi (fremde Plaene)", () => {
    const a = akteure();
    const t = aufgabe({ status: "verteilt", zugewiesenAn: a.bufdi.id });
    const ergebnis = uebergang(t, "einplanen", akteur(a.koordination, true), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("Koordination darf eine ihr selbst zugewiesene Fremdaufgabe NICHT freigeben", () => {
    const a = akteure();
    const t = aufgabe({ status: "freigabe_offen", erstellerId: a.ersteller.id, zugewiesenAn: a.koordination.id, prueferId: a.ersteller.id, istSelbst: false });
    const ergebnis = uebergang(t, "freigeben", akteur(a.koordination, true), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
  });

  it("ein fremder BuFDi darf eine nicht ihm zugewiesene Aufgabe nicht starten", () => {
    const a = akteure();
    const anderer = person("bufdi");
    const t = aufgabe({ status: "verteilt", zugewiesenAn: a.bufdi.id });
    expect(uebergang(t, "starten", akteur(anderer), HEUTE).erlaubt).toBe(false);
  });

  it("ein Dritter (weder Pruefer noch Koordination) darf nicht zurueckweisen", () => {
    const a = akteure();
    const dritter = person("auftrag");
    const t = aufgabe({ status: "freigabe_offen", prueferId: a.pruefer.id });
    expect(uebergang(t, "zurueckweisen", akteur(dritter), HEUTE).erlaubt).toBe(false);
  });

  it("auftrag OHNE Koordinationsgruppe darf nicht verteilen", () => {
    const a = akteure();
    const t = aufgabe({ status: "eingegangen" });
    expect(uebergang(t, "verteilen", akteur(a.ersteller), HEUTE).erlaubt).toBe(false);
  });

  it("ein BuFDi darf nicht umverteilen", () => {
    const a = akteure();
    const t = aufgabe({ status: "verteilt", zugewiesenAn: a.bufdi.id });
    expect(uebergang(t, "umverteilen", akteur(a.bufdi), HEUTE).erlaubt).toBe(false);
  });
});

describe("jeder ablehnende Grund ist nicht leer", () => {
  it("bei unbekannter Status-Aktion-Kombination", () => {
    const a = akteure();
    const t = aufgabe({ status: "abgeschlossen" });
    const ergebnis = uebergang(t, "starten", akteur(a.bufdi), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
    if (!ergebnis.erlaubt) expect(ergebnis.grund).not.toBe("");
  });

  it("bei fehlender Berechtigung", () => {
    const a = akteure();
    const fremd = person("bufdi");
    const t = aufgabe({ status: "verteilt", zugewiesenAn: a.bufdi.id });
    const ergebnis = uebergang(t, "starten", akteur(fremd), HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
    if (!ergebnis.erlaubt) expect(ergebnis.grund).not.toBe("");
  });

  it("die beiden Gruende unterscheiden sich (Zustand vs. Person) — wichtig fuer das Formularfeld", () => {
    const a = akteure();
    const zustandsFall = uebergang(aufgabe({ status: "abgeschlossen" }), "starten", akteur(a.bufdi), HEUTE);
    const personFall = uebergang(
      aufgabe({ status: "verteilt", zugewiesenAn: a.bufdi.id }),
      "starten",
      akteur(person("bufdi")),
      HEUTE,
    );
    expect(zustandsFall.erlaubt).toBe(false);
    expect(personFall.erlaubt).toBe(false);
    if (zustandsFall.erlaubt || personFall.erlaubt) throw new Error("unreachable");
    expect(zustandsFall.grund).not.toBe(personFall.grund);
  });
});

describe("anfangsZustand — einstellen ist keine Aktion, aber beide Ausprägungen zaehlen mit", () => {
  it("fremd, durch auftrag: eingegangen, nicht zugewiesen", () => {
    const ersteller = person("auftrag");
    expect(anfangsZustand(akteur(ersteller), false, HEUTE)).toEqual({
      erlaubt: true,
      status: "eingegangen",
      zugewiesenAn: null,
      istSelbst: false,
    });
  });

  it("fremd, durch die Koordination: eingegangen, nicht zugewiesen", () => {
    const ersteller = person("auftrag");
    expect(anfangsZustand(akteur(ersteller, true), false, HEUTE)).toEqual({
      erlaubt: true,
      status: "eingegangen",
      zugewiesenAn: null,
      istSelbst: false,
    });
  });

  /*
   * VIER KOMBINATIONEN STATT DREI ROLLEN (Quellenwechsel 2026-08-15): `rolle` und `istKoordination`
   * sind unabhaengige Achsen geworden, also laeuft die Schleife ueber beide. „Jede Rolle darf fuer
   * sich selbst einstellen" heisst jetzt ausdruecklich auch: eine BuFDi-Zeile MIT
   * Koordinationsgruppe und eine auftrag-Zeile OHNE.
   */
  it("fuer sich selbst, jede Kombination: verteilt, an sich selbst, istSelbst true", () => {
    for (const [rolle, istKoordination] of [
      ["auftrag", false],
      ["auftrag", true],
      ["bufdi", false],
      ["bufdi", true],
    ] as const) {
      const ersteller = person(rolle);
      expect(anfangsZustand(akteur(ersteller, istKoordination), true, HEUTE)).toEqual({
        erlaubt: true,
        status: "verteilt",
        zugewiesenAn: ersteller.id,
        istSelbst: true,
      });
    }
  });

  it("fremd, durch bufdi: abgelehnt — nur auftrag oder die Koordination stellen fuer andere ein", () => {
    const bufdi = person("bufdi");
    const ergebnis = anfangsZustand(akteur(bufdi), false, HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
    if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
  });

  it("ausgeschiedene Person, fremd: abgelehnt", () => {
    const ex = person("auftrag", { aktivBis: "2026-08-01" });
    expect(anfangsZustand(akteur(ex), false, HEUTE).erlaubt).toBe(false);
  });

  it("ausgeschiedene Person, fuer sich selbst: abgelehnt", () => {
    const ex = person("bufdi", { aktivBis: "2026-08-01" });
    const ergebnis = anfangsZustand(akteur(ex), true, HEUTE);
    expect(ergebnis.erlaubt).toBe(false);
    if (!ergebnis.erlaubt) expect(ergebnis.grund.length).toBeGreaterThan(0);
  });
});
