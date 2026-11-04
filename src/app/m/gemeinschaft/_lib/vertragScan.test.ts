import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { avKonfigAusEnv, scanneVertrag as scanneLogo, scanSatz, scanWurzel } from "./vertragScan";

/** Ein clamd-Sprecher auf einem freien Port (Vorbild `aufgaben/_lib/scan.test.ts`, `lausche`). */
async function lausche(reagiere: (pfad: string) => string) {
  const befehle: string[] = [];
  const server = net.createServer((v) => {
    let puffer = "";
    v.on("data", (s) => {
      puffer += s.toString("utf8");
      const ende = puffer.indexOf("\0");
      if (ende < 0) return;
      const befehl = puffer.slice(0, ende);
      befehle.push(befehl);
      v.end(`${reagiere(befehl.replace(/^zSCAN /, ""))}\0`);
    });
    v.on("error", () => {});
  });
  await new Promise<void>((fertig) => server.listen(0, "127.0.0.1", fertig));
  return {
    port: (server.address() as net.AddressInfo).port, befehle,
    stoppe: () => new Promise<void>((fertig) => server.close(() => fertig())),
  };
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "gemeinschaft-scan-")); vi.stubEnv("DATA_DIR", dir); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

describe("scanneVertrag (IDA-343, Muster kommplan/_lib/logoScan.test.ts)", () => {
  it("schreibt die Bytes unter $DATA_DIR/kommplan-scan/gemeinschaft (0640), clamd liest sie per zSCAN, danach ist die Datei weg", async () => {
    let gelesen: number[] = [];
    let modus = 0;
    const l = await lausche((pfad) => { gelesen = [...readFileSync(pfad)]; modus = statSync(pfad).mode & 0o777; return `${pfad}: OK`; });
    try {
      expect(await scanneLogo(new Uint8Array([1, 2, 3]), { host: "127.0.0.1", port: l.port, timeoutMs: 2000 })).toEqual({ art: "clean" });
      expect(gelesen).toEqual([1, 2, 3]);
      expect(modus).toBe(0o640);
      expect(l.befehle[0].startsWith(`zSCAN ${scanWurzel()}/`)).toBe(true);
      expect(scanWurzel()).toBe(join(dir, "kommplan-scan", "gemeinschaft"));
      expect(readdirSync(scanWurzel())).toEqual([]);
    } finally { await l.stoppe(); }
  });
  it("ein Befund kommt als infected zurück, die Datei ist trotzdem weg", async () => {
    const l = await lausche((pfad) => `${pfad}: Win.Test.EICAR_HDB-1 FOUND`);
    try {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await scanneLogo(new Uint8Array([1]), { host: "127.0.0.1", port: l.port, timeoutMs: 2000 })).toEqual({ art: "infected", signatur: "Win.Test.EICAR_HDB-1" });
      expect(readdirSync(scanWurzel())).toEqual([]);
      // Der Betrieb erfährt vom Fund; die Oberfläche bekommt nur den Satz aus `scanSatz`.
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[gemeinschaft\]\[vertrag-scan\] Fund: Win\.Test\.EICAR_HDB-1$/));
    } finally { await l.stoppe(); }
  });
  it("kein Scanner erreichbar: error (fail-closed), die Datei ist weg", async () => {
    const l = await lausche(() => "");
    const port = l.port;
    await l.stoppe();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await scanneLogo(new Uint8Array([1]), { host: "127.0.0.1", port, timeoutMs: 2000 });
    expect(r.art).toBe("error");
    // Ein dauerhaft fehlender Scanner lässt jeden Upload scheitern — das muss im Log stehen.
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[gemeinschaft\]\[vertrag-scan\] Prüfung nicht möglich: /));
    expect(readdirSync(scanWurzel())).toEqual([]);
  });
  it("liest nur die eigenen Variablen GEMEINSCHAFT_AV_* — Vorgaben clamav, 3310, 30 s", () => {
    expect(avKonfigAusEnv({})).toEqual({ host: "clamav", port: 3310, timeoutMs: 30_000 });
    expect(avKonfigAusEnv({ GEMEINSCHAFT_AV_HOST: " 127.0.0.1 ", GEMEINSCHAFT_AV_PORT: "3311", GEMEINSCHAFT_AV_TIMEOUT_MS: "2000", KOMMPLAN_AV_HOST: "anders" }))
      .toEqual({ host: "127.0.0.1", port: 3311, timeoutMs: 2000 });
  });
  it("nur clean gibt frei; Befund und Fehler bekommen je einen Satz", () => {
    expect(scanSatz({ art: "clean" })).toBeNull();
    expect(scanSatz({ art: "infected", signatur: "x" })).toMatch(/Schadsoftware/);
    expect(scanSatz({ art: "error", grund: "x" })).toMatch(/Virenprüfung/);
  });
});
