import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { lagerorte } from "./schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { handlagerOrte, ortStamm, handlagerSchraenke } from "../_lib/lesepfade/orte";

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-orte-");
  // Die Wurzel 'handlager' legt Migration 0003 bereits an — nicht erneut einfuegen.
  t.db.insert(lagerorte).values([
    { id: "schrank-gf", name: "GF-Schrank", typ: "lager", aktiv: true,
      parentId: HANDLAGER_ID, sortierung: 90, zugangshinweis: "Zugang über LvD — anrufen" },
    { id: "schrank-1", name: "Schrank 1", typ: "lager", aktiv: true,
      parentId: HANDLAGER_ID, sortierung: 10 },
    { id: "schrank-alt", name: "Altschrank", typ: "lager", aktiv: false,
      parentId: HANDLAGER_ID, sortierung: 50 },
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", aktiv: true },
  ]).run();
});

afterEach(() => t.schliessen());

describe("handlagerOrte", () => {
  it("liefert Wurzel und Schraenke nach Reihenfolge, ohne Fahrzeuge", () => {
    expect(handlagerOrte(t.db)).toEqual([HANDLAGER_ID, "schrank-1", "schrank-alt", "schrank-gf"]);
  });

  /** Ein stillgelegter Schrank bleibt im BESTAND — alles andere liesse
   *  Material verschwinden. Inaktiv heisst nur: nicht mehr waehlbar. */
  it("nimmt auch stillgelegte Schraenke mit", () => {
    expect(handlagerOrte(t.db)).toContain("schrank-alt");
  });
});

describe("handlagerSchraenke", () => {
  it("liefert ohne die Wurzel und ohne Fahrzeuge", () => {
    expect(handlagerSchraenke(t.db).map((o) => o.id))
      .toEqual(["schrank-1", "schrank-alt", "schrank-gf"]);
  });

  it("filtert auf Wunsch die stillgelegten weg", () => {
    expect(handlagerSchraenke(t.db, true).map((o) => o.id))
      .toEqual(["schrank-1", "schrank-gf"]);
  });
});

describe("ortStamm", () => {
  it("kennt jeden Ort mit Name und Hinweis", () => {
    const stamm = ortStamm(t.db);
    expect(stamm.get("schrank-gf")?.name).toBe("GF-Schrank");
    expect(stamm.get("schrank-gf")?.zugangshinweis).toBe("Zugang über LvD — anrufen");
    expect(stamm.get("schrank-1")?.zugangshinweis).toBeNull();
    expect(stamm.get("rtw-1")?.typ).toBe("fahrzeug");
  });
});
