import { describe, it, expect } from "vitest";
import { devGroupChoices, vereinigeGruppen } from "@/core/auth/devGroups";
import { MODULES } from "@/core/registry";
import { suiteAdminGroup } from "@/core/groups";

/**
 * DER SINN DIESES TESTS ist die erste Zusicherung: ein künftiges Modul mit
 * eigener Gruppe taucht im Dev-Login als Häkchen auf, ohne dass jemand daran
 * denken muss. Fällt die Liste auseinander, ist der Fehler still — man hakt an,
 * was da ist, und die fehlende Gruppe merkt man erst am 404 des Riegels.
 * Dasselbe Muster wie `SuiteNav.test.tsx` ↔ `ICONS`.
 */
/**
 * `{}` statt `process.env`: der Test soll die Registry prüfen, nicht die
 * `.env.local` der Maschine, auf der er gerade läuft. Ein dort gesetztes
 * `SUITE_ADMIN_GROUP_*` machte ihn sonst je nach Arbeitsplatz rot oder grün.
 */
const OHNE_ENV = {};

describe("devGroupChoices", () => {
  it("enthält jede Gruppe aus der Registry — Admin- wie Zugangsliste", () => {
    const auswahl = devGroupChoices(OHNE_ENV);
    for (const mod of MODULES) {
      for (const g of [...mod.adminGroups, ...mod.requiredGroups]) {
        expect(auswahl, `Gruppe "${g}" des Moduls "${mod.key}" fehlt`).toContain(g);
      }
    }
  });

  it("enthält die Suite-Admin-Gruppe", () => {
    expect(devGroupChoices(OHNE_ENV)).toContain(suiteAdminGroup(OHNE_ENV));
  });

  it("ist doppelfrei und sortiert", () => {
    const auswahl = devGroupChoices(OHNE_ENV);
    expect(new Set(auswahl).size).toBe(auswahl.length);
    expect(auswahl).toEqual([...auswahl].sort((a, b) => a.localeCompare(b, "de")));
  });

  /**
   * Die Env-Überschreibung ist der eigentliche Grund für `adminGroupsFor`/
   * `requiredGroupsFor`: an `mod.adminGroups` direkt gelesen fehlte genau die
   * abweichend konfigurierte Gruppe — also die, die man anhaken will.
   */
  it("zieht SUITE_ADMIN_GROUP_<KEY> und SUITE_ACCESS_GROUP_<KEY> nach", () => {
    const auswahl = devGroupChoices({
      ADMIN_GROUP: "betreiber",
      SUITE_ADMIN_GROUP_FILES: "andere-files-admins",
      SUITE_ACCESS_GROUP_ALPHA: "andere-alpha-nutzer",
    });
    expect(auswahl).toContain("betreiber");
    expect(auswahl).toContain("andere-files-admins");
    expect(auswahl).toContain("andere-alpha-nutzer");
    // Die überschriebene Vorgabe ist verschwunden — sie bedeutet in dieser
    // Instanz nichts mehr, und ein Häkchen dafür wäre eine Falschauskunft.
    expect(auswahl).not.toContain("iuk-files-admin");
    expect(auswahl).not.toContain("dashboard-admins");
  });
});

/**
 * `vereinigeGruppen` ist der Grund, warum `e2e/fixtures.ts` unverändert bleibt:
 * ohne Häkchen ist das Ergebnis exakt der Freitext.
 */
describe("vereinigeGruppen", () => {
  it("ohne Häkchen: der Freitext, getrimmt und ohne Leeres", () => {
    expect(vereinigeGruppen([], "alpha-users, dashboard-admins ,")).toBe(
      "alpha-users,dashboard-admins",
    );
    expect(vereinigeGruppen([], "")).toBe("");
  });

  it("Häkchen zuerst, dann der Freitext", () => {
    expect(vereinigeGruppen(["a", "b"], "c")).toBe("a,b,c");
  });

  it("nennt eine Gruppe nur einmal, auch wenn sie in beidem steht", () => {
    expect(vereinigeGruppen(["a"], "a, b")).toBe("a,b");
  });
});
