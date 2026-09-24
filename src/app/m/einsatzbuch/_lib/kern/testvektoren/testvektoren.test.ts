import { describe, expect, it } from "vitest";
import { oeffneBlock } from "../block";
import { ausBase64 } from "../bytes";
import { entschluesseleExport, istExportdatei } from "../export";
import { pruefeKette } from "../kette";
import { importiereOeffentlich, packeAus, schluesselIdVon } from "../umschlag";
import eingabenJson from "./eingaben.json";
import erwartetJson from "./erwartet.json";
import { TESTEINSAETZE } from "./einsaetze";
import { erzeugeErwartung, type Testeingaben, type Testerwartung } from "./erzeuge";

const eingaben = eingabenJson as unknown as Testeingaben;
const erwartet = erwartetJson as unknown as Testerwartung;

describe("Testvektoren (Format-Vertrag mit der Desktop-App)", () => {
  it("die Eingaben erzeugen byte-genau die eingecheckte Erwartung", async () => {
    expect(await erzeugeErwartung(eingaben)).toEqual(erwartet);
  });
  it("die Einsätze der Eingabe sind die aus einsaetze.ts", () => {
    expect(eingaben.einsaetze).toEqual(TESTEINSAETZE);
  });
  it("alle Vektorblöcke sind echt (ein Testblock wäre ein eigener Vektor)", () => {
    expect(erwartet.bloecke.map((b) => b.kopf.umgebung)).toEqual(["echt", "echt", "echt"]);
  });
  it("die Kette der Vektoren ist intakt und vollständig", async () => {
    expect(await pruefeKette(erwartet.bloecke)).toEqual({ ok: true, vollstaendig: true });
  });
  it("die schluesselId gehört zum öffentlichen Schlüssel der Eingabe", async () => {
    expect(await schluesselIdVon(await importiereOeffentlich(eingaben.suite.oeffentlichSpki))).toBe(erwartet.schluesselId);
  });
  it("der Suite-Schlüssel packt jeden CEK aus, und jeder CEK öffnet seinen Einsatz", async () => {
    const privat = await crypto.subtle.importKey("jwk", eingaben.suite.privat, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    for (const [i, block] of erwartet.bloecke.entries()) {
      const cek = await packeAus(block.umschlag, block.kopf, privat);
      expect(cek).toEqual(ausBase64(eingaben.bloecke[i].cek));
      expect(await oeffneBlock(block, cek)).toEqual(eingaben.einsaetze[i]);
    }
  });
  it("die Exportdatei öffnet mit dem Kennwort und trägt die Originalblöcke", async () => {
    expect(istExportdatei(erwartet.export)).toBe(true);
    const inhalt = await entschluesseleExport(erwartet.export, eingaben.export.kennwort);
    expect(inhalt.bloecke).toEqual(erwartet.bloecke);
    expect(await pruefeKette(inhalt.bloecke)).toEqual({ ok: true, vollstaendig: true });
    for (const block of inhalt.bloecke) {
      expect(await oeffneBlock(block, ausBase64(inhalt.schluessel[String(block.kopf.block)]))).toEqual(eingaben.einsaetze[block.kopf.block - 1]);
    }
  });
  it("die Negativfälle der Spec §9.1 scheitern genau dort, wo die Erwartung es sagt", async () => {
    expect(erwartet.negativ.map((f) => f.name)).toEqual(["veraenderter-kopf", "vertauschter-umschlag", "luecke", "falscher-anfang"]);
    const privat = await crypto.subtle.importKey("jwk", eingaben.suite.privat, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    for (const fall of erwartet.negativ) {
      expect(await pruefeKette(fall.bloecke)).toEqual(fall.kette);
      for (const block of fall.bloecke) {
        const auspacken = packeAus(block.umschlag, block.kopf, privat);
        if (fall.auspackenScheitert.includes(block.kopf.block)) await expect(auspacken).rejects.toThrow();
        else await expect(auspacken).resolves.toBeInstanceOf(Uint8Array);
      }
    }
  });
});
