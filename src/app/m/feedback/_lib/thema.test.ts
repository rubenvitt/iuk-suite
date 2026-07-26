import { describe, expect, it } from "vitest";
import { thema } from "./thema";

/**
 * `evenings.topic` ist optional — und "kein Thema" kommt in ZWEI Gestalten:
 * `null` aus dem Admin-Pfad (das Formular normalisiert leer zu `null`) und der
 * leere bzw. weisse String aus dem IMPORT der Alt-Anwendung, der das nicht tut.
 * `topic ?? …` faengt nur die erste. Die Folge war eine leere H1 auf dem
 * Abendzettel: die Ueberschrift der Seite, die den Abend benennen soll.
 */
describe("thema", () => {
  it("nimmt das Thema, wenn eines da ist — unveraendert", () => {
    expect(thema("Funk-Übung: Sprechgruppen", "Rückfall")).toBe("Funk-Übung: Sprechgruppen");
    // Getrimmt wird die PRUEFUNG, nicht die Anzeige: was die Gruppenleitung
    // geschrieben hat, steht auch so auf dem Zettel.
    expect(thema(" Kartenkunde ", "Rückfall")).toBe(" Kartenkunde ");
  });

  it("faellt bei `null` und `undefined` zurueck", () => {
    expect(thema(null, "Dienstabend am 22. Juli")).toBe("Dienstabend am 22. Juli");
    expect(thema(undefined, "Dienstabend am 22. Juli")).toBe("Dienstabend am 22. Juli");
  });

  it("faellt auch beim LEEREN und beim reinen Leerraum-Thema zurueck", () => {
    expect(thema("", "Rückfall")).toBe("Rückfall");
    expect(thema("   ", "Rückfall")).toBe("Rückfall");
    expect(thema("\n\t", "Rückfall")).toBe("Rückfall");
  });
});
