import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { gruppenAuswahl } from "./ansicht";
import { ladeGruppen } from "./daten";
import { wartungNav } from "./nav";
import { START } from "./startbestand";
import { testDb } from "./testDb";
import { istVerwalter, rechteAus, verwaltetGruppe } from "./zugang";

const ENV = {};

describe("Rechte der Gerätewartung", () => {
  it("Verwalter verwalten nur ihre Gruppe, aus der Datenbank aufgelöst", () => {
    const db = testDb();
    const r = rechteAus(db, ["wartung-technik"], ENV);
    expect(r).toEqual({ admin: false, gruppen: [START.gruppe.technik] });
    expect(verwaltetGruppe(r, START.gruppe.iuk)).toBe(false);
    expect(istVerwalter(r)).toBe(true);
  });

  it("Admins und der Suite-Admin verwalten alles; ohne Gruppe nur prüfen", () => {
    const db = testDb();
    expect(rechteAus(db, ["wartung-admin"], ENV).gruppen.sort()).toEqual([START.gruppe.iuk, START.gruppe.technik].sort());
    expect(rechteAus(db, ["suite-admin"], { ADMIN_GROUP: "suite-admin" }).admin).toBe(true);
    const helfer = rechteAus(db, ["helfer"], ENV);
    expect(istVerwalter(helfer)).toBe(false);
    expect(wartungNav(helfer).map((n) => n.key)).toEqual(["geraete"]);
    expect(wartungNav(rechteAus(db, ["wartung-technik"], ENV)).map((n) => n.key)).not.toContain("gruppen");
  });

  it("der Gruppenfilter kennt nur eigene Gruppen und erscheint erst ab zwei", () => {
    const db = testDb();
    const alle = ladeGruppen(db);
    const technik = rechteAus(db, ["wartung-technik"], ENV);
    expect(gruppenAuswahl(technik, alle, START.gruppe.iuk)).toEqual({ gruppen: [START.gruppe.technik], wahl: [], gewaehlt: null });
    const admin = rechteAus(db, ["wartung-admin"], ENV);
    const a = gruppenAuswahl(admin, alle, START.gruppe.iuk);
    expect(a.gruppen).toEqual([START.gruppe.iuk]);
    expect(a.wahl).toHaveLength(2);
  });
});
