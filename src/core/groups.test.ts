import { describe, it, expect } from "vitest";
import {
  suiteAdminGroup,
  adminGroupsFor,
  isModuleAdmin,
  validateGroupConfig,
  adminGroupEnvName,
  accessGroupEnvName,
  envAccessGroupsFor,
  hasAnyGroup,
} from "@/core/groups";
import type { ModuleDef } from "@/core/registry";

const mod = (over: Partial<ModuleDef> = {}): ModuleDef => ({
  key: "qr",
  title: "QR",
  icon: "QrCode",
  shell: "minimal",
  requiresAuth: false,
  requiredGroups: [],
  adminGroups: ["iuk-qr-admin"],
  prodHosts: [],
  showInSwitcher: true,
  switcherGroupSources: [],
  ...over,
});

describe("hasAnyGroup", () => {
  it("verlangt mindestens einen exakten Pocket-ID-Gruppentreffer", () => {
    expect(hasAnyGroup(["funk", "lager"], ["lager", "admin"])).toBe(true);
    expect(hasAnyGroup(["Lager"], ["lager"])).toBe(false);
  });

  it("gewaehrt anonym und bei leerer Anforderung nichts", () => {
    expect(hasAnyGroup(null, ["lager"])).toBe(false);
    expect(hasAnyGroup(undefined, ["lager"])).toBe(false);
    expect(hasAnyGroup(["lager"], [])).toBe(false);
  });
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
    expect(adminGroupsFor(mod(), {})).toEqual(["iuk-qr-admin"]);
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

describe("envAccessGroupsFor", () => {
  it("ohne Env gesetzt: kein Override", () => {
    expect(envAccessGroupsFor("qr", {})).toBeNull();
  });
  it("SUITE_ACCESS_GROUP_<KEY> trennt an Kommas und trimmt", () => {
    expect(envAccessGroupsFor("feedback", { SUITE_ACCESS_GROUP_FEEDBACK: " gl , admin " })).toEqual([
      "gl",
      "admin",
    ]);
  });
  /*
   * DER UNTERSCHIED ZU `adminGroupsFor` UND `SUITE_HOST_<KEY>`, und der Grund, aus
   * dem dieser Test existiert: dort ist eine leer gesetzte Variable eine gültige,
   * restriktivere Aussage. Hier wäre sie je Modul das Gegenteil — bei
   * `requiresAuth: true` liest `canAccess` aus der leeren Liste „jeder
   * Eingeloggte darf". Eine beim Editieren leer gelassene Zeile darf kein Modul
   * öffnen, also gilt der Registry-Wert weiter.
   */
  it("leer gesetzt ist KEIN leeres Array, sondern kein Override", () => {
    expect(envAccessGroupsFor("feedback", { SUITE_ACCESS_GROUP_FEEDBACK: "" })).toBeNull();
    expect(envAccessGroupsFor("feedback", { SUITE_ACCESS_GROUP_FEEDBACK: "  ,  " })).toBeNull();
  });
  it("Bindestrich im Key wird zu Unterstrich", () => {
    expect(accessGroupEnvName("uav-praxis")).toBe("SUITE_ACCESS_GROUP_UAV_PRAXIS");
  });
});

describe("isModuleAdmin", () => {
  it("Modul-Admin-Gruppe genügt", () => {
    expect(isModuleAdmin(mod(), ["iuk-qr-admin"], {})).toBe(true);
  });
  it("Suite-Admin darf überall — auch ohne Modul-Gruppe", () => {
    expect(isModuleAdmin(mod(), ["dashboard-admins"], {})).toBe(true);
  });
  it("fremde Gruppe genügt nicht", () => {
    expect(isModuleAdmin(mod(), ["iuk-qr-user"], {})).toBe(false);
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
    expect(isModuleAdmin(mod(), ["iuk-qr-admin"], { SUITE_ADMIN_GROUP_QR: "neue-gruppe" })).toBe(
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

  it("kennt auch die Zugangs-Variable — bekannte gilt, Tippfehler nicht", () => {
    expect(validateGroupConfig(["feedback"], { SUITE_ACCESS_GROUP_FEEDBACK: "gl" })).toEqual([]);
    const errors = validateGroupConfig(["feedback"], { SUITE_ACCESS_GROUP_FEEDBCK: "gl" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SUITE_ACCESS_GROUP_FEEDBCK");
    // Die Fehlermeldung nennt die bekannten ZUGANGS-Variablen, nicht die Admin-Namen.
    expect(errors[0]).toContain("SUITE_ACCESS_GROUP_FEEDBACK");
  });

  /*
   * Die leer gesetzte Zugangs-Variable ist wirkungslos (siehe
   * `envAccessGroupsFor`) — und „wirkungslos, ohne dass es jemand merkt" ist genau
   * der Zustand, gegen den `validateGroupConfig` steht. `bootstrap.ts` bricht
   * damit den Start ab, statt die Gruppenleitung nach dem Deploy in einen 404 zu
   * schicken.
   */
  it("meldet die LEER gesetzte Zugangs-Variable als Fehler", () => {
    const errors = validateGroupConfig(["feedback"], { SUITE_ACCESS_GROUP_FEEDBACK: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("wirkungslos");
  });
  it("die leer gesetzte ADMIN-Variable bleibt dagegen gültig", () => {
    expect(validateGroupConfig(["feedback"], { SUITE_ADMIN_GROUP_FEEDBACK: "" })).toEqual([]);
  });
});
