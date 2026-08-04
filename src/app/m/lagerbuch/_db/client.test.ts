import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };
let aufraeumen: (() => void)[] = [];
afterEach(() => { aufraeumen.forEach((f) => f()); aufraeumen = []; delete g.__suiteDb; });

async function frischerClient(): Promise<typeof import("./client")> {
  const ordner = mkdtempSync(join(tmpdir(), "lagerbuch-client-"));
  process.env.DATA_DIR = ordner;
  aufraeumen.push(() => rmSync(ordner, { recursive: true, force: true }));
  delete g.__suiteDb;
  // Frisch importieren, damit der Modulzustand nicht aus einem vorigen Test stammt.
  return await import(`./client?t=${ordner}`);
}

describe("getDb — der modul-eigene Opener", () => {
  it("registriert lb_falte, und die Funktion faltet unicode-faehig", async () => {
    // Ohne diese Registrierung scheitert jede Journalsuche mit
    // `no such function: lb_falte` — auf genau einem Codepfad.
    const { getDb } = await frischerClient();
    const db = getDb();
    const r = db.$client.prepare("select lb_falte('PÄCKCHEN') as v").get() as { v: string };
    expect(r.v).toBe("päckchen");
  });

  it("lb_falte reicht NULL durch", async () => {
    const { getDb } = await frischerClient();
    const r = getDb().$client.prepare("select lb_falte(NULL) as v").get() as { v: null };
    expect(r.v).toBeNull();
  });

  it("cacht unter DEMSELBEN Schluessel, den getModuleDb benutzt", async () => {
    // Das ist die eigentliche Absicherung gegen zwei Verbindungen auf dieselbe
    // WAL-Datei: ein spaeter hinzugefuegtes getModuleDb("lagerbuch", schema) faende
    // den vorhandenen Eintrag MIT registrierter Funktion vor.
    const { getDb } = await frischerClient();
    const a = getDb();
    expect(g.__suiteDb?.["lagerbuch"]).toBe(a);
    expect(getDb()).toBe(a);
  });

  it("erbt die vier Pragmas von openModuleDatabase", async () => {
    // Der Opener benutzt dieselbe Funktion und ergaenzt allein lb_falte.
    // `foreign_keys` ist eine VERBINDUNGS-Eigenschaft und standardmaessig AUS —
    // ohne sie waeren alle FK-Zusagen des Moduls gruen, ohne zu gelten.
    const { getDb } = await frischerClient();
    const s = getDb().$client;
    expect(s.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(s.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(s.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(s.pragma("synchronous", { simple: true })).toBe(1);   // NORMAL
  });
});

describe("Quelltext-Scan: das Modul oeffnet seine DB an genau EINER Stelle", () => {
  it("kein getModuleDb ausserhalb von _db/client.ts", () => {
    // Eine zweite Verbindung kennte lb_falte nicht. Der Scan haelt die Bauform fest;
    // der geteilte Cache-Schluessel und die Auslassung in seedAllModules() sind die
    // beiden anderen Beine.
    const wurzel = "src/app/m/lagerbuch";
    const treffer = readdirSync(wurzel, { recursive: true, encoding: "utf8" })
      .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.endsWith("_db/client.ts"))
      .map((f) => join(wurzel, f))
      .filter((f) => {
        const inhalt = readFileSync(f, "utf8");
        // Kommentarzeilen raus: die Erklaerungen dieses Moduls nennen `getModuleDb(...)`
        // woertlich, und ein Scan, der seine eigene Begruendung als Verstoss zaehlt,
        // ist unbrauchbar. Ein echter Aufruf steht nie hinter `//`, `*` oder `/*`.
        const code = inhalt.split("\n").filter((z) => !/^\s*(\*|\/\/|\/\*)/.test(z)).join("\n");
        return /\bgetModuleDb\s*\(/.test(code);
      });
    expect(treffer).toEqual([]);
  });

  it("core/bootstrap.ts fuehrt lagerbuch NICHT in seedAllModules", () => {
    const boot = readFileSync("src/core/bootstrap.ts", "utf8");
    const seed = boot.slice(boot.indexOf("function seedAllModules"));
    expect(seed).not.toContain("lagerbuch");
  });
});
