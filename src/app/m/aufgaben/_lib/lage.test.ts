import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { aufgaben, personen, routinen, type PersonRow, type Rolle } from "../_db/schema";
import { ANLASS_ARTEN, type AnlassArt } from "./anzeige";
import { wochenTage } from "./datum";
import { lage, type Anlass } from "./lage";
import type { Akteur } from "./zugang";

/*
 * DER ZUSTANDS-SELEKTOR, ERSCHOEPFEND (Oberflaechen-Spec 2026-08-16 §11.1) — jede Sprosse jeder
 * der drei Leitern, der Leerfall je Rolle, der Gleichstandsfall, der Wochenendfall und die
 * Partitionszusage aus §4.1.
 *
 * FESTE `heute`-ARGUMENTE, NIE DIE SYSTEMUHR. Das ist derselbe Grund, aus dem §11.2 den
 * Wochenendfall AUS dem e2e heraushaelt: ein Test, dessen Ergebnis vom Wochentag des Laufs
 * abhaengt, kippt zwischen zwei Laeufen, ohne dass sich Daten geaendert haetten — dieselbe Familie
 * wie die Fallen 10 und 11 aus `CLAUDE.md`.
 *
 * ECHTE TESTDATENBANK STATT REINER FIXTURLISTEN: `lage()` laeuft ueber `alleAufgaben(db)`,
 * `freigabeDaten(db, …)` und `aktivePersonen(db, heute)` — genau die Ladepfade, deren Auswahl §9/S1
 * traegt („`EinstiegKoordination` liest `alleAufgaben(db)` UNGEFILTERT, das Praedikat ist also
 * nicht blind fuer die Zeilen, die es finden soll"). Ein Test gegen handgereichte Arrays haette
 * genau diese Zusage nicht geprueft, sondern vorausgesetzt.
 */

const MONTAG = "2026-08-17";
const TAGE = wochenTage(MONTAG); // Mo 17.08. .. Fr 21.08. — KW 34
const DIENSTAG = "2026-08-18";
const SONNTAG = "2026-08-23";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(() => t.schliessen());

function legePerson(sub: string, rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: (extra.initialen ?? sub.slice(0, 2)).toUpperCase(),
      rolle,
      sollMinutenTag: extra.sollMinutenTag ?? 468,
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert>) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      erstellerId: extra.erstellerId as string,
      status: "eingegangen",
      faelligAm: "2026-08-27",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

/** Die Besetzung der Skizzen aus §5 — Rike koordiniert, Malte stellt ein, Alina fuehrt aus. */
function besetzung() {
  const rike = legePerson("rike", "auftrag", { name: "Rike" });
  const malte = legePerson("malte", "auftrag", { name: "Malte" });
  const alina = legePerson("alina", "bufdi", { name: "Alina" });
  return { rike, malte, alina };
}

const arten = (anlaesse: Anlass[]): AnlassArt[] => anlaesse.map((a) => a.art);

// ═══ Koordination ═════════════════════════════════════════════════════════════════════════════

