import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { gemerktesZiel } from "./entnahmeZiel";

/**
 * DAS GEMERKTE ZIEL, GEGEN DIE DATENBANK AUFGELÖST — DRK-300.
 *
 * Das Cookie überlebt den ganzen Kärtchen-Zugang; die Verwaltung kann in
 * derselben Zeit ein Fahrzeug stilllegen oder löschen. Der Lesepfad ist die
 * Stelle, an der beides zusammenkommt — und die einzige Zusage, die zählt,
 * lautet: ein Ziel, das nicht mehr taugt, wird zu „noch nichts gewählt" und
 * nicht zu „Verbrauch".
 *
 * ⚠️ WÜRDE ES AUF VERBRAUCH ZURÜCKFALLEN, wäre der Schaden still und genau der,
 * den das Ticket ausschließt: der Knopf bliebe bedienbar, die nächste Entnahme
 * ginge als Verbrauch durch, und das Material läge trotzdem im Fahrzeug.
 */

let t: TestDb;

/** Die Wahl gehört ihrem Kärtchen (Review-Befund P1 zu PR #140). */
const TOKEN = "tk1";

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lese-ziel-");
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, kennung: "HH-DRK 1",
      einheitenart: "fahrzeug" },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false },
    // DRK-309: eine TASCHE als Ziel — derselbe `typ`, andere Art, und ohne
    // Kennung. Genau die Zeile, die der Name allein nicht beschreibt.
    { id: "tasche-1", name: "Rucksack Betreuung", typ: "fahrzeug", aktiv: true,
      kennung: null, einheitenart: "tasche" },
    { id: "lager-2", name: "Außenlager", typ: "lager", aktiv: true },
  ]).run();
});

afterEach(() => t.schliessen());

describe("gemerktesZiel", () => {
  /**
   * ⚠️ MIT ART UND KENNUNG (DRK-309, Reviewrunde 6). Der Name allein trug diese
   * Zeile, solange jede Einheit ein Fahrzeug war; `lagerorte.name` traegt aber
   * keinen Eindeutigkeitsschluessel, und eine Tasche heisst nicht
   * zwangslaeufig wie eine. Was hier fehlt, fehlt auf dem Schirm direkt vor der
   * Buchung — und die Wahl dahinter gilt fuer ALLE weiteren Entnahmen mit
   * demselben Kaertchen.
   */
  it("löst ein Fahrzeug mit Anzeigename, Art und Kennung auf", async () => {
    expect(gemerktesZiel(t.db, `${TOKEN}|fz:fz-1`, TOKEN)).toEqual({
      art: "fahrzeug",
      lagerortId: "fz-1",
      name: "RTW 1",
      kennung: "HH-DRK 1",
      einheitenart: "fahrzeug",
    });
  });

  it("löst eine Tasche als Tasche auf — ohne Kennung und ohne Raten", async () => {
    expect(gemerktesZiel(t.db, `${TOKEN}|fz:tasche-1`, TOKEN)).toEqual({
      art: "fahrzeug",
      lagerortId: "tasche-1",
      name: "Rucksack Betreuung",
      kennung: null,
      einheitenart: "tasche",
    });
  });

  it("gibt die Verbrauchswahl unverändert zurück — ohne die Datenbank zu fragen", async () => {
    expect(gemerktesZiel(t.db, `${TOKEN}|verbrauch`, TOKEN)).toEqual({ art: "verbrauch" });
  });

  it("meldet ein fehlendes Cookie als ungewählt", async () => {
    expect(gemerktesZiel(t.db, undefined, TOKEN)).toBeNull();
  });

  it("vergisst die Wahl eines ANDEREN Kärtchens — geteiltes Telefon, neue Schicht", async () => {
    // Ohne diese Zeile buchte die nächste Person auf das Fahrzeug der vorigen
    // Schicht, ohne je gewählt zu haben.
    expect(gemerktesZiel(t.db, `tk-vorige|fz:fz-1`, TOKEN)).toBeNull();
  });

  it("vergisst ein Ziel, das nicht mehr taugt — und fällt NICHT auf Verbrauch zurück", async () => {
    for (const wert of ["fz:fz-alt", "fz:lager-2", "fz:gibtsnicht", `fz:${HANDLAGER_ID}`]) {
      expect(gemerktesZiel(t.db, `${TOKEN}|${wert}`, TOKEN), wert).toBeNull();
    }
  });
});
