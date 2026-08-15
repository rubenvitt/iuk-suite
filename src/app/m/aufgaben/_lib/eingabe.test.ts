import { describe, expect, it } from "vitest";
import {
  istGueltigeDauerMinuten,
  istGueltigeNachweisArt,
  istGueltigePrioritaet,
  istGueltigeRolle,
  istGueltigerIsoTag,
  istGueltigeUhrzeit,
} from "./eingabe";

/*
 * FIX-RUNDE 1 (Review, Punkt 4): `_lib/eingabe.ts` war die einzige Logikdatei in `_lib/` ohne
 * eigene Testdatei — insbesondere der Ruecktransport gegen den Kalender-Rollover
 * (`istGueltigerIsoTag`) war nur ausserhalb der Suite gegengerechnet, nicht abgesichert.
 */

describe("istGueltigerIsoTag", () => {
  it("akzeptiert einen echten Kalendertag im Format YYYY-MM-DD", () => {
    expect(istGueltigerIsoTag("2026-08-20")).toBe(true);
  });

  it("lehnt ein anderes Textformat ab (deutsches Datum)", () => {
    expect(istGueltigerIsoTag("20.08.2026")).toBe(false);
  });

  it("lehnt einen erfundenen Tag ab, den new Date() stillschweigend vorrollt (30. Februar)", () => {
    expect(istGueltigerIsoTag("2026-02-30")).toBe(false);
  });

  it("lehnt den 29. Februar in einem Nicht-Schaltjahr ab", () => {
    expect(istGueltigerIsoTag("2025-02-29")).toBe(false);
  });

  it("akzeptiert den 29. Februar in einem Schaltjahr", () => {
    expect(istGueltigerIsoTag("2024-02-29")).toBe(true);
  });

  it("lehnt einen Monat ausserhalb 01-12 ab", () => {
    expect(istGueltigerIsoTag("2026-13-01")).toBe(false);
  });

  it("lehnt einen leeren String ab", () => {
    expect(istGueltigerIsoTag("")).toBe(false);
  });
});

describe("istGueltigeUhrzeit", () => {
  it("akzeptiert HH:MM mit fuehrender Null", () => {
    expect(istGueltigeUhrzeit("09:00")).toBe(true);
  });

  it("akzeptiert die spaeteste gueltige Uhrzeit 23:59", () => {
    expect(istGueltigeUhrzeit("23:59")).toBe(true);
  });

  it("lehnt 24:00 ab — Stunden gehen nur bis 23", () => {
    expect(istGueltigeUhrzeit("24:00")).toBe(false);
  });

  it("lehnt Minuten ab 60 ab", () => {
    expect(istGueltigeUhrzeit("12:60")).toBe(false);
  });

  it("verlangt zwei Stellen fuer die Stunde — „9:00“ ohne fuehrende Null ist ungueltig", () => {
    expect(istGueltigeUhrzeit("9:00")).toBe(false);
  });

  it("lehnt Freitext ab", () => {
    expect(istGueltigeUhrzeit("9 Uhr")).toBe(false);
  });
});

describe("istGueltigeDauerMinuten", () => {
  it("akzeptiert eine positive Ganzzahl", () => {
    expect(istGueltigeDauerMinuten(30)).toBe(true);
  });

  it("lehnt 0 ab", () => {
    expect(istGueltigeDauerMinuten(0)).toBe(false);
  });

  it("lehnt eine negative Zahl ab", () => {
    expect(istGueltigeDauerMinuten(-5)).toBe(false);
  });

  it("lehnt eine Kommazahl ab", () => {
    expect(istGueltigeDauerMinuten(1.5)).toBe(false);
  });

  it("lehnt NaN ab", () => {
    expect(istGueltigeDauerMinuten(Number.NaN)).toBe(false);
  });
});

describe("istGueltigePrioritaet", () => {
  it("akzeptiert die drei Werte aus PRIORITAETEN", () => {
    expect(istGueltigePrioritaet("hoch")).toBe(true);
    expect(istGueltigePrioritaet("mittel")).toBe(true);
    expect(istGueltigePrioritaet("niedrig")).toBe(true);
  });

  it("lehnt einen erfundenen Wert ab", () => {
    expect(istGueltigePrioritaet("dringend")).toBe(false);
  });
});

describe("istGueltigeNachweisArt", () => {
  it("akzeptiert die beiden Werte aus NACHWEIS_ARTEN", () => {
    expect(istGueltigeNachweisArt("text")).toBe(true);
    expect(istGueltigeNachweisArt("bild")).toBe(true);
  });

  it("lehnt einen erfundenen Wert ab (Video ist vertagt, Spec §2)", () => {
    expect(istGueltigeNachweisArt("video")).toBe(false);
  });
});

describe("istGueltigeRolle", () => {
  it("akzeptiert die zwei Werte aus ROLLEN", () => {
    expect(istGueltigeRolle("auftrag")).toBe(true);
    expect(istGueltigeRolle("bufdi")).toBe(true);
  });

  it("lehnt einen erfundenen Wert ab", () => {
    expect(istGueltigeRolle("admin")).toBe(false);
  });

  /*
   * DER ABGESCHAFFTE WERT WIRD AUSDRUECKLICH ABGELEHNT (Quellenwechsel 2026-08-15): `koordination`
   * kommt nicht mehr aus der Modultabelle, sondern aus der Auth-Gruppe. Diese Zeile ist kein
   * Selbstzweck — sie riegelt den Weg ab, ueber den der Wert zurueckkaeme: `personAnlegenAction`
   * prueft jede Formulareingabe mit GENAU DIESER Funktion, und ein handgeschriebenes POST mit
   * `rolle=koordination` waere sonst eine Zeile, die weder Migration `0002` noch `ROLLE_TEXT` noch
   * `ROLLEN_RANG` kennt.
   */
  it("lehnt den abgeschafften Wert `koordination` ab — er kommt aus der Gruppe, nicht aus der Tabelle", () => {
    expect(istGueltigeRolle("koordination")).toBe(false);
  });
});
