import { describe, expect, it } from "vitest";
import { anfrage, mitglied, vorhaben } from "../_db/schema";
import { seedLokalGemeinschaft } from "./seedLokal";
import { testDb } from "./testDb";

describe("lokale Demodaten der Gemeinschaft", () => {
  it("legt alles einmal an und ist danach idempotent", async () => {
    const db = testDb();
    await seedLokalGemeinschaft(db as never);
    expect(db.select().from(mitglied).all()).toHaveLength(8);
    expect(db.select().from(vorhaben).all()).toHaveLength(8);
    expect(db.select().from(anfrage).all()).toHaveLength(6);
    const zweiter = await seedLokalGemeinschaft(db as never);
    expect(zweiter[0]).toMatch(/nichts geändert/);
    expect(db.select().from(mitglied).all()).toHaveLength(8);
  });
});
