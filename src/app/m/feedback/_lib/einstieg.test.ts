import { describe, it, expect } from "vitest";
import { einstiegZiel } from "./einstieg";

/**
 * DAS PRÄDIKAT HINTER ZWEI SEITEN (§3.1 Redirect, §4.1 Breadcrumb).
 *
 * Der Wert dieses Tests liegt nicht in den vier Zeilen Logik, sondern darin,
 * dass Einstieg und Cockpit dieselbe Funktion fragen: sobald eine Seite ihr
 * eigenes „genau eine Gruppe" rechnet, leitet der eine Weg weiter, während der
 * andere noch einen Krümel zurück auf denselben Weg anbietet — eine Schleife.
 */
describe("einstiegZiel", () => {
  it("nennt bei genau einer Gruppe und ohne Voll-Admin die Ziel-ID", () => {
    expect(einstiegZiel([42], false)).toBe(42);
  });

  it("nennt ab zwei Gruppen kein Ziel — dort ist die Liste eine Entscheidung", () => {
    expect(einstiegZiel([42, 43], false)).toBeNull();
  });

  it("nennt ohne Gruppe kein Ziel — der Einstieg zeigt den Leerzustand", () => {
    expect(einstiegZiel([], false)).toBeNull();
  });

  it("nennt fuer den Voll-Admin mit genau einer Gruppe kein Ziel (§3.1 Ausnahme)", () => {
    // Sonst kaeme ein Admin mit einer Gruppe nie an „Gruppenvergleich" und
    // „+ Neue Gruppe" — und im Cockpit muss die Breadcrumb deshalb bleiben.
    expect(einstiegZiel([42], true)).toBeNull();
    expect(einstiegZiel("all", true)).toBeNull();
  });

  it("nennt bei `all` auch ohne Admin-Flag kein Ziel", () => {
    expect(einstiegZiel("all", false)).toBeNull();
  });
});
