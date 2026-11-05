import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { plan } from "../_db/schema";
import { baue } from "./beispiele/bau";
import { erreichbareVerweise, verweisZiele } from "./planverweise";
import { seedLokalKommplan } from "./seedLokal";
import { TEST_ADMIN, testDb } from "./testDb";

const ZIEL = "beispiel-einsatz-2026-02-22";
const inhaltMit = (...ids: string[]) => baue({ stellen: ids.map((id, i) => ({ id: `s${i}`, titel: `S ${i}`, planVerweis: { id, titel: id } })) });

describe("Verweise auf andere Pläne (IDA-355)", () => {
  it("erreichbar ist nur, was der Betrachter sieht — private Pläne anderer und unbekannte Kennungen nicht", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const inhalt = inhaltMit(ZIEL, "gibt-es-nicht");
    expect(erreichbareVerweise(db, inhalt, TEST_ADMIN)).toEqual([ZIEL]);
    db.update(plan).set({ sichtbarkeit: "privat", eigentuemer: "jemand-anders" }).where(eq(plan.id, ZIEL)).run();
    expect(erreichbareVerweise(db, inhalt, TEST_ADMIN)).toEqual([]);
    expect(erreichbareVerweise(db, inhalt, { nutzer: "jemand-anders", admin: false })).toEqual([ZIEL]);
    expect(erreichbareVerweise(db, baue({ stellen: [{ id: "a", titel: "A" }] }), TEST_ADMIN)).toEqual([]);
  });
  it("zur Wahl stehen sichtbare, nicht archivierte Pläne ohne Vorlagen und ohne den Plan selbst", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const ziele = verweisZiele(db, TEST_ADMIN, ZIEL);
    expect(ziele.map((z) => z.id)).not.toContain(ZIEL);
    expect(ziele.some((z) => z.id.startsWith("vorlage-"))).toBe(false);
    const anderer = ziele[0].id;
    db.update(plan).set({ archiviertAm: new Date() }).where(eq(plan.id, anderer)).run();
    expect(verweisZiele(db, TEST_ADMIN, ZIEL).map((z) => z.id)).not.toContain(anderer);
  });
});
