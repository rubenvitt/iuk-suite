import { describe, expect, it } from "vitest";

import { falte } from "./falte";

describe("falte", () => {
  /*
   * GEMESSEN gegen die 232 Hauptrezepte: mit reiner Kleinschreibung findet
   * "loeschgruppe" 0 von 232 und "sanitaet" 0 von 22. Auf einem Tablet mit
   * Handschuhen ist das ein Ausfall, kein Komfortproblem — deshalb faltet diese
   * Funktion MEHR als lagerbuchs falte() (das ist buchstaeblich s.toLowerCase()).
   */
  it("findet Loeschgruppe ueber loeschgruppe", () => {
    expect(falte("Löschgruppe")).toBe(falte("loeschgruppe"));
  });

  it("findet Sanitaet ueber sanitaet", () => {
    expect(falte("Sanität")).toBe(falte("sanitaet"));
  });

  it("wirft Satzzeichen und Mehrfachleerzeichen weg", () => {
    expect(falte("  MLW IV / Lbw.  ")).toBe("mlw iv lbw");
  });

  it("ist idempotent", () => {
    expect(falte(falte("Führungstrupp (THW)"))).toBe(falte("Führungstrupp (THW)"));
  });
});
