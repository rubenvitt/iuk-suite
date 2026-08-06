import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  lagerorte, artikel, chargen, buchungen, sollPositionen, geraete,
  o2Flaschen, o2Messungen, checks, lagerortVerfall,
} from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { RIEGEL_TEXTE, darfErneuern } from "../_lib/actionTypen";

/**
 * DER FAHRZEUG-CHECK-ABSCHLUSS — §5.8, §7.9.4.
 *
 * Was diese Datei traegt, und warum jeweils GENAU HIER:
 *
 *   - Der Riegel steht VOR dem `safeParse` (§7.4.3). Der Traeger ist eine
 *     Nutzlast, die das Schema NICHT besteht: liefe der Parse zuerst, kaeme
 *     `grund: "eingabe"` statt der Sitzungsauskunft.
 *   - Der Rueckgabewert des Riegels wird AUSGEWERTET. Der Traeger ist der
 *     `gesperrt`-Fall mit einer schreibenden Nutzlast; die zwei Quelltext-Scans
 *     weiter unten sind Redundanz, nicht der Traeger.
 *   - Die vier Zugehoerigkeitspruefungen bleiben WUERFE (§7.3, Riegelfall) und
 *     die Transaktion laeuft dabei VOLLSTAENDIG zurueck.
 *   - `revalidatePath` bekommt die INNEREN Pfade (§7.9.5, Falle 49).
 */

const QUELLE = "src/app/m/lagerbuch/_actions/check.ts";

/**
 * ZEICHENGLEICH aus `_lib/bauform.test.ts:84-104` kopiert. Die Funktion ist dort
 * NICHT exportiert (N-5); `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts`, `_actions/gate.test.ts` und
 * `_actions/sitzung.test.ts` halten es genauso.
 *
 * ⚠️ OHNE SIE IST DER `requireLagerbuchHost`-SCAN AUF SEINER EIGENEN BEGRUENDUNG
 * ROT: `_actions/check.ts` schreibt „requireLagerbuchHost wird hier NICHT
 * gerufen" in seinen Riegel-Kommentar, und die naheliegende „Reparatur" waere
 * das Loeschen genau dieser Begruendung (Befund 1, Regel 1).
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Die Vorrichtung liegt in `vi.hoisted`, wie im Bestand (`_actions/gate.test.ts:71`):
 * `vi.mock`-Aufrufe werden an den Dateikopf gehoben, und ein Modulebenen-`const`
 * waere zu diesem Zeitpunkt noch in der temporalen Totzone.
 */
const { revalidiert, riegel } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  riegel: vi.fn<(db: unknown) => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => { revalidiert.push(p); },
}));

vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: (db: unknown) => riegel(db),
}));

/**
 * `getDb()` darf in diesem Lauf NIE fallen: jeder Aufruf uebergibt `t.db`
 * ausdruecklich. Ein Wurf statt eines Stubs macht einen vergessenen
 * db-Parameter laut statt still — sonst oeffnete der Test die ECHTE Moduldatei
 * unter `.data/` und schriebe hinein.
 */
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { checkAbschluss } from "./check";

let t: TestDb;

const ZUGANG_OK = {
  ok: true,
  zugang: {
    tokenId: "tk1",
    code: "482-137",
    label: "RTW 1",
    laeuftAb: new Date(Date.now() + 3_600_000),
  },
};

