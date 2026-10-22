import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

/**
 * IDA-244 — `pnpm typecheck` SIEHT DIE TYPDATEIEN DES DEV-SERVERS NICHT.
 *
 * `next dev` schreibt `.next/dev/types/validator.ts` bei jeder Routenaenderung
 * neu, und zwar nicht atomar (`writeValidatorFile` in `next/dist/server/lib/
 * router-utils/route-types-utils`). Wird der Server mitten darin beendet — e2e
 * raeumt ihn ab, `Strg+C` bei `pnpm dev` —, bleibt eine halbe Datei liegen, und
 * `pnpm typecheck` scheitert an ihr mit Syntaxfehlern (TS1005/TS1435) in einer
 * Datei, die niemand geschrieben hat. Dreimal unabhaengig aufgetreten (IDA-231).
 *
 * Abhilfe: `tsconfig.json` schliesst `.next/dev` aus. Den `include`-Eintrag
 * `.next/dev/types/**​/*.ts` legt Next selbst wieder an, wenn er fehlt
 * (`writeConfigurationDefaults`), `exclude` fasst es nicht an — und `exclude`
 * gewinnt. Verloren geht nichts: kein Modul nutzt die globalen Routentypen
 * (`PageProps<…>`), die CI faehrt `typecheck` ganz ohne `.next/`, und `next
 * build` filtert die Dev-Typen in seiner eigenen Pruefung genauso heraus
 * (`getDevTypesPath` in `next/dist/lib/typescript/type-paths`).
 *
 * Geprueft wird die Dateiliste, die TypeScript aus der ECHTEN `tsconfig.json`
 * ableitet, in einem Wegwerfbaum, in dem beide Typordner existieren.
 */

const WURZEL = resolve(__dirname, "..");
const baum = mkdtempSync(join(tmpdir(), "tsconfig-devtypen-"));

afterAll(() => rmSync(baum, { recursive: true, force: true }));

function lege(pfad: string, inhalt: string): void {
  const ziel = join(baum, pfad);
  mkdirSync(resolve(ziel, ".."), { recursive: true });
  writeFileSync(ziel, inhalt);
}

function dateienDesTypechecks(): string[] {
  const quelle = readFileSync(join(WURZEL, "tsconfig.json"), "utf8");
  const { config, error } = ts.parseConfigFileTextToJson("tsconfig.json", quelle);
  expect(error).toBeUndefined();
  const geparst = ts.parseJsonConfigFileContent(config, ts.sys, baum);
  return geparst.fileNames.map((datei) => datei.slice(baum.length + 1));
}

describe("tsconfig.json — Reste des Dev-Servers (IDA-244)", () => {
  lege("src/seite.ts", "export {};\n");
  // Halb geschrieben, wie nach einem abgebrochenen `next dev`.
  lege(".next/dev/types/validator.ts", "type AppPageConfig = {\n  default: React.Compone");
  lege(".next/types/validator.ts", "export {};\n");

  it("nimmt `.next/dev` nicht in den Typecheck", () => {
    const dateien = dateienDesTypechecks();
    expect(dateien).toContain("src/seite.ts");
    expect(dateien.filter((datei) => datei.startsWith(".next/dev/"))).toEqual([]);
  });

  it("prueft die Typen aus `next build`/`next typegen` weiterhin", () => {
    // Sonst haette der Ausschluss zu weit gegriffen: `.next/types` ist der Stand,
    // den Next selbst beim Bauen prueft.
    expect(dateienDesTypechecks()).toContain(".next/types/validator.ts");
  });
});
