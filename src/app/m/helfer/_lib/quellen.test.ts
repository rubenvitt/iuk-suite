import { describe, expect, it } from "vitest";
import { quellwechselHinweis } from "./quellen";

describe("quellwechselHinweis", () => {
  it("nennt die zu löschenden Helfer", () => {
    expect(quellwechselHinweis(3, "hiorg", false)).toBe("Die 3 Helfer der bisherigen Quelle werden gelöscht. Danach holst du die neuen unter „Abgleich“.");
  });
  it("ohne Bestand nur den nächsten Schritt", () => {
    expect(quellwechselHinweis(0, "datei", false)).toBe("Danach lädst du die Liste unter „Abgleich“ hoch.");
    expect(quellwechselHinweis(0, "hiorg", true)).toBe("Danach holst du die Helfer unter „Abgleich“.");
  });
  it("mit Zugang für Lifeline Hub und Bestand: Lifeline muss neu zuordnen (LLH-1194)", () => {
    expect(quellwechselHinweis(3, "hiorg", true)).toBe(
      "Die 3 Helfer der bisherigen Quelle werden gelöscht. Danach holst du die neuen unter „Abgleich“. " +
        "Die Personen bekommen dabei neue Kennungen: Lifeline Hub muss sie danach einmal neu zuordnen.",
    );
  });
});
