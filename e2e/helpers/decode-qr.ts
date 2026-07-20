import sharp from "sharp";
import jsQR from "jsqr";

/**
 * Der Grund, warum die E2E ueberhaupt etwas wert sind: eine Zusicherung auf
 * `<svg>`-Vorhandensein wuerde auch dann gruen bleiben, wenn der Code den
 * falschen Inhalt traegt (fehlendes `tel:`-Praefix, JSON statt WIFI-String).
 * Erst das Zurueckdekodieren prueft, was ein Scanner im Einsatz wirklich liest.
 *
 * `ensureAlpha` ist dabei Pflicht: jsQR erwartet RGBA. Ohne Alpha-Kanal liest
 * es die Bytes um einen Kanal versetzt und sieht Rauschen.
 *
 * Dekodiert wird in der Aufloesung, die sharp liefert — bewusst OHNE ein festes
 * `resize` hinterher. Ein `resize(512, 512)` skalierte mit einem
 * nicht-ganzzahligen Faktor pro Modul (105 Module ergeben bei density 300
 * 437,5 px, macht 4,876 px/Modul) und verteilte die Module ungleichmaessig;
 * jsQR fand dann kein Raster mehr und meldete einen kaputten Code, obwohl das
 * Produkt einwandfrei war. Betroffen waren ganze Baender von QR-Groessen —
 * gemessen ueber 20..1273 Bytes in 20er-Schritten scheiterten 23 Laengen.
 * Ohne das resize ist die Rasterung der einzige Skalierungsschritt, und der
 * ist pro Modul gleichmaessig: dieselbe Messreihe geht vollstaendig durch.
 */
async function decodeRaster(input: Buffer, density?: number): Promise<string> {
  const { data, info } = await sharp(input, density ? { density } : undefined)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  if (!result) throw new Error("QR-Code konnte nicht dekodiert werden");
  return result.data;
}

/**
 * Liest einen QR-Code aus dem angezeigten SVG zurueck.
 *
 * `density` ist hier noetig, weil das SVG aus `qrcode` nur eine viewBox
 * mitbringt (45x45), keine Breite/Hoehe: sharp rastert es sonst in
 * Modulgroesse — ein Bitmap in Briefmarkengroesse, in dem jsQR nichts findet.
 */
export function decodeQr(svg: string): Promise<string> {
  return decodeRaster(Buffer.from(svg), 300);
}

/**
 * Liest einen QR-Code aus der heruntergeladenen PNG-Datei zurueck. Ohne diesen
 * Weg belegt die Suite nur, DASS eine Datei ankommt — nicht, dass sie denselben
 * Inhalt traegt wie der Code auf dem Bildschirm.
 *
 * Kein `density`: Ein PNG bringt seine Aufloesung selbst mit (1024x1024 aus
 * dem Canvas-Export).
 */
export function decodeQrPng(png: Buffer): Promise<string> {
  return decodeRaster(png);
}
