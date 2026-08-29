import { describe, it, expect } from "vitest";
import { getModule, moduleForHost, canAccess } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";

describe("Registry-Eintrag uav", () => {
  /*
   * ⚠️ `shell: "minimal"` STEHT WEITERHIN IM REGISTRY, WIRD IM MODUL ABER
   * NIRGENDS MEHR GELESEN. Der Teilnehmer-Zweig läuft seit der
   * Betreiberentscheidung vom 2026-08-29 ganz ohne `<Shell>` in einem eigenen
   * Rahmen (`_ui/teilnehmer/TeilnehmerRahmen.tsx`), die Verwaltung setzt
   * `variant="full"` ausdrücklich (`(admin)/layout.tsx`). Der Wert bleibt
   * stehen, weil `ShellVariant` ein Pflichtfeld des Registry-Eintrags ist —
   * wer ihn ändert, ändert damit heute NICHTS am Bild, und genau das soll
   * hier stehen, bevor jemand daraus auf eine Hülle schließt, die es nicht
   * mehr gibt.
   */
  it("ist ein anonymes Modul mit der Admin-Gruppe uav-training-admin", () => {
    const m = getModule("uav");
    expect(m.shell).toBe("minimal");
    expect(m.requiresAuth).toBe(false);
    expect(m.requiredGroups).toEqual([]);
    expect(m.adminGroups).toEqual(["uav-training-admin"]);
    expect(m.showInSwitcher).toBe(true);
    expect(m.switcherGroupSources).toEqual(["admin"]);
  });
  it("wird über SUITE_HOST_UAV gefunden und ist anonym begehbar", () => {
    const m = moduleForHost("uav-training.iuk-ue.de", { SUITE_HOST_UAV: "uav-training.iuk-ue.de" });
    expect(m?.key).toBe("uav");
    expect(canAccess(getModule("uav"), null)).toBe(true);
  });
  it("Admin nur mit Gruppe — und SUITE_ADMIN_GROUP_UAV gewinnt", () => {
    const m = getModule("uav");
    expect(isModuleAdmin(m, ["uav-training-admin"], {})).toBe(true);
    expect(isModuleAdmin(m, ["irgendwas"], {})).toBe(false);
    expect(isModuleAdmin(m, ["andere"], { SUITE_ADMIN_GROUP_UAV: "andere" })).toBe(true);
  });
});
