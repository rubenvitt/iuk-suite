import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { winAnsi } from "@/core/pdf/winAnsi";
import type { Feld, Seitenmass } from "./vertragFeld";
import { eingangText } from "./vermietungText";
import { sichererName, VERTRAG_MAX_BYTES } from "./vermietungPdf";

/**
 * Der digitale Mietvertrag (IDA-343), Serverseite: Vorlage lesen, Unterschrift einsetzen, Foto zu PDF machen.
 *
 * Die gezeichnete Unterschrift kommt als PNG aus dem Browser und wird NICHT geglaubt: Magic Bytes, Größe, und
 * `embedPng` muss sie dekodieren. Text aus Eingabefeldern läuft durch `winAnsi()` (sonst wirft `pdf-lib` erst beim
 * Zeichnen). Ohne Unterschriftenfeld der Vorlage kommt die Unterschrift auf eine eigene letzte Seite.
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
function pngPixel(bytes: Buffer): number {
  // Der Decoder nimmt den LETZTEN IHDR: genau einer, und zwar als erster Chunk, sonst abgelehnt.
  let px = Infinity, ihdr = 0;
  for (let o = 8; o + 8 <= bytes.length;) {
    const laenge = bytes.readUInt32BE(o);
    const typ = bytes.toString("latin1", o + 4, o + 8);
    if (o + 12 + laenge > bytes.length) return Infinity;
    if (typ === "IHDR") {
      if (o !== 8 || laenge !== 13 || ++ihdr > 1) return Infinity;
      px = bytes.readUInt32BE(o + 8) * bytes.readUInt32BE(o + 12);
    }
    if (typ === "IEND") break;
    o += 12 + laenge;
  }
  return ihdr === 1 ? px : Infinity;
}
const UNTERSCHRIFT_MAX_PIXEL = 4_000_000;
const FOTO_MAX_PIXEL = 40_000_000;
const pngPasst = (bytes: Buffer, max: number) => { const px = pngPixel(bytes); return px > 0 && px <= max; };

export type VorlagePruefung = { ok: true; seiten: Seitenmass[] } | { ok: false; fehler: string };

/** Lässt sich die PDF weiterverarbeiten? Verschlüsselte oder kaputte Dateien taugen nicht als Vorlage. */
export async function leseVorlage(bytes: Uint8Array): Promise<VorlagePruefung> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const seiten = doc.getPages().map((p) => { const { width, height } = p.getSize(); return { b: width, h: height }; });
    if (seiten.length === 0) return { ok: false, fehler: "Die PDF hat keine Seiten." };
    return { ok: true, seiten };
  } catch {
    return { ok: false, fehler: "Diese PDF lässt sich nicht verarbeiten (geschützt oder beschädigt). Bitte ohne Passwort neu speichern." };
  }
}

/** `data:image/png;base64,…` → PNG-Bytes, oder `null`, wenn es keine plausible Unterschrift ist. */
export function unterschriftAusDataUrl(roh: unknown): Buffer | null {
  if (typeof roh !== "string") return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(roh);
  if (!m || m[1].length > Math.ceil(UNTERSCHRIFT_MAX_BYTES / 3) * 4) return null;
  const bytes = Buffer.from(m[1], "base64");
  return bytes.length > 60 && bytes.length <= UNTERSCHRIFT_MAX_BYTES && beginntMit(bytes, PNG_KOPF) && pngPasst(bytes, UNTERSCHRIFT_MAX_PIXEL) ? bytes : null;
}

export type Angaben = { name: string; am: number; zeitraum: string; anlass: string };

function zeileUnterFeld(seite: PDFPage, text: string, x: number, y: number, breite: number, schrift: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  let grad = 7;
  while (grad > 4 && schrift.widthOfTextAtSize(text, grad) > breite) grad -= 0.5;
  seite.drawText(text, { x, y, size: grad, font: schrift, color: rgb(0.25, 0.25, 0.25) });
}

/** Bild so groß wie möglich in den Kasten, Seitenverhältnis bleibt, zentriert. */
function indenKasten(bild: PDFImage, k: { x: number; y: number; b: number; h: number }) {
  const s = Math.min(k.b / bild.width, k.h / bild.height);
  const b = bild.width * s, h = bild.height * s;
  return { x: k.x + (k.b - b) / 2, y: k.y + (k.h - h) / 2, width: b, height: h };
}

