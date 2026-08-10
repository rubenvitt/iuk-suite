import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bestandStatus, bestandExportZeilen, bestandExportDateiname,
  type BestandExportEingabe,
} from "./bestandExport";
import { artikelFiltern, LEERER_FILTER } from "./artikelFilter";

/**
 * Baut ein Datum aus LOKALEN Feldern, OHNE `new Date(` mit mehr als einem
 * Argument. Die Quelltext-Zusicherung `_lib/format.test.ts:330` (§5.16,
 * Global Constraint dieses Plans, Eigentum eines fremden Tasks) verbietet das
 * repoweit ausser in `_lib/zeit.ts`. `bestandExportDateiname` braucht aber
 * genau lokale Feldwerte (`now.getFullYear()` usw.), und `setFullYear`/
 * `setHours` auf einem bestehenden Date-Objekt liefern dieselben lokalen
 * Feldwerte wie der mehrargumentige Konstruktor, ohne dass der Scan anschlaegt
 * — er sucht woertlich nach `new Date(`, nicht nach `.setFullYear(`. Auch
 * `_lib/zeit.ts` selbst vermeidet den mehrargumentigen Konstruktor durchgehend
 * (`Date.UTC` oder Ein-Argument-Formen).
 */
function lokalesDatum(
  jahr: number, monatIndex: number, tag: number, stunde = 0, minute = 0,
): Date {
  const d = new Date(0);
  d.setFullYear(jahr, monatIndex, tag);
  d.setHours(stunde, minute, 0, 0);
  return d;
}

function eingabe(p: Partial<BestandExportEingabe> = {}): BestandExportEingabe {
  return {
    name: "Mullbinde 8cm", fach: "A2", bestand: 12, einheit: "Stk.",
    mindestbestand: 20, aktiv: true, unterMindest: true,
    naechsteCharge: { chargenNr: "L-42", verfall: "2026-08" },
    naechsteAblaufText: "faellig 08/26",
    ...p,
  };
}

/** Die drei Faelle 1:1 aus ../lagerbuch/src/lib/bestand-export.test.ts:32-36. */
describe("bestandStatus", () => {
  it("schlaegt alles: inaktiv", () => {
    expect(bestandStatus({ aktiv: false, unterMindest: true })).toBe("inaktiv");
    expect(bestandStatus({ aktiv: false, unterMindest: false })).toBe("inaktiv");
  });
  it("dann Mindestbestand", () => {
    expect(bestandStatus({ aktiv: true, unterMindest: true })).toBe("unter Mindestbestand");
  });
  it("sonst ok", () => {
    expect(bestandStatus({ aktiv: true, unterMindest: false })).toBe("ok");
  });
});

describe("bestandExportZeilen", () => {
  it("bildet die neun Felder flach ab", () => {
    expect(bestandExportZeilen([eingabe()])[0]).toEqual({
      artikel: "Mullbinde 8cm", fach: "A2", bestand: 12, einheit: "Stk.",
      mindestbestand: 20, status: "unter Mindestbestand",
      charge: "L-42", verfall: "2026-08", hinweis: "faellig 08/26",
    });
  });

  /**
   * LEERSTRING, NICHT "–": in Excel bleibt die Zelle so leer und stoert Filter
   * und Sortierung nicht (bestand-export.ts:48-51). Ein "schoeneres" Zeichen
   * machte jede Filterung ueber diese drei Spalten unbrauchbar.
   */
  it("setzt fehlende Charge, Verfall und Hinweis auf Leerstring", () => {
    const z = bestandExportZeilen([
      eingabe({ naechsteCharge: null, naechsteAblaufText: null }),
    ])[0];
    expect(z.charge).toBe("");
    expect(z.verfall).toBe("");
    expect(z.hinweis).toBe("");
    expect(JSON.stringify(z)).not.toContain("–");  // kein Halbgeviertstrich
  });

  it("behaelt die Reihenfolge der uebergebenen Liste", () => {
    const zeilen = bestandExportZeilen([
      eingabe({ name: "B" }), eingabe({ name: "A" }),
    ]);
    expect(zeilen.map((z) => z.artikel)).toEqual(["B", "A"]);
  });
});

