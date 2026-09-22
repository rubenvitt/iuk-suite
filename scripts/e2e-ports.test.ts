import { execFileSync } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import haupt from "../playwright.config";
import pwa from "../playwright.pwa.config";
import umfragen from "../playwright.umfragen.config";
import {
  E2E_PORTS,
  HAUPTCHECKOUT_PORTS,
  WORKTREE_BASIS,
  WORKTREE_BLOECKE,
  belegtMeldung,
  ermittlePorts,
  halterVon,
} from "../e2e/helpers/ports";

/**
 * DIE PORTVERGABE DER E2E-PROFILE (DRK-346). Die Wirkung — zwei Worktrees
 * fahren gleichzeitig — sieht nur ein echter Doppellauf; hier steht, was sich
 * ohne ihn beweisen lässt: die Entscheidung selbst, dass die drei Profile an
 * derselben Quelle hängen, und dass die Meldung den Halter wirklich findet.
 */

const HAUPT = "/pfad/zum/iuk-suite";
const WT_A = `${HAUPT}/.claude/worktrees/drk-346-450185`;
const WT_B = `${HAUPT}/.claude/worktrees/drk-297-1a2b3c`;

describe("ermittlePorts", () => {
  it("lässt den Hauptcheckout (und damit die CI) auf den alten Zahlen", () => {
    expect(ermittlePorts({ wurzel: HAUPT, istWorktree: false })).toEqual({
      web: 3100,
      pwa: 3101,
      umfragen: 3102,
      clamd: 3310,
    });
  });

  it("gibt einem Worktree einen eigenen Block im Zehnerraster, stabil je Pfad", () => {
    const a = ermittlePorts({ wurzel: WT_A, istWorktree: true });
    expect(a.web % 10).toBe(0);
    expect(a.web).toBeGreaterThanOrEqual(WORKTREE_BASIS);
    expect(a.web).toBeLessThan(WORKTREE_BASIS + 10 * WORKTREE_BLOECKE);
    expect(a).toEqual({ web: a.web, pwa: a.web + 1, umfragen: a.web + 2, clamd: a.web + 3 });
    // Stabil: jeder Prozess (Hauptprozess, Arbeiter, Vitest) muss dieselbe Zahl sehen.
    expect(ermittlePorts({ wurzel: WT_A, istWorktree: true })).toEqual(a);
    expect(ermittlePorts({ wurzel: WT_B, istWorktree: true }).web).not.toBe(a.web);
  });

  it("kein Worktree-Block berührt die Zahlen des Hauptcheckouts", () => {
    const alle = Object.values(HAUPTCHECKOUT_PORTS);
    for (let i = 0; i < WORKTREE_BLOECKE; i++) {
      const web = WORKTREE_BASIS + 10 * i;
      for (const p of [web, web + 1, web + 2, web + 3]) expect(alle).not.toContain(p);
    }
  });

  it("E2E_PORT schlägt die Ableitung — und 3100 heißt wieder die alten Zahlen", () => {
    expect(ermittlePorts({ wurzel: WT_A, istWorktree: true, vorgabe: "4500" })).toEqual({
      web: 4500,
      pwa: 4501,
      umfragen: 4502,
      clamd: 4503,
    });
    expect(ermittlePorts({ wurzel: WT_A, istWorktree: true, vorgabe: "3100" })).toEqual(HAUPTCHECKOUT_PORTS);
    // Leer zählt als nicht gesetzt, wie überall in der Suite.
    expect(ermittlePorts({ wurzel: HAUPT, istWorktree: false, vorgabe: " " })).toEqual(HAUPTCHECKOUT_PORTS);
  });

  it("weist einen unbrauchbaren E2E_PORT laut ab, statt NaN in jede URL zu schreiben", () => {
    for (const roh of ["abc", "80", "4100.5", "70000"]) {
      expect(() => ermittlePorts({ wurzel: HAUPT, istWorktree: false, vorgabe: roh })).toThrow(/E2E_PORT/);
    }
  });
});

describe("die drei Profile hängen an derselben Quelle", () => {
  const port = (url: unknown) => Number(new URL(String(url)).port);

  it("baseURL jedes Profils trägt seinen Port aus E2E_PORTS", () => {
    expect(port(haupt.use?.baseURL)).toBe(E2E_PORTS.web);
    expect(port(pwa.use?.baseURL)).toBe(E2E_PORTS.pwa);
    expect(port(umfragen.use?.baseURL)).toBe(E2E_PORTS.umfragen);
  });

  it("die Server der Nebenprofile lauschen, wo ihre baseURL hinzeigt", () => {
    for (const konfig of [pwa, umfragen]) {
      const ws = konfig.webServer;
      if (!ws || Array.isArray(ws)) throw new Error("Nebenprofil ohne einzelnen webServer");
      const erwartet = port(konfig.use?.baseURL);
      expect(ws.env?.PORT).toBe(String(erwartet));
      expect(ws.command).toContain(`-p ${erwartet}`);
      expect(port(ws.url)).toBe(erwartet);
    }
  });
});

describe("belegtMeldung", () => {
  it("nennt Halter und Arbeitsverzeichnis und unterscheidet eigen von fremd", () => {
    const text = belegtMeldung(
      [
        { port: 4270, pid: "111", kommando: "node", verzeichnis: WT_A },
        { port: 4273, pid: "222", kommando: "node", verzeichnis: WT_B },
      ],
      WT_A,
    );
    expect(text).toContain(`Port 4270: PID 111 (node) in ${WT_A}  ← DIESE Arbeitskopie`);
    expect(text).toContain(`Port 4273: PID 222 (node) in ${WT_B}  ← FREMDE Arbeitskopie`);
    expect(text).toMatch(/nicht beenden/);
  });

  it("hält einen Worktree UNTER dem Hauptcheckout nicht für den Hauptcheckout", () => {
    // Die Worktrees liegen in `.claude/worktrees/` — ein Präfixvergleich würde
    // aus Sicht des Hauptcheckouts jeden von ihnen zum eigenen erklären.
    const text = belegtMeldung([{ port: 3100, pid: "1", kommando: "node", verzeichnis: WT_A }], HAUPT);
    expect(text).toContain("FREMDE Arbeitskopie");
  });
});

function hatLsof(): boolean {
  try {
    execFileSync("lsof", ["-v"], { stdio: "ignore" });
    return true;
  } catch (fehler) {
    // `lsof -v` endet auf manchen Systemen mit Exit 1, ist aber da.
    return (fehler as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

describe("halterVon — gegen einen echten, lauschenden Socket", () => {
  it.skipIf(!hatLsof())("findet diesen Prozess samt Arbeitsverzeichnis", async () => {
    const server = createServer();
    await new Promise<void>((fertig) => server.listen(0, "127.0.0.1", fertig));
    try {
      const { port } = server.address() as AddressInfo;
      const halter = halterVon(port);
      expect(halter?.pid).toBe(String(process.pid));
      expect(halter?.verzeichnis).toBe(process.cwd());
    } finally {
      await new Promise((fertig) => server.close(fertig));
    }
  });

  it.skipIf(!hatLsof())("meldet einen freien Port als frei", async () => {
    const server = createServer();
    await new Promise<void>((fertig) => server.listen(0, "127.0.0.1", fertig));
    const { port } = server.address() as AddressInfo;
    await new Promise((fertig) => server.close(fertig));
    expect(halterVon(port)).toBeNull();
  });
});
