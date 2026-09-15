import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, newId } from "../../_db/schema";
import { journalEintraege, type JournalErgebnis } from "./journal";
import { JOURNAL_GRENZE } from "../grenzen";
import { HANDLAGER_ID } from "../konstanten";

const T = (iso: string) => new Date(iso);
let t: TestDb;

function buche(p: { ts: Date; typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
                    menge?: number; kommentar?: string | null; referenz?: string | null;
                    artikelId?: string; id?: string }) {
  t.db.insert(buchungen).values({
    id: p.id ?? newId(), ts: p.ts, typ: p.typ ?? "zugang",
    artikelId: p.artikelId ?? "a1", chargeId: "c1", lagerortId: HANDLAGER_ID,
    menge: p.menge ?? 1, quelleTyp: "system", quelleId: "system",
    referenz: p.referenz ?? null, kommentar: p.kommentar ?? null,
  }).run();
}

/**
 * ⏱ EIN COMMIT STATT N — der Grund steht ausfuehrlich am Kopf von
 * `lesepfade/bz.test.ts`. Kurz: `migrierteTestDb` liefert eine Datei-SQLite ohne
 * WAL, jedes `.run()` ausserhalb einer Transaktion ist ein eigener Commit mit
 * fsync. Gemessen (PR #80, Lauf 33090214227): diese Datei lokal 306 ms, in der
 * CI 10 658 ms — Faktor 35, waehrend die ganze Suite nur Faktor 4 hat. Die drei
 * Schleifen unten legen 100, 101 und 121 Zeilen an; ohne diese Klammer waeren
 * das ebenso viele Commits, und die CI kam damit auf ueber 50 ms je Stueck.
 *
 * `buche` schreibt bewusst weiter ueber `t.db`: better-sqlite3 haelt EINE
 * Verbindung, das `BEGIN` dieser Transaktion umfasst sie also mit.
 */
function inEinemCommit(fn: () => void) {
  t.db.transaction(fn);
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-journal-");
  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01",
      createdAt: T("2026-01-01T00:00:00Z") }).run();
});
afterEach(() => t.schliessen());

describe("journalEintraege — der Deckel ist BEOBACHTBAR (§5.14.3)", () => {
  it("GRENZE Zeilen -> mehrVorhanden false", () => {
    inEinemCommit(() => {
      for (let i = 0; i < JOURNAL_GRENZE; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    });
    const e = journalEintraege(t.db);
    expect(e.zeilen).toHaveLength(JOURNAL_GRENZE);
    expect(e.mehrVorhanden).toBe(false);
  });

  it("GRENZE + 1 Zeilen -> mehrVorhanden true, geliefert werden GRENZE", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3): `GRENZE + 1` auf `GRENZE`
     * zuruecksetzen. Heute schreibt `journal/page.tsx:32` „Zeigt die neuesten 100
     * Treffer" UNBEDINGT — auch wenn drei Zeilen zurueckkommen —, und es gibt im
     * gesamten Modul KEINEN Weg herauszufinden, ob eine Grenze zugeschlagen hat.
     */
    inEinemCommit(() => {
      for (let i = 0; i < JOURNAL_GRENZE + 1; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    });
    const e = journalEintraege(t.db);
    expect(e.zeilen).toHaveLength(JOURNAL_GRENZE);
    expect(e.mehrVorhanden).toBe(true);
  });

  it("respektiert eine kleinere Grenze aus dem Filter", () => {
    for (let i = 0; i < 5; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db, { grenze: 3 }).zeilen).toHaveLength(3);
    expect(journalEintraege(t.db, { grenze: 3 }).mehrVorhanden).toBe(true);
  });
});

