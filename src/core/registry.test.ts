import { describe, it, expect, vi } from "vitest";
import {
  getModule, moduleForHost, canAccess, visibleSwitcherModules, requiredGroupsFor,
} from "@/core/registry";

describe("registry", () => {
  it("resolves dev host by convention", () => {
    expect(moduleForHost("alpha.localtest.me")?.key).toBe("alpha");
    expect(moduleForHost("alpha.localtest.me:3000")?.key).toBe("alpha");
    expect(moduleForHost("PORTAL.localtest.me")?.key).toBe("portal");
  });
  it("returns null for unknown host", () => {
    expect(moduleForHost("nope.example.com")).toBeNull();
  });
  it("routet einen Host aus SUITE_HOST_<KEY> auf sein Modul", () => {
    vi.stubEnv("SUITE_HOST_BETA", "beta.example.com");
    expect(moduleForHost("beta.example.com")?.key).toBe("beta");
    expect(moduleForHost("BETA.example.com:8080")?.key).toBe("beta");
    vi.unstubAllEnvs();
  });
  it("Env überschreibt den Registry-Fallback vollständig", () => {
    // Nicht additiv: nach dem Umschwenken darf die alte Domain nicht
    // weiterlaufen, sonst hängt ein Modul an zwei Hosts.
    vi.stubEnv("SUITE_HOST_PORTAL", "neu.example.org");
    expect(moduleForHost("neu.example.org")?.key).toBe("portal");
    expect(moduleForHost("iuk-ue.de")).toBeNull();
    vi.unstubAllEnvs();
  });
  it("getModule throws on unknown key", () => {
    expect(() => getModule("ghost")).toThrow();
  });
  it("canAccess: anonymous module open to everyone", () => {
    expect(canAccess(getModule("beta"), null)).toBe(true);
  });
  it("canAccess: auth-required module blocks anonymous", () => {
    expect(canAccess(getModule("alpha"), null)).toBe(false);
  });
  it("canAccess: group-gated module needs overlap", () => {
    expect(canAccess(getModule("alpha"), ["other"])).toBe(false);
    expect(canAccess(getModule("alpha"), ["alpha-users"])).toBe(true);
  });
  it("canAccess: auth-only module (no groups) allows any logged-in user", () => {
    expect(canAccess(getModule("portal"), [])).toBe(true);
    expect(canAccess(getModule("portal"), null)).toBe(false);
  });
  it("qr ist anonym erreichbar und hat iuk-qr-admin als Modul-Admin", () => {
    const qr = getModule("qr");
    expect(qr.requiresAuth).toBe(false);
    // Minimal-Shell ist Teil des anonymen Zugangs: die Full-Shell würde für
    // jeden Besucher auth() aufrufen und den App-Switcher-Header rendern.
    expect(qr.shell).toBe("minimal");
    expect(canAccess(qr, null)).toBe(true);
    expect(qr.adminGroups).toEqual(["iuk-qr-admin"]);
    expect(moduleForHost("qr.localtest.me")?.key).toBe("qr");
  });
  /*
   * ZUGANGSGRUPPEN AUS DER ENV (`SUITE_ACCESS_GROUP_<KEY>`).
   *
   * Der Anlass: `requiredGroups` war der einzige Wert des Moduls ohne Env-Weg —
   * `prodHosts` und `adminGroups` hatten beide einen. Eine Instanz, deren
   * SSO-Gruppen anders heissen als die Vorgaben im Code, konnte den Modulzugang
   * also nur per Commit umbiegen; die Gruppenleitung bekam bis dahin einen 404.
   */
  it("requiredGroupsFor: ohne Env gilt der Registry-Wert", () => {
    expect(requiredGroupsFor(getModule("feedback"), {})).toEqual([
      "da-feedback-gl",
      "da-feedback-admin",
    ]);
  });
  it("requiredGroupsFor: SUITE_ACCESS_GROUP_<KEY> ersetzt die Liste vollstaendig", () => {
    // Nicht additiv, wie bei SUITE_HOST_<KEY>: nach dem Umhaengen darf die alte
    // Gruppe nicht weiter Zugang geben.
    const env = { SUITE_ACCESS_GROUP_FEEDBACK: "gruppenleiter,da_feedback_admin" };
    expect(requiredGroupsFor(getModule("feedback"), env)).toEqual([
      "gruppenleiter",
      "da_feedback_admin",
    ]);
  });
  it("canAccess liest die Env-Liste, nicht das Registry-Feld", () => {
    const alpha = getModule("alpha");
    const env = { SUITE_ACCESS_GROUP_ALPHA: "neue-gruppe" };
    expect(canAccess(alpha, ["neue-gruppe"], env)).toBe(true);
    // Und die Registry-Gruppe traegt nach dem Umhaengen nicht mehr.
    expect(canAccess(alpha, ["alpha-users"], env)).toBe(false);
  });
  it("canAccess: leer gesetzte Env oeffnet das Modul NICHT", () => {
    // Der gefaehrliche Fall: waere leer ein leeres Array, liesse `canAccess` jeden
    // Eingeloggten herein (`length === 0 → true`). Stattdessen gilt die Registry.
    const env = { SUITE_ACCESS_GROUP_ALPHA: "" };
    expect(canAccess(getModule("alpha"), ["irgendwas"], env)).toBe(false);
    expect(canAccess(getModule("alpha"), ["alpha-users"], env)).toBe(true);
  });

  it("visibleSwitcherModules filters by access and showInSwitcher", () => {
    const anon = visibleSwitcherModules(null).map((m) => m.key);
    expect(anon).not.toContain("alpha");
    expect(anon).toEqual(["qr", "radio"]);
    const withAlpha = visibleSwitcherModules(["alpha-users"]).map((m) => m.key);
    expect(withAlpha).toContain("alpha");
    expect(withAlpha).toContain("portal");
    // kioskdemo is never in the switcher
    expect(withAlpha).not.toContain("kioskdemo");
  });

  it("blendet gemischt oeffentliche Module ohne Gruppe aus dem Switcher aus", () => {
    const ohneGruppen = visibleSwitcherModules([]).map((m) => m.key);
    expect(ohneGruppen).not.toContain("feedback");
    expect(ohneGruppen).not.toContain("files");
    expect(ohneGruppen).not.toContain("lagerbuch");

    expect(visibleSwitcherModules(["da-feedback-gl"]).map((m) => m.key)).toContain("feedback");
    expect(visibleSwitcherModules(["iuk-files-admin"]).map((m) => m.key)).toContain("files");
    expect(visibleSwitcherModules(["lagerbuch_nutzer"]).map((m) => m.key)).toContain("lagerbuch");
  });

  it("liest fuer den Switcher die env-konfigurierten Access- und Admin-Gruppen", () => {
    const env = {
      SUITE_ACCESS_GROUP_FEEDBACK: "feedback-neu",
      SUITE_ACCESS_GROUP_FILES: "dateien-zugriff",
      SUITE_ADMIN_GROUP_FILES: "dateien-neu",
      SUITE_ADMIN_GROUP_LAGERBUCH: "lager-neu",
    };

    expect(visibleSwitcherModules(["feedback-neu"], env).map((m) => m.key)).toContain("feedback");
    expect(visibleSwitcherModules(["da-feedback-gl"], env).map((m) => m.key)).not.toContain(
      "feedback",
    );
    expect(visibleSwitcherModules(["dateien-neu"], env).map((m) => m.key)).toContain("files");
    expect(visibleSwitcherModules(["dateien-zugriff"], env).map((m) => m.key)).toContain("files");
    expect(visibleSwitcherModules(["lager-neu"], env).map((m) => m.key)).toContain("lagerbuch");
  });
});

describe("moduleForHost — prod apex", () => {
  it("maps iuk-ue.de to portal", () => {
    expect(moduleForHost("iuk-ue.de")?.key).toBe("portal");
  });
  it("ignores the port when matching the apex host", () => {
    expect(moduleForHost("iuk-ue.de:443")?.key).toBe("portal");
  });
});
