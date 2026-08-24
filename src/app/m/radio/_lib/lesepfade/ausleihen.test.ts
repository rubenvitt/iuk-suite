// src/app/m/radio/_lib/lesepfade/ausleihen.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../../_db/schema";
import { loans } from "../../_db/schema";
import { ausleihenListe, AUSLEIHEN_SEITENGROESSE } from "./ausleihen";

/**
 * DER UMSCHLAG UM DIE LEIHHISTORIE (Planteil 4, Aufgabe V7).
 *
 * ⛔ ER BAUT KEINE ZWEITE ABFRAGE. NS-A1 (`.superpowers/sdd/planteil4/briefs/KOPF.md`):
 * „Planteil 4 ergaenzt `leihhistorie(db, f)` in DERSELBEN Datei — keine zweite." Der erste Fall
 * unten setzt das als Quelltext-Scan durch, nicht als Vorsatz: eine zweite Abfrage auf dieselbe
 * Tabelle waere typkorrekt, lint-sauber und wuerde beim ersten Abweichen der zwei Fassungen
 * still eine andere Liste zeigen.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`) — dieselbe Form und derselbe Grund wie
 * in `_lib/lesepfade/versionen.test.ts:52-63`.
 */
const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const QUELLE = "src/app/m/radio/_lib/lesepfade/ausleihen.ts";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-ausleihen-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Eine Leihzeile. ⚠️ `device_id` traegt KEINEN Fremdschluessel (`_db/schema.ts:213`) — die
 * Fixtures brauchen deshalb kein Geraet, und das ist Absicht des Schemas: aus `devices` wird
 * ausgemustert, die Historie bleibt.
 *
 * ⛔ ABER: `loans_device_active_uidx` ist ein PARTIELLER Unique-Index (von Hand in
 * `_db/migrations/0001_loans_aktiv_uidx.sql`, dem Drizzle-Schema unsichtbar) — je Geraet darf
 * hoechstens EINE Leihe offen sein. Fixtures mit mehreren Zeilen desselben Geraets buchen
 * deshalb alle bis auf eine als zurueckgegeben; Fixtures, die nur Zeilen zaehlen, geben jeder
 * Zeile ihr eigenes Geraet.
 */
function leihe(werte: Partial<typeof loans.$inferInsert> & { id: string }) {
  const jetzt = new Date("2026-07-01T08:00:00Z");
  return {
    deviceId: "g1",
    snapshotCallSign: "Florian 1",
    snapshotDeviceType: "HRT",
    borrowerName: "Anna Beispiel",
    borrowedAt: jetzt,
    returnedAt: null,
    returnNote: null,
    createdAt: jetzt,
    updatedAt: jetzt,
    ...werte,
  };
}

