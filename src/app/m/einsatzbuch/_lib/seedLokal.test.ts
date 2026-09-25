import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testDb";
import { seedLokalEinsatzbuch } from "./seedLokal";
import { echtesPaar } from "./schluessel/paar";
import { ENTWICKLUNGS_KEK } from "./schluessel/kek";
import { schluesselStatus } from "./schluessel/status";

const TABELLEN = ["fahrzeug", "person", "stichwort", "einstellung", "schluesselpaar", "audit_outbox"];
const zaehle = (db: ReturnType<typeof testDb>) => Object.fromEntries(TABELLEN.map((t) => [t, (db.all(sql.raw(`SELECT count(*) AS n FROM ${t}`)) as { n: number }[])[0].n]));
const version = (db: ReturnType<typeof testDb>) => (db.all(sql`SELECT version FROM stammdatenstand`) as { version: number }[])[0].version;

describe("seedLokalEinsatzbuch", () => {
  it("füllt Stammdaten und Entwicklungs-Paar; der zweite Lauf ändert nichts (alle Tabellen, Outbox, Version)", async () => {
    const db = testDb();
    await seedLokalEinsatzbuch(db, {});
    const erst = zaehle(db); const v = version(db);
    expect(erst).toMatchObject({ fahrzeug: 56, person: 112, stichwort: 12, schluesselpaar: 1 });
    const zeilen = await seedLokalEinsatzbuch(db, {});
    expect(zaehle(db)).toEqual(erst);
    expect(version(db)).toBe(v);
    expect(zeilen.join("\n")).toContain("0 Fahrzeuge angelegt");
    expect(await schluesselStatus(db, { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK })).toMatchObject({ kek: "ok", paar: "ok" });
  });
  it("mit fremdem KEK in der Umgebung legt er kein Paar an", async () => {
    const db = testDb();
    const zeilen = await seedLokalEinsatzbuch(db, { EINSATZBUCH_SCHLUESSEL_KEK: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=" });
    expect(echtesPaar(db)).toBeUndefined();
    expect(zeilen.join("\n")).toContain("Schlüsselpaar übersprungen");
  });
  it("ändert keine vorhandene Zeile (additiv)", async () => {
    const db = testDb();
    await seedLokalEinsatzbuch(db, {});
    db.run(sql`UPDATE fahrzeug SET ruf = 'umbenannt' WHERE id = '11-83-1'`);
    await seedLokalEinsatzbuch(db, {});
    expect((db.all(sql`SELECT ruf FROM fahrzeug WHERE id = '11-83-1'`) as { ruf: string }[])[0].ruf).toBe("umbenannt");
  });
});
