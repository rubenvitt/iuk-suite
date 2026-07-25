import { describe, it, expect } from "vitest";
import { decideRoute, resolveHost } from "@/core/routing";

describe("decideRoute", () => {
  it("passes through next-auth, health, login, next-internal", () => {
    for (const p of ["/api/auth/session", "/api/health", "/api/health/portal", "/login", "/_next/static/x.js"]) {
      expect(decideRoute({ host: "portal.localtest.me", pathname: p, groups: [] }).action).toBe("next");
    }
  });
  it("lässt /.well-known auch auf auth-pflichtigen Hosts anonym durch", () => {
    // WebFinger wird von fremden Clients ohne Session abgefragt. Liefe es in
    // den Modul-Rewrite, bekämen sie den Login-Redirect statt einer Antwort.
    for (const host of ["portal.localtest.me", "alpha.localtest.me", "iuk-ue.de"]) {
      const d = decideRoute({ host, pathname: "/.well-known/webfinger", groups: null });
      expect(d.action).toBe("next");
    }
  });
  it("rewrites anonymous module without auth", () => {
    const d = decideRoute({ host: "beta.localtest.me", pathname: "/", groups: null });
    expect(d).toEqual({ action: "rewrite", target: "/m/beta", moduleKey: "beta" });
  });
  it("keeps subpaths in rewrite target", () => {
    const d = decideRoute({ host: "beta.localtest.me", pathname: "/foo/bar", groups: null });
    expect(d).toMatchObject({ action: "rewrite", target: "/m/beta/foo/bar" });
  });
  it("redirects to login when auth required and anonymous", () => {
    const d = decideRoute({ host: "alpha.localtest.me", pathname: "/x", groups: null });
    expect(d).toEqual({ action: "login", callbackUrl: "/x" });
  });
  it("forbids when logged in without required group", () => {
    const d = decideRoute({ host: "alpha.localtest.me", pathname: "/", groups: ["other"] });
    expect(d.action).toBe("forbidden");
  });
  it("rewrites when group matches", () => {
    const d = decideRoute({ host: "alpha.localtest.me", pathname: "/", groups: ["alpha-users"] });
    expect(d).toMatchObject({ action: "rewrite", target: "/m/alpha", moduleKey: "alpha" });
  });
  it("unknown host falls back to portal", () => {
    const d = decideRoute({ host: "weird.example.com", pathname: "/", groups: [] });
    expect(d).toMatchObject({ action: "rewrite", target: "/m/portal", moduleKey: "portal" });
  });
});

// Ein bereits interner Pfad darf nicht erneut präfixt werden: proxy.ts rewritet
// decision.target unverändert, und sein Matcher schließt /m/* nicht aus — sonst
// akkumuliert jeder RSC-/Prefetch-Request eine weitere /m/<key>-Ebene.
describe("decideRoute – /m/<key> ist idempotent", () => {
  it("präfixt einen bereits internen Pfad nicht erneut", () => {
    const d = decideRoute({ host: "iuk-ue.de", pathname: "/m/portal", groups: [] });
    expect(d).toEqual({ action: "next" });
  });
  it("präfixt interne Unterpfade nicht erneut", () => {
    const d = decideRoute({ host: "iuk-ue.de", pathname: "/m/portal/settings", groups: [] });
    expect(d).toEqual({ action: "next" });
  });
  it("schickt anonyme Nutzer auf internen Pfaden zum Login", () => {
    const d = decideRoute({ host: "iuk-ue.de", pathname: "/m/portal", groups: null });
    expect(d).toEqual({ action: "login", callbackUrl: "/m/portal" });
  });
  // Host = portal (nicht alpha): so unterscheidet der Test segment-basiertes
  // Gating von host-basiertem — letzteres würde hier fälschlich "next" liefern.
  it("gated interne Pfade nach dem Modul aus dem Segment, nicht nach dem Host", () => {
    const d = decideRoute({ host: "iuk-ue.de", pathname: "/m/alpha", groups: [] });
    expect(d.action).toBe("forbidden");
  });
  it("lässt unbekannte Modul-Segmente durch (404 statt 500 oder Doppel-Präfix)", () => {
    const d = decideRoute({ host: "iuk-ue.de", pathname: "/m/does-not-exist", groups: [] });
    expect(d).toEqual({ action: "next" });
  });
  it("rewritet externe Pfade weiterhin auf das Host-Modul", () => {
    expect(decideRoute({ host: "iuk-ue.de", pathname: "/", groups: [] })).toMatchObject({
      action: "rewrite",
      target: "/m/portal",
      moduleKey: "portal",
    });
    expect(decideRoute({ host: "iuk-ue.de", pathname: "/foo", groups: [] })).toMatchObject({
      action: "rewrite",
      target: "/m/portal/foo",
    });
  });
});

