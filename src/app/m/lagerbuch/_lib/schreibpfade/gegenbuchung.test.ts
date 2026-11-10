import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { BuchungAbgewiesen } from "../buchungAbgewiesen";
import { handlagerOrte } from "../lesepfade/orte";
import { statistikDaten } from "../lesepfade/statistik";
import { bestellvorschlag } from "../lesepfade/bestellung";
import { journalEintraege } from "../lesepfade/journal";
import { fefoAbbuchungImBereich, type Quelle, type Tx } from "./abbuchung";
import { umlagerungAusBereich } from "./umlagerung";
import { sendungsIds, zeilenDerSendung } from "./sendung";
import { gegenbuchen, gegenzeilenId, vorgangsZeilen } from "./gegenbuchung";

/**
 * IDA-378 — DIE GEGENBUCHUNG. Zugesichert wird nicht nur „es entstehen
 * Zeilen", sondern das, wofuer sie da ist: danach sieht der Bestand, die
 * Statistik und der Bestellvorschlag aus, als haette es den Vorgang nie gegeben.
 */
const JETZT = new Date("2026-10-15T10:00:00Z");
const HELFER: Quelle = { quelleTyp: "token", quelleId: "482-137" };
const ADMIN: Quelle = { quelleTyp: "oidc", quelleId: "u-admin" };
const S1 = "11111111-1111-4111-8111-111111111111";
let t: TestDb;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(JETZT);
  t = migrierteTestDb("lagerbuch-sp-gegenbuchung-");
  t.db.insert(lagerorte).values(
    { id: "rtw", name: "RTW 1", typ: "fahrzeug", einheitenart: "fahrzeug", kennung: "1/83-1", aktiv: true },
  ).run();
  t.db.insert(artikel).values({ id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1",
    mindestbestand: 8, aktiv: true, createdAt: JETZT }).run();
  t.db.insert(chargen).values({ id: "c1", artikelId: "a1", chargenNr: "L1", verfall: "2028-01",
    createdAt: JETZT }).run();
  t.db.insert(buchungen).values({ id: "seed", ts: new Date("2026-10-01T08:00:00Z"), typ: "zugang",
    artikelId: "a1", chargeId: "c1", lagerortId: HANDLAGER_ID, menge: 10,
    quelleTyp: "system", quelleId: "seed", referenz: null, kommentar: null }).run();
});
afterEach(() => { t.schliessen(); vi.useRealTimers(); });

function inTx<T>(fn: (tx: Tx) => T): T {
  return t.db.transaction((tx) => fn(tx));
}
function bestand(ort: string): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.lagerortId === ort).reduce((s, b) => s + b.menge, 0);
}
function entnimm(menge: number, sendung = S1) {
  inTx((tx) => fefoAbbuchungImBereich(tx, {
    artikelId: "a1", menge, quelle: HELFER, kommentar: null, referenz: null,
    neueId: sendungsIds(sendung),
  }));
}
function aufsFahrzeug(menge: number, sendung = S1) {
  inTx((tx) => umlagerungAusBereich(tx, {
    artikelId: "a1", menge, vonBereich: handlagerOrte(tx), nachLagerortId: "rtw",
    quelle: HELFER, kommentar: null, referenz: "entnahme-ziel:rtw", neueId: sendungsIds(sendung),
  }));
}

