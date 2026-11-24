import { describe, expect, it } from "vitest";
import { darfVeranstaltungLoeschen, hatVeranstaltungenZugang } from "./zugang";

const ENV = { ADMIN_GROUP: "suite-admins" };

describe("Zugang zur den Veranstaltungen", () => {
  it("über die Nutzer- oder die Admin-Gruppe, nicht über den Suite-Admin allein", () => {
    expect(hatVeranstaltungenZugang(["veranstaltungen-nutzer"], ENV)).toBe(true);
    expect(hatVeranstaltungenZugang(["veranstaltungen-admin"], ENV)).toBe(true);
    expect(hatVeranstaltungenZugang(["suite-admins"], ENV)).toBe(false);
    expect(hatVeranstaltungenZugang(["helfer-nutzer"], ENV)).toBe(false);
    expect(hatVeranstaltungenZugang(null, ENV)).toBe(false);
  });

  it("löschen braucht Zugang UND Modul-Admin (oder Suite-Admin)", () => {
    expect(darfVeranstaltungLoeschen(["veranstaltungen-admin"], ENV)).toBe(true);
    expect(darfVeranstaltungLoeschen(["veranstaltungen-nutzer", "suite-admins"], ENV)).toBe(true);
    expect(darfVeranstaltungLoeschen(["veranstaltungen-nutzer"], ENV)).toBe(false);
    expect(darfVeranstaltungLoeschen(["suite-admins"], ENV)).toBe(false);
  });

  it("die Gruppen sind per Umgebung überschreibbar", () => {
    const env = { ...ENV, SUITE_ACCESS_GROUP_VERANSTALTUNGEN: "planer", SUITE_ADMIN_GROUP_VERANSTALTUNGEN: "planleitung" };
    expect(hatVeranstaltungenZugang(["planer"], env)).toBe(true);
    expect(hatVeranstaltungenZugang(["veranstaltungen-nutzer"], env)).toBe(false);
    expect(darfVeranstaltungLoeschen(["planer", "planleitung"], env)).toBe(true);
    expect(darfVeranstaltungLoeschen(["planer"], env)).toBe(false);
  });
});
