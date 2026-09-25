// @vitest-environment node
/**
 * Der Export am Rechner (Plan Stufe 6, Entscheidung 7) gegen den geteilten Kern: Was
 * `baueExport` baut, öffnet `entschluesseleExport` aus `@kern/export` — derselbe Code, mit dem
 * der Reader der Suite die Datei öffnet. PBKDF2 mit 600 000 Runden kostet je Rundlauf spürbar
 * Zeit, deshalb nur wenige echte Rundläufe und ein großzügiger Timeout.
 */
import { describe, expect, it } from "vitest";

import { ausBase64 } from "@kern/bytes";
import { entschluesseleExport, istExportdatei } from "@kern/export";

import { BLOECKE, CEKS, EINSAETZE } from "../verwaltung/testvektoren";
import { baueExport, type Exportauftrag } from "./export";

const KENNWORT = "korrekt-pferd-batterie";
const ANKER = { block: 3, hash: BLOECKE[2].hash, gemeldetAm: "2026-09-25T10:00:00+02:00" };
const LANGSAM = 60_000;

function ceks(): Map<number, Uint8Array> {
  return new Map(CEKS.map((p) => [p.block, ausBase64(p.cek)]));
}

function auftrag(teil: Partial<Exportauftrag> = {}): Exportauftrag {
  return {
    bloecke: BLOECKE,
    umfang: "alle",
    gewaehlt: null,
    ceks: ceks(),
    anker: ANKER,
    exportiertVon: "Ruben Vitt",
    quelle: "DRK-Bereitschaft Uelzen",
    erstellt: "2026-09-25T10:15:00+02:00",
    zeitzone: "Europe/Berlin",
    nummer: null,
    ...teil,
  };
}

describe("baueExport", () => {
  it(
    "„alle“: der Reader-Kern öffnet die Datei, Blöcke unverändert, jeder Schlüssel dabei, Anker übernommen",
    async () => {
      const { datei, dateiname } = await baueExport(auftrag(), KENNWORT);
      expect(istExportdatei(datei)).toBe(true);
      expect(datei.version).toBe(2);
      expect(datei.kopf).toEqual({ erstellt: "2026-09-25T10:15:00+02:00", umfang: "alle", von: 1, bis: 3, anzahl: 3, quelle: "DRK-Bereitschaft Uelzen" });
      expect(dateiname).toBe("einsatzbuch_2026-09-25_block-1-3.einsatzbuch");

      const inhalt = await entschluesseleExport(datei, KENNWORT);
      expect(inhalt.bloecke).toEqual(BLOECKE);
      expect(inhalt.schluessel).toEqual(Object.fromEntries(CEKS.map((p) => [String(p.block), p.cek])));
      expect(inhalt.anker).toEqual(ANKER);
      expect(inhalt.exportiertVon).toBe("Ruben Vitt");
      expect(inhalt.quelle).toBe("DRK-Bereitschaft Uelzen");
    },
    LANGSAM,
  );

  it(
    "„einzeln“ trägt genau den gewählten Block und genau seinen Schlüssel",
    async () => {
      const { datei, dateiname } = await baueExport(auftrag({ umfang: "einzeln", gewaehlt: 2, nummer: EINSAETZE[1].nummer, anker: null }), KENNWORT);
      expect(datei.kopf).toMatchObject({ umfang: "einzeln", von: 2, bis: 2, anzahl: 1 });
      expect(dateiname).toBe(`einsatz_${EINSAETZE[1].nummer}.einsatzbuch`);

      const inhalt = await entschluesseleExport(datei, KENNWORT);
      expect(inhalt.bloecke).toEqual([BLOECKE[1]]);
      expect(Object.keys(inhalt.schluessel)).toEqual(["2"]);
      expect(inhalt.schluessel["2"]).toBe(CEKS[1].cek);
      expect(inhalt.anker).toBeNull();
    },
    LANGSAM,
  );

  it("„einzeln“ ohne Wahl nimmt den neuesten Block", async () => {
    const { datei } = await baueExport(auftrag({ umfang: "einzeln", nummer: EINSAETZE[2].nummer }), KENNWORT);
    expect(datei.kopf).toMatchObject({ von: 3, bis: 3, anzahl: 1 });
  }, LANGSAM);

  it("das Datum im Dateinamen gilt in der Zone der Einrichtung, nicht in UTC", async () => {
    const { dateiname } = await baueExport(auftrag({ erstellt: "2026-09-24T23:30:00Z" }), KENNWORT);
    expect(dateiname).toBe("einsatzbuch_2026-09-25_block-1-3.einsatzbuch");
  }, LANGSAM);

  it("ein Kennwort unter 10 Zeichen scheitert, bevor etwas verschlüsselt wird", async () => {
    await expect(baueExport(auftrag(), "zu-kurz")).rejects.toThrow("mindestens 10 Zeichen");
  });

  it("fehlt der Schlüssel eines ausgewählten Blocks, entsteht keine Datei", async () => {
    const ohne = ceks();
    ohne.delete(2);
    await expect(baueExport(auftrag({ ceks: ohne }), KENNWORT)).rejects.toThrow("Für Block 2 fehlt der Schlüssel.");
  });

  it("ein unbekannter gewählter Block scheitert", async () => {
    await expect(baueExport(auftrag({ umfang: "einzeln", gewaehlt: 9 }), KENNWORT)).rejects.toThrow("Block 9 gibt es auf diesem Rechner nicht.");
  });

  it("ohne Blöcke gibt es nichts zu exportieren", async () => {
    await expect(baueExport(auftrag({ bloecke: [] }), KENNWORT)).rejects.toThrow("Es gibt keine Einsätze zum Herunterladen.");
  });
});
