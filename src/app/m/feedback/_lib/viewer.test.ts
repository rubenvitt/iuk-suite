import { describe, it, expect } from "vitest";
import { viewerFromSession } from "./viewer";

describe("viewerFromSession", () => {
  it("baut Viewer aus Session", () => {
    expect(viewerFromSession({ user: { id: "u1", groups: ["da-feedback-gl"] } })).toEqual({
      sub: "u1",
      groups: ["da-feedback-gl"],
    });
  });
  it("null ohne User/id", () => {
    expect(viewerFromSession(null)).toBeNull();
    expect(viewerFromSession({ user: {} })).toBeNull();
  });
  it("leere groups wenn nicht gesetzt", () => {
    expect(viewerFromSession({ user: { id: "u1" } })).toEqual({ sub: "u1", groups: [] });
  });
});
