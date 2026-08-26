// src/app/m/radio/_lib/lesepfade/codes.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../../_db/schema";
import { users, zugangscodes } from "../../_db/schema";
import { codesListe } from "./codes";

/**
 * DER LESEPFAD DER ZUGANGSVERWALTUNG (Planteil 4, Aufgabe V20).
 *
 * ⛔ ER ERSETZT NICHTS — UND DAS IST GEMESSEN, NICHT ANGENOMMEN. Der Alt-Bestand kennt die
 * Zugangscodes gar nicht: `ls radio-admin/client/src/features` liefert
 * `dashboard devices import loans settings update`, und
 * `/usr/bin/grep -ril "zugangscode\|accessCode" radio-admin/{client,server}/src` liefert
 * NICHTS (beides am 2026-08-26 gefahren). Die Tabelle `zugangscodes` ist eine Neuerung von
 * Spec 1 Kapitel 3 (`Spec:2160-2250`), und §5.6.1s Insel-Tabelle traegt fuer Insel 8 in der
 * Spalte „erbt von" woertlich „Kapitel 3" statt einer Alt-Datei
 * (`.superpowers/sdd/planteil4/E1-spec-kapitel5.md:434`). ⛔ ES GIBT HIER ALSO KEINE
 * 1:1-VORLAGE ZUM NACHPRUEFEN; diese Datei prueft gegen das DATENMODELL
 * (`_db/schema.ts:147-192`) und gegen die Zusagen des Auftragsbriefs.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`): dessen Cache ist per
 * MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`) — ein Test, der
 * ihn benutzt, bekaeme die Datenbank des vorigen Tests. Vorbild ist
 * `src/app/m/radio/_db/migrations.test.ts:29-37` und, eine Aufgabe zurueck,
 * `_lib/lesepfade/versionen.test.ts:19-27`.
 *
 * ⚠️ EINE FRISCHE DATENBANK JE FALL (`beforeEach`, nicht `beforeAll`): `zugangscodes.code`
 * traegt einen UNIQUE-Index (`_db/schema.ts:170`), und die Faelle unten setzen ihren eigenen
 * Bestand — geteilte Zeilen liessen sie einander bedingen.
 *
 * ⚠️ ZEIT IST EIN `Date`, KEINE ZAHL. `created_at`, `gesperrt_am` und `last_used_at` stehen
 * als `integer(..., { mode: "timestamp" })` im Schema (`_db/schema.ts:186`, `:188`, `:191`);
 * Drizzle rechnet die Sekundengrenze selbst, und in dieser Datei taucht keine rohe
 * Epochenzahl auf.
 */
const MIGRATIONEN = "src/app/m/radio/_db/migrations";

/**
 * Die drei Zeitpunkte dieser Datei, jeder mit seinem erwarteten Text in der festgenagelten
 * Zone (`_lib/anzeige.ts:62`, `Europe/Berlin`, dort im Juni UTC+2). Dieselbe Form und
 * dieselbe Begruendung wie in `_lib/lesepfade/versionen.test.ts:41-45`.
 */
const ANGELEGT_AM = new Date("2026-06-14T07:12:00Z");
const BENUTZT_AM = new Date("2026-06-20T16:45:00Z");
const BENUTZT_TEXT = "20.06.2026, 18:45";
const GESPERRT_AM = new Date("2026-06-22T05:00:00Z");
const GESPERRT_TEXT = "22.06.2026, 07:00";

/**
 * ⛔ WOERTLICH DERSELBE SATZ, DEN `_lib/lesepfade/codes.ts` FUEHRT — hier ausgeschrieben und
 * NICHT importiert. Ein Import waere tautologisch: der Fall pruefte dann nur, dass eine
 * Konstante gleich sich selbst ist. Dieselbe Hausform und derselbe Grund wie bei den
 * ausgeschriebenen Texten in `admin/(arbeit)/versionen/VersionenTabelle.test.tsx:611-620`.
 */
