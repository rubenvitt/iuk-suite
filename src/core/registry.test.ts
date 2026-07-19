import { describe, it, expect, vi } from "vitest";
import {
  getModule, moduleForHost, canAccess, visibleSwitcherModules, MODULES,
} from "@/core/registry";

describe("registry", () => {
  it("resolves dev host by convention", () => {
    expect(moduleForHost("alpha.localtest.me")?.key).toBe("alpha");
    expect(moduleForHost("alpha.localtest.me:3000")?.key).toBe("alpha");
    expect(moduleForHost("PORTAL.localtest.me")?.key).toBe("portal");
  });
  it("returns null for unknown host", () => {
    expect(moduleForHost("nope.example.com")).toBeNull();
  });
  it("routet einen Host aus SUITE_HOST_<KEY> auf sein Modul", () => {
    vi.stubEnv("SUITE_HOST_BETA", "beta.example.com");
    expect(moduleForHost("beta.example.com")?.key).toBe("beta");
    expect(moduleForHost("BETA.example.com:8080")?.key).toBe("beta");
    vi.unstubAllEnvs();
  });
  it("Env überschreibt den Registry-Fallback vollständig", () => {
    // Nicht additiv: nach dem Umschwenken darf die alte Domain nicht
    // weiterlaufen, sonst hängt ein Modul an zwei Hosts.
    vi.stubEnv("SUITE_HOST_PORTAL", "neu.example.org");
    expect(moduleForHost("neu.example.org")?.key).toBe("portal");
    expect(moduleForHost("iuk-ue.de")).toBeNull();
    vi.unstubAllEnvs();
  });
  it("getModule throws on unknown key", () => {
    expect(() => getModule("ghost")).toThrow();
  });
  it("canAccess: anonymous module open to everyone", () => {
    expect(canAccess(getModule("beta"), null)).toBe(true);
  });
  it("canAccess: auth-required module blocks anonymous", () => {
    expect(canAccess(getModule("alpha"), null)).toBe(false);
  });
  it("canAccess: group-gated module needs overlap", () => {
    expect(canAccess(getModule("alpha"), ["other"])).toBe(false);
    expect(canAccess(getModule("alpha"), ["alpha-users"])).toBe(true);
  });
  it("canAccess: auth-only module (no groups) allows any logged-in user", () => {
    expect(canAccess(getModule("portal"), [])).toBe(true);
    expect(canAccess(getModule("portal"), null)).toBe(false);
  });
  it("visibleSwitcherModules filters by access and showInSwitcher", () => {
    const anon = visibleSwitcherModules(null).map((m) => m.key);
    expect(anon).not.toContain("alpha");
    const withAlpha = visibleSwitcherModules(["alpha-users"]).map((m) => m.key);
    expect(withAlpha).toContain("alpha");
    expect(withAlpha).toContain("portal");
    // kioskdemo is never in the switcher
    expect(withAlpha).not.toContain("kioskdemo");
  });
});

describe("moduleForHost — prod apex", () => {
  it("maps iuk-ue.de to portal", () => {
    expect(moduleForHost("iuk-ue.de")?.key).toBe("portal");
  });
  it("ignores the port when matching the apex host", () => {
    expect(moduleForHost("iuk-ue.de:443")?.key).toBe("portal");
  });
});