beforeEach(() => {
  revalidiert.length = 0;
  riegel.mockResolvedValue(ZUGANG_OK);
  t = migrierteTestDb();
  const jetzt = new Date();
  // ⚠️ `handlager` wird NICHT eingefuegt: Migration `0003_handlager.sql:16`
  // legt die Zeile an, und ein zweiter Insert scheitert mit
  // `UNIQUE constraint failed: lagerorte.id`. Ebenso traegt `lagerorte` KEIN
  // `createdAt` (`_db/schema.ts:32-43`).
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true },
    { id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true },
  ]).run();
  expect(t.db.select().from(lagerorte).all().some((l) => l.id === HANDLAGER_ID)).toBe(true);
  t.db.insert(artikel).values([
    { id: "art-1", name: "Kompresse", einheit: "Stk", fach: "A-01", mindestbestand: 0, aktiv: true, createdAt: jetzt },
    // Zweiter Soll-Artikel des FAHRZEUGS, den keine Nutzlast dieses Tests
    // anfasst — er traegt die Zusage „zaehlt den GANZEN Fahrzeugstand".
    { id: "art-2", name: "Wärmedecke", einheit: "Stk", fach: "A-02", mindestbestand: 0, aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(chargen).values([
    { id: "ch-1", artikelId: "art-1", chargenNr: "L1", verfall: "2027-03", createdAt: jetzt },
  ]).run();
  // 10 Stueck im Handlager.
  t.db.insert(buchungen).values([
    { id: "b-1", ts: jetzt, typ: "zugang", artikelId: "art-1", chargeId: "ch-1",
      lagerortId: HANDLAGER_ID, menge: 10, quelleTyp: "system", quelleId: "seed",
      kommentar: null, referenz: null },
  ]).run();
  t.db.insert(sollPositionen).values([
    { id: "sp-1", fahrzeugId: "fz-1", fachLabel: "Fach 1", sort: 1, artikelId: "art-1",
      soll: 5, entfernt: false },
    { id: "sp-2", fahrzeugId: "fz-1", fachLabel: "Fach 2", sort: 2, artikelId: "art-2",
      soll: 2, entfernt: false },
    { id: "sp-fremd", fahrzeugId: "fz-2", fachLabel: "Fach 1", sort: 1, artikelId: "art-1",
      soll: 3, entfernt: false },
  ]).run();
  t.db.insert(geraete).values([
    { id: "g-1", typ: "medizin", name: "Absaugpumpe", lagerortId: "fz-1", aktiv: true, createdAt: jetzt },
    { id: "g-fremd", typ: "medizin", name: "Fremd", lagerortId: "fz-2", aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(o2Flaschen).values([
    { id: "o-1", name: "O2 klein", lagerortId: "fz-1", nennfuelldruckBar: 200, aktiv: true, createdAt: jetzt },
    { id: "o-null", name: "O2 unbekannt", lagerortId: "fz-1", nennfuelldruckBar: 0, aktiv: true, createdAt: jetzt },
    { id: "o-fremd", name: "O2 fremd", lagerortId: "fz-2", nennfuelldruckBar: 200, aktiv: true, createdAt: jetzt },
  ]).run();
});

// ⚠️ `t.schliessen()`, NICHT `t.aufraeumen()`: `TestDb` hat genau `db`, `sqlite`
// und `schliessen` (Teil 1, T9 — Befund 11).
afterEach(() => { t.schliessen(); vi.clearAllMocks(); });

const leer = { positionen: [], geraete: [], flaschen: [], verfaelle: [] };

/** Eine Nutzlast, die das Schema NICHT besteht — `fahrzeugId` fehlt ganz. */
const UNPARSBAR = {};

/** Eine Nutzlast, die SCHREIBEN wuerde: Korrektur auf 2 UND eine Umlagerung. */
const SCHREIBENDE_NUTZLAST = {
  fahrzeugId: "fz-1", ...leer,
  positionen: [{ sollPositionId: "sp-1", ist: 2, nachfuellMenge: 3 }],
};

describe("checkAbschluss — der Riegel ist die ERSTE Anweisung", () => {
  it("antwortet bei abgelaufener Sitzung mit `sitzung` — auf einer Nutzlast, die kein Schema besteht", async () => {
    // DER TRAEGER DER REIHENFOLGE. `UNPARSBAR` ist nachweislich unparsbar (der
    // Nachbartest unten belegt es mit demselben Wert und einem OK-Riegel).
    // Liefe der `safeParse` zuerst, stuende hier `grund: "eingabe"` — und die
    // Helferin saehe „Eingabe unvollstaendig", wo ihre Sitzung abgelaufen ist.
    riegel.mockResolvedValue({ ok: false, grund: "sitzung" });
    const r = await checkAbschluss(UNPARSBAR, t.db);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.grund).toBe("sitzung");
    expect(!r.ok && r.text).toBe(RIEGEL_TEXTE.sitzung);
  });

  it("dieselbe Nutzlast ergibt mit gueltiger Sitzung `eingabe` — damit ist sie als unparsbar belegt", async () => {
    // Regel 4: DIESER Test zeigt, dass der Nachbar oben tatsaechlich
    // diskriminiert. Ohne ihn koennte `UNPARSBAR` versehentlich parsbar sein.
    const r = await checkAbschluss(UNPARSBAR, t.db);
    expect(!r.ok && r.grund).toBe("eingabe");
  });

  it("antwortet bei gesperrtem Token mit `gesperrt` und schreibt NICHTS — auf einer SCHREIBENDEN Nutzlast", async () => {
    // DER TRAEGER DER AUSWERTUNG. Die Nutzlast wuerde ohne den Riegel eine
    // Korrekturbuchung UND zwei Umlagerungs-Legs schreiben. Faellt
    // `if (!riegel.ok) return`, laeuft der Code in `riegel.zugang.code` —
    // und dieser Test wird rot, nicht ein Quelltext-Scan.
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });
    const r = await checkAbschluss(SCHREIBENDE_NUTZLAST, t.db);
    expect(!r.ok && r.grund).toBe("gesperrt");
    expect(!r.ok && r.text).toBe(RIEGEL_TEXTE.gesperrt);
    expect(t.db.select().from(checks).all().length).toBe(0);
    expect(t.db.select().from(buchungen).all().length).toBe(1);   // nur die Seed-Zeile
  });

  it("bekommt GENAU das uebergebene DB-Handle — nicht ein zweites aus getDb()", async () => {
    await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(riegel).toHaveBeenCalledTimes(1);
    expect(riegel.mock.calls[0][0]).toBe(t.db);
  });
});

describe("checkAbschluss — `eingabe` statt `netz` (Betreiberentscheidung B4)", () => {
  it("gibt bei ungueltiger Nutzlast `grund: \"eingabe\"` zurueck — NIE `netz`", async () => {
    // Global Constraint 12: `"netz"` entsteht NIE serverseitig. Es ist der
    // Grund, den der Client im `catch` selbst setzt.
    const r = await checkAbschluss({ fahrzeugId: "fz-1", ...leer, positionen: [{ sollPositionId: "", ist: 1, nachfuellMenge: 0 }] }, t.db);
    expect(!r.ok && r.grund).toBe("eingabe");
    expect(!r.ok && r.grund).not.toBe("netz");
  });

  it("der zurueckgegebene Grund oeffnet KEIN Erneuerungsfeld", async () => {
    // ⚠️ NICHT dieselbe Zusage wie `it("\`eingabe\` darf NICHT …")` in
    // `_lib/actionTypen.test.ts` (Regel 4). Dort steht ein LITERAL; hier laeuft
    // der Grund durch die Action und wird DARAUS in `darfErneuern` gereicht.
    // Der Traeger von „darfErneuern('eingabe') === false" ist der Test drueben;
    // dieser haelt die KOPPLUNG — griffe der safeParse-Zweig kuenftig zu
    // `"sitzung"`, bekaeme die Helferin ein Zahlenfeld angeboten, das ihre
    // unvollstaendige Nutzlast nicht vollstaendig macht.
    const r = await checkAbschluss(UNPARSBAR, t.db);
    expect(r.ok).toBe(false);
    expect(!r.ok && darfErneuern(r.grund)).toBe(false);
  });

  it("nennt den Text die Eingabe und nicht die Verbindung", async () => {
    const r = await checkAbschluss(UNPARSBAR, t.db);
    expect(!r.ok && r.text).toBe(
      "Die Eingabe war unvollständig. Bitte die Seite neu laden und erneut abschließen.",
    );
    expect(!r.ok && r.text).not.toMatch(/Verbindung/);
  });

  it("schreibt bei ungueltiger Nutzlast NICHTS und revalidiert NICHT", async () => {
    await checkAbschluss(UNPARSBAR, t.db);
    expect(t.db.select().from(checks).all().length).toBe(0);
    expect(revalidiert).toEqual([]);
  });
});

describe("checkAbschluss — die vier Wuerfe bleiben Wuerfe (§7.3, Riegelfall)", () => {
  it("fremde Soll-Position", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-fremd", ist: 1, nachfuellMenge: 0 }],
    }, t.db)).rejects.toThrow("Soll-Position gehört nicht zu diesem Fahrzeug");
  });

  it("fremdes Geraet", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-fremd", vorhanden: true, zustand: "In Ordnung" }],
    }, t.db)).rejects.toThrow("Gerät gehört nicht zu diesem Fahrzeug");
  });

  it("fremde Flasche", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      flaschen: [{ flascheId: "o-fremd", druckBar: 180 }],
    }, t.db)).rejects.toThrow("Flasche gehört nicht zu diesem Fahrzeug");
  });

  it("fremder Artikel im Verfall", async () => {
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      verfaelle: [{ artikelId: "art-unbekannt", verfall: "2027-03" }],
    }, t.db)).rejects.toThrow("Artikel gehört nicht zu diesem Fahrzeug");
  });

  it("ein Wurf laesst die Transaktion VOLLSTAENDIG zuruecklaufen", async () => {
    // Ein halb geschriebener Check waere der teuerste Zustand: Bestand
    // verschoben, aber kein Check-Eintrag, der es erklaert. Die Umlagerung
    // steht VOR der Geraetepruefung und hat zum Wurfzeitpunkt bereits zwei
    // Legs geschrieben.
    await checkAbschluss({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
      geraete: [{ geraetId: "g-fremd", vorhanden: false }],
      flaschen: [], verfaelle: [],
    }, t.db).catch(() => {});
    expect(t.db.select().from(checks).all().length).toBe(0);
    expect(t.db.select().from(buchungen).all().length).toBe(1);   // nur die Seed-Zeile
    expect(revalidiert).toEqual([]);
  });
});

