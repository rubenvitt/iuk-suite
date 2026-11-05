import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";

const DIR = "./.data/einsatzbuch-api-umsysteme-test";
const HOST = "einsatzbuch.localtest.me";
const TOKEN = "b".repeat(64);
const LINK = `https://suchlage.example.org/kiosk#${TOKEN}`;

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete process.env.SUITE_HOST_EINSATZBUCH;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  setzeAktiveZeitzone(STANDARD_ZEITZONE);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setzeAktiveZeitzone(STANDARD_ZEITZONE);
});

function req(bearer?: string) {
  const headers: Record<string, string> = { host: HOST };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request("http://x/api/umsysteme", { method: "GET", headers });
}

async function einRechner() {
  const { getDb } = await import("../../_db/client");
  const { ENTWICKLUNGS_KEK } = await import("../../_lib/schluessel/kek");
  const { richteRechnerEin } = await import("../../_lib/anbindung/testHilfe");
  const db = getDb();
  const antwort = await richteRechnerEin(db, { jetzt: new Date(), env: { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK } });
  return { db, geraeteToken: antwort.geraeteToken };
}

const SUCHLAGE = {
  api_version: 1,
  server_time_ms: 0,
  missions: [
    { id: 18, name: "Brandwache", location: null, state: "running", started_at_ms: Date.UTC(2026, 10, 1, 18, 0), closed_at_ms: null },
    { id: 17, name: "Personensuche Ebstorf", location: "Ebstorf", state: "closed", started_at_ms: Date.UTC(2026, 9, 31, 18, 12), closed_at_ms: Date.UTC(2026, 9, 31, 22, 40) },
  ],
};