describe("lage — die Koordinationsleiter (§4.2)", () => {
  it("Rang 1: eine offene Aufgabe bei einer nicht mehr aktiven Person fuehrt", () => {
    const { rike, malte } = besetzung();
    const doerte = legePerson("doerte", "bufdi", { name: "Dörte", aktivBis: "2026-08-01" });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: doerte.id, status: "verteilt" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("koordOhneTraeger");
    expect(l.fuehrung.einzeln).toBe(true);
  });

  it("Rang 2 schlaegt Rang 3: eine ueberfaellige Posteingangszeile steht vor einer fristgerechten", () => {
    const { rike, malte } = besetzung();
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" });
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-10" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(arten(l.anlaesse)).toEqual(["koordPosteingangUeberfaellig", "koordPosteingang"]);
  });

  it("Rang 3: der Posteingang fuehrt, wenn Rang 1 und 2 leer sind (Rikes Lage, §5.2)", () => {
    const { rike, malte } = besetzung();
    legeAufgabe({ erstellerId: malte.id, titel: "Verbandskästen im Fahrzeugpark prüfen" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("koordPosteingang");
    expect(l.fuehrung.zeilen[0]!.titel).toBe("Verbandskästen im Fahrzeugpark prüfen");
  });

  /*
   * RANG 4 SPEIST SICH AUS `freigabeDaten`, NICHT AUS EINEM NACHGEBAUTEN „status ===
   * freigabe_offen" (§10 Prueffrage 2): die Ladefunktion filtert serverseitig ueber `darfFreigeben`
   * samt beider Vier-Augen-Ausschluesse. Die Karte kann die Menge damit nicht erweitern.
   */
  it("Rang 4: eine offene Freigabe in Vertretung", () => {
    const { rike, malte, alina } = besetzung();
    const tomke = legePerson("tomke", "auftrag", { name: "Tomke" });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: tomke.id,
      status: "freigabe_offen",
    });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("koordFreigabeOffen");
  });

  it("Rang 5a und 5b sind getrennt — `verteilt` traegt eine Zustandsaktion, `in_arbeit` nicht", () => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "verteilt",
      faelligAm: "2026-08-10",
    });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      faelligAm: "2026-08-10",
    });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(arten(l.anlaesse)).toEqual(["koordUeberfaelligVerteilt", "koordUeberfaelligInArbeit"]);
  });

  it("Rang 6: zurueckgewiesen", () => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("koordZurueckgewiesen");
  });

  /*
   * EINE UEBERFAELLIGE, ZURUECKGEWIESENE AUFGABE FAELLT AUF RANG 6, NICHT AUF 5a/5b: Rang 5
   * verlangt `verteilt`/`in_arbeit`/`freigabe_offen`. Ohne diese Zeile waere „hoechstens eine
   * Sprosse" fuer den haeufigsten Ueberschneidungsfall des Moduls unbelegt.
   */
  it("eine ueberfaellige zurueckgewiesene Aufgabe faellt genau auf Rang 6", () => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "zurueckgewiesen",
      faelligAm: "2026-08-10",
    });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(arten(l.anlaesse)).toEqual(["koordZurueckgewiesen"]);
  });

  it("Leerfall: die Ruhe-Belegung, ohne zweiten Rueckgabeweg", () => {
    const { rike } = besetzung();
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.anlaesse).toEqual([]);
    expect(l.fuehrung.art).toBe("koordRuhe");
    expect(l.fuehrung.zeilen).toEqual([]);
    expect(l.fuehrung.einzeln).toBe(false);
    expect(l.alsNaechstes).toBeNull();
    expect(l.zonen).toEqual([]);
  });
});

// ═══ BuFDi ════════════════════════════════════════════════════════════════════════════════════

describe("lage — die BuFDi-Leiter (§4.2)", () => {
  it("Rang 1: ueberfaellig schlaegt zurueckgewiesen", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "zurueckgewiesen",
      faelligAm: "2026-08-10",
    });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("bufdiUeberfaellig");
  });

  it("Rang 2: zurueckgewiesen fuehrt, wenn nichts ueberfaellig ist (Alinas Lage, §5.1)", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "zurueckgewiesen",
      titel: "Fahrzeugcheck Rettungswagen 3",
      faelligAm: DIENSTAG,
      planDatum: DIENSTAG,
    });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "verteilt",
      titel: "Standwache Blutspendetermin",
      faelligAm: MONTAG,
      planDatum: MONTAG,
    });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("bufdiZurueckgewiesen");
    expect(l.fuehrung.zeilen[0]!.titel).toBe("Fahrzeugcheck Rettungswagen 3");
    // §4.2: Alinas `anlaesse[1]` ist Rang 5 (`heuteOffen`) — die Standwache.
    expect(l.alsNaechstes?.art).toBe("bufdiHeuteOffen");
  });

  it("Rang 3: in Bearbeitung", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      planDatum: MONTAG,
    });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("bufdiInArbeit");
  });

  it("Rang 5: heute eingeplant und verteilt", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "verteilt",
      planDatum: MONTAG,
    });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("bufdiHeuteOffen");
  });

  it("Rang 6: verteilt, aber in keinem Tag", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt" });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("bufdiWartetAufEinplanung");
  });

  it("Leerfall: die Ruhe-Belegung", () => {
    const { alina } = besetzung();
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("bufdiRuhe");
    expect(l.alsNaechstes).toBeNull();
  });
});

