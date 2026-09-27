import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

/**
 * Der Wächter für den Patch an next (`patches/next@16.3.3.patch`, DRK-481; Begründung in
 * `pnpm-workspace.yaml`).
 *
 * Next reicht jede POST-Anfrage durch den Proxy und tauscht danach ihren Körper gegen einen
 * Puffer (`getCloneableBody`, `finalize`). Ungepatcht wirft die Anfrage dann `aborted`
 * (ECONNRESET), sobald der Client abbricht, bevor die Route den Körper gelesen und geantwortet
 * hat — ohne Zuhörer, also als uncaughtException. In der Suite beendet der Netzhaken
 * (`core/av/scanner`) daraufhin den Prozess, für alle Module.
 *
 * WARUM EIN KINDPROZESS: genau der Prozesstod ist der Befund. Im Testprozess finge Vitests
 * eigener Haken die Ausnahme ab und meldete sie irgendeinem Test zu. Das Kind trägt denselben
 * Haken wie die Suite (loggen, `exit(1)`) und läuft über Nexts eigene Auflösung aus dem
 * Projekt — ein Upgrade ohne nachgezogenen Patch fällt hier auf, nicht erst in Produktion.
 *
 * Die Anfrage geht über einen echten Socket mit RST, wie ein Telefon im Funkloch; ein
 * nachgebautes `destroy()` bewiese nur die Annahme über Nodes Innenleben.
 */
const bodyStreams = createRequire(import.meta.url).resolve("next/dist/server/body-streams.js");

const KIND = `
const http = require("node:http");
const net = require("node:net");
const { getCloneableBody } = require(process.env.BODY_STREAMS);
const routeLiest = process.env.ROUTE_LIEST === "1";
process.on("uncaughtException", (e) => { console.log("uncaught:" + e.message + ":" + e.code); process.exit(1); });

const server = http.createServer(async (req, res) => {
  // Was Next für den Proxy tut (next-server.js, runMiddleware): Kopie lesen, Körper tauschen.
  const koerper = getCloneableBody(req);
  for await (const _ of koerper.cloneBodyStream()) {}
  await koerper.finalize();
  if (routeLiest) {
    // Eine Route, die liest, während der Client abbricht, muss den Fehler weiter sehen.
    req.on("error", (e) => console.log("route-sieht:" + e.message));
  }
  // Die Antwort steht noch aus, als der Client abbricht.
  setTimeout(() => res.end("ok"), 300);
});

server.listen(0, "127.0.0.1", () => {
  const s = net.connect(server.address().port, "127.0.0.1", () => {
    s.write("POST / HTTP/1.1\\r\\nHost: x\\r\\nContent-Type: application/json\\r\\nContent-Length: 2\\r\\n\\r\\n{}");
    setTimeout(() => s.resetAndDestroy(), 50);
  });
  s.on("error", () => {});
  setTimeout(() => { console.log("lebt"); process.exit(0); }, 600);
});
`;

function fahre(routeLiest: boolean) {
  return spawnSync(process.execPath, ["-e", KIND], {
    env: { ...process.env, BODY_STREAMS: bodyStreams, ROUTE_LIEST: routeLiest ? "1" : "0" },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("next: abgebrochene Anfrage nach dem Proxy (DRK-481)", () => {
  it("beendet den Prozess nicht, wenn die Route den Körper nicht gelesen hat", () => {
    const lauf = fahre(false);
    expect(lauf.stdout, "der Abbruch des Clients kam als uncaughtException an").not.toContain("uncaught:");
    expect(lauf.stdout.trim()).toBe("lebt");
    expect(lauf.status).toBe(0);
  });

  it("verschluckt den Fehler nicht vor einer Route, die zuhört", () => {
    const lauf = fahre(true);
    expect(lauf.stdout).toContain("route-sieht:aborted");
    expect(lauf.stdout).not.toContain("uncaught:");
    expect(lauf.status).toBe(0);
  });
});
