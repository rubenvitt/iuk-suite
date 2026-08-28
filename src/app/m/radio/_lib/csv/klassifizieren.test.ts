// src/app/m/radio/_lib/csv/klassifizieren.test.ts
import { describe, it, expect } from "vitest";
import type { Geraet } from "../../_db/schema";
import {
  GERAETE_MODI,
  IMPORTKLASSEN,
  KLASSEN_WOERTER,
  klassifiziereZeile,
  klassifiziereZeilen,
  zeileZuEingehend,
  type Spaltenzuordnung,
} from "./klassifizieren";

/**
 * DIE FUENF IMPORTKLASSEN UND DIE ZELLNORMALISIERUNG.
 *
 * ⛔ HIER WEICHT DIE SPEC VON DER MESSUNG AB, UND DIE MESSUNG GILT. `Spec:4711-4714` nennt
 * drei Woerter („neu / geaendert / unveraendert") und verlangt, sie „aus
 * `classify-import-row.ts` zu uebernehmen, nicht zu erfinden". Gemessen sind es FUENF Klassen
 * mit anderen Woertern (`radio-admin/client/src/features/import/ImportWizard.tsx:60-66`).
 * Die Anweisung der Spec ist damit ERFUELLT, nicht gebrochen: uebernommen wird, was im
 * Bestand steht. Die Diskrepanz steht als Kommentar an `KLASSEN_WOERTER`.
 *
 * Regeln 1:1 aus `radio-admin/shared/src/import/classify-import-row.ts:25-53` und
 * `radio-admin/server/src/import/commit-service.ts:86-145`.
 */

/** Ein bestehendes Geraet, je Feld mit einem anderen Wert. */
function bestehendesGeraet(felder: Partial<Geraet> = {}): Geraet {
  return {
    id: "geraet-1",
    rufname: "Florian Musterstadt 10-1",
    issi: "1001",
    tei: "01234567890123",
    serialNumber: "SN-0001-A",
    deviceType: "TPH900",
    status: "Einsatzbereit",
    location: "Lager Nord",
    assignedTo: "Zugtrupp",
    softwareVersion: "6.1.2",
    lastUpdatedAt: "2026-07-01",
    notes: "Antenne getauscht",
    hiorgId: "HO-4711",
    opta: "HE RD DA 01-10-1",
    funktion: "Fuehrungskraft",
    hersteller: "Airbus",
    bedieneinheit: "TFC5000",
    deviceModes: "TMO,DMO",
    alamosIntegrated: true,
    loanable: true,
    updateNote: null,
    createdAt: new Date(1_700_000_000_000),
    updatedAt: new Date(1_700_000_000_000),
    createdBy: null,
    updatedBy: null,
    ...felder,
  };
}

