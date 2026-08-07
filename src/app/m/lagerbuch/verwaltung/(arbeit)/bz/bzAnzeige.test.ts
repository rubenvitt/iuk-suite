import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BzGeraetZeile } from "../../../_lib/lesepfade/bz";
import {
  bzAnzeigeZeilen,
  faelligText,
  type BzAnzeigeZeile,
} from "./bzAnzeige";

function zeile(
  id: string,
  faelligkeit: BzGeraetZeile["faelligkeit"],
  letzteKontrolle: Date | null,
): BzGeraetZeile {
  return {
    id,
    name: `Gerät ${id}`,
    barcode: `CODE-${id}`,
    lagerortName: `Standort ${id}`,
    aktiv: true,
    letzteKontrolle,
    letztesBestanden: letzteKontrolle === null ? null : true,
    faelligkeit,
  };
}

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
}

describe("BZ-Anzeigeprojektion", () => {
  it.each([
    [
      { nieGeprueft: true, ueberfaellig: false, tageBisFaellig: null },
      "noch nie geprüft",
    ],
    [
      { nieGeprueft: false, ueberfaellig: true, tageBisFaellig: -3 },
      "überfällig (seit 3 Tagen)",
    ],
    [
      { nieGeprueft: false, ueberfaellig: false, tageBisFaellig: 0 },
      "heute fällig",
    ],
    [
      { nieGeprueft: false, ueberfaellig: false, tageBisFaellig: 8 },
      "fällig in 8 Tagen",
    ],
  ])("benennt den Fälligkeitszustand %# exakt", (faelligkeit, erwartet) => {
    expect(faelligText(faelligkeit)).toBe(erwartet);
  });

  it("bildet Ampeltöne, Zeitpunkt und den fachlichen Fälligkeitsfilter serverseitig ab", () => {
    const eingabe: BzGeraetZeile[] = [
      zeile("nie", {
        faelligAm: null,
        tageBisFaellig: null,
        ampel: "rot",
        ueberfaellig: false,
        nieGeprueft: true,
      }, null),
      zeile("ueberfaellig", {
        faelligAm: new Date("2026-08-04T10:00:00Z"),
        tageBisFaellig: -3,
        ampel: "rot",
        ueberfaellig: true,
        nieGeprueft: false,
      }, new Date("2026-08-07T10:34:00Z")),
      zeile("heute", {
        faelligAm: new Date("2026-08-07T10:00:00Z"),
        tageBisFaellig: 0,
        ampel: "gelb",
        ueberfaellig: false,
        nieGeprueft: false,
      }, new Date("2026-07-07T08:00:00Z")),
      zeile("spaeter", {
        faelligAm: new Date("2026-08-15T10:00:00Z"),
        tageBisFaellig: 8,
        ampel: "gruen",
        ueberfaellig: false,
        nieGeprueft: false,
      }, new Date("2026-07-15T08:00:00Z")),
    ];

    const anzeige = bzAnzeigeZeilen(eingabe);

    expect(anzeige.map((wert) => ({
      id: wert.id,
      ton: wert.faelligkeitTon,
      text: wert.faelligkeitText,
      faellig: wert.faellig,
      letzteKontrolleText: wert.letzteKontrolleText,
    }))).toEqual([
      {
        id: "nie",
        ton: "rot",
        text: "noch nie geprüft",
        faellig: true,
        letzteKontrolleText: null,
      },
      {
        id: "ueberfaellig",
        ton: "rot",
        text: "überfällig (seit 3 Tagen)",
        faellig: true,
        letzteKontrolleText: "07.08. 12:34",
      },
      {
        id: "heute",
        ton: "gelb",
        text: "heute fällig",
        faellig: true,
        letzteKontrolleText: "07.07. 10:00",
      },
      {
        id: "spaeter",
        ton: "ok",
        text: "fällig in 8 Tagen",
        faellig: false,
        letzteKontrolleText: "15.07. 10:00",
      },
    ]);
  });

  it("liefert ein kleines, rekursiv Date-freies DTO aus einem directive-freien Modul", () => {
    const eingabe = zeile("dto", {
      faelligAm: new Date("2026-08-10T10:00:00Z"),
      tageBisFaellig: 3,
      ampel: "gelb",
      ueberfaellig: false,
      nieGeprueft: false,
    }, new Date("2026-07-10T10:00:00Z"));

    const anzeige: BzAnzeigeZeile[] = bzAnzeigeZeilen([eingabe]);

    expect(Object.keys(anzeige[0]).sort()).toEqual([
      "aktiv",
      "barcode",
      "faellig",
      "faelligkeitText",
      "faelligkeitTon",
      "id",
      "lagerortName",
      "letzteKontrolleText",
      "name",
    ]);
    expect(anzeige[0]).not.toHaveProperty("letzteKontrolle");
    expect(anzeige[0]).not.toHaveProperty("faelligkeit");
    expect(anzeige[0]).not.toHaveProperty("faelligAm");
    expect(enthaeltDate(anzeige)).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/bzAnzeige.ts",
      "utf8",
    );
    expect(quelle).not.toMatch(/^\s*["']use client["']/);
  });
});