describe("lage — der Wochenendfall (§4.2, §5.4, §11.1)", () => {
  /*
   * `kein_arbeitstag` VERDRAENGT RANG 5 UND 6, NICHT RANG 1–3. Eine legitime Zustandsaktion zu
   * verstecken, weil Sonntag ist, waere eine Behauptung ueber die Arbeitszeit dieser Person, die
   * das Modul nicht kennt. Was das Wochenende aendert, ist die Aussage ueber den PLAN.
   */
  it("am Sonntag verdraengt `kein_arbeitstag` die Raenge 5 und 6", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt" });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "verteilt",
      planDatum: SONNTAG,
    });
    const l = lage(t.db, akteur(alina), SONNTAG, TAGE);
    expect(arten(l.anlaesse)).toEqual(["bufdiKeinArbeitstag"]);
    expect(l.fuehrung.art).toBe("bufdiKeinArbeitstag");
    expect(l.fuehrung.zeilen).toEqual([]);
  });

  it("am Sonntag behaelt Rang 1 die Fuehrung, `kein_arbeitstag` wird der zweite Anlass (§5.4)", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      titel: "Sanitätswache Stadtfest vorbereiten",
      faelligAm: "2026-08-14",
      planDatum: "2026-08-14",
    });
    const l = lage(t.db, akteur(alina), SONNTAG, TAGE);
    expect(arten(l.anlaesse)).toEqual(["bufdiUeberfaellig", "bufdiKeinArbeitstag"]);
    expect(l.alsNaechstes?.art).toBe("bufdiKeinArbeitstag");
  });

  it("die Achse traegt am Sonntag den Vorbehalt „Abgeschlossene Woche“ (Regel V)", () => {
    const { alina } = besetzung();
    const l = lage(t.db, akteur(alina), SONNTAG, TAGE);
    expect(l.achsenVorbehalt?.abgeschlosseneWoche).toBe(true);
  });

  it("am Montag derselben Woche traegt sie ihn nicht", () => {
    const { alina } = besetzung();
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.achsenVorbehalt?.abgeschlosseneWoche).toBe(false);
  });

  it("die Fusszeile der Achse nennt, was in keiner Tagesspalte steht (§5.4)", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      titel: "Sanitätswache Stadtfest vorbereiten",
      planDatum: "2026-08-14",
    });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      titel: "Ohne Termin",
      planDatum: null,
    });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.achsenVorbehalt?.ohnePlatz.map((a) => a.titel).sort()).toEqual([
      "Ohne Termin",
      "Sanitätswache Stadtfest vorbereiten",
    ]);
  });

  it("nur die BuFDi-Ansicht hat ueberhaupt einen Achsenvorbehalt", () => {
    const { rike, malte } = besetzung();
    expect(lage(t.db, akteur(rike, true), MONTAG, TAGE).achsenVorbehalt).toBeNull();
    expect(lage(t.db, akteur(malte), MONTAG, TAGE).achsenVorbehalt).toBeNull();
  });
});

// ═══ Auftraggeber ═════════════════════════════════════════════════════════════════════════════

describe("lage — die Auftraggeberleiter (§4.2)", () => {
  it("Rang 1: die eigene offene Freigabe fuehrt", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "freigabe_offen",
    });
    const l = lage(t.db, akteur(malte), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("auftragFreigabe");
  });

  it("Rang 2: ein eigener ueberfaelliger Auftrag", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      faelligAm: "2026-08-10",
    });
    const l = lage(t.db, akteur(malte), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("auftragUeberfaellig");
  });

  it("Rang 3: noch nicht verteilt (Maltes Lage, §5.3)", () => {
    const { malte } = besetzung();
    legeAufgabe({ erstellerId: malte.id, titel: "Verbandskästen im Fahrzeugpark prüfen" });
    const l = lage(t.db, akteur(malte), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("auftragUnverteilt");
    // §5.3: Maltes Restmenge ist leer — die ALS-NAECHSTES-Zeile traegt den Negativsatz.
    expect(l.alsNaechstes?.art).toBe("auftragNegativ");
    expect(l.alsNaechstes?.zeilen).toEqual([]);
  });

  /*
   * FUER DEN AUFTRAGGEBER EXISTIERT EBENE 4 NICHT (§3.4, R3-Ausnahmetabelle): „Eigene Auftraege"
   * zeigt jede eigene Zeile ungedeckelt, jede Zone waere eine wortwoertliche Wiederholung.
   */
  it("bildet fuer keinen Anlass eine Zone", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "in_arbeit", faelligAm: "2026-08-09" });
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" });
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-28" });
    const l = lage(t.db, akteur(malte), MONTAG, TAGE);
    expect(arten(l.anlaesse)).toEqual(["auftragUeberfaellig", "auftragUnverteilt"]);
    expect(l.zonen).toEqual([]);
  });

  it("Leerfall: die Ruhe-Belegung", () => {
    const { malte } = besetzung();
    const l = lage(t.db, akteur(malte), MONTAG, TAGE);
    expect(l.fuehrung.art).toBe("auftragRuhe");
  });
});

