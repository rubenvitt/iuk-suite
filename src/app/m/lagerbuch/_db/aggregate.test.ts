import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, lagerorte, newId } from "./schema";
import {
  bestandJeArtikel, restJeCharge, bestandJeArtikelUndLagerort,
  restJeChargeFuerArtikel, kennzahlen,
} from "../_lib/lesepfade/bestand";
import {
  bestandProLagerort, bestandProLagerortUndCharge,
} from "../_lib/domain/bestand";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER DIFFERENZTEST AUS §5.2.4.
 *
 * Jedes Aggregat schuldet einen Vergleich gegen SEINE REINE FUNKTION: derselbe
 * Zeilenbestand, einmal ueber SQL, einmal ueber die Vollladung — beide Ergebnisse
 * identisch. Die reinen Funktionen bleiben damit DIE SPEZIFIKATION und sind nicht
 * bloss Tests, die nichts mehr bewachen.
 *
 * ⚠️ ZWEI KONSTELLATIONEN SIND PFLICHT, weil ohne sie ein weggelassenes
 * `lagerort_id`-Praedikat GRUEN BLIEBE (§5.2.1, §5.19.5):
 *   1. DIESELBE chargeId gleichzeitig im Handlager UND in einem Fahrzeug
 *      (die Konstellation aus `bestand.ts:22-24`);
 *   2. ein Artikel mit Buchungen an DREI Lagerorten.
 * In einer frisch migrierten Test-DB sind Handlager- und Fahrzeugbestand sonst
 * identisch, und der Fehler ist unsichtbar.
 */

/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

const RTW1 = "rtw-1";
const RTW2 = "rtw-2";

