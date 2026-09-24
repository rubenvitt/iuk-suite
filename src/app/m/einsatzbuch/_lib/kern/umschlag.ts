import { ausBase64, mitLaenge, sha256Hex, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import type { Blockkopf, Umschlag } from "./format";
import { kanonisch } from "./kanonisch";

const KURVE = { name: "ECDH", namedCurve: "P-256" } as const;
const INFO = utf8("einsatzbuch/v1/umschlag");

/** Die ersten 16 Hex-Zeichen von SHA-256 über den öffentlichen Schlüssel (SPKI-DER). */
export async function schluesselIdVon(oeffentlich: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", oeffentlich));
  return (await sha256Hex(spki)).slice(0, 16);
}

export function importiereOeffentlich(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", ausBase64(spkiBase64), KURVE, true, []);
}

export function importierePrivat(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", ausBase64(pkcs8Base64), KURVE, false, ["deriveBits"]);
}

export function erzeugeSchluesselpaar(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(KURVE, true, ["deriveBits"]);
}

/** ECDH-ES: geteiltes Geheimnis → HKDF-SHA256 (Salt leer, Info fest) → AES-256-GCM-Schlüssel. */
async function kek(privat: CryptoKey, oeffentlich: CryptoKey): Promise<CryptoKey> {
  const geteilt = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: oeffentlich }, privat, 256));
  const basis = await crypto.subtle.importKey("raw", geteilt, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: INFO },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export interface Umschlagzufall { ephemer: CryptoKeyPair; iv: Bytes }

/** Packt den CEK eines Blocks für den öffentlichen Schlüssel der Suite ein. Der Kopf ist AAD. */
export async function packeEin(cek: Bytes, kopf: Blockkopf, suiteOeffentlich: CryptoKey, z?: Umschlagzufall): Promise<Umschlag> {
  const ephemer = z?.ephemer ?? (await erzeugeSchluesselpaar());
  const iv = mitLaenge(z?.iv ?? zufall(12), 12, "iv");
  const schluessel = await kek(ephemer.privateKey, suiteOeffentlich);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, schluessel, cek));
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemer.publicKey));
  return { epk: zuBase64(epk), iv: zuBase64(iv), ct: zuBase64(ct) };
}

/** Gegenstück in der Suite. Wirft, wenn Umschlag und Kopf nicht zusammengehören oder die Längen nicht stimmen. */
export async function packeAus(umschlag: Umschlag, kopf: Blockkopf, suitePrivat: CryptoKey): Promise<Bytes> {
  const epkBytes = mitLaenge(ausBase64(umschlag.epk), 65, "epk");
  if (epkBytes[0] !== 0x04) throw new Error("epk muss unkomprimiert sein");
  const iv = mitLaenge(ausBase64(umschlag.iv), 12, "iv");
  const ct = mitLaenge(ausBase64(umschlag.ct), 48, "ct");
  const epk = await crypto.subtle.importKey("raw", epkBytes, KURVE, false, []);
  const schluessel = await kek(suitePrivat, epk);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) },
    schluessel, ct,
  ));
}
