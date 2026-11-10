import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { GEMEINSCHAFT_NAV } from "./nav";
import { vorhabenPfad } from "./vorhabenTypen";

/** IDA-398: die Seite eines Events oder Projekts markierte nichts, solange sie unter `/v/<id>` lag. */
describe("Menümarkierung der Gemeinschaft", () => {
  it.each([
    [vorhabenPfad("event", "abc"), "events"],
    [vorhabenPfad("projekt", "abc"), "projekte"],
    ["/m/gemeinschaft/events/abc", "events"],
  ])("%s → %s", (pfad, schluessel) => {
    expect(aktiverEintrag(pfad, GEMEINSCHAFT_NAV)).toEqual({ schluessel, genau: false });
  });
});
