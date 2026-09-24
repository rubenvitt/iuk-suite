import { beforeAll, describe, expect, it } from "vitest";
import { versiegele } from "./block";
import { istBlock, istEinsatz, istExportinhalt, type Block } from "./format";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, schluesselIdVon } from "./umschlag";

describe("istEinsatz", () => {
  it("ein vollständiger Einsatz ist gültig", () => {
    expect(istEinsatz(beispielEinsatz())).toBe(true);
  });
  it("ein fremdes Feld macht den Einsatz ungültig", () => {
    expect(istEinsatz({ ...beispielEinsatz(), fremd: "x" })).toBe(false);
  });
  it("vorOrt darf nicht negativ sein", () => {
    expect(istEinsatz({ ...beispielEinsatz(), vorOrt: -1 })).toBe(false);
  });
  it("vorOrt muss eine ganze Zahl sein", () => {
    expect(istEinsatz({ ...beispielEinsatz(), vorOrt: 1.5 })).toBe(false);
  });
  it("endeZeit darf nicht undefined sein", () => {
    expect(istEinsatz({ ...beispielEinsatz(), endeZeit: undefined })).toBe(false);
  });
  it("eine Person ohne fahrzeugId ist ungültig", () => {
    const einsatz = beispielEinsatz();
    const ohneFahrzeugId: Record<string, unknown> = { ...einsatz.personal[0] };
    delete ohneFahrzeugId.fahrzeugId;
    expect(istEinsatz({ ...einsatz, personal: [ohneFahrzeugId, einsatz.personal[1]] })).toBe(false);
  });
});

describe("istBlock / istExportinhalt", () => {
  let block: Block;

  beforeAll(async () => {
    const paar = await erzeugeSchluesselpaar();
    block = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
  });

  it("ein echter Block ist gültig", () => {
    expect(istBlock(block)).toBe(true);
  });
  it("ein Exportinhalt mit diesem Block ist gültig", () => {
    expect(istExportinhalt({ bloecke: [block], schluessel: { "1": "…" }, exportiertVon: "x", quelle: "y", anker: null })).toBe(true);
  });
  it("block: 0 ist ungültig", () => {
    expect(istBlock({ ...block, kopf: { ...block.kopf, block: 0 } })).toBe(false);
  });
  it("umgebung 'prod' ist ungültig", () => {
    expect(istBlock({ ...block, kopf: { ...block.kopf, umgebung: "prod" } })).toBe(false);
  });
  it("ein fremdes Feld im Block ist ungültig", () => {
    expect(istBlock({ ...block, fremd: "x" })).toBe(false);
  });
  it("ein Anker ohne die erwarteten Felder ist ungültig", () => {
    expect(istExportinhalt({ bloecke: [block], schluessel: {}, exportiertVon: "x", quelle: "y", anker: { block: 1 } })).toBe(false);
  });
});
