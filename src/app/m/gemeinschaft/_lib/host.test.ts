import { afterEach, describe, expect, it } from "vitest";
import { anmeldeHref, anmeldeZiel } from "./host";

/**
 * Der Login kehrt absolut auf den Modul-Host zurück. Ein relatives `/m/gemeinschaft` landete nach der
 * Anmeldung auf dem Portal-Host, wo der Host-Riegel mit 404 antwortet (gefunden beim Live-Gang 2026-11-02).
 */
const alt = process.env.SUITE_HOST_GEMEINSCHAFT;
afterEach(() => {
  if (alt === undefined) delete process.env.SUITE_HOST_GEMEINSCHAFT;
  else process.env.SUITE_HOST_GEMEINSCHAFT = alt;
});

describe("anmeldeZiel", () => {
  it("zeigt in Produktion absolut auf den Modul-Host", () => {
    process.env.SUITE_HOST_GEMEINSCHAFT = "gemeinschaft.iuk-ue.de";
    const kopf = new Headers({ host: "gemeinschaft.iuk-ue.de", "x-forwarded-proto": "https" });
    expect(anmeldeZiel(kopf, "/")).toBe("https://gemeinschaft.iuk-ue.de/");
    expect(anmeldeZiel(kopf, "/bar")).toBe("https://gemeinschaft.iuk-ue.de/bar");
  });

  it("übernimmt Protokoll und Port aus dem Request (Dev/E2E)", () => {
    delete process.env.SUITE_HOST_GEMEINSCHAFT;
    const kopf = new Headers({ host: "gemeinschaft.localtest.me:3000" });
    expect(anmeldeZiel(kopf, "/bar")).toBe("http://gemeinschaft.localtest.me:3000/bar");
  });

  it("nimmt keinen fremden Host als Ziel", () => {
    delete process.env.SUITE_HOST_GEMEINSCHAFT;
    const kopf = new Headers({ host: "boese.example.org" });
    expect(anmeldeZiel(kopf, "/")).toBe("/m/gemeinschaft");
    expect(anmeldeZiel(kopf, "/bar")).toBe("/m/gemeinschaft/bar");
  });

  it("baut den Login-Link mit kodiertem Rückweg", () => {
    process.env.SUITE_HOST_GEMEINSCHAFT = "gemeinschaft.iuk-ue.de";
    const kopf = new Headers({ host: "gemeinschaft.iuk-ue.de", "x-forwarded-proto": "https" });
    expect(anmeldeHref(kopf, "/")).toBe(`/login?callbackUrl=${encodeURIComponent("https://gemeinschaft.iuk-ue.de/")}`);
  });
});
