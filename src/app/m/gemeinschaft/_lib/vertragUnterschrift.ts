import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { indenKasten } from "./dokumentPdf";
import { sichererName, VERTRAG_MAX_BYTES } from "./vermietungPdf";

/**
 * Unterschriften und hochgeladene Fassungen der Vermietungsdokumente (IDA-343), Serverseite: prüfen, Foto zu PDF.
 * Einsetzen in die Vorlage: `dokumentPdf.ts`.
 *
 * Die gezeichnete Unterschrift kommt als PNG aus dem Browser und wird NICHT geglaubt: Magic Bytes, Größe, Pixel, und
 * `embedPng` muss sie dekodieren.
 */

const PNG_KOPF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_KOPF = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_KOPF = Buffer.from("%PDF-", "ascii");
/** Eine Fingerunterschrift auf einer 2×-Leinwand liegt bei 10–60 KB; mehr ist keine Unterschrift. */
export const UNTERSCHRIFT_MAX_BYTES = 400_000;
const A4 = { b: 595.28, h: 841.89 } as const;

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const beginntMit = (bytes: Buffer, kopf: Buffer) => bytes.length >= kopf.length && bytes.subarray(0, kopf.length).equals(kopf);

/**
 * Pixel laut IHDR. pdf-lib dekodiert ein PNG ganz im Speicher: ein kleines, stark komprimiertes Bild
 * mit riesigen Maßen sprengt sonst den gemeinsamen Next-Prozess. JPEG bettet pdf-lib ohne Dekodieren ein.
 */
function pngPixel(bytes: Buffer): number | "animiert" {
  // Der Decoder nimmt den LETZTEN IHDR: genau einer, und zwar als erster Chunk, sonst abgelehnt. Kein APNG.
  let px = Infinity, ihdr = 0;
  for (let o = 8; o + 8 <= bytes.length;) {
    const laenge = bytes.readUInt32BE(o);
    const typ = bytes.toString("latin1", o + 4, o + 8);
    if (o + 12 + laenge > bytes.length) return Infinity;
    if (typ === "IHDR") {
      if (o !== 8 || laenge !== 13 || ++ihdr > 1) return Infinity;
      px = bytes.readUInt32BE(o + 8) * bytes.readUInt32BE(o + 12);
    }
    // APNG: der Decoder baut jeden Frame in voller Größe auf, viele Frames = vielfacher Speicher.
    if (typ === "acTL" || typ === "fcTL" || typ === "fdAT") return "animiert";
    if (typ === "IEND") break;
    o += 12 + laenge;
  }
  return ihdr === 1 ? px : Infinity;
}
const UNTERSCHRIFT_MAX_PIXEL = 4_000_000;
const FOTO_MAX_PIXEL = 40_000_000;
const pngPasst = (bytes: Buffer, max: number) => { const px = pngPixel(bytes); return px !== "animiert" && px > 0 && px <= max; };

/** `data:image/png;base64,…` → PNG-Bytes, oder `null`, wenn es keine plausible Unterschrift ist. */
export function unterschriftAusDataUrl(roh: unknown): Buffer | null {
  if (typeof roh !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(roh);
  if (!m || m[1].length > Math.ceil(UNTERSCHRIFT_MAX_BYTES / 3) * 4) return null;
  const bytes = Buffer.from(m[1], "base64");
  return bytes.length > 60 && bytes.length <= UNTERSCHRIFT_MAX_BYTES && beginntMit(bytes, PNG_KOPF) && pngPasst(bytes, UNTERSCHRIFT_MAX_PIXEL) ? bytes : null;
}

export type DateiPruefung = { ok: true; name: string; art: "pdf" | "jpg" | "png" } | { ok: false; fehler: string; status: 400 | 413 | 415 };

/** Ein hochgeladener, unterschriebener Vertrag: PDF oder Foto (JPEG/PNG), nach Magic Bytes, nicht nach Endung. */
export function pruefeUnterschriebeneDatei(name: string, bytes: Buffer): DateiPruefung {
  if (bytes.length === 0) return { ok: false, fehler: "Die Datei ist leer.", status: 400 };
  if (bytes.length > VERTRAG_MAX_BYTES) return { ok: false, fehler: "Die Datei ist größer als 10 MB.", status: 413 };
  const art = beginntMit(bytes, PDF_KOPF) ? "pdf" : beginntMit(bytes, JPG_KOPF) ? "jpg" : beginntMit(bytes, PNG_KOPF) ? "png" : null;
  if (!art) return { ok: false, fehler: "Bitte eine PDF oder ein Foto (JPG, PNG) wählen.", status: 415 };
  if (art === "png" && pngPixel(bytes) === "animiert") return { ok: false, fehler: "Animierte Bilder gehen nicht. Bitte ein Foto als JPG oder PNG wählen.", status: 415 };
  if (art === "png" && !pngPasst(bytes, FOTO_MAX_PIXEL)) return { ok: false, fehler: "Dieses Foto ist zu groß. Bitte als JPG speichern oder verkleinern.", status: 413 };
  return { ok: true, name: sichererName(name.replace(/\.(jpe?g|png)$/i, "")), art };
}

/** Ein Foto als einseitige A4-PDF, damit beim Eintrag immer eine PDF liegt. Wirft, wenn das Bild nicht dekodiert. */
export async function fotoAlsPdf(bytes: Buffer, art: "jpg" | "png", titel: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(titel);
  const bild = art === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const quer = bild.width > bild.height;
  const p = doc.addPage(quer ? [A4.h, A4.b] : [A4.b, A4.h]);
  const { width, height } = p.getSize();
  p.drawImage(bild, indenKasten(bild, { x: 20, y: 20, b: width - 40, h: height - 40 }));
  return doc.save();
}
