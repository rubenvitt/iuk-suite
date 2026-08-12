import { describe, it, expect } from "vitest";
import { fehlmengen, offenJeArtikel, summiereCheckErgebnis } from "./check";

describe("fehlmengen", () => {
  it("liefert nur Eintraege mit fehlt > 0", () => {
    expect(fehlmengen([
      { soll: 5, ist: 3 }, { soll: 4, ist: 4 }, { soll: 2, ist: 7 },
    ])).toEqual([{ soll: 5, ist: 3, fehlt: 2 }]);
  });

  it("ist generisch und reicht die Positions-Identitaet DURCH", () => {
    // `T extends {soll, ist}` — damit Aufrufer sollPositionId/artikelId behalten
    // koennen (`lagerbuch/src/lib/domain/check.ts:2-3`).
    expect(fehlmengen([{ sollPositionId: "sp1", artikelId: "a1", soll: 5, ist: 1 }]))
      .toEqual([{ sollPositionId: "sp1", artikelId: "a1", soll: 5, ist: 1, fehlt: 4 }]);
  });

  it("liefert fuer eine leere Liste eine leere Liste", () => {
    expect(fehlmengen([])).toEqual([]);
  });
});

describe("summiereCheckErgebnis — das ALTE Format", () => {
  it("zaehlt Positionen, Nachgefuelltes und Offenes; alles Uebrige ist 0", () => {
    /**
     * ⚠️ DER DRITTE EINTRAG IST DIE KLEMMUNG. Mit `{fehlt:3,gebucht:1}` und
     * `{fehlt:2,gebucht:2}` allein war `Math.max(0, fehlt − gebucht)` VAKUUM:
     * 2 + 0 = 2, mit oder ohne Klemmung. V1 ist das ALTFORMAT — also exakt die
     * Daten, die beim Cutover hereinkommen; ein Eintrag mit `gebucht > fehlt`
     * zoege `offen` nach unten und meldete zu wenig Fehlmenge.
     * `{fehlt:1,gebucht:5}` liefert geklemmt 0, ungeklemmt −4.
     */
    const roh = JSON.stringify([
      { fehlt: 3, gebucht: 1 }, { fehlt: 2, gebucht: 2 }, { fehlt: 1, gebucht: 5 },
    ]);
    expect(summiereCheckErgebnis(roh)).toEqual({
      positionen: 3, nachgefuellt: 8, korrigiert: 0,
      offen: 2,   // 2 + 0 + 0 — NICHT −2
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, nichtBewertbar: 0, altFormat: true,
      unlesbar: false,
    });
  });

  it("reicht `unlesbar` weiter — die Uebersicht braucht den Grund, nicht nur die Null", () => {
    /**
     * §11.5, Zustand 27. `summiereCheckErgebnis` speist BEIDE Leser (Uebersicht
     * und Detail, §5.8.3). Ohne dieses Feld zeigt die Check-Historie fuer einen
     * zerstoerten Datensatz eine ruhige `0` in der Positionen-Spalte — auf genau
     * der Flaeche, auf der jemand nach Auffaelligkeiten sucht.
     *
     * ⚠️ Die Gegenprobe steht daneben und ist die wichtigere: „legitim leer"
     * bleibt `false`.
     */
    expect(summiereCheckErgebnis("{kein json").unlesbar).toBe(true);
    expect(summiereCheckErgebnis('"skalar"').unlesbar).toBe(true);

    expect(summiereCheckErgebnis(JSON.stringify({
      version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
    })).unlesbar).toBe(false);
    // Der offene Check (§4.4) und das Altformat (§11.5, 26) sind beide LESBAR.
    expect(summiereCheckErgebnis(null).unlesbar).toBe(false);
    expect(summiereCheckErgebnis("[]").unlesbar).toBe(false);
  });

  it("setzt altFormat: true — die Detailseite SAGT es", () => {
    // §4.10, 1:1-Pflicht 1: faellt der V1-Zweig weg, zeigen alte Checks leere
    // Detaillisten statt der Zusammenfassung — und das ist die einzige Auswertung,
    // die es fuer sie je gab. Alles andere ist eine leere Tabelle, die wie ein
    // Fehler aussieht (§11.5, Zustand 26).
    expect(summiereCheckErgebnis("[]").altFormat).toBe(true);
  });
});

