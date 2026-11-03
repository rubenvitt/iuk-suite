import { describe, expect, it } from "vitest";
import { geraet, mangel } from "../_db/schema";
import { ladeGeraete } from "./daten";
import { seedLokalWartung } from "./seedLokal";
import { testDb } from "./testDb";

describe("lokale Demodaten der Gerätewartung", () => {
  it("legt die Geräte einmal an und ist danach idempotent", async () => {
    const db = testDb();
    const jetzt = Date.UTC(2026, 10, 3, 10);
    await seedLokalWartung(db, jetzt);
    expect(db.select().from(geraet).all()).toHaveLength(8);
    expect(db.select().from(mangel).all()).toHaveLength(2);
    const zweiter = await seedLokalWartung(db, jetzt);
    expect(zweiter[0]).toMatch(/nichts geändert/);
    expect(db.select().from(geraet).all()).toHaveLength(8);
  });

  it("zeigt jeden Zustand einmal", async () => {
    const db = testDb();
    await seedLokalWartung(db, Date.UTC(2026, 10, 3, 10));
    const g = ladeGeraete(db, { gruppen: null, heute: "2026-11-03" });
    expect(new Set(g.map((x) => x.zustand))).toEqual(new Set(["ok", "mangel", "defekt"]));
    expect(g.some((x) => x.naechste?.stufe === "ueberfaellig")).toBe(true);
    expect(g.some((x) => x.naechste?.stufe === "bald")).toBe(true);
  });
});
