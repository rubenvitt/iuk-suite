import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { listeFahrzeuge, speichereFahrzeug, stammdatenVersion } from "./daten";
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
});
