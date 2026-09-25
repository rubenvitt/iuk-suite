import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { migrateAllModules } from "@/core/bootstrap";

/** 16 Hex-Zeichen (`schluesselpaar_id_hex`), abgeleitet aus `id` statt frei erfunden. */
const alsSchluesselId = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 16);

const DIR = "./.data/einsatzbuch-actions-rechner-test";
let gruppen: string[] | null = null;
let host = "einsatzbuch.localtest.me";
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { sub: "s1", name: "Jana Albers", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const JETZT = new Date("2026-09-25T08:00:00Z");

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["einsatzbuch-verwaltung"];
  host = "einsatzbuch.localtest.me";
});

/** Legt einen Rechner samt Schlüsselpaar direkt an, ohne den Umweg über `richteEin`/Krypto. */
async function legeRechnerAn(art: "echt" | "test", id: string, name: string, token: string) {
  const { getDb } = await import("../_db/client");
  const { rechner, schluesselpaar } = await import("../_db/schema");
  const { hashVon } = await import("../_lib/anbindung/token");
  const db = getDb();
  db.insert(rechner).values({
    id, art, name, tokenHash: hashVon(token), eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
  }).run();
  db.insert(schluesselpaar).values({
    id: `paar-${id}`,
    rechnerId: art === "test" ? id : null,
    art,
    schluesselId: alsSchluesselId(id),
    oeffentlich: "spki",
    privatVerschluesselt: "iv:ct",
    erzeugtAm: JETZT,
  }).run();
  return db;
}

describe("rechner-Actions", () => {
  it("ohne Gruppe: Forbidden, nichts geschrieben", async () => {
    gruppen = null;
    const { rechnerWiderrufenAction, testRechnerLoeschenAction } = await import("./rechner");
    await expect(rechnerWiderrufenAction("re")).rejects.toThrow("Forbidden");
    await expect(testRechnerLoeschenAction("t1")).rejects.toThrow("Forbidden");
  });

  it("testRechnerLoeschenAction auf einen echten Rechner: ok:false mit Meldung, nichts gelöscht", async () => {
    await legeRechnerAn("echt", "re", "Einsatzleitung", "t".repeat(43));
    const { testRechnerLoeschenAction } = await import("./rechner");
    const ergebnis = await testRechnerLoeschenAction("re");
    expect(ergebnis.ok).toBe(false);

    const { getDb } = await import("../_db/client");
    const { rechner, schluesselpaar } = await import("../_db/schema");
    expect(getDb().select().from(rechner).all()).toHaveLength(1);
    expect(getDb().select().from(schluesselpaar).all()).toHaveLength(1);
  });

  it("testRechnerLoeschenAction auf unbekannte ID: ok:false", async () => {
    const { testRechnerLoeschenAction } = await import("./rechner");
    expect(await testRechnerLoeschenAction("nix")).toEqual({ ok: false, fehler: expect.any(String) });
  });

  it("testRechnerLoeschenAction auf einen Test-Rechner: Paar und Anker weg, Audit-Zeile delete rechner mit Akteur", async () => {
    const db = await legeRechnerAn("test", "t1", "Übungsrechner", "u".repeat(43));
    const { anker } = await import("../_db/schema");
    db.insert(anker).values({ rechnerId: "t1", block: 1, hash: "a".repeat(64), gemeldetAm: JETZT }).run();

    const { testRechnerLoeschenAction } = await import("./rechner");
    expect(await testRechnerLoeschenAction("t1")).toEqual({ ok: true, wert: null });

    const { rechner, schluesselpaar } = await import("../_db/schema");
    expect(db.select().from(rechner).all()).toEqual([]);
    expect(db.select().from(schluesselpaar).all()).toEqual([]);
    expect(db.select().from(anker).all()).toEqual([]);

    const { sql } = await import("drizzle-orm");
    const zeilen = db.all(sql`SELECT action, actor FROM audit_outbox WHERE object_type = 'rechner' AND action = 'delete'`) as { action: string; actor: string }[];
    expect(zeilen).toHaveLength(1);
    expect(JSON.parse(zeilen[0].actor)).toMatchObject({ kind: "user", id: "s1" });
  });

  it("rechnerWiderrufenAction setzt widerrufen_am, und rechnerAusToken liefert danach null", async () => {
    const token = "w".repeat(43);
    const db = await legeRechnerAn("echt", "re", "Einsatzleitung", token);
    const { rechnerAusToken } = await import("../_lib/anbindung/geraet");
    expect(rechnerAusToken(db, token)?.id).toBe("re");

    const { rechnerWiderrufenAction } = await import("./rechner");
    expect(await rechnerWiderrufenAction("re")).toEqual({ ok: true, wert: null });

    const { rechner } = await import("../_db/schema");
    const { eq } = await import("drizzle-orm");
    const zeile = db.select().from(rechner).where(eq(rechner.id, "re")).get();
    expect(zeile?.widerrufenAm).not.toBeNull();
    expect(rechnerAusToken(db, token)).toBeNull();
  });

  it("rechnerWiderrufenAction auf einen Test-Rechner: ok:false, nichts geändert (Test-Rechner werden gelöscht, nicht widerrufen)", async () => {
    await legeRechnerAn("test", "t1", "Übungsrechner", "x".repeat(43));
    const { rechnerWiderrufenAction } = await import("./rechner");
    const ergebnis = await rechnerWiderrufenAction("t1");
    expect(ergebnis.ok).toBe(false);

    const { getDb } = await import("../_db/client");
    const { rechner } = await import("../_db/schema");
    const { eq } = await import("drizzle-orm");
    const zeile = getDb().select().from(rechner).where(eq(rechner.id, "t1")).get();
    expect(zeile?.widerrufenAm).toBeNull();
  });

  it("rechnerWiderrufenAction auf eine unbekannte ID: ok:false", async () => {
    const { rechnerWiderrufenAction } = await import("./rechner");
    expect(await rechnerWiderrufenAction("nix")).toEqual({ ok: false, fehler: expect.any(String) });
  });
});
