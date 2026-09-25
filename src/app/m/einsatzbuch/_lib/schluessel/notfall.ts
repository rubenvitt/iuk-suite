/**
 * Notfall-Sicherung des privaten Schlüssels (Spec §12): PKCS#8,
 * kennwortgeschützt mit PBKDF2-SHA-256 600 000 Runden + AES-256-GCM, als Datei UND als
 * QR zum Ausdrucken. Anders als beim Export (`kern/export.ts`) ist der Kopf hier klein
 * genug, um mitsamt der verschlüsselten Nutzlast in einen einzigen QR-Code zu passen.
 */
import { qrSvg } from "@/core/qr";
import { ausBase64, mitLaenge, sha256Hex, utf8, zuBase64, zufall, type Bytes } from "../kern/bytes";
import { KennwortFalsch } from "../kern/export";
import { hatGenauSchluessel, istObjekt } from "../kern/format";
import { kanonisch } from "../kern/kanonisch";

export const NOTFALL_KENNWORT_MINDESTLAENGE = 16;
const ITERATIONEN = 600_000;

export interface Notfallkopf {
  schluesselId: string;
  oeffentlich: string;
  erstellt: string;
}

export interface Notfalldatei {
  format: "einsatzbuch-notfall";
  version: 1;
  kopf: Notfallkopf;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterationen: 600000; salt: string };
  chiffre: { name: "AES-GCM"; laenge: 256; iv: string };
  daten: string;
}

async function schluessel(kennwort: string, salt: Bytes): Promise<CryptoKey> {
  const basis = await crypto.subtle.importKey("raw", utf8(kennwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONEN },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

/** Wie der Export des Kerns (`kern/export.ts`), nur für den privaten Schlüssel; der Kopf ist AAD. */
export async function erzeugeNotfalldatei(pkcs8: Bytes, kopf: Notfallkopf, kennwort: string): Promise<Notfalldatei> {
  if (kennwort.length < NOTFALL_KENNWORT_MINDESTLAENGE) {
    throw new Error(`Das Notfall-Kennwort braucht mindestens ${NOTFALL_KENNWORT_MINDESTLAENGE} Zeichen`);
  }
  const salt = zufall(16);
  const iv = zufall(12);
  const daten = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, await schluessel(kennwort, salt), pkcs8),
  );
  return {
    format: "einsatzbuch-notfall",
    version: 1,
    kopf,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterationen: ITERATIONEN, salt: zuBase64(salt) },
    chiffre: { name: "AES-GCM", laenge: 256, iv: zuBase64(iv) },
    daten: zuBase64(daten),
  };
}

export function istNotfalldatei(x: unknown): x is Notfalldatei {
  if (!istObjekt(x) || !hatGenauSchluessel(x, ["format", "version", "kopf", "kdf", "chiffre", "daten"])) return false;
  const { kopf, kdf, chiffre } = x;
  return (
    x.format === "einsatzbuch-notfall" &&
    x.version === 1 &&
    typeof x.daten === "string" &&
    istObjekt(kopf) &&
    hatGenauSchluessel(kopf, ["schluesselId", "oeffentlich", "erstellt"]) &&
    typeof kopf.schluesselId === "string" &&
    typeof kopf.oeffentlich === "string" &&
    typeof kopf.erstellt === "string" &&
    istObjekt(kdf) &&
    hatGenauSchluessel(kdf, ["name", "hash", "iterationen", "salt"]) &&
    kdf.name === "PBKDF2" &&
    kdf.hash === "SHA-256" &&
    kdf.iterationen === ITERATIONEN &&
    typeof kdf.salt === "string" &&
    istObjekt(chiffre) &&
    hatGenauSchluessel(chiffre, ["name", "laenge", "iv"]) &&
    chiffre.name === "AES-GCM" &&
    chiffre.laenge === 256 &&
    typeof chiffre.iv === "string"
  );
}

/**
 * Entschlüsselt die Notfall-Sicherung und prüft, dass der so gewonnene private Schlüssel
 * tatsächlich zum öffentlichen Schlüssel im (ungeschützten) Kopf gehört — ohne diese Prüfung
 * ließe sich ein Kopf unbemerkt gegen einen anderen austauschen, da er nur als AAD einfließt
 * (AAD sichert Unversehrtheit, nicht Zugehörigkeit zu einem bestimmten Schlüssel).
 */
export async function oeffneNotfalldatei(d: Notfalldatei, kennwort: string): Promise<Bytes> {
  if (!istNotfalldatei(d)) throw new Error("Keine Notfall-Sicherung des Einsatzbuchs");
  const salt = mitLaenge(ausBase64(d.kdf.salt), 16, "salt");
  const iv = mitLaenge(ausBase64(d.chiffre.iv), 12, "iv");
  let pkcs8: Bytes;
  try {
    pkcs8 = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(d.kopf)) }, await schluessel(kennwort, salt), ausBase64(d.daten)),
    );
  } catch {
    throw new KennwortFalsch();
  }
  const privat = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const jwk = await crypto.subtle.exportKey("jwk", privat);
  const oeff = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", oeff));
  if (zuBase64(spki) !== d.kopf.oeffentlich || (await sha256Hex(spki)).slice(0, 16) !== d.kopf.schluesselId) {
    throw new Error("Der private Schlüssel passt nicht zum öffentlichen Schlüssel der Sicherung");
  }
  return pkcs8;
}

export const notfallText = (d: Notfalldatei): string => kanonisch(d);

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Eine Seite zum Ausdrucken: QR mit der vollständigen Sicherung, Kennung, Datum, Anleitung. Kein Kennwort. */
export async function notfallDruckseite(d: Notfalldatei): Promise<string> {
  const svg = await qrSvg(notfallText(d));
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Einsatzbuch — Notfall-Sicherung ${esc(d.kopf.schluesselId)}</title>
<style>@page{size:210mm 297mm;margin:16mm}body{font-family:system-ui,sans-serif;color:#1a1d20}svg{width:120mm;height:120mm}pre{white-space:pre-wrap;word-break:break-all;font-size:8pt}</style>
<h1>Einsatzbuch — Notfall-Sicherung des Schlüssels</h1>
<p>Schlüssel-Kennung <strong>${esc(d.kopf.schluesselId)}</strong>, erstellt ${esc(d.kopf.erstellt)}.</p>
<p>Der QR-Code enthält die vollständige, mit dem Notfall-Kennwort verschlüsselte Sicherung. Das Kennwort steht NICHT auf diesem Blatt. Wiederherstellen: QR-Inhalt als Datei speichern und <code>pnpm einsatzbuch:schluessel wiederherstellen &lt;datei&gt;</code> (Runbook „einsatzbuch-schluessel").</p>
${svg}
<pre>${esc(notfallText(d))}</pre>
</html>`;
}
