import { describe, it, expect } from "vitest";
import { checkModuleHealth } from "@/core/health";

describe("checkModuleHealth", () => {
  it("returns ok for a known module (opens its db)", () => {
    process.env.DATA_DIR = "./.data/health-test";
    const r = checkModuleHealth("portal");
    expect(r).toMatchObject({ status: "ok", module: "portal" });
  });
  it("returns error for an unknown module", () => {
    const r = checkModuleHealth("ghost");
    expect(r.status).toBe("error");
  });
});
