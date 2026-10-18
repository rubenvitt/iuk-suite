import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { BESTANDSFLAECHEN } from "../_lib/revalidierung";

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

import { aussondern, aussondernSammel } from "./aussondern";

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
    /*
     * ⚠️ BIS DRK-374 STANDEN HIER DREI PFADE — ohne `verwaltung/journal`,
     * obwohl das Aussondern genau dort eine Zeile hinterlaesst. Seither die
     * modulweite Liste; der Sollwert steht woertlich in
     * `_lib/revalidierung.test.ts`. Hier zaehlt, WELCHE IDs mitgehen: die
     * Charge liegt im Handlager, also kein Ortsschirm, aber der Artikel.
     */
    expect(revalidiert).toEqual([...BESTANDSFLAECHEN]);
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

    /**
     * DER SICHTBARE BESTAND WIRD AUSGESONDERT, AUCH WENN DIE SUMME NEGATIV IST
     * (Codex-Befund zu PR #173).
     *
     * ⚠️ EIN ORT DARF IM MINUS STEHEN, und das ist kein erfundener Fall: das
     * Journal ist append-only, und die Fassung VOR DRK-297 buchte den ganzen
     * Rest auf die WURZEL, auch wenn er in den Schraenken lag. Genau die
     * Zeilen, die deren (Ort, Charge)-Saldo ins Minus gedrueckt haben, stehen
     * dort fuer immer — der Test daneben („bucht nichts auf die Wurzel") haelt
     * fest, dass es sie gab.
     *
     * Ueber die vorzeichenbehaftete SUMME geprueft, wiese die Aktion ab,
     * waehrend die Verfallsliste „Schrank 1: 4 Stk." zeigt: der Knopf schluege
     * reproduzierbar fehl, und bei nur EINEM sichtbaren Ort gaebe es nicht
     * einmal eine Auswahl, ueber die man ihn umgehen koennte.
     */
    it("sondert aus, obwohl die Gesamtsumme durch einen Minus-Ort negativ ist", async () => {
      // Die Wurzel ins Minus druecken: 4 + 6 − 11 = −1 ueber den Bereich.
      buchen({ id: "alt-wurzelbuchung", chargeId: CHARGE_ABGELAUFEN,
        lagerortId: HANDLAGER_ID, menge: -11, typ: "korrektur" });

      const erg = await aussondern({ chargeId: CHARGE_ABGELAUFEN, kommentar: "MHD" }, t.db);

      expect(erg.ok).toBe(true);
      // ⚠️ NUR DIE ZEILEN DER AKTION (`quelleTyp: "oidc"`): die Altzeile oben
      // traegt selbst `typ: "korrektur"` und stuende sonst in der Erwartung.
      // ⚠️ KEINE Zeile auf die Wurzel: eine negative Menge dort umgekehrt
      // gebucht schriebe Bestand ZU.
      expect(korrekturen().filter((b) => b.quelleTyp === "oidc")
        .map((b) => [b.lagerortId, b.menge]).sort())
        .toEqual([["schrank-1", -4], ["schrank-gf", -6]].sort());
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

/**
 * IDA-238 — MEHRERE ABGELAUFENE CHARGEN IN EINER ANFRAGE.
 *
 * Geprueft wird, was die Sammelaktion vom Einzelknopf erbt (je Charge und Ort
 * eine eigene Buchung, nur abgelaufen, nur Handlager, nie eine Menge) und was
 * sie anders macht: eine Charge, die nicht mehr geht, haelt die anderen nicht
 * auf.
 */
describe("aussondernSammel", () => {
  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
        aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 },
    ]).run();
    charge("ch-a", "2020-01");
    charge("ch-b", "2021-03");
    buchen({ id: "seed-a", chargeId: "ch-a", lagerortId: HANDLAGER_ID, menge: 3 });
    buchen({ id: "seed-b1", chargeId: "ch-b", lagerortId: HANDLAGER_ID, menge: 2 });
    buchen({ id: "seed-b2", chargeId: "ch-b", lagerortId: "schrank-1", menge: 5 });
  });

  function aussonderungen() {
    return t.db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all();
  }

  it("bucht je Charge und Ort eine eigene Aussonderung, in einer Anfrage", async () => {
    const erg = await aussondernSammel({
      chargen: [
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
        { chargeId: "ch-b", lagerortIds: [HANDLAGER_ID, "schrank-1"] },
      ],
    }, t.db);

    expect(erg).toEqual({
      ok: true,
      wert: { ausgesondert: ["ch-a", "ch-b"], uebersprungen: [] },
    });
    expect(aussonderungen().map((b) => [b.chargeId, b.lagerortId, b.menge, b.referenz]).sort())
      .toEqual([
        ["ch-a", HANDLAGER_ID, -3, `aussondern:${HANDLAGER_ID}`],
        ["ch-b", HANDLAGER_ID, -2, `aussondern:${HANDLAGER_ID}`],
        ["ch-b", "schrank-1", -5, "aussondern:schrank-1"],
      ].sort());
    // Der Kommentar entsteht auf dem Server, wortgleich mit dem Einzelknopf.
    expect(new Set(aussonderungen().map((b) => b.kommentar))).toEqual(new Set([
      "Verfallskontrolle — Charge ch-a · Mullbinde ausgesondert",
      "Verfallskontrolle — Charge ch-b · Mullbinde ausgesondert",
    ]));
    expect(aussonderungen().every((b) => b.quelleTyp === "oidc" && b.quelleId === "u-admin"))
      .toBe(true);
    expect(revalidiert).toEqual([...BESTANDSFLAECHEN]);
  });

  it("schreibt je Buchung eine Auditzeile mit dem angemeldeten Konto", async () => {
    t.sqlite.exec("DELETE FROM audit_outbox");

    await aussondernSammel({
      chargen: [
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
        { chargeId: "ch-b", lagerortIds: [HANDLAGER_ID, "schrank-1"] },
      ],
    }, t.db);

    const zeilen = t.sqlite
      .prepare("SELECT actor FROM audit_outbox WHERE object_type = 'buchungen'")
      .all() as { actor: string }[];
    expect(zeilen).toHaveLength(3);
    for (const zeile of zeilen) {
      expect(JSON.parse(zeile.actor)).toEqual({ kind: "user", id: "u-admin", name: "A. Verwaltung" });
    }
  });

  /**
   * DER FALL AUS DEM TICKET: zwischen Rendern und Bestaetigen hat eine andere
   * Sitzung eine der Chargen schon ausgesondert. Die uebrigen werden gebucht,
   * die eine kommt mit Grund zurueck — und an ihr entsteht keine zweite,
   * leere oder vorzeichenverkehrte Buchung.
   */
  it("sondert die uebrigen aus, wenn eine Charge zwischenzeitlich schon ausgesondert ist", async () => {
    expect((await aussondern({ chargeId: "ch-a", kommentar: "andere Sitzung" }, t.db)).ok).toBe(true);
    const vorher = aussonderungen().length;
    revalidiert.length = 0;

    const erg = await aussondernSammel({
      chargen: [
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
        { chargeId: "ch-b", lagerortIds: [HANDLAGER_ID] },
      ],
    }, t.db);

    expect(erg).toEqual({
      ok: true,
      wert: {
        ausgesondert: ["ch-b"],
        uebersprungen: [{ chargeId: "ch-a", grund: "bereits ausgesondert" }],
      },
    });
    expect(aussonderungen()).toHaveLength(vorher + 1);
    // Gebucht wird nur der genannte Ort; Schrank 1 stand nicht in der Rueckfrage.
    expect(aussonderungen().filter((b) => b.chargeId === "ch-b").map((b) => b.lagerortId))
      .toEqual([HANDLAGER_ID]);
    expect(revalidiert).toEqual([...BESTANDSFLAECHEN]);
  });

  it("ueberspringt unbekannte, noch gueltige und fremd verortete Chargen mit Grund", async () => {
    charge("ch-frisch", "2099-01");
    buchen({ id: "seed-frisch", chargeId: "ch-frisch", lagerortId: HANDLAGER_ID, menge: 1 });
    buchen({ id: "seed-fz", chargeId: "ch-b", lagerortId: "fz-1", menge: 4 });

    const erg = await aussondernSammel({
      chargen: [
        { chargeId: "gibt-es-nicht", lagerortIds: [HANDLAGER_ID] },
        { chargeId: "ch-frisch", lagerortIds: [HANDLAGER_ID] },
        // Ein Fahrzeug im Feld darf nichts ausbuchen — auch nicht den
        // Handlager-Teil daneben.
        { chargeId: "ch-b", lagerortIds: [HANDLAGER_ID, "fz-1"] },
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
      ],
    }, t.db);

    expect(erg).toEqual({
      ok: true,
      wert: {
        ausgesondert: ["ch-a"],
        uebersprungen: [
          { chargeId: "gibt-es-nicht", grund: "nicht gefunden" },
          { chargeId: "ch-frisch", grund: "nicht abgelaufen" },
          { chargeId: "ch-b", grund: "Ort gehört nicht zum Handlager" },
        ],
      },
    });
    expect(aussonderungen().map((b) => b.chargeId)).toEqual(["ch-a"]);
  });

  it("revalidiert nicht, wenn keine Charge gebucht wurde", async () => {
    const erg = await aussondernSammel({
      chargen: [{ chargeId: "gibt-es-nicht", lagerortIds: [HANDLAGER_ID] }],
    }, t.db);

    expect(erg.ok).toBe(true);
    expect(aussonderungen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("bucht eine doppelt genannte Charge nur einmal", async () => {
    await aussondernSammel({
      chargen: [
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
      ],
    }, t.db);

    expect(aussonderungen()).toHaveLength(1);
  });

  it.each([
    [{ chargen: [] }, "Bitte mindestens eine Charge auswählen."],
    [{ chargen: [{ chargeId: "ch-a", lagerortIds: [] }] }, "Ungültige Eingabe."],
    [{ chargen: [{ chargeId: "ch-a" }] }, "Ungültige Eingabe."],
    [{}, "Ungültige Eingabe."],
  ])("weist eine ungueltige Eingabe ohne Nebenwirkung ab (%j)", async (eingabe, satz) => {
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondernSammel(eingabe, t.db);

    expect(erg).toEqual({ ok: false, fehler: satz });
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  it("laesst den Admin-Riegel vor der Validierung entscheiden", async () => {
    const verweigert = new Error("Kein Lagerbuch-Admin");
    adminRiegel.mockRejectedValueOnce(verweigert);
    const anzahlVorher = alleBuchungen().length;

    await expect(aussondernSammel({
      chargen: [{ chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] }],
    }, t.db)).rejects.toBe(verweigert);

    expect(adminRiegel).toHaveBeenCalledTimes(1);
    erwarteKeineNebenwirkung(anzahlVorher);
  });

  /**
   * ⚠️ EIN WURF MITTENDRIN NIMMT ALLES ZURUECK. Die erste Charge waere schon
   * gebucht, wenn die zweite bricht; stuende sie danach im Journal, zeigte die
   * Oberflaeche „fehlgeschlagen" ueber einer halb ausgefuehrten Auswahl.
   */
  it("nimmt bei einem Datenbankfehler alle Buchungen der Anfrage zurueck", async () => {
    t.sqlite.exec(`
      CREATE TRIGGER aussondern_sammel_defekt
      BEFORE INSERT ON buchungen
      WHEN NEW.quelle_typ = 'oidc' AND NEW.charge_id = 'ch-b'
      BEGIN
        SELECT RAISE(ABORT, 'db-intern: geheim');
      END;
    `);
    const anzahlVorher = alleBuchungen().length;

    const erg = await aussondernSammel({
      chargen: [
        { chargeId: "ch-a", lagerortIds: [HANDLAGER_ID] },
        { chargeId: "ch-b", lagerortIds: [HANDLAGER_ID] },
      ],
    }, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Aussondern fehlgeschlagen." });
    erwarteKeineNebenwirkung(anzahlVorher);
  });
});
