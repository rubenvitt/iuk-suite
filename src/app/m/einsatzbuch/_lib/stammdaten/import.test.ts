import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import {
  listeFahrzeuge, listePersonal, listeStichworte,
  speichereFahrzeug, speicherePerson, speichereStichwort,
  stammdatenVersion,
} from "./daten";
import { planeImport } from "./csv";
import { bestandFuerImport, wendeImportAn } from "./import";

describe("wendeImportAn", () => {
  it("schreibt neu und geändert, lässt unverändert und Fehler liegen; ein zweiter Lauf ändert nichts", () => {
    const db = testDb();
    speichereFahrzeug(db, null, { typ: "RTW", kennung: "11-83-1", ruf: "alt", standort: "Uelzen", aktiv: false });
    const text = "typ;kennung;ruf;standort\nRTW;11-83-1;Rotkreuz Uelzen 11-83-1;Uelzen\nMTF;11-19-1;Rotkreuz Uelzen 11-19-1;Uelzen\nMTF;;x;Uelzen";
    const plan = planeImport("fahrzeuge", text, bestandFuerImport(db));
    if (!plan.ok) throw new Error(plan.fehler);
    expect(wendeImportAn(db, plan)).toEqual({ neu: 1, geaendert: 1, unveraendert: 0, fehler: 1 });
    expect(listeFahrzeuge(db).every((f) => f.aktiv)).toBe(true);
    const v = stammdatenVersion(db);
    const zweiter = planeImport("fahrzeuge", text, bestandFuerImport(db));
    if (!zweiter.ok) throw new Error(zweiter.fehler);
    expect(wendeImportAn(db, zweiter)).toEqual({ neu: 0, geaendert: 0, unveraendert: 2, fehler: 1 });
    expect(stammdatenVersion(db)).toBe(v);
  });

  it("schreibt Personal (neu und geändert, reaktiviert)", () => {
    const db = testDb();
    speicherePerson(db, null, { name: "Meyer, Hanna", quali: "BtH", ov: "Rosche", aktiv: false });
    const text = "name;quali;ov\nMeyer, Hanna;SanH;Uelzen\nAlbers, Jana;ZF;Uelzen";
    const plan = planeImport("personal", text, bestandFuerImport(db));
    if (!plan.ok) throw new Error(plan.fehler);
    expect(wendeImportAn(db, plan)).toEqual({ neu: 1, geaendert: 1, unveraendert: 0, fehler: 0 });
    const liste = listePersonal(db);
    expect(liste.find((p) => p.name === "Meyer, Hanna")).toEqual({
      id: expect.any(String), name: "Meyer, Hanna", quali: "SanH", ov: "Uelzen", aktiv: true,
    });
    expect(liste.find((p) => p.name === "Albers, Jana")).toEqual({
      id: expect.any(String), name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true,
    });
  });

  it("schreibt Stichworte (neu und geändert), reihenfolge als Zahl", () => {
    const db = testDb();
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 5", reihenfolge: 9, aktiv: false });
    const text = "gruppe;name;reihenfolge\nMANV;MANV 5;1\nMANV;MANV 10;2";
    const plan = planeImport("stichworte", text, bestandFuerImport(db));
    if (!plan.ok) throw new Error(plan.fehler);
    expect(wendeImportAn(db, plan)).toEqual({ neu: 1, geaendert: 1, unveraendert: 0, fehler: 0 });
    const liste = listeStichworte(db);
    const manv5 = liste.find((s) => s.name === "MANV 5");
    expect(manv5).toEqual({ id: expect.any(String), gruppe: "MANV", name: "MANV 5", reihenfolge: 1, aktiv: true });
    expect(typeof manv5?.reihenfolge).toBe("number");
    const manv10 = liste.find((s) => s.name === "MANV 10");
    expect(manv10).toEqual({ id: expect.any(String), gruppe: "MANV", name: "MANV 10", reihenfolge: 2, aktiv: true });
  });
});
