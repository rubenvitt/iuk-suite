import { describe, expect, it } from "vitest";
import { kategorieNormalisieren, kategorieOptionen, kategorieSchluessel } from "./kategorie";

describe("kategorieNormalisieren", () => {
  it("trimmt und macht aus leer oder nur Leerzeichen „ohne Kategorie“", () => {
    expect(kategorieNormalisieren("  Hygiene ")).toBe("Hygiene");
    expect(kategorieNormalisieren("")).toBeNull();
    expect(kategorieNormalisieren("   ")).toBeNull();
    expect(kategorieNormalisieren(null)).toBeNull();
    expect(kategorieNormalisieren(undefined)).toBeNull();
  });

  it("laesst die Schreibweise stehen — gross schreiben ist keine Normalisierung", () => {
    expect(kategorieNormalisieren("sanitätsmaterial")).toBe("sanitätsmaterial");
  });
});

describe("kategorieSchluessel", () => {
  it("faltet ueber die EINE Faltung des Moduls, samt Umlauten", () => {
    expect(kategorieSchluessel("Sanitätsmaterial")).toBe(kategorieSchluessel("SANITÄTSMATERIAL"));
    expect(kategorieSchluessel(" Hygiene ")).toBe("hygiene");
  });
});

describe("kategorieOptionen", () => {
  it("fasst Schreibweisen zusammen, laesst „ohne Kategorie“ weg und sortiert deutsch", () => {
    expect(kategorieOptionen(["Hygiene", null, "Ärztliches", "hygiene", "Technik", "Hygiene"]))
      .toEqual([
        { schluessel: "ärztliches", label: "Ärztliches" },
        { schluessel: "hygiene", label: "Hygiene" },
        { schluessel: "technik", label: "Technik" },
      ]);
  });

  it("nimmt fuer die Beschriftung die haeufigste Schreibweise", () => {
    expect(kategorieOptionen(["hygiene", "Hygiene", "Hygiene"]))
      .toEqual([{ schluessel: "hygiene", label: "Hygiene" }]);
    expect(kategorieOptionen(["hygiene", "hygiene", "Hygiene"]))
      .toEqual([{ schluessel: "hygiene", label: "hygiene" }]);
  });

  it("entscheidet einen Gleichstand deterministisch statt nach Eingabereihenfolge", () => {
    expect(kategorieOptionen(["hygiene", "Hygiene"]))
      .toEqual(kategorieOptionen(["Hygiene", "hygiene"]));
  });
});