let t: TestDb;

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-aggregate-");
  const jetzt = new Date("2026-06-15T10:00:00Z");

  t.db.insert(lagerorte).values([
    { id: RTW1, name: "RTW 1", typ: "fahrzeug", kennung: "MS-DRK-1", aktiv: true },
    { id: RTW2, name: "RTW 2", typ: "fahrzeug", kennung: "MS-DRK-2", aktiv: true },
  ]).run();

  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 20, aktiv: true, createdAt: jetzt },
    { id: "a2", name: "NaCl 500", einheit: "Fl.", fach: "B2",
      mindestbestand: 5, aktiv: true, createdAt: jetzt, bestelltAt: jetzt },
    { id: "a3", name: "Ohne Buchung", einheit: "Stk.", fach: "C3",
      mindestbestand: 0, aktiv: true, createdAt: jetzt },
    /**
     * ⚠️ DER ARTIKEL, DER DIE HANDLAGER-BINDUNG DER KPI TRAGEND MACHT.
     *
     * a1 und a2 liegen in JEDER Bezugsgroesse unter Mindestbestand — mit ihnen
     * allein blieben `unterMindest` und `nichtBestellt` auch dann gruen, wenn
     * `kennzahlen` statt `HANDLAGER_ID` das Fahrzeug oder die lagerort-
     * uebergreifende Summe rechnete. Genau die Zeile, von der §5.2.1 sagt, sie
     * „scheitert STILL", war damit unbewacht.
     *
     * a5 unterscheidet: Handlager 2 (< 5, zaehlt), RTW1 6 (>= 5, zaehlt nicht),
     * gesamt 8 (>= 5, zaehlt nicht). Handlager liefert 3, jede andere
     * Bezugsgroesse 2. `bestelltAt` bleibt ungesetzt, damit `nichtBestellt`
     * dieselbe Unterscheidung traegt (Handlager 2, sonst 1).
     */
    { id: "a5", name: "Nur im Handlager knapp", einheit: "Stk.", fach: "E5",
      mindestbestand: 5, aktiv: true, createdAt: jetzt },
  ]).run();

  t.db.insert(chargen).values([
    { id: "c1", artikelId: "a1", chargenNr: "CH-1", verfall: "2026-07", createdAt: jetzt },
    { id: "c2", artikelId: "a1", chargenNr: "CH-2", verfall: "2028-01", createdAt: jetzt },
    { id: "c3", artikelId: "a2", chargenNr: "CH-3", verfall: "2020-01", createdAt: jetzt },
    // gruen (2028-01) — a5 soll die Chargen-Zaehler NICHT veraendern.
    { id: "c5", artikelId: "a5", chargenNr: "CH-5", verfall: "2028-01", createdAt: jetzt },
  ]).run();

  const b = (artikelId: string, chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: jetzt, typ: "zugang" as const, artikelId, chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "test", referenz: null, kommentar: null,
  });

  t.db.insert(buchungen).values([
    // a1 / c1 an DREI Lagerorten — die Konstellation, die das Scoping noetig macht.
    b("a1", "c1", HANDLAGER_ID, 10),
    b("a1", "c1", HANDLAGER_ID, -3),
    b("a1", "c1", RTW1, 4),
    b("a1", "c1", RTW2, 1),
    // a1 / c2 nur im Handlager
    b("a1", "c2", HANDLAGER_ID, 5),
    // a2 / c3 nur im Fahrzeug — der Handlager-Bestand ist 0 UND es fehlt die Zeile
    b("a2", "c3", RTW1, 2),
    // a5: im Handlager UNTER, ueber alle Lagerorte UEBER dem Mindestbestand (5).
    b("a5", "c5", HANDLAGER_ID, 2),
    b("a5", "c5", RTW1, 6),
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

/** Alle Buchungszeilen als reine Objekte — die Vollladung, gegen die verglichen wird. */
function alleZeilen() {
  return t.db.select().from(buchungen).all()
    .map((x) => ({ lagerortId: x.lagerortId, chargeId: x.chargeId,
                   artikelId: x.artikelId, menge: x.menge }));
}

describe("bestandJeArtikel — dieselbe Zahl wie bestandProLagerort", () => {
  it("Handlager: 12 fuer a1, 0 fuer a2", () => {
    const m = bestandJeArtikel(t.db, HANDLAGER_ID);
    const roh = alleZeilen();
    for (const id of ["a1", "a2", "a3", "a5"]) {
      expect(m.get(id) ?? 0, `Artikel ${id}`)
        .toBe(bestandProLagerort(roh.filter((r) => r.artikelId === id), HANDLAGER_ID));
    }
    expect(m.get("a1")).toBe(12);   // 10 − 3 + 5, OHNE die 4 aus RTW1 und die 1 aus RTW2
  });

  it("Fahrzeug: nur die Fahrzeugzeilen", () => {
    expect(bestandJeArtikel(t.db, RTW1).get("a1")).toBe(4);
    expect(bestandJeArtikel(t.db, RTW1).get("a2")).toBe(2);
    expect(bestandJeArtikel(t.db, RTW2).get("a1")).toBe(1);
  });

  it("ein Artikel OHNE Buchung fehlt in der Map — `?? 0` ist Pflicht", () => {
    /**
     * ⚠️ DIE STILLE BRUCHSTELLE DER UMSTELLUNG (§5.2.4, Punkt 3): `sum()` liefert
     * bei leerer Gruppe KEINE ZEILE, nicht 0. Heute liefert `bestandProLagerort`
     * fuer einen Artikel ohne Buchungen 0, morgen fehlt der Schluessel.
     */
    const m = bestandJeArtikel(t.db, HANDLAGER_ID);
    expect(m.has("a3")).toBe(false);
    expect(m.get("a3") ?? 0).toBe(0);
  });

  it("ein unbekannter Lagerort liefert eine LEERE Map", () => {
    expect(bestandJeArtikel(t.db, "gibtsnicht").size).toBe(0);
  });
});

describe("restJeCharge — dieselbe Zahl wie bestandProLagerortUndCharge", () => {
  it("fuehrt DIESELBE chargeId an drei Lagerorten getrennt", () => {
    const roh = alleZeilen();
    for (const ort of [HANDLAGER_ID, RTW1, RTW2]) {
      const sql = restJeCharge(t.db, ort);
      const rein = bestandProLagerortUndCharge(roh, ort);
      expect([...rein.keys()].sort(), `Lagerort ${ort}`).toEqual([...sql.keys()].sort());
      for (const [k, v] of rein) expect(sql.get(k), `${ort}/${k}`).toBe(v);
    }
    expect(restJeCharge(t.db, HANDLAGER_ID).get("c1")).toBe(7);   // 10 − 3
    expect(restJeCharge(t.db, RTW1).get("c1")).toBe(4);
    expect(restJeCharge(t.db, RTW2).get("c1")).toBe(1);
  });
});

describe("bestandJeArtikelUndLagerort — EINE Abfrage fuer die Fahrzeugliste", () => {
  it("schluesselt AUSSEN nach Lagerort und INNEN nach Artikel", () => {
    // Die Reihenfolge ist Vertrag: die Fahrzeugliste iteriert Fahrzeuge und
    // schlaegt darin Artikel nach. Umgedreht braeuchte sie je Fahrzeug eine
    // Schleife ueber alle Artikel.
    const m = bestandJeArtikelUndLagerort(t.db);
    expect(m.get(HANDLAGER_ID)?.get("a1")).toBe(12);
    expect(m.get(RTW1)?.get("a1")).toBe(4);
    expect(m.get(RTW1)?.get("a2")).toBe(2);
    expect(m.get(RTW2)?.get("a1")).toBe(1);
    expect(m.get(RTW2)?.has("a2")).toBe(false);
  });

  it("liefert fuer JEDEN Lagerort dieselben Zahlen wie die Vollladung", () => {
    const m = bestandJeArtikelUndLagerort(t.db);
    const roh = alleZeilen();
    for (const ort of [HANDLAGER_ID, RTW1, RTW2]) {
      for (const id of ["a1", "a2", "a3", "a5"]) {
        expect(m.get(ort)?.get(id) ?? 0, `${ort}/${id}`)
          .toBe(bestandProLagerort(roh.filter((r) => r.artikelId === id), ort));
      }
    }
  });
});

describe("restJeChargeFuerArtikel — der Lesepfad des Schreibwegs", () => {
  it("liefert nur die Chargen DIESES Artikels an DIESEM Lagerort", () => {
    const m = restJeChargeFuerArtikel(t.db, "a1", HANDLAGER_ID);
    expect([...m.keys()].sort()).toEqual(["c1", "c2"]);
    expect(m.get("c1")).toBe(7);
    expect(m.get("c2")).toBe(5);
  });

  it("stimmt mit bestandProLagerortUndCharge ueber die Vollladung ueberein", () => {
    /**
     * ⚠️ DIESE ZEILE IST DER GRUND, WARUM `fefoAbbuchung` UEBERHAUPT UMGESTELLT
     * WIRD: `abbuchung.ts:38` laedt heute ALLE Buchungen des Artikels OHNE
     * Lagerort-Praedikat und filtert erst in JS. Das Praedikat wandert damit
     * erstmals in die Abfrage.
     */
    const roh = alleZeilen().filter((r) => r.artikelId === "a1");
    const rein = bestandProLagerortUndCharge(roh, HANDLAGER_ID);
    const sql = restJeChargeFuerArtikel(t.db, "a1", HANDLAGER_ID);
    expect([...sql.keys()].sort()).toEqual([...rein.keys()].sort());
    for (const [k, v] of rein) expect(sql.get(k)).toBe(v);
  });

  it("liefert eine LEERE Map fuer einen Artikel ohne Buchung an diesem Ort", () => {
    expect(restJeChargeFuerArtikel(t.db, "a2", HANDLAGER_ID).size).toBe(0);
    expect(restJeChargeFuerArtikel(t.db, "a3", HANDLAGER_ID).size).toBe(0);
  });
});

describe("kennzahlen", () => {
  const NOW = new Date("2026-06-15T10:00:00Z");

  it("zaehlt unter Mindestbestand gegen den HANDLAGER-Bestand", () => {
    /**
     * ⚠️ a5 IST DIE ZEILE, DIE DIE BEZUGSGROESSE UNTERSCHEIDET. a1 und a2 liegen
     * in jeder Bezugsgroesse unter Mindestbestand; mit ihnen allein bliebe
     * dieser Fall gruen, auch wenn `kennzahlen` RTW1 oder die lagerort-
     * uebergreifende Summe rechnete (§5.2.1, „scheitert STILL").
     */
    // a1: Handlager 12 < 20  → zaehlt  (RTW1 4, gesamt 17 — auch unter Mindest)
    // a2: Handlager  0 <  5  → zaehlt  (die 2 liegen im RTW)
    // a3: Handlager  0 <  0  → nein (strikt kleiner)
    // a5: Handlager  2 <  5  → zaehlt — ABER RTW1 6 und gesamt 8 liegen DARUEBER
    expect(kennzahlen(t.db, NOW).unterMindest).toBe(3);
  });

  it("`nichtBestellt` zaehlt die NOCH NICHT bestellten, und heisst deshalb so", () => {
    /**
     * §5.5: `queries.ts:139-141` nennt das Feld `offeneBestellungen` und zaehlt
     * genau dann hoch, wenn ein Artikel unter Mindestbestand liegt UND bestelltAt
     * NICHT gesetzt ist. Die Oberflaeche beschriftet es „offene Bestellpositionen",
     * was jeder Leser als „bestellt, noch nicht geliefert" versteht. Die ZAHL
     * bleibt dieselbe — nur der Name wird wahr.
     */
    // a1 ist unter Mindestbestand und NICHT bestellt; a2 ist unter Mindestbestand
    // UND bestellt (bestelltAt gesetzt); a5 ist im HANDLAGER unter Mindestbestand
    // und nicht bestellt — ueber RTW1 oder gesamt gerechnet waere es 1 statt 2,
    // die Bezugsgroesse traegt also auch hier.
    expect(kennzahlen(t.db, NOW).nichtBestellt).toBe(2);
  });

  it("zaehlt Chargen mit HANDLAGER-Rest > 0, getrennt nach kritisch und abgelaufen", () => {
    // c1 (2026-07, Rest 7 im Handlager) → kritisch
    // c2 (2028-01, Rest 5)              → gruen, zaehlt nicht
    // c3 (2020-01) liegt NUR im RTW     → Handlager-Rest 0, zaehlt NICHT
    const k = kennzahlen(t.db, NOW);
    expect(k.chargenKritisch).toBe(1);
    expect(k.chargenAbgelaufen).toBe(0);
  });

  it("eine abgelaufene Charge MIT Handlager-Rest zaehlt in chargenAbgelaufen", () => {
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a2", chargeId: "c3",
      lagerortId: HANDLAGER_ID, menge: 3, quelleTyp: "system", quelleId: "test",
      referenz: null, kommentar: null,
    }).run();
    const k = kennzahlen(t.db, NOW);
    expect(k.chargenAbgelaufen).toBe(1);
    expect(k.chargenKritisch).toBe(1);   // c1 unveraendert
  });

  it("zaehlt ALLE Buchungszeilen, lagerort-uebergreifend", () => {
    expect(kennzahlen(t.db, NOW).buchungenGesamt).toBe(8);
  });

  it("zaehlt einen DEAKTIVIERTEN Artikel nicht mit", () => {
    /**
     * ⚠️ `Kennzahlen.unterMindest` dokumentiert „Aktive Artikel" — ohne einen
     * Fall, der einen deaktivierten Artikel unter Mindestbestand einbringt,
     * bliebe die gesamte Datei gruen, wenn `.where(eq(artikel.aktiv, true))`
     * verschwaende (dieselbe Klasse Fehler wie bei T30/T43).
     */
    t.db.insert(artikel).values({
      id: "a4", name: "Ausgemustert", einheit: "Stk.", fach: "D4",
      mindestbestand: 99, aktiv: false, createdAt: NOW,
    }).run();
    const k = kennzahlen(t.db, NOW);
    expect(k.unterMindest).toBe(3);    // ohne den aktiv-Filter waeren es 4
    expect(k.nichtBestellt).toBe(2);   // ohne ihn 3
  });

  it("eine ROTE, noch nicht abgelaufene Charge zaehlt ebenfalls in chargenKritisch", () => {
    /**
     * Die Fixture kennt bislang nur gelb (c1) und abgelaufen (c3) — „gelb ODER
     * rot" waere damit ungeprueft auf die Haelfte verengbar
     * (`s.ampel === "gelb"` statt `s.ampel !== "gruen"`), ohne dass ein Test
     * es merkt.
     */
    t.db.insert(chargen).values({
      id: "c4", artikelId: "a1", chargenNr: "CH-4", verfall: "2026-06", createdAt: NOW,
    }).run();
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a1", chargeId: "c4",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "test",
      referenz: null, kommentar: null,
    }).run();
    // Monatsende 2026-06-30, ab 2026-06-15 sind das ~15 Tage — <= rotTage (31),
    // aber die Charge ist noch nicht abgelaufen.
    const k = kennzahlen(t.db, NOW);
    expect(k.chargenKritisch).toBe(2);    // c1 (gelb) UND c4 (rot)
    expect(k.chargenAbgelaufen).toBe(0);
  });
});

describe("Leser — die vier Aggregate laufen auch INNERHALB einer Transaktion (H11)", () => {
  it("liest korrekt, waehrend die Transaktion noch offen ist", () => {
    /**
     * `Leser` ist die zentrale Typzusage dieser Datei: die Aggregate werden
     * auch aus `fefoAbbuchung`/`korrekturAufLagerort` heraus gerufen, also
     * INNERHALB einer offenen Transaktion. Der Typecheck belegt nur, dass eine
     * Transaktion als Parameter ANGENOMMEN wird — nicht, dass `.all()`/`.get()`
     * darin zur Laufzeit funktionieren.
     */
    t.db.transaction((tx) => {
      expect(restJeChargeFuerArtikel(tx, "a1", HANDLAGER_ID).get("c1")).toBe(7);
      expect(bestandJeArtikel(tx, HANDLAGER_ID).get("a1")).toBe(12);
    });
  });
});
