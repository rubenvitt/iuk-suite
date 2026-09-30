import { describe, expect, it } from "vitest";
import { ICONS } from "@/core/shell/icons";
import { canAccess, getModule, moduleForHost, requiredGroupsFor, visibleSwitcherModules } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";

describe("Registry-Eintrag kommplan", () => {
  it("anonym routbar (Token-Ansicht in Phase 5), mit Zugangs- und Admin-Gruppe", () => {
    expect(getModule("kommplan")).toMatchObject({
      title: "Kommunikationspläne", icon: "ApartmentOutlined", shell: "full", requiresAuth: false,
      requiredGroups: ["iuk-kommplan"], adminGroups: ["iuk-kommplan-bearbeiten"], prodHosts: [],
      showInSwitcher: true, switcherGroupSources: ["access", "admin"],
    });
    expect(ICONS.ApartmentOutlined).toBeDefined();
  });
  it("Dev-Host und SUITE_HOST_KOMMPLAN", () => {
    expect(moduleForHost("kommplan.localtest.me", {})?.key).toBe("kommplan");
    expect(moduleForHost("plaene.iuk-ue.de", { SUITE_HOST_KOMMPLAN: "plaene.iuk-ue.de" })?.key).toBe("kommplan");
    expect(canAccess(getModule("kommplan"), null)).toBe(true);
  });
  it("Gruppen per Umgebung überschreibbar", () => {
    expect(requiredGroupsFor(getModule("kommplan"), { SUITE_ACCESS_GROUP_KOMMPLAN: "plaene" })).toEqual(["plaene"]);
    expect(adminGroupsFor(getModule("kommplan"), { SUITE_ADMIN_GROUP_KOMMPLAN: "plaene-admin" })).toEqual(["plaene-admin"]);
  });
  it("im Umschalter nur für Zugangs- oder Admin-Gruppe", () => {
    const keys = (g: string[] | null) => visibleSwitcherModules(g, {}).map((m) => m.key);
    expect(keys(null)).not.toContain("kommplan");
    expect(keys(["andere"])).not.toContain("kommplan");
    expect(keys(["iuk-kommplan"])).toContain("kommplan");
    expect(keys(["iuk-kommplan-bearbeiten"])).toContain("kommplan");
  });
});
