import { describe, expect, it } from "vitest";
import { darfHelferVerwalten, hatHelferZugang } from "./zugang";

const ENV = { ADMIN_GROUP: "suite-admins" };

describe("Zugang zum Helferverzeichnis", () => {
  it("nur über die Zugangsgruppe — der Suite-Admin allein sieht keine Personaldaten", () => {
    expect(hatHelferZugang(["helfer-nutzer"], ENV)).toBe(true);
    expect(hatHelferZugang(["suite-admins"], ENV)).toBe(false);
    expect(hatHelferZugang(["helfer-admin"], ENV)).toBe(false);
    expect(hatHelferZugang(null, ENV)).toBe(false);
  });

  it("verwalten braucht Zugang UND Modul-Admin (oder Suite-Admin)", () => {
    expect(darfHelferVerwalten(["helfer-nutzer", "helfer-admin"], ENV)).toBe(true);
    expect(darfHelferVerwalten(["helfer-nutzer", "suite-admins"], ENV)).toBe(true);
    expect(darfHelferVerwalten(["helfer-nutzer"], ENV)).toBe(false);
    expect(darfHelferVerwalten(["helfer-admin"], ENV)).toBe(false);
  });

  it("die Gruppen sind per Umgebung überschreibbar", () => {
    const env = { ...ENV, SUITE_ACCESS_GROUP_HELFER: "personal-lesen", SUITE_ADMIN_GROUP_HELFER: "personal-pflegen" };
    expect(hatHelferZugang(["personal-lesen"], env)).toBe(true);
    expect(hatHelferZugang(["helfer-nutzer"], env)).toBe(false);
    expect(darfHelferVerwalten(["personal-lesen", "personal-pflegen"], env)).toBe(true);
  });
});
