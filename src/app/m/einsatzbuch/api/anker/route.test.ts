import { sql } from "drizzle-orm";
import { rmSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-api-anker-test";
const HOST = "einsatzbuch.localtest.me";

beforeEach(() => {
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

function getReq(o: { bearer?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  return new Request("http://x/api/anker", { method: "GET", headers });
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

  it("409 anker_mehrdeutig: zwei echte Rechner tragen für den höchsten Block verschiedene Hashes", async () => {
    const { getDb } = await import("../../_db/client");
    const { anker } = await import("../../_db/schema");
    const { GET } = await import("./route");
    const db = getDb();
    const jetzt = new Date();
    await echterRechner(db, { id: "alt", widerrufenAm: jetzt });
    const tokenNeu = await echterRechner(db, { id: "neu" });
    db.insert(anker).values({ rechnerId: "alt", block: 4, hash: "a".repeat(64), gemeldetAm: jetzt }).run();
    db.insert(anker).values({ rechnerId: "neu", block: 4, hash: "b".repeat(64), gemeldetAm: jetzt }).run();

    const res = await GET(getReq({ bearer: tokenNeu }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("anker_mehrdeutig");
  });
});
