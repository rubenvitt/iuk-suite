import { beforeAll, describe, expect, it } from "vitest";
import { versiegele } from "./block";
import { utf8, zuBase64, zufall } from "./bytes";
import { entschluesseleExport, EXPORT_ITERATIONEN, istExportdatei, KennwortFalsch, verschluesseleExport } from "./export";
import type { Exportdatei, Exportinhalt, Exportkopf } from "./format";
import { kanonisch } from "./kanonisch";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, packeAus, schluesselIdVon } from "./umschlag";

const KOPF: Exportkopf = { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln", von: 1, bis: 1, anzahl: 1, quelle: "DRK-Bereitschaft Uelzen" };
let inhalt: Exportinhalt;
let datei: Exportdatei;
/** Verschlüsselt `klartext` roh (ohne über `kanonisch(inhalt)` zu gehen) mit demselben Kennwort/Salt/IV wie `datei` — für Tests auf Klartexte, die kein gültiger Exportinhalt sind. Die Ableitung (600 000 PBKDF2-Runden) läuft dafür nur einmal. */
let bauDatei: (klartext: string) => Promise<Exportdatei>;

beforeAll(async () => {
  const paar = await erzeugeSchluesselpaar();
  const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
  const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
  inhalt = { bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "Ruben Vitt", quelle: KOPF.quelle, anker: null };
  datei = await verschluesseleExport(inhalt, "richtiges-kennwort", KOPF);

  const salt = zufall(16);
  const iv = zufall(12);
  const basis = await crypto.subtle.importKey("raw", utf8("richtiges-kennwort"), "PBKDF2", false, ["deriveKey"]);
  const schluessel = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: EXPORT_ITERATIONEN },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  bauDatei = async (klartext: string) => {
    const daten = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: utf8(kanonisch(KOPF)) }, schluessel, utf8(klartext),
    ));
    return {
      format: "einsatzbuch-export", version: 2, kopf: KOPF,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterationen: EXPORT_ITERATIONEN, salt: zuBase64(salt) },
      chiffre: { name: "AES-GCM", laenge: 256, iv: zuBase64(iv) },
      daten: zuBase64(daten),
    };
  };
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

  it("ein fremdes Dateiformat (version: 1) wird schon vor dem Kennwort abgelehnt", async () => {
    await expect(entschluesseleExport({ ...datei, version: 1 } as unknown as Exportdatei, "richtiges-kennwort"))
      .rejects.toThrow("Keine gültige Exportdatei");
  });

  it("eine fremde Rundenzahl wird schon vor dem Kennwort abgelehnt, ohne PBKDF2 zu rechnen", async () => {
    const start = performance.now();
    await expect(entschluesseleExport({ ...datei, kdf: { ...datei.kdf, iterationen: 50_000_000 } }, "richtiges-kennwort"))
      .rejects.toThrow("Keine gültige Exportdatei");
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("kaputtes Base64 im Salt meldet sich als Formatfehler, nicht als falsches Kennwort", async () => {
    const fehler = await entschluesseleExport({ ...datei, kdf: { ...datei.kdf, salt: "!!" } }, "richtiges-kennwort").catch((e: unknown) => e);
    expect(fehler).not.toBeInstanceOf(KennwortFalsch);
    expect((fehler as Error).message).toBe("Keine gültige Exportdatei des Einsatzbuchs");
  });

  it("eine IV mit falscher Länge wird schon vor dem Kennwort abgelehnt", async () => {
    await expect(entschluesseleExport({ ...datei, chiffre: { ...datei.chiffre, iv: zuBase64(zufall(16)) } }, "richtiges-kennwort"))
      .rejects.toThrow("Keine gültige Exportdatei");
  });

  it("ein Klartext, der kein kanonisches JSON ist, öffnet nicht", async () => {
    const kaputt = await bauDatei(JSON.stringify(inhalt, null, 1));
    await expect(entschluesseleExport(kaputt, "richtiges-kennwort")).rejects.toThrow("kein kanonisches JSON");
  });

  it("ein kanonischer, aber formfremder Klartext öffnet nicht", async () => {
    const fremd = await bauDatei(kanonisch({ ...inhalt, extra: 1 }));
    await expect(entschluesseleExport(fremd, "richtiges-kennwort")).rejects.toThrow("nicht die erwartete Form");
  });
});
