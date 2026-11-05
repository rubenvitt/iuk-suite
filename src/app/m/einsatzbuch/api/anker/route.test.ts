import { sql } from "drizzle-orm";
import { rmSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";

/** `after()` gibt es nur in einer Anfrage von Next; hier läuft der Rückruf sofort und wird gemerkt. */
const nachher: Promise<unknown>[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (f: () => Promise<unknown>) => { nachher.push(f()); },
}));

const DIR = "./.data/einsatzbuch-api-anker-test";
const HOST = "einsatzbuch.localtest.me";

beforeEach(() => {
  nachher.length = 0;
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete process.env.SUITE_HOST_EINSATZBUCH;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
});

function req(o: { body?: unknown; bearer?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST, "content-type": "application/json" };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  return new Request("http://x/api/anker", { method: "POST", headers, body: JSON.stringify(o.body ?? {}) });
}

/** `erster` ist der Hash von Block 1 der gesuchten Kette; `null` lässt den Parameter weg. */
function getReq(o: { bearer?: string; host?: string; erster?: string | null } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  const erster = o.erster === undefined ? "a".repeat(64) : o.erster;
  const abfrage = erster === null ? "" : `?erster=${encodeURIComponent(erster)}`;
  return new Request(`http://x/api/anker${abfrage}`, { method: "GET", headers });
}

async function einRechner() {
  const { getDb } = await import("../../_db/client");
  const { ENTWICKLUNGS_KEK } = await import("../../_lib/schluessel/kek");
  const { richteRechnerEin } = await import("../../_lib/anbindung/testHilfe");
  process.env.EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK;
  const db = getDb();
  const antwort = await richteRechnerEin(db, { jetzt: new Date(), env: { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK } });
  return { db, geraeteToken: antwort.geraeteToken, rechnerId: antwort.rechnerId };
}

describe("POST /api/anker", () => {
  it("fremder Host → 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ host: "iuk-ue.de", body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(404);
  });

  it("widerrufenes Geräte-Token → 401 geraet_ungueltig", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { widerrufe } = await import("../../_lib/anbindung/rechner");
    const { POST } = await import("./route");
    widerrufe(db, rechnerId, new Date());
    const res = await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("geraet_ungueltig");
  });

  it("erste Meldung eines Blocks → 204", async () => {
    const { geraeteToken } = await einRechner();
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }));
    expect(res.status).toBe(204);
  });

  it("gleiche Meldung erneut → 204, ohne Abweichung", async () => {
    const { geraeteToken } = await einRechner();
    const { POST } = await import("./route");
    expect((await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(204);
    expect((await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(204);
  });

  it("abweichende Meldung → 409 anker_abweichung mit erwartet, protokolliert mit dem Akteur des Geräts", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { POST } = await import("./route");
    expect((await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(204);
    const res = await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "b".repeat(64) } }));
    expect(res.status).toBe(409);
    const k = await res.json();
    expect(k.error.code).toBe("anker_abweichung");
    expect(k.erwartet).toBe("a".repeat(64));

    const zeilen = db.all(sql`SELECT action, actor, object_type FROM audit_outbox WHERE object_type = 'anker_abweichung'`) as { action: string; actor: string; object_type: string }[];
    expect(zeilen).toHaveLength(1);
    expect(JSON.parse(zeilen[0].actor)).toEqual({ kind: "access", id: `einsatzbuch:rechner:${rechnerId}`, name: "Übungsrechner" });
  });

  it("dieselbe Abweichung erneut → wieder 409 mit erwartet, aber genau eine Zeile und ein Audit-Eintrag", async () => {
    const { db, geraeteToken } = await einRechner();
    const { ankerAbweichung } = await import("../../_db/schema");
    const { POST } = await import("./route");
    expect((await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(204);
    for (let i = 0; i < 3; i++) {
      const res = await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "b".repeat(64) } }));
      expect(res.status).toBe(409);
      expect((await res.json()).erwartet).toBe("a".repeat(64));
    }
    expect(db.select().from(ankerAbweichung).all()).toHaveLength(1);
    expect(db.all(sql`SELECT id FROM audit_outbox WHERE object_type = 'anker_abweichung'`)).toHaveLength(1);
  });
});

