import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";
import { ANLAESSE, anlassAm, hintergrundAm, HINTERGRUND_STANDARD, ostersonntag } from "./hintergrund";

afterEach(() => {
  setzeAktiveZeitzone(STANDARD_ZEITZONE);
});

/** Mittag UTC — weit weg von jeder Tagesgrenze in Europe/Berlin. */
const mittag = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("ostersonntag", () => {
  // Bekannte Daten, darunter die Ränder: frühestmöglich 22.3., spätestmöglich 25.4.
  it.each([
    [2024, [3, 31]],
    [2025, [4, 20]],
    [2026, [4, 5]],
    [2027, [3, 28]],
    [2038, [4, 25]],
    [2285, [3, 22]],
  ])("%i → %j", (jahr, erwartet) => {
    expect(ostersonntag(jahr)).toEqual(erwartet);
  });
});

describe("anlassAm", () => {
  it.each([
    // Ostern 2026 ist der 5.4.: Fenster 22.3.–12.4.
    ["2026-03-21", null],
    ["2026-03-22", "ostern"],
    ["2026-04-05", "ostern"],
    ["2026-04-12", "ostern"],
    ["2026-04-13", null],
    // Ostern 2027 ist der 28.3.: das Fenster wandert mit (14.3.–4.4.).
    ["2027-03-13", null],
    ["2027-03-14", "ostern"],
    ["2027-04-04", "ostern"],
    ["2027-04-05", null],
    ["2026-10-16", null],
    ["2026-10-17", "halloween"],
    ["2026-10-31", "halloween"],
    ["2026-11-03", "halloween"],
    ["2026-11-04", null],
    ["2026-11-24", null],
    ["2026-11-25", "weihnachten"],
    ["2026-12-24", "weihnachten"],
    ["2026-12-31", "weihnachten"],
    // Über den Jahreswechsel: das Fenster begann im Vorjahr.
    ["2027-01-01", "weihnachten"],
    ["2027-01-06", "weihnachten"],
    ["2027-01-07", null],
    ["2027-07-15", null],
  ])("%s → %s", (tag, erwartet) => {
    expect(anlassAm(mittag(tag))).toBe(erwartet);
  });

  // 22:30 UTC am 16.10. ist in Berlin schon der 17.10. (Sommerzeit, +2 h). Die
  // Grenze zählt nach der Uhr an der Wand der Suite, nicht nach der des Servers.
  it("rechnet den Kalendertag in der Suite-Zone", () => {
    const kurzVorMitternachtUtc = new Date("2026-10-16T22:30:00Z");
    expect(anlassAm(kurzVorMitternachtUtc)).toBe("halloween");
    setzeAktiveZeitzone("UTC");
    expect(anlassAm(kurzVorMitternachtUtc)).toBeNull();
  });
});

describe("hintergrundAm", () => {
  it("außerhalb eines Anlasses: Tag im Hellen, Nacht im Dunkeln", () => {
    expect(hintergrundAm(mittag("2026-09-27"))).toEqual(HINTERGRUND_STANDARD);
    expect(HINTERGRUND_STANDARD.hell).not.toBe(HINTERGRUND_STANDARD.dunkel);
  });

  it("zu einem Anlass: dasselbe Bild in beiden Modi", () => {
    expect(hintergrundAm(mittag("2026-12-24"))).toEqual({
      hell: "/login/weihnachten.jpg",
      dunkel: "/login/weihnachten.jpg",
    });
  });

  // Ein falscher Pfad fiele nirgends auf: CSS lädt ein fehlendes Hintergrundbild
  // still nicht, und die Bildfläche bliebe einfach dunkelgrau.
  it("jedes Bild liegt unter public/login/", () => {
    const bilder = [HINTERGRUND_STANDARD.hell, HINTERGRUND_STANDARD.dunkel, ...ANLAESSE.map((a) => a.bild)];
    for (const bild of bilder) {
      expect(bild).toMatch(/^\/login\//);
      expect(existsSync(join(process.cwd(), "public", bild)), bild).toBe(true);
    }
  });
});
