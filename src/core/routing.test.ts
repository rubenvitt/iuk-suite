import { describe, it, expect } from "vitest";
import { decideRoute } from "@/core/routing";

describe("decideRoute", () => {
  it("passes through next-auth, health, login, next-internal", () => {
    for (const p of ["/api/auth/session", "/api/health", "/api/health/portal", "/login", "/_next/static/x.js"]) {
      expect(decideRoute({ host: "portal.localtest.me", pathname: p, groups: [] }).action).toBe("next");
    }
  });
  it("rewrites anonymous module without auth", () => {
    const d = decideRoute({ host: "beta.localtest.me", pathname: "/", groups: null });
    expect(d).toEqual({ action: "rewrite", target: "/_m/beta", moduleKey: "beta" });
  });
  it("keeps subpaths in rewrite target", () => {
    const d = decideRoute({ host: "beta.localtest.me", pathname: "/foo/bar", groups: null });
    expect(d).toMatchObject({ action: "rewrite", target: "/_m/beta/foo/bar" });
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
    expect(d).toMatchObject({ action: "rewrite", target: "/_m/alpha", moduleKey: "alpha" });
  });
  it("unknown host falls back to portal", () => {
    const d = decideRoute({ host: "weird.example.com", pathname: "/", groups: [] });
    expect(d).toMatchObject({ action: "rewrite", target: "/_m/portal", moduleKey: "portal" });
  });
});
