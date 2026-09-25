import { describe, expect, it } from "vitest";
import {
  canAccess,
  getModule,
  moduleForHost,
  requiredGroupsFor,
  visibleSwitcherModules,
} from "@/core/registry";

describe("Registry-Eintrag einsatzbuch", () => {
  it("ist anonym routbar, trägt die Zugangsgruppe und steht im Umschalter", () => {
    const m = getModule("einsatzbuch");
    expect(m).toMatchObject({
      title: "Einsatzbuch", icon: "BookOutlined", shell: "full", requiresAuth: false,
      requiredGroups: ["einsatzbuch-verwaltung"], adminGroups: [], prodHosts: [],
      showInSwitcher: true, switcherGroupSources: ["access"],
    });
  });
  it("wird über SUITE_HOST_EINSATZBUCH und den Dev-Host gefunden", () => {
    expect(moduleForHost("einsatzbuch.iuk-ue.de", { SUITE_HOST_EINSATZBUCH: "einsatzbuch.iuk-ue.de" })?.key).toBe("einsatzbuch");
    expect(moduleForHost("einsatzbuch.localtest.me", {})?.key).toBe("einsatzbuch");
    expect(canAccess(getModule("einsatzbuch"), null)).toBe(true);
  });
  it("SUITE_ACCESS_GROUP_EINSATZBUCH ersetzt die Vorgabegruppe", () => {
    expect(requiredGroupsFor(getModule("einsatzbuch"), { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toEqual(["eb-leitung"]);
  });
  it("im Umschalter nur mit der Zugangsgruppe — nicht anonym, nicht für den Suite-Admin", () => {
    expect(visibleSwitcherModules(["einsatzbuch-verwaltung"], {}).map((m) => m.key)).toContain("einsatzbuch");
    expect(visibleSwitcherModules(["dashboard-admins"], {}).map((m) => m.key)).not.toContain("einsatzbuch");
    expect(visibleSwitcherModules(null, {}).map((m) => m.key)).toEqual(["qr", "radio"]);
  });
});
