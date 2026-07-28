import { describe, it, expect, vi, afterEach } from "vitest";
import { getModule, requiredGroupsFor } from "@/core/registry";
import { isModuleAdmin, suiteAdminGroup } from "@/core/groups";
import { isFeedbackAdmin, assertGroupAccess, accessibleGroupFilter } from "./access";

const admin = { sub: "a", groups: ["da-feedback-admin"], fachgruppen: [] };
const gl = { sub: "g", groups: ["da-feedback-gl"], fachgruppen: [] };

describe("isFeedbackAdmin", () => {
  it("true für Admin-Gruppe, false sonst/null", () => {
    expect(isFeedbackAdmin(admin)).toBe(true);
    expect(isFeedbackAdmin(gl)).toBe(false);
    expect(isFeedbackAdmin(null)).toBe(false);
  });

  /**
   * DER UNTERSCHIED ZU JEDEM ANDEREN MODUL, und deshalb steht er als eigener
   * Fall da: `isModuleAdmin` (core/groups) lässt den Suite-Admin durch, dieses
   * Modul nicht. Admin heißt hier Einblick in die Rückmeldungen ALLER Gruppen;
   * den Server zu betreiben ist kein Anlass dafür.
   *
   * Die Gegenprobe gehört dazu: `isModuleAdmin` MUSS für denselben Viewer weiter
   * `true` sagen. Sonst wäre der Test auch dann grün, wenn jemand die
   * Abkürzung suiteweit entfernt — und die Entscheidung galt nur für feedback.
   */
  it("der Suite-Admin allein ist hier KEIN Admin — anders als in den übrigen Modulen", () => {
    const betreiber = { sub: "b", groups: [suiteAdminGroup()], fachgruppen: [] };
    expect(isFeedbackAdmin(betreiber)).toBe(false);
    expect(isModuleAdmin(getModule("qr"), betreiber.groups)).toBe(true);
  });

  it("der Suite-Admin MIT Feedback-Admin-Gruppe ist Admin — der Weg steht offen", () => {
    const beides = {
      sub: "b2",
      groups: [suiteAdminGroup(), "da-feedback-admin"],
      fachgruppen: [],
    };
    expect(isFeedbackAdmin(beides)).toBe(true);
  });
});

describe("assertGroupAccess", () => {
  it("Admin darf jede Gruppe", () => {
    expect(() => assertGroupAccess(admin, 42, [])).not.toThrow();
  });
  it("groupleader nur eigene Gruppen", () => {
    expect(() => assertGroupAccess(gl, 7, [7, 9])).not.toThrow();
    expect(() => assertGroupAccess(gl, 3, [7, 9])).toThrow("Forbidden");
  });
  it("null-Viewer immer verboten", () => {
    expect(() => assertGroupAccess(null, 7, [7])).toThrow("Forbidden");
  });
  // Der Fachgruppen-Claim allein öffnet nichts: er wird ausschließlich in
  // memberGroupIdsFor gegen groups.slug aufgelöst. Wer hier durchkäme, hätte
  // Zugriff auf jede Gruppen-ID, sobald er irgendeinen Claim trägt.
  it("Fachgruppen-Claim am Viewer allein gewährt keinen Zugriff", () => {
    const claimOnly = { sub: "c", groups: [], fachgruppen: ["sanitaet"] };
    expect(() => assertGroupAccess(claimOnly, 7, [])).toThrow("Forbidden");
    expect(accessibleGroupFilter(claimOnly, [])).toEqual([]);
  });
});

describe("accessibleGroupFilter", () => {
  it("Admin → 'all', groupleader → seine IDs", () => {
    expect(accessibleGroupFilter(admin, [])).toBe("all");
    expect(accessibleGroupFilter(gl, [7, 9])).toEqual([7, 9]);
    expect(accessibleGroupFilter(null, [7])).toEqual([]);
  });
});

/*
 * DIE UMBENANNTEN SSO-GRUPPEN EINER INSTANZ (Cutover-Konfiguration).
 *
 * Vor dieser Zusicherung war `requiredGroups` der einzige Wert des Moduls ohne
 * Env-Weg. Heissen die Gruppen im Pocket ID `gruppenleiter` und
 * `da_feedback_admin`, dann muss BEIDES zugleich stimmen, und die zwei Haelften
 * kommen aus zwei verschiedenen Variablen:
 *   SUITE_ACCESS_GROUP_FEEDBACK=gruppenleiter,da_feedback_admin   → Zugang
 *   SUITE_ADMIN_GROUP_FEEDBACK=da_feedback_admin                  → Voll-Admin
 *
 * Der Fehler, den das ausschliesst: die Gruppenleitung ueber die ADMIN-Variable
 * hereinzulassen. Dann kaeme sie zwar herein, waere aber Voll-Admin und saehe
 * ALLE Gruppen statt ihrer eigenen — `accessibleGroupFilter` gaebe `"all"`.
 * Deshalb prueft dieser Block beide Haelften gemeinsam.
 */
describe("Zugang und Admin-Recht bei umbenannten SSO-Gruppen", () => {
  const ENV = {
    SUITE_ACCESS_GROUP_FEEDBACK: "gruppenleiter,da_feedback_admin",
    SUITE_ADMIN_GROUP_FEEDBACK: "da_feedback_admin",
  };
  const neuerGl = { sub: "n", groups: ["gruppenleiter"], fachgruppen: [] };
  const neuerAdmin = { sub: "m", groups: ["da_feedback_admin"], fachgruppen: [] };

  afterEach(() => vi.unstubAllEnvs());

  function stubEnv(): void {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  }

  it("beide neuen Gruppen tragen den Modulzugang", () => {
    // Das ist die Liste, die `requireFeedbackAccess` gegen `viewer.groups` haelt.
    const erlaubt = requiredGroupsFor(getModule("feedback"), ENV);
    expect(erlaubt).toEqual(["gruppenleiter", "da_feedback_admin"]);
    for (const v of [neuerGl, neuerAdmin]) {
      expect(v.groups.some((g) => erlaubt.includes(g))).toBe(true);
    }
  });

  it("aber nur die Admin-Gruppe ist Voll-Admin — GL sieht seine eigenen Gruppen", () => {
    stubEnv();
    expect(isFeedbackAdmin(neuerAdmin)).toBe(true);
    expect(isFeedbackAdmin(neuerGl)).toBe(false);
    // Und daran haengt die Sichtbarkeit: "all" gegen die eigenen IDs.
    expect(accessibleGroupFilter(neuerAdmin, [])).toBe("all");
    expect(accessibleGroupFilter(neuerGl, [7, 9])).toEqual([7, 9]);
    expect(() => assertGroupAccess(neuerGl, 3, [7, 9])).toThrow("Forbidden");
  });

  it("die alten Vorgabe-Gruppen tragen nach dem Umhaengen nicht mehr", () => {
    stubEnv();
    const erlaubt = requiredGroupsFor(getModule("feedback"), ENV);
    expect(erlaubt).not.toContain("da-feedback-gl");
    expect(gl.groups.some((g) => erlaubt.includes(g))).toBe(false);
    expect(isFeedbackAdmin(admin)).toBe(false);
  });
});
