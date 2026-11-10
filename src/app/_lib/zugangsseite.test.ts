import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ansprechpartner: vi.fn(),
}));
vi.mock("@/core/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/m/portal/_lib/einstellungen", () => ({ leseAnsprechpartner: mocks.ansprechpartner }));

import { leseZugangsauskunft, modulWurzelOffen, portalUrl } from "./zugangsseite";

/**
 * IDA-392: die 404 fuehrte angemeldete Personen ohne Modulgruppe von „Zur Startseite" auf dieselbe 404
 * zurueck. `modulWurzelOffen` entscheidet, ob `/` auf diesem Host weiterhilft oder das Portal.
 */
describe("modulWurzelOffen", () => {
  it("Suite-Host und unbekannter Host: `/` ist das Portal, das jede angemeldete Person sieht", () => {
    expect(modulWurzelOffen("portal.localtest.me:3000", [])).toBe(true);
    expect(modulWurzelOffen("irgendwo.example", [])).toBe(true);
  });

  it("Modul, das erst im Modul riegelt (Gerätewartung): ohne Gruppe nicht, mit Gruppe schon", () => {
    expect(modulWurzelOffen("wartung.localtest.me:3000", [])).toBe(false);
    expect(modulWurzelOffen("wartung.localtest.me:3000", ["andere-gruppe"])).toBe(false);
    expect(modulWurzelOffen("wartung.localtest.me:3000", ["wartung-nutzer"])).toBe(true);
  });

  it("Modul mit Zugangsgruppe am Proxy (Aufgaben): folgt `canAccess`", () => {
    expect(modulWurzelOffen("aufgaben.localtest.me", [])).toBe(false);
    expect(modulWurzelOffen("aufgaben.localtest.me", ["aufgaben-nutzer"])).toBe(true);
  });

  it("Modul, dessen Einstieg die Verwaltung ist (Lagemonitor): nur mit Admin-Gruppe", () => {
    expect(modulWurzelOffen("lagemonitor.localtest.me", [])).toBe(false);
    expect(modulWurzelOffen("lagemonitor.localtest.me", ["lagemonitor-admin"])).toBe(true);
  });

  it("der Prod-Host aus der Umgebung zählt wie der lokale", () => {
    const env = { SUITE_HOST_WARTUNG: "wartung.example.org" };
    expect(modulWurzelOffen("wartung.example.org", [], env)).toBe(false);
    expect(modulWurzelOffen("wartung.example.org", ["wartung-admin"], env)).toBe(true);
  });
});

describe("portalUrl", () => {
  it("nimmt den Ursprung aus `AUTH_URL`, nie dessen Pfad", () => {
    expect(portalUrl({ AUTH_URL: "https://suite.example.org/irgendwas" })).toBe("https://suite.example.org/");
  });

  it("ohne `AUTH_URL` gilt die Adresse des Portal-Moduls, kein relatives `/`", () => {
    const url = portalUrl({});
    expect(url).not.toBe("/");
    expect(url).toMatch(/\/$/);
  });
});

describe("leseZugangsauskunft", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.ansprechpartner.mockReset();
  });

  it("ohne Sitzung: weder Konto noch Ansprechpartner, und die Einstellung wird gar nicht gelesen", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await leseZugangsauskunft()).toEqual({ gruppen: null, konto: null, ansprechpartner: null });
    expect(mocks.ansprechpartner).not.toHaveBeenCalled();
  });

  it("mit Sitzung: E-Mail vor Name, Gruppen und Ansprechpartner", async () => {
    mocks.auth.mockResolvedValue({ user: { email: "person@example.org", name: "Person", groups: ["a"] } });
    mocks.ansprechpartner.mockResolvedValue("Leitung I&K, Telefon 123");
    expect(await leseZugangsauskunft()).toEqual({
      gruppen: ["a"],
      konto: "person@example.org",
      ansprechpartner: "Leitung I&K, Telefon 123",
    });
  });

  it("wirft nie: eine Randseite darf an Sitzung oder Datenbank nicht selbst scheitern", async () => {
    mocks.auth.mockRejectedValue(new Error("kaputt"));
    expect(await leseZugangsauskunft()).toEqual({ gruppen: null, konto: null, ansprechpartner: null });

    mocks.auth.mockResolvedValue({ user: { name: "Person", groups: [] } });
    mocks.ansprechpartner.mockRejectedValue(new Error("DB weg"));
    expect(await leseZugangsauskunft()).toEqual({ gruppen: [], konto: "Person", ansprechpartner: null });
  });
});
