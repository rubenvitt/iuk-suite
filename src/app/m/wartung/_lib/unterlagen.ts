/**
 * DIE DATEIEN DER UNTERLAGEN AM GERÄT (IDA-300) — abgelegt unter `DATA_DIR/wartung/unterlagen/<id>.<pdf|jpg>`.
 *
 * Angenommen werden PDF und Bilder. Ein PDF wird an seinen ersten Bytes erkannt (`%PDF-`), nie am Dateinamen oder
 * am Typ, den der Browser mitschickt; ein Bild wird wie das Mangelfoto (`fotos.ts`) von `sharp` neu geschrieben,
 * gespeichert wird nur dieses JPEG ohne Metadaten. Ein Pfad entsteht nur aus einer geprüften UUID.
 *
 * `DATA_DIR` wird bei jedem Aufruf gelesen, nicht beim Import (Tests setzen es um). Nur serverseitig.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Grenze je Datei. Unter den 10 MB, die `src/proxy.ts` von einem Anfragekörper puffert (`proxyClientMaxBodySize`,
 * Next.js 16): darüber käme der Körper still abgeschnitten an. Größere Handbücher bräuchten Stücke wie im Modul
 * Dateien.
 */
export const UNTERLAGE_MAX_BYTES = 9 * 1024 * 1024;
/** Längste Kante eines gespeicherten Bilds — größer als beim Mangelfoto, damit Schrift auf einem Aushang lesbar bleibt. */
const KANTE = 2400;
const MAX_PIXEL = 60_000_000;
const ID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type UnterlagenTyp = "pdf" | "bild";

function wurzel(): string {
  return resolve(process.env.DATA_DIR ?? "./.data", "wartung", "unterlagen");
}

export function unterlagePfad(id: string, typ: UnterlagenTyp): string {
  if (!ID_MUSTER.test(id)) throw new Error(`[wartung][unterlagen] id "${id}" kann kein Pfad werden`);
  return join(wurzel(), `${id}.${typ === "pdf" ? "pdf" : "jpg"}`);
}

export function istPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength > 5 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}

/** Was abgelegt wird, oder `null`: weder PDF noch lesbares Bild (oder zu groß). */
export async function pruefeUnterlage(bytes: Uint8Array): Promise<{ typ: UnterlagenTyp; inhalt: Buffer } | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > UNTERLAGE_MAX_BYTES) return null;
  if (istPdf(bytes)) return { typ: "pdf", inhalt: Buffer.from(bytes) };
  const { default: sharp } = await import("sharp");
  try {
    const inhalt = await sharp(bytes, { limitInputPixels: MAX_PIXEL, failOn: "error" })
      .rotate()
      .resize(KANTE, KANTE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { typ: "bild", inhalt };
  } catch {
    return null;
  }
}

/** Erst eine Zwischendatei, dann umbenennen: eine halb geschriebene Datei gibt es nie. */
export async function legeUnterlageAb(id: string, typ: UnterlagenTyp, inhalt: Buffer): Promise<void> {
  const ziel = unterlagePfad(id, typ);
  await mkdir(wurzel(), { recursive: true });
  const zwischen = `${ziel}.${process.pid}.tmp`;
  await writeFile(zwischen, inhalt);
  await rename(zwischen, ziel);
}

export async function leseUnterlage(id: string, typ: UnterlagenTyp): Promise<Buffer | null> {
  try {
    return await readFile(unterlagePfad(id, typ));
  } catch (fehler) {
    if ((fehler as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw fehler;
  }
}

/** Eine fehlende Datei ist kein Fehler. */
export async function entferneUnterlage(id: string, typ: UnterlagenTyp): Promise<void> {
  await rm(unterlagePfad(id, typ), { force: true });
}

/** Der Name, unter dem der Browser die Datei speichert — aus dem Titel, ohne Zeichen, die ein Dateisystem stören. */
export function dateiname(titel: string, typ: UnterlagenTyp): string {
  const stamm = titel.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "Unterlage";
  return `${stamm}.${typ === "pdf" ? "pdf" : "jpg"}`;
}

/** `Content-Disposition` mit UTF-8-Namen (RFC 6266/5987) und einem ASCII-Ersatz. */
export function anzeigeKopf(titel: string, typ: UnterlagenTyp): string {
  const name = dateiname(titel, typ);
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "Unterlage";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