describe("checkAbschluss — Abgleich und Nachfuellen, pro ARTIKEL", () => {
  it("setzt den Fahrzeugbestand auf die Summe der gezaehlten Ist (I4)", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 2, nachfuellMenge: 0 }],
    }, t.db);
    expect(r.ok).toBe(true);
    const amFahrzeug = t.db.select().from(buchungen).all()
      .filter((b) => b.lagerortId === "fz-1")
      .reduce((s, b) => s + b.menge, 0);
    expect(amFahrzeug).toBe(2);
  });

  it("rechnet pro ARTIKEL, nicht pro Position — zwei Faecher teilen EINEN Bestand (§5.7.1)", async () => {
    // Derselbe Artikel in zwei Faechern: 3 + 2 gezaehlt ⇒ EIN Fahrzeugbestand
    // von 5. Pro Position gerechnet ergaebe die zweite Korrektur `ist − 3`
    // und der Bestand stuende am Ende auf 2.
    t.db.insert(sollPositionen).values([
      { id: "sp-1b", fahrzeugId: "fz-1", fachLabel: "Fach 3", sort: 3, artikelId: "art-1",
        soll: 4, entfernt: false },
    ]).run();
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [
        { sollPositionId: "sp-1", ist: 3, nachfuellMenge: 0 },
        { sollPositionId: "sp-1b", ist: 2, nachfuellMenge: 0 },
      ],
    }, t.db);
    expect(r.ok).toBe(true);
    const amFahrzeug = t.db.select().from(buchungen).all()
      .filter((b) => b.lagerortId === "fz-1")
      .reduce((s, b) => s + b.menge, 0);
    expect(amFahrzeug).toBe(5);
    const roh = JSON.parse(t.db.select().from(checks).all()[0].ergebnis!);
    expect(roh.artikel.length).toBe(1);
    expect(roh.artikel[0].positionen).toBe(2);
    expect(roh.artikel[0].sollSumme).toBe(9);
    expect(roh.positionen.length).toBe(2);
  });

  it("lagert die bestaetigte Menge um und meldet BEIDE Zahlen", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
    }, t.db);
    expect(r.ok && r.wert.nachgefuellt).toBe(5);
    expect(r.ok && r.wert.nachfuellBestaetigt).toBe(5);
  });

  it("kappt an der Handlager-Verfuegbarkeit — und sagt es (§7.9.4, NEU)", async () => {
    // `umlagerung` kappt STILL, und der Helfer hat die Teile in der Hand. Ohne
    // die zweite Zahl legt er sie ins Fahrzeug und das Journal weiss es nicht.
    t.db.insert(buchungen).values([
      { id: "b-2", ts: new Date(), typ: "entnahme", artikelId: "art-1", chargeId: "ch-1",
        lagerortId: HANDLAGER_ID, menge: -8, quelleTyp: "system", quelleId: "seed",
        kommentar: null, referenz: null },
    ]).run();   // nur noch 2 im Handlager
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
    }, t.db);
    expect(r.ok && r.wert.nachfuellBestaetigt).toBe(5);
    expect(r.ok && r.wert.nachgefuellt).toBe(2);
    // Die zwei Zahlen sind hier VERSCHIEDEN — genau das ist die Zusage. Eine
    // Implementierung, die `nachfuellBestaetigt` aus dem gebuchten Wert
    // ableitet, bestuende die drei Nachbartests und diesen nicht.
    expect(r.ok && r.wert.nachgefuellt).not.toBe(r.ok && r.wert.nachfuellBestaetigt);
  });

  it("klemmt die Nachfuellmenge serverseitig auf max(0, Soll − Ist)", async () => {
    // Der Client klemmt schon (`max={luecke}`), aber die Nutzlast ist
    // Nutzereingabe. Ohne die Klemmung laegen hier 5 statt 0 im Fahrzeug —
    // das Handlager hat 10.
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 99 }],
    }, t.db);
    expect(r.ok && r.wert.nachgefuellt).toBe(0);
    expect(r.ok && r.wert.nachfuellBestaetigt).toBe(0);
    const imHandlager = t.db.select().from(buchungen).all()
      .filter((b) => b.lagerortId === HANDLAGER_ID)
      .reduce((s, b) => s + b.menge, 0);
    expect(imHandlager).toBe(10);
  });

  it("meldet `offen` = Soll − Ist − nachgefuellt", async () => {
    t.db.insert(buchungen).values([
      { id: "b-3", ts: new Date(), typ: "entnahme", artikelId: "art-1", chargeId: "ch-1",
        lagerortId: HANDLAGER_ID, menge: -9, quelleTyp: "system", quelleId: "seed",
        kommentar: null, referenz: null },
    ]).run();   // nur noch 1 im Handlager
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 1, nachfuellMenge: 4 }],
    }, t.db);
    // 5 − 1 − 1: bestaetigt sind 4, gebucht wird 1 (mehr liegt nicht da).
    // Aus `nachfuellBestaetigt` gerechnet stuende hier 0.
    expect(r.ok && r.wert.offen).toBe(3);
    expect(r.ok && r.wert.nachfuellBestaetigt).toBe(4);
    expect(r.ok && r.wert.nachgefuellt).toBe(1);
  });

  it("ignoriert Grabstein-Positionen (`entfernt`)", async () => {
    t.db.update(sollPositionen).set({ entfernt: true }).where(eq(sollPositionen.id, "sp-1")).run();
    await expect(checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 1, nachfuellMenge: 0 }],
    }, t.db)).rejects.toThrow("Soll-Position gehört nicht zu diesem Fahrzeug");
  });
});

