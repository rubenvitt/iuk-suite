import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { tokens } from "../_db/schema";

/**
 * DRK-291 — GÜLTIGE CODES NACH VERTEILTEM FEHLERDRUCK, durch alle drei
 * Gate-Flächen, mit der ECHTEN Schranke, dem echten Merkmal und der echten
 * Einlösung gegen eine migrierte Datenbank. Gemockt sind nur Nexts
 * Anfragekontext (`headers`/`cookies`/`redirect`) und der DB-Opener.
 *
 * Was hier festgehalten wird, ist die Betreiberentscheidung (Variante C):
 *  - ein BEKANNTES Gerät (Gerätecookie oder signierte, auch abgelaufene
 *    Sitzung) kommt mit richtigem Code herein, auch während Unbekannte die
 *    modulweite Sperre ausgelöst haben — QR, Handeingabe und Erneuerung;
 *  - ein UNBEKANNTES Gerät bleibt in dieser Lage gesperrt (der bewusste Rest:
 *    10^6 Codes lassen sich ohne Vorprüfung nicht schützen);
 *  - Fehlversuche mit Merkmal bleiben gedeckelt — je Gerät und in einem eigenen
 *    modulweiten Budget;
 *  - eine abgewiesene Anfrage verlängert keine Sperre.
 */

const GEHEIM = "e2e-helfer-secret-nicht-produktiv-32z";
const HOST = "lagerbuch.localtest.me";
const CODE = "482-137";

const stand = vi.hoisted(() => ({
  kopf: new Headers(),
  keks: new Map<string, string>(),
  gesetzt: new Map<string, string>(),
  db: null as unknown,
}));

