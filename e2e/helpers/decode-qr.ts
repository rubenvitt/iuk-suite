import sharp from "sharp";
import jsQR from "jsqr";

const SIZE = 512;

/**
 * Liest einen QR-Code aus dem angezeigten SVG zurueck.
 *
 * Der Grund, warum die E2E ueberhaupt etwas wert sind: eine Zusicherung auf
 * `<svg>`-Vorhandensein wuerde auch dann gruen bleiben, wenn der Code den
 * falschen Inhalt traegt (fehlendes `tel:`-Praefix, JSON statt WIFI-String).
 * Erst das Zurueckdekodieren prueft, was ein Scanner im Einsatz wirklich liest.
 *
 * Zwei Details, ohne die die Dekodierung fehlschlaegt:
 * - `density`: Das SVG aus `qrcode` bringt nur eine viewBox mit (45x45), keine
 *   Breite/Hoehe. sharp rastert es sonst in Modulgroesse und skaliert diesen
 *   Briefmarken-Bitmap hoch — die Kanten verwaschen und jsQR findet nichts.
 *   `kernel: "nearest"` haelt die Module beim Skalieren hart.
 * - `ensureAlpha`: jsQR erwartet RGBA. Ohne Alpha-Kanal liest es die Bytes um
 *   einen Kanal versetzt und sieht Rauschen.
 */
export async function decodeQr(svg: string): Promise<string> {
  const { data } = await sharp(Buffer.from(svg), { density: 300 })
    .resize(SIZE, SIZE, { kernel: "nearest", fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const result = jsQR(new Uint8ClampedArray(data), SIZE, SIZE);
  if (!result) throw new Error("QR-Code konnte nicht dekodiert werden");
  return result.data;
}