describe("checkAbschluss — Geraete", () => {
  it("zaehlt ein FEHLENDES Geraet als auffaellig", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-1", vorhanden: false }],
    }, t.db);
    expect(r.ok && r.wert.geraeteAuffaellig).toBe(1);
  });

  it("zaehlt ein vorhandenes, aber DEFEKTES Geraet als auffaellig", async () => {
    // Der zweite Zweig des ODER. Ohne ihn bliebe der Test oben gruen.
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-1", vorhanden: true, zustand: "Defekt" }],
    }, t.db);
    expect(r.ok && r.wert.geraeteAuffaellig).toBe(1);
  });

  it("zaehlt ein vorhandenes Geraet in Ordnung NICHT", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-1", vorhanden: true, zustand: "In Ordnung" }],
    }, t.db);
    expect(r.ok && r.wert.geraeteAuffaellig).toBe(0);
  });

  it("weist einen unbekannten Zustandswert als Eingabefehler ab (z.enum, §5.8.2)", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      geraete: [{ geraetId: "g-1", vorhanden: true, zustand: "kaputt" }],
    }, t.db);
    expect(!r.ok && r.grund).toBe("eingabe");
  });
});

describe("checkAbschluss — Flaschen", () => {
  it("schreibt je Flasche eine append-only Messung mit dem CODE als Quelle", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-1", druckBar: 180 }],
    }, t.db);
    const m = t.db.select().from(o2Messungen).all();
    expect(m.length).toBe(1);
    expect(m[0].druckBar).toBe(180);
    expect(m[0].quelleTyp).toBe("token");
    // Der CODE aus der Token-Zeile, NICHT die Token-Kennung: das Journal zeigt
    // ihn als Klarnamen. `tokenId` waere hier "tk1".
    expect(m[0].quelleId).toBe("482-137");
    expect(m[0].quelleId).not.toBe("tk1");
  });

  it("zaehlt eine niedrige Flasche als auffaellig", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-1", druckBar: 20 }],
    }, t.db);
    expect(r.ok && r.wert.flaschenAuffaellig).toBe(1);
    expect(r.ok && r.wert.flaschenNichtBewertbar).toBe(0);
  });

  it("zaehlt eine volle Flasche NICHT als auffaellig", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-1", druckBar: 180 }],
    }, t.db);
    expect(r.ok && r.wert.flaschenAuffaellig).toBe(0);
  });

  it("eine Flasche OHNE Nennfuelldruck ist NICHT BEWERTBAR, nicht ‚niedrig' (§5.12, NEU)", async () => {
    // `fuellstandProzent` gibt bei nennfuelldruck <= 0 eine 0 zurueck
    // (o2.ts:28), und `o2Status` macht daraus ampel "rot", niedrig true. Die
    // Flasche erschiene als niedrig, obwohl sie schlicht nicht bewertbar ist —
    // und die Helferin liefe los, um eine VOLLE Flasche zu tauschen.
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-null", druckBar: 190 }],
    }, t.db);
    expect(r.ok && r.wert.flaschenNichtBewertbar).toBe(1);
    expect(r.ok && r.wert.flaschenAuffaellig).toBe(0);
  });

  it("schreibt die Messung TROTZDEM — sie ist Rohdatum und bleibt richtig", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-null", druckBar: 190 }],
    }, t.db);
    const m = t.db.select().from(o2Messungen).all();
    expect(m.length).toBe(1);
    expect(m[0].druckBar).toBe(190);
  });

  it("schreibt den Nennfuelldruck als Snapshot ins Ergebnis", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-1", druckBar: 180 }],
    }, t.db);
    const roh = JSON.parse(t.db.select().from(checks).all()[0].ergebnis!);
    expect(roh.flaschen[0].nennfuelldruckBar).toBe(200);
  });

  it("schreibt bei unbekanntem Nennfuelldruck `null` in den Snapshot — NIE die 0", async () => {
    // ⚠️ `CheckFlascheRoh` unterscheidet DREI Zustaende (`_lib/checkErgebnis.ts:58-65`):
    // eine Zahl = Snapshot, `undefined` = Snapshot fehlt (Altcheck), `null` =
    // ausdruecklich „unbekannt" — und `null` ist der Wert, den DIESE Datei „ab
    // jetzt schreibt".
    //
    // Eine geschriebene `0` ist dagegen eine ZAHL und passiert jeden
    // `?? `-Riegel: `_lib/lesepfade/checks.ts:174` prueft `nenn === null`, und
    // `o2Status(190, 0)` liefert 0 %, ampel „rot", `niedrig: true`. Das ist
    // GENAU die Falle, die der Live-Zweig oben (`flaschenNichtBewertbar`)
    // abfaengt — eine Ebene tiefer, im historischen Nachweis.
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, flaschen: [{ flascheId: "o-null", druckBar: 190 }],
    }, t.db);
    const roh = JSON.parse(t.db.select().from(checks).all()[0].ergebnis!);
    expect(roh.flaschen[0].nennfuelldruckBar).toBe(null);
    expect(roh.flaschen[0].nennfuelldruckBar).not.toBe(0);
    // Der Druck bleibt die gemessene Zahl — nur die BEZUGSGROESSE ist unbekannt.
    expect(roh.flaschen[0].druckBar).toBe(190);
  });
});

