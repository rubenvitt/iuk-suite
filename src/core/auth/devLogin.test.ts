import { describe, it, expect, afterEach, vi } from "vitest";
import { devLoginEnabled } from "@/core/auth/devLogin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devLoginEnabled", () => {
  it("is OFF in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_LOGIN", undefined);
    expect(devLoginEnabled()).toBe(false);
  });

  it("is ON in development by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEV_LOGIN", undefined);
    expect(devLoginEnabled()).toBe(true);
  });

  it("AUTH_DEV_LOGIN=true forces ON even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    expect(devLoginEnabled()).toBe(true);
  });

  it("AUTH_DEV_LOGIN=false forces OFF even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEV_LOGIN", "false");
    expect(devLoginEnabled()).toBe(false);
  });
});
