import { describe, it, expect, afterEach, vi } from "vitest";
import { devLoginEnabled } from "@/core/auth/devLogin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devLoginEnabled", () => {
  it.each([undefined, "development", "test", "staging", "production"])(
    "is OFF by default when NODE_ENV is %s",
    (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("AUTH_DEV_LOGIN", undefined);
      expect(devLoginEnabled()).toBe(false);
    },
  );

  it("is OFF when AUTH_DEV_LOGIN=false", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEV_LOGIN", "false");
    expect(devLoginEnabled()).toBe(false);
  });

  it("is OFF for non-exact values", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEV_LOGIN", "TRUE");
    expect(devLoginEnabled()).toBe(false);
  });

  it("is ON only when AUTH_DEV_LOGIN=true", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    expect(devLoginEnabled()).toBe(true);
  });
});