describe("checkAbschluss — Verfall", () => {
  it("setzt einen gemeldeten Verfall und zaehlt den GANZEN Fahrzeugstand, nicht nur die angefassten Artikel", async () => {
    // „Nach dem Schreiben zaehlen, damit die Rueckmeldung den GANZEN
    // Fahrzeugstand widerspiegelt — nicht nur die in diesem Check angefassten
    // Artikel." `art-2` steht seit VOR diesem Check auf abgelaufen und kommt in
    // der Nutzlast NICHT vor. Wer nur die gerade gesetzten Verfaelle zaehlt,
    // meldet hier 1 statt 2.
    t.db.insert(lagerortVerfall).values([
      { id: "lv-alt", lagerortId: "fz-1", artikelId: "art-2", verfall: "2019-05",
        erfasstAt: new Date(), quelleTyp: "system", quelleId: "seed" },
    ]).run();
    const r = await checkAbschluss({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0 }],
      geraete: [], flaschen: [],
      verfaelle: [{ artikelId: "art-1", verfall: "2020-01" }],
    }, t.db);
    expect(r.ok && r.wert.verfallAuffaellig).toBe(2);
    const roh = JSON.parse(t.db.select().from(checks).all()[0].ergebnis!);
    expect(roh.verfall.length).toBe(2);
  });

  it("`null` LOESCHT eine frueher gemeldete Angabe — die Zeile ist danach WEG", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: "2020-01" }],
    }, t.db);
    // Die erste Meldung ist ABGELAUFEN und damit sichtbar auffaellig — sonst
    // waere die Erwartung unten auch ohne jede Loeschung erfuellt.
    expect(t.db.select().from(lagerortVerfall).all().length).toBe(1);

    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: null }],
    }, t.db);
    expect(r.ok && r.wert.verfallAuffaellig).toBe(0);
    // Die Tabellenzusicherung diskriminiert unabhaengig von jeder Ampelschwelle.
    expect(t.db.select().from(lagerortVerfall).all().length).toBe(0);
  });

  it("ein FEHLENDER Eintrag laesst die Angabe unangetastet", async () => {
    await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: "2020-01" }],
    }, t.db);
    const r = await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(r.ok && r.wert.verfallAuffaellig).toBe(1);
    expect(t.db.select().from(lagerortVerfall).all().length).toBe(1);
  });

  it("weist ein Verfallsformat ausserhalb `YYYY-MM` ab — als Rueckgabewert, nicht als Wurf", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: "März 2027" }],
    }, t.db);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.grund).toBe("eingabe");
  });

  it("weist auch den laxen Monat `2027-00` ab (MONAT_REGEX, Entscheidung 6)", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer, verfaelle: [{ artikelId: "art-1", verfall: "2027-00" }],
    }, t.db);
    expect(!r.ok && r.grund).toBe("eingabe");
  });
});

