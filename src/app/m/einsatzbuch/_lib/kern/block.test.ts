import { describe, expect, it } from "vitest";
import { oeffneBlock, versiegele } from "./block";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, packeAus, schluesselIdVon } from "./umschlag";

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
});
