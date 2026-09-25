import { eq } from "drizzle-orm";
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAllModules } from "@/core/bootstrap";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";

const DIR = "./.data/einsatzbuch-api-stammdaten-test";
const HOST = "einsatzbuch.localtest.me";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete process.env.SUITE_HOST_EINSATZBUCH;
  delete process.env.EINSATZBUCH_SCHLUESSEL_KEK;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  setzeAktiveZeitzone(STANDARD_ZEITZONE);
});
afterEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));

function req(o: { bearer?: string; host?: string; ifNoneMatch?: string } = {}) {
  const headers: Record<string, string> = { host: o.host ?? HOST };
  if (o.bearer) headers.authorization = `Bearer ${o.bearer}`;
  if (o.ifNoneMatch) headers["if-none-match"] = o.ifNoneMatch;
  return new Request("http://x/api/stammdaten", { method: "GET", headers });
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

describe("GET /api/stammdaten", () => {
  it("fremder Host → 404", async () => {
    const { GET } = await import("./route");
    expect((await GET(req({ host: "iuk-ue.de" }))).status).toBe(404);
  });

  it("ohne Geräte-Token → 401 geraet_ungueltig", async () => {
    const { GET } = await import("./route");
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("geraet_ungueltig");
  });

  it("widerrufenes Geräte-Token → 401 geraet_ungueltig", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { widerrufe } = await import("../../_lib/anbindung/rechner");
    const { GET } = await import("./route");
    widerrufe(db, rechnerId, new Date());
    const res = await GET(req({ bearer: geraeteToken }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("geraet_ungueltig");
  });

  it("200 mit ETag, danach 304 mit gleichem If-None-Match; letzter_kontakt wird gesetzt", async () => {
    const { db, geraeteToken, rechnerId } = await einRechner();
    const { stammdatenpaketSchema } = await import("../../_lib/anbindung/vertrag");
    const { rechner } = await import("../../_db/schema");
    const { GET } = await import("./route");

    const erste = await GET(req({ bearer: geraeteToken }));
    expect(erste.status).toBe(200);
    expect(erste.headers.get("cache-control")).toBe("no-store");
    const etag = erste.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(stammdatenpaketSchema.safeParse(await erste.json()).success).toBe(true);
    const nachKontakt = db.select({ letzterKontakt: rechner.letzterKontakt }).from(rechner).where(eq(rechner.id, rechnerId)).get();
    expect(nachKontakt?.letzterKontakt).toBeInstanceOf(Date);

    const zweite = await GET(req({ bearer: geraeteToken, ifNoneMatch: etag! }));
    expect(zweite.status).toBe(304);
    expect(await zweite.text()).toBe("");
  });

  it("überlanges Feld (direkter DB-Insert) → 422 stammdaten_zu_lang mit feld und eintrag", async () => {
    const { db, geraeteToken } = await einRechner();
    const { fahrzeug } = await import("../../_db/schema");
    const { GET } = await import("./route");
    db.insert(fahrzeug).values({ id: "f-lang", typ: "x".repeat(41), kennung: "K-1", ruf: "Rotkreuz 1", standort: "Uelzen", aktiv: true }).run();
    const res = await GET(req({ bearer: geraeteToken }));
    expect(res.status).toBe(422);
    const k = await res.json();
    expect(k.error.code).toBe("stammdaten_zu_lang");
    expect(k).toMatchObject({ feld: "Fahrzeugtyp" });
  });
});
