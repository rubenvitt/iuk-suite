import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall } from "../_db/schema";
import { AUFLADEN_KOMMENTAR, ENTNAHMEBOX_ID, HANDLAGER_ID } from "../_lib/konstanten";
import { AUFLADEN_PRAEFIX } from "../_lib/vorgang";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";

/**
 * MATERIAL AUF EINE EINHEIT PACKEN — DRK-485.
 *
 * Gegen eine echte, migrierte SQLite wie der Ruecklauf daneben: „die Charge
 * wandert mit" ist eine Aussage ueber ZWEI Zeilen mit derselben Referenz, und
 * Handlager-Wurzel und Entnahmebox muessen aus der Migration kommen.
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

import { bucheAufladen } from "./aufladen";

const JETZT = new Date("2026-09-25T10:00:00Z");
const BESTELLT = new Date("2026-09-20T10:00:00Z");
const VIEWER = { sub: "u-gf", groups: ["lagerbuch"], name: "G. Führer", email: null };
const SEED = { quelleTyp: "system" as const, quelleId: "seed" };

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-aufladen-");

  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "fz-2", name: "KTW 2", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "ta-1", name: "Rucksack", typ: "fahrzeug", aktiv: true, einheitenart: "tasche" },
    { id: "sch-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, aktiv: true, sortierung: 0 },
  ]).run();
  t.db.insert(artikel).values([
    {
      id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
      mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: BESTELLT,
    },
    {
      id: "art-2", name: "Mullbinde", einheit: "Pkg.", fach: "A-02",
      mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
    },
  ]).run();
});

function charge(id: string, verfall: string, artikelId = "art-1") {
  t.db.insert(chargen).values({ id, artikelId, chargenNr: id, verfall, createdAt: JETZT }).run();
}

function buchen(id: string, chargeId: string, menge: number, ort: string, artikelId = "art-1") {
  t.db.insert(buchungen).values({
    id, ts: JETZT, typ: "zugang", artikelId, chargeId,
    lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed",
    referenz: null, kommentar: null,
  }).run();
}

function bestand(ort: string, chargeId?: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.lagerortId === ort && (chargeId === undefined || b.chargeId === chargeId))
    .reduce((s, b) => s + b.menge, 0);
}

function neueZeilen() {
  return t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
}

function meldung(ortId: string) {
  return t.db.select().from(lagerortVerfall).where(eq(lagerortVerfall.lagerortId, ortId)).all();
}

const VON_SCHRANK = {
  fahrzeugId: "fz-1", artikelId: "art-1", menge: 4,
  herkunft: { art: "ort", vonLagerortId: "sch-1", chargeId: "ch-1" },
} as const;

describe("bucheAufladen — von einem anderen Ort", () => {
  it("packt aus dem Schrank auf das Fahrzeug: zwei Legs, eine Referenz, DIESELBE Charge", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10, "sch-1");

    const erg = await bucheAufladen(VON_SCHRANK, t.db);
    expect(erg).toEqual({ ok: true, wert: { gebucht: 4, ziel: "RTW 1 · Fahrzeug" } });

    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(2);
    expect(zeilen.reduce((s, b) => s + b.menge, 0)).toBe(0);
    const ab = zeilen.find((b) => b.lagerortId === "sch-1")!;
    const zu = zeilen.find((b) => b.lagerortId === "fz-1")!;
    expect([ab.menge, zu.menge]).toEqual([-4, 4]);
    expect([ab.typ, zu.typ]).toEqual(["umlagerung", "umlagerung"]);
    expect([ab.chargeId, zu.chargeId]).toEqual(["ch-1", "ch-1"]);
    // Die Klammer nennt das ZIEL.
    expect(ab.referenz).toBe(`${AUFLADEN_PRAEFIX}fz-1`);
    expect(zu.referenz).toBe(ab.referenz);
    expect(zu.kommentar).toBe(AUFLADEN_KOMMENTAR);
    expect(zu.quelleTyp).toBe("oidc");
    expect(zu.quelleId).toBe("u-gf");

    expect(bestand("sch-1")).toBe(6);
    expect(bestand("fz-1")).toBe(4);
    expect(revalidiert.length).toBeGreaterThan(0);
  });

  it("nimmt GENAU DIE gewaehlte Charge — nicht die aelteste daneben", async () => {
    charge("ch-alt", "2027-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 5, "sch-1");
    buchen("seed-neu", "ch-neu", 5, "sch-1");

    const erg = await bucheAufladen({
      ...VON_SCHRANK, menge: 2, herkunft: { ...VON_SCHRANK.herkunft, chargeId: "ch-neu" },
    }, t.db);

    expect(erg.ok).toBe(true);
    expect(bestand("fz-1", "ch-neu")).toBe(2);
    expect(bestand("fz-1", "ch-alt")).toBe(0);
  });

  it("packt von einem anderen Fahrzeug um, und die gemeldete Verfallsangabe folgt dem Material", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3, "fz-2");
    setzeVerfall(t.db, { lagerortId: "fz-2", artikelId: "art-1", verfall: "2027-03", quelle: SEED });

    const erg = await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 3,
      herkunft: { art: "ort", vonLagerortId: "fz-2", chargeId: "ch-1" },
    }, t.db);

    expect(erg.ok).toBe(true);
    expect(bestand("fz-2")).toBe(0);
    expect(bestand("fz-1")).toBe(3);
    expect(meldung("fz-1").map((m) => m.verfall)).toEqual(["2027-03"]);
    // Die geleerte Quelle meldet nichts mehr.
    expect(meldung("fz-2")).toHaveLength(0);
  });

  it("nimmt auch die Entnahmebox, einen stillgelegten Schrank und eine Tasche als Ziel", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-box", "ch-1", 2, ENTNAHMEBOX_ID);
    buchen("seed-sch", "ch-1", 2, "sch-1");
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "sch-1")).run();

    const ausBox = await bucheAufladen({
      fahrzeugId: "ta-1", artikelId: "art-1", menge: 2,
      herkunft: { art: "ort", vonLagerortId: ENTNAHMEBOX_ID, chargeId: "ch-1" },
    }, t.db);
    const ausSchrank = await bucheAufladen({ ...VON_SCHRANK, menge: 2 }, t.db);

    expect(ausBox).toMatchObject({ ok: true, wert: { ziel: "Rucksack · Tasche" } });
    expect(ausSchrank.ok).toBe(true);
    expect(bestand("ta-1")).toBe(2);
    expect(bestand("fz-1")).toBe(2);
  });

  it("packt auch einen DEAKTIVIERTEN Artikel um — heraus und weiter ja, nur neu hinein nein (DRK-380)", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 4, "sch-1");
    t.db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, "art-1")).run();

    expect((await bucheAufladen(VON_SCHRANK, t.db)).ok).toBe(true);
  });

  it("aendert die Bestellt-Markierung nicht — es ist kein Wareneingang", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 4, "sch-1");

    await bucheAufladen(VON_SCHRANK, t.db);

    expect(t.db.select().from(artikel).where(eq(artikel.id, "art-1")).get()?.bestelltAt).toEqual(BESTELLT);
  });
});

describe("bucheAufladen — neu angeliefert", () => {
  it("bucht eine neue Charge als Wareneingang DIREKT an der Einheit", async () => {
    const erg = await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 5,
      herkunft: { art: "neu", charge: { art: "neu", chargenNr: " L-77 ", verfall: "2028-06" } },
    }, t.db);

    expect(erg).toEqual({ ok: true, wert: { gebucht: 5, ziel: "RTW 1 · Fahrzeug" } });
    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      typ: "zugang", lagerortId: "fz-1", menge: 5, referenz: null, quelleTyp: "oidc", quelleId: "u-gf",
    });
    const neu = t.db.select().from(chargen).where(eq(chargen.id, zeilen[0]!.chargeId)).get();
    expect(neu).toMatchObject({ artikelId: "art-1", chargenNr: "L-77", verfall: "2028-06" });
    // Nichts davon liegt im Handlager.
    expect(bestand("sch-1") + bestand(HANDLAGER_ID)).toBe(0);
  });

  it("bucht auf eine vorhandene Charge", async () => {
    charge("ch-1", "2030-01");

    const erg = await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 2,
      herkunft: { art: "neu", charge: { art: "vorhanden", chargeId: "ch-1" } },
    }, t.db);

    expect(erg.ok).toBe(true);
    expect(bestand("fz-1", "ch-1")).toBe(2);
  });

  it("laesst die Bestellt-Markierung stehen — die Bestellliste rechnet mit dem Handlager", async () => {
    await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 1,
      herkunft: { art: "neu", charge: { art: "neu", chargenNr: "X", verfall: "2028-06" } },
    }, t.db);

    expect(t.db.select().from(artikel).where(eq(artikel.id, "art-1")).get()?.bestelltAt).toEqual(BESTELLT);
  });

  it("weist einen deaktivierten Artikel ab und legt keine Charge an", async () => {
    t.db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, "art-1")).run();

    const erg = await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 1,
      herkunft: { art: "neu", charge: { art: "neu", chargenNr: "X", verfall: "2028-06" } },
    }, t.db);

    expect(erg.ok).toBe(false);
    expect(!erg.ok && erg.fehler).toMatch(/deaktiviert/);
    expect(t.db.select().from(chargen).all()).toHaveLength(0);
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist eine Charge eines anderen Artikels ab", async () => {
    charge("ch-fremd", "2030-01", "art-2");

    const erg = await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 1,
      herkunft: { art: "neu", charge: { art: "vorhanden", chargeId: "ch-fremd" } },
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Charge gehört nicht zu diesem Artikel" });
    expect(neueZeilen()).toHaveLength(0);
  });
});

describe("bucheAufladen — was es ablehnt", () => {
  it("weist eine nicht gedeckte Menge ab, statt zu kappen — und bucht nichts", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3, "sch-1");

    const erg = await bucheAufladen({ ...VON_SCHRANK, menge: 5 }, t.db);

    expect(erg).toEqual({
      ok: false,
      fehler: "In „Schrank 1“ liegen von dieser Charge nur 3 Stk. Es wurde nichts gebucht — bitte die Menge prüfen.",
    });
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist ein stillgelegtes Ziel und einen Schrank als Ziel ab", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10, "sch-1");
    t.db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, "fz-1")).run();

    const still = await bucheAufladen(VON_SCHRANK, t.db);
    const schrank = await bucheAufladen({
      fahrzeugId: HANDLAGER_ID, artikelId: "art-1", menge: 1,
      herkunft: { art: "ort", vonLagerortId: "sch-1", chargeId: "ch-1" },
    }, t.db);
    const neuInSchrank = await bucheAufladen({
      fahrzeugId: "sch-1", artikelId: "art-1", menge: 1,
      herkunft: { art: "neu", charge: { art: "vorhanden", chargeId: "ch-1" } },
    }, t.db);

    for (const erg of [still, schrank, neuInSchrank]) {
      expect(erg).toMatchObject({ ok: false });
      expect(!erg.ok && erg.fehler).toMatch(/nimmt kein Material mehr auf/);
    }
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist Herkunft gleich Ziel ab", async () => {
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 3, "fz-1");

    const erg = await bucheAufladen({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 1,
      herkunft: { art: "ort", vonLagerortId: "fz-1", chargeId: "ch-1" },
    }, t.db);

    expect(erg).toMatchObject({ ok: false, fehler: "Herkunft und Ziel müssen verschieden sein." });
    expect(neueZeilen()).toHaveLength(0);
  });

  it("weist eine unvollstaendige Eingabe mit Feldkarte ab", async () => {
    const erg = await bucheAufladen({ fahrzeugId: "fz-1", artikelId: "", menge: 0 }, t.db);

    expect(erg).toMatchObject({ ok: false, fehler: "Bitte die markierten Felder prüfen." });
    expect(neueZeilen()).toHaveLength(0);
  });

  it("laesst ohne GF-Riegel nichts durch", async () => {
    adminRiegel.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    charge("ch-1", "2030-01");
    buchen("seed-1", "ch-1", 10, "sch-1");

    await expect(bucheAufladen(VON_SCHRANK, t.db)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(neueZeilen()).toHaveLength(0);
  });
});
