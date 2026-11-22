import { eq } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../../_db/schema";
import { BuchungAbgewiesen } from "../buchungAbgewiesen";
import {
  AUFLADEN_KOMMENTAR, CHECK_NACHFUELLUNG, ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR,
  HANDLAGER_ID, RUECKLAUF_KOMMENTAR,
} from "../konstanten";
import {
  AUFLADEN_PRAEFIX, AUSSONDERN_PRAEFIX, ENTNAHMEBOX_PRAEFIX, RUECKLAUF_PRAEFIX,
} from "../vorgang";
import type { Quelle } from "./abbuchung";
import {
  aufladenVonOrtTx, aussondernAnEinheitTx, auffuellenAusHandlagerTx, inEntnahmeboxTx, ruecklaufTx,
} from "./einheitBewegung";

/**
 * Die fuenf Einheit-Bewegungen als werfende tx-Funktionen — gegen eine echte,
 * migrierte SQLite. Zugesagt wird je Funktion: Erfolg schreibt die Legs mit dem
 * Praefix, und eine Absage wirft `BuchungAbgewiesen` und laesst die
 * Transaktion NICHTS geschrieben haben. Das Verhalten der Actions daneben
 * pruefen `_actions/aufladen.test.ts` und `_actions/ruecklauf.test.ts`.
 */
const QUELLE = { quelleTyp: "oidc" as const, quelleId: "u-gf" } satisfies Quelle;
const JETZT = new Date("2026-09-25T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-einheit-");
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "fz-2", name: "KTW 2", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "sch-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, aktiv: true, sortierung: 0 },
  ]).run();
  t.db.insert(artikel).values([
    { id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01", mindestbestand: 0, aktiv: true, createdAt: JETZT },
    { id: "art-2", name: "Mullbinde", einheit: "Pkg.", fach: "A-02", mindestbestand: 0, aktiv: true, createdAt: JETZT },
  ]).run();
  t.db.insert(chargen).values([
    { id: "ch-1", artikelId: "art-1", chargenNr: "ch-1", verfall: "2030-01", createdAt: JETZT },
    { id: "ch-2", artikelId: "art-2", chargenNr: "ch-2", verfall: "2030-01", createdAt: JETZT },
  ]).run();
});
afterEach(() => t.schliessen());

let zaehler = 0;
function buchen(chargeId: string, menge: number, ort: string, artikelId = "art-1") {
  t.db.insert(buchungen).values({
    id: `seed-${++zaehler}`, ts: JETZT, typ: "zugang", artikelId, chargeId, lagerortId: ort, menge,
    quelleTyp: "system", quelleId: "seed", referenz: null, kommentar: null,
  }).run();
}
const bestand = (ort: string) => t.db.select().from(buchungen).all()
  .filter((b) => b.lagerortId === ort).reduce((s, b) => s + b.menge, 0);
const neu = () => t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
const lauf = <T>(fn: Parameters<typeof t.db.transaction<T>>[0]) => t.db.transaction(fn);

describe("aufladenVonOrtTx", () => {
  const args = {
    artikelId: "art-1", menge: 4, fahrzeugId: "fz-1", vonLagerortId: "sch-1", chargeId: "ch-1", quelle: QUELLE,
  };

  it("legt um, mit Praefix auf beiden Legs", () => {
    buchen("ch-1", 10, "sch-1");
    expect(lauf((tx) => aufladenVonOrtTx(tx, args))).toBe(4);
    expect(bestand("sch-1")).toBe(6);
    expect(bestand("fz-1")).toBe(4);
    const zeilen = neu();
    expect(zeilen).toHaveLength(2);
    for (const z of zeilen) {
      expect(z.referenz).toBe(`${AUFLADEN_PRAEFIX}fz-1`);
      expect(z.kommentar).toBe(AUFLADEN_KOMMENTAR);
    }
  });

  it("weist ab: unbekannte Quelle, fremde Charge, fehlende Deckung — ohne zu schreiben", () => {
    buchen("ch-1", 3, "sch-1");
    expect(() => lauf((tx) => aufladenVonOrtTx(tx, { ...args, vonLagerortId: "weg" })))
      .toThrow(BuchungAbgewiesen);
    expect(() => lauf((tx) => aufladenVonOrtTx(tx, { ...args, chargeId: "ch-2" })))
      .toThrow("Diese Charge gehört nicht zu diesem Artikel.");
    expect(() => lauf((tx) => aufladenVonOrtTx(tx, args))).toThrow(BuchungAbgewiesen);
    expect(neu()).toHaveLength(0);
    expect(bestand("sch-1")).toBe(3);
  });
});

