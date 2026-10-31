import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, bzGeraete, geraete, lagerorte, o2Flaschen } from "../_db/schema";
import { suiteSuche } from "./suiteSuche";

const JETZT = new Date("2026-10-31T08:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-suche-");
  t.db.insert(lagerorte).values([
    { id: "rtw1", name: "RTW 11-83-1", typ: "fahrzeug", kennung: "UE-RK 831" },
    { id: "keller", name: "Kellerlager Süd", typ: "lager" },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Mullbinde 8 cm", einheit: "Stk.", fach: "A3", kategorie: "Verbandmaterial", createdAt: JETZT },
    { id: "a2", name: "Rettungsdecke", einheit: "Stk.", fach: "B1", aktiv: false, createdAt: JETZT },
  ]).run();
  t.db.insert(geraete).values({ id: "g1", typ: "medizin", barcode: "4006381333931", name: "Absaugpumpe", lagerortId: "rtw1", createdAt: JETZT }).run();
  t.db.insert(bzGeraete).values({ id: "bz1", barcode: "BZ-0815", name: "BZ-Messgerät Accu", lagerortId: "rtw1", createdAt: JETZT }).run();
  t.db.insert(o2Flaschen).values({ id: "o1", name: "O2 2 l RTW", lagerortId: "rtw1", createdAt: JETZT }).run();
});

afterEach(() => t.schliessen());

const sitzung = (groups: string[]): Session => ({ user: { id: "u1", name: "Test", groups }, expires: "2099-01-01" } as Session);
const darf = sitzung(["lagerbuch-admin"]);

describe("suiteSuche (lagerbuch) — Rechte", () => {
  it("nur die Verwaltungsgruppe; der Suite-Admin zählt hier nicht mit (`istLagerbuchAdmin`)", () => {
    expect(suiteSuche("Mull", null, t.db)).toBeNull();
    expect(suiteSuche("Mull", sitzung(["fahrzeuge-nutzer"]), t.db)).toBeNull();
    expect(suiteSuche("Mull", sitzung([process.env.ADMIN_GROUP ?? "admin"]), t.db)).toBeNull();
    expect(suiteSuche("Mull", darf, t.db)?.treffer).toHaveLength(1);
  });
});

describe("suiteSuche (lagerbuch) — Felder und Ziele", () => {
  it("Artikel nach Name und Kategorie, mit Link auf die Schublade", () => {
    const [a] = suiteSuche("verband", darf, t.db)!.treffer;
    expect(a).toMatchObject({ art: "Artikel", titel: "Mullbinde 8 cm", pfad: "/verwaltung/artikel?artikel=a1" });
  });

  it("inaktive Artikel mit Status", () => {
    const [a] = suiteSuche("rettungsdecke", darf, t.db)!.treffer;
    expect(a.merkmale).toContainEqual({ etikett: "Status", wert: "inaktiv" });
  });

  it("Geräte und BZ-Geräte nach Barcode, mit Ort", () => {
    const [g] = suiteSuche("4006381333931", darf, t.db)!.treffer;
    expect(g).toMatchObject({ art: "Medizingerät", pfad: "/verwaltung/geraete/g1" });
    expect(g.merkmale).toContainEqual({ etikett: "Ort", wert: "RTW 11-83-1" });
    expect(suiteSuche("bz-0815", darf, t.db)!.treffer[0].pfad).toBe("/verwaltung/bz/bz1");
  });

  it("O2-Flaschen und Lagerorte; ein Fahrzeug auch über sein Kennzeichen", () => {
    expect(suiteSuche("O2 2 l", darf, t.db)!.treffer[0].pfad).toBe("/verwaltung/sauerstoff/o1");
    expect(suiteSuche("ue-rk 831", darf, t.db)!.treffer).toEqual([
      expect.objectContaining({ art: "Fahrzeug", pfad: "/verwaltung/fahrzeuge/rtw1" }),
    ]);
    expect(suiteSuche("SÜD", darf, t.db)!.treffer).toEqual([
      expect.objectContaining({ art: "Lagerort", pfad: "/verwaltung/lagerorte" }),
    ]);
  });
});
