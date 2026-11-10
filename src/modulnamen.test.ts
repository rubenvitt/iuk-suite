import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Wächter gegen Modulnamen, die sich nur in der Groß-/Kleinschreibung
 * unterscheiden (IDA-405). `FestHell.tsx` neben `festHell.ts`: auf Linux
 * (CI) zwei Module, auf macOS (case-insensitiv) löst `./FestHell` still auf
 * `festHell.ts` auf — `typecheck` und Tests brechen nur lokal.
 *
 * Verglichen wird der Pfad OHNE Endung, weil die Auflösung eines Imports die
 * Endung selbst ergänzt.
 */
const WURZEL = resolve(__dirname, "..");
const ENDUNG = /\.(?:[cm]?[jt]sx?)$/;

describe("Modulnamen", () => {
  it("unterscheiden sich nicht nur in der Groß-/Kleinschreibung", () => {
    const dateien = execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" })
      .split("\0")
      .filter((d) => ENDUNG.test(d));
    const gesehen = new Map<string, string>();
    const kollisionen: string[] = [];
    for (const datei of dateien) {
      const stamm = datei.replace(ENDUNG, "");
      const schluessel = stamm.toLowerCase();
      const frueher = gesehen.get(schluessel);
      if (frueher !== undefined && frueher !== stamm) kollisionen.push(`${frueher} ↔ ${stamm}`);
      else gesehen.set(schluessel, stamm);
    }
    expect(kollisionen).toEqual([]);
  });
});
