/**
 * DIE FOTOS EINER MÄNGELMELDUNG (IDA-298) — neu gerechnet, dann abgelegt unter
 * `DATA_DIR/lagerbuch/maengel/<id>-<n>.jpg`.
 *
 * ⚠️ GESPEICHERT WIRD NIE DER UPLOAD, NUR DAS NEU GERECHNETE BILD. `sharp` dekodiert die Pixel, dreht
 * nach der EXIF-Lage, verkleinert auf höchstens `KANTE` Pixel und schreibt ein frisches JPEG ohne
 * Metadaten — Standort, Gerät und Aufnahmezeit des Telefons sind danach weg. Was kein Bild ist, scheitert
 * beim Dekodieren. Darum braucht es hier keinen Virenscan wie bei `files` und `aufgaben`: ausgeliefert
 * werden nur Bytes, die `sharp` selbst geschrieben hat.
 *
 * Ein Pfad entsteht nur aus einer geprüften `id` (nanoid(21)) und einer Zahl — dieselbe Regel wie
 * `aufgaben/_lib/ablage.ts`. Ein Dateiname aus dem Upload wird nie gelesen.
 *
 * `DATA_DIR` wird bei jedem Aufruf gelesen, nicht beim Import (Tests setzen es um).
 *
 * Kein `"use client"`; nur serverseitig (Route und Verwaltung), `sharp` ist ein natives Paket.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Höchstens so viele Bilder je Meldung. */
export const MAX_FOTOS = 3;
/** Grenze je Bild VOR dem Neurechnen. Das Telefon verkleinert vorher; das hier fängt den Rest ab. */
export const FOTO_MAX_BYTES = 12 * 1024 * 1024;
/** Längste Kante des gespeicherten Bilds. Reicht, um einen Riss oder ein Typenschild zu lesen. */
export const KANTE = 1600;
/** Schutz gegen ein Bild mit absurd vielen Pixeln (Dekomprimierungsbombe). */
const MAX_PIXEL = 40_000_000;

const ID_MUSTER = /^[A-Za-z0-9_-]{21}$/;

function wurzel(): string {
  return resolve(process.env.DATA_DIR ?? "./.data", "lagerbuch", "maengel");
}

export function fotoPfad(id: string, nummer: number): string {
  if (!ID_MUSTER.test(id)) throw new Error(`[lagerbuch][maengel] id "${id}" kann kein Pfad werden`);
  if (!Number.isInteger(nummer) || nummer < 0 || nummer >= MAX_FOTOS) {
    throw new Error(`[lagerbuch][maengel] Fotonummer ${nummer} liegt außerhalb 0..${MAX_FOTOS - 1}`);
  }
  return join(wurzel(), `${id}-${nummer}.jpg`);
}

/** `null`: kein lesbares Bild (oder zu groß) — die Meldung sagt dann „Das Foto ließ sich nicht lesen". */
export async function rechneFotoNeu(bytes: Uint8Array): Promise<Buffer | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > FOTO_MAX_BYTES) return null;
  const { default: sharp } = await import("sharp");
  try {
    return await sharp(bytes, { limitInputPixels: MAX_PIXEL, failOn: "error" })
      .rotate()
      .resize(KANTE, KANTE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Schreibt erst eine Zwischendatei und benennt sie dann um: ein halb geschriebenes Bild gibt es nie. */
export async function legeFotoAb(id: string, nummer: number, jpeg: Buffer): Promise<void> {
  const ziel = fotoPfad(id, nummer);
  await mkdir(wurzel(), { recursive: true });
  const zwischen = `${ziel}.${process.pid}.tmp`;
  await writeFile(zwischen, jpeg);
  await rename(zwischen, ziel);
}

/** `null`: Datei fehlt (z. B. Daten ohne Bilder zurückgespielt). */
export async function leseFoto(id: string, nummer: number): Promise<Buffer | null> {
  try {
    return await readFile(fotoPfad(id, nummer));
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw fehler;
  }
}
