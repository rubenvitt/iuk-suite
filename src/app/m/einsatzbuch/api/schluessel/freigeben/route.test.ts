import { sql } from "drizzle-orm";
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";

const DIR = "./.data/einsatzbuch-api-freigeben-test";
const HOST = "einsatzbuch.localtest.me";
const PREV = "0".repeat(64);

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
  return new Request("http://x/api/schluessel/freigeben", { method: "POST", headers, body: JSON.stringify(o.body ?? []) });
}

/** Sitzung + eingerichteter Rechner, mit Sitzungstoken UND der Einrichtungsantwort (Paar, id). */
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

/** `paar` ist entweder eine `EinrichtenAntwort` (`oeffentlichSpki`) oder ein `NeuesPaar` (`oeffentlich`). */
async function eintragFuer(paar: { schluesselId: string; oeffentlich?: string; oeffentlichSpki?: string }, block: number, umgebung: "echt" | "test") {
  const { zufall, zuBase64 } = await import("../../../_lib/kern/bytes");
  const { kopf } = await import("../../../_lib/kern/testhilfe");
  const { importiereOeffentlich, packeEin } = await import("../../../_lib/kern/umschlag");
  const oeffentlich = paar.oeffentlich ?? paar.oeffentlichSpki!;
  const cek = zufall(32);
  const k = kopf(block, PREV, paar.schluesselId, umgebung);
  const umschlag = await packeEin(cek, k, await importiereOeffentlich(oeffentlich));
  return { eintrag: { kopf: k, umschlag }, cek: zuBase64(cek) };
}

async function umgebung() {
  const { ENTWICKLUNGS_KEK } = await import("../../../_lib/schluessel/kek");
  process.env.EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK;
  return { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK };
}

describe("POST /api/schluessel/freigeben", () => {
  it("fremder Host → 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ host: "iuk-ue.de", body: [] }))).status).toBe(404);
  });

  it("ohne gültige Sitzung → 401 sitzung_ungueltig", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: "u".repeat(43), body: [] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("sitzung_ungueltig");
  });

  it("abgelaufenes Sitzungstoken (30 min) → 401 sitzung_ungueltig", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token } = await rechnerMitSitzung({ jetzt, env });
    vi.setSystemTime(new Date(jetzt.getTime() + 30 * 60_000 + 1000));
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("sitzung_ungueltig");
  });

  it("gibt einen einzelnen Block frei; die Antwort parst mit freigabeAntwort, eine Audit-Zeile trägt den Akteur der Person", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { db, token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const { eintrag, cek } = await eintragFuer(antwort, 1, "test");
    const { freigabeAntwort } = await import("../../../_lib/anbindung/vertrag");
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [eintrag] }));
    expect(res.status).toBe(200);
    const k = await res.json();
    expect(freigabeAntwort.safeParse(k).success).toBe(true);
    expect(k).toEqual([{ block: 1, cek }]);

    const zeilen = db.all(sql`SELECT actor FROM audit_outbox WHERE object_type = 'freigabe'`) as { actor: string }[];
    expect(zeilen).toHaveLength(1);
    expect(JSON.parse(zeilen[0].actor)).toEqual({ kind: "user", id: "sub-1", name: "Jana Albers" });
  });

  it("fremde schluesselId → 422 schluessel_unbekannt", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const { eintrag } = await eintragFuer({ schluesselId: "a".repeat(16), oeffentlich: antwort.oeffentlichSpki }, 1, "test");
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [eintrag] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("schluessel_unbekannt");
  });

  it("Umgebung gemischt in einer Anfrage → 422 umgebung_gemischt", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const echt = await eintragFuer(antwort, 1, "echt");
    const test = await eintragFuer(antwort, 2, "test");
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [echt.eintrag, test.eintrag] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("umgebung_gemischt");
  });

  it("Art des Sitzungsrechners ≠ Paar → 422 art_passt_nicht", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { legePaarAn } = await import("../../../_lib/schluessel/paar");
    const { ausBase64 } = await import("../../../_lib/kern/bytes");
    const { db, token } = await rechnerMitSitzung({ art: "test", jetzt, env });
    const echtesPaar = await legePaarAn(db, { art: "echt", rechnerId: null, kek: ausBase64(env.EINSATZBUCH_SCHLUESSEL_KEK!), jetzt });
    const { eintrag } = await eintragFuer(echtesPaar, 1, "echt");
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [eintrag] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("art_passt_nicht");
  });

  it("Test-Paar eines fremden Rechners → 422 fremder_rechner", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token } = await rechnerMitSitzung({ name: "Übungsrechner 1", jetzt, env });
    const { antwort: fremd } = await rechnerMitSitzung({ name: "Übungsrechner 2", jetzt, env });
    const { eintrag } = await eintragFuer(fremd, 1, "test");
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [eintrag] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("fremder_rechner");
  });

  it("Paketgrenze: 200 Einträge → 200, 201 Einträge → 413 zu_viele", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const zweihundert = await Promise.all(Array.from({ length: 200 }, (_, i) => eintragFuer(antwort, i + 1, "test")));
    const { POST } = await import("./route");
    const ok = await POST(req({ bearer: token, body: zweihundert.map((x) => x.eintrag) }));
    expect(ok.status).toBe(200);
    expect((await ok.json())).toHaveLength(200);

    const einundzwanzig = await eintragFuer(antwort, 201, "test");
    const zu_viel = await POST(req({ bearer: token, body: [...zweihundert.map((x) => x.eintrag), einundzwanzig.eintrag] }));
    expect(zu_viel.status).toBe(413);
    expect((await zu_viel.json()).error.code).toBe("zu_viele");
  }, 20_000);

  it("Review Focus 2: die Sitzung gibt nach Widerruf des gebundenen Rechners nichts mehr frei", async () => {
    const env = await umgebung();
    const jetzt = new Date();
    const { db, token, antwort } = await rechnerMitSitzung({ jetzt, env });
    const { widerrufe } = await import("../../../_lib/anbindung/rechner");
    const { eintrag } = await eintragFuer(antwort, 1, "test");
    widerrufe(db, antwort.rechnerId, jetzt);
    const { POST } = await import("./route");
    const res = await POST(req({ bearer: token, body: [eintrag] }));
    expect([401, 403]).toContain(res.status);
  });
});
