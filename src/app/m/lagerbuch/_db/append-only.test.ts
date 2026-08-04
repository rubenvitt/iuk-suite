import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, chargen, lagerorte, buchungen, bzGeraete, bzKontrollen,
         o2Flaschen, o2Messungen, newId } from "./schema";

/**
 * „Die Trigger sind da, und sie sind es AUS DER MIGRATION."
 *
 * Portierung von lagerbuch/src/db/append-only.test.ts:19-37 mit EINER
 * entscheidenden Eigenschaft: `migrierteTestDb()` spielt die Migrationen ab. Ein
 * schema-gepushter Aufbau macht diese Datei gruen und INHALTSLEER — drizzle-kit
 * erzeugt keine Trigger.
 */
let t: TestDb;
let ids: { lagerId: string; artId: string; chId: string; buId: string;
           bzGeraetId: string; bzKontrolleId: string; flascheId: string; messungId: string };

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-appendonly-");
  const now = new Date();
  const lagerId = "handlager";     // von 0003_handlager.sql, schon da
  const artId = newId(); const chId = newId(); const buId = newId();
  const bzGeraetId = newId(); const bzKontrolleId = newId();
  const flascheId = newId(); const messungId = newId();

  t.db.insert(artikel).values({ id: artId, name: "Mullbinde", einheit: "Stk.", fach: "A2",
    mindestbestand: 10, createdAt: now }).run();
  t.db.insert(chargen).values({ id: chId, artikelId: artId, chargenNr: "X-1",
    verfall: "2028-06", createdAt: now }).run();
  t.db.insert(buchungen).values({ id: buId, ts: now, typ: "zugang", artikelId: artId,
    chargeId: chId, lagerortId: lagerId, menge: 5, quelleTyp: "system", quelleId: "seed" }).run();

  t.db.insert(bzGeraete).values({ id: bzGeraetId, name: "Accu-Chek", lagerortId: lagerId,
    createdAt: now }).run();
  t.db.insert(bzKontrollen).values({ id: bzKontrolleId, geraetId: bzGeraetId, ts: now,
    quelleTyp: "system", quelleId: "seed", bestanden: true }).run();

  t.db.insert(o2Flaschen).values({ id: flascheId, name: "O2-1", lagerortId: lagerId,
    createdAt: now }).run();
  t.db.insert(o2Messungen).values({ id: messungId, flascheId, ts: now, druckBar: 180,
    quelleTyp: "system", quelleId: "seed" }).run();

  ids = { lagerId, artId, chId, buId, bzGeraetId, bzKontrolleId, flascheId, messungId };
});

afterEach(() => t.schliessen());

describe("buchungen — das Journal (0001, woertlich aus der Alt-App)", () => {
  it("erlaubt INSERT", () => {
    expect(t.db.select().from(buchungen).all()).toHaveLength(1);
  });

  it("blockiert UPDATE", () => {
    expect(() => t.db.update(buchungen).set({ menge: 99 })
      .where(eq(buchungen.id, ids.buId)).run()).toThrow(/append-only/);
  });

  it("blockiert DELETE", () => {
    expect(() => t.db.delete(buchungen).where(eq(buchungen.id, ids.buId)).run())
      .toThrow(/append-only/);
  });

  it("blockiert auch eine sqlite3-Sitzung von Hand — es ist kein Konventionsschutz", () => {
    // Die Datenbank bricht jedes UPDATE und DELETE ab, unabhaengig davon, welcher
    // Prozess es faehrt. Es ist die einzige Invariante des Moduls, die nicht im
    // Code steht.
    expect(() => t.sqlite.prepare("update buchungen set menge = 99").run())
      .toThrow(/append-only/);
  });
});

describe("bz_kontrollen — der Medizinprodukte-Nachweis (0002, neu mit S2)", () => {
  it("erlaubt INSERT", () => {
    expect(t.db.select().from(bzKontrollen).all()).toHaveLength(1);
  });

  it("blockiert UPDATE", () => {
    expect(() => t.db.update(bzKontrollen).set({ bestanden: false })
      .where(eq(bzKontrollen.id, ids.bzKontrolleId)).run()).toThrow(/append-only/);
  });

  it("blockiert DELETE", () => {
    expect(() => t.db.delete(bzKontrollen).where(eq(bzKontrollen.id, ids.bzKontrolleId)).run())
      .toThrow(/append-only/);
  });
});

