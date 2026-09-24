import { beforeAll, describe, expect, it } from "vitest";
import { versiegele } from "./block";
import type { Block } from "./format";
import { blockHash, pruefeKette } from "./kette";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, schluesselIdVon } from "./umschlag";

let b1: Block, b2: Block, b3: Block, luecke: Block;
beforeAll(async () => {
  const paar = await erzeugeSchluesselpaar();
  const sid = await schluesselIdVon(paar.publicKey);
  b1 = await versiegele(beispielEinsatz("2026-047"), kopf(1, GENESIS, sid), paar.publicKey);
  b2 = await versiegele(beispielEinsatz("2026-048"), kopf(2, b1.hash, sid), paar.publicKey);
  b3 = await versiegele(beispielEinsatz("2026-049"), kopf(3, b2.hash, sid), paar.publicKey);
  luecke = await versiegele(beispielEinsatz("2026-050"), kopf(4, b1.hash, sid), paar.publicKey);
});

describe("pruefeKette", () => {
  it("eine lückenlose Kette ab Block 1 ist intakt und vollständig", async () => {
    expect(await pruefeKette([b1, b2, b3])).toEqual({ ok: true, vollstaendig: true });
  });
  it("ein Ausschnitt ohne Block 1 ist intakt, aber nicht vollständig", async () => {
    expect(await pruefeKette([b2, b3])).toEqual({ ok: true, vollstaendig: false });
  });
  it("eine leere Kette ist intakt, aber nicht vollständig", async () => {
    expect(await pruefeKette([])).toEqual({ ok: true, vollstaendig: false });
  });
  it("ein veränderter Kopf fällt am Fingerabdruck auf", async () => {
    const verfaelscht = { ...b2, kopf: { ...b2.kopf, versiegelt: "2026-09-23T21:09:00+02:00" } };
    expect(await pruefeKette([b1, verfaelscht, b3])).toEqual({ ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" });
  });
  it("ein verändertes Chiffrat fällt am Fingerabdruck auf", async () => {
    const verfaelscht = { ...b2, daten: b3.daten };
    expect(await pruefeKette([b1, verfaelscht, b3])).toMatchObject({ ok: false, block: 2 });
  });
  it("ein fehlender Block bricht die Kette beim Nachfolger", async () => {
    expect(await pruefeKette([b1, b3])).toEqual({ ok: false, block: 3, grund: "Vorgänger fehlt oder wurde verändert" });
  });
  it("eine Nummernlücke bei passendem Vorgänger fällt auf", async () => {
    expect(await pruefeKette([b1, luecke])).toEqual({ ok: false, block: 4, grund: "Lücke in der Reihenfolge" });
  });
  it("Block 1 muss auf den Anfang der Kette zeigen", async () => {
    const paar = await erzeugeSchluesselpaar();
    const falsch = await versiegele(beispielEinsatz(), kopf(1, "f".repeat(64), await schluesselIdVon(paar.publicKey)), paar.publicKey);
    expect(await pruefeKette([falsch])).toEqual({ ok: false, block: 1, grund: "Anfang der Kette stimmt nicht" });
  });
  it("eine umgeschriebene Umgebung fällt am Fingerabdruck auf", async () => {
    const verfaelscht = { ...b2, kopf: { ...b2.kopf, umgebung: "test" as const } };
    expect(await pruefeKette([b1, verfaelscht, b3])).toEqual({ ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" });
  });
  it("blockHash ignoriert ein mitgeliefertes hash-Feld", async () => {
    expect(await blockHash(b1)).toBe(b1.hash);
  });
});
