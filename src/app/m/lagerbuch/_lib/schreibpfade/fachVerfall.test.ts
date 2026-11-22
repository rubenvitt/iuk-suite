import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  artikel, fachVerfall, lagerorte, lagerortVerfall, sollPositionen,
} from "../../_db/schema";
import { setzeFachVerfaelle } from "./fachVerfall";
import { loescheVerfallEintrag, setzeVerfall, uebernimmVerfall } from "./lagerortVerfall";
import {
  fachVerfallFuerLagerort, fachVerfallJeArtikel, fachSchluessel, lagerortVerfallListe,
} from "../lesepfade/verfall";
import type { Quelle } from "./abbuchung";

/**
 * IDA-412 — der Verfall je Fach und die Einheitszeile darüber. Kompressen liegen im RTW in der
 * Schublade UND im Rucksack (der Fall aus der Rückmeldung zum ersten echten Vollcheck).
 */
const NOW = new Date("2026-06-15T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-fachverfall-");
  t.db.insert(lagerorte).values([
    { id: "rtw", name: "RTW", typ: "fahrzeug", kennung: null, aktiv: true },
    { id: "ktw", name: "KTW", typ: "fahrzeug", kennung: null, aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "kompresse", name: "Kompresse", einheit: "Stk.", fach: "A1", mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "binde", name: "Binde", einheit: "Stk.", fach: "A2", mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(sollPositionen).values([
    { id: "schublade", fahrzeugId: "rtw", fachLabel: "Schublade 1", sort: 1, artikelId: "kompresse", soll: 10 },
    { id: "rucksack", fahrzeugId: "rtw", fachLabel: "Rucksack", sort: 2, artikelId: "kompresse", soll: 10 },
    { id: "binde-rtw", fahrzeugId: "rtw", fachLabel: "Fach 3", sort: 3, artikelId: "binde", soll: 5 },
    { id: "ktw-kompresse", fahrzeugId: "ktw", fachLabel: "Fach 1", sort: 1, artikelId: "kompresse", soll: 5 },
  ]).run();
});
afterEach(() => t.schliessen());

const einheit = (ort: string, art: string) => t.db.select().from(lagerortVerfall)
  .all().find((z) => z.lagerortId === ort && z.artikelId === art)?.verfall ?? null;
const fach = () => Object.fromEntries(
  t.db.select().from(fachVerfall).all().map((z) => [z.sollPositionId, z.verfall]),
);

describe("setzeFachVerfaelle — je Fach, die Einheit als frühestes Datum", () => {
  it("Schublade 03/27, Rucksack 06/27 → beide Fächer getrennt, die Einheit warnt mit 03/27", () => {
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, jetzt: NOW,
      werte: [{ sollPositionId: "schublade", verfall: "2027-03" }, { sollPositionId: "rucksack", verfall: "2027-06" }],
    });
    expect(fach()).toEqual({ schublade: "2027-03", rucksack: "2027-06" });
    expect(einheit("rtw", "kompresse")).toBe("2027-03");
  });

  it("ist die Schublade aufgefüllt (neues Datum), springt die Einheit auf den Rucksack", () => {
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, jetzt: NOW,
      werte: [{ sollPositionId: "schublade", verfall: "2027-03" }, { sollPositionId: "rucksack", verfall: "2027-06" }],
    });
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, jetzt: NOW,
      werte: [{ sollPositionId: "schublade", verfall: "2029-01" }, { sollPositionId: "rucksack", verfall: "2027-06" }],
    });
    expect(einheit("rtw", "kompresse")).toBe("2027-06");
  });

  it("alle Fächer geleert → keine Angabe mehr an der Einheit", () => {
    setzeVerfall(t.db, { lagerortId: "rtw", artikelId: "kompresse", verfall: "2027-01", quelle: QUELLE });
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE,
      werte: [{ sollPositionId: "schublade", verfall: null }, { sollPositionId: "rucksack", verfall: null }],
    });
    expect(fach()).toEqual({});
    expect(einheit("rtw", "kompresse")).toBeNull();
  });

  it("ein NICHT gemeldetes Fach ohne eigene Zeile behält das bisherige Datum der Einheit", () => {
    // Das Datum kam von woanders (z. B. mitgewandert). Eine Meldung über EIN Fach verwirft es nicht.
    setzeVerfall(t.db, { lagerortId: "rtw", artikelId: "kompresse", verfall: "2026-11", quelle: QUELLE });
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, werte: [{ sollPositionId: "schublade", verfall: "2028-01" }],
    });
    expect(einheit("rtw", "kompresse")).toBe("2026-11");
  });

  it("fasst nur den gemeldeten Artikel an — die Binde und der KTW bleiben", () => {
    setzeVerfall(t.db, { lagerortId: "rtw", artikelId: "binde", verfall: "2026-08", quelle: QUELLE });
    setzeVerfall(t.db, { lagerortId: "ktw", artikelId: "kompresse", verfall: "2026-09", quelle: QUELLE });
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, werte: [{ sollPositionId: "schublade", verfall: "2028-01" }],
    });
    expect(einheit("rtw", "binde")).toBe("2026-08");
    expect(einheit("ktw", "kompresse")).toBe("2026-09");
  });

  it("wirft bei einem Fach einer anderen Einheit und bei einem Grabstein", () => {
    expect(() => setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, werte: [{ sollPositionId: "ktw-kompresse", verfall: "2027-01" }],
    })).toThrow(/Fach gehört nicht/);
    t.db.update(sollPositionen).set({ entfernt: true }).where(eq(sollPositionen.id, "rucksack")).run();
    expect(() => setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, werte: [{ sollPositionId: "rucksack", verfall: "2027-01" }],
    })).toThrow(/Fach gehört nicht/);
  });

  it("wirft bei einem formal falschen Monat", () => {
    expect(() => setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, werte: [{ sollPositionId: "schublade", verfall: "2027-13" }],
    })).toThrow(/YYYY-MM/);
  });
});