describe("journalEintraege — die Sortierung ist TOTAL (§5.14.4)", () => {
  it("sortiert ts absteigend und bei Gleichstand id absteigend", () => {
    /**
     * `buchungen.ts` speichert UNIX-SEKUNDEN. Ein Check-Abschluss schreibt
     * Abgleich, Umlagerung und Messungen in einem Rutsch — ALLE teilen denselben
     * Sekundenwert. Ohne Tiebreaker entscheidet die Datenbank, welche Zeile oben
     * steht, und eine zweite identische Anfrage kann eine andere Reihenfolge
     * liefern.
     */
    // EINFUEGEREIHENFOLGE ABSICHTLICH NICHT ALPHABETISCH (T30-Lehre): faelt die
    // Einfuegereihenfolge mit der id-absteigenden Sollreihenfolge zusammen, besteht
    // auch eine Implementierung OHNE echten id-Tiebreaker den Test — SQLite bedient
    // ein blosses `ORDER BY ts DESC` ueber `idx_buchungen_ts` und bricht Gleichstand
    // dabei intern nach ROWID (= Einfuegereihenfolge) auf, nicht nach `id`.
    const gleich = T("2026-06-01T10:00:00Z");
    buche({ ts: gleich, id: "id-ccc" });
    buche({ ts: gleich, id: "id-aaa" });
    buche({ ts: gleich, id: "id-bbb" });
    expect(journalEintraege(t.db).zeilen.map((z) => z.id))
      .toEqual(["id-ccc", "id-bbb", "id-aaa"]);
  });

  it("liefert dieselbe Reihenfolge unabhaengig von der Einfuegereihenfolge", () => {
    /**
     * Der urspruengliche Vergleich zweier IDENTISCHER Anfragen gegen DIESELBE
     * Datenbank hat kein unabhaengiges Soll: SQLite liefert dieselbe Abfrage
     * gegen unveraenderte Daten deterministisch auch OHNE Tiebreaker — der
     * Test kann unter keiner Mutation rot werden (Review-Fund Runde 1).
     *
     * Die echte Zusage ist staerker: die AUSLESEreihenfolge haengt nur an den
     * WERTEN (ts, id), nicht an der physischen EINFUEGEreihenfolge. Zwei
     * getrennte Datenbanken mit denselben fuenf Zeilen in ENTGEGENGESETZTER
     * Einfuegereihenfolge muessen dieselbe Reihenfolge liefern. Ohne
     * `id`-Tiebreaker faellt die Ausgabe auf die interne ROWID zurueck (=
     * Einfuegereihenfolge, siehe Test oben) — dann liefern die zwei
     * Datenbanken hier GENAU ENTGEGENGESETZTE Reihenfolgen, und der Vergleich
     * schlaegt fehl.
     */
    const gleich = T("2026-06-01T10:00:00Z");
    const ids = ["a", "b", "c", "d", "e"];

    for (const id of ids) buche({ ts: gleich, id: `id-${id}` });
    const ersteReihenfolge = journalEintraege(t.db).zeilen.map((z) => z.id);

    const t2 = migrierteTestDb("lagerbuch-lp-journal-2-");
    try {
      t2.db.insert(artikel).values({
        id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
        mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z"),
      }).run();
      t2.db.insert(chargen).values({
        id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01",
        createdAt: T("2026-01-01T00:00:00Z"),
      }).run();
      for (const id of [...ids].reverse()) {
        t2.db.insert(buchungen).values({
          id: `id-${id}`, ts: gleich, typ: "zugang", artikelId: "a1", chargeId: "c1",
          lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "system",
          referenz: null, kommentar: null,
        }).run();
      }
      const zweiteReihenfolge = journalEintraege(t2.db).zeilen.map((z) => z.id);
      expect(zweiteReihenfolge).toEqual(ersteReihenfolge);
    } finally {
      t2.schliessen();
    }
  });

  it("reicht `referenz` durch — sie ist die EINZIGE kausale Klammer", () => {
    // Der Tiebreaker liefert eine TOTALE Ordnung, keine KAUSALE: `buchungen.id`
    // ist ein nanoid() und nicht zeitlich geordnet. Wer die tatsaechliche
    // Reihenfolge braucht, liest `referenz` und `typ`.
    buche({ ts: T("2026-06-01T10:00:00Z"), referenz: "check:abc" });
    expect(journalEintraege(t.db).zeilen[0].referenz).toBe("check:abc");
  });
});

