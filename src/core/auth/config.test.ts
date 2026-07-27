import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { auffrischenMock } = vi.hoisted(() => ({ auffrischenMock: vi.fn() }));

/**
 * Die Erneuerung als Spion — und zwar BEOBACHTBAR, nicht nur stillgelegt. Der
 * Test unten prueft nicht, DASS sie gerufen wird, sondern MIT WELCHEM
 * Schreibrecht. Ohne den Mock ginge dieser Test ans echte Netz.
 */
vi.mock("@/core/auth/refresh", () => ({ tokenAuffrischen: auffrischenMock }));

import { authConfig } from "@/core/auth/config";

/**
 * DIE KONFIGURATION IST AB HIER EIN PRUEFGEGENSTAND.
 *
 * Vorher steckte sie im `NextAuth({…})`-Aufruf und war nur ueber einen vollen
 * Auth.js-Aufbau erreichbar. Als Funktion ueber `request` ist sie ein Objekt,
 * das man anschauen und dessen Callbacks man direkt rufen kann.
 */

beforeEach(() => {
  auffrischenMock.mockReset();
  auffrischenMock.mockImplementation(async (token: unknown) => token);
});

const jwtCallback = (request: NextRequest | undefined) => {
  const rueckruf = authConfig(request).callbacks?.jwt;
  if (!rueckruf) throw new Error("Die Konfiguration hat keinen jwt-Callback");
  return rueckruf;
};

// Steht fuer den /api/auth/*-Pfad: der Weiche in `config.ts` genuegt jedes
// Objekt, das kein `undefined` ist (`request !== undefined`). Ein
// Objektliteral mit einem Feld ist strukturell zu weit von NextRequest
// entfernt, TypeScript lehnt den direkten Cast ab — daher `as unknown as`.
const anfrage = { url: "https://iuk-ue.de/api/auth/session" } as unknown as NextRequest;

describe("authConfig — Sitzung", () => {
  it("faehrt die JWT-Strategie", () => {
    expect(authConfig(undefined).session?.strategy).toBe("jwt");
  });
});

describe("authConfig — Gruppen einfrieren (Regression)", () => {
  /**
   * DER BEFUND AUS SPEC §2.1a AN SEINER WURZEL.
   *
   * `profile` liefert Auth.js NUR beim initialen Sign-in — bei jedem weiteren
   * `jwt`-Aufruf ist es `undefined` (belegt: die vier Aufrufstellen in
   * @auth/core/lib/actions/callback/index.js gegen die eine in
   * actions/session.js:28-32, die weder `user` noch `account` noch `profile`
   * uebergibt). Wer den `if (profile)`-Zweig einmal ohne diese Bedingung
   * schreibt, loescht bei jedem Request alle Gruppen.
   */
  it("laesst die Gruppen stehen, wenn kein profile mitkommt", async () => {
    const token = await jwtCallback(undefined)({
      token: { groups: ["da-feedback-admin"], fachgruppen: ["kueche"] },
    } as never);
    expect(token?.groups).toEqual(["da-feedback-admin"]);
    expect(token?.fachgruppen).toEqual(["kueche"]);
  });

  it("uebernimmt Gruppen und Fachgruppen aus dem profile beim Sign-in", async () => {
    const token = await jwtCallback(undefined)({
      token: {},
      profile: { groups: ["fg-kueche"], fachgruppen: ["kueche"] },
      // `expires_at` bewusst WEIT in der Zukunft: mit einem abgelaufenen Wert
      // liefe dieser Test in den Erneuerungspfad und damit ans echte Netz.
      // Kein Test in diesem Projekt fasst das Netz an.
      account: {
        access_token: "at",
        id_token: "it",
        refresh_token: "rt",
        expires_at: 4_000_000_000,
      },
    } as never);
    expect(token?.groups).toEqual(["fg-kueche"]);
    expect(token?.fachgruppen).toEqual(["kueche"]);
    expect(token?.accessToken).toBe("at");
    expect(token?.expiresAt).toBe(4_000_000_000);
  });

  it("uebernimmt die Gruppen des Dev-Logins aus user", async () => {
    const token = await jwtCallback(undefined)({
      token: {},
      user: { groups: ["dev-gruppe"] },
    } as never);
    expect(token?.groups).toEqual(["dev-gruppe"]);
  });

  /**
   * DIE VOLLE ZUSAGE, NICHT NUR DIE ENGERE AUS DEM ZWISCHENSTAND.
   *
   * Bis Task 2 galt nur: ohne `profile` bleiben VORHANDENE Gruppen stehen.
   * Seit der Verdrahtung in Task 3 gilt mehr: bei einem ERFOLGREICHEN Refresh
   * kommen die Gruppen aus dem NEUEN `id_token`, nicht aus dem alten Token.
   * Das ist der Grund, warum die 30-Tage-Sitzung aus Task 4 vertretbar wird.
   * Die Extraktion selbst — echtes base64url-`id_token`, injizierter
   * Transport — deckt `refresh.test.ts:306-358` ab. Hier zaehlt die NAHT:
   * dass `authConfig` das Ergebnis von `tokenAuffrischen` UNVERAENDERT
   * durchreicht, statt die alten Gruppen nachtraeglich wieder darueberzulegen.
   *
   * Die Attrappe wertet dafuer ihr `darfSchreiben`-Argument selbst aus,
   * genau wie das echte `tokenAuffrischen` (refresh.ts:267) — sonst bliebe
   * dieser Test gruen, selbst wenn `config.ts` die Weiche invertiert oder
   * konstant verdrahtete. Und weil ein ERFOLGREICHER Refresh produktiv nur
   * mit Schreibrecht vorkommen kann, laeuft der Test ueber `jwtCallback
   * (anfrage)` — auf dem RSC-Pfad (`request === undefined`) gibt das echte
   * `tokenAuffrischen` das Token immer unveraendert zurueck, eine
   * „erfolgreiche Erneuerung" waere dort ein nicht erreichbarer Zustand.
   */
  it("reicht das Ergebnis von tokenAuffrischen unveraendert durch, statt die alten Gruppen darueberzulegen", async () => {
    auffrischenMock.mockImplementationOnce(
      async (token: Record<string, unknown>, optionen: { darfSchreiben: boolean }) => {
        if (!optionen.darfSchreiben) return token;
        return {
          ...token,
          groups: ["neue-gruppe"],
          fachgruppen: ["neue-fachgruppe"],
          expiresAt: 4_000_000_000,
          error: undefined,
        };
      },
    );
    const token = await jwtCallback(anfrage)({
      token: {
        groups: ["alte-gruppe"],
        fachgruppen: ["alte-fachgruppe"],
        expiresAt: 1_000,
        refreshToken: "rt",
      },
    } as never);
    expect(token?.groups).toEqual(["neue-gruppe"]);
    expect(token?.fachgruppen).toEqual(["neue-fachgruppe"]);
  });
});

