import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall } from "../_db/schema";
import { HANDLAGER_ID, RUECKLAUF_KOMMENTAR } from "../_lib/konstanten";
import { RUECKLAUF_PRAEFIX } from "../_lib/vorgang";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";

/**
 * DER RUECKLAUF VOM FAHRZEUG IN EINEN SCHRANK — DRK-366.
 *
 * Gegen eine echte, migrierte SQLite, aus demselben Grund wie die Tests der
 * Entnahmebox: „die Charge bleibt dieselbe" ist eine Aussage ueber ZWEI Zeilen
 * mit derselben Referenz und derselben Charge, und die Handlager-Wurzel muss
 * aus der Migration kommen, nicht aus einer Hand-Zeile.
 */

const { adminRiegel, revalidiert } = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { bucheRuecklauf } from "./ruecklauf";

const JETZT = new Date("2026-09-21T10:00:00Z");
const VIEWER = { sub: "u-admin", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-ruecklauf-");

  t.db.insert(lagerorte).values({
    id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(lagerorte).values({
    id: "ta-1", name: "Rucksack", typ: "fahrzeug", aktiv: true, einheitenart: "tasche",
  }).run();
  t.db.insert(lagerorte).values({
    id: "sch-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, aktiv: true, sortierung: 0,
  }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(artikel).values({
    id: "art-2", name: "Mullbinde", einheit: "Pkg.", fach: "A-02",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
});

function charge(id: string, verfall: string, artikelId = "art-1") {
  t.db.insert(chargen).values({ id, artikelId, chargenNr: id, verfall, createdAt: JETZT }).run();
}

function buchen(id: string, chargeId: string, menge: number, ort = "fz-1", artikelId = "art-1") {
  t.db.insert(buchungen).values({
    id, ts: JETZT, typ: "zugang", artikelId, chargeId,
    lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed",
    referenz: null, kommentar: null,
  }).run();
}

function bestand(ort: string, chargeId: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.lagerortId === ort && b.chargeId === chargeId)
    .reduce((s, b) => s + b.menge, 0);
}

function neueZeilen() {
  return t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
}

function meldung(ortId = "fz-1") {
  return t.db.select().from(lagerortVerfall).where(eq(lagerortVerfall.lagerortId, ortId)).all();
}

const EINGABE = { fahrzeugId: "fz-1", artikelId: "art-1", chargeId: "ch-1", menge: 4, zielLagerortId: "sch-1" };

describe("bucheRuecklauf — die Umbuchung", () => {
  it("bucht vom Fahrzeug in den Schrank: zwei Legs, eine Referenz, DIESELBE Charge", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10);

    const erg = await bucheRuecklauf(EINGABE, t.db);
    expect(erg).toEqual({ ok: true, wert: { verfall: null, umgelagert: 4, ziel: "Schrank 1" } });

    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(2);
    expect(zeilen.reduce((s, b) => s + b.menge, 0)).toBe(0);

    const ab = zeilen.find((b) => b.lagerortId === "fz-1")!;
    const zu = zeilen.find((b) => b.lagerortId === "sch-1")!;
    expect(ab.menge).toBe(-4);
    expect(zu.menge).toBe(4);
    expect(ab.typ).toBe("umlagerung");
    expect(zu.typ).toBe("umlagerung");
    // Akzeptanzkriterium 2 — die Charge bleibt dieselbe.
    expect(ab.chargeId).toBe("ch-1");
    expect(zu.chargeId).toBe("ch-1");
    // Die Klammer nennt die QUELLE.
    expect(ab.referenz).toBe(`${RUECKLAUF_PRAEFIX}fz-1`);
    expect(zu.referenz).toBe(ab.referenz);
    expect(zu.kommentar).toBe(RUECKLAUF_KOMMENTAR);
    expect(ab.quelleTyp).toBe("oidc");
    expect(ab.quelleId).toBe("u-admin");

    expect(bestand("fz-1", "ch-1")).toBe(6);
    expect(bestand("sch-1", "ch-1")).toBe(4);
    expect(revalidiert.length).toBeGreaterThan(0);
  });

  it("bucht GENAU DIE gewaehlte Charge zurueck — auch wenn eine aeltere daneben liegt", async () => {
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 5);
    buchen("seed-neu", "ch-neu", 5);

    await bucheRuecklauf({ ...EINGABE, chargeId: "ch-neu", menge: 2 }, t.db);

    expect(bestand("sch-1", "ch-neu")).toBe(2);
    expect(bestand("sch-1", "ch-alt")).toBe(0);
    expect(bestand("fz-1", "ch-alt")).toBe(5);
  });

  it("nimmt die Handlager-Wurzel als Ziel („ohne Schrank“)", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3);

    const erg = await bucheRuecklauf({ ...EINGABE, menge: 3, zielLagerortId: HANDLAGER_ID }, t.db);

    expect(erg.ok).toBe(true);
    expect(bestand(HANDLAGER_ID, "ch-1")).toBe(3);
  });

  it("bucht auch aus einer Tasche und aus einer STILLGELEGTEN Einheit", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-ta", "ch-1", 2, "ta-1");
    buchen("seed-fz", "ch-1", 2);
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();

    expect((await bucheRuecklauf({ ...EINGABE, fahrzeugId: "ta-1", menge: 2 }, t.db)).ok).toBe(true);
    expect((await bucheRuecklauf({ ...EINGABE, menge: 2 }, t.db)).ok).toBe(true);
    expect(bestand("sch-1", "ch-1")).toBe(4);
  });
});

