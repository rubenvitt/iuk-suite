import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { leseInhalt } from "./plan/schema";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

describe("seedLokalKommplan", () => {
  it("legt die Beispielpläne an; der zweite Lauf ändert nichts", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const anzahl = () => (db.all(sql`SELECT count(*) AS n FROM plan`) as { n: number }[])[0].n;
    expect(anzahl()).toBe(BEISPIELE.length);
    const zeilen = await seedLokalKommplan(db);
    expect(anzahl()).toBe(BEISPIELE.length);
    expect(zeilen.join("\n")).toContain("0 Pläne angelegt");
  });
  it("jeder geseedete Inhalt ist ein gültiger Plan; Vorlagen sind als Vorlage markiert", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    for (const b of BEISPIELE) {
      const z = db.select().from(plan).where(eq(plan.id, b.id)).get()!;
      expect(leseInhalt(JSON.parse(z.inhalt)).ok).toBe(true);
      expect(z.istVorlage).toBe(b.istVorlage);
    }
  });
  it("additiv: eine lokal geänderte Zeile bleibt, wie sie ist", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    db.update(plan).set({ titel: "lokal" }).where(eq(plan.id, BEISPIELE[0].id)).run();
    await seedLokalKommplan(db);
    expect(db.select().from(plan).where(eq(plan.id, BEISPIELE[0].id)).get()!.titel).toBe("lokal");
  });
});