describe("authConfig — session-Callback", () => {
  const bauen = (token: Record<string, unknown>) => {
    const rueckruf = authConfig(undefined).callbacks?.session;
    if (!rueckruf) throw new Error("Die Konfiguration hat keinen session-Callback");
    return rueckruf({ session: { user: {} }, token } as never);
  };

  it("reicht Gruppen, Fachgruppen und die Kennung durch", async () => {
    const sitzung = (await bauen({
      groups: ["a"],
      fachgruppen: ["b"],
      sub: "u-1",
    })) as { user: Record<string, unknown> };
    expect(sitzung.user.groups).toEqual(["a"]);
    expect(sitzung.user.fachgruppen).toEqual(["b"]);
    expect(sitzung.user.id).toBe("u-1");
  });

  it("reicht den Fehler an den Client durch — daran haengt der SessionGuard", async () => {
    const sitzung = (await bauen({ error: "RefreshTokenError" })) as { error?: string };
    expect(sitzung.error).toBe("RefreshTokenError");
  });

  it("setzt isAdmin nicht ohne die Suite-Admin-Gruppe", async () => {
    const sitzung = (await bauen({ groups: ["irgendwas"] })) as { user: { isAdmin: boolean } };
    expect(sitzung.user.isAdmin).toBe(false);
  });
});

describe("authConfig — Querschnitt", () => {
  it("haelt die Login-Seite und die Cookie-Konfiguration fest", () => {
    const konfig = authConfig(undefined);
    expect(konfig.pages?.signIn).toBe("/login");
    // Die fuenf Login-Cookies kommen aus authCookies() — geprueft in cookies.test.ts.
    expect(Object.keys(konfig.cookies ?? {}).sort()).toEqual([
      "callbackUrl",
      "nonce",
      "pkceCodeVerifier",
      "sessionToken",
      "state",
    ]);
  });

  it("laesst ein Ziel auf der Modul-Domain durch, ein fremdes nicht", () => {
    const rueckruf = authConfig(undefined).callbacks?.redirect;
    if (!rueckruf) throw new Error("Die Konfiguration hat keinen redirect-Callback");
    const basis = "https://iuk-ue.de";
    expect(rueckruf({ url: "/x", baseUrl: basis } as never)).toBe("https://iuk-ue.de/x");
    expect(rueckruf({ url: "https://boese.example/x", baseUrl: basis } as never)).toBe(basis);
  });
});

describe("authConfig — Schreibrecht-Weiche", () => {
  const abgelaufen = { expiresAt: 1_000, refreshToken: "rt", groups: ["a"] };

  /**
   * DER TEUERSTE DEFEKT DIESES TEILPROJEKTS, IN EINER ZUSICHERUNG.
   *
   * `auth()` in einer Server Component bekommt `config(undefined)`, und
   * next-auth wirft dort das `Set-Cookie` weg (lib/index.js:91). Wuerde hier
   * aufgefrischt, rotierte Pocket ID das Refresh-Token, das neue ginge
   * verloren, und der naechste Versuch waere eine Wiederverwendung — die
   * widerruft bei Pocket ID die GANZE Sitzung. Der Nutzer flöge dann jede
   * Stunde raus, und es saehe aus wie ein Sitzungsproblem.
   */
  it("meldet dem RSC-Pfad KEIN Schreibrecht", async () => {
    await jwtCallback(undefined)({ token: { ...abgelaufen } } as never);
    expect(auffrischenMock).toHaveBeenCalledTimes(1);
    expect(auffrischenMock.mock.calls[0][1]).toMatchObject({ darfSchreiben: false });
  });

  it("meldet dem /api/auth/*-Pfad Schreibrecht", async () => {
    await jwtCallback(anfrage)({ token: { ...abgelaufen } } as never);
    expect(auffrischenMock).toHaveBeenCalledTimes(1);
    expect(auffrischenMock.mock.calls[0][1]).toMatchObject({ darfSchreiben: true });
  });

  /**
   * Die Ablaufpruefung gehoert AUSSCHLIESSLICH nach refresh.ts. Bliebe sie
   * zusaetzlich hier stehen, gaebe es zwei Wahrheiten ueber „ist abgelaufen"
   * — und die eine wuerde eines Tages angepasst und die andere nicht.
   */
  it("uebergibt die Entscheidung ueber den Ablauf an refresh.ts", async () => {
    await jwtCallback(undefined)({
      token: { expiresAt: Math.floor(Date.now() / 1000) + 3600 },
    } as never);
    expect(auffrischenMock).toHaveBeenCalledTimes(1);
  });
});
