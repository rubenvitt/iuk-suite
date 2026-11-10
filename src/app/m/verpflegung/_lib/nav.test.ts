import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { verpflegungNav } from "./nav";

/** IDA-398: die Ortsetiketten haben einen eigenen Eintrag wie im Lagerbuch und in der Gerätewartung. */
describe("Menümarkierung der Verpflegung", () => {
  it("die Etiketten markieren „Ortsetiketten“", () => {
    expect(aktiverEintrag("/etiketten", verpflegungNav({ admin: true }))).toEqual({ schluessel: "etiketten", genau: true });
  });
});
