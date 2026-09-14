import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { inventurZeilen } from "./inventur";

const JETZT = new Date("2026-09-14T10:00:00Z");
let t: TestDb;
let nr = 0;

function art(id: string, extra: Partial<typeof artikel.$inferInsert> = {}) {
  t.db.insert(artikel).values({
    id, name: id, einheit: "Stk.", fach: "A1", mindestbestand: 2, aktiv: true,
    createdAt: JETZT, kategorie: null, ...extra,
  }).run();
}
function charge(id: string, artikelId: string, verfall: string) {
  t.db.insert(chargen).values({ id, artikelId, chargenNr: `Nr-${id}`, verfall, createdAt: JETZT }).run();
}
function buche(artikelId: string, chargeId: string, menge: number, lagerortId = HANDLAGER_ID) {
  t.db.insert(buchungen).values({
    id: `b-${++nr}`, ts: JETZT, typ: "zugang", artikelId, chargeId, lagerortId, menge,
    quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null,
  }).run();
}

beforeEach(() => {
  nr = 0;
  t = migrierteTestDb("lagerbuch-lesepfad-inventur-");
  t.db.insert(lagerorte).values({ id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true, templateId: null }).run();
});
afterEach(() => t.schliessen());

describe("inventurZeilen", () => {
  it("liefert nur aktive Artikel mit Kategorie, Mindestbestand und Handlager-Bestand", () => {
    art("aktiv", { kategorie: "Hygiene", mindestbestand: 5 });
    art("inaktiv", { aktiv: false });
    expect(inventurZeilen(t.db, JETZT)).toEqual([{
      id: "aktiv", name: "aktiv", einheit: "Stk.", fach: "A1",
      kategorie: "Hygiene", mindestbestand: 5, bestand: 0, chargen: [],
    }]);
  });

  it("zeigt nur Chargen mit Handlager-Rest > 0, FEFO-sortiert, ohne Fahrzeugbestand", () => {
    art("a");
    charge("spaet", "a", "2029-01");
    charge("frueh", "a", "2026-10");
    charge("leer", "a", "2026-09");
    charge("nur-rtw", "a", "2027-01");
    buche("a", "spaet", 3);
    buche("a", "frueh", 2);
    buche("a", "leer", 1); buche("a", "leer", -1);
    buche("a", "nur-rtw", 4, "rtw-1");

    const [zeile] = inventurZeilen(t.db, JETZT);
    expect(zeile!.bestand).toBe(5);
    expect(zeile!.chargen.map((c) => [c.id, c.rest])).toEqual([["frueh", 2], ["spaet", 3]]);
    expect(zeile!.chargen[0]).toMatchObject({ chargenNr: "Nr-frueh", verfall: "2026-10", ampel: "gelb" });
    expect(zeile!.chargen[1]!.ampel).toBe("gruen");
  });
});
