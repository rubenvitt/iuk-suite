import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hiorgVerbindung } from "../../_db/schema";
import { testDb } from "../testDb";
import { anmeldeAdresse, holePersonal, neuerVorgang, tauscheCode, type Abruf } from "./api";
import type { HiorgKonfiguration } from "./konfiguration";
import { hiorgKonfiguration } from "./konfiguration";
import beispiel from "./spezifikationsbeispiel.json";
import { entschluessele, schluesselAusUmgebung, verschluessele } from "./tresor";
import { accessToken, legeVorgangAn, loeseVorgangEin, merkeAccessToken, speichereVerbindung, verbindungsstand } from "./verbindung";

const SCHLUESSEL = Buffer.alloc(32, 7).toString("base64");
const K: HiorgKonfiguration = {
  clientId: "iuk-suite", clientSecret: "geheim", organisation: "uelz", basis: "https://hiorg.test", callbackUrl: "https://helfer.example/hiorg/callback",
};

/** Ein Fake-HiOrg: beantwortet Token- und Personalanfragen und merkt sich jede Anfrage. */
function fakeHiorg(antworten: Record<string, (init?: RequestInit) => Response>) {
  const anfragen: { url: string; init?: RequestInit }[] = [];
  const abruf = (async (eingabe: string | URL | Request, init?: RequestInit) => {
    const url = String(eingabe);
    anfragen.push({ url, init });
    const treffer = Object.keys(antworten).find((pfad) => url.startsWith(pfad));
    if (!treffer) return new Response("nicht gefunden", { status: 404 });
    return antworten[treffer](init);
  }) as Abruf;
  return { abruf, anfragen };
}
const json = (wert: unknown, status = 200) => new Response(JSON.stringify(wert), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("HELFER_SCHLUESSEL", SCHLUESSEL);
  merkeAccessToken("", 0, 0);
});
afterEach(() => vi.unstubAllEnvs());

describe("tresor", () => {
  it("verschlüsselt mit Zufalls-IV und liest nur mit demselben Schlüssel", () => {
    const s = Buffer.from(SCHLUESSEL, "base64");
    const a = verschluessele("refresh-123", s);
    expect(a).not.toContain("refresh-123");
    expect(a).not.toBe(verschluessele("refresh-123", s));
    expect(entschluessele(a, s)).toBe("refresh-123");
    expect(entschluessele(a, Buffer.alloc(32, 8))).toBeNull();
    expect(entschluessele("kaputt", s)).toBeNull();
  });
  it("verlangt genau 32 Byte Base64", () => {
    expect(schluesselAusUmgebung({}).status).toBe("fehlt");
    expect(schluesselAusUmgebung({ HELFER_SCHLUESSEL: "kurz" }).status).toBe("ungueltig");
    expect(schluesselAusUmgebung({ HELFER_SCHLUESSEL: SCHLUESSEL }).status).toBe("ok");
  });
});

describe("konfiguration", () => {
  it("nennt, was fehlt — nie das Secret selbst", () => {
    const k = hiorgKonfiguration({ HELFER_HIORG_CLIENT_ID: "x", NODE_ENV: "test" });
    expect(k.ok).toBe(false);
    expect(!k.ok && k.fehlt.join(" ")).toMatch(/HELFER_HIORG_CLIENT_SECRET/);
    expect(!k.ok && k.fehlt.join(" ")).toMatch(/HELFER_SCHLUESSEL/);
  });
});

describe("Anmeldung bei HiOrg", () => {
  it("die Anmeldeadresse trägt state, PKCE (S256), Scope und Organisation, nie das Secret", () => {
    const v = neuerVorgang();
    const url = new URL(anmeldeAdresse(K, v.state, v.challenge));
    expect(url.origin + url.pathname).toBe("https://hiorg.test/oauth/v1/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code", client_id: "iuk-suite", redirect_uri: K.callbackUrl, scope: "openid personal:read",
      state: v.state, code_challenge: v.challenge, code_challenge_method: "S256", ov: "uelz",
    });
    expect(url.toString()).not.toContain("geheim");
  });

  it("der Code-Tausch schickt den Verifier und das Secret im Körper (client_secret_post)", async () => {
    const h = fakeHiorg({ "https://hiorg.test/oauth/v1/token": () => json({ access_token: "at", refresh_token: "rt", expires_in: 600 }) });
    const t = await tauscheCode(K, h.abruf, "code-1", "verifier-1");
    expect(t).toEqual({ accessToken: "at", refreshToken: "rt", laeuftAbIn: 600 });
    const koerper = new URLSearchParams(String(h.anfragen[0].init?.body));
    expect(Object.fromEntries(koerper)).toMatchObject({ grant_type: "authorization_code", code: "code-1", code_verifier: "verifier-1", client_secret: "geheim" });
  });

  it("ein Vorgang gilt einmal, nur für dieselbe Person und nur zehn Minuten", () => {
    const db = testDb();
    const jetzt = new Date("2026-10-20T10:00:00Z");
    legeVorgangAn(db, { state: "s1", verifier: "v1", sub: "anna" }, jetzt);
    expect(loeseVorgangEin(db, "s1", "bert", jetzt)).toBeNull();
    expect(loeseVorgangEin(db, "s1", "anna", jetzt)).toBe("v1");
    expect(loeseVorgangEin(db, "s1", "anna", jetzt)).toBeNull();
    legeVorgangAn(db, { state: "s2", verifier: "v2", sub: "anna" }, jetzt);
    expect(loeseVorgangEin(db, "s2", "anna", new Date(jetzt.getTime() + 11 * 60_000))).toBeNull();
  });
});

