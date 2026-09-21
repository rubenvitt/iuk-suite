import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerAuditFunctions } from "@/core/audit/context";
import * as schema from "../_db/schema";
import { zugangscodes } from "../_db/schema";

/**
 * DRK-291 — GÜLTIGE CODES NACH VERTEILTEM FEHLERDRUCK, durch alle drei
 * Gate-Flächen, mit der ECHTEN Schranke und der echten Einlösung gegen eine
 * migrierte Datenbank. Gemockt sind nur Nexts Anfragekontext und der DB-Opener
 * (Aufbau der Datenbank wie `_lib/schreibpfade/codeEinloesung.test.ts`).
 *
 * Das Modell für `radio`: eine WOHLGEFORMTE Eingabe ist nie gesperrt — weder
 * durch die modulweiten Zähler noch durch den Absender-Eimer. Der Coderaum
 * (140 bit) trägt die Abwehr; gesperrt wird nur, was gar kein Code sein kann.
 * Der zweite Fall ist der, den A-L12 wahrscheinlich macht: ALLE Clients teilen
 * einen Absenderschlüssel — dann sperrten fünf Fehlversuche eines Klopfers
 * früher den ganzen Funkraum.
 */

const GEHEIMNIS = "radio-test-geheimnis-mindestens-32-zeichen-lang";
const HOST = "radio.localtest.me";
const CODE = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";
// Wohlgeformt, aber nie vergeben — der Fehlversuch eines Angreifers.
const FALSCH = "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ";

const stand = vi.hoisted(() => ({
  kopf: new Headers(),
  gesetzt: new Map<string, string>(),
  db: null as unknown,
}));

vi.mock("next/headers", () => ({
  headers: async () => stand.kopf,
  cookies: async () => ({
    get: () => undefined,
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
};
let m: Module;
const UMGEBUNG = { ...process.env };
let tmp: string;
let sqlite: Database.Database;

beforeEach(async () => {
  process.env = { ...UMGEBUNG, RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIMNIS };
  tmp = mkdtempSync(join(tmpdir(), "radio-gate-zugang-"));
  sqlite = new Database(join(tmp, "radio.db"));
  registerAuditFunctions(sqlite);
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  const db = drizzle(sqlite, { schema });
  await db.insert(zugangscodes).values({
    id: "zc-1", code: CODE, bezeichnung: "Aufsteller Fahrzeughalle",
    aktiv: true, createdAt: new Date(), createdBy: "sub-admin",
  });
  stand.db = db;
  vi.resetModules();   // frische Zähler je Fall
  m = {
    gate: await import("../_actions/gate"),
    sitzung: await import("../_actions/sitzung"),
    route: await import("../t/[code]/route"),
    schranke: await import("./gateSchranke"),
  };
});

afterEach(() => {
  vi.useRealTimers();
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  process.env = { ...UMGEBUNG };
});

/** `ip === null`: kein `cf-connecting-ip` — alle teilen den Schlüssel `unknown`. */
function client(ip: string | null) {
  stand.kopf = new Headers(ip ? { host: HOST, "cf-connecting-ip": ip } : { host: HOST });
  stand.gesetzt = new Map();
}

async function manuell(code: string): Promise<string> {
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

async function qr(code: string): Promise<string> {
  const antw = await m.route.GET(
    new Request(`http://${HOST}/t/${code}`, { headers: Object.fromEntries(stand.kopf) }),
    { params: Promise.resolve({ code }) },
  );
  const ort = antw.headers.get("location") ?? "";
  // Erfolg ist „/" (die Gate-Weiche) MIT Sitzungscookie; ohne Cookie ist „/" keiner.
  return antw.headers.getSetCookie().some((c) => c.startsWith("radio_ausleihe=")) ? `angemeldet:${ort}` : ort;
}

async function verteilterDruck() {
  for (let a = 1; a <= 7; a++) {
    client(`198.51.100.${a}`);
    for (let i = 0; i < 5; i++) await manuell(FALSCH);
  }
}

describe("DRK-291 radio — ein richtiger Code kommt nach verteiltem Druck herein", () => {
  it("die modulweite Sperre ist ausgelöst (Vorbedingung, sonst misst der Fall nichts)", async () => {
    await verteilterDruck();
    expect(m.schranke.gateGesperrt("203.0.113.1")).not.toBeNull();
  });

  it("QR-Einlösung aus einem unabhängigen Client", async () => {
    await verteilterDruck();
    client("203.0.113.1");
    expect(await qr(CODE)).toBe("angemeldet:/");
  });

  it("Handeingabe aus einem unabhängigen Client, auch in abweichender Schreibweise", async () => {
    await verteilterDruck();
    client("203.0.113.2");
    expect(await manuell(CODE.toLowerCase().replaceAll("-", " "))).toBe("ok");
    expect(stand.gesetzt.has("radio_ausleihe")).toBe(true);
  });

  it("Erneuerung aus einem unabhängigen Client", async () => {
    await verteilterDruck();
    client("203.0.113.3");
    expect(await m.sitzung.erneuereSitzung(CODE)).toEqual({ ok: true });
  });

  it("geteilter Absenderschlüssel: fünf Fehlversuche eines Klopfers sperren den Funkraum NICHT", async () => {
    client(null);
    for (let i = 0; i < 6; i++) await manuell(FALSCH);
    expect(m.schranke.gateGesperrt("unknown")).not.toBeNull();
    expect(await manuell(CODE)).toBe("ok");
    expect(await qr(CODE)).toBe("angemeldet:/");
    expect(await m.sitzung.erneuereSitzung(CODE)).toEqual({ ok: true });
  });
});

describe("DRK-291 radio — ungültige Versuche bleiben gebremst", () => {
  it("eine Eingabe, die kein Code sein kann, bleibt während der Sperre gesperrt", async () => {
    await verteilterDruck();
    client("203.0.113.4");
    expect(await manuell("123456")).toMatch(/Zu viele Fehlversuche/);
    expect(await qr("123456")).toBe("/?grund=zuviele");
    expect(await m.sitzung.erneuereSitzung("123456")).toMatchObject({ ok: false });
  });

  it("wohlgeformte Fehlversuche werden weiter gebucht und weiter abgewiesen", async () => {
    await verteilterDruck();
    client("203.0.113.5");
    expect(await manuell(FALSCH)).toMatch(/unbekannt/);
  });
});

describe("DRK-291 radio — abgewiesene Anfragen verlängern keine Sperre", () => {
  it("Anfragen während der Sperre schieben ihr Ende nicht hinaus", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
    await verteilterDruck();
    expect(m.schranke.gateGesperrt("203.0.113.6")).toBe(60);

    vi.setSystemTime(new Date("2026-09-21T10:00:30Z"));
    for (let i = 0; i < 10; i++) {
      client(`203.0.113.${10 + i}`);
      await manuell("123456");
      await manuell(FALSCH);
      await qr("123456");
    }
    expect(m.schranke.gateGesperrt("203.0.113.6")).toBe(30);

    vi.setSystemTime(new Date("2026-09-21T10:01:01Z"));
    expect(m.schranke.gateGesperrt("203.0.113.6")).toBeNull();
  });
});
