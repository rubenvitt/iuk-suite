import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { BereitgestelltesFahrzeug, Fahrzeugbereitstellung } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { lagerorte } from "../_db/schema";

const { stamm } = vi.hoisted(() => ({ stamm: { fahrzeuge: [] as BereitgestelltesFahrzeug[], wirft: false } }));
vi.mock("@/app/m/fahrzeuge/_lib/bereitstellung", async (echtes) => ({
  ...(await echtes<typeof import("@/app/m/fahrzeuge/_lib/bereitstellung")>()),
  bereitgestellteFahrzeuge: () => {
    if (stamm.wirft) throw new Error("fahrzeuge.db gesperrt");
    return { fahrzeuge: stamm.fahrzeuge, stand: null };
  },
}));

import { einheitName, planeStammGegenBestand, stammAuswahl, wendeStammAbgleichAn } from "./stammAbgleich";

const s = (id: string, teil: Partial<BereitgestelltesFahrzeug> = {}): BereitgestelltesFahrzeug => ({
  id, art: "fahrzeug", typ: "RTW", funkrufname: `Rotkreuz Uelzen 11-83-${id}`, funkkenner: `11-83-${id}`,
  kennzeichen: `UE-RK 83${id}`, standort: "Uelzen", aktiv: true, ...teil,
});
const b = (...fahrzeuge: BereitgestelltesFahrzeug[]): Fahrzeugbereitstellung => ({ fahrzeuge, stand: null });

let t: TestDb;
beforeEach(() => {
  stamm.fahrzeuge = [];
  stamm.wirft = false;
  t = migrierteTestDb("lagerbuch-stammabgleich-");
  t.db.insert(lagerorte).values([
    { id: "e1", name: "RTW 1", typ: "fahrzeug", einheitenart: "fahrzeug", kennung: null },
    { id: "e2", name: "Alter Bus", typ: "fahrzeug", einheitenart: null },
    { id: "t1", name: "Notfallrucksack", typ: "fahrzeug", einheitenart: "tasche" },
  ]).run();
});
afterEach(() => t.schliessen());

const einheit = (id: string) => t.db.select().from(lagerorte).where(eq(lagerorte.id, id)).get();

describe("einheitName", () => {
  it("Typ und Funkkenner, ohne Funkkenner der Funkrufname", () => {
    expect(einheitName(s("1"))).toBe("RTW 11-83-1");
    expect(einheitName(s("1", { funkkenner: null }))).toBe("Rotkreuz Uelzen 11-83-1");
  });
});

describe("Abgleich mit der Fahrzeugverwaltung", () => {
  it("verknüpft über den Erstimport, übernimmt Name und Kennzeichen und lässt Taschen weg", () => {
    const plan = planeStammGegenBestand(t.db, b(s("1"), s("2")), { e1: "1" });
    expect(plan.zeilen.map((z) => [z.id, z.klasse])).toEqual([["e1", "verknuepfen"], ["e2", "nicht_verknuepft"]]);
    expect(plan.ohneEinheit).toBe(1);
    expect(wendeStammAbgleichAn(t.db, plan)).toEqual({ verknuepft: 1, geaendert: 0, deaktiviert: 0 });
    expect(einheit("e1")).toMatchObject({ name: "RTW 11-83-1", kennung: "UE-RK 831", stammId: "1", aktiv: true });
    expect(planeStammGegenBestand(t.db, b(s("1")), {}).zeilen.find((z) => z.id === "e1")?.klasse).toBe("unveraendert");
  });

  it("der Verweis an der Einheit gewinnt gegen den Erstimport, und eine Umbenennung kommt an", () => {
    t.db.update(lagerorte).set({ stammId: "1" }).where(eq(lagerorte.id, "e1")).run();
    const plan = planeStammGegenBestand(t.db, b(s("1", { typ: "KTW" })), { e1: "2" });
    expect(plan.zeilen.find((z) => z.id === "e1")).toMatchObject({ klasse: "geaendert", name: "KTW 11-83-1" });
  });

  it("außer Dienst in der Fahrzeugverwaltung → hier stillgelegt; eine nicht zugeordnete Altzeile wird Fahrzeug", () => {
    const plan = planeStammGegenBestand(t.db, b(s("1"), s("2", { aktiv: false })), { e1: "1", e2: "2" });
    wendeStammAbgleichAn(t.db, plan);
    expect(einheit("e2")).toMatchObject({ aktiv: false, stammId: "2", einheitenart: "fahrzeug" });
  });

  it("zwei Einheiten für ein Fahrzeug: die zweite bleibt, wie sie ist, und wird gemeldet", () => {
    const plan = planeStammGegenBestand(t.db, b(s("1")), { e1: "1", e2: "1" });
    expect(plan.zeilen.map((z) => z.klasse).sort()).toEqual(["doppelt", "verknuepfen"]);
  });

  it("„kein Fahrzeug“ aus dem Erstimport wird als offen mit Hinweis gezeigt", () => {
    const plan = planeStammGegenBestand(t.db, b(), { e2: null });
    expect(plan.zeilen.find((z) => z.id === "e2")?.hinweis).toContain("kein Fahrzeug");
  });
});

describe("stammAuswahl — für „Neue Einheit“", () => {
  it("nur aktive Stammfahrzeuge ohne Einheit", () => {
    t.db.update(lagerorte).set({ stammId: "1" }).where(eq(lagerorte.id, "e1")).run();
    stamm.fahrzeuge = [s("1"), s("2"), s("3", { aktiv: false })];
    expect(stammAuswahl(t.db)).toEqual([{ id: "2", name: "RTW 11-83-2", kennzeichen: "UE-RK 832" }]);
  });

  it("ist die Fahrzeugverwaltung nicht lesbar, ist die Auswahl leer statt eines Fehlers", () => {
    stamm.wirft = true;
    expect(stammAuswahl(t.db)).toEqual([]);
  });
});
