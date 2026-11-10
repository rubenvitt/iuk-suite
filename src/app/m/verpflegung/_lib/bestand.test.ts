import { describe, expect, it } from "vitest";
import { artikelZeilen, chargeInStufe, stufeAus, zustandAus } from "./bestand";
import { mhdStatus } from "./mhd";
import type { ArtikelDTO, ChargeSicht } from "./typen";

/** IDA-382 — Bestand je Artikel: gesperrte und abgelaufene Menge als Zahl, Stufen zählen wie die Kennzahlen. */
const HEUTE = "2026-11-10";
const art = (id: string, mhdArt: "mhd" | "verbrauch", mindest: number | null = null): ArtikelDTO => ({
  id, name: id, ean: null, kategorie: "Kühlware", einheit: "Packung", mhdArt, rotTage: 7, gelbTage: 30, mindest, vorlaeufig: false, aktiv: true,
});
const WURST = art("Würstchen", "verbrauch", 12);
const EINTOPF = art("Eintopf", "mhd");
const LEER = art("Brot", "mhd");
const charge = (a: ArtikelDTO, id: string, mhd: string, menge: number): ChargeSicht => ({
  id, artikelId: a.id, ortId: "o", mhd, menge, eingang: "2026-10-01", status: mhdStatus(mhd, a, HEUTE),
  artikelName: a.name, einheit: a.einheit, mhdArt: a.mhdArt, kategorie: a.kategorie, ortName: "Regal", ortKurz: "R",
});
const CHARGEN = [
  charge(WURST, "w1", "2026-11-08", 2), // gesperrt
  charge(WURST, "w2", "2026-12-20", 8), // gut
  charge(EINTOPF, "e1", "2026-11-07", 4), // abgelaufen
  charge(EINTOPF, "e2", "2026-11-12", 6), // kritisch
  charge(EINTOPF, "e3", "2026-11-30", 30), // bald
];

describe("Bestand je Artikel (IDA-382)", () => {
  it("nennt gesperrte und abgelaufene Menge statt des schlechtesten Etiketts", () => {
    expect(zustandAus(CHARGEN.filter((c) => c.artikelId === WURST.id))).toEqual({ gesperrt: 2, abgelaufen: 0 });
    expect(zustandAus(CHARGEN.filter((c) => c.artikelId === EINTOPF.id))).toEqual({ gesperrt: 0, abgelaufen: 4 });
  });

  it("zeigt unter „Alle“ jeden aktiven Artikel mit allen Chargen, auch ohne Bestand", () => {
    const z = artikelZeilen([WURST, EINTOPF, LEER], CHARGEN, "alle");
    expect(z.map((x) => [x.name, x.gesamt, x.chargen.length])).toEqual([["Würstchen", 10, 2], ["Eintopf", 40, 3], ["Brot", 0, 0]]);
    expect(z[0].gueltig).toBe(8);
  });

  it("zeigt in einer Ampelstufe nur die gezählten Chargen", () => {
    for (const stufe of ["abgelaufen", "kritisch", "bald"] as const) {
      const gezaehlt = CHARGEN.filter((c) => chargeInStufe(c, stufe)).map((c) => c.id).sort();
      const gezeigt = artikelZeilen([WURST, EINTOPF, LEER], CHARGEN, stufe).flatMap((x) => x.chargen.map((c) => c.id)).sort();
      expect(gezeigt, stufe).toEqual(gezaehlt);
    }
    expect(artikelZeilen([WURST, EINTOPF], CHARGEN, "abgelaufen").map((x) => x.name)).toEqual(["Würstchen", "Eintopf"]);
  });

  it("„Unter Mindestbestand“ rechnet ohne Abgelaufenes", () => {
    expect(artikelZeilen([WURST, EINTOPF], CHARGEN, "mindest").map((x) => x.name)).toEqual(["Würstchen"]);
  });

  it("liest die Stufe aus der Adresse und fällt sonst auf „Alle“", () => {
    expect(stufeAus("kritisch")).toBe("kritisch");
    expect(stufeAus("quatsch")).toBe("alle");
    expect(stufeAus(["bald"])).toBe("alle");
  });
});