/** Die Vorlage mit eingesetzter Unterschrift. Wirft nur bei einer Vorlage, die `leseVorlage` schon abgelehnt hätte. */
export async function unterschriebenePdf(vorlage: Uint8Array, feld: Feld | null, png: Buffer, a: Angaben): Promise<Uint8Array> {
  const doc = await PDFDocument.load(vorlage, { updateMetadata: false });
  const bild = await doc.embedPng(png);
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const name = winAnsi(a.name);
  const wann = winAnsi(eingangText(a.am));
  const seite = feld ? doc.getPage(Math.min(feld.seite, doc.getPageCount() - 1)) : null;
  if (feld && seite) {
    seite.drawImage(bild, indenKasten(bild, feld));
    zeileUnterFeld(seite, `${name} · ${wann} · digital unterschrieben`, feld.x, Math.max(2, feld.y - 8), Math.max(feld.b, 160), schrift);
  } else {
    const p = doc.addPage([A4.b, A4.h]);
    let y = A4.h - 90;
    p.drawText("Unterschrift zum Mietvertrag", { x: 60, y, size: 16, font: fett });
    y -= 36;
    for (const [k, v] of [["Mietsache", "Bar"], ["Zeitraum", a.zeitraum], ["Anlass", a.anlass], ["Name", a.name], ["Unterschrieben", eingangText(a.am)]] as const) {
      p.drawText(winAnsi(k), { x: 60, y, size: 10, font: fett });
      p.drawText(winAnsi(v).slice(0, 90), { x: 170, y, size: 10, font: schrift });
      y -= 18;
    }
    const kasten = { x: 60, y: y - 140, b: 300, h: 110 };
    p.drawImage(bild, indenKasten(bild, kasten));
    p.drawLine({ start: { x: kasten.x, y: kasten.y - 4 }, end: { x: kasten.x + kasten.b, y: kasten.y - 4 }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    zeileUnterFeld(p, `${name} · ${wann} · digital unterschrieben`, kasten.x, kasten.y - 16, kasten.b, schrift);
  }
  doc.setModificationDate(new Date(a.am));
  return doc.save();
}

export type DateiPruefung = { ok: true; name: string; art: "pdf" | "jpg" | "png" } | { ok: false; fehler: string; status: 400 | 413 | 415 };

/** Ein hochgeladener, unterschriebener Vertrag: PDF oder Foto (JPEG/PNG), nach Magic Bytes, nicht nach Endung. */
export function pruefeUnterschriebeneDatei(name: string, bytes: Buffer): DateiPruefung {
  if (bytes.length === 0) return { ok: false, fehler: "Die Datei ist leer.", status: 400 };
  if (bytes.length > VERTRAG_MAX_BYTES) return { ok: false, fehler: "Die Datei ist größer als 10 MB.", status: 413 };
  const art = beginntMit(bytes, PDF_KOPF) ? "pdf" : beginntMit(bytes, JPG_KOPF) ? "jpg" : beginntMit(bytes, PNG_KOPF) ? "png" : null;
  if (!art) return { ok: false, fehler: "Bitte eine PDF oder ein Foto (JPG, PNG) wählen.", status: 415 };
  if (art === "png" && !pngPasst(bytes, FOTO_MAX_PIXEL)) return { ok: false, fehler: "Dieses Foto ist zu groß. Bitte als JPG speichern oder verkleinern.", status: 413 };
  return { ok: true, name: sichererName(name.replace(/\.(jpe?g|png)$/i, "")), art };
}

/** Ein Foto als einseitige A4-PDF, damit beim Eintrag immer eine PDF liegt. Wirft, wenn das Bild nicht dekodiert. */
export async function fotoAlsPdf(bytes: Buffer, art: "jpg" | "png"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bild = art === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const quer = bild.width > bild.height;
  const p = doc.addPage(quer ? [A4.h, A4.b] : [A4.b, A4.h]);
  const { width, height } = p.getSize();
  p.drawImage(bild, indenKasten(bild, { x: 20, y: 20, b: width - 40, h: height - 40 }));
  return doc.save();
}
