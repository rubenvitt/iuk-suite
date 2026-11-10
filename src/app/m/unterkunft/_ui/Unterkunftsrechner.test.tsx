// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { Unterkunftsrechner } from "./Unterkunftsrechner";

afterEach(async () => { await unmount(); });

/** IDA-390 — Telefon: Zifferntastatur in den Zahlenfeldern, Marken mit sichtbarem Kurztext statt Tooltip. */
describe("Unterkunftsrechner", () => {
  it("Personenzahlen öffnen die Zifferntastatur", async () => {
    await mount(<App><Unterkunftsrechner /></App>);
    for (const name of ["Männer", "Frauen"]) {
      expect(query<HTMLInputElement>(`input[aria-label="${name}"]`).getAttribute("inputmode")).toBe("numeric");
    }
  });

  it("die Marken sagen sichtbar, was angenommen oder korrigiert ist — ohne Tooltip und ohne Befundkürzel", async () => {
    await mount(<App><Unterkunftsrechner /></App>);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Annahme: 2 je Person");
    expect(text).toContain("korrigiert: 1 je 15 Männer");
    expect(text).toContain("korrigiert: nach Sitzplätzen");
    expect(document.querySelector('[title*="Befund"]')).toBeNull();
  });
});
