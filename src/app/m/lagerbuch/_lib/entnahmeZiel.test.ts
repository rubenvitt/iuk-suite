import { describe, it, expect } from "vitest";
import { ZIEL_COOKIE, zielAusWert, zielWert } from "./entnahmeZiel";

/**
 * DRK-300 — die DREI Zustände des Entnahmeziels, und warum es drei sind.
 *
 * „Noch nichts gewählt" und „ausdrücklich kein Fahrzeug" sind fachlich NICHT
 * dasselbe (Betreiberentscheidung, ClickUp-Kommentar zu DRK-300): der erste
 * Zustand darf nicht buchen, der zweite bucht Verbrauch. Ein Entwurf mit zwei
 * Zuständen — `string | null` — kann diesen Unterschied nicht tragen, und der
 * Verlust wäre still: ein vergessenes Ziel bucht dann bei JEDEM Vergessen
 * Verbrauch, und niemand merkt es.
 *
 * Deshalb steht die Unterscheidung in einer eigenen, DB-freien Datei: sie ist
 * in einem Test ohne Datenbank, ohne Request und ohne Rendern prüfbar.
 */
describe("zielAusWert", () => {
  it("liest ein Fahrzeug aus dem Cookie", () => {
    expect(zielAusWert("fz:abc123")).toEqual({ art: "fahrzeug", lagerortId: "abc123" });
  });

  it("liest die ausdrückliche Verbrauchswahl", () => {
    expect(zielAusWert("verbrauch")).toEqual({ art: "verbrauch" });
  });

  it("meldet ein FEHLENDES Cookie als ungewählt — nicht als Verbrauch", () => {
    // ⚠️ DER TRAGENDE FALL. Gäbe diese Zeile `{ art: "verbrauch" }` zurück,
    // wäre die ganze Unterscheidung wirkungslos und der Bruch unsichtbar:
    // jede Entnahme vor der ersten Wahl buchte stillschweigend Verbrauch.
    expect(zielAusWert(undefined)).toBeNull();
    expect(zielAusWert("")).toBeNull();
  });

  it("meldet einen unlesbaren Wert als ungewählt", () => {
    // Ein alter, ein fremder oder ein von Hand gesetzter Wert führt zur Wahl
    // zurück — er darf NIE als Fahrzeug durchgehen.
    expect(zielAusWert("kaputt")).toBeNull();
    expect(zielAusWert("fz:")).toBeNull();
  });

  it("verwechselt ein Fahrzeug namens „verbrauch“ nicht mit der Verbrauchswahl", () => {
    // Das Präfix ist der Grund, warum die ID nicht roh im Cookie steht:
    // `lagerorte.id` trägt bei importiertem Altbestand beliebige Zeichenketten.
    expect(zielAusWert("fz:verbrauch")).toEqual({ art: "fahrzeug", lagerortId: "verbrauch" });
  });
});

describe("zielWert", () => {
  it("schreibt, was `zielAusWert` wieder liest", () => {
    for (const ziel of [
      { art: "fahrzeug", lagerortId: "fz-1" },
      { art: "verbrauch" },
    ] as const) {
      expect(zielAusWert(zielWert(ziel))).toEqual(ziel);
    }
  });
});

describe("ZIEL_COOKIE", () => {
  it("heißt nicht wie das Sitzungscookie", () => {
    // Ein gleicher Name überschriebe die laufende Helfer-Sitzung — und der
    // Schaden wäre eine ausgesperrte Helferin am Regal.
    expect(ZIEL_COOKIE).not.toBe("helfer_session");
  });
});
