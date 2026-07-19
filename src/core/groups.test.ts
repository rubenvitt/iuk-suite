import { describe, it, expect } from "vitest";
import {
  suiteAdminGroup,
  adminGroupsFor,
  isModuleAdmin,
  validateGroupConfig,
  adminGroupEnvName,
} from "@/core/groups";
import type { ModuleDef } from "@/core/registry";

const mod = (over: Partial<ModuleDef> = {}): ModuleDef => ({
  key: "qr",
  title: "QR",
  icon: "QrCode",
  shell: "minimal",
  requiresAuth: false,
  requiredGroups: [],
  adminGroups: ["drk-qr-admin"],
  prodHosts: [],
  showInSwitcher: true,
  ...over,
});

describe("suiteAdminGroup", () => {
  it("fällt auf dashboard-admins zurück", () => {
    expect(suiteAdminGroup({})).toBe("dashboard-admins");
  });
  it("ADMIN_GROUP überschreibt — der Name ist historisch, nicht umbenennen", () => {
    expect(suiteAdminGroup({ ADMIN_GROUP: "admin" })).toBe("admin");
  });
});

describe("adminGroupsFor", () => {
  it("nimmt den Registry-Wert, wenn keine Env gesetzt ist", () => {
    expect(adminGroupsFor(mod(), {})).toEqual(["drk-qr-admin"]);
  });
  it("SUITE_ADMIN_GROUP_<KEY> überschreibt und trennt an Kommas", () => {
    expect(adminGroupsFor(mod(), { SUITE_ADMIN_GROUP_QR: " a , b " })).toEqual(["a", "b"]);
  });
  it("leer gesetzt heißt: keine modul-eigenen Admins", () => {
    expect(adminGroupsFor(mod(), { SUITE_ADMIN_GROUP_QR: "" })).toEqual([]);
  });
  it("Bindestrich im Key wird zu Unterstrich", () => {
    expect(adminGroupEnvName("uav-praxis")).toBe("SUITE_ADMIN_GROUP_UAV_PRAXIS");
  });
});

describe("isModuleAdmin", () => {
  it("Modul-Admin-Gruppe genügt", () => {
    expect(isModuleAdmin(mod(), ["drk-qr-admin"], {})).toBe(true);
  });
  it("Suite-Admin darf überall — auch ohne Modul-Gruppe", () => {
    expect(isModuleAdmin(mod(), ["dashboard-admins"], {})).toBe(true);
  });
  it("fremde Gruppe genügt nicht", () => {
    expect(isModuleAdmin(mod(), ["drk-qr-user"], {})).toBe(false);
  });
  it("eingeloggt ohne Gruppen ist kein Admin", () => {
    expect(isModuleAdmin(mod(), [], {})).toBe(false);
  });

  // Der Unterschied zwischen "anonym" und "eingeloggt ohne Recht" muss erhalten
  // bleiben: anonyme Module (qr) rendern Server Components ohne Session.
  it("anonym (null/undefined) ist nie Admin", () => {
    expect(isModuleAdmin(mod(), null, {})).toBe(false);
    expect(isModuleAdmin(mod(), undefined, {})).toBe(false);
  });

  it("Modul ohne eigene Admin-Gruppen: nur der Suite-Admin darf", () => {
    const portal = mod({ key: "portal", adminGroups: [] });
    expect(isModuleAdmin(portal, ["dashboard-admins"], {})).toBe(true);
    expect(isModuleAdmin(portal, ["irgendwas"], {})).toBe(false);
  });

  it("Env-Überschreibung wirkt auf die Prüfung durch", () => {
    expect(isModuleAdmin(mod(), ["neue-gruppe"], { SUITE_ADMIN_GROUP_QR: "neue-gruppe" })).toBe(
      true,
    );
    expect(isModuleAdmin(mod(), ["drk-qr-admin"], { SUITE_ADMIN_GROUP_QR: "neue-gruppe" })).toBe(
      false,
    );
  });

  it("bisheriges Portal-Verhalten bleibt: ADMIN_GROUP aus der Server-.env greift", () => {
    const portal = mod({ key: "portal", adminGroups: [] });
    expect(isModuleAdmin(portal, ["admin"], { ADMIN_GROUP: "admin" })).toBe(true);
  });
});

describe("validateGroupConfig", () => {
  it("leere Umgebung ist gültig", () => {
    expect(validateGroupConfig(["portal", "qr"], {})).toEqual([]);
  });
  it("bekannte Variable ist gültig", () => {
    expect(validateGroupConfig(["portal", "qr"], { SUITE_ADMIN_GROUP_QR: "x" })).toEqual([]);
  });
  it("Tippfehler wird gemeldet", () => {
    const errors = validateGroupConfig(["portal", "qr"], { SUITE_ADMIN_GROUP_QRR: "x" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SUITE_ADMIN_GROUP_QRR");
  });
  it("ADMIN_GROUP ohne Präfix ist keine Modul-Variable und wird ignoriert", () => {
    expect(validateGroupConfig(["portal"], { ADMIN_GROUP: "admin" })).toEqual([]);
  });
});
