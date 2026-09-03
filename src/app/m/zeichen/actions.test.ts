import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrateAllModules } from "@/core/bootstrap";

/*
 * ECHTE DATENBANK, GEMOCKTE SITZUNG (Vorbild uav/_actions/katalog.test.ts). Eine
 * gemockte `getDb()` bewiese ueber die PK (sub, zeichenId) und ueber
 * `onConflictDoNothing()` nichts — genau die beiden entscheiden hier, ob ein
 * zweites Merken eine zweite Zeile anlegt.
 *
 * `next/cache` muss gemockt werden: `revalidatePath` ausserhalb eines Requests
 * wirft, und die Auffrischung ist nicht der Pruefgegenstand.
 */
const DIR = "./.data/zeichen-actions-test";
let angemeldet: string | null = null;

vi.mock("@/core/auth", () => ({
  auth: async () => (angemeldet === null ? null : { user: { id: angemeldet } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ANNA = "dev:anna@localtest.me";
const BERT = "dev:bert@localtest.me";
const ANKER = "rezept:C.1.1";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  angemeldet = ANNA;
});

async function merkzeilen(sub: string) {
  const { getDb } = await import("./_db/client");
  const { merkliste } = await import("./_db/schema");
  return getDb().select().from(merkliste).where(eq(merkliste.sub, sub)).all();
}

describe("merkeZeichen", () => {
  it("legt eine Zeile mit dem HEUTIGEN Titel als Schnappschuss an", async () => {
    const { merkeZeichen } = await import("./actions");
    const { findeZeichen } = await import("./_lib/katalog");
    await merkeZeichen(ANKER);
    const zeilen = await merkzeilen(ANNA);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.zeichenId).toBe(ANKER);
    expect(zeilen[0]?.titelSchnappschuss).toBe(findeZeichen(ANKER)?.titel);
  });

  /* PK (sub, zeichenId) + onConflictDoNothing: zweimal merken ist EIN Merken. */
  it("legt beim zweiten Mal keine zweite Zeile an", async () => {
    const { merkeZeichen } = await import("./actions");
    await merkeZeichen(ANKER);
    await merkeZeichen(ANKER);
    expect(await merkzeilen(ANNA)).toHaveLength(1);
  });

  /*
   * `findeZeichen` WIRFT NIE, und diese Action tut es ihm gleich: eine unbekannte
   * ID kann aus einem alten Lesezeichen oder einem manipulierten Aufruf kommen.
   * Sie ist kein Angriff und kein Feldfehler — es gibt schlicht nichts zu merken.
   */
  it("merkt nichts, was der Katalog nicht kennt — und wirft dabei nicht", async () => {
    const { merkeZeichen } = await import("./actions");
    await expect(merkeZeichen("rezept:GIBTSNICHT")).resolves.toBeUndefined();
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });

  it("wirft ohne Sitzung, BEVOR etwas geschrieben wurde", async () => {
    angemeldet = null;
    const { merkeZeichen } = await import("./actions");
    await expect(merkeZeichen(ANKER)).rejects.toThrow("Forbidden");
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });
});

describe("entferneZeichen", () => {
  /*
   * DER WICHTIGSTE FALL DIESER DATEI. Spec §4.6 Stufe 2 sagt zu, dass eine
   * verwaiste Merkzeile SICHTBAR bleibt UND einen Entfernen-Knopf traegt. Wuerde
   * diese Action wie `merkeZeichen` gegen den Katalog pruefen, waere genau diese
   * Zeile die einzige, die man NICHT loswird — der Knopf staende da und taete
   * nichts, still.
   */
  it("entfernt auch eine Zeile, deren Zeichen der Katalog nicht mehr fuehrt", async () => {
    const { getDb } = await import("./_db/client");
    const { merkliste } = await import("./_db/schema");
    getDb()
      .insert(merkliste)
      .values({ sub: ANNA, zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" })
      .run();
    const { entferneZeichen } = await import("./actions");
    await entferneZeichen("rezept:GIBTSNICHT");
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });

  /*
   * IDOR: der `sub` kommt aus `auth()`, NIE aus einem Argument. Beide Personen
   * haben dieselbe zeichenId gemerkt; entfernt werden darf genau eine Zeile.
   */
  it("raeumt nur die eigene Zeile, nicht die einer anderen Person", async () => {
    const { merkeZeichen, entferneZeichen } = await import("./actions");
    await merkeZeichen(ANKER);
    angemeldet = BERT;
    await merkeZeichen(ANKER);
    await entferneZeichen(ANKER);
    expect(await merkzeilen(BERT)).toHaveLength(0);
    expect(await merkzeilen(ANNA)).toHaveLength(1);
  });

  it("wirft ohne Sitzung", async () => {
    angemeldet = null;
    const { entferneZeichen } = await import("./actions");
    await expect(entferneZeichen(ANKER)).rejects.toThrow("Forbidden");
  });
});