describe("ruecklaufTx", () => {
  const args = {
    fahrzeugId: "fz-1", artikelId: "art-1", chargeId: "ch-1", menge: 2, zielLagerortId: "sch-1", quelle: QUELLE,
  };

  it("bucht von der Einheit in den Schrank zurueck", () => {
    buchen("ch-1", 5, "fz-1");
    expect(lauf((tx) => ruecklaufTx(tx, args))).toBe(2);
    expect(bestand("fz-1")).toBe(3);
    expect(bestand("sch-1")).toBe(2);
    for (const z of neu()) {
      expect(z.referenz).toBe(`${RUECKLAUF_PRAEFIX}fz-1`);
      expect(z.kommentar).toBe(RUECKLAUF_KOMMENTAR);
    }
  });

  it("weist ab: Quelle ist ein Lager, Ziel kein Zugangsziel, Deckung fehlt", () => {
    buchen("ch-1", 1, "fz-1");
    expect(() => lauf((tx) => ruecklaufTx(tx, { ...args, fahrzeugId: "sch-1" })))
      .toThrow("Zurückbuchen geht nur aus einem Fahrzeug oder einer Tasche.");
    expect(() => lauf((tx) => ruecklaufTx(tx, { ...args, zielLagerortId: "fz-2" })))
      .toThrow(BuchungAbgewiesen);
    expect(() => lauf((tx) => ruecklaufTx(tx, args))).toThrow(BuchungAbgewiesen);
    expect(neu()).toHaveLength(0);
    expect(bestand("fz-1")).toBe(1);
  });
});

describe("inEntnahmeboxTx", () => {
  const args = { fahrzeugId: "fz-1", artikelId: "art-1", menge: 2, quelle: QUELLE };

  it("legt in die Box, FEFO ohne Charge, mit Praefix", () => {
    buchen("ch-1", 5, "fz-1");
    expect(lauf((tx) => inEntnahmeboxTx(tx, args))).toBe(2);
    expect(bestand("fz-1")).toBe(3);
    expect(bestand(ENTNAHMEBOX_ID)).toBe(2);
    for (const z of neu()) {
      expect(z.referenz).toBe(`${ENTNAHMEBOX_PRAEFIX}fz-1`);
      expect(z.kommentar).toBe(ENTNAHMEBOX_KOMMENTAR);
    }
  });

  it("nimmt mit chargeId genau diese Charge", () => {
    buchen("ch-1", 5, "fz-1");
    expect(lauf((tx) => inEntnahmeboxTx(tx, { ...args, chargeId: "ch-1" }))).toBe(2);
    expect(neu().every((z) => z.chargeId === "ch-1")).toBe(true);
  });

  it("weist ab: zu wenig an der Einheit, stillgelegte Box", () => {
    buchen("ch-1", 1, "fz-1");
    expect(() => lauf((tx) => inEntnahmeboxTx(tx, args)))
      .toThrow("Von Kühlkompresse liegen an der Einheit nur 1");
    expect(neu()).toHaveLength(0);
    expect(bestand("fz-1")).toBe(1);

    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    buchen("ch-1", 5, "fz-1");
    expect(() => lauf((tx) => inEntnahmeboxTx(tx, args))).toThrow(BuchungAbgewiesen);
    expect(neu()).toHaveLength(0);
  });
});

describe("aussondernAnEinheitTx", () => {
  const args = { lagerortId: "fz-1", artikelId: "art-1", menge: 3, quelle: QUELLE, kommentar: "abgelaufen" };

  it("bucht eine Korrektur mit Aussondern-Praefix (Statistik-Sicht)", () => {
    buchen("ch-1", 5, "fz-1");
    lauf((tx) => aussondernAnEinheitTx(tx, args));
    expect(bestand("fz-1")).toBe(2);
    const zeilen = neu();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      typ: "korrektur", menge: -3, referenz: `${AUSSONDERN_PRAEFIX}fz-1`, kommentar: "abgelaufen",
    });
  });

  it("weist ab, wenn weniger als die Menge an der Einheit liegt", () => {
    buchen("ch-1", 2, "fz-1");
    expect(() => lauf((tx) => aussondernAnEinheitTx(tx, args))).toThrow(BuchungAbgewiesen);
    expect(neu()).toHaveLength(0);
    expect(bestand("fz-1")).toBe(2);
  });
});

describe("auffuellenAusHandlagerTx", () => {
  const args = { artikelId: "art-1", menge: 3, fahrzeugId: "fz-1", quelle: QUELLE, referenz: "check:c-1" };

  it("holt aus dem Handlager-Bereich aufs Fahrzeug", () => {
    buchen("ch-1", 5, "sch-1");
    expect(lauf((tx) => auffuellenAusHandlagerTx(tx, args))).toBe(3);
    expect(bestand("sch-1")).toBe(2);
    expect(bestand("fz-1")).toBe(3);
    for (const z of neu()) {
      expect(z.referenz).toBe("check:c-1");
      expect(z.kommentar).toBe(CHECK_NACHFUELLUNG);
    }
  });

  it("weist ab, wenn das Handlager nicht deckt — ohne zu schreiben", () => {
    buchen("ch-1", 2, "sch-1");
    expect(() => lauf((tx) => auffuellenAusHandlagerTx(tx, args)))
      .toThrow("Im Handlager liegen von Kühlkompresse nur 2");
    expect(neu()).toHaveLength(0);
    expect(bestand("sch-1")).toBe(2);
  });
});
