import { describe, it, expect } from "vitest";
import { isFeedbackAdmin, assertGroupAccess, accessibleGroupFilter } from "./access";

const admin = { sub: "a", groups: ["da-feedback-admin"] };
const gl = { sub: "g", groups: ["da-feedback-gl"] };

describe("isFeedbackAdmin", () => {
  it("true für Admin-Gruppe, false sonst/null", () => {
    expect(isFeedbackAdmin(admin)).toBe(true);
    expect(isFeedbackAdmin(gl)).toBe(false);
    expect(isFeedbackAdmin(null)).toBe(false);
  });
});

describe("assertGroupAccess", () => {
  it("Admin darf jede Gruppe", () => {
    expect(() => assertGroupAccess(admin, 42, [])).not.toThrow();
  });
  it("groupleader nur eigene Gruppen", () => {
    expect(() => assertGroupAccess(gl, 7, [7, 9])).not.toThrow();
    expect(() => assertGroupAccess(gl, 3, [7, 9])).toThrow("Forbidden");
  });
  it("null-Viewer immer verboten", () => {
    expect(() => assertGroupAccess(null, 7, [7])).toThrow("Forbidden");
  });
});

describe("accessibleGroupFilter", () => {
  it("Admin → 'all', groupleader → seine IDs", () => {
    expect(accessibleGroupFilter(admin, [])).toBe("all");
    expect(accessibleGroupFilter(gl, [7, 9])).toEqual([7, 9]);
    expect(accessibleGroupFilter(null, [7])).toEqual([]);
  });
});
