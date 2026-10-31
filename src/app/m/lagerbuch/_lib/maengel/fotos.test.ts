import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fotoPfad, KANTE, legeFotoAb, leseFoto, rechneFotoNeu } from "./fotos";

const ID = "abcdefghijklmnopqrstu";

let ordner: string;
let vorher: string | undefined;
beforeEach(() => {
  vorher = process.env.DATA_DIR;
  ordner = mkdtempSync(join(tmpdir(), "maengel-"));
  process.env.DATA_DIR = ordner;
});
afterEach(() => {
  if (vorher === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = vorher;
  rmSync(ordner, { recursive: true, force: true });
});

async function bild(breite: number, hoehe: number, mitExif = false): Promise<Buffer> {
  const roh = sharp({ create: { width: breite, height: hoehe, channels: 3, background: "#c8000f" } }).jpeg();
  return mitExif
    ? roh.withExif({ IFD0: { Make: "Telefon", Copyright: "Geheim" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 30/1 0/1" } }).toBuffer()
    : roh.toBuffer();
}

describe("Fotos einer Mängelmeldung", () => {
  it("verkleinert auf die längste Kante und entfernt die Metadaten", async () => {
    const neu = await rechneFotoNeu(await bild(4000, 3000, true));
    expect(neu).not.toBeNull();
    const meta = await sharp(neu!).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(KANTE);
    expect(meta.exif).toBeUndefined();
  });

  it("vergrößert kleine Bilder nicht", async () => {
    const neu = await rechneFotoNeu(await bild(300, 200));
    const meta = await sharp(neu!).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  it("lehnt ab, was kein Bild ist", async () => {
    expect(await rechneFotoNeu(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(await rechneFotoNeu(new Uint8Array())).toBeNull();
  });

  it("legt ab und liest zurück; eine fehlende Datei ist null", async () => {
    const jpeg = (await rechneFotoNeu(await bild(50, 50)))!;
    await legeFotoAb(ID, 1, jpeg);
    expect((await leseFoto(ID, 1))?.equals(jpeg)).toBe(true);
    expect(await leseFoto(ID, 0)).toBeNull();
  });

  it("baut keinen Pfad aus einer fremden ID oder Nummer", () => {
    expect(() => fotoPfad("../../etc/passwd", 0)).toThrow();
    expect(() => fotoPfad(ID, 3)).toThrow();
    expect(() => fotoPfad(ID, -1)).toThrow();
    expect(fotoPfad(ID, 2)).toBe(join(ordner, "lagerbuch", "maengel", `${ID}-2.jpg`));
  });
});
