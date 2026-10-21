import { describe, expect, it } from "vitest";
import { darfFahrzeugeVerwalten, hatFahrzeugeZugang } from "./zugang";

const ENV = { ADMIN_GROUP: "suite-admins" };

describe("Zugang zur Fahrzeugverwaltung", () => {
  it("über die Nutzer- oder die Admin-Gruppe", () => {
    expect(hatFahrzeugeZugang(["fahrzeuge-nutzer"], ENV)).toBe(true);
    expect(hatFahrzeugeZugang(["fahrzeuge-admin"], ENV)).toBe(true);
    expect(hatFahrzeugeZugang(["suite-admins"], ENV)).toBe(false);
    expect(hatFahrzeugeZugang(null, ENV)).toBe(false);
  });

  it("verwalten braucht Zugang UND Modul-Admin (oder Suite-Admin)", () => {
    expect(darfFahrzeugeVerwalten(["fahrzeuge-admin"], ENV)).toBe(true);
    expect(darfFahrzeugeVerwalten(["fahrzeuge-nutzer", "suite-admins"], ENV)).toBe(true);
    expect(darfFahrzeugeVerwalten(["fahrzeuge-nutzer"], ENV)).toBe(false);
    expect(darfFahrzeugeVerwalten(["suite-admins"], ENV)).toBe(false);
  });

  it("die Gruppen sind per Umgebung überschreibbar", () => {
    const env = { ...ENV, SUITE_ACCESS_GROUP_FAHRZEUGE: "fuhrpark-lesen", SUITE_ADMIN_GROUP_FAHRZEUGE: "fuhrpark-pflegen" };
    expect(hatFahrzeugeZugang(["fuhrpark-lesen"], env)).toBe(true);
    expect(hatFahrzeugeZugang(["fahrzeuge-nutzer"], env)).toBe(false);
    expect(darfFahrzeugeVerwalten(["fuhrpark-lesen", "fuhrpark-pflegen"], env)).toBe(true);
    expect(darfFahrzeugeVerwalten(["fuhrpark-lesen"], env)).toBe(false);
  });
});