describe("gegenbuchen", () => {
  it("schreibt je Zeile die Gegenzeile: gleicher Typ, Charge und Ort, umgekehrtes Vorzeichen", () => {
    entnimm(3);
    const zeilen = zeilenDerSendung(t.db, S1);
    inTx((tx) => gegenbuchen(tx, { zeilen, quelle: HELFER }));

    const gegen = t.db.select().from(buchungen).all().filter((b) => b.id.startsWith("storno:"));
    expect(gegen).toEqual([expect.objectContaining({
      id: `storno:${S1}:0`, referenz: `storno:${S1}:0`, typ: "entnahme",
      chargeId: "c1", lagerortId: HANDLAGER_ID, menge: 3, quelleTyp: "token", quelleId: "482-137",
    })]);
    expect(bestand(HANDLAGER_ID)).toBe(10);
  });

  it("nimmt eine Umlagerung aufs Fahrzeug mit BEIDEN Legs zurueck", () => {
    aufsFahrzeug(4);
    inTx((tx) => gegenbuchen(tx, { zeilen: zeilenDerSendung(t.db, S1), quelle: HELFER }));
    expect(bestand(HANDLAGER_ID)).toBe(10);
    expect(bestand("rtw")).toBe(0);
  });

  it("ein zweites Gegenbuchen wird abgewiesen und schreibt nichts", () => {
    entnimm(3);
    const zeilen = zeilenDerSendung(t.db, S1);
    inTx((tx) => gegenbuchen(tx, { zeilen, quelle: HELFER }));
    const vorher = t.db.select().from(buchungen).all().length;

    expect(() => inTx((tx) => gegenbuchen(tx, { zeilen, quelle: ADMIN })))
      .toThrow(new BuchungAbgewiesen("Dieser Vorgang ist schon gegengebucht."));
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
  });

  it("der Primaerschluessel haelt auch, wenn die Vorpruefung umgangen wird", () => {
    entnimm(3);
    const [zeile] = zeilenDerSendung(t.db, S1);
    inTx((tx) => gegenbuchen(tx, { zeilen: [zeile!], quelle: HELFER }));
    expect(() => t.db.insert(buchungen).values({ ...zeile!, id: gegenzeilenId(zeile!.id) }).run())
      .toThrow(/UNIQUE|PRIMARY/);
  });

  it("eine Gegenzeile ist selbst nicht gegenbuchbar", () => {
    entnimm(3);
    inTx((tx) => gegenbuchen(tx, { zeilen: zeilenDerSendung(t.db, S1), quelle: HELFER }));
    const gegen = vorgangsZeilen(t.db, `storno:${S1}:0`);
    expect(() => inTx((tx) => gegenbuchen(tx, { zeilen: gegen, quelle: ADMIN })))
      .toThrow(BuchungAbgewiesen);
  });

  it("weist ab, wenn der Rest am Ort nicht reicht — und rollt alles zurueck", () => {
    aufsFahrzeug(4);
    // Am Fahrzeug wurde inzwischen verbraucht: nur noch 1 von 4 liegt dort.
    t.db.insert(buchungen).values({ id: "verbrauch", ts: JETZT, typ: "korrektur", artikelId: "a1",
      chargeId: "c1", lagerortId: "rtw", menge: -3, quelleTyp: "system", quelleId: "check",
      referenz: "check:x", kommentar: null }).run();
    const vorher = t.db.select().from(buchungen).all().length;

    expect(() => inTx((tx) => gegenbuchen(tx, { zeilen: zeilenDerSendung(t.db, S1), quelle: ADMIN })))
      .toThrow(/In „RTW 1“ liegen von dieser Charge nur noch 1 Stk statt 4/);
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
    expect(bestand("rtw")).toBe(1);
  });

  it("weist Check-, Inventur- und Aussonderungszeilen ab", () => {
    const [seed] = vorgangsZeilen(t.db, "seed");
    for (const referenz of ["check:x", "inventur:i", "aussondern:handlager", "entnahmebox:rtw"]) {
      expect(() => inTx((tx) => gegenbuchen(tx, {
        zeilen: [{ ...seed!, id: `z-${referenz}`, typ: "korrektur", referenz }], quelle: ADMIN,
      }))).toThrow(new BuchungAbgewiesen("Dieser Vorgang lässt sich nicht gegenbuchen."));
    }
  });
});