describe("journalEintraege — die Filter greifen VOR dem Limit", () => {
  it("filtert nach Vorgangsart", () => {
    buche({ ts: T("2026-06-01T10:00:00Z"), typ: "zugang" });
    buche({ ts: T("2026-06-01T11:00:00Z"), typ: "entnahme", menge: -1 });
    expect(journalEintraege(t.db, { vorgang: "entnahme" }).zeilen).toHaveLength(1);
  });

  it("filtert INKLUSIV nach von/bis und liefert die NEUESTEN zuerst", () => {
    // Einfuegereihenfolge ist AUFSTEIGEND nach ts (frueh -> spaet) — die Soll-
    // Reihenfolge der Ausgabe ist ABSTEIGEND. Beides faellt damit NICHT zufaellig
    // zusammen: ein `asc(buchungen.ts)` statt `desc(buchungen.ts)` liefert
    // weiterhin alle drei Zeilen (die Zeitspanne bleibt gleich), aber in der
    // FALSCHEN Reihenfolge — genau die Klasse, die eine reine `toHaveLength`-
    // Zusicherung nicht faengt (§5.14.3: „die NEUESTEN Treffer").
    buche({ ts: T("2026-06-01T00:00:00Z"), id: "id-frueh" });
    buche({ ts: T("2026-06-15T12:00:00Z"), id: "id-mitte" });
    buche({ ts: T("2026-06-30T23:59:59Z"), id: "id-spaet" });
    const e = journalEintraege(t.db, {
      von: T("2026-06-01T00:00:00Z"), bis: T("2026-06-30T23:59:59Z"),
    });
    expect(e.zeilen).toHaveLength(3);
    expect(e.zeilen.map((z) => z.id)).toEqual(["id-spaet", "id-mitte", "id-frueh"]);
  });

  it("sucht ueber die GANZE Historie, nicht nur im Limit-Fenster", () => {
    // `queries.ts:82-85`: die WHERE-Bedingungen greifen VOR dem LIMIT. Sonst
    // durchsuchte die Suche nur die neuesten 100 Zeilen — und faende bei einem
    // wachsenden Journal immer weniger.
    inEinemCommit(() => {
      for (let i = 0; i < JOURNAL_GRENZE + 20; i++) {
        buche({ ts: new Date(T("2026-06-01T10:00:00Z").getTime() + i * 60_000) });
      }
      buche({ ts: T("2020-01-01T00:00:00Z"), kommentar: "uraltnadel" });
    });
    const e = journalEintraege(t.db, { q: "uraltnadel" });
    expect(e.zeilen).toHaveLength(1);
    expect(e.mehrVorhanden).toBe(false);
  });
});

describe("journalEintraege — die aufgeloeste Quelle und der Artikelname", () => {
  it("nennt den Artikelnamen", () => {
    buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db).zeilen[0].artikelName).toBe("Verbandpäckchen");
  });
  it("faellt bei unbekanntem Artikel auf '–' zurueck", () => {
    // Im echten Betrieb ist eine verwaiste Zeile durch den FK auf `artikel.id`
    // ausgeschlossen (kein Loeschpfad existiert in Teil 3) — der Fallback bleibt
    // trotzdem Vertrag (`namen.get(...) ?? "–"`), und ohne die FK-Pruefung kurz
    // abzuschalten ist er in einer migrierten Test-DB nicht erzeugbar.
    t.sqlite.pragma("foreign_keys = OFF");
    buche({ ts: T("2026-06-01T10:00:00Z"), artikelId: "unbekannt" });
    t.sqlite.pragma("foreign_keys = ON");
    expect(journalEintraege(t.db).zeilen[0].artikelName).toBe("–");
  });
  it("loest quelleTyp 'system' auf 'System' auf", () => {
    buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db).zeilen[0].quelleName).toBe("System");
  });
});

/**
 * DIE SCHLUESSELPOSITION (DRK-331).
 *
 * ⚠️ WAS DIESE FAELLE BESITZEN, ist nicht „Blaettern geht", sondern die zwei
 * Eigenschaften, die ein OFFSET nicht haette: Stabilitaet gegen nebenher
 * geschriebene Zeilen, und Vollstaendigkeit bei mehreren Buchungen in
 * DERSELBEN Sekunde. Das Journal ist append-only — beides ist hier der
 * Normalfall, nicht der Grenzfall.
 */
