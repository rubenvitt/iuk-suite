import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EXPORT_ITERATIONEN, verschluesseleExport, entschluesseleExport } from "../kern/export";
import { kanonisch } from "../kern/kanonisch";
import { versiegele } from "../kern/block";
import { erzeugeSchluesselpaar, schluesselIdVon } from "../kern/umschlag";
import { utf8, zuBase64, zufall } from "../kern/bytes";
import { beispielEinsatz, kopf } from "../kern/testhilfe";
import type { Exportdatei, Exportinhalt } from "../kern/format";
import { INHALT_BESCHAEDIGT, KENNWORT_FALSCH, leseDatei, oeffneExport } from "./oeffnen";

const erwartet = JSON.parse(readFileSync(path.join(__dirname, "../kern/testvektoren/erwartet.json"), "utf8")) as { export: Exportdatei };
const KW = "testvektor-kennwort";
const ZONE = "Europe/Berlin";
/** PNG-Signatur plus IHDR-Anfang, als Text gelesen wie `File.text()` (UTF-8, Ersatzzeichen für ungültige Bytes). */
const PNG = new TextDecoder().decode(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
const KOPF = { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln" as const, von: 1, bis: 1, anzahl: 1, quelle: "Test" };

/** Ein Block mit bekanntem CEK; `umgebung` wählbar; `einsatz` verbiegt den Einsatz VOR dem Versiegeln (gültige Krypto, kaputte Form). */
async function datei(o: { umgebung?: "echt" | "test"; einsatz?: Record<string, unknown>; inhalt?: (i: Exportinhalt) => unknown; versiegelt?: string } = {}) {
  const paar = await erzeugeSchluesselpaar();
  const id = await schluesselIdVon(paar.publicKey);
  const cek = zufall(32);
  const k = { ...kopf(1, "0".repeat(64), id, o.umgebung ?? "echt"), ...(o.versiegelt ? { versiegelt: o.versiegelt } : {}) };
  const b = await versiegele({ ...beispielEinsatz(), ...(o.einsatz ?? {}) } as never, k, paar.publicKey,
    { cek, iv: zufall(12), umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: zufall(12) } });
  const inhalt: Exportinhalt = { bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "Test", quelle: "Test", anker: null };
  return verschluesseleExport((o.inhalt ? o.inhalt(inhalt) : inhalt) as Exportinhalt, KW, KOPF);
}

/**
 * Wie `verschluesseleExport`, aber mit beliebigem Klartext: eine selbst gebaute Datei mit gültigem
 * Kennwort, deren Inhalt `kanonisch` nie erzeugen würde (etwa eine Bruchzahl).
 */
async function roheDatei(klartext: string): Promise<Exportdatei> {
  const salt = zufall(16);
  const iv = zufall(12);
  const basis = await crypto.subtle.importKey("raw", utf8(KW), "PBKDF2", false, ["deriveKey"]);
  const schluessel = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: EXPORT_ITERATIONEN },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const daten = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(KOPF)) }, schluessel, utf8(klartext)));
  return {
    format: "einsatzbuch-export", version: 2, kopf: KOPF,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterationen: EXPORT_ITERATIONEN, salt: zuBase64(salt) },
    chiffre: { name: "AES-GCM", laenge: 256, iv: zuBase64(iv) },
    daten: zuBase64(daten),
  };
}

describe("leseDatei", () => {
  it("nimmt die Vektordatei an und beschreibt den Kopf", () => {
    const g = leseDatei("probe.einsatzbuch", JSON.stringify(erwartet.export), ZONE);
    expect(g.ok && g.kopfText).toBe("Exportiert 24.9.2026, 10:00 Uhr · DRK-Bereitschaft Uelzen · Block 1–3 · 3 Einsätze");
  });
  it.each([["kaputt", "{"], ["fremd", '{"a":1}'], ["leer", ""], ["PNG-Datei", PNG], ["Vorlage v1", JSON.stringify({ ...erwartet.export, version: 1 })],
    ["Zeitpunkt ohne Offset im Kopf", JSON.stringify({ ...erwartet.export, kopf: { ...erwartet.export.kopf, erstellt: "2026-09-24T10:00" } })]])(
    "%s → keine Einsatzbuch-Datei", (_n, text) => {
      expect(leseDatei("x.einsatzbuch", text, ZONE)).toEqual({ ok: false, fehler: "„x.einsatzbuch“ ist keine Einsatzbuch-Datei. Erwartet wird eine .einsatzbuch-Datei aus der Verwaltung." });
    });
});

