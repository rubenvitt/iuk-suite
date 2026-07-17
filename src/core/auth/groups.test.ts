import { describe, it, expect } from "vitest";
import { parseGroups, parseDevGroups } from "@/core/auth/groups";

describe("parseGroups", () => {
  it("reads the configured claim as string[]", () => {
    expect(parseGroups({ groups: ["a", "b"] })).toEqual(["a", "b"]);
    expect(parseGroups({ roles: ["x"] }, "roles")).toEqual(["x"]);
  });
  it("returns [] when missing or not an array", () => {
    expect(parseGroups({})).toEqual([]);
    expect(parseGroups({ groups: "nope" })).toEqual([]);
  });
});

describe("parseDevGroups", () => {
  it("splits a comma string, trims, drops empties", () => {
    expect(parseDevGroups("alpha-users, dashboard-admins ,")).toEqual(["alpha-users", "dashboard-admins"]);
  });
  it("handles undefined", () => {
    expect(parseDevGroups(undefined)).toEqual([]);
  });
});
