/**
 * DAS FOTO EINES MANGELS (IDA-312) — neu gerechnet, dann abgelegt unter `DATA_DIR/wartung/maengel/<id>.jpg`.
 * Dasselbe Verfahren wie `lagerbuch/_lib/maengel/fotos.ts` (Modul-Interna sind kein API, deshalb hier eigen):
 * gespeichert wird nie der Upload, nur das von `sharp` neu geschriebene JPEG ohne Metadaten (Standort, Gerät und
 * Aufnahmezeit des Telefons sind danach weg). Ein Pfad entsteht nur aus einer geprüften UUID.
 *
 * `DATA_DIR` wird bei jedem Aufruf gelesen, nicht beim Import (Tests setzen es um). Nur serverseitig.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Grenze je Bild VOR dem Neurechnen; das Telefon verkleinert vorher. */
export const FOTO_MAX_BYTES = 12 * 1024 * 1024;
/** Längste Kante des gespeicherten Bilds. */
export const KANTE = 1600;
const MAX_PIXEL = 40_000_000;
const ID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function wurzel(): string {
  return resolve(process.env.DATA_DIR ?? "./.data", "wartung", "maengel");
}

export function fotoPfad(id: string): string {
  if (!ID_MUSTER.test(id)) throw new Error(`[wartung][maengel] id "${id}" kann kein Pfad werden`);
  return join(wurzel(), `${id}.jpg`);
}

/** `null`: kein lesbares Bild (oder zu groß). */
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

/** Erst eine Zwischendatei, dann umbenennen: ein halb geschriebenes Bild gibt es nie. */
export async function legeFotoAb(id: string, jpeg: Buffer): Promise<void> {
  const ziel = fotoPfad(id);
  await mkdir(wurzel(), { recursive: true });
  const zwischen = `${ziel}.${process.pid}.tmp`;
  await writeFile(zwischen, jpeg);
  await rename(zwischen, ziel);
}

export async function leseFoto(id: string): Promise<Buffer | null> {
  try {
    return await readFile(fotoPfad(id));
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw fehler;
  }
}