// ═══ Die Regeln, die fuer alle drei Leitern gelten ════════════════════════════════════════════

describe("lage — Gleichstand und die totale Ordnung (§4.1, §4.3)", () => {
  /*
   * ZEHN GLEICH DRINGEND: die Karte nennt die ZAHL, nicht eine Aufgabe. Der Selektor traegt
   * dafuer nichts weiter bei als `einzeln === false` — die Auswahl „keine wird herausgegriffen"
   * trifft die Karte, und sie kann sie nur treffen, wenn der Selektor die Zahl mitliefert statt
   * einer bereits getroffenen Auswahl.
   */
  it("zehn gleiche Fristen: ein Anlass mit zehn Zeilen, `einzeln` falsch", () => {
    const { rike, malte } = besetzung();
    for (let i = 0; i < 10; i++) {
      legeAufgabe({ erstellerId: malte.id, titel: `A${i}`, faelligAm: "2026-08-27" });
    }
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.zeilen).toHaveLength(10);
    expect(l.fuehrung.einzeln).toBe(false);
  });

  /*
   * DIE ORDNUNG IST TOTAL: `faelligAm` → `prioritaet` → `erstelltAm` → `id`. Ein „unentschieden"
   * existiert nicht, und die Karte muss nie raten. Geprueft wird auf der Stufe, die man am
   * leichtesten vergisst — gleiche Frist, verschiedene Prioritaet.
   */
  it("sortiert nach Frist, dann Prioritaet (hoch vor mittel vor niedrig)", () => {
    const { rike, malte } = besetzung();
    legeAufgabe({ erstellerId: malte.id, titel: "niedrig", prioritaet: "niedrig", faelligAm: "2026-08-27" });
    legeAufgabe({ erstellerId: malte.id, titel: "hoch", prioritaet: "hoch", faelligAm: "2026-08-27" });
    legeAufgabe({ erstellerId: malte.id, titel: "mittel", prioritaet: "mittel", faelligAm: "2026-08-27" });
    legeAufgabe({ erstellerId: malte.id, titel: "frueher", prioritaet: "niedrig", faelligAm: "2026-08-26" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.zeilen.map((a) => a.titel)).toEqual(["frueher", "hoch", "mittel", "niedrig"]);
  });

  it("bricht den Gleichstand zuletzt ueber die id, nie zufaellig", () => {
    const { rike, malte } = besetzung();
    const a = legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" });
    const b = legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    const erwartet = [a.id, b.id].sort();
    expect(l.fuehrung.zeilen.map((z) => z.id)).toEqual(erwartet);
  });
});

