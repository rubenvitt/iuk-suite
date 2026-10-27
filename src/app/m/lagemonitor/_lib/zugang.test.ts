import { describe, expect, it } from "vitest";
import { darfLagemonitorVerwalten } from "./zugang";

const ENV = { ADMIN_GROUP: "suite-admins" };

describe("Verwaltung des Lagemonitors", () => {
  it("nur Modul-Admin oder Suite-Admin", () => {
    expect(darfLagemonitorVerwalten(["lagemonitor-admin"], ENV)).toBe(true);
    expect(darfLagemonitorVerwalten(["suite-admins"], ENV)).toBe(true);
    expect(darfLagemonitorVerwalten(["fahrzeuge-admin"], ENV)).toBe(false);
    expect(darfLagemonitorVerwalten(null, ENV)).toBe(false);
  });

  it("die Admin-Gruppe ist per Umgebung überschreibbar", () => {
    const env = { ...ENV, SUITE_ADMIN_GROUP_LAGEMONITOR: "fuekw-technik" };
    expect(darfLagemonitorVerwalten(["fuekw-technik"], env)).toBe(true);
    expect(darfLagemonitorVerwalten(["lagemonitor-admin"], env)).toBe(false);
  });
});
