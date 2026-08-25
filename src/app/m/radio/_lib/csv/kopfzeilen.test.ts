// src/app/m/radio/_lib/csv/kopfzeilen.test.ts
import { describe, it, expect } from "vitest";
import { IMPORTIERBARE_FELDER, SYNONYME, automatischeSpaltenzuordnung } from "./kopfzeilen";

/**
 * Die neunundvierzig normalisierten Synonyme MIT IHREM ZIELFELD, 1:1 aus
 * `auto-map-headers.ts:36-89` und in derselben Reihenfolge.
 *
 * ⛔ SIE STEHEN HIER EIN ZWEITES MAL, UND DAS IST ABSICHT. Ein Test, der die Liste aus der
 * Datei laese, die er prueft, waere gegen jede Aenderung immun — dieselbe Fehlerform wie ein
 * Waechter, der seine eigene Erwartung aus dem Pruefling zieht.
 *
 * ⛔ UND SIE STEHEN HIER MIT ZIELFELD, NICHT NUR ALS NAMEN. Bis Fix-Runde 1 pruefte der
 * Waechter je Synonym nur, DASS es abbildet, nicht WOHIN — gemessen (Review V9, Fund F1):
 * vierundzwanzig der neunundvierzig liessen sich still auf ein fremdes Feld umbiegen, ohne
 * dass eine der drei Testdateien rot wurde.
 *
 * ⚠️ DREI PAARE SEHEN WIE EIN FEHLER AUS UND SIND KEINER — wer sie „repariert", aendert den
 * Bestand und nicht diesen Test:
 *
 *   - `letztesupdate -> softwareVersion` (`auto-map-headers.ts:81`). Es klingt nach
 *     `lastUpdatedAt`, und genau das ist die Falle: eine Kundendatei mit der Spalte
 *     „Letztes Update" schriebe dann ein Datum in die Softwareversion.
 *   - `ausleihe` und `leihbar -> loanable` (`:70-71`) — beide sind Verleihbarkeit, keine Leihe.
 *   - `zustaendig -> assignedTo` (`:74`) mit „ae": „Zuständig" zerfaellt unter NFD zu
 *     `zustandig` und bleibt UNZUGEORDNET. Der Fall dazu steht weiter unten.
 */
const ERWARTETE_SYNONYME: Record<string, string> = {
  issi: "issi",
  tei: "tei",
  kennung: "issi",
  funkrufnameissi: "issi",
  rufname: "rufname",
  funkrufname: "rufname",
  seriennummer: "serialNumber",
  seriennr: "serialNumber",
  inventarnummer: "serialNumber",
  serial: "serialNumber",
  geraetetyp: "deviceType",
  geraet: "deviceType",
  gerat: "deviceType",
  typ: "deviceType",
  modell: "deviceType",
  status: "status",
  zustand: "status",
  standort: "location",
  lagerort: "location",
  ort: "location",
  location: "location",
  hiorgid: "hiorgId",
  opta: "opta",
  funktion: "funktion",
  hersteller: "hersteller",
  bedieneinheit: "bedieneinheit",
  alamos: "alamosIntegrated",
  alamosintegriert: "alamosIntegrated",
  alamosintegration: "alamosIntegrated",
  ausleihbar: "loanable",
  ausleihe: "loanable",
  leihbar: "loanable",
  zuordnung: "assignedTo",
  zugeordnet: "assignedTo",
  zustaendig: "assignedTo",
  assignedto: "assignedTo",
  softwareversion: "softwareVersion",
  swversion: "softwareVersion",
  firmware: "softwareVersion",
  fwversion: "softwareVersion",
  version: "softwareVersion",
  letztesupdate: "softwareVersion",
  zuletztaktualisiert: "lastUpdatedAt",
  updatedatum: "lastUpdatedAt",
  aktualisiertam: "lastUpdatedAt",
  notizen: "notes",
  notiz: "notes",
  bemerkung: "notes",
  notes: "notes",
};

/**
 * DIE AUTOMATISCHE SPALTENERKENNUNG, 1:1 aus
 * `radio-admin/shared/src/import/auto-map-headers.ts`.
 *
 * ⛔ DER KUNDENKOPF IST DER EINZIGE BELEG, DASS DIE TABELLE MIT ECHTEN DATEN FUNKTIONIERT.
 * Er steht woertlich im Alt-Test (`auto-map-headers.test.ts:63-92`) und wandert deshalb
 * zeichengleich mit — inklusive seiner Umlaute, die als Bildschirmtext aus dem Bestand
 * ausdruecklich zulaessig sind.
 */