describe("accessToken", () => {
  function verbunden() {
    const db = testDb();
    speichereVerbindung(db, { kontoName: "Ruth Muster", verbundenVon: "Ruth", verbundenVonSub: "ruth", refreshToken: "rt-1" });
    return db;
  }

  it("speichert nur das verschlüsselte Refresh-Token und übernimmt ein rotiertes", async () => {
    const db = verbunden();
    expect(db.select().from(hiorgVerbindung).get()?.refreshToken).not.toContain("rt-1");
    const h = fakeHiorg({ "https://hiorg.test/oauth/v1/token": () => json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 600 }) });
    expect(await accessToken(db, K, h.abruf, 1_000)).toBe("at-2");
    expect(Object.fromEntries(new URLSearchParams(String(h.anfragen[0].init?.body)))).toMatchObject({ grant_type: "refresh_token", refresh_token: "rt-1" });
    const gespeichert = db.select().from(hiorgVerbindung).get()!.refreshToken;
    expect(entschluessele(gespeichert, Buffer.from(SCHLUESSEL, "base64"))).toBe("rt-2");
    // Bis kurz vor Ablauf aus dem Speicher, ohne neue Anfrage.
    expect(await accessToken(db, K, h.abruf, 2_000)).toBe("at-2");
    expect(h.anfragen).toHaveLength(1);
  });

  it("zwei gleichzeitige Abgleiche erneuern nur einmal", async () => {
    const db = verbunden();
    const h = fakeHiorg({ "https://hiorg.test/oauth/v1/token": () => json({ access_token: "at", refresh_token: "rt-neu", expires_in: 600 }) });
    expect(await Promise.all([accessToken(db, K, h.abruf, 1), accessToken(db, K, h.abruf, 1)])).toEqual(["at", "at"]);
    expect(h.anfragen).toHaveLength(1);
  });

  it("weist HiOrg das Token zurück, ist die Verbindung gelöscht", async () => {
    const db = verbunden();
    const h = fakeHiorg({ "https://hiorg.test/oauth/v1/token": () => json({ error: "invalid_grant" }, 400) });
    await expect(accessToken(db, K, h.abruf, 1)).rejects.toThrow(/neu verbinden/);
    expect(verbindungsstand(db)).toBeNull();
  });

  it("ein Netzfehler lässt die Verbindung stehen", async () => {
    const db = verbunden();
    const abruf = (async () => { throw new TypeError("fetch failed"); }) as Abruf;
    await expect(accessToken(db, K, abruf, 1)).rejects.toThrow(/nicht erreichbar/);
    expect(verbindungsstand(db)).not.toBeNull();
  });
});

describe("holePersonal", () => {
  it("fragt mit filter[status] und Bearer-Token und folgt links.next auf demselben Host", async () => {
    const seite2 = "https://hiorg.test/core/v1/personal?page=2";
    const h = fakeHiorg({
      [seite2]: () => json({ data: beispiel.data, links: { next: "https://boese.example/klau" } }),
      "https://hiorg.test/core/v1/personal": () => json({ data: beispiel.data, links: { next: seite2 } }),
    });
    const r = await holePersonal(K, h.abruf, "at", "aktiv");
    expect(r.personen).toHaveLength(2);
    expect(h.anfragen.map((a) => a.url)).toEqual(["https://hiorg.test/core/v1/personal?filter%5Bstatus%5D=aktiv", seite2]);
    expect(new Headers(h.anfragen[0].init?.headers).get("authorization")).toBe("Bearer at");
  });

  it("übersetzt 403 in einen Satz über das Leserecht", async () => {
    const h = fakeHiorg({ "https://hiorg.test/core/v1/personal": () => json({ errors: [] }, 403) });
    await expect(holePersonal(K, h.abruf, "at", "aktiv")).rejects.toThrow(/Personal-Leserecht/);
  });
});
