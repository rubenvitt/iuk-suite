// src/app/m/radio/_lib/csv/kopfzeilen.test.ts
import { describe, it, expect } from "vitest";
import { IMPORTIERBARE_FELDER, automatischeSpaltenzuordnung } from "./kopfzeilen";

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