describe("radio-csv: die fuenf Klassen", () => {
  it("jede der fuenf Klassen hat ein Wort", () => {
    /*
     * ⛔ DIE ZAHL 5 STEHT AUSSERHALB DER SCHLEIFE. Faellt eine Klasse aus der Liste, laeuft
     * die Schleife ueber vier und bliebe gruen — dieselbe Fehlerform wie NT11.
     */
    expect(IMPORTKLASSEN.length, "fuenf Klassen (ImportWizard.tsx:60-66)").toBe(5);

    for (const klasse of IMPORTKLASSEN) {
      expect(KLASSEN_WOERTER[klasse].wort, `${klasse}: leeres Wort`).not.toBe("");
      expect(KLASSEN_WOERTER[klasse].ton, `${klasse}: leerer Ton`).not.toBe("");
    }
  });

  it("die fuenf Woerter sind die des Bestands, zeichengleich", () => {
    // 1:1 aus `ImportWizard.tsx:61-65`. ⛔ „Aktualisiert", nicht „geändert".
    expect(KLASSEN_WOERTER.created).toEqual({ wort: "Neu", ton: "green" });
    expect(KLASSEN_WOERTER.updated).toEqual({ wort: "Aktualisiert", ton: "blue" });
    expect(KLASSEN_WOERTER.unchanged).toEqual({ wort: "Unverändert", ton: "default" });
    expect(KLASSEN_WOERTER.error).toEqual({ wort: "Fehler", ton: "red" });
    expect(KLASSEN_WOERTER["skipped-no-permission"]).toEqual({ wort: "Übersprungen", ton: "orange" });
  });

  it("die fuenf Klassen tragen fuenf VERSCHIEDENE Woerter", () => {
    /*
     * Ohne diesen Fall waere eine Zuordnung, die `updated` auf „Neu" legt, vollzaehlig UND
     * gruen — und die Vorschau zeigte fuer eine Aenderung dasselbe Etikett wie fuer eine
     * Neuanlage.
     */
    expect(new Set(IMPORTKLASSEN.map((k) => KLASSEN_WOERTER[k].wort)).size).toBe(5);
  });

  it("die Klasse traegt ihr Wort, und die Fehlerzeile zusaetzlich ihren Text", () => {
    /*
     * ⚠️ FALLE 3 (`CLAUDE.md`): `colorError === colorPrimary`. Der Fehlerton bleibt 1:1, ABER
     * er ist nicht der einzige Traeger — die Klasse hat ihr Wort, und die Fehlerzeile fuehrt
     * zusaetzlich ihren Text (`ImportWizard.tsx:286`). Dieser Fall haelt fest, dass es den
     * zweiten Traeger ueberhaupt GIBT.
     */
    const ergebnis = klassifiziereZeile({
      eingehend: { issi: "   " },
      bestehend: null,
      rolle: "admin",
    });

    expect(ergebnis.klasse).toBe("error");
    expect(ergebnis.fehler, "die Fehlerzeile traegt einen eigenen Text").toBe("Leere ISSI");
    expect(KLASSEN_WOERTER.error.wort, "und die Klasse traegt ihr Wort").toBe("Fehler");
  });
});