describe("oeffneExport", () => {
  it("Vektordatei: drei Einsätze, Kette intakt, Anker laut Datei", async () => {
    const r = await oeffneExport(erwartet.export, KW);
    expect(r.ok && r.wert.eintraege.map((e) => e.einsatz?.nummer)).toEqual(["2026-041", "2026-042", "2026-043"]);
    expect(r.ok && r.wert.kette).toEqual({ art: "intakt", vollstaendig: true });
    expect(r.ok && r.wert.anker?.block).toBe(3);
    expect(r.ok && [r.wert.von, r.wert.bis, r.wert.anzahl, r.wert.test]).toEqual([1, 3, 3, false]);
  });
  it("falsches Kennwort", async () => {
    expect(await oeffneExport(erwartet.export, "falsch-falsch")).toEqual({ ok: false, fehler: KENNWORT_FALSCH, kennwort: true });
  });
  it("manipulierter Block → Gebrochen bei Block 2 und Block 2 lässt sich nicht öffnen", async () => {
    const inhalt = await entschluesseleExport(erwartet.export, KW);
    inhalt.bloecke[1] = { ...inhalt.bloecke[1], kopf: { ...inhalt.bloecke[1].kopf, versiegelt: "2026-08-29T19:34:00+02:00" } };
    const r = await oeffneExport(await verschluesseleExport(inhalt, KW, erwartet.export.kopf), KW);
    expect(r.ok && r.wert.kette).toMatchObject({ art: "gebrochen", block: 2 });
    expect(r.ok && r.wert.eintraege[1].fehler).toBe("Block 2 lässt sich nicht öffnen");
    expect(r.ok && r.wert.eintraege[0].einsatz).not.toBeNull();
  });
  it("Einzelexport aus der Mitte → Ausschnitt intakt", async () => {
    const inhalt = await entschluesseleExport(erwartet.export, KW);
    const einzeln = { ...inhalt, bloecke: [inhalt.bloecke[1]], schluessel: { "2": inhalt.schluessel["2"] }, anker: inhalt.anker };
    const r = await oeffneExport(await verschluesseleExport(einzeln, KW, { ...erwartet.export.kopf, umfang: "einzeln", von: 2, bis: 2, anzahl: 1 }), KW);
    expect(r.ok && r.wert.kette).toMatchObject({ art: "intakt", vollstaendig: false, abBlock: 2 });
  });
  it("umgebung test wird erkannt", async () => {
    const r = await oeffneExport(await datei({ umgebung: "test" }), KW);
    expect(r.ok && r.wert.test).toBe(true);
  });
  it.each([
    ["unmögliches Datum im Einsatz", { einsatz: { beginnDatum: "2026-02-31" } }],
    ["Uhrzeit 24:00", { einsatz: { endeZeit: "24:00" } }],
    ["riesige Notizen", { einsatz: { notizen: "x".repeat(20_001) } }],
  ])("%s → Block lässt sich nicht öffnen, kein Wurf", async (_n, o) => {
    const r = await oeffneExport(await datei(o), KW);
    expect(r.ok && r.wert.eintraege[0]).toMatchObject({ einsatz: null, fehler: "Block 1 lässt sich nicht öffnen" });
  });
  it.each([
    ["versiegelt am 31. Februar", { versiegelt: "2026-02-31T10:00:00+01:00" }],
    ["versiegelt ohne Offset", { versiegelt: "2026-09-23T21:08:00" }],
    ["CEK mit 31 Byte", { inhalt: (i: Exportinhalt) => ({ ...i, schluessel: { "1": zuBase64(zufall(31)) } }) }],
    ["Schlüssel für einen Block, den es nicht gibt", { inhalt: (i: Exportinhalt) => ({ ...i, schluessel: { ...i.schluessel, "7": zuBase64(zufall(32)) } }) }],
    ["Anker am 30. Februar", { inhalt: (i: Exportinhalt) => ({ ...i, anker: { block: 1, hash: i.bloecke[0].hash, gemeldetAm: "2026-02-30T10:00:00Z" } }) }],
  ])("%s → Inhalt beschädigt, kein Wurf", async (_n, o) => {
    expect(await oeffneExport(await datei(o as never), KW)).toEqual({ ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false });
  });
  it("Blocknummer als Bruch → Inhalt beschädigt, kein Wurf", async () => {
    // Die Gegenprobe: dieselbe Datei mit ganzer Blocknummer öffnet sich.
    const paar = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, "0".repeat(64), await schluesselIdVon(paar.publicKey), "echt"), paar.publicKey,
      { cek: zufall(32), iv: zufall(12), umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: zufall(12) } });
    const text = kanonisch({ bloecke: [b], schluessel: {}, exportiertVon: "Test", quelle: "Test", anker: null });
    expect((await oeffneExport(await roheDatei(text), KW)).ok).toBe(true);
    const bruch = text.replace('"kopf":{"block":1,', '"kopf":{"block":1.5,');
    expect(bruch).not.toBe(text);
    expect(await oeffneExport(await roheDatei(bruch), KW)).toEqual({ ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false });
  });
  it("fehlender CEK betrifft nur den Block", async () => {
    const r = await oeffneExport(await datei({ inhalt: (i) => ({ ...i, schluessel: {} }) }), KW);
    expect(r.ok && r.wert.eintraege[0].fehler).toBe("Block 1 lässt sich nicht öffnen");
  });
});
