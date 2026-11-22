import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  artikel, buchungen, chargen, geraete, lagerorte, lagerortVerfall, o2Flaschen, plomben, sollPositionen,
} from "../../_db/schema";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "../konstanten";
import { korrekturAufLagerort } from "../schreibpfade/korrektur";
import { verwaltungscheckDaten } from "./verwaltungscheck";

const JETZT = new Date("2026-08-07T12:00:00Z");
let t: TestDb;

beforeEach(() => {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
  t = migrierteTestDb("lagerbuch-lp-verwaltungscheck-");
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", einheitenart: "fahrzeug", aktiv: true },
    { id: "fz-2", name: "RTW 2", typ: "fahrzeug", kennung: "MS-2", einheitenart: "fahrzeug", aktiv: true },
    { id: "fz-aus", name: "Alt", typ: "fahrzeug", kennung: null, einheitenart: "fahrzeug", aktiv: false },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Mullbinde", einheit: "Stk", fach: "C2", mindestbestand: 0, aktiv: true, createdAt: JETZT },
    { id: "a2", name: "Grabstein-Artikel", einheit: "Stk", fach: "C3", mindestbestand: 0, aktiv: true, createdAt: JETZT },
  ]).run();
  t.db.insert(sollPositionen).values([
    { id: "p1", fahrzeugId: "fz-1", fachLabel: "Fach A", sort: 1, artikelId: "a1", soll: 3, sollMax: 5 },
    { id: "p-grab", fahrzeugId: "fz-1", fachLabel: "Fach X", sort: 2, artikelId: "a2", soll: 4, entfernt: true },
  ]).run();
  t.db.insert(chargen).values({
    id: "c1", artikelId: "a1", chargenNr: "LOT-1", verfall: "2030-01", createdAt: JETZT,
  }).run();
  t.db.insert(buchungen).values([
    { id: "b1", ts: JETZT, typ: "zugang", artikelId: "a1", chargeId: "c1", lagerortId: "fz-1", menge: 2,
      quelleTyp: "system", quelleId: "t" },
    { id: "b2", ts: JETZT, typ: "zugang", artikelId: "a1", chargeId: "c1", lagerortId: HANDLAGER_ID, menge: 9,
      quelleTyp: "system", quelleId: "t" },
  ]).run();
  t.db.insert(lagerortVerfall).values({
    id: "v1", lagerortId: "fz-1", artikelId: "a1", verfall: "2027-03", erfasstAt: JETZT,
    quelleTyp: "system", quelleId: "t",
  }).run();
  t.db.insert(plomben).values([
    { id: "pl-a", lagerortId: "fz-1", bezeichnung: "Koffer", fachLabel: "Koffer", nummer: "7",
      gesetztAt: JETZT, aktiv: true, createdAt: JETZT },
    { id: "pl-aus", lagerortId: "fz-1", bezeichnung: "Alt", aktiv: false, createdAt: JETZT },
  ]).run();
  const g = { barcode: null, anmerkung: null, mtkFaellig: null, beschreibung: null, ablaufdatum: null, createdAt: JETZT };
  t.db.insert(geraete).values([
    { id: "g-hier", typ: "medizin", name: "Defi", lagerortId: "fz-1", aktiv: true, ...g },
    { id: "g-hier-aus", typ: "objekt", name: "Altbrett", lagerortId: "fz-1", aktiv: false, ...g },
    { id: "g-dort", typ: "objekt", name: "Spineboard", lagerortId: "fz-2", aktiv: true, ...g },
    { id: "g-dort-aus", typ: "objekt", name: "Kaputt", lagerortId: "fz-2", aktiv: false, ...g },
  ]).run();
  t.db.insert(o2Flaschen).values([
    { id: "f-hier", name: "O2 hier", lagerortId: "fz-1", groesseLiter: 2, nennfuelldruckBar: 200, aktiv: true, createdAt: JETZT },
    { id: "f-hier-aus", name: "O2 aus", lagerortId: "fz-1", groesseLiter: 2, nennfuelldruckBar: 200, aktiv: false, createdAt: JETZT },
    { id: "f-dort", name: "O2 dort", lagerortId: "fz-2", groesseLiter: 2, nennfuelldruckBar: 200, aktiv: true, createdAt: JETZT },
    { id: "f-dort-aus", name: "O2 dort aus", lagerortId: "fz-2", groesseLiter: 2, nennfuelldruckBar: 200, aktiv: false, createdAt: JETZT },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("verwaltungscheckDaten", () => {
  it("liefert null fuer unbekannte und typfremde Ids", () => {
    expect(verwaltungscheckDaten(t.db, "gibt-es-nicht")).toBeNull();
    expect(verwaltungscheckDaten(t.db, HANDLAGER_ID)).toBeNull();
  });

  it("nennt die Einheit und fuehrt nur Positionen ohne Grabstein, mit genau den Typfeldern", () => {
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    expect(d.fahrzeug).toEqual({
      id: "fz-1", name: "RTW 1", kennung: "MS-1", einheitenart: "fahrzeug", aktiv: true,
    });
    expect(d.positionen).toEqual([{
      id: "p1", fachLabel: "Fach A", artikelId: "a1", artikelName: "Mullbinde",
      einheit: "Stk", soll: 3, sollMax: 5,
    }]);
  });

  it("rechnet Buchstand, Verfall und Chargen an der Einheit", () => {
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    expect(d.buchstand).toEqual({ a1: 2 });
    expect(d.verfallArtikel).toEqual({ a1: "2027-03" });
    expect(d.verfallFach).toEqual({});
    expect(d.chargenAnEinheit).toEqual({
      a1: [{ chargeId: "c1", label: "LOT-1 · 01/30", verfall: "2030-01", menge: 2 }],
    });
  });

  it("nennt je Soll-Artikel die Charge eines Plus — dieselbe, die die Korrektur nimmt", () => {
    // c2 und c3 gleichauf im Verfall; c3 ist jünger angelegt. c-alt liegt am Fahrzeug, ist aber älter.
    const spaeter = new Date(JETZT.getTime() + 60_000);
    t.db.insert(chargen).values([
      { id: "c2", artikelId: "a1", chargenNr: "LOT-2", verfall: "2031-06", createdAt: JETZT },
      { id: "c3", artikelId: "a1", chargenNr: "LOT-3", verfall: "2031-06", createdAt: spaeter },
      { id: "c-grab", artikelId: "a2", chargenNr: "G", verfall: "2032-01", createdAt: JETZT },
    ]).run();
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    // Nur Artikel mit Soll-Position (der Grabstein-Artikel nicht).
    expect(d.korrekturPlusCharge).toEqual({
      a1: { chargeId: "c3", label: "LOT-3 · 06/31", verfall: "2031-06" },
    });

    const { chargeId } = t.db.transaction((tx) => korrekturAufLagerort(tx, {
      artikelId: "a1", lagerortId: "fz-1", istMenge: 5,
      quelle: { quelleTyp: "system", quelleId: "t" }, kommentar: null, referenz: "check:x",
    }));
    expect(chargeId).toBe(d.korrekturPlusCharge.a1!.chargeId);
  });

  it("lässt die Charge eines Plus weg, wenn der Artikel keine Charge hat", () => {
    t.db.insert(sollPositionen).values({
      id: "p2", fahrzeugId: "fz-1", fachLabel: "Fach B", sort: 3, artikelId: "a2", soll: 1,
    }).run();
    expect(Object.keys(verwaltungscheckDaten(t.db, "fz-1")!.korrekturPlusCharge)).toEqual(["a1"]);
  });

  it("fuehrt nur aktive Plomben, Geraete und Flaschen der Einheit", () => {
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    expect(d.plomben).toHaveLength(1);
    expect(d.plomben[0]).toEqual({
      id: "pl-a", bezeichnung: "Koffer", fachLabel: "Koffer",
      nummer: "7", gesetzt: expect.stringMatching(/^7 · gesetzt /),
    });
    expect(d.geraete).toEqual([{ id: "g-hier", name: "Defi", typ: "medizin", barcode: null, selbsttest: false }]);
    expect(d.flaschen).toEqual([
      { id: "f-hier", name: "O2 hier", nennfuelldruckBar: 200, wechselAbProzent: expect.any(Number) },
    ]);
  });

  it("fuehrt Woanders-Listen ohne diese Einheit und ohne Inaktive", () => {
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    expect(d.geraeteWoanders).toEqual([{ id: "g-dort", name: "Spineboard", ortLabel: expect.stringContaining("RTW 2") }]);
    expect(d.flaschenWoanders).toEqual([{ id: "f-dort", name: "O2 dort", ortLabel: expect.stringContaining("RTW 2") }]);
  });

  it("traegt Ziele, Orte, Schwellen und den Entnahmebox-Zustand", () => {
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    expect(d.ruecklaufZiele.map((z) => z.id)).toContain(HANDLAGER_ID);
    expect(d.lagerorte.map((l) => l.id)).not.toContain(ENTNAHMEBOX_ID);
    expect(d.lagerorte.map((l) => l.id)).toContain("fz-2");
    expect(d).not.toHaveProperty("aufladenArtikel");
    expect(d.schwellen).toEqual({ rotTage: 31, gelbTage: 56 });
    expect(typeof d.entnahmeboxAktiv).toBe("boolean");
  });

  it("ist JSON-sicher (kein Date, keine Map)", () => {
    const d = verwaltungscheckDaten(t.db, "fz-1")!;
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});