describe("summiereCheckErgebnis — das HEUTIGE Format", () => {
  const V2 = {
    positionen: [{ artikelId: "a1", soll: 4, ist: 3 }, { artikelId: "a1", soll: 2, ist: 2 }],
    artikel: [{ artikelId: "a1", sollSumme: 6, istSumme: 5, korrektur: -2, nachfuellGebucht: 1 }],
    geraete: [
      { geraetId: "g1", vorhanden: true, zustand: "In Ordnung" },
      { geraetId: "g2", vorhanden: false, zustand: "In Ordnung" },
      { geraetId: "g3", vorhanden: true, zustand: "Defekt" },
    ],
    flaschen: [
      { flascheId: "f1", druckBar: 40, nennfuelldruckBar: 200 },   // 20 % → rot
      { flascheId: "f2", druckBar: 150, nennfuelldruckBar: 200 },  // 75 % → gruen
    ],
    verfall: [],
  };

  it("summiert die fuenf Zaehler und setzt altFormat: false", () => {
    expect(summiereCheckErgebnis(JSON.stringify(V2))).toEqual({
      positionen: 2, nachgefuellt: 1,
      korrigiert: 2,   // BETRAG von −2
      offen: 0,        // max(0, 6 − 5 − 1)
      geraeteAuffaellig: 2, flaschenAuffaellig: 1, nichtBewertbar: 0, altFormat: false,
      unlesbar: false,
    });
  });

  it("`korrigiert` ist der BETRAG, nicht die Summe mit Vorzeichen", () => {
    // Sonst hoben sich +3 und −3 auf und ein Check mit zwei gegenlaeufigen
    // Korrekturen saehe aus wie einer ganz ohne (`queries.ts:376`, `:497`).
    const roh = JSON.stringify({ artikel: [
      { artikelId: "a", korrektur: 3 }, { artikelId: "b", korrektur: -3 },
    ] });
    expect(summiereCheckErgebnis(roh).korrigiert).toBe(6);
  });

  it("`offen` ist je Artikel geklemmt, nicht erst in der Summe", () => {
    // max(0, soll − ist − nachgefuellt) JE ARTIKEL. Erst in der Summe geklemmt,
    // fraesse ein ueberfuellter Artikel die Fehlmenge eines anderen auf.
    const roh = JSON.stringify({ artikel: [
      { artikelId: "a", sollSumme: 10, istSumme: 2, nachfuellGebucht: 0 },  // offen 8
      { artikelId: "b", sollSumme: 1, istSumme: 9, nachfuellGebucht: 0 },   // offen 0, nicht −8
    ] });
    expect(summiereCheckErgebnis(roh).offen).toBe(8);
  });

  it("`geraeteAuffaellig` zaehlt !vorhanden ODER zustand === 'Defekt'", () => {
    expect(summiereCheckErgebnis(JSON.stringify(V2)).geraeteAuffaellig).toBe(2);
  });

  it("ein UNBEKANNTER Zustand zaehlt NICHT als auffaellig", () => {
    /**
     * §5.8.2: beim Schreiben streng (z.enum(ZUSTAENDE) ab Teil 4), beim Anzeigen
     * TOLERANT. Ein Altcheck kann theoretisch einen fremden String tragen; er wird
     * angezeigt wie gespeichert und zaehlt nicht — so wie heute (`check.ts:129`).
     */
    const roh = JSON.stringify({ geraete: [{ geraetId: "g", vorhanden: true, zustand: "kaputt" }] });
    expect(summiereCheckErgebnis(roh).geraeteAuffaellig).toBe(0);
  });
});

describe("summiereCheckErgebnis — der Nennfuelldruck wird NICHT geraten (§5.12)", () => {
  it("eine Flasche OHNE Snapshot zaehlt in nichtBewertbar, NICHT in flaschenAuffaellig", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT: den `?? null` wieder auf `?? 200` setzen.
     * Fuer eine 300-bar-Flasche skalierte der Rueckfall den Fuellstand STILL
     * FALSCH — 150 bar als 75 % statt 50 %, Ampel von gelb auf gruen. Und die
     * HISTORIE ist der leichtere der beiden Wege in den Rueckfall: sie hat KEINEN
     * Rueckgriff auf den Flaschenstamm. Ein Altcheck ueber 300-bar-Flaschen meldet
     * dort systematisch zu wenige auffaellige Flaschen.
     */
    const roh = JSON.stringify({ flaschen: [{ flascheId: "f1", druckBar: 150 }] });
    const s = summiereCheckErgebnis(roh);
    expect(s.nichtBewertbar).toBe(1);
    expect(s.flaschenAuffaellig).toBe(0);
  });

  it("nennfuelldruckBar: null zaehlt genauso", () => {
    const roh = JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: null }],
    });
    expect(summiereCheckErgebnis(roh).nichtBewertbar).toBe(1);
  });

  it("eine Flasche OHNE gemessenen Druck zaehlt in nichtBewertbar, NICHT als auffaellig", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT: `f.druckBar ?? 0` statt der Null-Pruefung.
     * Aus einer FEHLENDEN Messung entstuende dann still „0 bar → 0 % → rot →
     * niedrig": die Zeile behauptete auf einem Nachweis eine LEERE Flasche, die
     * niemand gemessen hat, und `flaschenAuffaellig` stiege. Historisches JSON
     * ist beim Cutover der erklaerte Regelfall — die Altdaten kommen mit.
     */
    const roh = JSON.stringify({ flaschen: [{ flascheId: "f1", nennfuelldruckBar: 200 }] });
    const s = summiereCheckErgebnis(roh);
    expect(s.nichtBewertbar).toBe(1);
    expect(s.flaschenAuffaellig).toBe(0);
  });

  it("druckBar: 0 ist BEWERTBAR — eine wirklich leere Flasche zaehlt", () => {
    // Der Gegenfall zur Zeile darueber: `0` ist eine MESSUNG, `undefined` ist
    // keine. Ein `?? 0` machte beide ununterscheidbar.
    const roh = JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 0, nennfuelldruckBar: 200 }],
    });
    const s = summiereCheckErgebnis(roh);
    expect(s.nichtBewertbar).toBe(0);
    expect(s.flaschenAuffaellig).toBe(1);
  });

  it("nennfuelldruckBar: 0 ist BEWERTBAR und zaehlt als auffaellig", () => {
    // Eine Flasche mit Nennfuelldruck 0 im Stamm ist FEHLKONFIGURIERT, nicht
    // unbekannt — sie gehoert angesehen, nicht ausgeblendet. `o2Status` liefert
    // dafuer 0 % / rot (§5.12, Eigenschaft 2).
    const roh = JSON.stringify({
      flaschen: [{ flascheId: "f1", druckBar: 150, nennfuelldruckBar: 0 }],
    });
    const s = summiereCheckErgebnis(roh);
    expect(s.nichtBewertbar).toBe(0);
    expect(s.flaschenAuffaellig).toBe(1);
  });
});

