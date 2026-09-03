import { describe, it, expect } from "vitest";
import { getModule, moduleForHost, canAccess } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";
import { ICONS } from "@/core/shell/icons";

describe("Registry-Eintrag zeichen", () => {
  /*
   * `requiresAuth: true` UND `requiredGroups: []` — das ist kein Widerspruch, sondern
   * „jeder Eingeloggte darf": `canAccess` steigt bei leerer Gruppenliste mit `true` aus.
   * Anders als bei qr/feedback/files/lagerbuch/radio gibt es hier KEINEN anonymen
   * Teilpfad, deshalb traegt das generische Middleware-Gate den ganzen Zugang und es
   * braucht keine modulinterne Zweitdurchsetzung.
   */
  it("liegt vollstaendig hinter dem Login, ohne eigene Zugangsgruppe", () => {
    const m = getModule("zeichen");
    expect(m.shell).toBe("full");
    expect(m.requiresAuth).toBe(true);
    expect(m.requiredGroups).toEqual([]);
    expect(m.adminGroups).toEqual(["iuk-zeichen-admin"]);
    expect(m.showInSwitcher).toBe(true);
  });

  /*
   * ⛔ `switcherGroupSources` MUSS leer bleiben. Bei `["access"]` und leerem
   * `requiredGroups` ist `hasAnyGroup(g, [])` === `[].some(...)` === `false` — die
   * Kachel im App-Umschalter waere fuer JEDEN unsichtbar, auch fuer den Betreiber.
   */
  it("zeigt die Kachel jedem Eingeloggten", () => {
    expect(getModule("zeichen").switcherGroupSources).toEqual([]);
    expect(canAccess(getModule("zeichen"), { groups: [], isAdmin: false } as never)).toBe(true);
  });

  it("wird ueber SUITE_HOST_ZEICHEN gefunden", () => {
    const m = moduleForHost("zeichen.iuk-ue.de", { SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de" });
    expect(m?.key).toBe("zeichen");
  });

  it("Admin nur mit Gruppe — und SUITE_ADMIN_GROUP_ZEICHEN gewinnt", () => {
    const m = getModule("zeichen");
    expect(isModuleAdmin(m, ["iuk-zeichen-admin"], {})).toBe(true);
    expect(isModuleAdmin(m, ["irgendwas"], {})).toBe(false);
    expect(isModuleAdmin(m, ["andere"], { SUITE_ADMIN_GROUP_ZEICHEN: "andere" })).toBe(true);
  });

  /*
   * Ein Icon-Name, der in ICONS FEHLT, faellt STILL auf AppstoreOutlined zurueck —
   * „Taktische Zeichen" waere dann im Umschalter-Panel UND im Portal-Raster vom
   * „Portal" nicht zu unterscheiden.
   */
  it("hat ein Icon, das die ICONS-Map wirklich kennt", () => {
    expect(getModule("zeichen").icon).toBe("DeploymentUnitOutlined");
    expect("DeploymentUnitOutlined" in ICONS).toBe(true);
  });
});
