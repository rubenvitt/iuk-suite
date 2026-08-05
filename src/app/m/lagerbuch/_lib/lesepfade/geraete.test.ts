import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { geraete, lagerorte } from "../../_db/schema";
import { geraeteUebersicht, geraeteFuerLagerort, geraetById, geraetByBarcode } from "./geraete";
import { ausZivilzeit } from "../zeit";

const NOW = ausZivilzeit(2026, 6, 15, 14, 37, 0, 0);
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-geraete-");
  t.db.insert(lagerorte).values(
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true }).run();
  t.db.insert(geraete).values([
    { id: "g-med", typ: "medizin", name: "Defibrillator", barcode: "4006381333931",
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: "2026-06-20",
      beschreibung: null, ablaufdatum: null, aktiv: true, createdAt: NOW },
    { id: "g-med-ohne", typ: "medizin", name: "Absaugpumpe", barcode: null,
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: null,
      beschreibung: null, ablaufdatum: null, aktiv: true, createdAt: NOW },
    { id: "g-obj-ohne", typ: "objekt", name: "Spineboard", barcode: null,
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: null,
      beschreibung: "orange", ablaufdatum: null, aktiv: true, createdAt: NOW },
    { id: "g-aus", typ: "objekt", name: "Altes Brett", barcode: null,
      lagerortId: "rtw-1", anmerkung: null, mtkFaellig: null,
      beschreibung: null, ablaufdatum: "2020-01-01", aktiv: false, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

describe("geraeteUebersicht — der Chip kommt SERVERSEITIG mit", () => {
  it("medizin mit Datum: gelber Chip mit Tagen", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-med")!;
    expect(z.faelligkeit.tageBisFaellig).toBe(5);
    expect(z.chip).toEqual({ ton: "gelb", text: "MTK in 5 T" });
  });

  it("medizin OHNE Datum: GRAUER Chip, nicht rot und nicht gruen", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-med-ohne")!;
    expect(z.faelligkeit.keinDatum).toBe(true);
    expect(z.chip).toEqual({ ton: "grau", text: "kein MTK-Datum" });
  });

  it("objekt OHNE Ablaufdatum: GAR KEIN Chip", () => {
    // §5.10: das Ablaufdatum ist optional, und ein grauer Chip an jedem
    // Spineboard waere Grundrauschen.
    expect(geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-obj-ohne")!.chip).toBeNull();
  });

  it("objekt mit abgelaufenem Datum: roter Chip mit BETRAG", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-aus")!;
    expect(z.faelligkeit.ueberfaellig).toBe(true);
    expect(z.chip?.ton).toBe("rot");
    expect(z.chip?.text).toMatch(/^abgelaufen \(\d+ T\)$/);
  });

  it("sortiert aktive nach vorn, dann Typ, dann Name", () => {
    expect(geraeteUebersicht(t.db, NOW).map((z) => z.id))
      .toEqual(["g-med-ohne", "g-med", "g-obj-ohne", "g-aus"]);
  });

  it("reicht BEIDE Rohfelder durch, damit das Formular sie zeigen kann", () => {
    const z = geraeteUebersicht(t.db, NOW).find((x) => x.id === "g-obj-ohne")!;
    expect(z.mtkFaellig).toBeNull();
    expect(z.beschreibung).toBe("orange");
  });
});

describe("geraeteFuerLagerort", () => {
  it("liefert nur AKTIVE Geraete dieses Standorts", () => {
    expect(geraeteFuerLagerort(t.db, "rtw-1", NOW).map((z) => z.id))
      .toEqual(["g-med-ohne", "g-med", "g-obj-ohne"]);
  });
  it("liefert fuer einen unbekannten Standort eine leere Liste", () => {
    expect(geraeteFuerLagerort(t.db, "x", NOW)).toEqual([]);
  });
});

describe("geraetById und geraetByBarcode", () => {
  it("geraetById liefert Stammsatz, Lagerortname, Faelligkeit und Chip", () => {
    const d = geraetById(t.db, "g-med", NOW)!;
    expect(d.geraet.name).toBe("Defibrillator");
    expect(d.lagerortName).toBe("RTW 1");
    expect(d.chip).toEqual({ ton: "gelb", text: "MTK in 5 T" });
  });
  it("geraetById liefert null fuer eine unbekannte ID", () => {
    expect(geraetById(t.db, "x", NOW)).toBeNull();
  });
  it("geraetByBarcode sucht BYTE-EXAKT", () => {
    expect(geraetByBarcode(t.db, "4006381333931")).toEqual({ id: "g-med" });
    expect(geraetByBarcode(t.db, "4006381333931 ")).toBeNull();
  });
});
