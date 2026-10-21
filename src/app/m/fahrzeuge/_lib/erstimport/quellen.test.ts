import { describe, expect, it } from "vitest";
import { ausEinsatzbuch, ausFunkgeraeten, ausLagerbuch } from "./quellen";

describe("Umrechnung der App-Zeilen", () => {
  it("Einsatzbuch: Typ, Ruf und Standort, der Funkkenner aus der Kennung", () => {
    expect(ausEinsatzbuch({ id: "e1", typ: "RTW", kennung: "11/83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: false })).toMatchObject({
      quelle: "einsatzbuch", quellId: "e1", anzeige: "RTW 11/83-1", funkkenner: "11-83-1", standort: "Uelzen", hinweis: "im Einsatzbuch deaktiviert",
    });
  });

  it("Lagerbuch: die Kennung ist das Kennzeichen, der Funkkenner steckt allenfalls im Namen", () => {
    expect(ausLagerbuch({ id: "l1", name: "RTW 11/83-1", kennung: "UE-RK 831", einheitenart: null, aktiv: true })).toMatchObject({
      funkkenner: "11-83-1", kennzeichen: "UE-RK 831", typ: null, hinweis: "im Lagerbuch nicht als Fahrzeug oder Tasche zugeordnet",
    });
  });

  it("Funkgeräte: der Ort ist die Zeile, die Zahl der Geräte der Hinweis", () => {
    expect(ausFunkgeraeten({ ort: "RTW 1", geraete: 1 })).toMatchObject({ quellId: "RTW 1", hinweis: "1 Funkgerät", funkkenner: null });
    expect(ausFunkgeraeten({ ort: "RTW 1", geraete: 3 }).hinweis).toBe("3 Funkgeräte");
  });
});
