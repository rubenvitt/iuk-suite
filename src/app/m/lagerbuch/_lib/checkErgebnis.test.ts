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

describe("parseCheckErgebnis — jeder Lesefehler wird ein LEERES V2, benannt als unlesbar", () => {
  // T176a1: die Struktur bleibt die leere V2-Struktur (das haelt jeden Leser am
  // Leben, der einfach ueber die fuenf Listen geht) — sie traegt seitdem
  // zusaetzlich den GRUND (§11.5, Zustand 27). Ohne ihn ist „kaputt" von
  // „0 Positionen" nicht unterscheidbar.
  const UNLESBAR = { ...LEERES_ERGEBNIS, unlesbar: true };

  it("kaputtes JSON", () => {
    expect(parseCheckErgebnis("{nicht json")).toEqual(UNLESBAR);
  });

  it("null — noch kein Ergebnis geschrieben, und deshalb OHNE Grundangabe", () => {
    // Der offene Check (`seedLokal.ts:523-526`, §4.4). Er bleibt woertlich das,
    // was er vorher war: ein leeres, LESBARES V2.
    expect(parseCheckErgebnis(null)).toEqual(LEERES_ERGEBNIS);
  });

  it("leerer String", () => {
    expect(parseCheckErgebnis("")).toEqual(UNLESBAR);
  });

  it("ein Skalar statt Objekt oder Array", () => {
    // `JSON.parse("5")` ist 5, `JSON.parse("null")` ist null — beides parst
    // erfolgreich und ist trotzdem kein Ergebnis.
    for (const roh of ["5", '"text"', "true", "null"]) {
      expect(parseCheckErgebnis(roh)).toEqual(UNLESBAR);
    }
  });

  it("LEERES_ERGEBNIS ist V2 und traegt fuenf leere Listen", () => {
    expect(LEERES_ERGEBNIS).toEqual({
      version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
    });
  });

  it("ist eingefroren — ein Mutationsversuch veraendert den Wert nicht", () => {
    /**
     * Review-Fix T37: `LEERES_ERGEBNIS` wird von keinem Rueckgabeweg des
     * Parsers geleakt (siehe voriger Test) — aber ein kuenftiger Aufrufer
     * (T40, T49) koennte versehentlich DIREKT auf der Konstante mutieren
     * statt auf dem Rueckgabewert, und das verfaelschte sie fuer den Rest
     * der Prozesslaufzeit. `Object.freeze` haertet das ab.
     *
     * `Object.freeze` wirkt je nach Modus verschieden: im strict mode (ESM,
     * hier der Fall) wirft eine Zuweisung auf ein eingefrorenes Objekt oder
     * Array; im nicht-strict Modus schluckt sie leise. Der Test prueft
     * deshalb den WERT danach, nicht nur einen Wurf.
     */
    try {
      (LEERES_ERGEBNIS as unknown as { version: number }).version = 1;
    } catch {
      // erwartet im strict mode
    }
    try {
      LEERES_ERGEBNIS.positionen.push({ artikelId: "x" });
    } catch {
      // erwartet im strict mode
    }
    try {
      LEERES_ERGEBNIS.artikel.push({ artikelId: "x" });
    } catch {
      // erwartet im strict mode
    }
    try {
      LEERES_ERGEBNIS.geraete.push({ geraetId: "x" });
    } catch {
      // erwartet im strict mode
    }
    try {
      LEERES_ERGEBNIS.flaschen.push({ flascheId: "x" });
    } catch {
      // erwartet im strict mode
    }
    try {
      LEERES_ERGEBNIS.verfall.push({ artikelId: "x", verfall: "2026-09" });
    } catch {
      // erwartet im strict mode
    }
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

/**
 * §11.5, Zustand 27: „`checks.ergebnis` unlesbar" — die Zeile wird als
 * „Ergebnis unlesbar" gekennzeichnet STATT als „0 Positionen".
 *
 * ⚠️ DER KERN IST DIE ABGRENZUNG, nicht die Erkennung. Ein Leseabbruch und ein
 * legitim leeres V2-Ergebnis (der Check hatte wirklich nichts zu melden) sahen
 * bis hierher IDENTISCH aus — beide `leer()`. Wer den Unterschied verwischt,
 * warnt kuenftig bei JEDEM leeren Check, und das ist der teurere Fehler: eine
 * Warnung, die immer steht, wird nicht mehr gelesen.
 */
describe("parseCheckErgebnis — unlesbar ist von legitim leer unterscheidbar (§11.5, 27)", () => {
  it("kaputtes JSON ist unlesbar", () => {
    const e = parseCheckErgebnis("{nicht json");
    expect(e.version).toBe(2);
    if (e.version === 2) expect(e.unlesbar).toBe(true);
  });

  it("ein leerer String ist unlesbar — ein geschriebener Wert, der nichts traegt", () => {
    const e = parseCheckErgebnis("");
    if (e.version === 2) expect(e.unlesbar).toBe(true);
  });

  it("ein Skalar statt Objekt oder Array ist unlesbar — JSON in falscher Form", () => {
    for (const roh of ["5", '"text"', "true", "null"]) {
      const e = parseCheckErgebnis(roh);
      if (e.version === 2) expect(e.unlesbar).toBe(true);
    }
  });

  it("ein legitim LEERES V2-Ergebnis ist NICHT unlesbar", () => {
    // Der Check lief durch und hatte 0 Positionen. Das ist ein gueltiger
    // Zustand und bekommt KEINE Warnung — hier scheitert jede Umsetzung, die
    // „leer" mit „kaputt" gleichsetzt.
    const e = parseCheckErgebnis(JSON.stringify({
      version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
    }));
    expect(e.version).toBe(2);
    if (e.version === 2) expect(e.unlesbar).toBeFalsy();
  });

  it("ein gefuelltes V2-Ergebnis ist NICHT unlesbar", () => {
    const e = parseCheckErgebnis(JSON.stringify({
      positionen: [{ artikelId: "a1", soll: 2, ist: 2 }],
    }));
    if (e.version === 2) expect(e.unlesbar).toBeFalsy();
  });

  it("ein Objekt mit Muell in den Listen ist NICHT unlesbar — die Form stimmt", () => {
    // `liste()` faengt das tolerant ab (bestehendes Verhalten, T37). Ein Objekt
    // IST ein Ergebnis; nur die einzelnen Listen sind unbrauchbar. Daraus eine
    // zweite Warnklasse zu machen, verlangt §11.5 nicht.
    const e = parseCheckErgebnis(JSON.stringify({ geraete: "kaputt", artikel: 42 }));
    if (e.version === 2) expect(e.unlesbar).toBeFalsy();
  });

  it("`null` ist NICHT unlesbar — ein offener Check hat noch kein Ergebnis", () => {
    /**
     * ⚠️ ABWEICHUNG VOM WORTLAUT DER AUFGABE, mit Grund. `if (!roh)` ist die
     * dritte `leer()`-Stelle, aber sie bedeutet nicht „kaputt", sondern „noch
     * nichts geschrieben": `checks.ergebnis` ist nullable (`schema.ts:232`) und
     * `seedLokal.ts:523-526` legt genau so einen OFFENEN Check an
     * (`completedAt: null, ergebnis: null`) — das Schema sieht die Bauform
     * ausdruecklich vor (`completed_at IS NULL`, §4.4). Wuerde `null` als
     * unlesbar gelten, meldete die Detailseite „Ergebnis unlesbar" fuer einen
     * Check, an dem schlicht noch niemand fertig war: eine zweite Luege statt
     * keiner.
     */
    const e = parseCheckErgebnis(null);
    expect(e.version).toBe(2);
    if (e.version === 2) expect(e.unlesbar).toBeFalsy();
  });

  it("`undefined` verhaelt sich wie `null`, nicht wie kaputtes JSON", () => {
    /**
     * ⚠️ HEUTE UNERREICHBAR — und genau deshalb hier. Die Signatur ist
     * `string | null`, es gibt keinen lebenden Pfad. Vor T176a1 fing `if (!roh)`
     * `undefined` mit ab; die praezisere `roh === null`-Pruefung liesse es
     * weiterlaufen in `JSON.parse(undefined)` → `catch` → **unlesbar**. Eine
     * kuenftige Signaturerweiterung (ein optionales Feld, ein `?.`-Zugriff)
     * produzierte damit still „Ergebnis unlesbar" fuer einen Datensatz, an dem
     * nichts kaputt ist. Der Cast steht bewusst da: er bewacht die Erweiterung,
     * er ist kein toter Code.
     */
    const e = parseCheckErgebnis(undefined as unknown as string | null);
    expect(e.version).toBe(2);
    if (e.version === 2) expect(e.unlesbar).toBeFalsy();
  });

  it("V1 bleibt V1 — `altFormat` ist eine ANDERE Ursache und wird nicht eingemeindet", () => {
    // Das Altformat hat sein eigenes Signal (§11.5, 26). Zustand 27 fasst es
    // NICHT mit ein, auch wenn beide im selben `Alert` genannt sind.
    for (const roh of ["[]", JSON.stringify([{ fehlt: 3, gebucht: 1 }])]) {
      const e = parseCheckErgebnis(roh);
      expect(e.version).toBe(1);
      expect(e).not.toHaveProperty("unlesbar");
    }
  });
});
