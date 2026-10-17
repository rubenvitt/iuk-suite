import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, checks, lagerorte, plomben, sollPositionen } from "../../_db/schema";
import { kurzcheckVorlage, letzteEntnahmeJeArtikel, letzteZaehlungJePosition } from "./kurzcheck";
import { plombenFuerLagerort, plombenNummerNorm } from "./plomben";

let t: TestDb;
const TAG = 86_400_000;
const jetzt = new Date("2026-10-17T10:00:00Z");
const vor = (tage: number) => new Date(jetzt.getTime() - tage * TAG);

beforeEach(() => {
  t = migrierteTestDb();
  t.db.insert(lagerorte).values([
    { id: "fz", name: "KTW", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
  ]).run();
  t.db.insert(artikel).values(["a", "b", "c", "d"].map((id) => ({
    id, name: id, einheit: "Stk", fach: "X", mindestbestand: 0, aktiv: true, createdAt: jetzt,
  }))).run();
  t.db.insert(sollPositionen).values([
    { id: "p-a", fahrzeugId: "fz", fachLabel: "Fach 1", sort: 1, artikelId: "a", soll: 1, entfernt: false },
    { id: "p-b", fahrzeugId: "fz", fachLabel: "Fach 1", sort: 2, artikelId: "b", soll: 1, entfernt: false },
    { id: "p-c", fahrzeugId: "fz", fachLabel: "Koffer", sort: 1, artikelId: "c", soll: 1, entfernt: false },
    { id: "p-d", fahrzeugId: "fz", fachLabel: "Koffer", sort: 2, artikelId: "d", soll: 1, entfernt: false },
  ]).run();
});

afterEach(() => t.schliessen());

const check = (id: string, am: Date, ids: string[], art?: "kurz") =>
  t.db.insert(checks).values({
    id, fahrzeugId: "fz", quelleTyp: "system", quelleId: "t", startedAt: am, completedAt: am,
    ergebnis: JSON.stringify({
      version: 2, art, artikel: [], geraete: [], flaschen: [], verfall: [],
      positionen: ids.map((sollPositionId) => ({ sollPositionId, artikelId: "x" })),
    }),
  }).run();

describe("letzteZaehlungJePosition", () => {
  it("nimmt je Position den JUENGSTEN Check, der sie gezaehlt hat", () => {
    check("c1", vor(40), ["p-a", "p-b"]);
    check("c2", vor(5), ["p-a"], "kurz");
    const s = letzteZaehlungJePosition(t.db, "fz");
    expect(s.get("p-a")).toEqual(vor(5));
    expect(s.get("p-b")).toEqual(vor(40));
    expect(s.has("p-c")).toBe(false);
  });
});

describe("letzteEntnahmeJeArtikel", () => {
  it("kennt nur Entnahmen AUS dieser Einheit", () => {
    t.db.insert(chargen).values({ id: "ch", artikelId: "a", chargenNr: "1", verfall: "2099-12", createdAt: jetzt }).run();
    t.db.insert(buchungen).values([
      { id: "b1", ts: vor(3), typ: "entnahme", artikelId: "a", chargeId: "ch", lagerortId: "fz", menge: -1, quelleTyp: "system", quelleId: "t" },
      { id: "b2", ts: vor(1), typ: "zugang", artikelId: "a", chargeId: "ch", lagerortId: "fz", menge: 1, quelleTyp: "system", quelleId: "t" },
    ]).run();
    expect(letzteEntnahmeJeArtikel(t.db, "fz").get("a")).toEqual(vor(3));
  });
});

describe("kurzcheckVorlage", () => {
  const soll = [
    { id: "p-a", artikelId: "a", fachLabel: "Fach 1" },
    { id: "p-b", artikelId: "b", fachLabel: "Fach 1" },
    { id: "p-c", artikelId: "c", fachLabel: "Koffer" },
    { id: "p-d", artikelId: "d", fachLabel: "Koffer" },
  ];

  it("zieht nichts aus einem Fach, dessen Plombe steht, und zaehlt es als abgedeckt", () => {
    t.db.insert(plomben).values({
      id: "pl", lagerortId: "fz", bezeichnung: "Medizinkoffer", fachLabel: "Koffer",
      nummer: "1", gesetztAt: vor(2), createdAt: jetzt,
    }).run();
    check("c1", vor(2), ["p-a"]);
    const v = kurzcheckVorlage(t.db, {
      fahrzeugId: "fz", soll, plomben: plombenFuerLagerort(t.db, "fz"), letzterCheckId: "c1", now: jetzt,
    });
    expect(v.auswahl.map((x) => x.id).sort()).toEqual(["p-a", "p-b"]);
    expect(v.versiegelt).toEqual({ pl: ["p-c", "p-d"] });
    // p-a frisch gezaehlt, p-c/p-d versiegelt; p-b nie gezaehlt
    expect(v.abgedeckt).toBe(3);
    expect(v.gesamt).toBe(4);
    expect(v.auswahl.find((x) => x.id === "p-b")?.grund).toBe("nie");
  });

  it("eine nie gesetzte Plombe deckt nichts ab", () => {
    t.db.insert(plomben).values({
      id: "pl", lagerortId: "fz", bezeichnung: "Medizinkoffer", fachLabel: "Koffer",
      nummer: null, createdAt: jetzt,
    }).run();
    const v = kurzcheckVorlage(t.db, {
      fahrzeugId: "fz", soll, plomben: plombenFuerLagerort(t.db, "fz"), letzterCheckId: null, now: jetzt,
    });
    expect(v.versiegelt).toEqual({});
    expect(v.auswahl).toHaveLength(4);
  });

  it("zieht ein versiegeltes Fach mit, wenn sein Artikel auch offen liegt", () => {
    t.db.insert(sollPositionen).values(
      { id: "p-c2", fahrzeugId: "fz", fachLabel: "Fach 1", sort: 3, artikelId: "c", soll: 1, entfernt: false },
    ).run();
    t.db.insert(plomben).values({
      id: "pl", lagerortId: "fz", bezeichnung: "Medizinkoffer", fachLabel: "Koffer",
      nummer: "1", gesetztAt: vor(2), createdAt: jetzt,
    }).run();
    const v = kurzcheckVorlage(t.db, {
      fahrzeugId: "fz", soll: [...soll, { id: "p-c2", artikelId: "c", fachLabel: "Fach 1" }],
      plomben: plombenFuerLagerort(t.db, "fz"), letzterCheckId: null, now: jetzt,
    });
    const ids = v.auswahl.map((x) => x.id);
    expect(ids).toContain("p-c2");
    expect(ids).toContain("p-c");
    expect(ids).not.toContain("p-d");
  });
});

describe("plombenNummerNorm", () => {
  it("ignoriert Leerraum, Trennzeichen und Gross-/Kleinschreibung", () => {
    expect(plombenNummerNorm(" ab 12-34.5 ")).toBe(plombenNummerNorm("AB12345"));
  });
});
