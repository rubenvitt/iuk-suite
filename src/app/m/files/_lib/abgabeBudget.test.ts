import { registerAuditFunctions } from "@/core/audit/context";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as schema from "../_db/schema";
import { inboxFiles, zugangslinks } from "../_db/schema";
import { behalteAbschnittVor, belegeDateiplatz, gibAbschnittFrei, wandleInVerbrauchUm } from "./abgabeBudget";
import { FILES_CHUNK_BYTES } from "./grenzen";

/**
 * Die Rechnung des Kontingents offener Abgaben (DRK-288) ohne HTTP. Der Weg
 * durch die Route steht in `api/u/[token]/upload/route.test.ts`; hier stehen die
 * Faelle, die dort nur in einem Wettlauf erreichbar waeren.
 */

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
let ablage: string;
let datenVorher: string | undefined;

const LINK = "LinkAAAA01";

beforeEach(() => {
  datenVorher = process.env.DATA_DIR;
  ablage = mkdtempSync(join(tmpdir(), "files-abgabe-budget-"));
  process.env.DATA_DIR = ablage;
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/files/_db/migrations" });
  db.insert(zugangslinks)
    .values({
      id: LINK,
      name: "Übung",
      tokenStart: "dz-abcd",
      tokenHash: "hash",
      createdAt: new Date(),
      createdBy: "test",
      expiresAt: new Date(Date.now() + 3600_000),
      budgetDateien: 2,
      budgetBytes: 100,
    })
    .run();
});

afterEach(() => {
  sqlite.close();
  if (datenVorher === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = datenVorher;
  rmSync(ablage, { recursive: true, force: true });
});

function zeile(id: string): typeof inboxFiles.$inferInsert {
  return {
    id,
    tokenId: LINK,
    dateiname: `${id}.png`,
    size: 0,
    empfangenAt: new Date(),
    bytesVollstaendigAt: null,
    avStatus: "scanning",
  };
}

function link() {
  return db
    .select({ dateien: zugangslinks.verbrauchtDateien, bytes: zugangslinks.verbrauchtBytes })
    .from(zugangslinks)
    .get();
}

describe("belegeDateiplatz", () => {
  it("belegt genau so viele Plätze, wie das Budget hat — offene zählen mit", () => {
    expect(belegeDateiplatz(db, LINK, zeile("Datei00001"))).toEqual({ art: "neu" });
    expect(belegeDateiplatz(db, LINK, zeile("Datei00002"))).toEqual({ art: "neu" });
    expect(belegeDateiplatz(db, LINK, zeile("Datei00003"))).toEqual({ art: "voll" });
    expect(db.select({ id: inboxFiles.id }).from(inboxFiles).all()).toHaveLength(2);
  });

  it("ein unbekannter Link belegt nichts", () => {
    expect(belegeDateiplatz(db, "Unbekannt1", zeile("Datei00001"))).toEqual({ art: "voll" });
  });

  it("derselbe Idempotenzschlüssel findet die Abgabe wieder, statt einen Platz zu belegen (DRK-448)", () => {
    const mitSchluessel = (id: string) => ({ ...zeile(id), abgabeSchluessel: "S".repeat(22) });
    expect(belegeDateiplatz(db, LINK, mitSchluessel("Datei00001"))).toEqual({ art: "neu" });
    expect(belegeDateiplatz(db, LINK, mitSchluessel("Datei00002"))).toMatchObject({
      art: "vorhanden",
      id: "Datei00001",
      abgeschlossen: false,
    });
    // Der zweite Platz ist frei geblieben — eine andere Datei bekommt ihn noch.
    expect(belegeDateiplatz(db, LINK, zeile("Datei00003"))).toEqual({ art: "neu" });
    expect(db.select({ id: inboxFiles.id }).from(inboxFiles).all()).toHaveLength(2);
  });
});

describe("behalteAbschnittVor", () => {
  it("hält höchstens einen Abschnitt fest, und nie mehr, als frei ist", async () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    const v = await behalteAbschnittVor(db, LINK, "Datei00001", 0);
    expect(v).toEqual({ ok: true, obergrenze: Math.min(100, FILES_CHUNK_BYTES), bindend: "budget" });
    await gibAbschnittFrei(LINK, "Datei00001");
  });

  it("zählt den laufenden Vorbehalt einer anderen Datei, bis er freigegeben ist", async () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    belegeDateiplatz(db, LINK, zeile("Datei00002"));
    const a = await behalteAbschnittVor(db, LINK, "Datei00001", 0);
    expect(a).toMatchObject({ ok: true, obergrenze: 100 });

    // Solange A laeuft, bleibt fuer B nichts — B darf null Bytes schreiben.
    expect(await behalteAbschnittVor(db, LINK, "Datei00002", 0)).toMatchObject({ ok: true, obergrenze: 0 });
    await gibAbschnittFrei(LINK, "Datei00002");

    // A gibt frei, ohne ein Byte geschrieben zu haben: jetzt ist alles frei.
    await gibAbschnittFrei(LINK, "Datei00001");
    expect(await behalteAbschnittVor(db, LINK, "Datei00002", 0)).toMatchObject({ ok: true, obergrenze: 100 });
    await gibAbschnittFrei(LINK, "Datei00002");
  });

  it("hält nie mehr fest, als der Chunk ankündigt", async () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    expect(await behalteAbschnittVor(db, LINK, "Datei00001", 5, 10)).toEqual({
      ok: true,
      obergrenze: 15,
      bindend: "abschnitt",
    });
    await gibAbschnittFrei(LINK, "Datei00001");
  });

  it("weist ab, wenn schon die liegenden Bytes nicht mehr ins Budget passen", async () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    expect(await behalteAbschnittVor(db, LINK, "Datei00001", 101)).toEqual({ ok: false });
  });
});

describe("wandleInVerbrauchUm", () => {
  it("bucht und schließt ab — in einem Schritt", () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    expect(
      wandleInVerbrauchUm(db, LINK, "Datei00001", { bytes: 40, mimeType: "image/png", jetzt: new Date() }),
    ).toBe(true);
    expect(link()).toEqual({ dateien: 1, bytes: 40 });
    const z = db.select({ size: inboxFiles.size, fertig: inboxFiles.bytesVollstaendigAt }).from(inboxFiles).get();
    expect(z?.size).toBe(40);
    expect(z?.fertig).not.toBeNull();
  });

  it("ist die Zeile nicht mehr offen, bleibt auch die Buchung aus — nichts zählt doppelt", () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    const erst = { bytes: 40, mimeType: "image/png", jetzt: new Date() };
    expect(wandleInVerbrauchUm(db, LINK, "Datei00001", erst)).toBe(true);
    expect(wandleInVerbrauchUm(db, LINK, "Datei00001", erst)).toBe(false);
    expect(link()).toEqual({ dateien: 1, bytes: 40 });
  });

  it("reicht das Budget nicht (seit dem Vorbehalt gesenkt), bucht es nichts und schließt nichts ab", () => {
    belegeDateiplatz(db, LINK, zeile("Datei00001"));
    sqlite.prepare("UPDATE zugangslinks SET budget_bytes = 10").run();
    expect(
      wandleInVerbrauchUm(db, LINK, "Datei00001", { bytes: 40, mimeType: "image/png", jetzt: new Date() }),
    ).toBe(false);
    expect(link()).toEqual({ dateien: 0, bytes: 0 });
    expect(db.select({ fertig: inboxFiles.bytesVollstaendigAt }).from(inboxFiles).get()?.fertig).toBeNull();
  });
});