describe("journalEintraege — Nachladen ueber die Schluesselposition", () => {
  it("liefert hinter dem Cursor weiter und wiederholt keine Zeile", () => {
    for (let i = 0; i < 5; i += 1) {
      buche({ ts: T(`2026-08-0${i + 1}T10:00:00Z`), id: `id-${i}` });
    }

    const seite1 = journalEintraege(t.db, { grenze: 2 });
    expect(seite1.zeilen.map((z) => z.id)).toEqual(["id-4", "id-3"]);
    expect(seite1.naechsterCursor).not.toBeNull();

    const seite2 = journalEintraege(t.db, { grenze: 2, cursor: seite1.naechsterCursor! });
    expect(seite2.zeilen.map((z) => z.id)).toEqual(["id-2", "id-1"]);

    const seite3 = journalEintraege(t.db, { grenze: 2, cursor: seite2.naechsterCursor! });
    expect(seite3.zeilen.map((z) => z.id)).toEqual(["id-0"]);
    // Auf der letzten Seite gibt es keinen Cursor mehr — sonst faehre der
    // Aufrufer noch einen leeren Abruf.
    expect(seite3.naechsterCursor).toBeNull();
    expect(seite3.mehrVorhanden).toBe(false);
  });

  it("kommt ueber mehrere Buchungen in DERSELBEN Sekunde hinweg", () => {
    /**
     * ⚠️ DER FALL, DER EINE NAIVE FASSUNG HAENGEN LIESSE. Ein Check-Abschluss
     * schreibt mehrere Zeilen mit demselben `ts` (§5.14.4). Ein Cursor, der nur
     * `ts < cursor.ts` prueft, uebersprintt die uebrigen Zeilen derselben
     * Sekunde; einer mit `ts <= cursor.ts` liefert ewig dieselbe Zeile. Erst das
     * PAAR `(ts, id)` traegt.
     */
    const gleich = T("2026-08-07T10:00:00Z");
    for (const id of ["aaa", "bbb", "ccc", "ddd"]) buche({ ts: gleich, id });

    const gesehen: string[] = [];
    let cursor: { ts: Date; id: string } | null = null;
    for (let runde = 0; runde < 10; runde += 1) {
      const seite: JournalErgebnis = journalEintraege(
        t.db,
        { grenze: 2, cursor: cursor ?? undefined },
      );
      gesehen.push(...seite.zeilen.map((z) => z.id));
      cursor = seite.naechsterCursor;
      if (!cursor) break;
    }

    // Jede Zeile genau einmal, keine Endlosschleife.
    expect(gesehen.sort()).toEqual(["aaa", "bbb", "ccc", "ddd"]);
  });

  it("behaelt den Filter ueber die Seiten hinweg", () => {
    buche({ ts: T("2026-08-01T10:00:00Z"), id: "e1", typ: "entnahme" });
    buche({ ts: T("2026-08-02T10:00:00Z"), id: "z1", typ: "zugang" });
    buche({ ts: T("2026-08-03T10:00:00Z"), id: "e2", typ: "entnahme" });
    buche({ ts: T("2026-08-04T10:00:00Z"), id: "e3", typ: "entnahme" });

    const seite1 = journalEintraege(t.db, { grenze: 2, vorgang: "entnahme" });
    expect(seite1.zeilen.map((z) => z.id)).toEqual(["e3", "e2"]);

    const seite2 = journalEintraege(t.db, {
      grenze: 2, vorgang: "entnahme", cursor: seite1.naechsterCursor!,
    });
    // Der Zugang dazwischen taucht NICHT auf: der Filter greift auf jeder Seite.
    expect(seite2.zeilen.map((z) => z.id)).toEqual(["e1"]);
  });
});

/**
 * DIE VORGANGSART IM FILTER (DRK-344).
 *
 * Gefiltert wird nach dem, was in der Spalte STEHT: „Korrektur" meint die
 * Korrektur OHNE verfeinerndes Praefix, „Aussonderung" die mit `aussondern:`.
 * Waere es anders, zeigte die Tabelle unter einem Filter Zeilen mit einer
 * anderen Beschriftung als der gewaehlten.
 */