describe("radio-csv: die Klassifikation einer Zeile", () => {
  it("leere ISSI ergibt Fehler mit dem Wort Leere ISSI", () => {
    // `classify-import-row.ts:33-35`. ISSI ist der Pflicht-Schluessel.
    for (const issi of ["", "   ", "\t"]) {
      const ergebnis = klassifiziereZeile({ eingehend: { issi }, bestehend: null, rolle: "admin" });
      expect(ergebnis.klasse, `ISSI "${issi}"`).toBe("error");
      expect(ergebnis.fehler).toBe("Leere ISSI");
      expect(ergebnis.aenderungen).toEqual([]);
    }
  });

  it("unbekannte ISSI ergibt Neu fuer admin und Uebersprungen fuer updater", () => {
    // `classify-import-row.ts:43-49`. ⛔ Beide Rollen im selben Fall.
    const eingehend = { issi: "2001", rufname: "Neu 1", deviceType: "TPH900" };

    const alsAdmin = klassifiziereZeile({ eingehend, bestehend: null, rolle: "admin" });
    expect(alsAdmin.klasse).toBe("created");
    expect(KLASSEN_WOERTER[alsAdmin.klasse].wort).toBe("Neu");

    const alsUpdater = klassifiziereZeile({ eingehend, bestehend: null, rolle: "updater" });
    expect(alsUpdater.klasse).toBe("skipped-no-permission");
    expect(KLASSEN_WOERTER[alsUpdater.klasse].wort).toBe("Übersprungen");
    expect(alsUpdater.aenderungen, "eine uebersprungene Zeile hat keine Aenderungen").toEqual([]);
  });

  it("bei Neu sind alle alten Werte null", () => {
    /*
     * `classify-import-row.ts:47`, `:56-84`: gediffet wird gegen ein synthetisches
     * ALL-NULL-Geraet, damit die `oldValue`s `null` sind. Ohne das gaebe es fuer eine
     * Neuanlage gar keine Aenderungszeilen.
     */
    const ergebnis = klassifiziereZeile({
      eingehend: { issi: "2002", rufname: "Neu 2", location: "Lager Sued", loanable: true },
      bestehend: null,
      rolle: "admin",
    });

    expect(ergebnis.klasse).toBe("created");
    expect(ergebnis.aenderungen.length).toBe(3);
    for (const aenderung of ergebnis.aenderungen) {
      expect(aenderung.alt, `${aenderung.feld}: der alte Wert ist nicht null`).toBeNull();
    }
  });

  it("issi steht in keiner Aenderung — sie ist der Schluessel, kein Feld", () => {
    /*
     * `classify-import-row.ts:39`, woertlich: „issi is dropped here: it is the match key,
     * never a diffed/persisted field."
     */
    const bestehend = bestehendesGeraet({ issi: "1001" });
    const ergebnis = klassifiziereZeile({
      eingehend: { issi: "1001", rufname: "Anders benannt" },
      bestehend,
      rolle: "admin",
    });

    expect(ergebnis.klasse).toBe("updated");
    expect(ergebnis.aenderungen.map((a) => a.feld)).not.toContain("issi");
  });

  it("bekannte ISSI ohne Wertunterschied ergibt Unveraendert", () => {
    // `classify-import-row.ts:52-53`.
    const bestehend = bestehendesGeraet();
    const ergebnis = klassifiziereZeile({
      eingehend: { issi: "1001", rufname: "Florian Musterstadt 10-1", status: "Einsatzbereit" },
      bestehend,
      rolle: "admin",
    });

    expect(ergebnis.klasse).toBe("unchanged");
    expect(ergebnis.aenderungen).toEqual([]);
  });

  it("updater aendert bei bekannter ISSI nur die drei erlaubten Felder", () => {
    /*
     * ⛔ DER FALL, DER DIE ROLLENBEGRENZUNG IM IMPORT BELEGT (`classify-import-row.ts:40`,
     * dieselbe `filterSchreibbareFelder` aus `_lib/rollen.ts:101`).
     * ⛔ JE FELD EIN ANDERER WERT — mit einem gemeinsamen Wert waere ein Filter, der das
     * falsche Feld durchlaesst, nicht unterscheidbar.
     */
    const bestehend = bestehendesGeraet();
    const eingehend = {
      issi: "1001",
      softwareVersion: "7.0.0",
      lastUpdatedAt: "2026-08-24",
      status: "Wartung",
      rufname: "GEKAPERT",
      location: "Fremder Ort",
      loanable: false,
      tei: "00000000000000",
    };

    const alsUpdater = klassifiziereZeile({ eingehend, bestehend, rolle: "updater" });
    expect(alsUpdater.klasse).toBe("updated");
    expect(alsUpdater.aenderungen.map((a) => a.feld).sort()).toEqual([
      "lastUpdatedAt",
      "softwareVersion",
      "status",
    ]);

    // Die Gegenprobe: als Admin gehen alle sieben Feldaenderungen durch.
    const alsAdmin = klassifiziereZeile({ eingehend, bestehend, rolle: "admin" });
    expect(alsAdmin.aenderungen.map((a) => a.feld).sort()).toEqual([
      "lastUpdatedAt",
      "loanable",
      "location",
      "rufname",
      "softwareVersion",
      "status",
      "tei",
    ]);
  });
});

