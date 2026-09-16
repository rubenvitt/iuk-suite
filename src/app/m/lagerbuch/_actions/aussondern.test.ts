import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

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
  getDb: () => { throw new Error("getDb() im Test - jeder Aufruf uebergibt t.db"); },
}));

import { aussondern } from "./aussondern";

const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-aussondern-");

  // `handlager` wird von der Migration angelegt. `lagerorte` hat kein createdAt.
  t.db.insert(lagerorte).values({
    id: "fz-1",
    name: "RTW 1",
    typ: "fahrzeug",
    aktiv: true,
  }).run();
  t.db.insert(artikel).values([
    {
      id: "art-charge",
      name: "Mullbinde",
      einheit: "Stk",
      fach: "A-01",
      mindestbestand: 1,
      aktiv: true,
      createdAt: JETZT,
    },
    {
      // Existiert absichtlich: vertraute die Action einer Client-ID, bliebe der
      // Fremdschluessel gruen und nur die fachliche Zusage faende den Fehler.
      id: "art-client",
      name: "Fremder Artikel",
      einheit: "Stk",
      fach: "B-01",
      mindestbestand: 0,
      aktiv: true,
      createdAt: JETZT,
    },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

function charge(id: string, verfall: string) {
  t.db.insert(chargen).values({
    id,
    artikelId: "art-charge",
    chargenNr: `Charge ${id}`,
    verfall,
    createdAt: JETZT,
  }).run();
}

function buchen({
  id,
  chargeId,
  lagerortId,
  menge,
  typ = "zugang",
}: {
  id: string;
  chargeId: string;
  lagerortId: string;
  menge: number;
  typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
}) {
  t.db.insert(buchungen).values({
    id,
    ts: JETZT,
    typ,
    artikelId: "art-charge",
    chargeId,
    lagerortId,
    menge,
    quelleTyp: "system",
    quelleId: "seed",
    referenz: null,
    kommentar: null,
  }).run();
}

function alleBuchungen() {
  return t.db.select().from(buchungen).all();
}

function fehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; fehler: string }).fehler;
}

function feldFehlerVon(erg: { ok: boolean }) {
  return (erg as { ok: false; feldFehler?: Record<string, string> }).feldFehler;
}

function erwarteKeineNebenwirkung(anzahlVorher: number) {
  expect(alleBuchungen()).toHaveLength(anzahlVorher);
  expect(revalidiert).toEqual([]);
}

