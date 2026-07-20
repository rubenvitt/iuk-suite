import { describe, it, expect } from "vitest";
import { authCookies } from "@/core/auth/cookies";

const DOMAIN = ".iuk-ue.de";
const WITH = authCookies({ AUTH_COOKIE_DOMAIN: DOMAIN });
const WITHOUT = authCookies({});

describe("authCookies", () => {
  // Der eigentliche Befund: ohne Domain auf state/pkce/nonce werden diese
  // Cookies host-only auf der Modul-Domain gesetzt, der Callback landet aber auf
  // AUTH_URL — dort fehlen sie und Auth.js wirft
  // "InvalidCheck: state value could not be parsed".
  it("setzt die Domain auf allen vier Login-Cookies", () => {
    expect(WITH.sessionToken?.options?.domain).toBe(DOMAIN);
    expect(WITH.state?.options?.domain).toBe(DOMAIN);
    expect(WITH.pkceCodeVerifier?.options?.domain).toBe(DOMAIN);
    expect(WITH.nonce?.options?.domain).toBe(DOMAIN);
  });

  // csrfToken traegt in Produktion den __Host-Praefix, und der verbietet ein
  // domain-Attribut. Eine Domain hier wuerde der Browser verwerfen — der Login
  // braeche an anderer Stelle, nur genauso zuverlaessig.
  it("fasst csrfToken nicht an", () => {
    expect(WITH.csrfToken).toBeUndefined();
    expect(WITHOUT.csrfToken).toBeUndefined();
  });

  // Ohne gesetzte Variable muss das Verhalten exakt dem bisherigen entsprechen:
  // host-only. Sonst braeche die lokale Entwicklung samt Dev-Login.
  it("ohne AUTH_COOKIE_DOMAIN traegt kein Cookie eine Domain", () => {
    for (const key of ["sessionToken", "state", "pkceCodeVerifier", "nonce"] as const) {
      expect(WITHOUT[key]?.options?.domain).toBeUndefined();
    }
  });

  it("leerer String zaehlt wie nicht gesetzt", () => {
    const empty = authCookies({ AUTH_COOKIE_DOMAIN: "" });
    expect(empty.sessionToken?.options?.domain).toBeUndefined();
    expect(empty.state?.options?.domain).toBeUndefined();
  });

  it("secure haengt an NODE_ENV — bestehendes Verhalten, nicht am Protokoll", () => {
    const prod = authCookies({ AUTH_COOKIE_DOMAIN: DOMAIN, NODE_ENV: "production" });
    for (const key of ["sessionToken", "state", "pkceCodeVerifier", "nonce"] as const) {
      expect(prod[key]?.options?.secure).toBe(true);
    }
    expect(authCookies({ NODE_ENV: "development" }).state?.options?.secure).toBe(false);
  });

  /**
   * Die vier Cookies muessen dieselben Optionen tragen — genau deshalb gibt es
   * den Helper. Liefen sie auseinander, faende man das erst, wenn ein Login von
   * einer Modul-Domain aus fehlschlaegt, und das ist ein Fall, den keine
   * Testsuite hier lokal herstellt.
   */
  it("alle vier Cookies teilen dieselben Optionen", () => {
    const [first, ...rest] = (["sessionToken", "state", "pkceCodeVerifier", "nonce"] as const).map(
      (k) => WITH[k]?.options,
    );
    for (const other of rest) expect(other).toEqual(first);
  });

  // Auth.js merged tief in seine Defaults und ueberschreibt nur bei
  // !== undefined. httpOnly/path/sameSite/maxAge duerfen deshalb hier NICHT
  // stehen — sonst frieren wir von Auth.js gepflegte Werte ein (etwa die 900 s
  // fuer state/nonce/pkce). Am Set-Cookie eines echten Logins nachgemessen:
  // "Path=/; Expires=...; HttpOnly; SameSite=Lax" trotz fehlender Angabe.
  it("ueberschreibt keine Defaults ausser domain und secure", () => {
    expect(Object.keys(WITH.state?.options ?? {}).sort()).toEqual(["domain", "secure"]);
  });
});