describe("radio-csv: die Klassifikation vieler Zeilen", () => {
  const ZUORDNUNG: Spaltenzuordnung = { issi: 0, rufname: 1, status: 2 };

  it("eine doppelte ISSI in derselben Datei ergibt beim zweiten Vorkommen Duplikat in Datei", () => {
    /*
     * `commit-service.ts:135-138`. ⛔ DAS ERSTE VORKOMMEN BLEIBT GUELTIG — der Speicher wird
     * erst NACH der Pruefung gefuellt (`:139`).
     */
    const { zeilen } = klassifiziereZeilen({
      zeilen: [
        ["1001", "Erster Treffer", "Wartung"],
        ["1001", "Zweiter Treffer", "Defekt"],
        ["1001", "Dritter Treffer", "Defekt"],
      ],
      zuordnung: ZUORDNUNG,
      bestehendNachIssi: new Map([["1001", bestehendesGeraet()]]),
      rolle: "admin",
    });

    expect(zeilen[0]?.klasse, "das erste Vorkommen bleibt gueltig").toBe("updated");
    expect(zeilen[1]?.klasse).toBe("error");
    expect(zeilen[1]?.fehler).toBe("Duplikat in Datei");
    expect(zeilen[2]?.fehler, "auch jedes weitere Vorkommen").toBe("Duplikat in Datei");
  });

  it("zwei leere ISSI ergeben zweimal Leere ISSI, nicht Duplikat in Datei", () => {
    /*
     * `commit-service.ts:135` prueft `issi !== '' && seen.has(issi)`, und `:139` nimmt die
     * leere ISSI gar nicht erst in den Speicher auf. Ohne diese Trennung truege die zweite
     * Leerzeile den falschen Fehlertext, und die bedienende Person suchte ein Duplikat, das
     * es nicht gibt.
     *
     * ⛔ DIE ZUSICHERUNG HAENGT AN BEIDEN HAELFTEN ZUGLEICH, UND DAS IST GEMESSEN: nur `:135`
     * auf `seen.has(issi)` zu verkuerzen laesst diesen Fall gruen (Sonde S-V9k, erste
     * Messung: `21 passed`), weil `:139` die leere ISSI weiterhin aus dem Speicher haelt —
     * und umgekehrt genauso. Rot wird er erst, wenn BEIDE `issi !== ''` fallen (Sonde
     * S-V9k-beide). Wer eine der beiden Haelften „aufraeumt", bekommt vom Tor also kein
     * Signal; deshalb steht der Satz hier und nicht nur in der Sondentabelle.
     */
    const { zeilen, zusammenfassung } = klassifiziereZeilen({
      zeilen: [
        ["", "Ohne Kennung A", "Wartung"],
        ["   ", "Ohne Kennung B", "Defekt"],
      ],
      zuordnung: ZUORDNUNG,
      bestehendNachIssi: new Map(),
      rolle: "admin",
    });

    expect(zeilen[0]?.fehler).toBe("Leere ISSI");
    expect(zeilen[1]?.fehler).toBe("Leere ISSI");
    expect(zusammenfassung.error).toBe(2);
  });

  it("die Zusammenfassung zaehlt alle fuenf Klassen", () => {
    // `commit-service.ts:123-129`: der Zaehler wird mit allen fuenf Klassen auf 0 angelegt.
    const { zusammenfassung } = klassifiziereZeilen({
      zeilen: [
        ["1001", "Florian Musterstadt 10-1", "Einsatzbereit"], // unchanged
        ["1001", "Doppelt", "Defekt"], // error (Duplikat)
        ["", "Ohne Kennung", "Defekt"], // error (Leere ISSI)
        ["2001", "Ganz neu", "Wartung"], // created
      ],
      zuordnung: ZUORDNUNG,
      bestehendNachIssi: new Map([["1001", bestehendesGeraet()]]),
      rolle: "admin",
    });

    expect(Object.keys(zusammenfassung).sort()).toEqual([
      "created",
      "error",
      "skipped-no-permission",
      "unchanged",
      "updated",
    ]);
    expect(zusammenfassung).toEqual({
      created: 1,
      updated: 0,
      unchanged: 1,
      error: 2,
      "skipped-no-permission": 0,
    });
  });
});