describe("radio-csv: die importierbaren Felder", () => {
  it("es sind neunzehn, und keines davon ist ein System- oder Identitaetsfeld", () => {
    /*
     * `auto-map-headers.ts:1` sagt den Grund: „Device columns a CSV may target (no
     * system/identity-internal fields)". ⛔ Die Zahl steht ausserhalb jeder Schleife.
     */
    expect(IMPORTIERBARE_FELDER.length, "neunzehn Felder (auto-map-headers.ts:2-22)").toBe(19);

    const felder = IMPORTIERBARE_FELDER as readonly string[];
    expect(felder).toContain("issi");
    expect(felder).toContain("softwareVersion");
    for (const verboten of ["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "updateNote"]) {
      expect(felder, `${verboten} ist ein System- oder Identitaetsfeld`).not.toContain(verboten);
    }
  });
});

describe("radio-csv: die Synonymtabelle", () => {
  it("sie traegt genau die neunundvierzig Paare des Bestands, Ziel fuer Ziel", () => {
    /*
     * ⛔ DIE TAFEL WIRD ALS GANZES GEHALTEN, NICHT ABGETASTET. `toEqual` ueber der ganzen
     * Konstanten faengt alle drei Aenderungsformen, und jede einzeln nachgemessen
     * (Fix-Runde 1 zu Review V9, Funde F1/F2/F3):
     *
     *   - ein Synonym auf ein fremdes Feld umgebogen (`letztesupdate -> lastUpdatedAt`),
     *   - ein Eintrag HINZUGEFUEGT (`inventarnr` als fuenfzigster),
     *   - ein Schluessel DOPPELT vergeben (`typ` ein zweites Mal).
     *
     * ⛔ DER DOPPELTE SCHLUESSEL IST DER UNSCHEINBARSTE, UND SEIN MECHANISMUS IST NICHT DER,
     * DEN DER KOMMENTAR HIER FRUEHER BEHAUPTETE. `auto-map-headers.ts:35` sagt „Order matters
     * for 'first wins'", aber ein Objektliteral kennt kein „first wins" — der zweite Eintrag
     * UEBERSCHREIBT still den ersten. Die Tafel traegt danach ACHTUNDVIERZIG Schluessel statt
     * neunundvierzig, und genau diese Mengendifferenz faerbt `toEqual`. Die frueher hier
     * behauptete Faerbung ueber eine Zahl war gemessen falsch: sie zaehlte das Array DIESES
     * Tests, nicht die Tafel.
     */
    expect(SYNONYME, "neunundvierzig Paare (auto-map-headers.ts:36-89)").toEqual(ERWARTETE_SYNONYME);
    expect(Object.keys(SYNONYME).length, "neunundvierzig Schluessel, keiner doppelt").toBe(49);
  });

  it("jedes der neunundvierzig Synonyme kommt durch die Zuordnung auf SEIN Feld", () => {
    /*
     * ⛔ DER ZWEITE HALBE SCHRITT: die Tafel oben belegt den INHALT, dieser Fall die
     * VERDRAHTUNG. Ohne ihn koennte `automatischeSpaltenzuordnung` die Tafel gar nicht mehr
     * lesen und beide Zusicherungen blieben gruen.
     */
    for (const [kopf, ziel] of Object.entries(ERWARTETE_SYNONYME)) {
      expect(automatischeSpaltenzuordnung([kopf])[kopf], `Synonym "${kopf}" bildet nicht auf ${ziel} ab`).toBe(
        ziel,
      );
    }

    /*
     * ⛔ ACHTZEHN DER NEUNZEHN FELDER. Das fehlende ist `deviceModes` — es hat als einziges
     * KEINEN Tabelleneintrag und kommt ausschliesslich ueber die Praefixregel
     * (`auto-map-headers.ts:104-107`). Ohne diese Zahl fiele es niemandem auf, wenn jemand
     * die Praefixregel entfernte und dafuer einen Tabelleneintrag setzte — der Kundenkopf
     * `Gerätefunktionen-TMO/DMO/REP/GAT` fiele dann still aus der Zuordnung.
     */
    const alleZiele = new Set(Object.values(SYNONYME));
    expect(alleZiele.size, "achtzehn der neunzehn Felder; deviceModes laeuft ueber den Praefix").toBe(18);
    expect(alleZiele.has("deviceModes"), "deviceModes hat KEINEN Tabelleneintrag").toBe(false);
  });
});

describe("radio-csv: die Kopfzeilenzuordnung", () => {
  it("der echte Kundenkopf wird vollstaendig abgebildet", () => {
    // 1:1 aus `auto-map-headers.test.ts:63-92`, zwoelf Kopfzeilen.
    const koepfe = [
      "Hiorg-ID",
      "OPTA",
      "ISSI",
      "Funktion",
      "Lagerort",
      "Hersteller",
      "Gerät",
      "Bedieneinheit",
      "Gerätefunktionen-TMO/DMO/REP/GAT",
      "Status",
      "Bemerkung",
      "Alamos",
    ];

    expect(automatischeSpaltenzuordnung(koepfe)).toEqual({
      "Hiorg-ID": "hiorgId",
      OPTA: "opta",
      ISSI: "issi",
      Funktion: "funktion",
      Lagerort: "location",
      Hersteller: "hersteller",
      "Gerät": "deviceType",
      Bedieneinheit: "bedieneinheit",
      "Gerätefunktionen-TMO/DMO/REP/GAT": "deviceModes",
      Status: "status",
      Bemerkung: "notes",
      Alamos: "alamosIntegrated",
    });
  });

  it("Geraetefunktionen wird per Praefix erkannt, in beiden Umlautzerlegungen", () => {
    /*
     * `auto-map-headers.ts:104-107`. Der Kommentar dort nennt beide Haelften: der Kopf
     * normalisiert zu einem LANGEN Token (Schraegstriche und Bindestriche fallen weg),
     * deshalb Praefix statt exaktem Namen — und das a-Umlaut zerfaellt unter NFD zu „a",
     * nicht zu „ae", deshalb sind beide Schreibungen registriert.
     */
    const mitUmlaut = "Gerätefunktionen-TMO/DMO/REP/GAT";
    const ohneUmlaut = "Geraetefunktionen TMO DMO";

    expect(automatischeSpaltenzuordnung([mitUmlaut])[mitUmlaut]).toBe("deviceModes");
    expect(automatischeSpaltenzuordnung([ohneUmlaut])[ohneUmlaut]).toBe("deviceModes");
    // Der blosse Kopf ohne Anhang trifft ebenfalls — der Export schreibt genau ihn.
    expect(automatischeSpaltenzuordnung(["Gerätefunktionen"])["Gerätefunktionen"]).toBe("deviceModes");
  });

  it("TEI bildet auf tei ab, nicht auf issi", () => {
    /*
     * `auto-map-headers.ts:38-40`: „TEI is the hardware identity and has its own column — it
     * is NOT an issi alias (it mapped to issi only while no tei field existed)." Der
     * Alt-Test faehrt denselben Fall (`server/test/deviceTei.test.ts:82`).
     */
    expect(automatischeSpaltenzuordnung(["ISSI", "TEI"])).toEqual({ ISSI: "issi", TEI: "tei" });
  });

  it("zwei Synonyme desselben Feldes bilden beide ab", () => {
    /*
     * ⛔ KEIN DEDUP (`auto-map-headers.ts:95-98`): „This does NOT dedup by target field …
     * Resolving such collisions to a single source column is the caller's responsibility."
     */
    expect(automatischeSpaltenzuordnung(["Typ", "Modell"])).toEqual({
      Typ: "deviceType",
      Modell: "deviceType",
    });
  });

  it("ein unbekannter Kopf bleibt ohne Eintrag", () => {
    /*
     * `auto-map-headers.ts:93-95` („Headers whose normalized name matches no known synonym
     * are omitted (left for manual mapping in the UI)") und `:109-111` (`if (field) { … }`).
     */
    const erkannt = automatischeSpaltenzuordnung(["ISSI", "Kostenstelle", ""]);

    expect(erkannt).toEqual({ ISSI: "issi" });
    expect(Object.keys(erkannt), "der unbekannte Kopf darf keinen Schluessel bekommen").toEqual(["ISSI"]);
  });

  it("die Normalisierung wirft alles ausser Kleinbuchstaben und Ziffern weg", () => {
    // `auto-map-headers.ts:26-33`: NFD, Diakritika entfernen, klein, nur `[a-z0-9]`.
    expect(automatischeSpaltenzuordnung(["  hiorg id  "])["  hiorg id  "]).toBe("hiorgId");
    expect(automatischeSpaltenzuordnung(["Serien-Nr."])["Serien-Nr."]).toBe("serialNumber");
    expect(automatischeSpaltenzuordnung(["SOFTWARE-VERSION"])["SOFTWARE-VERSION"]).toBe("softwareVersion");
  });

  it("die Diakritika-Zerlegung trifft NUR die registrierte Schreibung", () => {
    /*
     * ⛔ DER FALL GEGEN DIE ERFINDUNG. „Zuständig" zerfaellt unter NFD zu `zustandig`, und
     * die Tabelle fuehrt `zustaendig` (`auto-map-headers.ts:74`) — der Kopf bleibt also
     * UNZUGEORDNET, obwohl er wie ein Treffer aussieht. Wer hier einen zweiten Eintrag
     * ergaenzt, erweitert die Alt-Tabelle; das waere kein Port mehr.
     */
    expect(automatischeSpaltenzuordnung(["Zuständig"])).toEqual({});
    expect(automatischeSpaltenzuordnung(["Zustaendig"])["Zustaendig"]).toBe("assignedTo");
  });

  it("beide Schreibungen von Geraet treffen denselben Zweig", () => {
    // `auto-map-headers.ts:49-52` — `gerat` UND `geraet` sind eingetragen.
    expect(automatischeSpaltenzuordnung(["Gerät"])["Gerät"]).toBe("deviceType");
    expect(automatischeSpaltenzuordnung(["Geraet"])["Geraet"]).toBe("deviceType");
  });
});