describe("checkAbschluss — der Check-Eintrag", () => {
  it("schreibt genau EINEN Eintrag mit Quelle `token` und dem CODE", async () => {
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0 }],
    }, t.db);
    const rows = t.db.select().from(checks).all();
    expect(rows.length).toBe(1);
    expect(rows[0].fahrzeugId).toBe("fz-1");
    expect(rows[0].quelleTyp).toBe("token");
    expect(rows[0].quelleId).toBe("482-137");
    expect(r.ok && r.wert.checkId).toBe(rows[0].id);
  });

  it("klammert die Journalzeilen ueber `check:<id>` an den Eintrag", async () => {
    // Die EINZIGE Verbindung zwischen Journalzeile und ausloesendem Vorgang —
    // es gibt keinen Fremdschluessel (1:1-Pflicht 12).
    const r = await checkAbschluss({
      fahrzeugId: "fz-1", ...leer,
      positionen: [{ sollPositionId: "sp-1", ist: 0, nachfuellMenge: 5 }],
    }, t.db);
    const id = r.ok ? r.wert.checkId : "";
    const referenzen = t.db.select().from(buchungen).all()
      .filter((b) => b.referenz !== null).map((b) => b.referenz);
    expect(referenzen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(referenzen)).toEqual(new Set([`check:${id}`]));
  });

  it("das JSON traegt `version: 2` und alle fuenf Listen", async () => {
    // Der Diskriminator steht ab jetzt IM DATUM. `parseCheckErgebnis` (Teil 3,
    // T37) erkennt Alt-Objekte ohne `version` weiterhin; ein geschriebenes Feld
    // macht die Unterscheidung fuer alles NEUE explizit statt geraten.
    await checkAbschluss({
      fahrzeugId: "fz-1",
      positionen: [{ sollPositionId: "sp-1", ist: 5, nachfuellMenge: 0 }],
      geraete: [{ geraetId: "g-1", vorhanden: true, zustand: "In Ordnung" }],
      flaschen: [{ flascheId: "o-1", druckBar: 180 }],
      verfaelle: [{ artikelId: "art-1", verfall: "2027-03" }],
    }, t.db);
    const roh = JSON.parse(t.db.select().from(checks).all()[0].ergebnis!);
    expect(roh.version).toBe(2);
    for (const feld of ["positionen", "artikel", "geraete", "flaschen", "verfall"]) {
      expect(Array.isArray(roh[feld]), `${feld} fehlt`).toBe(true);
      expect(roh[feld].length, `${feld} ist leer`).toBe(1);
    }
    // Feldnamen sind NICHT umbenennbar (§4.10, 1:1-Pflicht 2) — sonst wird jede
    // historische Auswertung stumm 0.
    expect(roh.positionen[0].sollPositionId).toBe("sp-1");
    expect(roh.artikel[0].nachfuellGebucht).toBe(0);
    expect(roh.geraete[0].geraetId).toBe("g-1");
    expect(roh.flaschen[0].nennfuelldruckBar).toBe(200);
    expect(roh.verfall[0].artikelId).toBe("art-1");
  });
});