describe("radio-csv: die Zellnormalisierung", () => {
  it("ein Datum in deutscher Schreibweise und in ISO ergeben denselben Tag", () => {
    // `commit-service.ts:49-53` — beide Zweige laufen ueber dieselbe Kalenderpruefung.
    const zuordnung: Spaltenzuordnung = { issi: 0, lastUpdatedAt: 1 };

    expect(zeileZuEingehend(["1001", "24.08.2026"], zuordnung).lastUpdatedAt).toBe("2026-08-24");
    expect(zeileZuEingehend(["1001", "2026-08-24"], zuordnung).lastUpdatedAt).toBe("2026-08-24");
    // Einstellige Tages- und Monatsangaben sind zulaessig (`commit-service.ts:52`).
    expect(zeileZuEingehend(["1001", "1.9.2026"], zuordnung).lastUpdatedAt).toBe("2026-09-01");
  });

  it("ein ungueltiges Datum wird null, nie NaN", () => {
    /*
     * `commit-service.ts:58-66`: der Ueberlauf wird abgelehnt (Monat 13, Tag 32), statt
     * still weiterzurollen. Ein `NaN` in der Spalte waere ein Wert, den kein Leser mehr als
     * Fehler erkennt.
     */
    const zuordnung: Spaltenzuordnung = { issi: 0, lastUpdatedAt: 1 };

    for (const eingabe of ["32.13.2026", "2026-13-32", "irgendwann", "2026-02-30"]) {
      const wert = zeileZuEingehend(["1001", eingabe], zuordnung).lastUpdatedAt;
      expect(wert, `"${eingabe}" ergibt nicht null`).toBeNull();
      expect(String(wert), `"${eingabe}" ergibt NaN`).not.toContain("NaN");
    }
  });

  it("Geraetefunktionen kommen in der kanonischen Reihenfolge zurueck", () => {
    /*
     * `commit-service.ts:81` filtert ueber `DEVICE_MODES` — die Reihenfolge der Konstanten
     * IST die Ausgabereihenfolge, ⛔ nicht sortiert. Fixture aus dem Brief: Eingabe
     * `DMO/TMO`, Ausgabe `TMO,DMO`.
     */
    const zuordnung: Spaltenzuordnung = { issi: 0, deviceModes: 1 };

    expect(zeileZuEingehend(["1001", "DMO/TMO"], zuordnung).deviceModes).toBe("TMO,DMO");
    expect(zeileZuEingehend(["1001", "gat, rep"], zuordnung).deviceModes).toBe("REP,GAT");
    expect(zeileZuEingehend(["1001", "TMO;TMO TMO"], zuordnung).deviceModes, "dedupliziert").toBe("TMO");
  });

  it("die vier Modi stehen in der Reihenfolge des Bestands", () => {
    // `radio-admin/shared/src/constants.ts:4`, gehalten von `constants.test.ts:6`.
    expect([...GERAETE_MODI]).toEqual(["TMO", "DMO", "REP", "GAT"]);
  });

  it("ein unbekannter Modus faellt heraus", () => {
    // `commit-service.ts:81`: gefiltert wird ueber die bekannte Liste, nicht ueber die Zelle.
    const zuordnung: Spaltenzuordnung = { issi: 0, deviceModes: 1 };

    expect(zeileZuEingehend(["1001", "TMO/XYZ"], zuordnung).deviceModes).toBe("TMO");
    expect(zeileZuEingehend(["1001", "XYZ"], zuordnung).deviceModes, "kein bekannter Modus").toBeNull();
    expect(zeileZuEingehend(["1001", ""], zuordnung).deviceModes).toBeNull();
  });

  it("ein Wahrheitswert kennt acht wahre Woerter, leer ist null und alles andere ist falsch", () => {
    /*
     * `commit-service.ts:19`, `:25-29`. ⛔ ALLES ANDERE IST `false`, nicht `null` — „nein"
     * und „0" sind eine Aussage, kein fehlender Wert.
     */
    const zuordnung: Spaltenzuordnung = { issi: 0, loanable: 1 };

    for (const wahr of ["x", "X", " ja ", "yes", "y", "1", "true", "WAHR", "✓"]) {
      expect(zeileZuEingehend(["1001", wahr], zuordnung).loanable, `"${wahr}"`).toBe(true);
    }
    for (const leer of ["", "   "]) {
      expect(zeileZuEingehend(["1001", leer], zuordnung).loanable, `"${leer}"`).toBeNull();
    }
    for (const falsch of ["nein", "0", "no", "-"]) {
      expect(zeileZuEingehend(["1001", falsch], zuordnung).loanable, `"${falsch}"`).toBe(false);
    }
  });

  it("jedes andere Feld wird getrimmt, leer wird null", () => {
    // `commit-service.ts:106` (`out[field] = value === '' ? null : value`).
    const zuordnung: Spaltenzuordnung = { issi: 0, rufname: 1, notes: 2 };
    const eingehend = zeileZuEingehend(["  1001  ", "  Florian 10-1  ", "   "], zuordnung);

    expect(eingehend.issi).toBe("1001");
    expect(eingehend.rufname).toBe("Florian 10-1");
    expect(eingehend.notes).toBeNull();
  });

  it("eine fehlende Spalte in einer kurzen Zeile wird null, nicht undefined", () => {
    // `commit-service.ts:93-94`: `row[colIdx]` kann fehlen, `typeof raw === 'string'` faengt es.
    const zuordnung: Spaltenzuordnung = { issi: 0, rufname: 1, loanable: 2 };
    const eingehend = zeileZuEingehend(["1001"], zuordnung);

    expect(eingehend.issi).toBe("1001");
    expect(eingehend.rufname).toBeNull();
    expect(eingehend.loanable).toBeNull();
  });
});