describe("lage — die Partitionszusage (§4.1 Bauregel 4, §11.1)", () => {
  /**
   * Ein Bestand, der jede Sprosse jeder Leiter beruehrt UND die drei Gegenbeispiele aus §4.1
   * enthaelt, die belegen, warum „genau eine Sprosse" falsch waere.
   */
  function vollerBestand() {
    const { rike, malte, alina } = besetzung();
    const doerte = legePerson("doerte", "bufdi", { name: "Dörte", aktivBis: "2026-08-01" });
    const tomke = legePerson("tomke", "auftrag", { name: "Tomke" });
    return {
      rike,
      malte,
      alina,
      zeilen: [
        legeAufgabe({ erstellerId: malte.id, zugewiesenAn: doerte.id, status: "verteilt" }),
        legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-10" }),
        legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" }),
        legeAufgabe({
          erstellerId: malte.id,
          zugewiesenAn: alina.id,
          prueferId: tomke.id,
          status: "freigabe_offen",
        }),
        legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt", faelligAm: "2026-08-10" }),
        legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "in_arbeit", faelligAm: "2026-08-11" }),
        legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" }),
        // GEGENBEISPIEL 1 (§4.1): `freigabe_offen` trifft in der BuFDi-Leiter keine Sprosse.
        legeAufgabe({
          erstellerId: malte.id,
          zugewiesenAn: alina.id,
          prueferId: malte.id,
          status: "freigabe_offen",
          planDatum: "2026-08-19",
        }),
        // GEGENBEISPIEL 2: `verteilt` mit planDatum Mittwoch ist weder heuteOffen noch
        // wartetAufEinplanung.
        legeAufgabe({
          erstellerId: malte.id,
          zugewiesenAn: alina.id,
          status: "verteilt",
          planDatum: "2026-08-19",
        }),
        // GEGENBEISPIEL 3: jede abgeschlossene Aufgabe faellt ohnehin durch.
        legeAufgabe({
          erstellerId: malte.id,
          zugewiesenAn: alina.id,
          status: "abgeschlossen",
          planDatum: "2026-08-18",
        }),
      ],
    };
  }

  it.each(["koordination", "bufdi", "auftrag"] as const)(
    "%s: keine Aufgabe steht in zwei Sprossen",
    (ansicht) => {
      const { rike, malte, alina } = vollerBestand();
      const wer = ansicht === "koordination" ? akteur(rike, true) : ansicht === "bufdi" ? akteur(alina) : akteur(malte);
      const l = lage(t.db, wer, MONTAG, TAGE);
      expect(l.ansicht).toBe(ansicht);
      const alleIds = l.anlaesse.flatMap((an) => an.zeilen.map((z) => z.id));
      expect(new Set(alleIds).size).toBe(alleIds.length);
    },
  );

  /*
   * „GENAU EINE SPROSSE" WAERE FALSCH (§4.1, §12.1/U-1) — und dieser Test haelt genau das fest,
   * statt es zu behaupten: die drei Gegenbeispiele fallen in KEINE Sprosse der BuFDi-Leiter und
   * stehen trotzdem auf der Flaeche der Rolle (Tagesspalte bzw. Achsen-Fusszeile). Waere die Regel
   * „genau eine", muesste dieser Test rot sein.
   */
  it("bufdi: die Restmenge ist nicht leer — und jede ihrer Zeilen steht auf der Flaeche der Rolle", () => {
    const { alina } = vollerBestand();
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    const eingeordnet = new Set(l.anlaesse.flatMap((an) => an.zeilen.map((z) => z.id)));
    const meine = t.db.select().from(aufgaben).all().filter((a) => a.zugewiesenAn === alina.id);
    const rest = meine.filter((a) => !eingeordnet.has(a.id));

    expect(rest.length).toBeGreaterThan(0);

    // DIE GESCHLOSSENE AUFZAEHLUNG AUS §4.1, als Liste statt als Zusage: Tagesspalte der Achse ∪
    // Achsen-Fusszeile ∪ `/archiv`. Wer ein Praedikat spaeter weiter fasst, bricht hier laut.
    const inDerAchse = (a: (typeof rest)[number]) => a.planDatum !== null && TAGE.includes(a.planDatum);
    const inDerFusszeile = new Set(l.achsenVorbehalt!.ohnePlatz.map((a) => a.id));
    const imArchiv = (a: (typeof rest)[number]) => a.status === "abgeschlossen";
    const unsichtbar = rest.filter(
      (a) => !inDerAchse(a) && !inDerFusszeile.has(a.id) && !imArchiv(a),
    );
    expect(unsichtbar.map((a) => `${a.titel}/${a.status}`)).toEqual([]);
  });
});

