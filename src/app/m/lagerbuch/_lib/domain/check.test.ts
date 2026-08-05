import { describe, it, expect } from "vitest";
import { fehlmengen, summiereCheckErgebnis } from "./check";

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
    const roh = JSON.stringify([{ fehlt: 3, gebucht: 1 }, { fehlt: 2, gebucht: 2 }]);
    expect(summiereCheckErgebnis(roh)).toEqual({
      positionen: 2, nachgefuellt: 3, korrigiert: 0, offen: 2,
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, nichtBewertbar: 0, altFormat: true,
    });
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

describe("summiereCheckErgebnis — dieselbe Eingabe, dieselbe Ausgabe (§5.8.3)", () => {
  it("ist rein: zwei Aufrufe liefern zeichengleich dasselbe", () => {
    /**
     * DAS IST DIE ZUSAGE, WEGEN DER ES DIE FUNKTION GIBT. Die Alt-Anwendung
     * rechnet dieselben Summen an ZWEI Stellen getrennt (`queries.ts:374-380`
     * gegen `:496-501`) — Uebersicht und Detail koennen fuer DASSELBE JSON
     * verschiedene Zahlen zeigen, und beim Nennfuelldruck TUN sie es bereits.
     * Ab jetzt rufen beide Leser DIESE Funktion.
     */
    const roh = JSON.stringify({
      artikel: [{ artikelId: "a", sollSumme: 5, istSumme: 2, korrektur: -1, nachfuellGebucht: 2 }],
      geraete: [{ geraetId: "g", vorhanden: false }],
      flaschen: [{ flascheId: "f", druckBar: 10, nennfuelldruckBar: 200 }],
    });
    expect(summiereCheckErgebnis(roh)).toEqual(summiereCheckErgebnis(roh));
  });

  it("liefert bei kaputtem JSON Nullen statt eines Wurfs", () => {
    expect(summiereCheckErgebnis("{kaputt")).toEqual({
      positionen: 0, nachgefuellt: 0, korrigiert: 0, offen: 0,
      geraeteAuffaellig: 0, flaschenAuffaellig: 0, nichtBewertbar: 0, altFormat: false,
    });
  });
});
