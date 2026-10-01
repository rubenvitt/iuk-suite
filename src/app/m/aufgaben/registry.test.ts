import { describe, expect, it } from "vitest";
import { canAccess, findModule, requiredGroupsFor } from "@/core/registry";
import { ICONS8 } from "@/core/ikonen/katalog";

/**
 * `SuiteNav.test.tsx` prueft schon, dass KEIN Modul-Icon fehlt. Dieser Test
 * prueft, dass DIESES Modul so registriert ist, wie das Spec §3 es sagt — der
 * erste wird gruen, sobald irgendein Icon eingetragen ist.
 *
 * Das Icon ist ein Schluessel des Icons8-Katalogs (`core/ikonen/katalog.ts`);
 * `ModuleDef.icon` erzwingt das typseitig, der Test unten haelt es zur
 * Laufzeit fest. Der Katalog ist reine Daten ohne Direktive — in Server-
 * wie Client-Code importierbar.
 */
describe("Registrierung des Moduls aufgaben", () => {
  it("steht in der Registry mit den Werten aus Spec §3", () => {
    const mod = findModule("aufgaben");
    expect(mod).not.toBeNull();
    expect(mod!.title).toBe("Aufgaben");
    expect(mod!.icon).toBe("task");
    expect(mod!.shell).toBe("full");
    expect(mod!.requiresAuth).toBe(true);
    expect(mod!.prodHosts).toEqual([]);
    expect(mod!.switcherGroupSources).toEqual(["access"]);
  });

  /*
   * Ein halbfertiges Modul gehoert nicht in die Navigation aller Nutzer — bis Aufgabe 16. Diese
   * Zeile dreht mit ihr mit: das Modul ist jetzt vollstaendig begehbar (`/a/<id>`, `/archiv` und die
   * rollenabhaengige Modulnavigation stehen), und genau das ist der Moment, den der Test aus
   * Aufgabe 1 sich gemerkt hatte.
   */
  it("ist seit Aufgabe 16 im App-Switcher — das Modul ist vollstaendig begehbar", () => {
    expect(findModule("aufgaben")!.showInSwitcher).toBe(true);
  });

  it("verlangt die Zugangsgruppe iuk-aufgaben-nutzer", () => {
    const mod = findModule("aufgaben")!;
    expect(requiredGroupsFor(mod, {})).toEqual(["iuk-aufgaben-nutzer"]);
    expect(canAccess(mod, [], {})).toBe(false);
    expect(canAccess(mod, null, {})).toBe(false);
    expect(canAccess(mod, ["iuk-aufgaben-nutzer"], {})).toBe(true);
  });

  it("laesst die Zugangsgruppe per Env ueberschreiben", () => {
    const mod = findModule("aufgaben")!;
    const env = { SUITE_ACCESS_GROUP_AUFGABEN: "andere-gruppe" };
    expect(requiredGroupsFor(mod, env)).toEqual(["andere-gruppe"]);
    expect(canAccess(mod, ["iuk-aufgaben-nutzer"], env)).toBe(false);
    expect(canAccess(mod, ["andere-gruppe"], env)).toBe(true);
  });

  it("hat sein Icon im Icons8-Katalog", () => {
    expect(findModule("aufgaben")!.icon in ICONS8).toBe(true);
  });
});