describe("lage — Regel R3: Karte oder Zone, nie keins und nie beides (§3.4, §11.1)", () => {
  /** §3.4: welche Anlaesse bereits die Flaeche der Rolle SIND — keine Auslegungsfrage, eine Liste. */
  const R3_AUSNAHMEN: Record<string, AnlassArt[]> = {
    koordination: [],
    bufdi: ["bufdiInArbeit", "bufdiKeinArbeitstag", "bufdiHeuteOffen"],
    auftrag: ["auftragFreigabe", "auftragUeberfaellig", "auftragUnverteilt"],
  };

  it.each(["koordination", "bufdi", "auftrag"] as const)(
    "%s: jeder nicht-leere Anlass ist Karte, Zone oder benannte Ausnahme",
    (ansicht) => {
      const { rike, malte, alina } = besetzung();
      const doerte = legePerson("doerte", "bufdi", { name: "Dörte", aktivBis: "2026-08-01" });
      legeAufgabe({ erstellerId: malte.id, zugewiesenAn: doerte.id, status: "verteilt" });
      legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-10" });
      legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" });
      legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-28" });
      legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" });
      legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt", planDatum: MONTAG });
      legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt" });

      const wer = ansicht === "koordination" ? akteur(rike, true) : ansicht === "bufdi" ? akteur(alina) : akteur(malte);
      const l = lage(t.db, wer, MONTAG, TAGE);
      const zonenArten = new Set(arten(l.zonen));
      const ausnahmen = new Set(R3_AUSNAHMEN[ansicht]);

      for (const [i, an] of l.anlaesse.entries()) {
        if (an.zeilen.length === 0) continue;
        const istKarte = i === 0;
        const istZone = zonenArten.has(an.art);
        const istAusnahme = ausnahmen.has(an.art);
        // Position 1 mit GENAU EINER Zeile: Karte, und keine Zone wiederholt sie.
        if (istKarte && an.einzeln) {
          expect(istZone, `${an.art} wiederholt die Karte`).toBe(false);
        }
        expect(istKarte || istZone || istAusnahme, `${an.art} steht nirgends`).toBe(true);
      }
    },
  );

  it("bei n > 1 bildet der fuehrende Anlass zusaetzlich eine Zone", () => {
    const { rike, malte } = besetzung();
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-27" });
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-28" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.fuehrung.einzeln).toBe(false);
    expect(arten(l.zonen)).toEqual(["koordPosteingang"]);
  });

  it("eine leere Zone ist strukturell ausgeschlossen", () => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    for (const zone of l.zonen) {
      expect(zone.zeilen.length).toBeGreaterThan(0);
    }
  });
});

describe("lage — die Zeile ALS NAECHSTES (§4.2, §11.1)", () => {
  it("ist `anlaesse[1]`, wenn es einen zweiten Anlass gibt", () => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.alsNaechstes).toBe(l.anlaesse[1]);
  });

  it.each([
    ["koordination", "koordNegativ"],
    ["bufdi", "bufdiNegativ"],
    ["auftrag", "auftragNegativ"],
  ] as const)("%s: bei leerer Restmenge der Negativsatz der Rolle", (ansicht, art) => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id });
    const wer = ansicht === "koordination" ? akteur(rike, true) : ansicht === "bufdi" ? akteur(alina) : akteur(malte);
    if (ansicht === "bufdi") {
      legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt" });
    }
    const l = lage(t.db, wer, MONTAG, TAGE);
    expect(l.anlaesse).toHaveLength(1);
    expect(l.alsNaechstes?.art).toBe(art);
    // BEIDE ZWEIGE LIEFERN EINEN `Anlass`, KEINEN STRING (§4.1, §12.4) — sonst mischte die
    // Zusage aus §11.1 eine Struktur mit einem Satz.
    expect(l.alsNaechstes?.zeilen).toEqual([]);
  });

  it("entfaellt im Ruhefall — es gibt kein „danach“", () => {
    const { rike } = besetzung();
    expect(lage(t.db, akteur(rike, true), MONTAG, TAGE).alsNaechstes).toBeNull();
  });
});

describe("lage — die Ansicht folgt derselben Verzweigung wie `page.tsx` (§4.1)", () => {
  it("die Gruppe schlaegt die Zeile: `bufdi` PLUS Koordinationsgruppe faellt auf `koordination`", () => {
    const { alina } = besetzung();
    expect(lage(t.db, akteur(alina, true), MONTAG, TAGE).ansicht).toBe("koordination");
  });
});

