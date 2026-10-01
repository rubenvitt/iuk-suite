import { describe, expect, it } from "vitest";
import { druckseitenDaten } from "./druckdaten";
import { ladePlanLesend } from "./plaene";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }

describe("Druckdaten (Spec §5.6, §8.1)", () => {
  it("A3 teilt die große Stab-Lage auf höchstens so viele Blätter wie A4, mit A3-Rahmen", async () => {
    const db = await mitSeed();
    const plan = ladePlanLesend(db, "beispiel-grosse-stabslage")!;
    const a4 = await druckseitenDaten(db, plan, { format: "a4-quer" });
    const a3 = await druckseitenDaten(db, plan, { format: "a3-quer" });
    expect(a3.format).toBe("a3-quer");
    expect(a3.blaetter!.length).toBeLessThanOrEqual(a4.blaetter!.length);
    expect(a3.rahmen).toMatchObject({ titel: plan.titel, organisation: "Musterorganisation" });
  });
});
