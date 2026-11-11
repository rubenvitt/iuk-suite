import { describe, expect, it } from "vitest";
import { darfVerpflegungFaelligkeitenSehen, vermerkeVerpflegungSofortmeldungen, verpflegungFaelligkeiten, verpflegungSofortmeldungen } from "./faelligkeiten";
import { artikelAnlegen, eingang, ortAnlegen } from "./schreiben";
import { testDb } from "./testDb";

// 04.11.2026 in Europe/Berlin: 10:00 UTC = 11:00, 05:00 UTC = 06:00.
const ELF = new Date(Date.UTC(2026, 10, 4, 10));
const SECHS = new Date(Date.UTC(2026, 10, 4, 5));
const W = { jetzt: Date.UTC(2026, 9, 1), heute: "2026-10-01", wer: "Leitung Verpflegung", linkId: null };

function lager() {
  const db = testDb();
  const ort = ortAnlegen(db, { name: "Kühlschrank Küche", kurz: "Kühlschrank", gekuehlt: true }, W.jetzt);
  const neu = (name: string, mhdArt: "mhd" | "verbrauch") => artikelAnlegen(db, {
    name, ean: null, kategorie: "Kühlware", einheit: "Packung", mhdArt, rotTage: 3, gelbTage: 10, mindest: null,
  }, W.jetzt);
  const joghurt = neu("Joghurt", "mhd");
  const wurst = neu("Würstchen", "verbrauch");
  const kaese = neu("Käse", "mhd");
  eingang(db, { artikelId: joghurt, ortId: ort, mhd: "2026-11-04", menge: 6 }, W); // heute
  eingang(db, { artikelId: wurst, ortId: ort, mhd: "2026-11-05", menge: 2 }, W); // Verbrauchsdatum morgen
  eingang(db, { artikelId: kaese, ortId: ort, mhd: "2026-11-02", menge: 1 }, W); // abgelaufen
  eingang(db, { artikelId: kaese, ortId: ort, mhd: "2026-12-24", menge: 1 }, W); // gut
  return db;
}

describe("Was steht an", () => {
  it("gibt jede Charge mit roter Ampel heraus, abgelaufene als überfällig, heute ablaufende als fällig", () => {
    const f = verpflegungFaelligkeiten(ELF, lager());
    expect(f.map((x) => [x.titel, x.dringlichkeit, x.art])).toEqual([
      ["Käse · 1 Packung", "ueberfaellig", "MHD"],
      ["Joghurt · 6 Packungen", "faellig", "MHD"],
      ["Würstchen · 2 Packungen", "bald", "Verbrauchsdatum"],
    ]);
    expect(f.every((x) => x.pfad.startsWith("/bestand?stufe=") && x.wo === "Kühlschrank")).toBe(true);
  });

  it("meldet ab 07:00 einmal am Tag, was heute abläuft oder morgen das Verbrauchsdatum erreicht", () => {
    const db = lager();
    expect(verpflegungSofortmeldungen(SECHS, db)).toEqual([]);
    const [m, ...rest] = verpflegungSofortmeldungen(ELF, db);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({ id: "tag:2026-11-04", art: "MHD heute", titel: "MHD heute: 2 Chargen", pfad: "/bestand?stufe=kritisch" });
    expect(m.zeilen.join("\n")).toMatch(/Joghurt.*heute/);
    expect(m.zeilen.join("\n")).toMatch(/Würstchen.*morgen/);
    vermerkeVerpflegungSofortmeldungen([m.id], ELF, db);
    expect(verpflegungSofortmeldungen(ELF, db)).toEqual([]);
  });

  it("zeigt die Fristen nur der Verpflegungsgruppe, nicht dem Suite-Admin allein", () => {
    expect(darfVerpflegungFaelligkeitenSehen(["verpflegung-nutzer"])).toBe(true);
    expect(darfVerpflegungFaelligkeitenSehen(["verpflegung-admin"])).toBe(true);
    expect(darfVerpflegungFaelligkeitenSehen(["admin"])).toBe(false);
    expect(darfVerpflegungFaelligkeitenSehen(null)).toBe(false);
  });
});