describe("checkAbschluss — revalidatePath, sechs INNERE Pfade (§7.9.5)", () => {
  it("genau diese sechs, in dieser Form", async () => {
    // Innen hier, aussen dort — und beide Sorten stehen in derselben Datei.
    // Alle 61 Aufrufe des Bestands uebergeben den AEUSSEREN Pfad; alle vier
    // Suite-Module den inneren (Falle 49). Ein falscher Pfad, der nichts tut,
    // wird beim naechsten Caching-Schritt zum stillen Defekt.
    await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(revalidiert).toEqual([
      "/m/lagerbuch/helfer/check",
      "/m/lagerbuch/verwaltung/checks",
      "/m/lagerbuch/verwaltung",
      "/m/lagerbuch/verwaltung/sauerstoff",
      "/m/lagerbuch/verwaltung/verfall",
      "/m/lagerbuch/verwaltung/fahrzeuge",
    ]);
  });

  it("kein einziger Pfad traegt die AEUSSERE Form", async () => {
    // Die Richtung, nicht die Existenz: `/lagerbuch/helfer/check` ist der
    // aeussere Pfad und trifft im Router dieser Suite nichts.
    await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(revalidiert.length).toBe(6);
    for (const p of revalidiert) {
      expect(p.startsWith("/m/lagerbuch/"), `aeusserer Pfad: ${p}`).toBe(true);
    }
  });

  it("revalidiert NICHT nach einem Riegel-Nein", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });
    await checkAbschluss({ fahrzeugId: "fz-1", ...leer }, t.db);
    expect(revalidiert).toEqual([]);
  });
});