describe("artikelweite Schreibwege verwerfen das Fachdetail", () => {
  const beideFaecher = () => setzeFachVerfaelle(t.db, {
    lagerortId: "rtw", quelle: QUELLE,
    werte: [{ sollPositionId: "schublade", verfall: "2027-03" }, { sollPositionId: "rucksack", verfall: "2027-06" }],
  });

  it("setzeVerfall (Verwaltung, Aussondern): ein Datum für den Artikel, kein Fachdetail mehr", () => {
    beideFaecher();
    setzeVerfall(t.db, { lagerortId: "rtw", artikelId: "kompresse", verfall: "2027-09", quelle: QUELLE });
    expect(fach()).toEqual({});
    expect(einheit("rtw", "kompresse")).toBe("2027-09");
  });

  it("loescheVerfallEintrag: ohne Einheitszeile kein Fachdetail", () => {
    beideFaecher();
    loescheVerfallEintrag(t.db, "rtw", "kompresse");
    expect(fach()).toEqual({});
  });

  it("uebernimmVerfall: ein früheres Datum kommt am Zielort an → dort fällt das Detail", () => {
    beideFaecher();
    setzeVerfall(t.db, { lagerortId: "ktw", artikelId: "kompresse", verfall: "2026-10", quelle: QUELLE });
    uebernimmVerfall(t.db, { vonLagerortId: "ktw", nachLagerortId: "rtw", artikelId: "kompresse" });
    expect(fach()).toEqual({});
    expect(einheit("rtw", "kompresse")).toBe("2026-10");
  });

  it("uebernimmVerfall: ein SPÄTERES Datum ändert am Zielort nichts — das Detail bleibt", () => {
    beideFaecher();
    setzeVerfall(t.db, { lagerortId: "ktw", artikelId: "kompresse", verfall: "2030-01", quelle: QUELLE });
    uebernimmVerfall(t.db, { vonLagerortId: "ktw", nachLagerortId: "rtw", artikelId: "kompresse" });
    expect(fach()).toEqual({ schublade: "2027-03", rucksack: "2027-06" });
  });
});

describe("die Lesewege je Fach", () => {
  it("fachVerfallFuerLagerort: nur aktive Fächer dieser Einheit", () => {
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE,
      werte: [{ sollPositionId: "schublade", verfall: "2027-03" }, { sollPositionId: "rucksack", verfall: "2027-06" }],
    });
    t.db.update(sollPositionen).set({ entfernt: true }).where(eq(sollPositionen.id, "rucksack")).run();
    expect(Object.fromEntries(fachVerfallFuerLagerort(t.db, "rtw"))).toEqual({ schublade: "2027-03" });
    expect(fachVerfallFuerLagerort(t.db, "ktw").size).toBe(0);
  });

  it("lagerortVerfallListe trägt die Fächer an der Zeile des Artikels — die Übersicht zeigt sie", () => {
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, jetzt: NOW,
      werte: [{ sollPositionId: "schublade", verfall: "2027-03" }, { sollPositionId: "rucksack", verfall: "2027-06" }],
    });
    const zeile = lagerortVerfallListe(t.db, { lagerortId: "rtw" }, NOW)
      .find((z) => z.artikelId === "kompresse")!;
    expect(zeile.verfall).toBe("2027-03");
    expect(zeile.faecher.map((f) => [f.fachLabel, f.verfall])).toEqual([
      ["Schublade 1", "2027-03"], ["Rucksack", "2027-06"],
    ]);
  });

  it("fachVerfallJeArtikel: nur Artikel mit mehreren Fächern, in Fach-Reihenfolge, ohne Datum als —", () => {
    setzeFachVerfaelle(t.db, {
      lagerortId: "rtw", quelle: QUELLE, jetzt: NOW, werte: [{ sollPositionId: "rucksack", verfall: "2027-06" }],
    });
    const m = fachVerfallJeArtikel(t.db, "rtw", NOW);
    expect([...m.keys()]).toEqual([fachSchluessel("rtw", "kompresse")]);
    expect(m.get(fachSchluessel("rtw", "kompresse"))!.map((f) => [f.fachLabel, f.verfall, f.text])).toEqual([
      ["Schublade 1", null, "—"],
      ["Rucksack", "2027-06", expect.any(String)],
    ]);
  });
});