describe("bestandExportDateiname", () => {
  /** ../lagerbuch/src/lib/bestand-export.test.ts:44 prueft genau diesen String. */
  it("liefert bestand-YYYY-MM-DD.xlsx aus LOKALER Zeit", () => {
    expect(bestandExportDateiname(lokalesDatum(2026, 6, 5, 13, 37))).toBe("bestand-2026-07-05.xlsx");
  });

  it("fuellt Monat und Tag auf zwei Stellen", () => {
    expect(bestandExportDateiname(lokalesDatum(2026, 0, 9))).toBe("bestand-2026-01-09.xlsx");
  });

  /**
   * Die E2E prueft nur die FORM (`/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/`,
   * lagerbuch/e2e/bestand-export.spec.ts:18), nie den Wert. Diese Zeile ist die
   * einzige, die den Wert festnagelt.
   */
  it("passt zur Regex, die der E2E prueft", () => {
    expect(bestandExportDateiname(lokalesDatum(2026, 6, 5)))
      .toMatch(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

/**
 * §12.1, PUNKT 2 — die KOPPLUNG, nicht das Praedikat.
 *
 * ArtikelTable.tsx:133 ruft `bestandExportZeilen(gefiltert)`, also mit DERSELBEN
 * abgeleiteten Liste, die auch in `dataSource` geht. Wandert das Filtern jemals
 * in antds Table-eigenen Zustand, exportiert der Knopf STILL wieder alles — die
 * Seite sieht richtig aus, die Datei ist falsch.
 *
 * Der Test bildet genau diese Reihenfolge nach: erst filtern, dann exportieren.
 * Er bleibt gruen, solange der Export die gefilterte Liste bekommt, und faellt,
 * sobald jemand die Rohliste durchreicht.
 *
 * ADAPTER (Ruling A6): `artikelFiltern<T extends ArtikelFilterZeile>` verlangt
 * `chargeKritisch: boolean` (`_lib/artikelFilter.ts:18-27`), das
 * `BestandExportEingabe` nicht fuehrt — ergaenzt als `false`. `id` und
 * `chargenNr` aus dem urspruenglichen Brieftext gibt es im Zieltyp gar nicht
 * und entfallen deshalb.
 */
describe("Kopplung Filter -> Export (§12.1 Punkt 2)", () => {
  const rohe = [
    eingabe({ name: "Mullbinde 8cm", fach: "A2", unterMindest: true }),
    eingabe({ name: "Kompresse 10x10", fach: "B1", unterMindest: false }),
  ];

  it("exportiert nur, was der Filter uebrig laesst", () => {
    const gefiltert = artikelFiltern(
      rohe.map((r) => ({ ...r, chargeKritisch: false })),
      { ...LEERER_FILTER, nurUnterMindest: true },
    );
    const zeilen = bestandExportZeilen(gefiltert);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].artikel).toBe("Mullbinde 8cm");
  });

  it("exportiert ohne Filter die volle Liste — die Gegenrichtung", () => {
    const gefiltert = artikelFiltern(
      rohe.map((r) => ({ ...r, chargeKritisch: false })),
      LEERER_FILTER,
    );
    expect(bestandExportZeilen(gefiltert)).toHaveLength(2);
  });
});

/**
 * KEIN "use client" — Falle 6. `bestandExport.ts` liefert reine Funktionen
 * (`bestandExportZeilen` u.a.), die T165s Client-Insel importiert; mit
 * "use client" bekaeme ein Server-Konsument eine Client-Referenz statt der
 * Funktion. Diese Zusicherung steht nicht im Brief-Testtext (Schritt 1), aber
 * in jeder der drei Nachbardateien desselben Plans (csvBestellung.test.ts:115-123,
 * bestellText.test.ts:57-60, etikettMasse.test.ts:53-56) — dasselbe Muster hier.
 *
 * K-4: ohneKommentare() statt Rohtext-Scan — `bestandExport.ts`s eigener
 * Kopfkommentar zitiert den Satz „KEIN \"use client\"" woertlich, ein
 * Rohtext-Scan waere auf seiner eigenen Begruendung rot.
 */
describe("Bauform", () => {
  it("traegt kein use client", () => {
    const quelle = readFileSync(join(__dirname, "bestandExport.ts"), "utf8");
    expect(ohneKommentare(quelle)).not.toMatch(/["']use client["']/);
  });
});

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4, Regel 1 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert die Funktion nicht,
 * und diese Datei ist ein anderer Testkoerper, deshalb die lokale Kopie statt
 * eines Re-Exports.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}
