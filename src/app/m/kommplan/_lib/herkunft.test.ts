import { describe, expect, it } from "vitest";
import { gleicheHerkunft } from "./herkunft";

const h = (k: Record<string, string>) => new Headers(k);
describe("gleicheHerkunft — der CSRF-Riegel der Route Handler (Entscheidung 3)", () => {
  it("gleicher Host samt Port: ja; x-forwarded-host geht vor host", () => {
    expect(gleicheHerkunft(h({ origin: "http://kommplan.localtest.me:3100", host: "kommplan.localtest.me:3100" }))).toBe(true);
    expect(gleicheHerkunft(h({ origin: "https://kommplan.iuk-ue.de", host: "suite:3000", "x-forwarded-host": "kommplan.iuk-ue.de" }))).toBe(true);
  });
  it("ein anderer Suite-Host (gleiche Site, anderer Origin), fehlender oder kaputter Origin: nein", () => {
    expect(gleicheHerkunft(h({ origin: "https://files.iuk-ue.de", "x-forwarded-host": "kommplan.iuk-ue.de" }))).toBe(false);
    expect(gleicheHerkunft(h({ host: "kommplan.iuk-ue.de" }))).toBe(false);
    expect(gleicheHerkunft(h({ origin: "null", host: "kommplan.iuk-ue.de" }))).toBe(false);
    expect(gleicheHerkunft(h({ origin: "https://kommplan.iuk-ue.de" }))).toBe(false);
  });
});
