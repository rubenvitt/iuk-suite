import { describe, it, expect } from "vitest";
import GENERAT from "./app-icon.generiert.json";
import { appIconSvg, rasterDateien } from "./app-icon";
import { FORMEN } from "./zeichen";
import { pruefsumme } from "./index";

const PNG_SIGNATUR = "89504e470d0a1a0a";
const NEU = "pnpm exec tsx scripts/app-icon-generat.ts";

/** Breite und Höhe aus dem IHDR-Block (Bytes 16–23). */
function masse(png: Buffer): [number, number] {
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe("App-Icon", () => {
  const generat = GENERAT as Record<string, { quelle: string; png: string }>;

  it("hat für jedes Zeichen jede PNG-Fassung und keine übrige", () => {
    expect(Object.keys(generat).sort()).toEqual(rasterDateien().map((r) => r.datei).sort());
  });

  it.each(rasterDateien())("$datei ist aus dem heutigen SVG erzeugt", ({ datei, name, zuschnitt }) => {
    expect(generat[datei].quelle, `${datei} ist veraltet — ${NEU}`).toBe(pruefsumme(appIconSvg(name, zuschnitt)));
  });

  it.each(rasterDateien())("$datei ist eine PNG in $kante×$kante", ({ datei, kante }) => {
    const png = Buffer.from(generat[datei].png, "base64");
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATUR);
    expect(masse(png)).toEqual([kante, kante]);
  });

  it("ist fest hell (ein eingebranntes Symbol schaltet nicht um) und ohne CSS-Variablen", () => {
    for (const name of Object.keys(FORMEN)) {
      const svg = appIconSvg(name);
      expect(svg).not.toContain("prefers-color-scheme");
      expect(svg).not.toContain("var(");
    }
  });

  it("füllt randlose Zuschnitte ganz (iOS füllt Durchsichtiges schwarz)", () => {
    expect(appIconSvg("qr", "apple")).toContain('<rect width="512" height="512" fill="#ffffff"/>');
    expect(appIconSvg("qr", "maskierbar")).toContain('<rect width="512" height="512" fill="#ffffff"/>');
    expect(appIconSvg("qr", "rund")).toContain('rx="112"');
  });

  it("hält das Zeichen der maskierbaren Fassung in der Schutzzone (Kreis mit 40 % Radius)", () => {
    // Das Zeichen sitzt mittig; seine Ecke (x|x) muss im Kreis um (256|256) liegen.
    const x = Number(appIconSvg("qr", "maskierbar").match(/<svg x="([\d.]+)"/)![1]);
    expect(Math.hypot(256 - x, 256 - x)).toBeLessThanOrEqual(0.4 * 512);
  });

  it("fällt bei einem unbekannten Namen auf das IDA-Zeichen zurück", () => {
    expect(appIconSvg("gibtsnicht")).toBe(appIconSvg("ida"));
  });
});
