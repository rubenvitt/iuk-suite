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

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lese-ziel-");
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, kennung: "HH-DRK 1" },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false },
    { id: "lager-2", name: "Außenlager", typ: "lager", aktiv: true },
  ]).run();
});

afterEach(() => t.schliessen());

describe("gemerktesZiel", () => {
  it("löst ein Fahrzeug mit seinem ANZEIGENAMEN auf", async () => {
    expect(gemerktesZiel(t.db, "fz:fz-1")).toEqual({
      art: "fahrzeug",
      lagerortId: "fz-1",
      name: "RTW 1",
    });
  });

  it("gibt die Verbrauchswahl unverändert zurück — ohne die Datenbank zu fragen", async () => {
    expect(gemerktesZiel(t.db, "verbrauch")).toEqual({ art: "verbrauch" });
  });

  it("meldet ein fehlendes Cookie als ungewählt", async () => {
    expect(gemerktesZiel(t.db, undefined)).toBeNull();
  });

  it("vergisst ein Ziel, das nicht mehr taugt — und fällt NICHT auf Verbrauch zurück", async () => {
    for (const wert of ["fz:fz-alt", "fz:lager-2", "fz:gibtsnicht", `fz:${HANDLAGER_ID}`]) {
      expect(gemerktesZiel(t.db, wert), wert).toBeNull();
    }
  });
});