describe("aussondern", () => {
  it("schreibt genau eine negative korrektur fuer den Handlager-Rest", async () => {
    charge("ch-alt", "2020-01");
    buchen({ id: "seed-plus", chargeId: "ch-alt", lagerortId: HANDLAGER_ID, menge: 10 });
    buchen({
      id: "seed-minus",
      chargeId: "ch-alt",
      lagerortId: HANDLAGER_ID,
      menge: -3,
      typ: "entnahme",
    });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern(
      {
        chargeId: "ch-alt",
        artikelId: "art-client",
        kommentar: "  Verfallskontrolle 08/2026  ",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    const nachher = alleBuchungen();
    expect(nachher).toHaveLength(anzahlVorher + 1);
    const geschrieben = nachher.filter((b) => b.quelleTyp === "oidc");
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({
      typ: "korrektur",
      menge: -7,
      artikelId: "art-charge",
      chargeId: "ch-alt",
      lagerortId: HANDLAGER_ID,
      quelleTyp: "oidc",
      quelleId: "u-admin",
      kommentar: "Verfallskontrolle 08/2026",
    });
    /**
     * ⚠️ DIE REFERENZ IST DIE KENNZEICHNUNG, NICHT DER KOMMENTAR (DRK-344).
     * Ohne das Praefix stuende die Entsorgung abgelaufenen Materials im Journal
     * als „Korrektur" — nicht zu unterscheiden von einer Zaehlkorrektur, und
     * erkennbar nur an dem Grund, den jemand eingetippt hat. Der Kommentar ist
     * Freitext und traegt die Begruendung, nicht die Einordnung.
     *
     * Die MUTATION, die das faengt: `referenz` wieder auf `null` setzen. Sie
     * waere still — die Buchung entstuende richtig, nur die Anzeige verloere
     * ihre Aussage.
     */
    expect(geschrieben[0]?.referenz).toBe(`aussondern:${HANDLAGER_ID}`);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/artikel",
      "/m/lagerbuch/verwaltung",
    ]);
  });

  it("schliesst Bestand derselben Charge in einem Fahrzeug aus", async () => {
    charge("ch-verteilt", "2020-01");
    buchen({ id: "seed-hand", chargeId: "ch-verteilt", lagerortId: HANDLAGER_ID, menge: 3 });
    buchen({ id: "seed-fz", chargeId: "ch-verteilt", lagerortId: "fz-1", menge: 9 });

    const erg = await aussondern({ chargeId: "ch-verteilt", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(true);
    const geschrieben = alleBuchungen().filter((b) => b.quelleTyp === "oidc");
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0]).toMatchObject({
      chargeId: "ch-verteilt",
      lagerortId: HANDLAGER_ID,
      menge: -3,
    });
  });

  it("lehnt eine noch gueltige Charge ohne Schreiben oder Revalidierung ab", async () => {
    charge("ch-gueltig", "2099-12");
    buchen({ id: "seed-gueltig", chargeId: "ch-gueltig", lagerortId: HANDLAGER_ID, menge: 5 });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-gueltig", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/abgelaufen/i);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("meldet eine unbekannte Charge ohne Schreiben oder Revalidierung", async () => {
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-unbekannt", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/nicht gefunden/i);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("lehnt eine Charge ohne positiven Handlager-Rest trotz Fahrzeugbestand ab", async () => {
    charge("ch-ohne-hand", "2020-01");
    buchen({ id: "seed-nur-fz", chargeId: "ch-ohne-hand", lagerortId: "fz-1", menge: 4 });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-ohne-hand", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toMatch(/Restbestand/i);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("lehnt einen leeren Kommentar als Feldfehler ohne Nebenwirkung ab", async () => {
    charge("ch-kommentar", "2020-01");
    buchen({ id: "seed-kommentar", chargeId: "ch-kommentar", lagerortId: HANDLAGER_ID, menge: 1 });
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-kommentar", kommentar: "   " }, t.db);

    expect(erg.ok).toBe(false);
    expect(feldFehlerVon(erg)?.kommentar).toMatch(/Kommentar erforderlich/);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("ruft den Admin-Riegel vor der Validierung auf", async () => {
    const riegelFehler = new Error("Riegel vor Validierung");
    adminRiegel.mockRejectedValueOnce(riegelFehler);
    const anzahlVorher = alleBuchungen().length;

    await expect(aussondern({}, t.db)).rejects.toBe(riegelFehler);

    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("gibt beliebige Datenbankfehler nicht an den Client weiter", async () => {
    charge("ch-defekt", "2020-01");
    buchen({ id: "seed-defekt", chargeId: "ch-defekt", lagerortId: HANDLAGER_ID, menge: 2 });
    t.sqlite.exec(`
      CREATE TRIGGER aussondern_test_defekt
      BEFORE INSERT ON buchungen
      WHEN NEW.quelle_typ = 'oidc'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheime Infrastrukturmeldung');
      END;
    `);
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondern({ chargeId: "ch-defekt", kommentar: "Ablauf" }, t.db);

    expect(erg.ok).toBe(false);
    expect(fehlerVon(erg)).toBe("Aussondern fehlgeschlagen.");
    expect(fehlerVon(erg)).not.toContain("db-intern");
    erwarteKeineNebenwirkung(anzahlVorher);
  });
});

/**
 * DRK-297 — die letzte wurzelfeste Stelle: `aussondern` bucht bisher IMMER
 * auf `HANDLAGER_ID`, unabhaengig davon, wo die Charge tatsaechlich liegt.
 * Traegt ein Schrank Bestand, meldete die Aktion faelschlich „kein
 * Restbestand" (die Wurzel selbst hat nichts), und eine einzige Buchung auf
 * die Wurzel druekte deren (Ort, Charge)-Saldo ins Minus — in einem Journal
 * ohne UPDATE und ohne DELETE.
 */
describe("aussondern — DRK-297: bucht je Ort, an dem die Charge liegt", () => {
  const CHARGE_ABGELAUFEN = "ch-zwei-schraenke";

  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 },
      { id: "schrank-gf", name: "GF-Schrank", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 90 },
    ]).run();
    charge(CHARGE_ABGELAUFEN, "2020-01");
    buchen({ id: "seed-schrank-1", chargeId: CHARGE_ABGELAUFEN, lagerortId: "schrank-1", menge: 4 });
    buchen({ id: "seed-schrank-gf", chargeId: CHARGE_ABGELAUFEN, lagerortId: "schrank-gf", menge: 6 });
  });

  it("sondert eine Charge aus zwei Schraenken mit je einer Buchung aus", async () => {
    const ergebnis = await aussondern({ chargeId: CHARGE_ABGELAUFEN, kommentar: "MHD" }, t.db);

    expect(ergebnis.ok).toBe(true);
    const korrekturen = t.db.select().from(buchungen)
      .where(and(eq(buchungen.chargeId, CHARGE_ABGELAUFEN), eq(buchungen.typ, "korrektur"))).all();
    expect(korrekturen.map((b) => [b.lagerortId, b.menge]).sort())
      .toEqual([["schrank-1", -4], ["schrank-gf", -6]].sort());
  });

  /** ⚠️ EINE EINZIGE BUCHUNG AUF DIE WURZEL waere plausibel und still falsch:
   *  die Wurzel selbst traegt gar keinen Bestand, ihr Saldo liefe ins Minus,
   *  waehrend die Schraenke voll bleiben. */
  it("bucht nichts auf die Wurzel, wenn dort nichts liegt", async () => {
    await aussondern({ chargeId: CHARGE_ABGELAUFEN, kommentar: "MHD" }, t.db);
    const anDerWurzel = t.db.select().from(buchungen)
      .where(and(eq(buchungen.chargeId, CHARGE_ABGELAUFEN), eq(buchungen.lagerortId, HANDLAGER_ID))).all();
    expect(anDerWurzel).toEqual([]);
  });

  /**
   * DRK-339 — DER GEZIELTE ORT. Wer eine Charge aus EINEM Schrank nimmt, soll
   * genau diesen buchen koennen; ohne Angabe bleibt es bei „alles raus".
   */
  describe("mit lagerortId", () => {
    function korrekturen() {
      return t.db.select().from(buchungen)
        .where(and(eq(buchungen.chargeId, CHARGE_ABGELAUFEN), eq(buchungen.typ, "korrektur")))
        .all();
    }

    it("bucht NUR den gewaehlten Schrank und laesst den anderen stehen", async () => {
      const erg = await aussondern(
        { chargeId: CHARGE_ABGELAUFEN, lagerortId: "schrank-gf", kommentar: "MHD" },
        t.db,
      );

      expect(erg.ok).toBe(true);
      expect(korrekturen().map((b) => [b.lagerortId, b.menge])).toEqual([["schrank-gf", -6]]);
    });

    it("kennzeichnet die Zeile mit dem Praefix UND dem gewaehlten Ort", async () => {
      await aussondern(
        { chargeId: CHARGE_ABGELAUFEN, lagerortId: "schrank-1", kommentar: "MHD" },
        t.db,
      );

      expect(korrekturen()[0]?.referenz).toBe("aussondern:schrank-1");
    });

    it("bucht den SALDO DES ORTS, nicht eine mitgeschickte Zahl", async () => {
      /**
       * ⚠️ DIE MENGE IST KEIN EINGABEFELD, und dieser Test haelt das fest: ein
       * unbekanntes Feld faellt aus dem Schema, und gebucht wird, was die
       * Transaktion am Ort sieht. Naehme die Aktion je eine Menge entgegen,
       * buchte sie gegen den Stand, den der Schirm beim Rendern hatte — in
       * einem Journal ohne UPDATE und ohne DELETE.
       */
      buchen({ id: "spaeter-abgang", chargeId: CHARGE_ABGELAUFEN,
        lagerortId: "schrank-gf", menge: -2, typ: "entnahme" });

      await aussondern(
        { chargeId: CHARGE_ABGELAUFEN, lagerortId: "schrank-gf", menge: 6, kommentar: "MHD" },
        t.db,
      );

      expect(korrekturen().map((b) => [b.lagerortId, b.menge])).toEqual([["schrank-gf", -4]]);
    });

    /**
     * ⚠️ DER TEUERSTE STILLE AUSGANG DIESES TICKETS. Ohne die Bereichsprobe
     * waere diese Aktion die weiche Tuer neben `aussondernVomLagerort`: eine
     * Fahrzeug-ID im Feld, und der Fahrzeugbestand flöge aus — vorbei an der
     * Soll-Pruefung, die jener Weg genau dafuer fuehrt. Die Zeile entstuende
     * fehlerfrei und saehe im Journal aus wie jede andere Aussonderung.
     */
    it("weist einen Ort AUSSERHALB des Handlagers ab, ohne zu schreiben", async () => {
      buchen({ id: "seed-fz-selbe-charge", chargeId: CHARGE_ABGELAUFEN,
        lagerortId: "fz-1", menge: 9 });
      const anzahlVorher = alleBuchungen().length;

      const erg = await aussondern(
        { chargeId: CHARGE_ABGELAUFEN, lagerortId: "fz-1", kommentar: "MHD" },
        t.db,
      );

      expect(erg.ok).toBe(false);
      expect(fehlerVon(erg)).toMatch(/gehört nicht zum Handlager/i);
      erwarteKeineNebenwirkung(anzahlVorher);
    });

    it("meldet einen Handlager-Ort ohne Bestand dieser Charge, ohne zu schreiben", async () => {
      const anzahlVorher = alleBuchungen().length;

      const erg = await aussondern(
        { chargeId: CHARGE_ABGELAUFEN, lagerortId: HANDLAGER_ID, kommentar: "MHD" },
        t.db,
      );

      expect(erg.ok).toBe(false);
      expect(fehlerVon(erg)).toMatch(/An diesem Ort liegt nichts mehr/i);
      erwarteKeineNebenwirkung(anzahlVorher);
    });

    it("verlangt weiter eine ABGELAUFENE Charge — der Ort oeffnet keine zweite Tuer", async () => {
      charge("ch-gueltig-im-schrank", "2099-12");
      buchen({ id: "seed-gueltig-schrank", chargeId: "ch-gueltig-im-schrank",
        lagerortId: "schrank-1", menge: 5 });
      const anzahlVorher = alleBuchungen().length;

      const erg = await aussondern(
        { chargeId: "ch-gueltig-im-schrank", lagerortId: "schrank-1", kommentar: "MHD" },
        t.db,
      );

      expect(erg.ok).toBe(false);
      expect(fehlerVon(erg)).toMatch(/abgelaufen/i);
      erwarteKeineNebenwirkung(anzahlVorher);
    });
  });
});
