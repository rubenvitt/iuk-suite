import { describe, it, expect } from "vitest";
import { envHostsFor, validateHostConfig } from "@/core/hosts";

const KEYS = ["portal", "qr", "kioskdemo"];

describe("envHostsFor", () => {
  it("nicht gesetzt → null (Registry-Fallback gilt)", () => {
    expect(envHostsFor("qr", {})).toBeNull();
  });

  it("leer gesetzt → [] (Cutover bewusst zurückgenommen)", () => {
    // Der Unterschied zu null ist der ganze Punkt: so lässt sich ein Modul
    // wieder abschalten, ohne die Variable zu entfernen und ohne Rebuild.
    expect(envHostsFor("qr", { SUITE_HOST_QR: "" })).toEqual([]);
  });

  it("liest, trimmt und normalisiert mehrere Hosts", () => {
    expect(envHostsFor("files", { SUITE_HOST_FILES: " Files.iuk-ue.de , drop.iuk-ue.de " })).toEqual(
      ["files.iuk-ue.de", "drop.iuk-ue.de"],
    );
  });

  it("Bindestrich im Modul-Key wird zu Unterstrich", () => {
    expect(envHostsFor("uav-praxis", { SUITE_HOST_UAV_PRAXIS: "uav.iuk-ue.de" })).toEqual([
      "uav.iuk-ue.de",
    ]);
  });
});

describe("validateHostConfig", () => {
  it("leere Umgebung ist gültig", () => {
    expect(validateHostConfig(KEYS, {})).toEqual([]);
  });

  it("gültige Konfiguration ist fehlerfrei", () => {
    expect(
      validateHostConfig(KEYS, { SUITE_HOST_PORTAL: "iuk-ue.de", SUITE_HOST_QR: "qr.iuk-ue.de" }),
    ).toEqual([]);
  });

  it("Tippfehler im Variablennamen wird gemeldet", () => {
    // Ohne diese Prüfung wäre SUITE_HOST_QRR einfach wirkungslos und das Modul
    // liefe unbemerkt weiter unter dem Portal-Fallback.
    const errors = validateHostConfig(KEYS, { SUITE_HOST_QRR: "qr.iuk-ue.de" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("SUITE_HOST_QRR");
  });

  it("doppelt vergebener Host wird gemeldet", () => {
    const errors = validateHostConfig(KEYS, {
      SUITE_HOST_PORTAL: "iuk-ue.de",
      SUITE_HOST_QR: "iuk-ue.de",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("doppelt vergeben");
  });

  it("Protokoll im Wert wird gemeldet", () => {
    const errors = validateHostConfig(KEYS, { SUITE_HOST_QR: "https://qr.iuk-ue.de" });
    expect(errors[0]).toContain("reiner Hostname");
  });

  it("Port im Wert wird gemeldet — moduleForHost schneidet ihn ohnehin ab", () => {
    const errors = validateHostConfig(KEYS, { SUITE_HOST_QR: "qr.iuk-ue.de:3000" });
    expect(errors[0]).toContain("reiner Hostname");
  });

  it("derselbe Host zweimal für dasselbe Modul ist kein Konflikt", () => {
    expect(validateHostConfig(KEYS, { SUITE_HOST_QR: "qr.iuk-ue.de,qr.iuk-ue.de" })).toEqual([]);
  });

  it("andere Umgebungsvariablen werden ignoriert", () => {
    expect(validateHostConfig(KEYS, { AUTH_SECRET: "x", POCKET_ID_ISSUER: "y" })).toEqual([]);
  });
});
