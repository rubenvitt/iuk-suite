import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";

/**
 * DRK-284 — DIE KETTE OHNE ATTRAPPE DAZWISCHEN.
 *
 * `config.test.ts` prueft den `jwt`-Callback gegen ein nachgebautes
 * `tokenAuffrischen`. Das beweist die Weiche, aber nicht, dass das ECHTE
 * `tokenAuffrischen` einen `invalid_grant` in genau die Form bringt, die der
 * Callback verwirft — geraten beide auseinander, waeren beide Dateien gruen und
 * die Luecke wieder offen. Hier laufen deshalb `authConfig`, `tokenAuffrischen`
 * und Auth.js' eigene Sitzungsaktion zusammen; nur das Netz (`fetch`) und der
 * Widerrufsspeicher (SQLite) sind ersetzt.
 */

vi.mock("@/core/konto/widerruf", () => ({ istWiderrufen: () => false }));
// Das Audit schreibt in eine Datenbank; fuer diese Kette ist es Beiwerk.
vi.mock("@/core/audit/server", () => ({ auditEvent: () => {}, auditActor: () => ({}) }));

import { handlers } from "@/core/auth";
import { isModuleAdmin } from "@/core/groups";
import { getModule } from "@/core/registry";

const ISSUER = "https://id.example.test";
const SECRET = "endgueltig-test-secret";
const COOKIE = "authjs.session-token";

type Antwort = { status: number; koerper: unknown };

/** Pocket ID als Attrappe: Entdeckung immer gut, Token-Endpoint wie vorgegeben. */
function idp(token: Antwort) {
  const aufrufe: string[] = [];
  const fetchAttrappe = vi.fn(async (url: string) => {
    aufrufe.push(url);
    const antwort: Antwort = url.endsWith("/.well-known/openid-configuration")
      ? { status: 200, koerper: { token_endpoint: `${ISSUER}/api/oidc/token` } }
      : token;
    return new Response(JSON.stringify(antwort.koerper), {
      status: antwort.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchAttrappe);
  return aufrufe;
}

/** Ein Suite-Cookie, wie es ein frueherer Stand geschrieben hat: Admin-Gruppen, Access-Token abgelaufen. */
let laufnummer = 0;
async function altesCookie(extra: Record<string, unknown> = {}) {
  laufnummer += 1;
  return encode({
    secret: SECRET,
    salt: COOKIE,
    token: {
      sub: "pocket-sub-1",
      name: "Frueher Berechtigt",
      angemeldetSeit: Math.floor(Date.now() / 1000) - 3_600,
      groups: ["uav-training-admin"],
      fachgruppen: [],
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      // Je Test ein eigenes Refresh-Token: das Rotationsgedaechtnis in
      // `refresh.ts` ist prozessweit und haelt ein Ergebnis 60 Sekunden nach.
      refreshToken: `rt-${laufnummer}`,
      ...extra,
    },
  });
}

/** `GET /api/auth/session` durch den echten Route Handler der Suite — `authConfig(req)` samt Auth.js' Sitzungsaktion. */
async function sitzungAbrufen(cookie: string) {
  const url = "http://localhost:3000/api/auth/session";
  const anfrage = new NextRequest(url, { headers: { cookie: `${COOKIE}=${cookie}` } });
  const antwort = await handlers.GET(anfrage);
  const koerper = (await antwort.json()) as { user?: { groups?: string[] }; error?: string } | null;
  return { koerper, setCookie: antwort.headers.getSetCookie() };
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("POCKET_ID_ISSUER", ISSUER);
  vi.stubEnv("POCKET_ID_CLIENT_ID", "suite");
  vi.stubEnv("POCKET_ID_CLIENT_SECRET", "geheim");
  vi.stubEnv("AUTH_DEV_LOGIN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("endgueltiger Refresh-Fehler — echte Kette", () => {
  it("invalid_grant: keine Sitzung, keine Gruppen, und das Cookie wird geloescht", async () => {
    idp({ status: 400, koerper: { error: "invalid_grant" } });
    const { koerper, setCookie } = await sitzungAbrufen(await altesCookie());

    expect(koerper).toBeNull();
    // Der Guard der Ticketprobe (`requireUavAdmin`) sieht damit nichts mehr.
    expect(isModuleAdmin(getModule("uav"), koerper?.user?.groups ?? null)).toBe(false);
    // `sessionStore.clean()`: Ablauf in der Vergangenheit, kein neuer Wert.
    const sitzungsKeks = setCookie.find((k) => k.startsWith(`${COOKIE}=`));
    expect(sitzungsKeks).toBeDefined();
    expect(sitzungsKeks).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it("ein aufbewahrtes Cookie mit altem Fehlervermerk bleibt abgewiesen — ohne neuen Umlauf zu Pocket ID", async () => {
    const aufrufe = idp({ status: 500, koerper: {} });
    const { koerper } = await sitzungAbrufen(await altesCookie({ error: "RefreshTokenError" }));
    expect(koerper).toBeNull();
    expect(aufrufe).toEqual([]);
  });

  it("transient (503): die Sitzung lebt weiter, mit den bisherigen Gruppen", async () => {
    idp({ status: 503, koerper: {} });
    const { koerper } = await sitzungAbrufen(await altesCookie());
    expect(koerper?.user?.groups).toEqual(["uav-training-admin"]);
    expect(koerper?.error).toBeUndefined();
  });

  it("erfolgreicher Refresh: die Gruppen kommen frisch aus dem neuen id_token", async () => {
    const nutzlast = Buffer.from(JSON.stringify({ sub: "pocket-sub-1", groups: ["nur-lesen"] })).toString(
      "base64url",
    );
    idp({
      status: 200,
      koerper: { access_token: "at", refresh_token: "rt-neu", expires_in: 3_600, id_token: `x.${nutzlast}.y` },
    });
    const { koerper } = await sitzungAbrufen(await altesCookie());
    expect(koerper?.user?.groups).toEqual(["nur-lesen"]);
    expect(isModuleAdmin(getModule("uav"), koerper?.user?.groups ?? null)).toBe(false);
  });
});
