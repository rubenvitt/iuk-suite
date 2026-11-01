import { describe, expect, it } from "vitest";
import { istLeitung } from "./zugang";

const ENV = { ADMIN_GROUP: "suite-admins" };

describe("Leitung der Gemeinschaft", () => {
  it("nur Modul-Admin oder Suite-Admin", () => {
    expect(istLeitung(["gemeinschaft-admin"], ENV)).toBe(true);
    expect(istLeitung(["suite-admins"], ENV)).toBe(true);
    expect(istLeitung(["helfer-nutzer"], ENV)).toBe(false);
    expect(istLeitung(null, ENV)).toBe(false);
  });

  it("die Admin-Gruppe ist per Umgebung überschreibbar", () => {
    const env = { ...ENV, SUITE_ADMIN_GROUP_GEMEINSCHAFT: "gemeinschaft-leitung" };
    expect(istLeitung(["gemeinschaft-leitung"], env)).toBe(true);
    expect(istLeitung(["gemeinschaft-admin"], env)).toBe(false);
  });
});
