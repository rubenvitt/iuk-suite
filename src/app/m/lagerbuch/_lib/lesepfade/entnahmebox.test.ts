import { eq } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, tokens, users } from "../../_db/schema";
import { ENTNAHMEBOX_ID, ENTNAHMEBOX_NAME } from "../konstanten";
import { ENTNAHMEBOX_PRAEFIX } from "../vorgang";
import { boxInhalt, boxOrt, letzteBoxZugaenge, postenAmOrt } from "./entnahmebox";

/**
 * DER LESEPFAD DER ENTNAHMEBOX — DRK-314, gegen eine echte migrierte SQLite.
 */

const JETZT = new Date("2026-09-16T10:00:00Z");

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lesepfad-entnahmebox-");

  t.db.insert(lagerorte).values({
    id: "fz-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-DRK-1",
    aktiv: true, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(artikel).values({
    id: "art-2", name: "Ampullarium", einheit: "Pkg.", fach: "A-02",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
});

afterEach(() => t.schliessen());

function charge(id: string, verfall: string, artikelId = "art-1") {
  t.db.insert(chargen).values({
    id, artikelId, chargenNr: id, verfall, createdAt: JETZT,
  }).run();
}

function buchen(
  id: string,
  opts: {
    charge: string; menge: number; ort?: string; artikel?: string;
    ts?: Date; referenz?: string | null; quelleTyp?: "token" | "oidc" | "system";
    quelleId?: string;
  },
) {
  t.db.insert(buchungen).values({
    id,
    ts: opts.ts ?? JETZT,
    typ: "umlagerung",
    artikelId: opts.artikel ?? "art-1",
    chargeId: opts.charge,
    lagerortId: opts.ort ?? ENTNAHMEBOX_ID,
    menge: opts.menge,
    quelleTyp: opts.quelleTyp ?? "system",
    quelleId: opts.quelleId ?? "seed",
    referenz: opts.referenz ?? null,
    kommentar: null,
  }).run();
}

describe("boxOrt", () => {
  it("findet die Zeile, die Migration 0011 anlegt — mit genau diesem Namen", () => {
    // ⚠️ DER NAME STEHT AN ZWEI STELLEN: in der Migration und als
    // `ENTNAHMEBOX_NAME` (fuer Flaechen, die ueber die Box sprechen, ohne sie
    // geladen zu haben). Laufen sie auseinander, liest ein Seitenkopf einen
    // anderen Namen als die Zeile daneben.
    expect(boxOrt(t.db)).toEqual({ id: ENTNAHMEBOX_ID, name: ENTNAHMEBOX_NAME, aktiv: true });
  });

  it("meldet `null`, wenn es die Zeile nicht gibt", () => {
    // „gibt es nicht" und „ist leer" sind zwei Aussagen, und nur die erste
    // verlangt, dass jemand etwas einrichtet.
    t.db.delete(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    expect(boxOrt(t.db)).toBeNull();
  });

  it("meldet `null`, wenn unter der Id kein LAGER steht", () => {
    // Eine Zeile mit dieser Id, die kein Lager ist, ist nicht die Box, sondern
    // eine Namenskollision — eine Buchung dagegen liefe still in einen fremden
    // Ort.
    t.db.update(lagerorte).set({ typ: "fahrzeug" })
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    expect(boxOrt(t.db)).toBeNull();
  });

  it("meldet die Stilllegung, statt die Zeile zu verschweigen", () => {
    t.db.update(lagerorte).set({ aktiv: false })
      .where(eq(lagerorte.id, ENTNAHMEBOX_ID)).run();
    expect(boxOrt(t.db)?.aktiv).toBe(false);
  });
});

describe("boxInhalt", () => {
  it("ist leer, solange nichts gebucht wurde", () => {
    expect(boxInhalt(t.db, JETZT)).toEqual([]);
  });

  it("fasst je Artikel zusammen und haengt die Chargen FEFO-sortiert daran", () => {
    charge("ch-neu", "2030-01");
    charge("ch-alt", "2027-01");
    buchen("b-1", { charge: "ch-neu", menge: 3 });
    buchen("b-2", { charge: "ch-alt", menge: 2 });

    const inhalt = boxInhalt(t.db, JETZT);
    expect(inhalt).toHaveLength(1);
    expect(inhalt[0]!.artikelName).toBe("Kühlkompresse");
    expect(inhalt[0]!.einheit).toBe("Stk");
    expect(inhalt[0]!.menge).toBe(5);
    // FEFO: die frueher ablaufende zuerst — dieselbe Ordnung, in der sie auch
    // wieder herausgehen wuerde.
    expect(inhalt[0]!.chargen.map((c) => c.id)).toEqual(["ch-alt", "ch-neu"]);
    expect(inhalt[0]!.chargen.map((c) => c.rest)).toEqual([2, 3]);
  });

  it("sortiert die Posten nach Artikelnamen", () => {
    charge("ch-1", "2030-01");
    charge("ch-2", "2030-01", "art-2");
    buchen("b-1", { charge: "ch-1", menge: 1 });
    buchen("b-2", { charge: "ch-2", menge: 1, artikel: "art-2" });

    expect(boxInhalt(t.db, JETZT).map((p) => p.artikelName))
      .toEqual(["Ampullarium", "Kühlkompresse"]);
  });

  it("laesst einen leergebuchten Artikel WEG — 0 ist kein Posten", () => {
    charge("ch-1", "2030-01");
    buchen("b-1", { charge: "ch-1", menge: 4 });
    buchen("b-2", { charge: "ch-1", menge: -4 });

    expect(boxInhalt(t.db, JETZT)).toEqual([]);
  });

  it("zeigt auch einen STILLGELEGTEN Artikel, solange er dort liegt", () => {
    // Der Unterschied zur Artikelliste, und er ist fachlich: ein stillgelegter
    // Artikel in der Kiste ist genau der, den jemand herausnehmen und entsorgen
    // muss. Ihn auszublenden hiesse, Material aus der einzigen Ansicht zu
    // nehmen, die es zeigt.
    charge("ch-1", "2030-01");
    buchen("b-1", { charge: "ch-1", menge: 2 });
    t.db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, "art-1")).run();

    expect(boxInhalt(t.db, JETZT).map((p) => p.artikelId)).toEqual(["art-1"]);
  });

  it("rechnet die Ampel serverseitig und beschriftet sie wie der Rest des Moduls", () => {
    charge("ch-abgelaufen", "2020-01");
    buchen("b-1", { charge: "ch-abgelaufen", menge: 1 });

    const c = boxInhalt(t.db, JETZT)[0]!.chargen[0]!;
    expect(c.ampel).toBe("rot");
    // Der Chiptext ist Vertrag, nicht Dekoration (`_lib/format.ts`): dieselben
    // vier Worte stehen an der Charge im Artikeldetail und im Entnahmeschirm.
    expect(c.text).toBe("abgelaufen");
  });

  it("zaehlt NUR die Box — was am Fahrzeug liegt, gehoert nicht hinein", () => {
    charge("ch-1", "2030-01");
    buchen("b-fz", { charge: "ch-1", menge: 7, ort: "fz-1" });
    buchen("b-box", { charge: "ch-1", menge: 2 });

    expect(boxInhalt(t.db, JETZT)[0]!.menge).toBe(2);
    expect(postenAmOrt(t.db, "fz-1", JETZT)[0]!.menge).toBe(7);
  });
});

describe("letzteBoxZugaenge", () => {
  beforeEach(() => {
    t.db.insert(users).values({ id: "u-1", name: "A. Verwaltung", email: null }).run();
    t.db.insert(tokens).values({
      id: "tk-1", code: "123-456", label: "Kärtchen RTW 1", aktiv: true,
      createdAt: JETZT, createdBy: "u-1", zielTyp: null, zielId: null, scopeLagerortId: null,
    }).run();
  });

  it("zeigt je Vorgang EINE Zeile — nicht beide Legs", () => {
    /*
     * ⚠️ OHNE DIE BEDINGUNG `menge > 0` STUENDE JEDER VORGANG ZWEIMAL DA: eine
     * Umlagerung schreibt zwei Zeilen mit derselben Referenz, eine negative in
     * der Einheit und eine positive in der Box.
     */
    charge("ch-1", "2030-01");
    buchen("ab", { charge: "ch-1", menge: -3, ort: "fz-1", referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1` });
    buchen("zu", { charge: "ch-1", menge: 3, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1` });

    const zugaenge = letzteBoxZugaenge(t.db);
    expect(zugaenge).toHaveLength(1);
    expect(zugaenge[0]!.menge).toBe(3);
  });

  it("loest die Herkunft aus der Referenz auf — mit Art, nicht nur mit Namen", () => {
    charge("ch-1", "2030-01");
    buchen("zu", { charge: "ch-1", menge: 2, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1` });

    // `standortZeile`: „Name · Art · Kennung". Zwei gleichnamige Einheiten sind
    // sonst in dieser Spalte nicht zu unterscheiden (DRK-309).
    expect(letzteBoxZugaenge(t.db)[0]!.herkunft).toBe("RTW 1 · Fahrzeug · MS-DRK-1");
  });

  it("meldet `null`, wenn es die Einheit nicht mehr gibt — statt die rohe Id zu zeigen", () => {
    // Die Referenz traegt KEINEN Fremdschluessel; eine geloeschte Einheit
    // hinterlaesst sie als Waise. Ein geratener Name waere eine Behauptung ueber
    // einen Vorgang, und das Journal ist append-only.
    charge("ch-1", "2030-01");
    buchen("zu", { charge: "ch-1", menge: 2, referenz: `${ENTNAHMEBOX_PRAEFIX}weg-1` });

    expect(letzteBoxZugaenge(t.db)[0]!.herkunft).toBeNull();
  });

  it("loest den Kaertchen-Code in sein Etikett auf und den sub in den Klarnamen", () => {
    charge("ch-1", "2030-01");
    buchen("zu-1", {
      charge: "ch-1", menge: 1, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1`,
      quelleTyp: "token", quelleId: "123-456", ts: new Date("2026-09-16T09:00:00Z"),
    });
    buchen("zu-2", {
      charge: "ch-1", menge: 1, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1`,
      quelleTyp: "oidc", quelleId: "u-1", ts: new Date("2026-09-16T09:30:00Z"),
    });

    expect(letzteBoxZugaenge(t.db).map((z) => z.wer))
      .toEqual(["A. Verwaltung", "Kärtchen RTW 1"]);
  });

  it("sortiert neueste zuerst und bricht Gleichstand deterministisch", () => {
    /*
     * ⚠️ DIE SEKUNDE ALLEIN IST KEINE TOTALE ORDNUNG: eine Umlagerung ueber drei
     * Chargen schreibt alle Zeilen in DERSELBEN Sekunde. Ohne den
     * `id`-Tiebreaker entschiede die Ruecklieferreihenfolge der Datenbank, und
     * die Liste vertauschte ihre Zeilen von Aufruf zu Aufruf.
     */
    charge("ch-a", "2030-01");
    charge("ch-b", "2030-02");
    buchen("zu-b", { charge: "ch-b", menge: 1, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1` });
    buchen("zu-a", { charge: "ch-a", menge: 1, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1` });
    buchen("zu-alt", {
      charge: "ch-a", menge: 1, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1`,
      ts: new Date("2026-09-15T08:00:00Z"),
    });

    expect(letzteBoxZugaenge(t.db).map((z) => z.buchungId))
      .toEqual(["zu-b", "zu-a", "zu-alt"]);
  });

  it("uebergeht Boxbuchungen OHNE das Praefix", () => {
    // Eine Inventurkorrektur an der Box ist kein Zugang aus einer Einheit; sie
    // traegt keine Herkunft, und die Spalte „Aus" waere dauerhaft leer.
    charge("ch-1", "2030-01");
    buchen("fremd", { charge: "ch-1", menge: 5, referenz: "inventur:iv-1" });

    expect(letzteBoxZugaenge(t.db)).toEqual([]);
  });

  it("deckelt auf die uebergebene Grenze", () => {
    charge("ch-1", "2030-01");
    for (let i = 0; i < 5; i++) {
      buchen(`zu-${i}`, { charge: "ch-1", menge: 1, referenz: `${ENTNAHMEBOX_PRAEFIX}fz-1` });
    }
    expect(letzteBoxZugaenge(t.db, 2)).toHaveLength(2);
  });
});
