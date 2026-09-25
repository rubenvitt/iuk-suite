import { eq } from "drizzle-orm";
import { rmSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-api-sicherung-test";
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
  return new Request("http://x/api/sicherung", { method: "POST", headers, body: JSON.stringify(o.body ?? {}) });
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

describe("POST /api/sicherung", () => {
  it("fremder Host → 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ host: "iuk-ue.de", body: { erstellt: "2026-09-25T10:00:00+02:00" } }))).status).toBe(404);
  });

  it("widerrufenes Geräte-Token → 401 geraet_ungueltig", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { widerrufe } = await import("../../_lib/anbindung/rechner");
    const { POST } = await import("./route");
    widerrufe(db, rechnerId, new Date());
    const res = await POST(req({ bearer: geraeteToken, body: { erstellt: "2026-09-25T10:00:00+02:00" } }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("geraet_ungueltig");
  });

  it("meldet die Sicherung → 204, letzte_sicherung wird gesetzt", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { rechner } = await import("../../_db/schema");
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: geraeteToken, body: { erstellt: "2026-09-25T10:00:00+02:00" } }));
    expect(res.status).toBe(204);
    const z = db.select({ letzteSicherung: rechner.letzteSicherung }).from(rechner).where(eq(rechner.id, rechnerId)).get();
    expect(z?.letzteSicherung).toBe("2026-09-25T10:00:00+02:00");
  });

  it("kaputter Body → 400 validation_error", async () => {
    const { geraeteToken } = await einRechner();
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: geraeteToken, body: { erstellt: "kein-zeitpunkt" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });
});
