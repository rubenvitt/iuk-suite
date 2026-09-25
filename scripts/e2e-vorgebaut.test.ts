import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * DIE E2E-SUITE GEGEN EINEN VORGEBAUTEN STAND (DRK-415) — und die drei Glieder,
 * die dafuer zusammenpassen muessen, ohne dass ein Lauf es von sich aus meldet:
 *
 *   1. `e2e/helpers/server.ts` schaltet auf `next start` und gibt dem gebauten
 *      Stand `SUITE_LOKAL_HTTP=1` mit. Fehlt die Variable, kommt keine Anmeldung
 *      mehr von `/login` weg (Secure-Cookies ueber http) — ein Bild, das wie
 *      kaputte Anmeldung aussieht und keine ist.
 *   2. Der Job `e2e` setzt `E2E_VORGEBAUT` und wartet auf `e2e-build`. Fehlt
 *      das eine, faehrt die CI still wieder `next dev`; fehlt das andere,
 *      beginnt eine Gruppe, bevor es einen Build gibt.
 *   3. Hochgeladen und heruntergeladen wird DASSELBE Artefakt.
 */

const WURZEL = process.cwd();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function ladeServer(vorgebaut: boolean) {
  vi.resetModules();
  vi.stubEnv("E2E_VORGEBAUT", vorgebaut ? "1" : "");
  vi.stubEnv("CI", "1");
  return import("../e2e/helpers/server");
}

function mitBuild(): string {
  const wurzel = mkdtempSync(join(tmpdir(), "e2e-vorgebaut-"));
  mkdirSync(join(wurzel, ".next"));
  writeFileSync(join(wurzel, ".next", "BUILD_ID"), "probe");
  return wurzel;
}

describe("e2e/helpers/server.ts", () => {
  it("ohne E2E_VORGEBAUT: next dev und keine Zusatzumgebung — lokal aendert sich nichts", async () => {
    const { nextServerBefehl, VORGEBAUT_ENV } = await ladeServer(false);
    expect(nextServerBefehl(3100)).toBe("next dev -p 3100");
    expect(VORGEBAUT_ENV).toEqual({});
  });

  it("mit E2E_VORGEBAUT=1: next start als production, mit lokalem http und Boot-Seed", async () => {
    const { nextServerBefehl, VORGEBAUT_ENV } = await ladeServer(true);
    expect(nextServerBefehl(3100, mitBuild())).toBe("NODE_ENV=production next start -p 3100");
    expect(VORGEBAUT_ENV).toEqual({ SUITE_LOKAL_HTTP: "1", SUITE_SEED: "1" });
  });

  it("ohne gebauten Stand bricht er laut ab, statt `next start` ins Leere laufen zu lassen", async () => {
    const { nextServerBefehl } = await ladeServer(true);
    const leer = mkdtempSync(join(tmpdir(), "e2e-vorgebaut-"));
    expect(() => nextServerBefehl(3100, leer)).toThrow(/BUILD_ID/);
  });
});

/** Der Block eines Jobs aus `ci.yml`: von `  <name>:` bis zum naechsten Job. */
function jobBlock(ci: string, name: string): string {
  const zeilen = ci.split("\n");
  const start = zeilen.indexOf(`  ${name}:`);
  if (start < 0) throw new Error(`Job ${name} fehlt in ci.yml`);
  const ende = zeilen.findIndex((z, i) => i > start && /^ {2}[a-z][\w-]*:$/.test(z));
  return zeilen.slice(start, ende < 0 ? undefined : ende).join("\n");
}

describe(".github/workflows/ci.yml", () => {
  const ci = readFileSync(join(WURZEL, ".github/workflows/ci.yml"), "utf8");

  it("der Job e2e faehrt vorgebaut und wartet auf e2e-build", () => {
    const e2e = jobBlock(ci, "e2e");
    expect(e2e).toMatch(/^ {4}needs: \[.*\be2e-build\b.*\]$/m);
    expect(e2e).toMatch(/^ {6}E2E_VORGEBAUT: "1"$/m);
  });

  it("e2e-build laedt genau das Artefakt hoch, das e2e herunterlaedt", () => {
    const hoch = jobBlock(ci, "e2e-build").match(/upload-artifact@v4\n\s+with:\n\s+name: (\S+)/);
    const runter = jobBlock(ci, "e2e").match(/download-artifact@v4\n\s+with:\n\s+name: (\S+)/);
    expect(hoch?.[1]).toBeDefined();
    expect(runter?.[1]).toBe(hoch?.[1]);
  });
});
