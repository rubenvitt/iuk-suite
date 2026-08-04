import { describe, it, expect } from "vitest";
import { parseCheckErgebnis, LEERES_ERGEBNIS } from "./checkErgebnis";

describe("parseCheckErgebnis — das ALTE Format (V1)", () => {
  it("erkennt ein Array und liefert version 1", () => {
    const roh = JSON.stringify([{ fehlt: 3, gebucht: 1 }, { fehlt: 0, gebucht: 0 }]);
    const e = parseCheckErgebnis(roh);
    expect(e.version).toBe(1);
    if (e.version === 1) expect(e.eintraege).toHaveLength(2);
  });

  it("liefert ein LEERES Array als V1, nicht als V2", () => {
    // `"[]"` ist der Vorgabewert des Alt-Lesers (`queries.ts:366`,
    // `JSON.parse(c.ergebnis ?? "[]")`). Er MUSS V1 bleiben, sonst kippt ein
    // Altcheck ohne Eintraege in den V2-Zweig und `altFormat` waere falsch.
    const e = parseCheckErgebnis("[]");
    expect(e.version).toBe(1);
    if (e.version === 1) expect(e.eintraege).toEqual([]);
  });

  it("laesst unvollstaendige Eintraege stehen, statt sie zu fuellen", () => {
    // `{fehlt?}`/`{gebucht?}` sind OPTIONAL. Der Summierer geht ueber `?? 0`;
    // hier zu fuellen naehme ihm die Moeglichkeit, „nicht angegeben" von „0" zu
    // unterscheiden, falls das je gebraucht wird.
    const e = parseCheckErgebnis(JSON.stringify([{ gebucht: 2 }]));
    if (e.version === 1) expect(e.eintraege[0]).toEqual({ gebucht: 2 });
  });
});

describe("parseCheckErgebnis — das HEUTIGE Format (V2)", () => {
  const V2 = {
    positionen: [{ sollPositionId: "sp1", artikelId: "a1", soll: 4, ist: 3 }],
    artikel: [{ artikelId: "a1", positionen: 1, sollSumme: 4, istSumme: 3,
                recordedVorher: 3, korrektur: 0, nachfuellGewuenscht: 1, nachfuellGebucht: 1 }],
    geraete: [{ geraetId: "g1", vorhanden: true, zustand: "In Ordnung", bemerkung: null }],
    flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: 200 }],
    verfall: [{ artikelId: "a1", verfall: "2026-09", ampel: "gelb", abgelaufen: false }],
  };

  it("erkennt ein Objekt und liefert version 2 mit allen fuenf Listen", () => {
    const e = parseCheckErgebnis(JSON.stringify(V2));
    expect(e.version).toBe(2);
    if (e.version === 2) {
      expect(e.positionen).toEqual(V2.positionen);
      expect(e.artikel).toEqual(V2.artikel);
      expect(e.geraete).toEqual(V2.geraete);
      expect(e.flaschen).toEqual(V2.flaschen);
      expect(e.verfall).toEqual(V2.verfall);
    }
  });

  it("ergaenzt FEHLENDE Listen als leere Arrays", () => {
    // Ein teilweise geschriebenes Ergebnis darf keinen Leser zum Absturz bringen.
    const e = parseCheckErgebnis(JSON.stringify({ positionen: [{ artikelId: "a1" }] }));
    if (e.version === 2) {
      expect(e.positionen).toHaveLength(1);
      expect(e.artikel).toEqual([]);
      expect(e.geraete).toEqual([]);
      expect(e.flaschen).toEqual([]);
      expect(e.verfall).toEqual([]);
    }
  });

  it("wirft eine Liste weg, die kein Array ist", () => {
    const e = parseCheckErgebnis(JSON.stringify({ geraete: "kaputt", artikel: 42 }));
    if (e.version === 2) {
      expect(e.geraete).toEqual([]);
      expect(e.artikel).toEqual([]);
    }
  });

  it("erhaelt nennfuelldruckBar: null, statt es wegzuwerfen", () => {
    /**
     * ⚠️ DIE ZEILE, DIE §5.12 TRAEGT. Ein Parser, der `null` auf `undefined`
     * normalisiert oder auf 200 setzt, nimmt dem Leser die Moeglichkeit,
     * „Nennfuelldruck UNBEKANNT" zu erkennen — und dann ist der `?? 200`-Rueckfall
     * wieder da, nur eine Ebene tiefer.
     */
    const e = parseCheckErgebnis(JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: null }],
    }));
    if (e.version === 2) expect(e.flaschen[0].nennfuelldruckBar).toBeNull();
  });

  it("erhaelt ein FEHLENDES nennfuelldruckBar als undefined", () => {
    // Der haeufigere der beiden Wege in den Rueckfall (§5.12): jeder Check, der
    // VOR der Einfuehrung des Snapshots abgeschlossen wurde.
    const e = parseCheckErgebnis(JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150 }],
    }));
    if (e.version === 2) expect(e.flaschen[0].nennfuelldruckBar).toBeUndefined();
  });
});

describe("parseCheckErgebnis — jeder Lesefehler wird ein LEERES V2", () => {
  it("kaputtes JSON", () => {
    expect(parseCheckErgebnis("{nicht json")).toEqual(LEERES_ERGEBNIS);
  });

  it("null", () => {
    expect(parseCheckErgebnis(null)).toEqual(LEERES_ERGEBNIS);
  });

  it("leerer String", () => {
    expect(parseCheckErgebnis("")).toEqual(LEERES_ERGEBNIS);
  });

  it("ein Skalar statt Objekt oder Array", () => {
    // `JSON.parse("5")` ist 5, `JSON.parse("null")` ist null — beides parst
    // erfolgreich und ist trotzdem kein Ergebnis.
    for (const roh of ["5", '"text"', "true", "null"]) {
      expect(parseCheckErgebnis(roh)).toEqual(LEERES_ERGEBNIS);
    }
  });

  it("LEERES_ERGEBNIS ist V2 und traegt fuenf leere Listen", () => {
    expect(LEERES_ERGEBNIS).toEqual({
      version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
    });
  });

  it("liefert bei jedem Aufruf eine EIGENE Instanz der Listen", () => {
    /**
     * Sonst teilten sich zwei Aufrufer dieselben Arrays, und ein `.sort()` im
     * Leser (T49 sortiert alle vier Detaillisten) veraenderte die Ausgabe des
     * anderen. Das ist kein theoretischer Fall: Uebersicht und Detail rufen
     * denselben Parser.
     */
    const a = parseCheckErgebnis("kaputt");
    const b = parseCheckErgebnis("kaputt");
    if (a.version === 2 && b.version === 2) {
      expect(a.positionen).not.toBe(b.positionen);
      expect(a.positionen).not.toBe(LEERES_ERGEBNIS.positionen);
    }
  });
});
