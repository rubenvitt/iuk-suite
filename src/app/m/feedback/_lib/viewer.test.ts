import { describe, it, expect } from "vitest";
import { viewerFromSession } from "./viewer";

describe("viewerFromSession", () => {
  it("baut Viewer aus Session", () => {
    expect(
      viewerFromSession({
        user: { id: "u1", groups: ["da-feedback-gl"], fachgruppen: ["sanitaet"] },
      }),
    ).toEqual({
      sub: "u1",
      groups: ["da-feedback-gl"],
      fachgruppen: ["sanitaet"],
    });
  });
  it("null ohne User/id", () => {
    expect(viewerFromSession(null)).toBeNull();
    expect(viewerFromSession({ user: {} })).toBeNull();
  });
  it("leere groups wenn nicht gesetzt", () => {
    expect(viewerFromSession({ user: { id: "u1" } })).toEqual({
      sub: "u1",
      groups: [],
      fachgruppen: [],
    });
  });
  // Fehlendes Attribut degradiert auf user_groups allein — nie auf "alle Gruppen".
  it("leere fachgruppen wenn das Attribut fehlt", () => {
    expect(viewerFromSession({ user: { id: "u1", groups: ["x"] } })!.fachgruppen).toEqual([]);
  });
});