// Der echte Host steht hinter einem Reverse-Proxy — und bei der internen
// Anfrage, mit der Next nach einem `redirect()` in einer Server Action das Ziel
// rendert — nur in `x-forwarded-host`; `host` ist dort `localhost:<port>`.
// Ohne diese Auflösung findet moduleForHost kein Modul, decideRoute fällt auf
// portal zurück, portal verlangt Auth: die anonyme Teilnehmerin landet nach dem
// Absenden im Login statt auf der Danke-Seite.
describe("resolveHost", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("x-forwarded-host gewinnt über host", () => {
    expect(resolveHost(h({ host: "localhost:3100", "x-forwarded-host": "feedback.localtest.me:3100" })))
      .toBe("feedback.localtest.me:3100");
  });

  it("ohne x-forwarded-host gilt host (Regressionssicherung für alle Module)", () => {
    expect(resolveHost(h({ host: "iuk-ue.de" }))).toBe("iuk-ue.de");
  });

  it("bei einer Kommaliste gewinnt der erste Wert (der ursprüngliche Client-Host)", () => {
    expect(resolveHost(h({ host: "localhost:3100", "x-forwarded-host": "a.example, b.example" })))
      .toBe("a.example");
  });

  it("leerer x-forwarded-host fällt auf host zurück, nicht auf \"kein Modul\"", () => {
    expect(resolveHost(h({ host: "iuk-ue.de", "x-forwarded-host": "" }))).toBe("iuk-ue.de");
    expect(resolveHost(h({ host: "iuk-ue.de", "x-forwarded-host": "   " }))).toBe("iuk-ue.de");
  });

  it("ohne beide Header der leere String — das ist der Vertrag, auf den proxy.ts baut", () => {
    // decideRoute("") → moduleForHost findet nichts → Portal-Fallback.
    expect(resolveHost(h({}))).toBe("");
  });
});

describe("resolveHost + decideRoute — die Strecke, die in Produktion brach", () => {
  const decide = (headers: Record<string, string>, pathname: string, groups: string[] | null) =>
    decideRoute({ host: resolveHost(new Headers(headers)), pathname, groups });

  it("löst feedback auf, wenn der echte Host nur in x-forwarded-host steht", () => {
    const d = decide(
      { host: "localhost:3100", "x-forwarded-host": "feedback.localtest.me:3100" },
      "/f/abc/danke",
      null,
    );
    // Der Port im Header wird wie bisher behandelt: moduleForHost schneidet ihn ab.
    expect(d).toMatchObject({ action: "rewrite", target: "/m/feedback/f/abc/danke", moduleKey: "feedback" });
  });

  it("ohne x-forwarded-host bleibt es beim bisherigen Verhalten", () => {
    expect(decide({ host: "iuk-ue.de" }, "/", [])).toMatchObject({
      action: "rewrite",
      target: "/m/portal",
      moduleKey: "portal",
    });
    expect(decide({ host: "beta.localtest.me" }, "/foo", null)).toMatchObject({
      action: "rewrite",
      target: "/m/beta/foo",
    });
  });

  it("ohne jeden Host-Header weiterhin der Portal-Fallback", () => {
    expect(decide({}, "/", [])).toMatchObject({ action: "rewrite", moduleKey: "portal" });
  });
});

// Die Zusicherung, die den Fix unbedenklich macht: ein gefälschter Header
// verschiebt die Modul*auswahl*, nie eine Berechtigung. alpha ist hier das
// richtige Ziel — feedback hat requiresAuth:false, weshalb canAccess() dessen
// requiredGroups nie prüft (Durchsetzung dort im Verwaltungs-Layout).
describe("gefälschter x-forwarded-host verschiebt nur die Modulauswahl, nicht die Berechtigung", () => {
  const decide = (headers: Record<string, string>, pathname: string, groups: string[] | null) =>
    decideRoute({ host: resolveHost(new Headers(headers)), pathname, groups });

  // Positivkontrolle: ohne sie ist der login-Fall unten nicht unterscheidbar —
  // `localhost:3100` fällt auf portal zurück, das anonym ebenfalls login liefert.
  it("verschiebt die Modulauswahl tatsächlich (sonst prüfen die Verbote unten nichts)", () => {
    const d = decide(
      { host: "localhost:3100", "x-forwarded-host": "alpha.localtest.me" },
      "/",
      ["alpha-users"],
    );
    expect(d).toMatchObject({ action: "rewrite", target: "/m/alpha", moduleKey: "alpha" });
  });

  it("anonym auf ein Modul mit requiredGroups → login, kein Zugang", () => {
    const d = decide({ host: "localhost:3100", "x-forwarded-host": "alpha.localtest.me" }, "/x", null);
    expect(d).toEqual({ action: "login", callbackUrl: "/x" });
  });

  it("eingeloggt ohne die verlangte Gruppe → forbidden, kein Zugang", () => {
    const d = decide(
      { host: "localhost:3100", "x-forwarded-host": "alpha.localtest.me" },
      "/",
      ["other"],
    );
    expect(d.action).toBe("forbidden");
  });
});
