import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import {
  artikel, checks, geraete, lagerorte, maengel, o2Flaschen, o2Messungen, plomben, sollPositionen,
} from "../../_db/schema";
import {
  bucheFlaschenMessungen, bucheGeraeteAntworten, gruppiereZaehlung, schreibeCheckZeile,
  setzePlombenNummern,
} from "./check";
import { CHECK_MESSUNG } from "../konstanten";
import type { Quelle } from "./abbuchung";

/**
 * Der gemeinsame Kern von Helfer-Check und Verwaltungscheck. Das Verhalten im
 * Zusammenspiel prueft `_actions/check.test.ts`; hier steht, was jede Funktion
 * fuer sich zusagt.
 */
// Eng getypt: Mängel kennen nur Token und Konto als Quelle, keine Systembuchung.
const QUELLE = { quelleTyp: "oidc" as const, quelleId: "sub-1" } satisfies Quelle;
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-check-");
  const jetzt = new Date();
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
  ]).run();
  t.db.insert(artikel).values([
    { id: "mull", name: "Mullbinde", einheit: "Stk", fach: "A", mindestbestand: 0, aktiv: true, createdAt: jetzt },
    { id: "decke", name: "Rettungsdecke", einheit: "Stk", fach: "B", mindestbestand: 0, aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(sollPositionen).values([
    { id: "sp-mull-1", fahrzeugId: "fz-1", fachLabel: "Fach 1", sort: 1, artikelId: "mull", soll: 4, entfernt: false },
    { id: "sp-mull-2", fahrzeugId: "fz-1", fachLabel: "Fach 2", sort: 1, artikelId: "mull", soll: 2, sollMax: 5,
      entfernt: false },
    { id: "sp-decke", fahrzeugId: "fz-1", fachLabel: "Fach 2", sort: 2, artikelId: "decke", soll: 2, entfernt: false },
  ]).run();
  t.db.insert(plomben).values([
    { id: "pl-1", lagerortId: "fz-1", bezeichnung: "Koffer", fachLabel: null, nummer: null, createdAt: jetzt },
    { id: "pl-2", lagerortId: "fz-1", bezeichnung: "Tasche", fachLabel: null, nummer: "7", createdAt: jetzt },
    { id: "pl-alt", lagerortId: "fz-1", bezeichnung: "Alt", fachLabel: null, nummer: null, aktiv: false,
      createdAt: jetzt },
    { id: "pl-fremd", lagerortId: "fz-2", bezeichnung: "Fremd", fachLabel: null, nummer: null, createdAt: jetzt },
  ]).run();
  t.db.insert(geraete).values([
    { id: "g-1", typ: "medizin", name: "Absaugpumpe", lagerortId: "fz-1", aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(o2Flaschen).values([
    { id: "o-1", name: "O2 klein", lagerortId: "fz-1", nennfuelldruckBar: 200, aktiv: true, createdAt: jetzt },
  ]).run();
});
afterEach(() => t.schliessen());

const sollRows = () => t.db.select().from(sollPositionen)
  .where(eq(sollPositionen.fahrzeugId, "fz-1")).all().filter((s) => !s.entfernt);

describe("gruppiereZaehlung", () => {
  it("fasst die Faecher eines Artikels zu einer Gruppe zusammen", () => {
    const g = gruppiereZaehlung(sollRows(), [
      { sollPositionId: "sp-mull-1", ist: 3 },
      { sollPositionId: "sp-mull-2", ist: 2 },
      { sollPositionId: "sp-decke", ist: 1 },
    ]);
    expect(g.get("mull")).toMatchObject({
      artikelId: "mull", positionen: ["sp-mull-1", "sp-mull-2"], sollSumme: 6, istSumme: 5,
    });
    expect(g.get("decke")).toMatchObject({ positionen: ["sp-decke"], sollSumme: 2, istSumme: 1 });
  });

  it("fuehrt „OK bis“ nur bei einem Artikel mit Bereich, ein Fach ohne zaehlt mit seinem Soll", () => {
    const g = gruppiereZaehlung(sollRows(), [
      { sollPositionId: "sp-mull-1", ist: 3 },
      { sollPositionId: "sp-mull-2", ist: 2 },
      { sollPositionId: "sp-decke", ist: 1 },
    ]);
    expect(g.get("mull")?.sollMax).toBe(9);
    expect(g.get("decke")).not.toHaveProperty("sollMax");
  });

  it("wirft, wenn ein Artikel nur in einem Teil seiner Faecher gezaehlt ist", () => {
    expect(() => gruppiereZaehlung(sollRows(), [{ sollPositionId: "sp-mull-1", ist: 3 }]))
      .toThrow("Ein Artikel wurde nur in einem Teil seiner Fächer gezählt");
  });

  it("wirft bei einer doppelt gezaehlten Position — auch wenn die Faecherzahl dann stimmt", () => {
    // sp-mull-1 zweimal statt sp-mull-2: zwei Eintraege fuer zwei Faecher, das Ist zaehlte doppelt.
    expect(() => gruppiereZaehlung(sollRows(), [
      { sollPositionId: "sp-mull-1", ist: 3 },
      { sollPositionId: "sp-mull-1", ist: 3 },
    ])).toThrow("Soll-Position wurde doppelt gezählt");
    expect(() => gruppiereZaehlung(sollRows(), [
      { sollPositionId: "sp-decke", ist: 1 },
      { sollPositionId: "sp-decke", ist: 1 },
    ])).toThrow("Soll-Position wurde doppelt gezählt");
  });

  it("wirft bei einer Position, die nicht zur Einheit gehoert", () => {
    expect(() => gruppiereZaehlung(sollRows(), [{ sollPositionId: "sp-fremd", ist: 1 }]))
      .toThrow("Soll-Position gehört nicht zu diesem Fahrzeug");
  });
});

describe("setzePlombenNummern", () => {
  const plombe = (id: string) => t.db.select().from(plomben).where(eq(plomben.id, id)).get()!;

  it("setzt Nummer und Zeitpunkt und laesst eine leere Nummer aus", () => {
    const r = t.db.transaction((tx) => setzePlombenNummern(tx, {
      lagerortId: "fz-1",
      eintraege: [{ plombeId: "pl-1", nummer: "4711" }, { plombeId: "pl-2", nummer: null }],
    }));
    expect(r).toEqual([{ plombeId: "pl-1", bezeichnung: "Koffer", gesetzt: "4711" }]);
    expect(plombe("pl-1").nummer).toBe("4711");
    expect(plombe("pl-1").gesetztAt).toBeInstanceOf(Date);
    expect(plombe("pl-2").nummer).toBe("7");
  });

  it("wirft bei einer stillgelegten Plombe", () => {
    expect(() => t.db.transaction((tx) => setzePlombenNummern(tx, {
      lagerortId: "fz-1", eintraege: [{ plombeId: "pl-alt", nummer: "1" }],
    }))).toThrow("Plombe gehört nicht zu diesem Fahrzeug");
  });

  it("wirft bei einer Plombe einer anderen Einheit", () => {
    expect(() => t.db.transaction((tx) => setzePlombenNummern(tx, {
      lagerortId: "fz-1", eintraege: [{ plombeId: "pl-fremd", nummer: "1" }],
    }))).toThrow("Plombe gehört nicht zu diesem Fahrzeug");
    expect(plombe("pl-fremd").nummer).toBeNull();
  });
});

describe("bucheGeraeteAntworten", () => {
  const fahrzeug = () => t.db.select().from(lagerorte).where(eq(lagerorte.id, "fz-1")).get()!;

  it("legt fuer ein fehlendes Geraet genau einen Mangel an, auch beim zweiten Mal", () => {
    const antworten = [{ geraetId: "g-1", vorhanden: false }];
    const r1 = t.db.transaction((tx) => bucheGeraeteAntworten(tx, {
      fahrzeug: fahrzeug(), antworten, quelle: QUELLE, checkId: "c-1",
    }));
    expect(r1).toEqual({
      ergebnis: [{ geraetId: "g-1", vorhanden: false, zustand: null, bemerkung: null }],
      auffaellig: 1, gemeldet: 1,
    });
    t.db.transaction((tx) => bucheGeraeteAntworten(tx, {
      fahrzeug: fahrzeug(), antworten, quelle: QUELLE, checkId: "c-2",
    }));
    const m = t.db.select().from(maengel).all();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ geraetId: "g-1", checkId: "c-1", lagerortId: "fz-1" });
  });

  it("wirft bei einem Geraet, das nicht an der Einheit steht", () => {
    expect(() => t.db.transaction((tx) => bucheGeraeteAntworten(tx, {
      fahrzeug: fahrzeug(), antworten: [{ geraetId: "g-x", vorhanden: true }], quelle: QUELLE, checkId: "c-1",
    }))).toThrow("Gerät gehört nicht zu diesem Fahrzeug");
  });
});

describe("bucheFlaschenMessungen", () => {
  it("schreibt eine Messung mit Quelle und Check-Referenz im Kommentar", () => {
    const r = t.db.transaction((tx) => bucheFlaschenMessungen(tx, {
      fahrzeugId: "fz-1", flaschen: [{ flascheId: "o-1", druckBar: 30 }], quelle: QUELLE, referenz: "check:x",
    }));
    expect(r).toEqual({
      ergebnis: [{ flascheId: "o-1", druckBar: 30, nennfuelldruckBar: 200 }],
      auffaellig: 1, nichtBewertbar: 0,
    });
    const m = t.db.select().from(o2Messungen).all();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      flascheId: "o-1", druckBar: 30, quelleTyp: "oidc", quelleId: "sub-1",
      kommentar: `${CHECK_MESSUNG} check:x`,
    });
  });

  it("wirft bei einer Flasche einer anderen Einheit", () => {
    expect(() => t.db.transaction((tx) => bucheFlaschenMessungen(tx, {
      fahrzeugId: "fz-2", flaschen: [{ flascheId: "o-1", druckBar: 30 }], quelle: QUELLE, referenz: "check:x",
    }))).toThrow("Flasche gehört nicht zu diesem Fahrzeug");
  });
});

describe("schreibeCheckZeile", () => {
  it("schreibt die Zeile mit Quelle und dem Ergebnis als JSON", () => {
    t.db.transaction((tx) => schreibeCheckZeile(tx, {
      id: "c-1", fahrzeugId: "fz-1", quelle: QUELLE, ergebnis: { version: 2, art: "voll" },
    }));
    const c = t.db.select().from(checks).get()!;
    expect(c).toMatchObject({ id: "c-1", fahrzeugId: "fz-1", quelleTyp: "oidc", quelleId: "sub-1" });
    expect(c.startedAt).toBeInstanceOf(Date);
    expect(c.completedAt).toBeInstanceOf(Date);
    expect(JSON.parse(c.ergebnis!)).toEqual({ version: 2, art: "voll" });
  });
});