describe("journalEintraege — der Filter kennt die Vorgangsart", () => {
  function vierKorrekturen() {
    buche({ ts: T("2026-07-01T10:00:00Z"), id: "k-frei", typ: "korrektur", referenz: null });
    buche({ ts: T("2026-07-01T11:00:00Z"), id: "k-aus", typ: "korrektur",
            referenz: "aussondern:handlager" });
    buche({ ts: T("2026-07-01T12:00:00Z"), id: "k-inv", typ: "korrektur",
            referenz: "inventur:iv-1" });
    buche({ ts: T("2026-07-01T13:00:00Z"), id: "k-check", typ: "korrektur",
            referenz: "check:c-1" });
  }

  it("`aussondern` trifft genau die Zeilen mit dem Praefix", () => {
    vierKorrekturen();
    expect(journalEintraege(t.db, { vorgang: "aussondern" }).zeilen.map((z) => z.id))
      .toEqual(["k-aus"]);
  });

  it("`inventur` trifft genau die Zeilen mit dem Praefix", () => {
    vierKorrekturen();
    expect(journalEintraege(t.db, { vorgang: "inventur" }).zeilen.map((z) => z.id))
      .toEqual(["k-inv"]);
  });

  it("`korrektur` laesst die verfeinerten Arten WEG, behaelt aber `check:` und die referenzlose", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT: den `IS NULL`-Zweig aus
     * `vorgangBedingung` streichen. `referenz NOT LIKE '…'` ist fuer
     * `referenz IS NULL` NICHT wahr, sondern NULL — und NULL ist in einem WHERE
     * falsch. Ohne ihn verschwaende ausgerechnet die haeufigste Zeile
     * ("k-frei"), und zwar STILL: die Tabelle zeigte nur weniger.
     *
     * `check:` bleibt drin, weil es KEINEN eigenen Vorgangstext bekommt — die
     * Zeile steht in der Spalte als „Korrektur" und muss deshalb unter
     * „Korrektur" auffindbar sein (Entscheidungstabelle in `_lib/vorgang.ts`).
     */
    vierKorrekturen();
    expect(journalEintraege(t.db, { vorgang: "korrektur" }).zeilen.map((z) => z.id).sort())
      .toEqual(["k-check", "k-frei"]);
  });

  it("ein Praefix schlaegt den Typ auch quer: `aussondern` sucht NICHT nach `korrektur`", () => {
    // Die Bedingung haengt allein am Praefix. Traegt eine Zeile es unter einem
    // anderen Typ, gehoert sie trotzdem dorthin — sonst waere die Trefferliste
    // eine andere als die Spaltenbeschriftung.
    buche({ ts: T("2026-07-02T10:00:00Z"), id: "u-aus", typ: "umlagerung",
            referenz: "aussondern:fz-1" });
    expect(journalEintraege(t.db, { vorgang: "aussondern" }).zeilen.map((z) => z.id))
      .toEqual(["u-aus"]);
  });

  it("`umlagerung` behaelt `entnahme-ziel:` und `check:` — beide heissen weiter Umlagerung", () => {
    buche({ ts: T("2026-07-03T10:00:00Z"), id: "u-ziel", typ: "umlagerung",
            referenz: "entnahme-ziel:fz-1" });
    buche({ ts: T("2026-07-03T11:00:00Z"), id: "u-check", typ: "umlagerung",
            referenz: "check:c-1" });
    expect(journalEintraege(t.db, { vorgang: "umlagerung" }).zeilen.map((z) => z.id).sort())
      .toEqual(["u-check", "u-ziel"]);
  });

  it("die Vorgangsart greift VOR dem Limit und ueber die ganze Historie", () => {
    inEinemCommit(() => {
      for (let i = 0; i < JOURNAL_GRENZE; i++) {
        buche({ ts: T("2026-07-04T10:00:00Z"), typ: "zugang" });
      }
    });
    // Die Aussonderung ist die AELTESTE Zeile und faellt damit aus dem
    // 100er-Fenster — der Filter muss sie trotzdem finden.
    buche({ ts: T("2026-01-01T10:00:00Z"), id: "alt-aus", typ: "korrektur",
            referenz: "aussondern:handlager" });
    expect(journalEintraege(t.db, { vorgang: "aussondern" }).zeilen.map((z) => z.id))
      .toEqual(["alt-aus"]);
  });

  it("ohne Vorgangsart bleibt alles stehen", () => {
    vierKorrekturen();
    expect(journalEintraege(t.db, {}).zeilen).toHaveLength(4);
  });
});