vi.mock("next/headers", () => ({
  headers: async () => stand.kopf,
  cookies: async () => ({
    get: (n: string) => (stand.keks.has(n) ? { name: n, value: stand.keks.get(n)! } : undefined),
    set: (n: string, w: string) => { stand.gesetzt.set(n, w); },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { ziel }); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("../_db/client", () => ({ getDb: () => stand.db }));

type Module = {
  gate: typeof import("../_actions/gate");
  sitzung: typeof import("../_actions/sitzung");
  route: typeof import("../t/[code]/route");
  schranke: typeof import("./gateSchranke");
  merkmal: typeof import("./gateSchrankeMerkmal");
};
let m: Module;
let t: TestDb;
let altesGeheimnis: string | undefined;

beforeEach(async () => {
  altesGeheimnis = process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
  process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = GEHEIM;
  t = migrierteTestDb("lagerbuch-gate-zugang-");
  t.db.insert(tokens).values({
    id: "tk-1", code: CODE, label: "RTW 1", aktiv: true,
    createdAt: new Date(), createdBy: "sub-admin",
  }).run();
  stand.db = t.db;
  // Die Schranke hält ihre Zähler auf Modulebene — jeder Fall bekommt frische.
  vi.resetModules();
  m = {
    gate: await import("../_actions/gate"),
    sitzung: await import("../_actions/sitzung"),
    route: await import("../t/[code]/route"),
    schranke: await import("./gateSchranke"),
    merkmal: await import("./gateSchrankeMerkmal"),
  };
});

afterEach(() => {
  vi.useRealTimers();
  t.schliessen();
  if (altesGeheimnis === undefined) delete process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
  else process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = altesGeheimnis;
});

/** Ein Client: eigene Adresse, eigene Cookies. */
function client(ip: string, keks: Record<string, string> = {}) {
  stand.kopf = new Headers({ host: HOST, "cf-connecting-ip": ip });
  stand.keks = new Map(Object.entries(keks));
  stand.gesetzt = new Map();
}

async function manuell(code: string): Promise<"ok" | string> {
  const f = new FormData();
  f.set("code", code);
  try {
    const z = await m.gate.einloesenAmGate({}, f);
    return z.fehler ?? "ohne-fehler";
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") return "ok";
    throw e;
  }
}

async function qr(code: string): Promise<{ location: string; cookies: string[] }> {
  const cookie = [...stand.keks].map(([k, v]) => `${k}=${v}`).join("; ");
  const kopf: Record<string, string> = { host: HOST, "cf-connecting-ip": stand.kopf.get("cf-connecting-ip")! };
  if (cookie) kopf.cookie = cookie;
  const antw = await m.route.GET(
    new Request(`http://${HOST}/t/${code}`, { headers: kopf }),
    { params: Promise.resolve({ code }) },
  );
  return { location: antw.headers.get("location") ?? "", cookies: antw.headers.getSetCookie() };
}

/** Verteilter Druck wie im Befund: sieben Absender, je fünf falsche Codes. */
async function verteilterDruck() {
  for (let a = 1; a <= 7; a++) {
    client(`198.51.100.${a}`);
    for (let i = 0; i < 5; i++) await manuell("000-000");
  }
}

async function abgelaufeneSitzung(): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  return new SignJWT({ tokenId: "tk-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(jetzt - 13 * 3600)
    .setExpirationTime(jetzt - 3600)
    .sign(new TextEncoder().encode(GEHEIM));
}

describe("DRK-291 lagerbuch — der Befund bleibt für Unbekannte bestehen (bewusster Rest)", () => {
  it("nach verteiltem Druck ist ein UNBEKANNTES Gerät mit richtigem Code gesperrt", async () => {
    await verteilterDruck();
    client("203.0.113.9");
    expect(await manuell("482137")).toMatch(/Zu viele Fehlversuche/);
    expect((await qr("482137")).location).toBe("/?grund=zuviele");
  });

  it("ein gefälschtes Gerätecookie macht kein bekanntes Gerät", async () => {
    await verteilterDruck();
    const falsch = await new SignJWT({ geraet: "x" })
      .setProtectedHeader({ alg: "HS256" }).setAudience("lagerbuch-geraet")
      .setExpirationTime("1y").sign(new TextEncoder().encode("ein-anderes-geheimnis-mit-32-zeichen!"));
    client("203.0.113.9", { lagerbuch_geraet: falsch });
    expect(await manuell("482137")).toMatch(/Zu viele Fehlversuche/);
  });
});

describe("DRK-291 lagerbuch — ein bekanntes Gerät kommt nach verteiltem Druck herein", () => {
  async function bekanntesGeraet(): Promise<string> {
    client("192.0.2.50");
    const erst = await qr("482137");
    expect(erst.location).not.toContain("grund=");
    const wert = erst.cookies.find((c) => c.startsWith("lagerbuch_geraet="));
    expect(wert, "die erste erfolgreiche Anmeldung setzt das Gerätemerkmal").toBeDefined();
    return wert!.split(";")[0]!.slice("lagerbuch_geraet=".length);
  }

  it("QR-Einlösung", async () => {
    const geraet = await bekanntesGeraet();
    await verteilterDruck();
    client("203.0.113.10", { lagerbuch_geraet: geraet });
    const r = await qr("482137");
    expect(r.location).not.toContain("grund=");
    expect(r.cookies.some((c) => c.startsWith("helfer_session="))).toBe(true);
  });

  it("Handeingabe am Gate", async () => {
    const geraet = await bekanntesGeraet();
    await verteilterDruck();
    client("203.0.113.11", { lagerbuch_geraet: geraet });
    expect(await manuell("482137")).toBe("ok");
    expect(stand.gesetzt.has("helfer_session")).toBe(true);
  });

  it("Erneuerung mit Gerätecookie", async () => {
    const geraet = await bekanntesGeraet();
    await verteilterDruck();
    client("203.0.113.12", { lagerbuch_geraet: geraet });
    expect(await m.sitzung.erneuereSitzung("482137")).toEqual({ ok: true, wert: null });
  });

  it("Erneuerung mit einer ABGELAUFENEN, aber echten Sitzung — ohne Gerätecookie", async () => {
    await verteilterDruck();
    client("203.0.113.13", { helfer_session: await abgelaufeneSitzung() });
    expect(await m.sitzung.erneuereSitzung("482137")).toEqual({ ok: true, wert: null });
    // Und sie ist danach ein bekanntes Gerät für die nächste Schicht.
    expect(stand.gesetzt.has("lagerbuch_geraet")).toBe(true);
  });

  it("das Gerätemerkmal selbst ist KEIN Zugang: als Sitzung vorgelegt, wird es abgewiesen", async () => {
    const geraet = await bekanntesGeraet();
    const { verifyHelferSitzung } = await import("./helferSitzung");
    expect(await verifyHelferSitzung(geraet)).toBeNull();
  });
});

describe("DRK-291 lagerbuch — Fehlversuche mit Merkmal bleiben gedeckelt", () => {
  it("je Gerät: nach fünf Fehlversuchen ist auch der richtige Code dieses Geräts eine Minute gesperrt", async () => {
    const geraet = await m.merkmal.geraetCookieWert(undefined);
    client("203.0.113.20", { lagerbuch_geraet: geraet });
    for (let i = 0; i < 5; i++) expect(await manuell("000-000")).toMatch(/unbekannt/);
    expect(await manuell("000-000")).toMatch(/unbekannt/);   // der sechste wird gebucht und sperrt
    expect(await manuell("482137")).toMatch(/Zu viele Fehlversuche/);
  });

  it("rotierte Gerätecookies füllen das EIGENE modulweite Budget — und nur das", async () => {
    for (let a = 0; a < 7; a++) {
      client(`203.0.113.${30 + a}`, { lagerbuch_geraet: await m.merkmal.geraetCookieWert(undefined) });
      for (let i = 0; i < 5; i++) await manuell("000-000");
    }
    client("203.0.113.99", { lagerbuch_geraet: await m.merkmal.geraetCookieWert(undefined) });
    expect(await manuell("482137")).toMatch(/Zu viele Fehlversuche/);
    // Die Unbekannten hat das nicht erreicht.
    client("203.0.113.98");
    expect(await manuell("482137")).toBe("ok");
  });
});

describe("DRK-442 lagerbuch — ein LANGER Code kommt nach verteiltem Druck immer herein", () => {
  /*
   * Die eigentliche Lösung des Rests aus DRK-291: ein UNBEKANNTES Gerät —
   * kein Gerätecookie, keine Sitzung — mit einem langen Code. Minuten- UND
   * Stundensperre der Unbekannten sind ausgelöst.
   */
  const LANG = "7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J50E";

  beforeEach(() => {
    t.db.insert(tokens).values({
      id: "tk-lang", code: LANG, label: "RTW 2", aktiv: true,
      createdAt: new Date(), createdBy: "sub-admin",
    }).run();
  });

  async function vollerDruck() {
    await verteilterDruck();
    expect(m.schranke.gateGesperrt("cf:203.0.113.200")).not.toBeNull();
  }

  it("QR-Einlösung", async () => {
    await vollerDruck();
    client("203.0.113.70");
    const r = await qr(LANG);
    expect(r.location).not.toContain("grund=");
    expect(r.cookies.some((c) => c.startsWith("helfer_session="))).toBe(true);
  });

  it("Handeingabe am Gate — klein geschrieben, mit Leerzeichen, O statt 0", async () => {
    await vollerDruck();
    client("203.0.113.71");
    expect(await manuell("7k3m q9xd 2rtp 4w8n hv6b c1zf j5oe")).toBe("ok");
    expect(stand.gesetzt.has("helfer_session")).toBe(true);
  });

  it("Erneuerung", async () => {
    await vollerDruck();
    client("203.0.113.72");
    expect(await m.sitzung.erneuereSitzung(LANG)).toEqual({ ok: true, wert: null });
  });

  it("vom selben Absender, der eben selbst gesperrt wurde", async () => {
    client("203.0.113.73");
    for (let i = 0; i < 6; i++) await manuell("000-000");
    expect(await manuell("482137")).toMatch(/Zu viele Fehlversuche/);
    expect(await manuell(LANG)).toBe("ok");
  });

  it("ein falscher langer Code geht an die Datenbank, bleibt aber ein Fehlversuch", async () => {
    await vollerDruck();
    client("203.0.113.74");
    expect(await manuell("ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ")).toMatch(/unbekannt/);
    // Der alte Code desselben Geräts bleibt gesperrt — der Rest aus DRK-291.
    expect(await manuell("482137")).toMatch(/Zu viele Fehlversuche/);
  });
});

describe("DRK-291 lagerbuch — abgewiesene Anfragen verlängern keine Sperre", () => {
  it("Anfragen während der modulweiten Sperre schieben ihr Ende nicht hinaus", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
    await verteilterDruck();
    client("203.0.113.40");
    expect(m.schranke.gateGesperrt("cf:203.0.113.40")).toBe(60);

    vi.setSystemTime(new Date("2026-09-21T10:00:30Z"));
    for (let i = 0; i < 10; i++) {
      client(`203.0.113.${41 + i}`);
      expect(await manuell("000-000")).toMatch(/Zu viele Fehlversuche/);
      expect((await qr("000000")).location).toBe("/?grund=zuviele");
    }
    expect(m.schranke.gateGesperrt("cf:203.0.113.40")).toBe(30);

    vi.setSystemTime(new Date("2026-09-21T10:01:01Z"));
    expect(m.schranke.gateGesperrt("cf:203.0.113.40")).toBeNull();
    client("203.0.113.60");
    expect(await manuell("482137")).toBe("ok");
  });

  it("gebuchte Fehlversuche eines schon gesperrten Geräts verlängern dessen Sperre nicht", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
    const anfrage = { merkmal: "geraet:test" };
    for (let i = 0; i < 6; i++) m.schranke.gateFehlversuchBuchen("cf:x", anfrage);
    expect(m.schranke.gateGesperrt("cf:x", anfrage)).toBe(60);
    vi.setSystemTime(new Date("2026-09-21T10:00:40Z"));
    for (let i = 0; i < 20; i++) m.schranke.gateFehlversuchBuchen("cf:x", anfrage);
    expect(m.schranke.gateGesperrt("cf:x", anfrage)).toBe(20);
  });
});
