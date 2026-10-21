import { describe, expect, it } from "vitest";
import { fahrzeug } from "../_db/schema";
import { einsatzbuchFahrzeuge } from "./fahrzeugbestand";
import { testDb } from "./testDb";

describe("einsatzbuchFahrzeuge — was das Einsatzbuch der Fahrzeugverwaltung herausgibt", () => {
  it("alle Fahrzeuge mit genau diesen Feldern, auch die deaktivierten", () => {
    const db = testDb();
    db.insert(fahrzeug).values([
      { id: "f1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" },
      { id: "f2", typ: "KTW", kennung: "11-85-1", ruf: "Rotkreuz Uelzen 11-85-1", standort: "Uelzen", aktiv: false },
    ]).run();
    const liste = einsatzbuchFahrzeuge(db);
    expect(liste.map((f) => [f.id, f.aktiv])).toEqual([["f1", true], ["f2", false]]);
    expect(Object.keys(liste[0]).sort()).toEqual(["aktiv", "id", "kennung", "ruf", "standort", "typ"]);
  });
});
