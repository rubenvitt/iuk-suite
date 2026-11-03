import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import type { DirectoryResult } from "@/core/directory";
import { gruppenAuswahl } from "./ansicht";
import { ladeGruppen } from "./daten";
import { wartungNav } from "./nav";
import { ladeVerwalter, merkePerson, verwalterEntfernen, verwalterHinzufuegen, vorschlaege } from "./personen";
import { START } from "./startbestand";
import { testDb } from "./testDb";
import { hatWartungZugang, istVerwalter, rechteAus, verwaltetGruppe } from "./zugang";

const ENV = {};
const OHNE_VERZEICHNIS: DirectoryResult = { status: "unconfigured", people: [] };

/** Eine Datenbank, in der `sub-technik` Technik verwaltet (IDA-337: Zuordnung im Modul, nicht in Pocket ID). */
function mitVerwalter() {
  const db = testDb();
  merkePerson(db, "sub-technik", "Verwalter Technik");
  verwalterHinzufuegen(db, START.gruppe.technik, "sub-technik", 1, OHNE_VERZEICHNIS);
  return db;
}

describe("Rechte der Gerätewartung", () => {
  it("Modulzugang: wartung-nutzer oder wartung-admin, der Suite-Admin zählt mit", () => {
    expect(hatWartungZugang(["wartung-nutzer"], ENV)).toBe(true);
    expect(hatWartungZugang(["wartung-admin"], ENV)).toBe(true);
    expect(hatWartungZugang(["suite-admin"], { ADMIN_GROUP: "suite-admin" })).toBe(true);
    expect(hatWartungZugang(["helfer"], ENV)).toBe(false);
    expect(hatWartungZugang(null, ENV)).toBe(false);
  });

  it("Verwalter verwalten nur ihre Gruppe, aus der Datenbank nach der Person aufgelöst", () => {
    const db = mitVerwalter();
    const r = rechteAus(db, ["wartung-nutzer"], "sub-technik", ENV);
    expect(r).toEqual({ admin: false, gruppen: [START.gruppe.technik] });
    expect(verwaltetGruppe(r, START.gruppe.iuk)).toBe(false);
    expect(istVerwalter(r)).toBe(true);
    // Eine Pocket-ID-Gruppe gleichen Namens macht niemanden zum Verwalter.
    expect(istVerwalter(rechteAus(db, ["wartung-technik"], "sub-andere", ENV))).toBe(false);
    expect(istVerwalter(rechteAus(db, ["wartung-nutzer"], null, ENV))).toBe(false);
  });

  it("Admins und der Suite-Admin verwalten alles; ohne Zuordnung nur prüfen", () => {
    const db = mitVerwalter();
    expect(rechteAus(db, ["wartung-admin"], null, ENV).gruppen.sort()).toEqual([START.gruppe.iuk, START.gruppe.technik].sort());
    expect(rechteAus(db, ["suite-admin"], null, { ADMIN_GROUP: "suite-admin" }).admin).toBe(true);
    const helfer = rechteAus(db, ["wartung-nutzer"], "sub-helfer", ENV);
    expect(istVerwalter(helfer)).toBe(false);
    expect(wartungNav(helfer).map((n) => n.key)).toEqual(["geraete"]);
    expect(wartungNav(rechteAus(db, ["wartung-nutzer"], "sub-technik", ENV)).map((n) => n.key)).not.toContain("gruppen");
  });

  it("der Gruppenfilter kennt nur eigene Gruppen und erscheint erst ab zwei", () => {
    const db = mitVerwalter();
    const alle = ladeGruppen(db);
    const technik = rechteAus(db, ["wartung-nutzer"], "sub-technik", ENV);
    expect(gruppenAuswahl(technik, alle, START.gruppe.iuk)).toEqual({ gruppen: [START.gruppe.technik], wahl: [], gewaehlt: null });
    const admin = rechteAus(db, ["wartung-admin"], null, ENV);
    const a = gruppenAuswahl(admin, alle, START.gruppe.iuk);
    expect(a.gruppen).toEqual([START.gruppe.iuk]);
    expect(a.wahl).toHaveLength(2);
  });
});

describe("Verwalter zuordnen", () => {
  it("nur bekannte Personen; doppelt zuordnen legt nichts doppelt an; Entfernen nimmt das Recht", () => {
    const db = mitVerwalter();
    expect(() => verwalterHinzufuegen(db, START.gruppe.iuk, "sub-unbekannt", 2, OHNE_VERZEICHNIS)).toThrow(/unbekannt/);
    verwalterHinzufuegen(db, START.gruppe.technik, "sub-technik", 2, OHNE_VERZEICHNIS);
    expect(ladeVerwalter(db).get(START.gruppe.technik)).toEqual([{ nutzer: "sub-technik", name: "Verwalter Technik" }]);
    expect(ladeGruppen(db).find((g) => g.id === START.gruppe.technik)?.verwalter).toHaveLength(1);
    verwalterEntfernen(db, START.gruppe.technik, "sub-technik");
    expect(istVerwalter(rechteAus(db, ["wartung-nutzer"], "sub-technik", ENV))).toBe(false);
  });

  it("das Verzeichnis liefert Personen, die das Modul nie geöffnet haben", () => {
    const db = testDb();
    const verzeichnis: DirectoryResult = { status: "ok", people: [{ userId: "sub-neu", name: "Neue Verwalterin", email: "neu@example.test" }] };
    expect(vorschlaege(db, START.gruppe.iuk, "ne", verzeichnis).map((v) => v.nutzer)).toEqual(["sub-neu"]);
    verwalterHinzufuegen(db, START.gruppe.iuk, "sub-neu", 1, verzeichnis);
    expect(vorschlaege(db, START.gruppe.iuk, "ne", verzeichnis)).toEqual([]);
    expect(vorschlaege(db, START.gruppe.iuk, "n", verzeichnis)).toEqual([]);
  });
});
