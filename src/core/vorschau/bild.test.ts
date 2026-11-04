import { describe, expect, it } from "vitest";
import { vorschauBild } from "./bild";

describe("Vorschaubild", () => {
  it("zeichnet ein PNG je bekannter Marke", async () => {
    const png = await vorschauBild("vorschau-lagerbuch.png");
    expect(png).not.toBeNull();
    const kopf = new Uint8Array(png!).slice(0, 8);
    expect(Array.from(kopf)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }, 30_000);

  it("kennt keine fremden Namen", async () => {
    expect(await vorschauBild("vorschau-gibtsnicht.png")).toBeNull();
    expect(await vorschauBild("vorschau-../x.png")).toBeNull();
    expect(await vorschauBild("lagerbuch.svg")).toBeNull();
  });
});
