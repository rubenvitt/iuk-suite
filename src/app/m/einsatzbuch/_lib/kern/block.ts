import { ausBase64, ausUtf8, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import type { Block, Blockkopf, Einsatz } from "./format";
import { kanonisch } from "./kanonisch";
import { blockHash } from "./kette";
import { packeEin, schluesselIdVon, type Umschlagzufall } from "./umschlag";

export interface Blockzufall { cek: Bytes; iv: Bytes; umschlag: Umschlagzufall }

async function aesSchluessel(cek: Bytes): Promise<CryptoKey> {
  if (cek.length !== 32) throw new Error("CEK muss 32 Byte lang sein");
  return crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Versiegelt einen Einsatz. Im Betrieb tut das die Desktop-App in Rust; diese Fassung
 * erzeugt die Testvektoren und Testdaten der Suite. Ohne `z` zieht sie frischen Zufall.
 */
export async function versiegele(einsatz: Einsatz, kopf: Blockkopf, suiteOeffentlich: CryptoKey, z?: Blockzufall): Promise<Block> {
  if (kopf.schluesselId !== (await schluesselIdVon(suiteOeffentlich))) throw new Error("schluesselId passt nicht zum Schlüssel");
  const cek = z?.cek ?? zufall(32);
  const iv = z?.iv ?? zufall(12);
  const daten = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, await aesSchluessel(cek), utf8(kanonisch(einsatz)),
  ));
  const umschlag = await packeEin(cek, kopf, suiteOeffentlich, z?.umschlag);
  const ohneHash = { kopf, iv: zuBase64(iv), daten: zuBase64(daten), umschlag };
  return { ...ohneHash, hash: await blockHash(ohneHash) };
}

/** Entschlüsselt einen Block mit seinem CEK. Wirft bei falschem Schlüssel oder verändertem Kopf. */
export async function oeffneBlock(block: Block, cek: Bytes): Promise<Einsatz> {
  const klar = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ausBase64(block.iv), additionalData: utf8(kanonisch(block.kopf)) },
    await aesSchluessel(cek), ausBase64(block.daten),
  );
  return JSON.parse(ausUtf8(new Uint8Array(klar))) as Einsatz;
}
