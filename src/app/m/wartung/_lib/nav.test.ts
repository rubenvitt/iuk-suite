import { describe, expect, it } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { wartungNav } from "./nav";

const VERWALTER = wartungNav({ admin: true, gruppen: ["g"] });

/** IDA-381: in der Akte stand die Markierung auf „Übersicht“ (Wurzel-Fallback), der Telefonkopf ebenso. */
describe("Menümarkierung der Gerätewartung", () => {
  it.each([
    ["/", "uebersicht", true],
    ["/geraete", "geraete", true],
    ["/geraete/abc123", "geraete", false],
    ["/m/wartung/geraete/abc123", "geraete", false],
    ["/maengel", "maengel", true],
    ["/etiketten/kisten", "etiketten", false],
    ["/pruefarten", "pruefarten", true],
  ])("%s → %s", (pfad, schluessel, genau) => {
    expect(aktiverEintrag(pfad, VERWALTER)).toEqual({ schluessel, genau });
  });

  it("die Übersicht gilt nur exakt, ihre Nachbarn auch darunter", () => {
    expect(VERWALTER.find((e) => e.href === "/")?.unterseiten).toBeUndefined();
    expect(VERWALTER.filter((e) => e.href !== "/").every((e) => e.unterseiten)).toBe(true);
  });

  it("wer nur prüft, hat „Geräte“ auch in der Akte markiert", () => {
    expect(aktiverEintrag("/geraete/abc123", wartungNav({ admin: false, gruppen: [] }))?.schluessel).toBe("geraete");
  });
});