describe("POST /api/anker mit umsysteme (IDA-359)", () => {
  const SUCHLAGE_TOKEN = "c".repeat(64);
  const LINK = `https://suchlage.example.org/kiosk#${SUCHLAGE_TOKEN}`;
  const MIT = (block: number, hash = "a".repeat(64)) => ({ block, hash, umsysteme: [{ system: "suchlage", id: "17" }] });

  it("ein echter Rechner merkt den Einsatz vor, und die Suite meldet ihn nach der Antwort Suchlage", async () => {
    const { db } = await einRechner();
    const token = await echterRechner(db, { id: "r-echt" });
    const { verbindeSuchlage } = await import("../../_lib/umsysteme");
    const { umsystemVerknuepfung } = await import("../../_db/schema");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    const abruf = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", abruf);
    const { POST } = await import("./route");

    expect((await POST(req({ bearer: token, body: MIT(1) }))).status).toBe(204);
    await Promise.all(nachher);
    const [url, init] = abruf.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(["https://suchlage.example.org/api/einsatztagebuch/v1/einsaetze/17/verknuepfung", "POST"]);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SUCHLAGE_TOKEN}`);
    const zeilen = db.select().from(umsystemVerknuepfung).all();
    expect(zeilen.map((z) => [z.system, z.einsatzId, z.rechnerId, z.block, z.weitergegebenAm !== null])).toEqual([["suchlage", "17", "r-echt", 1, true]]);

    // Die erneute Meldung des letzten Blocks und ein späterer Block mit demselben Einsatz ändern nichts.
    expect((await POST(req({ bearer: token, body: MIT(1) }))).status).toBe(204);
    expect((await POST(req({ bearer: token, body: MIT(2, "b".repeat(64)) }))).status).toBe(204);
    await Promise.all(nachher);
    expect(abruf).toHaveBeenCalledTimes(1);
    expect(db.select().from(umsystemVerknuepfung).all().map((z) => z.block)).toEqual([1]);
  });

  it("nicht erreichbar: die Meldung bleibt offen, und der nächste Anker holt sie nach, auch ohne umsysteme", async () => {
    const { db } = await einRechner();
    const token = await echterRechner(db, { id: "r-echt" });
    const { verbindeSuchlage } = await import("../../_lib/umsysteme");
    const { umsystemVerknuepfung } = await import("../../_db/schema");
    verbindeSuchlage(db, LINK, "Verwaltung", new Date());
    const abruf = vi.fn((): Promise<Response> => Promise.reject(new Error("weg")));
    vi.stubGlobal("fetch", abruf);
    const { POST } = await import("./route");

    expect((await POST(req({ bearer: token, body: MIT(1) }))).status).toBe(204);
    await Promise.all(nachher);
    expect(db.select().from(umsystemVerknuepfung).get()?.weitergegebenAm).toBeNull();

    abruf.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    expect((await POST(req({ bearer: token, body: { block: 2, hash: "b".repeat(64) } }))).status).toBe(204);
    await Promise.all(nachher);
    expect(db.select().from(umsystemVerknuepfung).get()?.weitergegebenAm).not.toBeNull();

    // Ist nichts mehr offen, fragt ein Anker ohne umsysteme Suchlage gar nicht.
    const bisher = nachher.length;
    expect((await POST(req({ bearer: token, body: { block: 3, hash: "c".repeat(64) } }))).status).toBe(204);
    expect(nachher).toHaveLength(bisher);
  });

  it("ein Test-Rechner und ein abweichender Block sperren nichts", async () => {
    const { db, geraeteToken } = await einRechner();
    const token = await echterRechner(db, { id: "r-echt" });
    const { umsystemVerknuepfung } = await import("../../_db/schema");
    const { POST } = await import("./route");
    expect((await POST(req({ bearer: geraeteToken, body: MIT(1) }))).status).toBe(204);
    expect((await POST(req({ bearer: token, body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(204);
    expect((await POST(req({ bearer: token, body: MIT(1, "b".repeat(64)) }))).status).toBe(409);
    expect(db.select().from(umsystemVerknuepfung).all()).toEqual([]);
    expect(nachher).toHaveLength(0);
  });

  it("leeres oder falsch geformtes umsysteme → 400", async () => {
    const { geraeteToken } = await einRechner();
    const { POST } = await import("./route");
    for (const umsysteme of [[], [{ system: "Suchlage", id: "1" }], [{ system: "suchlage", id: "" }], [{ system: "suchlage", id: "1", name: "x" }], [{ system: "suchlage", id: "abc" }], [{ system: "suchlage", id: "07" }]]) {
      const res = await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64), umsysteme } }));
      expect(res.status, JSON.stringify(umsysteme)).toBe(400);
    }
  });
});

/** Legt einen echten Rechner direkt an (ohne Umweg über `richteEin`) und liefert sein Klartext-Token. */
async function echterRechner(db: Awaited<ReturnType<typeof einRechner>>["db"], o: { id: string; widerrufenAm?: Date }) {
  const { rechner } = await import("../../_db/schema");
  const { hashVon, neuesGeheimnis } = await import("../../_lib/anbindung/token");
  const token = neuesGeheimnis();
  const jetzt = new Date();
  db.insert(rechner).values({
    id: o.id, art: "echt", name: `Rechner ${o.id}`, tokenHash: hashVon(token),
    eingerichtetAm: jetzt, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1",
    widerrufenAm: o.widerrufenAm,
  }).run();
  return token;
}

describe("GET /api/anker", () => {
  it("fremder Host → 404", async () => {
    const { GET } = await import("./route");
    expect((await GET(getReq({ host: "iuk-ue.de" }))).status).toBe(404);
  });

  it("widerrufenes Geräte-Token → 401 geraet_ungueltig", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { widerrufe } = await import("../../_lib/anbindung/rechner");
    const { GET } = await import("./route");
    widerrufe(db, rechnerId, new Date());
    const res = await GET(getReq({ bearer: geraeteToken }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("geraet_ungueltig");
  });

  it("ohne Anker → 200 { anker: null }", async () => {
    const { geraeteToken } = await einRechner();
    const { GET } = await import("./route");
    const res = await GET(getReq({ bearer: geraeteToken }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ anker: null });
  });

  it("mit gemeldeten Ankern → 200 mit dem höchsten Block", async () => {
    const { geraeteToken } = await einRechner();
    const { POST, GET } = await import("./route");
    expect((await POST(req({ bearer: geraeteToken, body: { block: 1, hash: "a".repeat(64) } }))).status).toBe(204);
    expect((await POST(req({ bearer: geraeteToken, body: { block: 2, hash: "b".repeat(64) } }))).status).toBe(204);
    const res = await GET(getReq({ bearer: geraeteToken }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ anker: { block: 2, hash: "b".repeat(64) } });
  });

  it("ohne oder mit ungültigem erster → 400 validation_error", async () => {
    const { geraeteToken } = await einRechner();
    const { GET } = await import("./route");
    for (const erster of [null, "", "A".repeat(64), "a".repeat(63), "g".repeat(64)]) {
      const res = await GET(getReq({ bearer: geraeteToken, erster }));
      expect(res.status, String(erster)).toBe(400);
      expect((await res.json()).error.code).toBe("validation_error");
    }
  });

  it("Kettenidentität: A trägt Anker bis 10 ohne Sicherung, B eine neue Kette bis 5 — Bs Kette endet bei 5", async () => {
    const { getDb } = await import("../../_db/client");
    const { anker } = await import("../../_db/schema");
    const { GET } = await import("./route");
    const db = getDb();
    const jetzt = new Date();
    await echterRechner(db, { id: "a", widerrufenAm: jetzt });
    await echterRechner(db, { id: "b", widerrufenAm: jetzt });
    const tokenC = await echterRechner(db, { id: "c" });
    for (let block = 1; block <= 10; block++) db.insert(anker).values({ rechnerId: "a", block, hash: "a".repeat(63) + (block % 10), gemeldetAm: jetzt }).run();
    for (let block = 1; block <= 5; block++) db.insert(anker).values({ rechnerId: "b", block, hash: "b".repeat(63) + block, gemeldetAm: jetzt }).run();

    const vonB = await GET(getReq({ bearer: tokenC, erster: "b".repeat(63) + "1" }));
    expect(vonB.status).toBe(200);
    expect(await vonB.json()).toEqual({ anker: { block: 5, hash: "b".repeat(63) + "5" } });
    const vonA = await GET(getReq({ bearer: tokenC, erster: "a".repeat(63) + "1" }));
    expect(await vonA.json()).toEqual({ anker: { block: 10, hash: "a".repeat(63) + "0" } });
  });

  it("409 anker_mehrdeutig: zwei echte Rechner derselben Kette tragen für den höchsten Block verschiedene Hashes", async () => {
    const { getDb } = await import("../../_db/client");
    const { anker } = await import("../../_db/schema");
    const { GET } = await import("./route");
    const db = getDb();
    const jetzt = new Date();
    await echterRechner(db, { id: "alt", widerrufenAm: jetzt });
    const tokenNeu = await echterRechner(db, { id: "neu" });
    for (const rechnerId of ["alt", "neu"]) db.insert(anker).values({ rechnerId, block: 1, hash: "1".repeat(64), gemeldetAm: jetzt }).run();
    db.insert(anker).values({ rechnerId: "alt", block: 4, hash: "a".repeat(64), gemeldetAm: jetzt }).run();
    db.insert(anker).values({ rechnerId: "neu", block: 4, hash: "b".repeat(64), gemeldetAm: jetzt }).run();

    const res = await GET(getReq({ bearer: tokenNeu, erster: "1".repeat(64) }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("anker_mehrdeutig");
  });
});
