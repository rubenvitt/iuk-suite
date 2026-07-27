import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { authConfig } from "@/core/auth/config";

/**
 * DIE KONFIGURATION IST AB HIER EIN PRUEFGEGENSTAND.
 *
 * Vorher steckte sie im `NextAuth({…})`-Aufruf und war nur ueber einen vollen
 * Auth.js-Aufbau erreichbar. Als Funktion ueber `request` ist sie ein Objekt,
 * das man anschauen und dessen Callbacks man direkt rufen kann.
 */

const jwtCallback = (request: NextRequest | undefined) => {
  const rueckruf = authConfig(request).callbacks?.jwt;
  if (!rueckruf) throw new Error("Die Konfiguration hat keinen jwt-Callback");
  return rueckruf;
};

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
