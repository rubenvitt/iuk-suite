import { describe, expect, it } from "vitest";
import { darfPlanungLoeschen, hatSchichtplanZugang } from "./zugang";

const ENV = { ADMIN_GROUP: "suite-admins" };

describe("Zugang zur Schichtplanung", () => {
  it("über die Nutzer- oder die Admin-Gruppe, nicht über den Suite-Admin allein", () => {
    expect(hatSchichtplanZugang(["schichtplan-nutzer"], ENV)).toBe(true);
    expect(hatSchichtplanZugang(["schichtplan-admin"], ENV)).toBe(true);
    expect(hatSchichtplanZugang(["suite-admins"], ENV)).toBe(false);
    expect(hatSchichtplanZugang(["helfer-nutzer"], ENV)).toBe(false);
    expect(hatSchichtplanZugang(null, ENV)).toBe(false);
  });

  it("löschen braucht Zugang UND Modul-Admin (oder Suite-Admin)", () => {
    expect(darfPlanungLoeschen(["schichtplan-admin"], ENV)).toBe(true);
    expect(darfPlanungLoeschen(["schichtplan-nutzer", "suite-admins"], ENV)).toBe(true);
    expect(darfPlanungLoeschen(["schichtplan-nutzer"], ENV)).toBe(false);
    expect(darfPlanungLoeschen(["suite-admins"], ENV)).toBe(false);
  });

  it("die Gruppen sind per Umgebung überschreibbar", () => {
    const env = { ...ENV, SUITE_ACCESS_GROUP_SCHICHTPLAN: "planer", SUITE_ADMIN_GROUP_SCHICHTPLAN: "planleitung" };
    expect(hatSchichtplanZugang(["planer"], env)).toBe(true);
    expect(hatSchichtplanZugang(["schichtplan-nutzer"], env)).toBe(false);
    expect(darfPlanungLoeschen(["planer", "planleitung"], env)).toBe(true);
    expect(darfPlanungLoeschen(["planer"], env)).toBe(false);
  });
});
