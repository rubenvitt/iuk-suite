import { describe, expect, it } from "vitest";
import { geraet, inhalt, mangel } from "../_db/schema";
import { eq } from "drizzle-orm";
import { ladeGeraete } from "./daten";
import { START } from "./startbestand";
import { seedLokalWartung } from "./seedLokal";
import { testDb } from "./testDb";

describe("lokale Demodaten der Gerätewartung", () => {
  it("legt die Geräte einmal an und ist danach idempotent", async () => {
    const db = testDb();
    const jetzt = Date.UTC(2026, 10, 3, 10);
    await seedLokalWartung(db, jetzt);
    expect(db.select().from(geraet).all()).toHaveLength(10);
    expect(db.select().from(mangel).all()).toHaveLength(3);
    expect(db.select().from(inhalt).all()).toHaveLength(11);
    const zweiter = await seedLokalWartung(db, jetzt);
    expect(zweiter).toEqual(["wartung: Geräte vorhanden, nichts geändert"]);
    expect(db.select().from(geraet).all()).toHaveLength(10);
  });

  it("bringt die Materialkisten auch in eine Datenbank, die schon Geräte hat", async () => {
    const db = testDb();
    const jetzt = Date.UTC(2026, 10, 3, 10);
    await seedLokalWartung(db, jetzt);
    db.delete(geraet).where(eq(geraet.artId, START.art.kiste)).run();
    expect(await seedLokalWartung(db, jetzt)).toContain("wartung: 2 Materialkisten mit Inhaltsliste angelegt");
    const kisten = ladeGeraete(db, { gruppen: null, heute: "2026-11-03" }).filter((g) => g.kiste);
    expect(kisten.map((k) => k.fehlend).sort()).toEqual([0, 1]);
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
