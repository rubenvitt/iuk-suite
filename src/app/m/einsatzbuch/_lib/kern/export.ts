import { ausBase64, mitLaenge, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import { hatGenauSchluessel, istExportinhalt, istObjekt, type Exportdatei, type Exportinhalt, type Exportkopf } from "./format";
import { ausKanonischemJson, kanonisch } from "./kanonisch";

export const EXPORT_ITERATIONEN = 600_000;
export const KENNWORT_MINDESTLAENGE = 10;

export class KennwortFalsch extends Error {
  constructor() { super("Das Kennwort passt nicht. Die Datei bleibt verschlüsselt."); }
}

async function kennwortSchluessel(kennwort: string, salt: Bytes, iterationen: number): Promise<CryptoKey> {
  const basis = await crypto.subtle.importKey("raw", utf8(kennwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iterationen },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function verschluesseleExport(
  inhalt: Exportinhalt, kennwort: string, kopf: Exportkopf, z?: { salt: Bytes; iv: Bytes },
): Promise<Exportdatei> {
  if (kennwort.length < KENNWORT_MINDESTLAENGE) throw new Error(`Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen`);
  const salt = mitLaenge(z?.salt ?? zufall(16), 16, "salt");
  const iv = mitLaenge(z?.iv ?? zufall(12), 12, "iv");
  const schluessel = await kennwortSchluessel(kennwort, salt, EXPORT_ITERATIONEN);
  const daten = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, schluessel, utf8(kanonisch(inhalt)),
  ));
  return {
    format: "einsatzbuch-export", version: 2, kopf,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterationen: EXPORT_ITERATIONEN, salt: zuBase64(salt) },
    chiffre: { name: "AES-GCM", laenge: 256, iv: zuBase64(iv) },
    daten: zuBase64(daten),
  };
}

const EXPORTDATEI_SCHLUESSEL = ["format", "version", "kopf", "kdf", "chiffre", "daten"] as const;
const EXPORTKOPF_SCHLUESSEL = ["erstellt", "umfang", "von", "bis", "anzahl", "quelle"] as const;
const KDF_SCHLUESSEL = ["name", "hash", "iterationen", "salt"] as const;
const CHIFFRE_SCHLUESSEL = ["name", "laenge", "iv"] as const;

/**
 * Formprüfung der äußeren Hülle, bevor nach dem Kennwort gefragt wird. Lehnt das Format der
 * Vorlage (`version: 1`) und jede andere Rundenzahl als 600 000 ab. Verlangt auf allen vier
 * Ebenen genau die erwarteten Schlüssel: `kopf` ist AAD, ein zusätzliches
 * oder unbekanntes Feld darin würde sich sonst als `KennwortFalsch` melden statt als
 * Formfehler.
 */
export function istExportdatei(x: unknown): x is Exportdatei {
  if (!istObjekt(x) || !hatGenauSchluessel(x, EXPORTDATEI_SCHLUESSEL)) return false;
  if (x.format !== "einsatzbuch-export" || x.version !== 2) return false;
  const { kopf, kdf, chiffre, daten } = x;
  return istObjekt(kopf) && hatGenauSchluessel(kopf, EXPORTKOPF_SCHLUESSEL)
    && typeof kopf.erstellt === "string" && (kopf.umfang === "alle" || kopf.umfang === "einzeln")
    && Number.isSafeInteger(kopf.von) && Number.isSafeInteger(kopf.bis) && Number.isSafeInteger(kopf.anzahl) && typeof kopf.quelle === "string"
    && istObjekt(kdf) && hatGenauSchluessel(kdf, KDF_SCHLUESSEL) && kdf.name === "PBKDF2" && kdf.hash === "SHA-256"
    && kdf.iterationen === EXPORT_ITERATIONEN
    && typeof kdf.salt === "string"
    && istObjekt(chiffre) && hatGenauSchluessel(chiffre, CHIFFRE_SCHLUESSEL) && chiffre.name === "AES-GCM" && chiffre.laenge === 256 && typeof chiffre.iv === "string"
    && typeof daten === "string";
}

/**
 * Entschlüsselt eine Exportdatei. Reihenfolge ist bewusst, damit eine beschädigte oder fremde
 * Datei sich als solche meldet statt als falsches Kennwort, und keine fremde Rundenzahl in die
 * Schlüsselableitung gelangt: erst die Hülle (`istExportdatei`, prüft u. a. die Rundenzahl),
 * dann Salt/IV/Daten auf gültiges Base64 und feste Länge (beides derselbe Formatfehler, noch
 * vor der teuren Schlüsselableitung), erst danach die eigentliche Entschlüsselung — nur ein
 * Fehler von `crypto.subtle.decrypt` wird zu `KennwortFalsch` — und zuletzt die Form des
 * Klartexts (`istExportinhalt`): ein GCM-Rundlauf beweist nur, dass der Klartext mit
 * *irgendeinem* Schlüssel erzeugt wurde, nicht dass er kanonisches JSON im erwarteten Format ist.
 */
export async function entschluesseleExport(datei: Exportdatei, kennwort: string): Promise<Exportinhalt> {
  if (!istExportdatei(datei)) throw new Error("Keine gültige Exportdatei des Einsatzbuchs");

  let salt: Bytes;
  let iv: Bytes;
  let daten: Bytes;
  try {
    salt = mitLaenge(ausBase64(datei.kdf.salt), 16, "salt");
    iv = mitLaenge(ausBase64(datei.chiffre.iv), 12, "iv");
    daten = ausBase64(datei.daten);
  } catch {
    throw new Error("Keine gültige Exportdatei des Einsatzbuchs");
  }

  const schluessel = await kennwortSchluessel(kennwort, salt, EXPORT_ITERATIONEN);
  let klar: ArrayBuffer;
  try {
    klar = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: utf8(kanonisch(datei.kopf)) },
      schluessel, daten,
    );
  } catch {
    throw new KennwortFalsch();
  }

  let e: unknown;
  try {
    e = ausKanonischemJson(new Uint8Array(klar));
  } catch {
    throw new Error("Inhalt der Exportdatei ist kein kanonisches JSON");
  }
  if (!istExportinhalt(e)) throw new Error("Inhalt der Exportdatei hat nicht die erwartete Form");
  return e;
}
