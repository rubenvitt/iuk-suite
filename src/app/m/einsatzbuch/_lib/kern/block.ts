import { ausBase64, mitLaenge, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import { istEinsatz, type Block, type Blockkopf, type Einsatz } from "./format";
import { ausKanonischemJson, kanonisch } from "./kanonisch";
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
  const iv = mitLaenge(z?.iv ?? zufall(12), 12, "iv");
  const daten = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, await aesSchluessel(cek), utf8(kanonisch(einsatz)),
  ));
  const umschlag = await packeEin(cek, kopf, suiteOeffentlich, z?.umschlag);
  const ohneHash = { kopf, iv: zuBase64(iv), daten: zuBase64(daten), umschlag };
  return { ...ohneHash, hash: await blockHash(ohneHash) };
}

/**
 * Entschlüsselt einen Block mit seinem CEK und prüft den Klartext, bevor er als `Einsatz`
 * gilt. Ein erfolgreicher GCM-Rundlauf beweist nur, dass jemand mit diesem CEK den Klartext
 * erzeugt hat — nicht, dass er kanonisches JSON im Format v1 ist (der öffentliche
 * Suite-Schlüssel ist öffentlich, und in einer Exportdatei reisen die CEKs mit). Wirft bei
 * falschem Schlüssel, verändertem Kopf, falscher IV-Länge, nicht-kanonischem Klartext oder
 * falscher Form.
 */
export async function oeffneBlock(block: Block, cek: Bytes): Promise<Einsatz> {
  const klar = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: mitLaenge(ausBase64(block.iv), 12, "iv"), additionalData: utf8(kanonisch(block.kopf)) },
    await aesSchluessel(cek), ausBase64(block.daten),
  );
  let e: unknown;
  try {
    e = ausKanonischemJson(new Uint8Array(klar));
  } catch {
    throw new Error("Klartext ist kein kanonisches JSON");
  }
  if (!istEinsatz(e)) throw new Error("Klartext ist kein Einsatz im Format v1");
  return e;
}
