import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `test-hilfen.ts` IST NUR FÜR TESTS: es legt In-Memory-Datenbanken an und leert den Stand auf
 * globalThis. Ein Produktionsmodul, das es importiert, zöge `better-sqlite3`-Testaufbau und
 * Migrationen in den Server-Bündel. Geprüft wird jede Datei unter `src`, die kein Test ist.
 */
const SRC = join(process.cwd(), "src");

function dateien(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const pfad = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : dateien(pfad);
    return /\.(ts|tsx)$/.test(e.name) ? [pfad] : [];
  });
}

describe("test-hilfen.ts", () => {
  it("wird von keinem Produktionsmodul importiert", () => {
    const fremde = dateien(SRC)
      .filter((p) => !/\.test\.tsx?$/.test(p) && !p.endsWith("test-hilfen.ts"))
      .filter((p) => /from\s+["'][^"']*\/test-hilfen["']/.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC, p));
    expect(fremde).toEqual([]);
  });

  it("der Wächter greift: ein Test-Import wird erkannt", () => {
    const test = readFileSync(join(__dirname, "stand.test.ts"), "utf8") + readFileSync(join(__dirname, "autoEnde.test.ts"), "utf8");
    expect(/from\s+["'][^"']*\/test-hilfen["']/.test(test)).toBe(true);
  });
});