describe("Bauform", () => {
  it("traegt \"use server\" und exportiert GENAU EINE Action", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/^"use server";/m);
    expect([...q.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]))
      .toEqual(["checkAbschluss"]);
  });

  it("wertet den Riegel-Rueckgabewert AUS", () => {
    // ⚠️ REDUNDANZ, NICHT TRAEGER. Der Traeger ist der Verhaltenstest
    // „antwortet bei gesperrtem Token … und schreibt NICHTS": faellt
    // `if (!riegel.ok) return`, laeuft der Code in `riegel.zugang.code` und der
    // Test wird rot. Dieser Scan haelt nur die Schreibweise fest.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/const riegel = await requireHelferSchreibend\(db\);/);
    expect(q).toMatch(/if \(!riegel\.ok\)\s*return/);
  });

  it("ruft `requireLagerbuchHost` NICHT — der Riegel ruft ihn intern", () => {
    // Ein zweiter Aufruf waere nicht falsch, aber er luede die naechste Action
    // dazu ein, sich AUF den doppelten Aufruf zu verlassen statt auf den
    // inneren — und dann faellt die Zusage „durch Konstruktion" (Teil 1, T10).
    //
    // ⚠️ Dieser Scan hat KEIN Verhaltensaequivalent: ein NICHT-Aufruf ist bei
    // gemocktem Riegel nicht beobachtbar. Er laeuft ueber `ohneKommentare()`,
    // weil die Begruendung in `check.ts` den Namen woertlich nennt (Befund 1).
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/requireLagerbuchHost/);
  });

  it("traegt den Ansatzpunkt-Kommentar fuer `scope_lagerort_id` (offene Frage 5)", () => {
    // ⚠️ ROHTEXT, mit Absicht — und als EINZIGER Scan dieser Datei. Die
    // Zeichenfolge steht ausschliesslich IM KOMMENTAR; ueber `ohneKommentare()`
    // waere dieser Test garantiert rot. Wer ihn „vereinheitlicht", loescht die
    // Zusicherung.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/scope_lagerort_id/);
  });
});