describe("ausleihenListe — der Umschlag um leihhistorie", () => {
  it("ausleihenListe ruft leihhistorie und baut keine eigene Abfrage", () => {
    /*
     * ⛔ NS-A1 ALS TEST, NICHT ALS VORSATZ. Der Scan liest den ROHEN Dateitext — Kommentare
     * eingeschlossen —, damit der Name der Tabelle auch nicht in der Prosa auftauchen kann und
     * ein „frueher fragten wir hier selbst"-Kommentar nicht zum Bauplan fuer den naechsten
     * Leser wird. Dieselbe Bauform wie die Prosa-Sperre in `_db/leihen.ts:57-64`.
     *
     * Drei Klauseln, und ⛔ ZWEI UND DREI FANGEN VERSCHIEDENE MUTATIONEN — gemessen, nicht
     * angenommen (Sonde S-V7d dieser Aufgabe, in beiden Fassungen gefahren):
     *   1. Die Datei NENNT `leihhistorie` — ohne das waere sie kein Umschlag.
     *   2. Der Name der Schematabelle steht hier NICHT, auch nicht in Prosa. Sie faengt die
     *      Fassung der Sonde OHNE Import: ohne Klausel 2 blieb der Fall gruen.
     *   3. Es gibt KEINEN Import aus dem Schema. Sie faengt die Fassung MIT Import — also die
     *      einzige, die ueberhaupt uebersetzt: ohne Klausel 2, aber mit Import, wurde der Fall
     *      ueber Klausel 3 rot.
     *
     * ⚠️ KLAUSEL 2 IST DAMIT AUCH EINE PROSA-SPERRE, und das ist Absicht — aber sie hat einen
     * Preis, den der naechste Leser kennen muss: eine BELEGZEILE, die den Namen enthaelt,
     * faerbt den Fall rot, obwohl nichts abgefragt wird. Der Alt-Routenpfad traegt ihn
     * (V16 zitiert ihn), und `radio-admin/client/src/features/…` ebenso. ⛔ Die Antwort ist
     * NICHT, die Klausel abzuschwaechen, sondern den Beleg als blossen Dateinamen zu zitieren
     * — `LoanList.tsx:8` statt des ganzen Pfades. Dieselbe Auflage und derselbe Umgang wie bei
     * der Prosa-Sperre in `_db/leihen.ts:57-64`.
     */
    const text = readFileSync(QUELLE, "utf8");
    expect(text.length, "leerer Dateitext — der Scan waere leer-gruen").toBeGreaterThan(200);
    expect(text, "der Umschlag muss die Datenfunktion nennen").toMatch(/\bleihhistorie\b/);
    expect(
      /\bloans\b/.test(text),
      "der Name der Schematabelle steht hier nicht — auch nicht in einer Belegzeile oder in " +
        "Prosa (NS-A1). Alt-Pfade mit diesem Namen als blossen Dateinamen zitieren, nicht mit " +
        "ganzem Pfad; die Klausel NICHT abschwaechen.",
    ).toBe(false);
    expect(
      /_db\/schema/.test(text),
      "kein Import aus dem Schema — die Zeilen kommen aus _db/leihen.ts",
    ).toBe(false);
  });

  it("ausleihenListe reicht Geraete-Id und Zeitfenster durch", () => {
    /*
     * ⛔ DER DURCHREICHFALL, UND ER IST VERHALTEN, KEIN SCAN. Die Alt-Flaeche schickt nur
     * `page`/`pageSize` (`radio-admin/client/src/hooks/useLoans.ts:18-23`); der Umschlag
     * reicht die drei uebrigen Filter trotzdem durch, weil die Datenfunktion sie ohnehin
     * fuehrt (E-V10) — ⬜ V-L11 ist mit der Betreiberentscheidung vom 2026-08-24 beantwortet
     * („Beides", `.superpowers/sdd/planteil4/progress.md`), das BEDIENELEMENT baut V16.
     *
     * Das Fixture trennt beide Achsen einzeln: eine Zeile faellt nur ueber das Geraet heraus,
     * eine nur ueber das Fenster nach oben, eine nur nach unten. Ein Umschlag, der einen der
     * drei Werte verschluckt, faellt an genau einer Zeile auf.
     */
    db.insert(loans)
      .values([
        leihe({ id: "l-treffer", deviceId: "g1", borrowedAt: new Date("2026-07-10T08:00:00Z") }),
        leihe({ id: "l-anderes", deviceId: "g2", borrowedAt: new Date("2026-07-10T08:00:00Z") }),
        leihe({
          id: "l-zu-frueh",
          deviceId: "g1",
          borrowedAt: new Date("2026-06-01T08:00:00Z"),
          returnedAt: new Date("2026-06-02T08:00:00Z"),
        }),
        leihe({
          id: "l-zu-spaet",
          deviceId: "g1",
          borrowedAt: new Date("2026-08-01T08:00:00Z"),
          returnedAt: new Date("2026-08-02T08:00:00Z"),
        }),
      ])
      .run();

    const seite = ausleihenListe(db, {
      geraeteId: "g1",
      von: new Date("2026-07-01T00:00:00Z"),
      bis: new Date("2026-07-31T23:59:59Z"),
    });

    expect(seite.zeilen.map((z) => z.entleiher)).toEqual(["Anna Beispiel"]);
    expect(seite.gesamt, "gesamt zaehlt die GEFILTERTE Menge").toBe(1);
  });

  it("die Seitengroesse ist zwanzig und kommt nicht aus einem Suchparameter", () => {
    /*
     * ⛔ 1:1-PFLICHT: die Alt-Flaeche blaettert mit 20 und hat KEINEN Groessenwechsler
     * (`LoanList.tsx:8` `PAGE_SIZE = 20`, `:66`
     * `showSizeChanger: false`). Die 25 aus `_db/leihen.ts` (`SEITENGROESSE_VORGABE`) ist die
     * Vorgabe des Servers fuer jeden Aufrufer, der KEINE schickt — die Verwaltungsflaeche
     * schickt eine, und das ist die 20.
     *
     * ⛔ DER FALL PRUEFT BEIDES: die Zahl im Umschlag UND dass die Zeilenmenge ihr folgt. Eine
     * Konstante allein waere eine Behauptung; 21 Zeilen im Fixture machen sie messbar.
     */
    db.insert(loans)
      .values(
        Array.from({ length: AUSLEIHEN_SEITENGROESSE + 1 }, (_, i) =>
          leihe({
            id: `l-${i}`,
            deviceId: `g-${i}`,
            borrowedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)),
          }),
        ),
      )
      .run();

    const seite = ausleihenListe(db, {});
    expect(AUSLEIHEN_SEITENGROESSE).toBe(20);
    expect(seite.seitenGroesse, "der Umschlag meldet die benutzte Groesse").toBe(20);
    expect(seite.zeilen.length, "und die Abfrage hat sie auch benutzt").toBe(20);
    expect(seite.gesamt, "gesamt zaehlt die ganze gefilterte Menge, nicht die Seite").toBe(21);
  });

  it("die Seitenzahl kommt als Zeichenkette aus dem Suchparameter und wird gefaltet", () => {
    /*
     * ⛔ DIE FALTUNG GEHOERT HIERHER, UND DAS STEHT WOERTLICH IM BESTAND: `_db/leihen.ts`
     * (Kopf von `LeihhistorieFilter`) nennt „den Lesepfad aus Aufgabe V7" als die Stelle, an
     * der aus dem Suchparameter eine Zahl wird.
     *
     * ⚠️ WAS EIN UNBRAUCHBARER WERT TUT, IST GEMESSEN UND NICHT VERMUTET (Sonde zu V1,
     * `BERICHT-V1.md`): ein `NaN`-Deckel wurde als NULL gebunden, und SQLite liest `LIMIT NULL`
     * als KEINE GRENZE — die Antwort trug ALLE Zeilen in einer Seite. Der Fall unten haelt
     * fest, dass diese Kette hier nicht wieder entsteht.
     */
    db.insert(loans)
      .values(
        Array.from({ length: AUSLEIHEN_SEITENGROESSE + 3 }, (_, i) =>
          leihe({
            id: `l-${i}`,
            deviceId: `g-${i}`,
            borrowedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)),
          }),
        ),
      )
      .run();

    // Die zweite Seite traegt den Rest — 23 Zeilen, 20 pro Seite.
    const zweite = ausleihenListe(db, { seite: "2" });
    expect(zweite.seite).toBe(2);
    expect(zweite.zeilen.length).toBe(3);

    // Unbrauchbar, leer und fehlend fallen alle drei auf die erste Seite — mit ihrer Grenze.
    for (const wert of ["zwei", "", undefined]) {
      const seite = ausleihenListe(db, { seite: wert });
      expect(seite.seite, `Seitenzahl aus ${JSON.stringify(wert)}`).toBe(1);
      expect(seite.zeilen.length, `Grenze bei ${JSON.stringify(wert)}`).toBe(20);
    }
  });
});