describe("vorgangsZeilen — der Server bestimmt den Vorgang", () => {
  it("findet ueber eine Zeile der Sendung alle ihre Zeilen", () => {
    aufsFahrzeug(4);
    expect(vorgangsZeilen(t.db, `${S1}:1`).map((z) => z.id)).toEqual([`${S1}:0`, `${S1}:1`]);
  });

  it("ohne Sendung: gleiche Sekunde, Quelle, Artikel und Referenz", () => {
    t.db.insert(buchungen).values([
      { id: "alt-a", ts: JETZT, typ: "entnahme", artikelId: "a1", chargeId: "c1",
        lagerortId: HANDLAGER_ID, menge: -1, quelleTyp: "oidc", quelleId: "u1", referenz: null, kommentar: null },
      { id: "alt-b", ts: JETZT, typ: "entnahme", artikelId: "a1", chargeId: "c1",
        lagerortId: HANDLAGER_ID, menge: -2, quelleTyp: "oidc", quelleId: "u1", referenz: null, kommentar: null },
      // eine ANDERE Person in derselben Sekunde gehoert nicht dazu
      { id: "alt-c", ts: JETZT, typ: "entnahme", artikelId: "a1", chargeId: "c1",
        lagerortId: HANDLAGER_ID, menge: -1, quelleTyp: "oidc", quelleId: "u2", referenz: null, kommentar: null },
    ]).run();
    expect(vorgangsZeilen(t.db, "alt-a").map((z) => z.id).sort()).toEqual(["alt-a", "alt-b"]);
  });

  it("zwei Zugaenge derselben Person in derselben Sekunde bleiben zwei Vorgaenge", () => {
    t.db.insert(buchungen).values([
      { id: "zu-a", ts: JETZT, typ: "zugang", artikelId: "a1", chargeId: "c1",
        lagerortId: HANDLAGER_ID, menge: 3, quelleTyp: "oidc", quelleId: "u1", referenz: null, kommentar: null },
      { id: "zu-b", ts: JETZT, typ: "zugang", artikelId: "a1", chargeId: "c1",
        lagerortId: HANDLAGER_ID, menge: 4, quelleTyp: "oidc", quelleId: "u1", referenz: null, kommentar: null },
    ]).run();
    expect(vorgangsZeilen(t.db, "zu-a").map((z) => z.id)).toEqual(["zu-a"]);
    inTx((tx) => gegenbuchen(tx, { zeilen: vorgangsZeilen(tx, "zu-a"), quelle: ADMIN }));
    expect(bestand(HANDLAGER_ID)).toBe(10 + 4);
  });

  it("kennt eine unbekannte Zeile nicht", () => {
    expect(vorgangsZeilen(t.db, "gibt-es-nicht")).toEqual([]);
  });
});

/**
 * NETTO NULL IN DEN AUSWERTUNGEN. Verglichen wird mit dem Stand OHNE den
 * Vorgang — nicht mit einer erwarteten Zahl, die auch dann stimmen koennte,
 * wenn die Gegenzeilen gar nicht gezaehlt wuerden.
 */
describe("nach der Gegenbuchung: Statistik und Bestellvorschlag wie ohne Vorgang", () => {
  it("Entnahme in den Verbrauch", () => {
    const ohne = statistikDaten(t.db, 3, JETZT);
    const vorschlagOhne = bestellvorschlag(t.db);
    entnimm(5);
    expect(statistikDaten(t.db, 3, JETZT).bewegungen).not.toEqual(ohne.bewegungen);
    expect(bestellvorschlag(t.db)).not.toEqual(vorschlagOhne);

    inTx((tx) => gegenbuchen(tx, { zeilen: zeilenDerSendung(t.db, S1), quelle: HELFER }));
    const mit = statistikDaten(t.db, 3, JETZT);
    expect(mit.bewegungen).toEqual(ohne.bewegungen);
    expect(mit.bestandsDeltas).toEqual(ohne.bestandsDeltas);
    expect(bestellvorschlag(t.db)).toEqual(vorschlagOhne);
  });

  it("Entnahme aufs Fahrzeug (Nachschub an der Einheit)", () => {
    const ohne = statistikDaten(t.db, 3, JETZT);
    aufsFahrzeug(4);
    expect(statistikDaten(t.db, 3, JETZT).bewegungen).not.toEqual(ohne.bewegungen);

    inTx((tx) => gegenbuchen(tx, { zeilen: zeilenDerSendung(t.db, S1), quelle: HELFER }));
    const mit = statistikDaten(t.db, 3, JETZT);
    expect(mit.bewegungen).toEqual(ohne.bewegungen);
    expect(mit.bestandsDeltas).toEqual(ohne.bestandsDeltas);
  });
});

describe("Journal: Gegenzeilen sind eine eigene Vorgangsart", () => {
  it("markiert das Original und filtert die Gegenbuchung getrennt", () => {
    entnimm(3);
    inTx((tx) => gegenbuchen(tx, { zeilen: zeilenDerSendung(t.db, S1), quelle: HELFER }));

    const alle = journalEintraege(t.db).zeilen;
    expect(alle.find((z) => z.id === `${S1}:0`)).toMatchObject({ gegenbuchbar: true, gegengebucht: true });
    expect(alle.find((z) => z.id === `storno:${S1}:0`)).toMatchObject({ gegenbuchbar: false, gegengebucht: false });

    expect(journalEintraege(t.db, { vorgang: "gegenbuchung" }).zeilen.map((z) => z.id))
      .toEqual([`storno:${S1}:0`]);
    expect(journalEintraege(t.db, { vorgang: "entnahme" }).zeilen.map((z) => z.id))
      .toEqual([`${S1}:0`]);
  });
});
