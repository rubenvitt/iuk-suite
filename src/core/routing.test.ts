import { describe, it, expect } from "vitest";
import { decideRoute } from "@/core/routing";

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
