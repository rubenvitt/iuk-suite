import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";

const DIR = "./.data/einsatzbuch-api-tausch-test";
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
afterEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));

function req(o: { body?: unknown; bearer?: string; host?: string } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST, "content-type": "application/json" };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  return new Request("http://x/api/anmelden/tausch", { method: "POST", headers, body: JSON.stringify(o.body ?? {}) });
}

describe("POST /api/anmelden/tausch", () => {
  it("fremder Host → 404", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ host: "iuk-ue.de", body: { code: "a".repeat(43), verifier: "v".repeat(43) } }))).status).toBe(404);
  });

  it("ein nie ausgegebener Code → 400 code_ungueltig", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ body: { code: "a".repeat(43), verifier: "v".repeat(43) } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("code_ungueltig");
  });

  it("abgelaufener Code → 400 code_ungueltig", async () => {
    const { getDb } = await import("../../../_db/client");
    const { codeFuer } = await import("../../../_lib/anbindung/testHilfe");
    const { POST } = await import("./route");
    const db = getDb();
    // Ablauf liegt 60s NACH `jetzt` (CODE_GUELTIG_MS) — zwei Minuten in der Vergangenheit erzeugt reicht.
    const { code, verifier } = codeFuer(db, { jetzt: new Date(Date.now() - 120_000) });
    const res = await POST(req({ body: { code, verifier } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("code_ungueltig");
  });

  it("falscher verifier → 400 verifier_falsch, danach ist der Code verbraucht", async () => {
    const { getDb } = await import("../../../_db/client");
    const { codeFuer } = await import("../../../_lib/anbindung/testHilfe");
    const { POST } = await import("./route");
    const db = getDb();
    const { code } = codeFuer(db, { jetzt: new Date() });
    const res = await POST(req({ body: { code, verifier: "x".repeat(43) } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("verifier_falsch");
    // Zweiter Versuch, jetzt mit dem RICHTIGEN Verifier: der Code ist trotzdem weg.
    const zweiter = await POST(req({ body: { code, verifier: "v".repeat(43) } }));
    expect(zweiter.status).toBe(400);
    expect((await zweiter.json()).error.code).toBe("code_ungueltig");
  });

  it("zweites Einlösen desselben Codes → 400 code_ungueltig", async () => {
    const { getDb } = await import("../../../_db/client");
    const { codeFuer } = await import("../../../_lib/anbindung/testHilfe");
    const { POST } = await import("./route");
    const db = getDb();
    const { code, verifier } = codeFuer(db, { jetzt: new Date() });
    expect((await POST(req({ body: { code, verifier } }))).status).toBe(200);
    const zweite = await POST(req({ body: { code, verifier } }));
    expect(zweite.status).toBe(400);
    expect((await zweite.json()).error.code).toBe("code_ungueltig");
  });

  it("11. Tausch in einer Minute → 429", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 10; i++) {
      const res = await POST(req({ body: { code: "a".repeat(43), verifier: "v".repeat(43) } }));
      expect(res.status).toBe(400); // unbekannter Code, zählt trotzdem gegen die Bremse
    }
    const elfter = await POST(req({ body: { code: "a".repeat(43), verifier: "v".repeat(43) } }));
    expect(elfter.status).toBe(429);
    expect((await elfter.json()).error.code).toBe("rate_limited");
  });

  it("gültiges Geräte-Token bindet die Sitzung an den Rechner; widerrufenes Token → rechnerId null", async () => {
    const { getDb } = await import("../../../_db/client");
    const { codeFuer, richteRechnerEin } = await import("../../../_lib/anbindung/testHilfe");
    const { widerrufe } = await import("../../../_lib/anbindung/rechner");
    const { ENTWICKLUNGS_KEK } = await import("../../../_lib/schluessel/kek");
    const { tauschAntwort } = await import("../../../_lib/anbindung/vertrag");
    const { POST } = await import("./route");
    const db = getDb();
    const jetzt = new Date();
    const env = { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK };
    process.env.EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK;
    const rechner = await richteRechnerEin(db, { jetzt, env });

    const { code: c1, verifier: v1 } = codeFuer(db, { jetzt: new Date() });
    const gebunden = await POST(req({ body: { code: c1, verifier: v1 }, bearer: rechner.geraeteToken }));
    expect(gebunden.status).toBe(200);
    const antwortGebunden = await gebunden.json();
    expect(tauschAntwort.safeParse(antwortGebunden).success).toBe(true);
    expect(antwortGebunden.rechnerId).toBe(rechner.rechnerId);

    widerrufe(db, rechner.rechnerId, jetzt);
    const { code: c2, verifier: v2 } = codeFuer(db, { jetzt: new Date() });
    const ungebunden = await POST(req({ body: { code: c2, verifier: v2 }, bearer: rechner.geraeteToken }));
    expect(ungebunden.status).toBe(200);
    expect((await ungebunden.json()).rechnerId).toBeNull();
  });

  it("Antwort parst mit tauschAntwort", async () => {
    const { getDb } = await import("../../../_db/client");
    const { codeFuer } = await import("../../../_lib/anbindung/testHilfe");
    const { tauschAntwort } = await import("../../../_lib/anbindung/vertrag");
    const { POST } = await import("./route");
    const db = getDb();
    const { code, verifier } = codeFuer(db, { jetzt: new Date(), einrichtung: { art: "test", name: "Übungsrechner", ersetzen: false } });
    const res = await POST(req({ body: { code, verifier } }));
    expect(res.status).toBe(200);
    const antwort = await res.json();
    expect(tauschAntwort.safeParse(antwort).success).toBe(true);
    expect(antwort.einrichtung).toEqual({ art: "test", name: "Übungsrechner", ersetzen: false });
  });
});
