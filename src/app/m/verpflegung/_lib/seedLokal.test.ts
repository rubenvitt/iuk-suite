import { describe, expect, it } from "vitest";
import { charge, helferLink, lagerort } from "../_db/schema";
import { ladeSicht } from "./daten";
import { tagInZone } from "./heute";
import { seedLokalVerpflegung } from "./seedLokal";
import { testDb } from "./testDb";

describe("lokale Demodaten des Verpflegungslagers", () => {
  it("legt das Lager einmal an und ist danach idempotent", async () => {
    const db = testDb();
    const jetzt = Date.UTC(2026, 10, 4, 10);
    const erst = await seedLokalVerpflegung(db, jetzt);
    expect(erst.join("\n")).toMatch(/\/t\/[0-9A-Z-]{34}/);
    expect(db.select().from(lagerort).all()).toHaveLength(4);
    const chargen = db.select().from(charge).all().length;
    expect((await seedLokalVerpflegung(db, jetzt))[0]).toMatch(/nichts geändert/);
    expect(db.select().from(charge).all()).toHaveLength(chargen);
    expect(db.select().from(helferLink).all()).toHaveLength(1);
  });

  it("zeigt jede Ampel, auch gesperrte Ware", async () => {
    const db = testDb();
    const jetzt = Date.UTC(2026, 10, 4, 10);
    await seedLokalVerpflegung(db, jetzt);
    const s = ladeSicht(db, tagInZone(jetzt)).chargen;
    expect(new Set(s.map((c) => c.status.ampel))).toEqual(new Set(["ok", "gelb", "rot"]));
    expect(s.some((c) => c.status.abgelaufen)).toBe(true);
    expect(s.some((c) => c.status.gesperrt)).toBe(true);
  });
});
