import { describe, expect, it } from "vitest";
import { oeffneBlock, versiegele } from "./block";
import { ausBase64, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import type { Block, Blockkopf } from "./format";
import { kanonisch } from "./kanonisch";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, packeAus, packeEin, schluesselIdVon } from "./umschlag";

/**
 * Baut einen Block direkt über `crypto.subtle`, ohne `versiegele` (das erzwingt selbst
 * schon kanonisches JSON) — für Tests, die einen Klartext einschmuggeln wollen, den
 * `versiegele` nie erzeugen würde.
 */
async function roh(k: Blockkopf, klartext: string, suiteOeffentlich: CryptoKey): Promise<{ block: Block; cek: Bytes }> {
  const cek = zufall(32);
  const iv = zufall(12);
  const schluessel = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const daten = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(k)) }, schluessel, utf8(klartext),
  ));
  const umschlag = await packeEin(cek, k, suiteOeffentlich);
  return { block: { kopf: k, iv: zuBase64(iv), daten: zuBase64(daten), umschlag, hash: "" }, cek };
}

describe("Versiegeln, Einpacken, Auspacken, Öffnen", () => {
  it("Rundlauf: der Suite-Schlüssel packt den CEK aus, der CEK öffnet den Einsatz", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const block = await versiegele(beispielEinsatz(), k, paar.publicKey);
    const cek = await packeAus(block.umschlag, block.kopf, paar.privateKey);
    expect(await oeffneBlock(block, cek)).toEqual(beispielEinsatz());
  });
  it("ein Umschlag lässt sich nicht auf einen anderen Block umhängen", async () => {
    const paar = await erzeugeSchluesselpaar();
    const sid = await schluesselIdVon(paar.publicKey);
    const a = await versiegele(beispielEinsatz(), kopf(1, GENESIS, sid), paar.publicKey);
    await expect(packeAus(a.umschlag, { ...a.kopf, block: 2 }, paar.privateKey)).rejects.toThrow();
  });
  it("ein fremder privater Schlüssel packt nichts aus", async () => {
    const paar = await erzeugeSchluesselpaar();
    const fremd = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
    await expect(packeAus(b.umschlag, b.kopf, fremd.privateKey)).rejects.toThrow();
  });
  it("ein veränderter Kopf öffnet den Block nicht", async () => {
    const paar = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
    const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
    await expect(oeffneBlock({ ...b, kopf: { ...b.kopf, block: 9 } }, cek)).rejects.toThrow();
  });
  it("versiegeln verweigert eine schluesselId, die nicht zum Schlüssel gehört", async () => {
    const paar = await erzeugeSchluesselpaar();
    await expect(versiegele(beispielEinsatz(), kopf(1, GENESIS, "0000000000000000"), paar.publicKey)).rejects.toThrow("schluesselId");
  });
  it("die Umgebung lässt sich nicht still von test auf echt umschreiben", async () => {
    const paar = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey), "test"), paar.publicKey);
    const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
    const umgeschrieben = { ...b, kopf: { ...b.kopf, umgebung: "echt" as const } };
    await expect(packeAus(umgeschrieben.umschlag, umgeschrieben.kopf, paar.privateKey)).rejects.toThrow();
    await expect(oeffneBlock(umgeschrieben, cek)).rejects.toThrow();
  });
  it("jeder Block bekommt frischen Zufall: gleicher Einsatz, anderes Chiffrat", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const [a, b] = await Promise.all([versiegele(beispielEinsatz(), k, paar.publicKey), versiegele(beispielEinsatz(), k, paar.publicKey)]);
    expect(a.daten).not.toBe(b.daten);
    expect(a.umschlag.epk).not.toBe(b.umschlag.epk);
  });
  it("ein Klartext, der kein kanonisches JSON ist, öffnet nicht", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const { block, cek } = await roh(k, JSON.stringify(beispielEinsatz(), null, 1), paar.publicKey);
    await expect(oeffneBlock(block, cek)).rejects.toThrow("kein kanonisches JSON");
  });
  it("ein kanonischer Klartext mit falscher Form öffnet nicht", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const { block, cek } = await roh(k, kanonisch({ ...beispielEinsatz(), v: 2 }), paar.publicKey);
    await expect(oeffneBlock(block, cek)).rejects.toThrow("kein Einsatz");
  });
  it("falsche Längen werden abgelehnt", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const b = await versiegele(beispielEinsatz(), k, paar.publicKey);
    const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
    const falscheIv = { ...b, iv: zuBase64(zufall(16)) };
    await expect(oeffneBlock(falscheIv, cek)).rejects.toThrow("12 Byte");
    const gekuerztesEpk = { ...b.umschlag, epk: zuBase64(ausBase64(b.umschlag.epk).slice(0, 33)) };
    await expect(packeAus(gekuerztesEpk, b.kopf, paar.privateKey)).rejects.toThrow();
  });
});