describe("o2_messungen — die BEWUSSTE Gegenprobe zu Entscheidung 5 (c)", () => {
  /**
   * Ohne diese drei Zusicherungen ist der Unterschied zwischen „bewusst offen
   * gelassen" und „vergessen" nicht lesbar.
   *
   * Der Grund: der Sauerstoff-Schritt des Fahrzeug-Checks ist auf den
   * Nennfuelldruck VORBELEGT und sendet beim Abschluss ausnahmslos alle Flaschen
   * des Standorts. Wer ihn durchklickt, erzeugt einen positiv aussehenden,
   * fachlich wertlosen Messwert — der in KEINEN der zwei Zweige aus §5.12 faellt
   * („auffaellig" / „nicht bewertbar"): er sieht plausibel aus und zaehlt als
   * bewertet. Der Entwurf erzeugt also selbst den Bedarf an Loeschbarkeit, den ein
   * Trigger hier wegnaehme.
   */
  it("erlaubt UPDATE", () => {
    expect(() => t.db.update(o2Messungen).set({ druckBar: 150 })
      .where(eq(o2Messungen.id, ids.messungId)).run()).not.toThrow();
  });

  it("erlaubt DELETE", () => {
    expect(() => t.db.delete(o2Messungen).where(eq(o2Messungen.id, ids.messungId)).run())
      .not.toThrow();
  });
});

describe("checks und lagerort_verfall bekommen ausdruecklich KEINE Trigger", () => {
  it("es gibt genau vier Trigger im Schema, und sie heissen so", () => {
    const namen = (t.sqlite.prepare(
      "select name from sqlite_master where type = 'trigger' order by name",
    ).all() as { name: string }[]).map((r) => r.name);
    expect(namen).toEqual([
      "buchungen_no_delete", "buchungen_no_update",
      "bz_kontrollen_no_delete", "bz_kontrollen_no_update",
    ]);
  });
});

describe("INSERT OR REPLACE — die gemessene Tatsache, nicht die Beschwerde", () => {
  it("umgeht den Trigger bei recursive_triggers = 0 (dem Default)", () => {
    // Selbst nachgemessen an better-sqlite3 ^12.11.1. `openModuleDatabase` setzt
    // genau vier Pragmas, und dieses ist KEINES davon. Wer einen Abbruch mit
    // INSERT OR REPLACE „repariert", hebelt die Append-only-Zusage lautlos aus —
    // und der Paritaetscheck bleibt gruen, weil er nur Zeileninhalte vergleicht.
    //
    // Dieser Test HAELT DIE TATSACHE FEST. Er ist der Grund, warum das
    // Import-Kapitel INSERT OR IGNORE vorschreibt, und er wird rot, falls eine
    // spaetere SQLite-Fassung das aendert.
    expect(t.sqlite.pragma("recursive_triggers", { simple: true })).toBe(0);

    expect(() => t.sqlite.prepare(
      `insert or replace into buchungen
         (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values (?, ?, 'zugang', ?, ?, ?, 999, 'system', 'ersetzt')`,
    ).run(ids.buId, 1770000000, ids.artId, ids.chId, ids.lagerId)).not.toThrow();

    const z = t.sqlite.prepare("select menge from buchungen where id = ?")
      .get(ids.buId) as { menge: number };
    expect(z.menge).toBe(999);   // stillschweigend ueberschrieben
  });

  it("mit PRAGMA recursive_triggers = ON bricht derselbe Aufruf ab", () => {
    t.sqlite.pragma("recursive_triggers = ON");
    expect(() => t.sqlite.prepare(
      `insert or replace into buchungen
         (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values (?, ?, 'zugang', ?, ?, ?, 999, 'system', 'ersetzt')`,
    ).run(ids.buId, 1770000000, ids.artId, ids.chId, ids.lagerId)).toThrow(/append-only/);
  });

  it("INSERT OR IGNORE ist das vorgeschriebene Idiom: laeuft durch, Zeile bleibt", () => {
    expect(() => t.sqlite.prepare(
      `insert or ignore into buchungen
         (id, ts, typ, artikel_id, charge_id, lagerort_id, menge, quelle_typ, quelle_id)
       values (?, ?, 'zugang', ?, ?, ?, 999, 'system', 'ignoriert')`,
    ).run(ids.buId, 1770000000, ids.artId, ids.chId, ids.lagerId)).not.toThrow();

    const z = t.sqlite.prepare("select menge, quelle_id from buchungen where id = ?")
      .get(ids.buId) as { menge: number; quelle_id: string };
    expect(z).toEqual({ menge: 5, quelle_id: "seed" });   // unveraendert
  });
});