describe("lage — die Kontextzeile (§3.5)", () => {
  it("Koordination: Reihenfolge, Trennzeichen und das Nullwort", () => {
    const { rike, malte, alina } = besetzung();
    const tomke = legePerson("tomke", "auftrag", { name: "Tomke" });
    legeAufgabe({ erstellerId: malte.id, titel: "Verbandskästen" });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: tomke.id,
      status: "freigabe_offen",
      faelligAm: "2026-08-19",
    });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "in_arbeit",
      faelligAm: "2026-08-14",
    });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    expect(l.kontext).toBe(
      "1 zu verteilen · 1 wartet auf Freigabe (in Vertretung) · 1 überfällig · 1 zurückgewiesen",
    );
  });

  it("Koordination, leer: jede Null als Wort, nie als Ziffer", () => {
    const { rike } = besetzung();
    expect(lage(t.db, akteur(rike, true), MONTAG, TAGE).kontext).toBe(
      "nichts zu verteilen · nichts wartet auf Freigabe · nichts überfällig · nichts zurückgewiesen",
    );
  });

  it("BuFDi: KW, Eingeplantes, Stunden, Posteingang, Ueberfaelliges (§5.1, Alinas Zeile)", () => {
    const { malte, alina } = besetzung();
    t.db
      .insert(routinen)
      .values({
        personId: alina.id,
        titel: "Frühbesprechung",
        wochentage: 0b11111,
        uhrzeit: "08:00",
        dauerMinuten: 15,
      })
      .run();
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "verteilt",
      faelligAm: MONTAG,
      planDatum: MONTAG,
      dauerMinuten: 240,
    });
    legeAufgabe({
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      status: "zurueckgewiesen",
      faelligAm: DIENSTAG,
      planDatum: DIENSTAG,
      dauerMinuten: 45,
    });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt", dauerMinuten: 90 });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt", dauerMinuten: 20 });
    const l = lage(t.db, akteur(alina), MONTAG, TAGE);
    expect(l.kontext).toBe(
      "KW 34 · 2 Aufgaben eingeplant · 6 von 39 Std. · 2 im Posteingang · nichts überfällig",
    );
  });

  it("BuFDi am Wochenende: die KW-Marke traegt „(abgeschlossen)“ (§5.4)", () => {
    const { alina } = besetzung();
    const l = lage(t.db, akteur(alina), SONNTAG, TAGE);
    expect(l.kontext).toContain("KW 34 (abgeschlossen) ·");
  });

  it("Auftrag: Auftraege, offen, unverteilt, Freigabe (§5.3, Maltes Zeile)", () => {
    const { malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, titel: "unverteilt" });
    for (let i = 0; i < 6; i++) {
      legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "verteilt", titel: `v${i}` });
    }
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "abgeschlossen", titel: "fertig" });
    const l = lage(t.db, akteur(malte), MONTAG, TAGE);
    expect(l.kontext).toBe("8 Aufträge · 7 offen · 1 unverteilt · nichts wartet auf deine Freigabe");
  });
});

describe("lage — der Selektor liefert Daten, keine Saetze (§4.1, fuenfte Bauregel)", () => {
  /*
   * DER RIEGEL ZUM QUELLTEXT-SCAN AUS §6.6: staende die Ueberfaellig-Prosa im Selektor, haette der
   * Scan zwei Ausnahmen statt einer und fange die vierte Fassung nicht mehr. Geprueft wird die
   * STRUKTUR, nicht der Quelltext — `art` ist ein Schluessel aus `ANLASS_ARTEN`, kein Satz.
   */
  it("jede `art` ist ein Schluessel der Beschriftungstabelle", () => {
    const { rike, malte, alina } = besetzung();
    legeAufgabe({ erstellerId: malte.id, faelligAm: "2026-08-10" });
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, status: "zurueckgewiesen" });
    const l = lage(t.db, akteur(rike, true), MONTAG, TAGE);
    for (const an of [l.fuehrung, ...l.anlaesse, ...l.zonen]) {
      expect(ANLASS_ARTEN).toContain(an.art);
    }
  });
});
