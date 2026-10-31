import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { setzeAktiv, speichereFahrzeug } from "./daten";
import { fahrzeugEingabe } from "./eingabe";
import { suiteSuche } from "./suiteSuche";
import { testDb } from "./testDb";

const RTW = { art: "fahrzeug", typ: "RTW", funkrufname: "Rotkreuz Uelzen 11-83-1", funkkenner: "11-83-1", kennzeichen: "UE-RK 831", standort: "Uelzen", bemerkung: "Wache Nord", aktiv: true };
const KTW = { ...RTW, typ: "KTW", funkrufname: "Rotkreuz Uelzen 11-85-1", funkkenner: "11-85-1", kennzeichen: "UE-RK 851", standort: "Bad Bevensen", bemerkung: "" };

const sitzung = (groups: string[]): Session => ({ user: { id: "u1", name: "Test", groups }, expires: "2099-01-01" } as Session);

function bestand() {
  const db = testDb();
  speichereFahrzeug(db, null, fahrzeugEingabe.parse(RTW));
  const ktw = speichereFahrzeug(db, null, fahrzeugEingabe.parse(KTW));
  return { db, ktw };
}

describe("suiteSuche (fahrzeuge) — Rechte", () => {
  it("ohne Sitzung und ohne Zugangsgruppe: null, nicht „keine Treffer“", () => {
    const { db } = bestand();
    expect(suiteSuche("RTW", null, db)).toBeNull();
    expect(suiteSuche("RTW", sitzung(["lagerbuch-admin"]), db)).toBeNull();
  });

  it("mit Nutzer- oder Admin-Gruppe: Treffer", () => {
    const { db } = bestand();
    expect(suiteSuche("RTW", sitzung(["fahrzeuge-nutzer"]), db)?.treffer).toHaveLength(1);
    expect(suiteSuche("RTW", sitzung(["fahrzeuge-admin"]), db)?.treffer).toHaveLength(1);
  });
});

describe("suiteSuche (fahrzeuge) — Felder", () => {
  const darf = sitzung(["fahrzeuge-nutzer"]);

  it("findet Kennzeichen, Funkkenner und Standort, ohne Rücksicht auf Groß- und Kleinschreibung", () => {
    const { db } = bestand();
    expect(suiteSuche("ue-rk 831", darf, db)?.treffer.map((t) => t.titel)).toEqual(["Rotkreuz Uelzen 11-83-1"]);
    expect(suiteSuche("85-1", darf, db)?.treffer.map((t) => t.titel)).toEqual(["Rotkreuz Uelzen 11-85-1"]);
    expect(suiteSuche("bevensen", darf, db)?.treffer).toHaveLength(1);
  });

  it("nicht in der Bemerkung — die ist eine Notiz der Verwaltung", () => {
    const { db } = bestand();
    expect(suiteSuche("Wache Nord", darf, db)?.treffer).toEqual([]);
  });

  it("zeigt außer Dienst gestellte Fahrzeuge mit Status", () => {
    const { db, ktw } = bestand();
    setzeAktiv(db, ktw.id, false);
    const [t] = suiteSuche("KTW", darf, db)!.treffer;
    expect(t.merkmale).toContainEqual({ etikett: "Status", wert: "außer Dienst" });
    expect(t.pfad).toBe("/");
  });
});
