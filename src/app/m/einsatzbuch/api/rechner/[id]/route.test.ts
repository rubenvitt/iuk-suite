import { eq } from "drizzle-orm";
import { rmSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/einsatzbuch-api-rechner-id-test";
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

function req(o: { bearer?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  return new Request("http://x/api/rechner/x", { method: "DELETE", headers });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function rechnerMitSitzung(o: { art?: "echt" | "test"; name?: string; jetzt: Date; env: Record<string, string | undefined> }) {
  const { getDb } = await import("../../../_db/client");
  const { sitzungFuer } = await import("../../../_lib/anbindung/testHilfe");
  const { richteEin } = await import("../../../_lib/anbindung/rechner");
  const db = getDb();
  const einrichtung = { art: o.art ?? "test" as const, name: o.name ?? "Übungsrechner", ersetzen: false };
  const { token, sitzung } = sitzungFuer(db, { einrichtung, jetzt: o.jetzt });
  const e = await richteEin(db, sitzung, { art: einrichtung.art, name: einrichtung.name }, { jetzt: o.jetzt, env: o.env });
  if (!e.ok) throw new Error(e.code);
  return { db, token, antwort: e.antwort };
}

async function umgebung() {
  const { ENTWICKLUNGS_KEK } = await import("../../../_lib/schluessel/kek");
  process.env.EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK;
  return { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK };
}

describe("DELETE /api/rechner/[id]", () => {
  it("fremder Host → 404", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(req({ host: "iuk-ue.de" }), ctx("x"))).status).toBe(404);
  });

  it("ohne gültige Sitzung → 401 sitzung_ungueltig", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(req({ bearer: "u".repeat(43) }), ctx("x"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("sitzung_ungueltig");
  });

  it("unbekannte id → 404 unbekannt", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token } = await rechnerMitSitzung({ jetzt, env });
    const { DELETE } = await import("./route");
    const res = await DELETE(req({ bearer: token }), ctx("nie-gesehen"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("unbekannt");
  });

  it("echter Rechner → 403 nur_test", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { getDb } = await import("../../../_db/client");
    const { legePaarAn } = await import("../../../_lib/schluessel/paar");
    const { ausBase64 } = await import("../../../_lib/kern/bytes");
    await legePaarAn(getDb(), { art: "echt", rechnerId: null, kek: ausBase64(env.EINSATZBUCH_SCHLUESSEL_KEK!), jetzt });
    const { token, antwort } = await rechnerMitSitzung({ art: "echt", name: "Einsatzleitung", jetzt, env });
    const { DELETE } = await import("./route");
    const res = await DELETE(req({ bearer: token }), ctx(antwort.rechnerId));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("nur_test");
  });

  it("fremder Test-Rechner → 403 fremder_rechner", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token } = await rechnerMitSitzung({ name: "Übungsrechner 1", jetzt, env });
    const { antwort: fremd } = await rechnerMitSitzung({ name: "Übungsrechner 2", jetzt, env });
    const { DELETE } = await import("./route");
    const res = await DELETE(req({ bearer: token }), ctx(fremd.rechnerId));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("fremder_rechner");
  });

  it("eigener Test-Rechner → 204; danach sind Paar und Anker weg, das Geräte-Token liefert 401, die Sitzung gibt nichts mehr frei", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { db, token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const { schluesselpaar, anker } = await import("../../../_db/schema");
    const { meldeAnker } = await import("../../../_lib/anbindung/anker");
    meldeAnker(db, antwort.rechnerId, 1, "a".repeat(64), jetzt);

    const { DELETE } = await import("./route");
    const res = await DELETE(req({ bearer: token }), ctx(antwort.rechnerId));
    expect(res.status).toBe(204);

    expect(db.select().from(schluesselpaar).where(eq(schluesselpaar.rechnerId, antwort.rechnerId)).all()).toEqual([]);
    expect(db.select().from(anker).where(eq(anker.rechnerId, antwort.rechnerId)).all()).toEqual([]);

    const { GET: stammdatenGet } = await import("../../stammdaten/route");
    const geraet = await stammdatenGet(new Request("http://x/api/stammdaten", { headers: { host: HOST, authorization: `Bearer ${antwort.geraeteToken}` } }));
    expect(geraet.status).toBe(401);

    const { POST: freigebenPost } = await import("../../schluessel/freigeben/route");
    const freigabe = await freigebenPost(new Request("http://x/api/schluessel/freigeben", {
      method: "POST", headers: { host: HOST, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "[]",
    }));
    expect([401, 403]).toContain(freigabe.status);
  });

  it("Review Focus 2: DELETE mit einer Sitzung, deren gebundener Rechner bereits widerrufen ist → 401", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { db, token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const { widerrufe } = await import("../../../_lib/anbindung/rechner");
    widerrufe(db, antwort.rechnerId, jetzt);
    const { DELETE } = await import("./route");
    const res = await DELETE(req({ bearer: token }), ctx(antwort.rechnerId));
    expect(res.status).toBe(401);
  });
});