describe("GET /api/umsysteme", () => {
  it("ohne Geräte-Token → 401", async () => {
    const { GET } = await import("./route");
    expect((await GET(req())).status).toBe(401);
  });

  it("ohne Verbindung zu Suchlage eine leere Liste, ohne Anfrage dorthin", async () => {
    const { geraeteToken } = await einRechner();
    const abruf = vi.fn();
    vi.stubGlobal("fetch", abruf);
    const { GET } = await import("./route");
    const res = await GET(req(geraeteToken));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ einsaetze: [] });
    expect(abruf).not.toHaveBeenCalled();
  });

  it("reicht die Suchlage-Einsätze in Suite-Zeit weiter; das Token geht nur an Suchlage", async () => {
    const { db, geraeteToken } = await einRechner();
    const { verbindeSuchlage } = await import("../../_lib/umsysteme");
    const { umsystemeAntwort } = await import("../../_lib/anbindung/vertrag");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    const abruf = vi.fn(async () => Response.json(SUCHLAGE));
    vi.stubGlobal("fetch", abruf);
    const { GET } = await import("./route");
    const res = await GET(req(geraeteToken));
    expect(res.status).toBe(200);
    const koerper = await res.json();
    expect(umsystemeAntwort.parse(koerper)).toEqual({
      einsaetze: [
        { system: "suchlage", id: "18", name: "Brandwache", ort: null, beginn: "2026-11-01T19:00:00+01:00", ende: null },
        { system: "suchlage", id: "17", name: "Personensuche Ebstorf", ort: "Ebstorf", beginn: "2026-10-31T19:12:00+01:00", ende: "2026-10-31T23:40:00+01:00" },
      ],
    });
    expect(JSON.stringify(koerper)).not.toContain(TOKEN);
    const [url, init] = abruf.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://suchlage.example.org/api/einsatztagebuch/v1/einsaetze");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("Suchlage lehnt ab → 502 umsystem_abgelehnt; nicht erreichbar oder Unfug → 503", async () => {
    const { db, geraeteToken } = await einRechner();
    const { verbindeSuchlage } = await import("../../_lib/umsysteme");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    const { GET } = await import("./route");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    let res = await GET(req(geraeteToken));
    expect([res.status, (await res.json()).error.code]).toEqual([502, "umsystem_abgelehnt"]);
    for (const antwort of [() => Promise.reject(new Error("weg")), async () => new Response("<html>", { status: 502 }), async () => Response.json({ api_version: 2 })]) {
      vi.stubGlobal("fetch", vi.fn(antwort));
      res = await GET(req(geraeteToken));
      expect([res.status, (await res.json()).error.code]).toEqual([503, "umsystem_nicht_erreichbar"]);
    }
  });

  it("ein schon verknüpfter Einsatz fehlt; offene Meldungen gehen vorher an Suchlage (IDA-359)", async () => {
    const { db, geraeteToken } = await einRechner();
    const { verbindeSuchlage } = await import("../../_lib/umsysteme");
    const { umsystemVerknuepfung } = await import("../../_db/schema");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    db.insert(umsystemVerknuepfung).values([
      { system: "suchlage", einsatzId: "17", rechnerId: "r1", block: 3, gemeldetAm: new Date() },
      { system: "suchlage", einsatzId: "9", rechnerId: "r1", block: 2, gemeldetAm: new Date() },
    ]).run();
    const abruf = vi.fn(async (url: string) =>
      url.endsWith("/17/verknuepfung") ? new Response(null, { status: 204 })
        : url.endsWith("/9/verknuepfung") ? new Response(null, { status: 404 })
          : Response.json(SUCHLAGE));
    vi.stubGlobal("fetch", abruf);
    const { GET } = await import("./route");
    const res = await GET(req(geraeteToken));
    expect((await res.json()).einsaetze.map((e: { id: string }) => e.id)).toEqual(["18"]);
    expect(abruf.mock.calls.map(([url]) => url)).toEqual([
      "https://suchlage.example.org/api/einsatztagebuch/v1/einsaetze/17/verknuepfung",
      "https://suchlage.example.org/api/einsatztagebuch/v1/einsaetze/9/verknuepfung",
      "https://suchlage.example.org/api/einsatztagebuch/v1/einsaetze",
    ]);
    expect(db.select().from(umsystemVerknuepfung).all().every((z) => z.weitergegebenAm !== null)).toBe(true);
  });

  it("lehnt Suchlage eine Meldung ab, bleibt sie offen, und der Einsatz fehlt trotzdem (IDA-359)", async () => {
    const { db, geraeteToken } = await einRechner();
    const { verbindeSuchlage } = await import("../../_lib/umsysteme");
    const { umsystemVerknuepfung } = await import("../../_db/schema");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    db.insert(umsystemVerknuepfung).values({ system: "suchlage", einsatzId: "17", rechnerId: "r1", block: 3, gemeldetAm: new Date() }).run();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/verknuepfung") ? new Response(null, { status: 503 }) : Response.json(SUCHLAGE)));
    const { GET } = await import("./route");
    expect((await (await GET(req(geraeteToken))).json()).einsaetze.map((e: { id: string }) => e.id)).toEqual(["18"]);
    expect(db.select().from(umsystemVerknuepfung).get()?.weitergegebenAm).toBeNull();
  });

  it("lehnt Suchlage das Sperren mit 403 ab, sieht die Verwaltung es an der Verbindung, bis es gelingt (IDA-359)", async () => {
    const { db, geraeteToken } = await einRechner();
    const { verbindeSuchlage, leseSuchlage } = await import("../../_lib/umsysteme");
    const { umsystemVerknuepfung } = await import("../../_db/schema");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    db.insert(umsystemVerknuepfung).values({ system: "suchlage", einsatzId: "17", rechnerId: "r1", block: 3, gemeldetAm: new Date() }).run();
    const { GET } = await import("./route");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/verknuepfung") ? new Response(null, { status: 403 }) : Response.json(SUCHLAGE)));
    await GET(req(geraeteToken));
    expect(leseSuchlage(db)?.sperreAbgelehnt).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/verknuepfung") ? new Response(null, { status: 204 }) : Response.json(SUCHLAGE)));
    await GET(req(geraeteToken));
    expect(leseSuchlage(db)?.sperreAbgelehnt).toBe(false);
    expect(db.select().from(umsystemVerknuepfung).get()?.weitergegebenAm).not.toBeNull();
  });
});

describe("kuerze (IDA-359)", () => {
  it("teilt kein Surrogatpaar, sonst lehnt der Rechner die ganze Liste ab", async () => {
    const { kuerze } = await import("../../_lib/umsysteme");
    const name = `${"a".repeat(199)}🔥b`;
    expect(kuerze(name, 200)).toBe("a".repeat(199));
    expect(kuerze(name, 201)).toBe(`${"a".repeat(199)}🔥`);
    expect(kuerze("kurz", 200)).toBe("kurz");
  });
});
