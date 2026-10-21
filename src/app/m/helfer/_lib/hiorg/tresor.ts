/**
 * Verschlüsselung des HiOrg-Refresh-Tokens in der Datenbank: AES-256-GCM mit `HELFER_SCHLUESSEL`
 * (32 Byte, Base64). Ein Refresh-Token öffnet das ganze Personal der Gliederung; eine kopierte
 * `helfer.db` (Sicherung, Wegwerf-Kopie einer Generalprobe) soll ohne den Schlüssel aus der
 * Umgebung nichts davon preisgeben. Format: `v1:<iv base64>:<ct+tag base64>`, AAD
 * `helfer/v1/hiorg-refresh`.
 *
 * Fehlt der Schlüssel, lässt sich nicht verbinden (`konfiguration.ts`); die Demo braucht ihn nicht.
 * Eigene Fassung statt Import aus dem Einsatzbuch: kein modulübergreifender Import.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const SCHLUESSEL_VARIABLE = "HELFER_SCHLUESSEL";
const AAD = Buffer.from("helfer/v1/hiorg-refresh");

export type Schluessel = { status: "ok"; schluessel: Buffer } | { status: "fehlt" } | { status: "ungueltig" };

/** Frisch aus der Umgebung, nie auf Modulebene zwischengespeichert (Tests setzen ihn um). */
export function schluesselAusUmgebung(env: Record<string, string | undefined> = process.env): Schluessel {
  const roh = env[SCHLUESSEL_VARIABLE]?.trim();
  if (!roh) return { status: "fehlt" };
  const schluessel = Buffer.from(roh, "base64");
  return schluessel.length === 32 && schluessel.toString("base64") === roh.replace(/\s/g, "")
    ? { status: "ok", schluessel }
    : { status: "ungueltig" };
}

export function verschluessele(klartext: string, schluessel: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", schluessel, iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(klartext, "utf8"), c.final(), c.getAuthTag()]);
  return `v1:${iv.toString("base64")}:${ct.toString("base64")}`;
}

/** `null`, wenn das Format nicht stimmt oder der Schlüssel ein anderer ist (GCM-Tag passt nicht). */
export function entschluessele(geheim: string, schluessel: Buffer): string | null {
  const teile = geheim.split(":");
  if (teile.length !== 3 || teile[0] !== "v1") return null;
  try {
    const iv = Buffer.from(teile[1], "base64");
    const alles = Buffer.from(teile[2], "base64");
    if (iv.length !== 12 || alles.length < 17) return null;
    const d = createDecipheriv("aes-256-gcm", schluessel, iv);
    d.setAAD(AAD);
    d.setAuthTag(alles.subarray(alles.length - 16));
    return Buffer.concat([d.update(alles.subarray(0, alles.length - 16)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
