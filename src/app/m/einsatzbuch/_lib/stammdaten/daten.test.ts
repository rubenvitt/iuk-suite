import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "./schemas";
import {
  NichtGefunden, SchonVergeben, listeFahrzeuge, listePersonal, listeStichworte, setzeAktiv,
  speichereFahrzeug, speicherePerson, speichereStichwort, stammdatenVersion,
} from "./daten";

const FZ = { typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen", aktiv: true };

describe("Stammdaten", () => {
  it("legt an, ändert, deaktiviert und zählt die Version hoch", () => {
    const db = testDb();
    const f = speichereFahrzeug(db, null, FZ);
    expect(stammdatenVersion(db)).toBe(1);
    speichereFahrzeug(db, f.id, { ...FZ, ruf: "Rotkreuz Uelzen 83-1" });
    setzeAktiv(db, "fahrzeuge", f.id, false);
    expect(listeFahrzeuge(db)).toEqual([{ ...FZ, id: f.id, ruf: "Rotkreuz Uelzen 83-1", aktiv: false }]);
    expect(stammdatenVersion(db)).toBe(3);
  });
  it("doppelte Kennung bzw. doppelter Stichwortname → SchonVergeben", () => {
    const db = testDb();
    speichereFahrzeug(db, null, FZ);
    expect(() => speichereFahrzeug(db, null, FZ)).toThrow(SchonVergeben);
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 10", reihenfolge: 2, aktiv: true });
    expect(() => speichereStichwort(db, null, { gruppe: "Sonstiges", name: "MANV 10", reihenfolge: 1, aktiv: true })).toThrow(SchonVergeben);
  });
  it("unbekannte ID → NichtGefunden", () => {
    const db = testDb();
    expect(() => speichereFahrzeug(db, "gibt-es-nicht", FZ)).toThrow(NichtGefunden);
    expect(() => setzeAktiv(db, "personal", "gibt-es-nicht", false)).toThrow(NichtGefunden);
  });
  it("sortiert: Fahrzeuge nach Standort/Kennung, Personal nach Name (de), Stichworte nach Gruppe/Reihenfolge", () => {
    const db = testDb();
    speicherePerson(db, null, { name: "Voß, Anke", quali: "SanH", ov: "Uelzen", aktiv: true });
    speicherePerson(db, null, { name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true });
    expect(listePersonal(db).map((p) => p.name)).toEqual(["Albers, Jana", "Voß, Anke"]);
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 25", reihenfolge: 3, aktiv: true });
    speichereStichwort(db, null, { gruppe: "MANV", name: "MANV 5", reihenfolge: 1, aktiv: true });
    expect(listeStichworte(db).map((s) => s.name)).toEqual(["MANV 5", "MANV 25"]);
  });
});

describe("Eingabeschemas", () => {
  it("trimmt und verlangt Pflichtfelder", () => {
    expect(fahrzeugEingabe.parse({ ...FZ, typ: "  RTW " }).typ).toBe("RTW");
    expect(fahrzeugEingabe.safeParse({ ...FZ, kennung: "" }).success).toBe(false);
  });
  it("Name nur als „Nachname, Vorname“", () => {
    expect(personEingabe.safeParse({ name: "Jana Albers", quali: "ZF", ov: "Uelzen", aktiv: true }).success).toBe(false);
    expect(personEingabe.safeParse({ name: "Albers, Jana", quali: "ZF", ov: "Uelzen", aktiv: true }).success).toBe(true);
  });
  it("Reihenfolge ist eine ganze Zahl von 0 bis 9999", () => {
    expect(stichwortEingabe.safeParse({ gruppe: "RD", name: "RD 1", reihenfolge: 1.5, aktiv: true }).success).toBe(false);
  });
});
