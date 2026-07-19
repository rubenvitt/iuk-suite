import { describe, it, expect, afterEach, vi } from "vitest";
import { moduleUrl } from "@/core/shell/moduleUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("moduleUrl", () => {
  it("builds dev localtest.me url with port", () => {
    vi.stubEnv("PORT", "3000");
    expect(moduleUrl("gamma")).toBe("http://gamma.localtest.me:3000");
  });

  it("respects the dev host suffix override", () => {
    vi.stubEnv("PORT", "3000");
    vi.stubEnv("SUITE_DEV_HOST_SUFFIX", "test.internal");
    expect(moduleUrl("gamma")).toBe("http://gamma.test.internal:3000");
  });

  it("uses the registry prod host in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(moduleUrl("portal")).toBe("https://iuk-ue.de");
  });

  // Kein prodHost = die Domain zeigt noch nicht auf die Suite = das Modul ist
  // unter keiner URL erreichbar. Ein localtest.me-Link wäre in Prod tot.
  it("returns null in production for modules without a prod host", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(moduleUrl("gamma")).toBeNull();
  });

  it("returns null for unknown keys instead of throwing", () => {
    expect(moduleUrl("does-not-exist")).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(moduleUrl("does-not-exist")).toBeNull();
  });
});
