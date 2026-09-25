import { and, eq, isNull } from "drizzle-orm";
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";

const DIR = "./.data/einsatzbuch-api-einrichten-test";
const HOST = "einsatzbuch.localtest.me";

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
  setzeAktiveZeitzone(STANDARD_ZEITZONE);
  vi.useRealTimers();
});

function req(o: { body?: unknown; bearer?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST, "content-type": "application/json" };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  return new Request("http://x/api/einrichten", { method: "POST", headers, body: JSON.stringify(o.body ?? {}) });
}

async function umgebung() {
  const { getDb } = await import("../../_db/client");
  const { ENTWICKLUNGS_KEK } = await import("../../_lib/schluessel/kek");
  process.env.EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK;
  return { db: getDb(), env: { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK } };
}

describe("POST /api/einrichten", () => {
  it("fremder Host → 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ host: "iuk-ue.de", body: { art: "test", name: "X" } }))).status).toBe(404);
  });

  it("ohne gültiges Sitzungstoken → 401 sitzung_ungueltig", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ body: { art: "test", name: "X" }, bearer: "u".repeat(43) }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("sitzung_ungueltig");
  });

  it("abgelaufenes Sitzungstoken (30 min) → 401 sitzung_ungueltig", async () => {
    const { db } = await umgebung();
    const { sitzungFuer } = await import("../../_lib/anbindung/testHilfe");
    const { POST } = await import("./route");
    const jetzt = new Date();
    const { token } = sitzungFuer(db, { einrichtung: { art: "test", name: "Übungsrechner", ersetzen: false }, jetzt });
    vi.setSystemTime(new Date(jetzt.getTime() + 30 * 60_000 + 1000));
    const res = await POST(req({ body: { art: "test", name: "Übungsrechner" }, bearer: token }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("sitzung_ungueltig");
  });

  it("richtet einen Test-Rechner ein; die Antwort parst mit einrichtenAntwort", async () => {
    const { db } = await umgebung();
    const { sitzungFuer } = await import("../../_lib/anbindung/testHilfe");
    const { einrichtenAntwort } = await import("../../_lib/anbindung/vertrag");
    const { POST } = await import("./route");
    const jetzt = new Date();
    const { token } = sitzungFuer(db, { einrichtung: { art: "test", name: "Übungsrechner", ersetzen: false }, jetzt });
    const res = await POST(req({ body: { art: "test", name: "Übungsrechner" }, bearer: token }));
    expect(res.status).toBe(200);
    const antwort = await res.json();
    expect(einrichtenAntwort.safeParse(antwort).success).toBe(true);
    expect(antwort).toMatchObject({ art: "test", name: "Übungsrechner" });
  });

  it("ein echter Rechner wird ohne Bestätigung nicht ersetzt → 409 echt_vorhanden, der alte bleibt aktiv", async () => {
    const { db, env } = await umgebung();
    const { legePaarAn } = await import("../../_lib/schluessel/paar");
    const { ausBase64 } = await import("../../_lib/kern/bytes");
    const { ENTWICKLUNGS_KEK } = await import("../../_lib/schluessel/kek");
    const { richteRechnerEin, sitzungFuer } = await import("../../_lib/anbindung/testHilfe");
    const { rechner } = await import("../../_db/schema");
    const { POST } = await import("./route");
    const jetzt = new Date();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: ausBase64(ENTWICKLUNGS_KEK), jetzt });
    const erster = await richteRechnerEin(db, { art: "echt", name: "Einsatzleitung", jetzt, env });

    const { token } = sitzungFuer(db, { einrichtung: { art: "echt", name: "Zweitrechner", ersetzen: false }, jetzt });
    const res = await POST(req({ body: { art: "echt", name: "Zweitrechner" }, bearer: token }));
    expect(res.status).toBe(409);
    const k = await res.json();
    expect(k.error.code).toBe("echt_vorhanden");
    expect(k).toMatchObject({ eingerichtetVon: "Jana Albers" });

    const aktiv = db.select().from(rechner).where(and(eq(rechner.id, erster.rechnerId), isNull(rechner.widerrufenAm))).get();
    expect(aktiv).toBeTruthy();
    expect(db.select().from(rechner).all()).toHaveLength(1);
  });
});
