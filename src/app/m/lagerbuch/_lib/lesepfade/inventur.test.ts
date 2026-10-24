import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { zaehlBereich } from "./orte";
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
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true, templateId: null },
    { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null, aktiv: true,
      templateId: null, parentId: HANDLAGER_ID, sortierung: 10 },
  ]).run();
});
afterEach(() => t.schliessen());

describe("inventurZeilen", () => {
  it("liefert nur aktive Artikel mit Kategorie, Mindestbestand und Handlager-Bestand", () => {
    art("aktiv", { kategorie: "Hygiene", mindestbestand: 5 });
    art("inaktiv", { aktiv: false });
    expect(inventurZeilen(t.db, JETZT)).toEqual([{
      id: "aktiv", name: "aktiv", einheit: "Stk.", fach: "A1",
      kategorie: "Hygiene", mindestbestand: 5, bestand: 0, ungeordnet: 0, chargen: [],
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

  /**
   * DRK-337 — DIE ERWARTUNGSZAHL GEHOERT ZUM ORT. Derselbe Artikel liegt an
   * drei Stellen; wer vor Schrank 1 steht, liest 6, nicht 12.
   */
  it("bezieht Bestand und Chargenrest auf den uebergebenen Bereich", () => {
    art("a");
    charge("c", "a", "2029-01");
    buche("a", "c", 4);
    buche("a", "c", 6, "schrank-1");
    buche("a", "c", 2, "rtw-1");

    const ganz = inventurZeilen(t.db, JETZT)[0]!;
    expect([ganz.bestand, ganz.chargen[0]!.rest]).toEqual([10, 10]);

    const schrank = inventurZeilen(t.db, JETZT, zaehlBereich(t.db, "schrank-1")!)[0]!;
    expect([schrank.bestand, schrank.chargen[0]!.rest]).toEqual([6, 6]);

    // Die Wurzel meint NUR die Wurzel — „noch keinem Schrank zugeordnet".
    const wurzel = inventurZeilen(t.db, JETZT, zaehlBereich(t.db, HANDLAGER_ID)!)[0]!;
    expect([wurzel.bestand, wurzel.chargen[0]!.rest]).toEqual([4, 4]);
  });

  /**
   * ⚠️ DIE ZEILE BLEIBT, AUCH OHNE BESTAND AM ORT. Ein Artikel ohne Bestand an
   * diesem Ort ist trotzdem zaehlbar — sonst koennte man ueberraschend
   * Gefundenes nicht erfassen, und genau dafuer zaehlt man.
   */
  it("behaelt Artikel ohne Bestand am Ort, zeigt dort aber keine Charge eines anderen Schranks", () => {
    t.db.insert(lagerorte).values({ id: "schrank-2", name: "Schrank 2", typ: "lager", kennung: null,
      aktiv: true, templateId: null, parentId: HANDLAGER_ID, sortierung: 20 }).run();
    art("a");
    charge("c", "a", "2029-01");
    buche("a", "c", 5, "schrank-2");

    const schrank = inventurZeilen(t.db, JETZT, zaehlBereich(t.db, "schrank-1")!);
    expect(schrank).toHaveLength(1);
    expect(schrank[0]!.bestand).toBe(0);
    expect(schrank[0]!.chargen).toEqual([]);
  });

  /**
   * IDA-276 — VOR EINEM SCHRANK STEHT AUCH, WAS NOCH AUF „NICHT ZUGEORDNET"
   * LIEGT. Der Handlager hatte lange keine Schraenke; ohne diese Chargen
   * koennte die Zaehlung im Schrank sie nur als NEUE Charge erfassen, und der
   * Bestand stuende danach doppelt da.
   */
  it("zeigt vor einem Schrank die Chargen von „Nicht zugeordnet“ mit ihrem Rest dort", () => {
    art("a");
    charge("c", "a", "2029-01");
    charge("d", "a", "2027-01");
    buche("a", "c", 30);
    buche("a", "d", 2, "schrank-1");
    buche("a", "d", 1);

    const [schrank] = inventurZeilen(t.db, JETZT, zaehlBereich(t.db, "schrank-1")!);
    expect(schrank!.bestand).toBe(2);
    expect(schrank!.ungeordnet).toBe(31);
    expect(schrank!.chargen.map((c) => [c.id, c.rest, c.ungeordnet])).toEqual([["d", 2, 1], ["c", 0, 30]]);

    // Gehoert die Wurzel zum Bereich, steht sie im Rest und nicht daneben.
    const [ganz] = inventurZeilen(t.db, JETZT);
    expect(ganz!.ungeordnet).toBe(0);
    expect(ganz!.chargen.map((c) => [c.id, c.rest, c.ungeordnet])).toEqual([["d", 3, 0], ["c", 30, 0]]);
    const [wurzel] = inventurZeilen(t.db, JETZT, zaehlBereich(t.db, HANDLAGER_ID)!);
    expect(wurzel!.ungeordnet).toBe(0);
  });
});