describe("bucheRuecklauf — die gemeldete Verfallsangabe der Einheit", () => {
  const SEED = { quelleTyp: "system" as const, quelleId: "seed" };

  it("raeumt sie ab, sobald nichts mehr von dem Artikel an der Einheit liegt", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 4);
    setzeVerfall(t.db, { lagerortId: "fz-1", artikelId: "art-1", verfall: "2027-03", quelle: SEED });

    const erg = await bucheRuecklauf(EINGABE, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { verfall: null } });
    expect(meldung()).toHaveLength(0);
    // Im Handlager traegt die Charge den Verfall — die Meldung wandert NICHT mit.
    expect(meldung("sch-1")).toHaveLength(0);
  });

  it("laesst sie stehen, solange noch etwas liegt, und meldet den gespeicherten Stand", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10);
    setzeVerfall(t.db, { lagerortId: "fz-1", artikelId: "art-1", verfall: "2027-03", quelle: SEED });

    const erg = await bucheRuecklauf(EINGABE, t.db);

    expect(erg).toMatchObject({ ok: true, wert: { verfall: "2027-03" } });
    expect(meldung()).toHaveLength(1);
  });
});

describe("bucheRuecklauf — was es ablehnt", () => {
  it("weist eine nicht gedeckte Menge ab, statt zu kappen — und bucht nichts", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3);

    const erg = await bucheRuecklauf({ ...EINGABE, menge: 5 }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Von dieser Charge liegen aus diesem Fahrzeug nur 3 Stk. Es wurde nichts gebucht — bitte die Menge prüfen.",
    });
    expect(neueZeilen()).toHaveLength(0);
  });

  it("zaehlt nur die gewaehlte Charge, nicht den ganzen Artikel an der Einheit", async () => {
    charge("ch-1", "2030-01");
    charge("ch-2", "2031-01");
    buchen("seed-1", "ch-1", 2);
    buchen("seed-2", "ch-2", 10);

    const erg = await bucheRuecklauf(EINGABE, t.db);

    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist einen Handlager-Ort als QUELLE ab — das waere ein Umlagern", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5, HANDLAGER_ID);

    const erg = await bucheRuecklauf({ ...EINGABE, fahrzeugId: HANDLAGER_ID }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Zurückbuchen geht nur aus einem Fahrzeug oder einer Tasche." });
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist ein Fahrzeug und einen stillgelegten Schrank als ZIEL ab", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);
    t.db.insert(lagerorte).values({
      id: "sch-alt", name: "Alter Schrank", typ: "lager", parentId: HANDLAGER_ID, aktiv: false, sortierung: 1,
    }).run();

    for (const ziel of ["ta-1", "sch-alt", "gibt-es-nicht"]) {
      const erg = await bucheRuecklauf({ ...EINGABE, zielLagerortId: ziel }, t.db);
      expect(erg.ok, ziel).toBe(false);
    }
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist eine Charge eines anderen Artikels ab", async () => {
    charge("ch-fremd", "2030-01", "art-2");
    buchen("seed-1", "ch-fremd", 5, "fz-1", "art-2");

    const erg = await bucheRuecklauf({ ...EINGABE, chargeId: "ch-fremd" }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.",
    });
    expect(neueZeilen()).toHaveLength(0);
  });

  it("verlangt Charge und Ziel — ein fehlendes Feld ist keine Vorgabe", async () => {
    const erg = await bucheRuecklauf({ ...EINGABE, chargeId: "", zielLagerortId: "" }, t.db);

    expect(erg).toMatchObject({
      ok: false,
      feldFehler: { chargeId: "Charge wählen", zielLagerortId: "Ziel wählen" },
    });
  });

  it("laesst ohne Verwaltungsrecht nichts durch", async () => {
    adminRiegel.mockRejectedValue(new Error("forbidden"));
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 5);

    await expect(bucheRuecklauf(EINGABE, t.db)).rejects.toThrow("forbidden");
    expect(neueZeilen()).toHaveLength(0);
  });
});
