import { beforeAll, describe, expect, it } from "vitest";
import { versiegele } from "./block";
import { zuBase64 } from "./bytes";
import { entschluesseleExport, istExportdatei, KennwortFalsch, verschluesseleExport } from "./export";
import type { Exportdatei, Exportinhalt, Exportkopf } from "./format";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, packeAus, schluesselIdVon } from "./umschlag";

const KOPF: Exportkopf = { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln", von: 1, bis: 1, anzahl: 1, quelle: "DRK-Bereitschaft Uelzen" };
let inhalt: Exportinhalt;
let datei: Exportdatei;
beforeAll(async () => {
  const paar = await erzeugeSchluesselpaar();
  const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
  const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
  inhalt = { bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "Ruben Vitt", quelle: KOPF.quelle, anker: null };
  datei = await verschluesseleExport(inhalt, "richtiges-kennwort", KOPF);
});

describe("Export", () => {
  it("Rundlauf mit dem richtigen Kennwort", async () => {
    expect(await entschluesseleExport(datei, "richtiges-kennwort")).toEqual(inhalt);
    expect(datei.kdf.iterationen).toBe(600_000);
  });
  it("falsches Kennwort → KennwortFalsch mit dem Text der Vorlage", async () => {
    const fehler = await entschluesseleExport(datei, "falsches-kennwort").catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(KennwortFalsch);
    expect((fehler as Error).message).toBe("Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.");
  });
  it("ein veränderter Kopf (AAD) öffnet nicht", async () => {
    await expect(entschluesseleExport({ ...datei, kopf: { ...datei.kopf, anzahl: 2 } }, "richtiges-kennwort")).rejects.toBeInstanceOf(KennwortFalsch);
  });
  it("zu kurzes Kennwort wird schon beim Verschlüsseln abgelehnt", async () => {
    await expect(verschluesseleExport(inhalt, "kurz", KOPF)).rejects.toThrow("mindestens 10 Zeichen");
  });
  it("istExportdatei erkennt die eigene Hülle und lehnt Fremdes ab", () => {
    expect(istExportdatei(datei)).toBe(true);
    expect(istExportdatei(JSON.parse(JSON.stringify(datei)))).toBe(true);
    expect(istExportdatei({ ...datei, version: 1 })).toBe(false);          // Format der Vorlage
    expect(istExportdatei({ ...datei, kdf: { ...datei.kdf, iterationen: 1 } })).toBe(false);
    expect(istExportdatei({ ...datei, kdf: { ...datei.kdf, iterationen: 500_000 } })).toBe(false);   // im alten Bereich, aber nicht das Format
    expect(istExportdatei({ ...datei, kopf: { ...datei.kopf, umfang: "teil" } })).toBe(false);
    expect(istExportdatei(null)).toBe(false);
    expect(istExportdatei([])).toBe(false);
    expect(istExportdatei({ format: "einsatzbuch-export" })).toBe(false);
  });
});
