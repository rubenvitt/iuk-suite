import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookies } from "@/core/auth/cookies";
import { cookiesSicher, lokalHttpFehler, lokalUeberHttp } from "@/core/lokalHttp";
import { moduleUrl } from "@/core/shell/moduleUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lokalUeberHttp / cookiesSicher", () => {
  it("Produktion ohne Schalter: Secure an", () => {
    expect(lokalUeberHttp({ NODE_ENV: "production" })).toBe(false);
    expect(cookiesSicher({ NODE_ENV: "production" })).toBe(true);
  });

  it("Produktion mit SUITE_LOKAL_HTTP=1: Secure aus — der e2e-Lauf gegen einen gebauten Stand", () => {
    expect(lokalUeberHttp({ NODE_ENV: "production", SUITE_LOKAL_HTTP: "1" })).toBe(true);
    expect(cookiesSicher({ NODE_ENV: "production", SUITE_LOKAL_HTTP: "1" })).toBe(false);
  });

  it("nur „1“ schaltet — ein anderer Wert laesst die Produktion, wie sie ist", () => {
    for (const wert of ["true", "0", "ja", ""]) {
      expect(cookiesSicher({ NODE_ENV: "production", SUITE_LOKAL_HTTP: wert }), wert).toBe(true);
    }
  });

  it("next dev und Vitest brauchen den Schalter nicht", () => {
    expect(lokalUeberHttp({ NODE_ENV: "development" })).toBe(true);
    expect(lokalUeberHttp({ NODE_ENV: "test" })).toBe(true);
  });
});

describe("lokalHttpFehler — der Schalter steht nie still in der Produktion", () => {
  it("ungesetzt oder leer: kein Fehler", () => {
    expect(lokalHttpFehler({})).toEqual([]);
    expect(lokalHttpFehler({ SUITE_LOKAL_HTTP: "", AUTH_URL: "https://iuk-ue.de" })).toEqual([]);
  });

  it("neben einer https-AUTH_URL bricht er den Start ab", () => {
    const fehler = lokalHttpFehler({ SUITE_LOKAL_HTTP: "1", AUTH_URL: "https://iuk-ue.de" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("AUTH_URL");
  });

  it("ein anderer Wert als „1“ bricht ab, statt still nichts zu schalten", () => {
    expect(lokalHttpFehler({ SUITE_LOKAL_HTTP: "true" })).toHaveLength(1);
  });

  it("ohne AUTH_URL oder mit http-AUTH_URL ist er zulaessig", () => {
    expect(lokalHttpFehler({ SUITE_LOKAL_HTTP: "1" })).toEqual([]);
    expect(lokalHttpFehler({ SUITE_LOKAL_HTTP: "1", AUTH_URL: "http://localhost:3999" })).toEqual([]);
  });
});

describe("die zwei Aufrufer aus core folgen dem Schalter", () => {
  it("authCookies: Secure aus unter SUITE_LOKAL_HTTP=1, an ohne", () => {
    expect(authCookies({ NODE_ENV: "production", SUITE_LOKAL_HTTP: "1" }).sessionToken?.options?.secure).toBe(false);
    expect(authCookies({ NODE_ENV: "production" }).sessionToken?.options?.secure).toBe(true);
  });

  it("moduleUrl: localtest-Link unter SUITE_LOKAL_HTTP=1, Produktionshost ohne", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORT", "3100");
    expect(moduleUrl("portal")).toBe("https://iuk-ue.de");
    vi.stubEnv("SUITE_LOKAL_HTTP", "1");
    expect(moduleUrl("portal")).toBe("http://portal.localtest.me:3100");
  });
});

/*
 * DIE EIGENTLICHE FALLE STEHT IM QUELLTEXT, NICHT IM VERHALTEN — Vitest sieht sie nicht.
 *
 * `next build` ersetzt den WOERTLICHEN Ausdruck `process.env.NODE_ENV` durch
 * `"production"`, auch im Servercode. Jeder Fall oben liefe mit dem Ausdruck
 * genauso gruen (Vitest baut nichts), und erst die e2e-Suite gegen den gebauten
 * Stand faende es — als Anmeldung, die nicht von `/login` wegkommt.
 */
const WURZEL = join(__dirname, "..");

function ohneKommentare(quelltext: string): string {
  return quelltext.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function quelldateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis).flatMap((name) => {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) return quelldateien(pfad);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [pfad] : [];
  });
}

describe("Quelltext: kein eingebackenes NODE_ENV an Cookie-Secure und Modul-Links", () => {
  it("core/lokalHttp liest NODE_ENV nur ueber den Parameter", () => {
    const code = ohneKommentare(readFileSync(join(WURZEL, "core/lokalHttp.ts"), "utf8"));
    expect(code).not.toContain("process.env.NODE_ENV");
  });

  it("kein `secure:` in src haengt direkt an NODE_ENV — der Weg fuehrt ueber cookiesSicher", () => {
    const treffer = quelldateien(WURZEL).flatMap((datei) =>
      ohneKommentare(readFileSync(datei, "utf8"))
        .split("\n")
        .filter((zeile) => /secure\s*:/.test(zeile) && zeile.includes("NODE_ENV"))
        .map((zeile) => `${datei.slice(WURZEL.length + 1)}: ${zeile.trim()}`),
    );
    expect(treffer).toEqual([]);
  });

  it("moduleUrl fragt den Schalter, nicht NODE_ENV", () => {
    const code = ohneKommentare(readFileSync(join(WURZEL, "core/shell/moduleUrl.ts"), "utf8"));
    expect(code).not.toContain("NODE_ENV");
    expect(code).toContain("lokalUeberHttp()");
  });
});
