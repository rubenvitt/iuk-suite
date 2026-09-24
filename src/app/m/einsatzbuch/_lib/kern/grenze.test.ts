import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DER KERN LÄUFT AUCH IN DER DESKTOP-APP (Vite + Tauri, kein Next, kein Node).
 * Ein Import aus `next`, `node:*` oder der Suite kompiliert dort nicht — und die Suite-
 * Tore merken es nicht, weil sie die App nicht bauen. Tests dürfen Node benutzen.
 * Einzige Ausnahme: `@/core/theme/tokens` (reine Konstanten, Spec §2.1). Verboten sind
 * auch relative Pfade, die aus `kern/` herausführen — die Desktop-App löst sie über den
 * echten Pfad auf und würde einem solchen Import in die Suite folgen.
 */
const ERLAUBT_AUS_SUITE = new Set(["@/core/theme/tokens"]);

function dateien(ordner: string): string[] {
  return readdirSync(ordner).filter((n) => n !== "node_modules").flatMap((n) => {
    const p = path.join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : [p];
  });
}

describe("Grenze des geteilten Kerns", () => {
  const quellen = dateien(__dirname).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p));

  it("findet Quelldateien", () => expect(quellen.length).toBeGreaterThan(5));

  it.each(quellen.map((p) => [path.relative(__dirname, p), p]))("%s importiert nur Erlaubtes", (_name, datei) => {
    const quelltext = readFileSync(datei, "utf8");
    const ziele = [...quelltext.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const verboten = ziele.filter((z) => {
      if (z.startsWith(".")) {
        const ziel = path.resolve(path.dirname(datei), z);
        return !(ziel === __dirname || ziel.startsWith(__dirname + path.sep));
      }
      if (ERLAUBT_AUS_SUITE.has(z)) return false;
      if (z === "react" || z.startsWith("react/")) return false;
      return true;
    });
    expect(verboten).toEqual([]);
  });
});
