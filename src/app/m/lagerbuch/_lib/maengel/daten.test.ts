import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import {
  erledigeMangel, erledigteMaengel, legeMangelAn, meldeOrt, meldeOrte, oeffneMangelWieder,
  offeneMaengel, ungemeldeteMaengel, vermerkeGemeldet,
} from "./daten";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
  t.db.insert(lagerorte).values([
    { id: "schrank-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, sortierung: 1 },
    { id: "rtw", name: "RTW 1", typ: "fahrzeug", kennung: "DRK 1-83-1", einheitenart: "fahrzeug" },
    { id: "tasche", name: "Notfallrucksack", typ: "fahrzeug", einheitenart: "tasche" },
    { id: "alt", name: "Altes Auto", typ: "fahrzeug", einheitenart: "fahrzeug", aktiv: false },
  ]).run();
});
afterEach(() => t.schliessen());

const QUELLE = { quelleTyp: "token" as const, quelleId: "123-456" };

function melde(ortId: string, jetzt: Date, punkte = ["Verschmutzt"]): string {
  return legeMangelAn(t.db, { lagerortId: ortId, punkte, beschreibung: null, melderName: null, quelle: QUELLE, fotos: 0, jetzt });
}

describe("Orte für eine Mängelmeldung", () => {
  it("führt Handlager, Schränke und Einheiten, ohne Stillgelegtes und ohne Entnahmebox", () => {
    const orte = meldeOrte(t.db);
    expect(orte.map((o) => o.id)).toEqual(expect.arrayContaining(["handlager", "schrank-1", "rtw", "tasche"]));
    expect(orte.map((o) => o.id)).not.toContain("alt");
    expect(orte.map((o) => o.id)).not.toContain("entnahmebox");
    expect(orte[0]!.id).toBe(HANDLAGER_ID);
  });

  it("benennt Schrank mit Elternort und Fahrzeug mit Kennzeichen", () => {
    expect(meldeOrt(t.db, "schrank-1")).toMatchObject({ anzeige: "Handlager · Schrank 1", art: "schrank" });
    expect(meldeOrt(t.db, "rtw")).toMatchObject({ anzeige: "RTW 1 (DRK 1-83-1)", art: "fahrzeug" });
    expect(meldeOrt(t.db, "tasche")?.art).toBe("tasche");
    expect(meldeOrt(t.db, "alt")).toBeNull();
    expect(meldeOrt(t.db, undefined)).toBeNull();
  });
});

describe("Mängel", () => {
  it("legt an, listet offen nach Alter und erledigt genau einmal", () => {
    const spaet = melde("rtw", new Date("2026-10-31T12:00:00Z"));
    const frueh = melde("schrank-1", new Date("2026-10-30T12:00:00Z"), ["Fach oder Regal beschädigt"]);
    expect(offeneMaengel(t.db).map((m) => m.id)).toEqual([frueh, spaet]);
    expect(offeneMaengel(t.db)[0]).toMatchObject({ ort: "Handlager · Schrank 1", punkte: ["Fach oder Regal beschädigt"] });

    const jetzt = new Date("2026-10-31T13:00:00Z");
    expect(erledigeMangel(t.db, spaet, "sub-1", "Reifen gewechselt", jetzt)).toBe(true);
    expect(erledigeMangel(t.db, spaet, "sub-1", null, jetzt)).toBe(false);
    expect(offeneMaengel(t.db).map((m) => m.id)).toEqual([frueh]);
    expect(erledigteMaengel(t.db)).toMatchObject([{ id: spaet, erledigtVermerk: "Reifen gewechselt" }]);

    expect(oeffneMangelWieder(t.db, spaet)).toBe(true);
    expect(oeffneMangelWieder(t.db, spaet)).toBe(false);
    expect(offeneMaengel(t.db)).toHaveLength(2);
  });

  it("gibt dem Push nur Offenes, Ungemeldetes und Frisches", () => {
    const alt = melde("rtw", new Date("2026-10-01T12:00:00Z"));
    const neu = melde("rtw", new Date("2026-10-31T12:00:00Z"));
    const erledigt = melde("rtw", new Date("2026-10-31T12:01:00Z"));
    erledigeMangel(t.db, erledigt, "sub", null, new Date());
    const seit = new Date("2026-10-30T12:00:00Z");
    expect(ungemeldeteMaengel(t.db, seit).map((m) => m.id)).toEqual([neu]);
    vermerkeGemeldet(t.db, [neu], new Date());
    expect(ungemeldeteMaengel(t.db, seit)).toEqual([]);
    expect(alt).toBeTruthy();
  });
});

describe("Mängel auf „Was steht an“ und im Sofort-Push", () => {
  it("gibt offene Mängel als überfällig heraus und den Push ohne Freitext und Namen", async () => {
    const { lagerbuchFaelligkeiten, lagerbuchSofortmeldungen, vermerkeLagerbuchSofortmeldungen } = await import("../faelligkeiten");
    const jetzt = new Date("2026-10-31T12:00:00Z");
    legeMangelAn(t.db, {
      lagerortId: "rtw", punkte: ["Verschmutzt", "Ausrüstung fehlt"], beschreibung: "Geheimer Freitext",
      melderName: "Kim Muster", quelle: QUELLE, fotos: 2, jetzt,
    });
    const faellig = lagerbuchFaelligkeiten(jetzt, t.db).filter((f) => f.art === "Mangel");
    expect(faellig).toMatchObject([{ titel: "Verschmutzt und 1 weitere", wo: "RTW 1 (DRK 1-83-1)", dringlichkeit: "ueberfaellig", pfad: "/verwaltung/maengel" }]);

    const push = lagerbuchSofortmeldungen(new Date("2026-10-30T12:00:00Z"), t.db);
    expect(push).toEqual([{
      id: expect.any(String), art: "Mangel", titel: "Mangel gemeldet: RTW 1 (DRK 1-83-1)",
      zeilen: ["• Verschmutzt", "• Ausrüstung fehlt", "2 Fotos"], pfad: "/verwaltung/maengel",
    }]);
    expect(JSON.stringify(push)).not.toMatch(/Geheimer|Kim/);
    vermerkeLagerbuchSofortmeldungen([push[0]!.id], jetzt, t.db);
    expect(lagerbuchSofortmeldungen(new Date("2026-10-30T12:00:00Z"), t.db)).toEqual([]);
  });
});
