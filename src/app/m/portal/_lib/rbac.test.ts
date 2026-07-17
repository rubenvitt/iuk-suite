import { describe, it, expect } from "vitest";
import { canViewService, filterVisibleServices } from "@/app/m/portal/_lib/rbac";

const base = { isPublic: false, isActive: true, requiredGroups: ["g"] };
describe("portal rbac", () => {
  it("inactive is never visible", () => {
    expect(canViewService([], { ...base, isActive: false })).toBe(false);
  });
  it("public is always visible", () => {
    expect(canViewService([], { ...base, isPublic: true })).toBe(true);
  });
  it("private needs group overlap", () => {
    expect(canViewService(["x"], base)).toBe(false);
    expect(canViewService(["g"], base)).toBe(true);
  });
  it("filterVisibleServices keeps only viewable", () => {
    const list = [{ ...base, id: 1 }, { ...base, id: 2, isPublic: true }];
    expect(filterVisibleServices([], list).map((s) => s.id)).toEqual([2]);
  });
});