const NIE_EINGELOEST = "nie eingelöst";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-codes-"));
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
 * Eine Zugangszeile; alles ausser `id` und `code` hat eine Vorgabe, die der Fall
 * ueberschreibt. ⛔ `createdBy` ist `.notNull()` (`_db/schema.ts:189`) und traegt deshalb
 * einen Wert, auch wo der Fall ihn nicht misst.
 */
function code(werte: Partial<typeof zugangscodes.$inferInsert> & { id: string; code: string }) {
  return {
    bezeichnung: "Aufsteller Funkraum",
    aktiv: true,
    createdAt: ANGELEGT_AM,
    createdBy: "sub-anna",
    ...werte,
  };
}

describe("codesListe — die Zeilen der Zugangsverwaltung", () => {
  it("sortiert nach createdAt absteigend, Gleichstaende ueber die Id", () => {
    /*
     * ⛔ DIE SORTIERUNG IST EINE BENANNTE WAHL DIESER AUFGABE UND KEIN PORT — es gibt keine
     * Alt-Liste zum Abschreiben (siehe Dateikopf). Der Brief nennt sie nicht
     * (`.superpowers/sdd/planteil4/briefs/V20.md:26-36`); ⛔ OHNE `orderBy` antwortete SQLite
     * in rowid-Ordnung, und dieser Fall maesse nichts, sobald sie zufaellig mit der Erwartung
     * zusammenfiele.
     *
     * ⛔ DIE EINFUEGEREIHENFOLGE IST ABSICHTLICH EINE DRITTE, aus genau diesem Grund
     * (dieselbe Form wie `_lib/lesepfade/versionen.test.ts:112-115`).
     *
     * ⛔ **UND DAS GLEICHSTANDSPAAR STEHT VERKEHRT HERUM IN DER DATENBANK — DAS IST EINE
     * KORREKTUR AUS DER SONDE, KEIN DETAIL** (Sonde **S-V20-L3**, 2026-08-26). Die erste
     * Fassung fuegte `zc-a` VOR `zc-c` ein; ohne `asc(id)` antwortet SQLite in rowid-Ordnung,
     * und die faellt dann mit der Erwartung zusammen: `asc(zugangscodes.id)` ersatzlos
     * entfernt ergab `Tests 10 passed`, ⛔ NULL ROT. Der Gleichstandsbrecher war behauptet und
     * unbewacht. Jetzt steht `zc-c` VOR `zc-a`, damit rowid-Ordnung und Id-Ordnung einander
     * WIDERSPRECHEN.
     *
     * ⛔ UND DER GLEICHSTAND IST HERGESTELLT, NICHT DER NORMALFALL: `created_at` ist ein
     * Sekundenstempel (`_db/schema.ts:188`), zwei in derselben Sekunde ausgestellte Zugaenge
     * sind also moeglich. Ohne den zweiten Schluessel antwortete derselbe Bestand je nach
     * Speicherlage verschieden — der Gleichstandsbrecher kauft Determinismus, ⛔ NICHT
     * Richtigkeit (dieselbe Unterscheidung wie im Kopf von `zielVersion`,
     * `_lib/lesepfade/versionen.ts`).
     */
    db.insert(zugangscodes)
      .values([
        code({ id: "zc-b", code: "CODE-B", createdAt: new Date("2026-03-01T10:00:00Z") }),
        code({ id: "zc-c", code: "CODE-C", createdAt: new Date("2026-05-01T10:00:00Z") }),
        code({ id: "zc-a", code: "CODE-A", createdAt: new Date("2026-05-01T10:00:00Z") }),
      ])
      .run();

    expect(codesListe(db).map((z) => z.id)).toEqual([
      "zc-a", // 01.05., Gleichstand mit zc-c, kleinere Id zuerst
      "zc-c",
      "zc-b", // 01.03., aelter
    ]);
  });

  it("der Klartext-Code steht in der Zeile — er ist ein Dauerausweis, kein Einmalgeheimnis", () => {
    /*
     * ⛔ `Spec:2180-2182` woertlich: der erzeugte Code „wird EINMAL zurueckgegeben und danach
     * in der Verwaltungsliste im Klartext angezeigt und gedruckt — er ist kein
     * Einmalgeheimnis, sondern ein Dauerausweis".
     *
     * ⛔ UND GENAU DAS IST DER GRUND FUER DIE ADMIN-STUFE DER SEITE, nicht ihre Kuer:
     * `Spec:2251-2253` („die Codeliste IST das Geheimnis"). Der Vorabscan hat den groessten
     * Traeger benannt (Fund **F23**, `.superpowers/sdd/planteil4/VORABSCAN.md:542-556`): die
     * Zeile ueberquert die RSC-Grenze und steht im ausgelieferten Payload jeder
     * `/admin/zugaenge`-Antwort. Waere diese Zeile ohne den Klartext, waere das Druckblatt aus
     * V21 nicht baubar.
     */
    db.insert(zugangscodes)
      .values([code({ id: "zc-1", code: "A3F7-K92M-QRTV", bezeichnung: "Aufsteller Halle" })])
      .run();

    const [zeile] = codesListe(db);
    expect(zeile?.code).toBe("A3F7-K92M-QRTV");
    expect(zeile?.bezeichnung).toBe("Aufsteller Halle");
  });

  it("lastUsedAt NULL wird zu einem Text, nicht zu einer leeren Zelle", () => {
    /*
     * ⛔ `_db/schema.ts:190-191`: „NULL = 'nie eingeloest'. REINE ANZEIGE, ohne Einfluss auf
     * Gueltigkeit." ⛔ DIE ZWEITE HAELFTE STEHT IM FALL DARUNTER: der Zugang ist AKTIV,
     * obwohl er nie eingeloest wurde. Eine leere Zelle liesse offen, ob der Wert fehlt oder
     * ob die Spalte nicht gelesen wird.
     */
    db.insert(zugangscodes)
      .values([code({ id: "zc-1", code: "CODE-1", lastUsedAt: null })])
      .run();

    const [zeile] = codesListe(db);
    expect(zeile?.zuletztText).toBe(NIE_EINGELOEST);
    expect(zeile?.aktiv, "ein nie eingeloester Zugang ist trotzdem gueltig").toBe(true);
  });

  it("ein eingeloester Zugang traegt seinen Zeitpunkt vorformatiert", () => {
    /*
     * ⛔ VORFORMATIERT UND KEIN `Date` (Bauform-Zulaessigkeitstafel Nr. 7,
     * `.superpowers/sdd/planteil4/briefs/KOPF.md:320`; `Spec:4536-4539`): die Zeile geht als
     * Prop an Insel 8. Formatiert wird mit `datumMitUhrzeit` (`_lib/anzeige.ts:87`) in der
     * dort festgenagelten Zone — rechnete die Insel selbst, entschieden Server und Browser an
     * der Tagesgrenze verschieden.
     */
    db.insert(zugangscodes)
      .values([code({ id: "zc-1", code: "CODE-1", lastUsedAt: BENUTZT_AM })])
      .run();

    expect(codesListe(db)[0]?.zuletztText).toBe(BENUTZT_TEXT);
  });

  it("ein gesperrter Zugang liefert BEIDE Angaben: wann und von wem", () => {
    /*
     * ⛔ `_db/schema.ts:184-187` woertlich: „Sie existieren, WEIL die Zeile dauerhaft in der
     * Liste steht und erklaeren muss, warum sie tot ist; `aktiv = false` allein verlangte vom
     * Betreiber, sich das zu merken." ⛔ BEIDE FELDER, nicht eines
     * (`.superpowers/sdd/planteil4/briefs/V20.md:44-47`).
     *
     * ⛔ DER NAME WIRD AUFGELOEST, UND DAS IST HIER VERDIENT — anders als bei den
     * CSV-importierten Ereigniszeilen. `gesperrt_von` traegt den `sub` einer LEBENDEN
     * Suite-Sitzung (`_actions/codes.ts:121-135`, `viewer.sub`), und derselbe Aufruf hat die
     * Person eine Zeile vorher in `users` eingetragen: `setzeCodeAktiv` ruft als erste
     * Anweisung `requireRadioAdmin()`, das ueber `riegelAufStufe` `merkeNutzer(getDb(),
     * viewer)` schreibt (`_lib/zugang.ts:459-470`). Der Seed legt die `users`-Zeile
     * ausdruecklich an, „damit die sechs Auditspalten einen Namen aufloesen"
     * (`_lib/seedLokal.ts:102-104`).
     */
    db.insert(users)
      .values([{ sub: "sub-berta", name: "Berta Beispiel", lastSeenAt: ANGELEGT_AM }])
      .run();
    db.insert(zugangscodes)
      .values([
        code({
          id: "zc-1",
          code: "CODE-1",
          aktiv: false,
          gesperrtAm: GESPERRT_AM,
          gesperrtVon: "sub-berta",
        }),
      ])
      .run();

    const [zeile] = codesListe(db);
    expect(zeile?.aktiv).toBe(false);
    expect(zeile?.gesperrtAmText, "der Zeitpunkt der Sperre fehlt").toBe(GESPERRT_TEXT);
    expect(zeile?.gesperrtVonText, "die sperrende Person fehlt").toBe("Berta Beispiel");
    expect(zeile?.gesperrtVonSub, "der rohe sub fehlt fuer das title-Attribut").toBe("sub-berta");
  });

  it("ein unbekannter sub faellt auf sich selbst zurueck, statt die Spalte zu leeren", () => {
    /*
     * ⛔ DERSELBE RUECKFALL WIE IN DER EREIGNISLISTE (`_lib/lesepfade/ereignisse.ts:240`,
     * dort mit dem Alt-Beleg „so the field is never blank", `devices.ts:70-71`). Ein `sub`
     * ohne `users`-Zeile ist moeglich, wenn die Person seit dem Sperren nie wieder da war und
     * die Zeile aus einer Datenuebernahme stammt — dann steht der rohe Wert da, nicht nichts.
     */
    db.insert(zugangscodes)
      .values([
        code({
          id: "zc-1",
          code: "CODE-1",
          aktiv: false,
          gesperrtAm: GESPERRT_AM,
          gesperrtVon: "sub-unbekannt",
        }),
      ])
      .run();

    const [zeile] = codesListe(db);
    expect(zeile?.gesperrtVonText).toBe("sub-unbekannt");
    expect(zeile?.gesperrtVonSub).toBe("sub-unbekannt");
  });

  it("ein gesperrter Zugang OHNE Zeitstempel erfindet keinen", () => {
    /*
     * ⛔ DIE TEUERSTE MUTATIONSSONDE DIESES WEGS HING AN GENAU DIESER FORM (B7 im
     * Ausfuehrungsplan, im Ledger woertlich zitiert:
     * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „V-L6", Punkt 2): ein
     * `?? new Date(0)` auf einem Rueckgabezeitpunkt haette jede aktive Leihe zu einer 1970
     * zurueckgegebenen gemacht. ⛔ HIER IST DIE GLEICHE FALLE: `gesperrt_am` und
     * `gesperrt_von` sind nullable (`_db/schema.ts:186-187`), und ein Rueckfall auf
     * `new Date(0)` schriebe „gesperrt am 01.01.1970" an eine Zeile, ueber die niemand das
     * weiss.
     *
     * ⚠️ DER FALL IST KEIN BETRIEBSFALL: `setzeCodeAktiv` schreibt beim Sperren IMMER beide
     * Felder (`_actions/codes.ts:129-133`), und der Seed tut es ebenfalls
     * (`_lib/seedLokal.ts:183-185`). ⛔ DAS SCHEMA ERLAUBT DEN ZUSTAND TROTZDEM — und ein
     * Fall, den nur der Bestand ausschliesst, ist genau der, der bei einer Datenuebernahme
     * zuerst auftritt.
     */
    db.insert(zugangscodes)
      .values([
        code({ id: "zc-1", code: "CODE-1", aktiv: false, gesperrtAm: null, gesperrtVon: null }),
      ])
      .run();

    const [zeile] = codesListe(db);
    expect(zeile?.aktiv).toBe(false);
    expect(zeile?.gesperrtAmText, "ein Sperrzeitpunkt wurde erfunden").toBe("");
    expect(zeile?.gesperrtVonText, "eine sperrende Person wurde erfunden").toBe("");
    expect(zeile?.gesperrtVonSub).toBe("");
  });

  it("ein gesperrter Zugang mit nur EINEM der beiden Felder liefert genau dieses", () => {
    /*
     * ⛔ DAS SCHEMA LAESST DIE ZWEI SPALTEN EINZELN `NULL` (`_db/schema.ts:186-187`). Der Fall
     * darueber misst „beide fehlen", der davor „beide da" — ⛔ DIE ZWEI HALBEN ZUSTAENDE
     * DAZWISCHEN WAREN UNBEWACHT, und die Flaeche entscheidet ueber sie (Sonde S-V20-I24,
     * 2026-08-26: das `&&` der Insel auf `||` gedreht liess alles gruen).
     *
     * ⛔ DER LESEPFAD REICHT SIE EINZELN DURCH UND FASST SIE NICHT ZUSAMMEN. Ein
     * `gesperrtAmText`, das leer wird, weil die PERSON fehlt, waere ein zweiter Ort, an dem
     * ueber die Anzeige entschieden wird — und der zweite Ort ist der, der auseinanderlaeuft.
     */
    db.insert(zugangscodes)
      .values([
        code({
          id: "zc-1",
          code: "CODE-1",
          aktiv: false,
          gesperrtAm: GESPERRT_AM,
          gesperrtVon: null,
        }),
        code({
          id: "zc-2",
          code: "CODE-2",
          aktiv: false,
          gesperrtAm: null,
          gesperrtVon: "sub-anna",
        }),
      ])
      .run();

    const nachId = new Map(codesListe(db).map((z) => [z.id, z]));
    expect(
      [nachId.get("zc-1")?.gesperrtAmText, nachId.get("zc-1")?.gesperrtVonText],
      "der bekannte Zeitpunkt ging verloren, weil die Person fehlt",
    ).toEqual([GESPERRT_TEXT, ""]);
    expect(
      [nachId.get("zc-2")?.gesperrtAmText, nachId.get("zc-2")?.gesperrtVonText],
      "die bekannte Person ging verloren, weil der Zeitpunkt fehlt",
    ).toEqual(["", "sub-anna"]);
  });

  it("ein aktiver Zugang traegt keine Sperrangaben", () => {
    /*
     * DIE GEGENPROBE ZUM FALL DARUEBER. Ohne sie bestuende „erfindet keinen" auch ueber einer
     * Fassung, die die zwei Texte GRUNDSAETZLICH leer laesst — dann waere der Fall „liefert
     * BEIDE Angaben" der einzige Waechter, und er misst die andere Richtung.
     */
    db.insert(zugangscodes)
      .values([
        code({
          id: "zc-1",
          code: "CODE-1",
          aktiv: true,
          gesperrtAm: null,
          gesperrtVon: null,
          lastUsedAt: BENUTZT_AM,
        }),
      ])
      .run();

    const [zeile] = codesListe(db);
    expect([zeile?.gesperrtAmText, zeile?.gesperrtVonText, zeile?.gesperrtVonSub]).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("jedes Feld der Zeile ist serialisierbar — kein Date, keine Funktion", () => {
    /*
     * ⛔ BAUFORM-ZULAESSIGKEITSTAFEL NR. 7 (`.superpowers/sdd/planteil4/briefs/KOPF.md:320`):
     * ueber die Insel-Grenze gehen nur vorformatierte, serialisierbare Werte. ⛔ TYPECHECK
     * FAENGT DAS NICHT — ein `Date` in einem `CodeZeile`-Feld waere typkorrekt, wenn der Typ
     * es fuehrte; dieser Fall misst den WERT und nicht die Deklaration.
     *
     * ⚠️ ER LAEUFT UEBER EINE GESPERRTE UND EINE AKTIVE ZEILE, damit beide Zweige der
     * Formatierung wirklich gelaufen sind.
     */
    db.insert(zugangscodes)
      .values([
        code({ id: "zc-1", code: "CODE-1", lastUsedAt: BENUTZT_AM }),
        code({
          id: "zc-2",
          code: "CODE-2",
          aktiv: false,
          gesperrtAm: GESPERRT_AM,
          gesperrtVon: "sub-anna",
        }),
      ])
      .run();

    const zeilen = codesListe(db);
    expect(zeilen.length, "der Bestand kam nicht an — der Fall liefe ins Leere").toBe(2);
    for (const zeile of zeilen) {
      for (const [feld, wert] of Object.entries(zeile)) {
        /*
         * ⛔ `Object.prototype.toString.call(...)` UND NICHT `instanceof Date` — und das ist
         * ein gemessener Zwang, keine Vorliebe: `CodeZeile` deklariert jedes Feld als
         * `string | boolean`, und `tsc` weist `instanceof` darauf zurueck
         * (`error TS2358: The left-hand side of an 'instanceof' expression must be of type
         * 'any', an object type or a type parameter`, gefahren am 2026-08-26). ⛔ DIE
         * LAUFZEITPRUEFUNG BLEIBT TROTZDEM NOETIG: sie misst den WERT, und der Typ waere
         * genau dann keine Hilfe mehr, wenn jemand das Feld auf `Date` umdeklariert.
         */
        expect(Object.prototype.toString.call(wert), `${feld} ist ein Date`).not.toBe(
          "[object Date]",
        );
        expect(typeof wert, `${feld} ist weder Zeichenkette noch Wahrheitswert`).toMatch(
          /^(?:string|boolean)$/,
        );
      }
    }
  });

  it("ein leerer Bestand liefert eine leere Liste, keinen Wurf", () => {
    /*
     * DIE FLAECHE VOR DEM ERSTEN AUSGESTELLTEN ZUGANG — der Zustand, in dem
     * `/admin/zugaenge` nach dem Cutover zuerst steht. `codesListe` antwortet mit einer leeren
     * Liste, und die Insel zeigt ihren Leertext.
     *
     * ⛔ **WAS DIESER FALL AUSDRUECKLICH NICHT BEWACHT, UND ZWAR GEMESSEN** (Sonde
     * **S-V20-L9**, 2026-08-26): den `IN ()`-Schutz in `nutzernamen`
     * (`_lib/lesepfade/codes.ts`, `if (eindeutig.length === 0) return karte;`). Die Zeile
     * ersatzlos entfernt ergab `Tests 10 passed`, ⛔ NULL ROT — dieses `drizzle-orm` baut aus
     * `inArray(spalte, [])` ein gueltiges Praedikat, statt das `IN ()` zu erzeugen, das der
     * Alt-Kommentar fuerchtet (`userRepo.ts:25-26`). ⛔ DIE ZEILE BLEIBT TROTZDEM STEHEN: sie
     * spart bei JEDER Antwort dieser Flaeche einen Rundlauf — solange kein Zugang gesperrt
     * ist, ist die `sub`-Liste leer, und das ist hier der Normalfall, nicht der Randfall. Sie
     * steht wortgleich in den zwei Schwesterkopien
     * (`_lib/lesepfade/ereignisse.ts:171-183`, `_lib/lesepfade/geraete.ts:601-611`). ⚠️ Wer
     * einen Waechter fuer sie will, braeuchte eine Zaehlung der Abfragen — die gibt es in
     * diesem Modul nicht, und sie hier zu erfinden waere ein Baustein mehr als die Aufgabe
     * fuehrt. ⬜ Ohne Eigentuemer in diesem Fenster; benannt statt verschwiegen.
     */
    expect(codesListe(db)).toEqual([]);
  });
});