describe("offenJeArtikel — DIE EINE `offen`-Formel (§5.8.3)", () => {
  /**
   * ⚠️ HIER STAND EIN `expect(f(roh)).toEqual(f(roh))`. Fuer eine deterministische
   * reine Funktion ist das eine TAUTOLOGIE: der Fall konnte unter keiner Mutation
   * rot werden. Die Zusage „Uebersicht und Detail rechnen dieselbe Summe" lebt
   * nicht in der Reinheit dieser Funktion, sondern darin, dass BEIDE
   * Aufrufstellen dieselbe Formel benutzen. Sie wird an zwei Orten gehalten:
   *   - hier: die Formel selbst, gegen von Hand gerechnete Zahlen;
   *   - `_lib/lesepfade/checks.test.ts`: `sum(detailzeilen.offen) === summe.offen`,
   *     die einzige Zusicherung, die die zweite Aufrufstelle wirklich bindet.
   */
  it("klemmt bei 0, zieht das Nachgefuellte ab und behandelt fehlende Felder als 0", () => {
    expect(offenJeArtikel({ sollSumme: 10, istSumme: 2, nachfuellGebucht: 3 })).toBe(5);
    // NICHT −8: erst klemmen, dann summieren.
    expect(offenJeArtikel({ sollSumme: 1, istSumme: 9, nachfuellGebucht: 0 })).toBe(0);
    expect(offenJeArtikel({ sollSumme: 4 })).toBe(4);
    expect(offenJeArtikel({})).toBe(0);
  });

  it("ist die Formel, aus der `summiereCheckErgebnis` seine Summe bildet", () => {
    // Die 12 ist VON HAND gerechnet (8 + 0 + 4) und nicht aus der Implementierung
    // abgeleitet — eine geaenderte Klemmung oder ein vergessener
    // `nachfuellGebucht`-Abzug wird hier rot.
    const artikelZeilen = [
      { artikelId: "a", sollSumme: 10, istSumme: 2, nachfuellGebucht: 0 },  // 8
      { artikelId: "b", sollSumme: 1, istSumme: 9, nachfuellGebucht: 0 },   // 0, nicht −8
      { artikelId: "c", sollSumme: 7, istSumme: 1, nachfuellGebucht: 2 },   // 4
    ];
    expect(summiereCheckErgebnis(JSON.stringify({ artikel: artikelZeilen })).offen).toBe(12);
    expect(artikelZeilen.reduce((s, a) => s + offenJeArtikel(a), 0)).toBe(12);
  });
});

describe("summiereCheckErgebnis — kaputte Eingaben", () => {
  it("liefert bei kaputtem JSON Nullen statt eines Wurfs — BENANNT als unlesbar", () => {
    // ⚠️ Die Nullen allein waren der Fehlerzustand aus §11.5, 27: sie sind von
    // einem Check mit wirklich 0 Positionen nicht unterscheidbar. Seit T176a1
    // steht der Grund daneben, und genau dieses `toEqual` haelt fest, dass er
    // NICHT verlorengeht.
    expect(summiereCheckErgebnis("{kaputt")).toEqual({
      positionen: 0, nachgefuellt: 0, korrigiert: 0, offen: 0,
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, nichtBewertbar: 0, altFormat: false,
      unlesbar: true,
    });
  });
});
