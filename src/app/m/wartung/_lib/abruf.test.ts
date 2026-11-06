import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { istOeffentlich, ladeVonAdresse } from "./abruf";

let server: Server;
let port: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/weiter") return void res.writeHead(302, { location: "/datei.pdf" }).end();
    if (req.url === "/ins-netz") return void res.writeHead(302, { location: "http://10.0.0.1/geheim" }).end();
    if (req.url === "/gross") return void res.writeHead(200).end(Buffer.alloc(2048));
    if (req.url === "/datei.pdf") return void res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.4 inhalt");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = String((server.address() as AddressInfo).port);
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

// Im Test ist nur die eigene Loopback-Adresse „öffentlich“.
const test = () => ({ maxBytes: 1024, erlaubt: (ip: string) => ip === "127.0.0.1", ports: [port] });

describe("Unterlage von einer Adresse holen", () => {
  it("kennt die nicht öffentlichen Netze", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.178.1", "100.100.1.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      expect(istOeffentlich(ip), ip).toBe(false);
    }
    for (const ip of ["93.184.216.34", "2a00:1450:4001:80b::200e"]) expect(istOeffentlich(ip), ip).toBe(true);
  });

  it("lädt eine Datei und folgt einer Weiterleitung", async () => {
    const r = await ladeVonAdresse(`http://127.0.0.1:${port}/weiter`, test());
    expect(r.ok && Buffer.from(r.bytes).toString()).toBe("%PDF-1.4 inhalt");
  });

  it("lehnt das eigene Netz ab, auch hinter einer Weiterleitung und per Name", async () => {
    const gesperrt = "Diese Adresse ist nicht öffentlich erreichbar.";
    expect(await ladeVonAdresse(`http://127.0.0.1:${port}/ins-netz`, { ...test(), ports: [port, "80"] })).toEqual({ ok: false, fehler: gesperrt });
    expect(await ladeVonAdresse(`http://localhost:${port}/datei.pdf`, { ...test(), erlaubt: () => false })).toEqual({ ok: false, fehler: gesperrt });
    expect(await ladeVonAdresse("http://[::1]/x", { maxBytes: 10 })).toEqual({ ok: false, fehler: gesperrt });
  });

  it("Grenzen: Größe, Schema, Port, Anmeldedaten", async () => {
    expect(await ladeVonAdresse(`http://127.0.0.1:${port}/gross`, test())).toEqual({ ok: false, fehler: "Die Datei ist zu groß." });
    expect((await ladeVonAdresse("file:///etc/passwd", test())).ok).toBe(false);
    expect((await ladeVonAdresse("http://example.org:8080/x", { maxBytes: 10 })).ok).toBe(false);
    expect((await ladeVonAdresse("https://a:b@example.org/x", { maxBytes: 10 })).ok).toBe(false);
  });
});
