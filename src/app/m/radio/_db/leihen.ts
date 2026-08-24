// src/app/m/radio/_db/leihen.ts
import { and, count, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { DB } from "./client";
import { devices, loans } from "./schema";
import { datumMitUhrzeit, uhrzeit } from "../_lib/anzeige";
import { normalisiereSuchtext } from "../_lib/filter";
import {
  ausleihText,
  ENTLEIHER_MAX,
  rueckgabeText,
  ZUSTANDSNOTIZ_MAX,
  type AusleihErgebnis,
  type AusleihMeldung,
  type BetroffenesGeraet,
  type Konflikt,
  type RueckgabeErgebnis,
  type RueckgabeMeldung,
} from "../_lib/meldungen";
import { geraeteZustandAus, type GeraeteStatus } from "../_lib/status";

/**
 * DIE SECHS LESE- UND SCHREIBPFADE DER AUSLEIHE UND DER VERWALTUNG (Spec 1 §6.1,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:5014-5027`; Feldform §4.12 Nr. 6,
 * `:4082-4088`). Sie ersetzen die sechs `/v1`-Routen des Alt-Masters durch Drizzle-Aufrufe
 * IM SELBEN PROZESS.
 *
 * ⛔ KEIN `"use client"`, KEIN `"use server"` — reine Datenzugriffe (Spec:5014). Die
 * `"use client"`-Haelfte setzt `src/app/m/radio/riegel.test.ts:1064-1117` modulweit durch; fuer
 * `"use server"` gibt es keinen modulweiten Scan (⬜ A-L16, `_lib/meldungen.ts:19-24`),
 * deshalb scannt `_db/leihen.test.ts` diese Datei selbst.
 *
 * ⛔ ALLE NEHMEN `db` ALS ERSTEN PARAMETER (Spec:5015-5019). Die Funktion holt sich die
 * Verbindung NICHT selbst — sonst ist sie im Test nicht gegen eine eigene Datei zu haengen,
 * und `getModuleDb()` waere dort ausserdem falsch: sein Cache ist per MODULSCHLUESSEL
 * gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).
 *
 * ⚠️ `DB`, NICHT `RadioDb`. Spec:5018-5019 schreibt `RadioDb`; im Repo heisst der Typ `DB`
 * (`src/app/m/radio/_db/client.ts:26`), und ein Alias dafuer waere ein zweiter Name fuer
 * dieselbe Sache.
 *
 * ✅ DIE SECHSTE FUNKTION `leihhistorie` STEHT SEIT AUFGABE V1 (Planteil 4) HIER, UNTEN IN
 * DIESER DATEI. Sie speist ausschliesslich die Verwaltungsansicht `/admin/ausleihen`
 * (Spec:5024). Mit ihr ist Bauabschnitt B der Reihenfolge-Auflage geschlossen (Spec:5441-5486):
 * ALLE SECHS Ersatzfunktionen sind Drizzle-Aufrufe im selben Prozess, keine fuenf. ⛔ SIE LIEGT
 * IN DIESER DATEI UND NICHT IN EINER ZWEITEN (NS-A1) — eine zweite Datei haette die
 * Prosa-Sperre unten nicht getragen und den Feldsatz ein zweites Mal deklariert.
 *
 * ⛔ DER GESTRICHENE AUSFALL-PUFFER — DIE STREICHUNG IST EINE ENTSCHEIDUNG, KEINE
 * AUSLASSUNG (Spec:5410-5415, Auflage 6). Der Alt-Kiosk hielt seinen Geraete-Cache nach dem
 * Ablauf noch fuenf Minuten weiter vor, wenn `radio-admin` unerreichbar war:
 * `const STALE_GRACE_MS = 5 * 60_000;` in
 * `/Users/rubeen/dev/personal/drk/radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:43-48`
 * (gemessen; der Doc-Block steht auf `:43-47`, die Konstante auf `:48`). Im Monolithen gibt
 * es keinen fremden Host mehr, der ausfallen koennte. Der ganze Ersatz sind WAL und
 * `busy_timeout = 5000` (`src/core/db/index.ts:18`, `:20`) — ⛔ KEIN modul-eigener Cache und
 * KEIN modul-eigener Retry. „Fuenf Minuten Toleranz gegen einen Netzwerkausfall werden nicht
 * zu fuenf Minuten veralteter Geraeteliste ohne Grund." Grundlage ist **B15** (Spec:104):
 * Kapitel 4 und 6 tragen, Kapitel 2/8 sind ueberholt. Belegt ist der Ersatz von den zwei
 * WAL-Faellen in `_db/leihen.test.ts`, nicht von diesem Absatz.
 *
 * ⛔ KEIN VERWEIS AUF DIE ALTE HTTP-GRENZE (Entscheidung 15, Spec:5453): weder die
 * Umgebungsvariable des Alt-Hosts noch ein Pfad seiner Version-1-Routen steht in dieser
 * Datei. `radio-admin` behaelt jene sechs Routen unveraendert; diese Datei baut die Grenze
 * nicht nach, sie loest sie ab.
 * ⚠️ DIE ZWEI ZEICHENKETTEN STEHEN HIER DESHALB NIRGENDS AUSGESCHRIEBEN, AUCH NICHT IN
 * PROSA: der Scan in `_db/leihen.test.ts` liest den ROHEN Dateitext, Kommentare
 * eingeschlossen — eine Erwaehnung im Kopf macht ihn rot. Gemessen beim ersten Lauf dieser
 * Aufgabe: `1 failed | 25 passed`, allein an diesem Kommentar. Dieselbe Prosa-Sperre tragen
 * `_lib/anzeige.ts` fuer den Namen ihres Formatierers und `_lib/meldungen.ts:449-454` fuer
 * die zwei Statusetiketten.
 */

/**
 * ⛔ „HOECHSTENS DIE ELF", NICHT „GENAU DIE ELF" (Spec:5248-5251). Das Alt-Lesemodell
 * `toLoanDevice` (`radio-admin/server/src/routes/loanApi.ts:34-44`) ist die OBERGRENZE —
 * elf Felder; Kapitel 4 schneidet ENGER: die Seriennummer steht NICHT in der Zeile, sie geht
 * nur in `suchschluessel` ein (§4.1 Punkt 2). Jede Spalte, die weder dort noch hier steht,
 * ist ein Regelbruch.
 *
 * ⛔ DER AUSFALL BEI VERLETZUNG IST KONKRET (Spec:5231-5236): „wer `geraeteMitLeihstand` als
 * ‚alle Spalten aus `devices`' baut, bekommt eine Ausleihe-Flaeche, auf der ploetzlich
 * Software-Version, Audit-Spalten und `tei` stehen" — die Quelltabelle hat 25 Spalten
 * (`_db/schema.ts:19-65`).
 *
 * ⛔ `id` UND NICHT `issi` IST DER SCHLUESSEL, und die Begruendung wandert als Kommentar mit
 * (Spec:5243-5246), woertlich aus `radio-admin/server/src/routes/loanApi.ts:29-31`:
 * „issi is mutable (a device can be reprogrammed) and unsuitable as a foreign key".
 * Ohne diesen Satz ist der naechste naheliegende Umbau ein Join auf `issi`.
 *
 * ⚠️ `rufname` IST HIER NICHT NULLABLE, die Spalte schon (`_db/schema.ts:21`). Die Faltung
 * steht in `rufnameVon` unten, an genau einer Stelle.
 * ⚠️ `entleiher` UND `seit` SIND FERTIGE ZEICHENKETTEN, KEIN `Date` (§4.1 Punkt 1,
 * Spec:3338-3342): sonst entscheiden Server und Client an der Tagesgrenze verschieden, und
 * gegen die Zone des Endgeraets systematisch.
 */
export type GeraetMitLeihstand = {
  id: string;
  rufname: string;
  geraetetyp: string | null;
  standort: string | null;
  status: GeraeteStatus;
  suchschluessel: string;
  entleiher?: string;
  seit?: string;
};

/** Eine offene Ausleihe fuer `/rueckgabe` (Spec:4084, Alt-Projektion `loanApi.ts:98-107`). */
export type OffeneAusleihe = {
  id: string;
  rufname: string;
  entleiher: string;
  seitText: string;
};

/**
 * ⛔ `Vorschlag` IST KEIN `string` (Spec:5029-5035). Der Alt-Endpunkt gibt
 * `{ name, lastUsed }` zurueck (`radio-admin/server/src/repos/loanRepo.ts:168`, `:184`), und
 * `lastUsed` traegt die Nebenzeile im Vorschlag. „Eine Signatur `string[]` waere genau der
 * Posten, der beim Port STILL verschwindet."
 *
 * ⛔ `zuletztText` IST EINE FERTIGE ZEICHENKETTE — kein Zeitstempel in Millisekunden
 * verlaesst den Server (Spec:5122-5123).
 */
export type Vorschlag = { name: string; zuletztText: string };

/**
 * ⛔ DIE EINGABE DES SCHREIBPFADS. Sie existierte im Repo NICHT (gemessen vor dieser
 * Aufgabe: `grep -rn "AusleihEingabe" src/app/m/radio/` → null Treffer); die Spec fuehrt den
 * Namen nur als Parameternamen (Spec:5026). Sie wird deshalb HIER deklariert und exportiert
 * (Entscheidung E2, `.superpowers/sdd/planteil3/briefs/KOPF.md:493-503`).
 */
export type AusleihEingabe = {
  /**
   * Aus `auswahlLesen(...)` (`_lib/auswahl.ts:95`), dort auf `AUSWAHL_MAX = 20`
   * gedeckelt (`_lib/auswahl.ts:53`, Spec:3466-3470).
   * ⛔ DIESE FUNKTION SETZT DEN DECKEL NICHT NOCH EINMAL, UND DAS IST EINE ANDERE LAGE ALS
   * BEIM NAMEN ZWEI FELDER WEITER UNTEN — nicht dieselbe. `auswahlLesen` NORMALISIERT
   * (`_lib/auswahl.ts:76-85`): es kuerzt die Liste auf `AUSWAHL_MAX` und laesst den Vorgang
   * laufen. Eine gekuerzte Auswahl ist wiederherstellbar (man waehlt nach), es wird also
   * nichts abgelehnt, und was nicht abgelehnt wird, braucht keinen Satz und keinen `grund`.
   * ⚠️ DER NAME LIEGT ANDERS: kuerzen hiesse dort Datenschaden, also Ablehnung, also ein
   * Satz — und den gibt es seit dem 2026-08-24 (`name-zu-lang`).
   * ⬜ WER DEN DECKEL 20 STATTDESSEN ALS ABLEHNUNG WILL, braucht eine Betreiberentscheidung
   * ueber den Satz dazu; ein neunter `grund` waere die Folge, nicht das Hindernis
   * (siehe die Nachlese zu E13 in `_lib/meldungen.ts`, `case "name-zu-lang"`).
   */
  geraeteIds: string[];
  /**
   * Der Name aus dem Formular, UNVERAENDERT (Spec:3587-3592): `sanitizeForDisplay` wandert
   * NICHT mit, und auch ein `trim()` auf dem Weg IN die Datenbank waere eine dauerhafte
   * Veraenderung der gespeicherten Zeichenkette — bei „Mueller & Sohn" ein Datenschaden,
   * kein Schutz. ⛔ GEPRUEFT WIRD, NICHT UMGESCHRIEBEN: auf NICHTLEERE
   * (`trim().length === 0` → `kein-name`) UND auf LAENGE
   * (`trim().length > ENTLEIHER_MAX` → `name-zu-lang`). Gespeichert wird in beiden Faellen
   * der Wert, wie er kam.
   *
   * ✅ A-L17 — GESCHLOSSEN AM 2026-08-24 (Fund F2 der Schlusspruefung, Betreiberentscheidung
   * desselben Tages): der Deckel 100 des Alt-Bestands ist eine SERVERZUSAGE geworden.
   * Vorher war er nur eine Feldgrenze, und dies ist der einzige ANONYME Schreibpfad des
   * Moduls — ein Aufruf am Formular vorbei schrieb einen beliebig langen Namen in
   * `loans.borrower_name`. Eigentuemer der Zahl ist `ENTLEIHER_MAX` (`_lib/meldungen.ts`,
   * dort mit Quelle, Messung und der Begruendung fuer `trim().length`); die zugehoerige
   * Alt-Nachbarzeile ist `RETURN_NOTE_MAX: 500` → `ZUSTANDSNOTIZ_MAX`.
   */
  entleiher: string;
  /**
   * ⛔ DIE HERKUNFT DES ZUGANGS (Spec:2181-2186): `zugang.codeId` bei `weg: "code"`, `null`
   * bei `weg: "suite"` und fuer jede importierte Alt-Leihe. Der Aufrufer ist A17, Auflage 9.
   * ⛔ OHNE SIE IST DIE SPALTE `loans.zugangscode_id` TOT — und das Loeschverbot aus §3.2.4
   * (Spec:2240-2242, „Beides oder nichts") verloere die Haelfte, die ihm Wirkung gibt.
   */
  zugangscodeId: string | null;
};

/**
 * ⛔ DIE ZWEI ZEICHEN SIND EINE DATENSCHUTZGRENZE, KEINE BEQUEMLICHKEIT (Spec:5117-5121).
 * Ohne sie liefert ein Aufruf mit leerem Suchtext einem ANONYMEN Aufrufer die vollstaendige
 * Namensliste des Retentionsfensters. Die Alt-Flaeche hat dieselbe Schwelle
 * (`radio-inventar/apps/frontend/src/components/features/BorrowerInput.tsx:30`).
 */
export const VORSCHLAG_MIN_ZEICHEN = 2;

/**
 * ⛔ DER RUFNAME EINES GELOESCHTEN GERAETS IST NICHT MEHR ZU HABEN — und der Satz zu
 * `verschwunden` verlangt trotzdem einen (`_lib/meldungen.ts:202`, Regel 1 aus Spec:3547:
 * „der Rufname steht IM SATZ"). Ein Rueckfall auf die Geraete-Id waere die technische
 * Kennung, die Regel 2 verbietet (`_lib/meldungen.ts:36-37`, Spec:3549-3550).
 *
 * ⚠️ BAU-ENTSCHEIDUNG DIESER AUFGABE, kein Spec-Zitat — dieselbe Form, in der A14 seine
 * drei Saetze ohne Vorlage begruendet hat (`_lib/meldungen.ts:318-326`). Bildschirmtext, also
 * mit Umlaut (die eine benannte Ausnahme der Hausregel, `KOPF.md:265-272`).
 */
const RUFNAME_UNBEKANNT = "Ein Gerät";

/**
 * ⛔ DER RUECKFALL FUER DEN ENTLEIHER IST EINE ZWEITE KONSTANTE, UND ZWAR AUS EINEM
 * GRAMMATISCHEN GRUND. Der Satz zu `konflikt.zustand === "ON_LOAN"` setzt den Wert in den
 * PERSONENSLOT: „${rufname} ist inzwischen an ${entleiher} ausgeliehen."
 * (`_lib/meldungen.ts:440`). `RUFNAME_UNBEKANNT` steht fuer ein GERAET und ergaebe dort
 * „... ist inzwischen an Ein Gerät ausgeliehen." — ein Bildschirmtext, den kein Mensch so
 * schreiben wuerde. Dass `bucheRueckgabe` dieselbe Konstante RICHTIG benutzt (dort ist sie
 * ein Rufname), macht den Fehlgriff schwer sichtbar, nicht kleiner.
 *
 * ⚠️ BAU-ENTSCHEIDUNG DIESER AUFGABE, kein Spec-Zitat, und der Zweig ist konstruktiv
 * unerreichbar — die Unique-Verletzung bedeutet, dass es die aktive Zeile gibt (der
 * Kommentar unmittelbar an der Fundstelle sagt es aus). Deshalb hat er keinen eigenen Fall
 * und keine Sonde: eine Zusicherung, die kein Aufruf erreicht, waere ein leerer Waechter.
 */
const ENTLEIHER_UNBEKANNT = "jemand anderen";

/**
 * Der Rufname einer Geraetezeile, mit dem Rueckfall der Quelle.
 *
 * ⛔ DIE FALTUNG STEHT AN GENAU EINER STELLE, weil sie BEIDE Pfade betrifft: der Lesepfad
 * braucht sie fuer `GeraetMitLeihstand.rufname` (nicht nullable) und der Schreibpfad fuer
 * `loans.snapshot_call_sign` (`NOT NULL`, `_db/schema.ts:214`). Der Alt-Master faltet an
 * derselben Stelle: `snapshotCallSign: device.rufname ?? device.issi`
 * (`radio-admin/server/src/routes/loanApi.ts:173`). Zwei Faltungsorte liefen auseinander,
 * und die Ausleihe eines Geraets ohne Rufnamen braeche erst dort.
 */
function rufnameVon(geraet: { rufname: string | null; issi: string }): string {
  return geraet.rufname ?? geraet.issi;
}

/**
 * Der vorberechnete Suchschluessel einer Zeile (§4.5.2, Spec:3629-3632).
 *
 * ⛔ DIE SERIENNUMMER GEHT HIER EIN UND NUR HIER (§4.1 Punkt 2, Spec:3346-3352): „die
 * Seriennummer wandert nicht in den Client. Sie bleibt Suchfeld — die Suche laeuft dafuer
 * serverseitig." Der Heuhaufen ist zeichengleich der der Alt-Quelle
 * (`radio-inventar/apps/frontend/src/lib/device-filter.ts:35-38`: Rufname, Geraetetyp,
 * Seriennummer, Standort, mit `filter(Boolean).join(" ")`).
 *
 * ⚠️ DIE NORMALISIERUNG LAEUFT EINMAL JE GERAET, nicht einmal je Tastendruck je Geraet
 * (Spec:3631-3632) — das ist der Nebeneffekt, um dessentwillen das Feld ueberhaupt
 * vorberechnet wird.
 */
function suchschluesselAus(
  rufname: string,
  geraetetyp: string | null,
  seriennummer: string | null,
  standort: string | null,
): string {
  return normalisiereSuchtext([rufname, geraetetyp, seriennummer, standort].filter(Boolean).join(" "));
}

/**
 * DIE GERAETELISTE MIT DEM LEIHSTAND — ersetzt `GET /v1/loan-devices` (Spec:5022).
 *
 * ⛔ SIE FILTERT `loanable`, WEIL DER ERSETZTE ENDPUNKT ES TUT (Fund F1 der
 * Schlusspruefung, Betreiberentscheidung vom 2026-08-24). Ohne den Filter zeigte die
 * Ausleihflaeche mehr Geraete als das Original: ein als nicht verleihbar gekennzeichnetes
 * Geraet erschiene als „Verfuegbar", waere antippbar, und der Vorgang scheiterte erst beim
 * Absenden an `NICHT_FREIGEGEBEN` (`bucheAusleihe` unten) — genau der Zustand, den
 * `loanable` verhindern soll. Der Import traegt die Spalte am Tag eins mit
 * (`scripts/import/radio.ts:279`).
 *
 * ⛔ DIE NULL-SEMANTIK IST AM BESTAND GEMESSEN, NICHT GERATEN: eine Zeile mit
 * `loanable = NULL` FAELLT HERAUS. Der ersetzte Endpunkt lautet
 * `.where(eq(devices.loanable, true))`
 * (`radio-admin/server/src/repos/deviceRepo.ts:53-59`, der Filter an `:57`), und die Spalte
 * steht dort als `integer('loanable', { mode: 'boolean' })`
 * (`radio-admin/server/src/db/schema.ts:32`) — Drizzle setzt `true` damit auf `1`, und
 * `NULL = 1` ist in SQLite weder wahr noch falsch, sondern NULL. Der Schreibweg des
 * Bestands entscheidet gleich (`radio-admin/server/src/routes/loanApi.ts:166`:
 * `if (!device.loanable)`), und `bucheAusleihe` bildet ihn schon so ab. Gemessen wird die
 * Semantik in `_db/leihen.test.ts` mit DREI Zeilen (`true`/`false`/`NULL`) — mit zwei
 * bliebe ein zu „ungleich false" abgeschwaechter Filter gruen.
 *
 * ⛔ `offeneAusleihen` FILTERT NICHT MIT, UND DAS IST KEIN VERSEHEN (siehe dort): der
 * Bestand haelt die zwei ausdruecklich auseinander
 * (`radio-admin/server/src/routes/loanApi.ts:131-132`, woertlich „Deliberately NOT folded
 * into /loan-devices, which filters loanable=true and would hide a loan on a since-un-
 * loanabled device"), damit eine Leihe auf einem nachtraeglich gesperrten Geraet nicht aus
 * der Rueckgabe verschwindet.
 *
 * ⛔ `ON_LOAN` KOMMT AUS DER TABELLE `loans`, NIE AUS DER SPALTE `devices.status`
 * (`_lib/status.ts:44-46`; der Bestand trennt genauso, `radio-admin/shared/src/loan.ts:12-14`).
 * Die Faltung des freien Statustextes steht in `geraeteZustandAus` (`_lib/status.ts:177-188`)
 * und wird hier NICHT ein zweites Mal geschrieben (`.superpowers/sdd/planteil3/progress.md:236-246`).
 *
 * ⛔ KEIN ZWEITES `ORDER BY` NACH STATUS (`_lib/filter.ts:26-31`). Die Sortierung nach
 * Statusprioritaet hat ihren einzigen Ort in `filtereGeraete`; zwei Sortierorte waeren zwei
 * Wahrheiten, und die zweite saehe man erst, wenn sie auseinanderlaufen. Diese Funktion
 * sortiert deshalb GAR NICHT — die Reihenfolge ist die der Tabelle, und `Array#sort` in
 * `filtereGeraete` ist stabil, haelt sie also innerhalb eines Zustands.
 */
export function geraeteMitLeihstand(db: DB): GeraetMitLeihstand[] {
  const zeilen = db
    .select({
      id: devices.id,
      rufname: devices.rufname,
      issi: devices.issi,
      geraetetyp: devices.deviceType,
      seriennummer: devices.serialNumber,
      standort: devices.location,
      rohStatus: devices.status,
      entleiher: loans.borrowerName,
      seit: loans.borrowedAt,
    })
    .from(devices)
    // Die AKTIVE Leihe, wenn es eine gibt: `returned_at IS NULL` heisst „aktive Leihe"
    // (`_db/schema.ts:199`). Der partielle Unique-Index `loans_device_active_uidx`
    // (`_db/migrations/0001_loans_aktiv_uidx.sql`) sichert zu, dass es hoechstens EINE ist —
    // ohne ihn vervielfachte dieser Join Geraetezeilen.
    .leftJoin(loans, and(eq(loans.deviceId, devices.id), isNull(loans.returnedAt)))
    // ⛔ DER FILTER STEHT IN `where` UND NICHT IN DER `and(...)` DES `leftJoin` — jene
    // Bedingung steuert den JOIN AUF `loans`; ein `devices`-Praedikat darin waere
    // typkorrekt, lint-sauber und WIRKUNGSLOS (der `leftJoin` haelt die Geraetezeile).
    .where(eq(devices.loanable, true))
    .all();

  return zeilen.map((z) => {
    const rufname = rufnameVon(z);
    const zeile: GeraetMitLeihstand = {
      id: z.id,
      rufname,
      geraetetyp: z.geraetetyp,
      standort: z.standort,
      status: z.entleiher === null ? geraeteZustandAus(z.rohStatus) : "ON_LOAN",
      suchschluessel: suchschluesselAus(rufname, z.geraetetyp, z.seriennummer, z.standort),
    };
    if (z.entleiher === null || z.seit === null) return zeile;
    return { ...zeile, entleiher: z.entleiher, seit: uhrzeit(z.seit) };
  });
}

/**
 * DIE OFFENEN AUSLEIHEN — ersetzt `GET /v1/active-loans` (Spec:5023).
 *
 * Neueste zuerst, wie `findActiveLoans` (`radio-admin/server/src/repos/loanRepo.ts:126-135`).
 * ⚠️ DER RUFNAME KOMMT AUS DEM SCHNAPPSCHUSS, NICHT AUS EINEM JOIN AUF `devices`: die
 * historische Richtigkeit traegt der unveraenderliche Anzeige-Schnappschuss, der beim
 * Ausleihen kopiert wird (`_db/schema.ts:201-205`), nicht ein lebender Join.
 */
export function offeneAusleihen(db: DB): OffeneAusleihe[] {
  return db
    .select({
      id: loans.id,
      rufname: loans.snapshotCallSign,
      entleiher: loans.borrowerName,
      seit: loans.borrowedAt,
    })
    .from(loans)
    .where(isNull(loans.returnedAt))
    .orderBy(desc(loans.borrowedAt))
    .all()
    .map((z) => ({
      id: z.id,
      rufname: z.rufname,
      entleiher: z.entleiher,
      seitText: datumMitUhrzeit(z.seit),
    }));
}

/**
 * DIE NAMENSVORSCHLAEGE — ersetzt `GET /v1/borrowers/suggestions` (Spec:5025, §4.3.4).
 *
 * ⛔ DIE FALTUNG LAEUFT IN JAVASCRIPT UND NICHT IN SQL, und das ist keine Stilfrage:
 * `_db/client.ts:4-13` schreibt aus, dass dieses Modul ABSICHTLICH keinen eigenen Opener
 * hat, und nennt die Bedingung, unter der das kippt — „wird die Suche in SQL gezogen (LIKE
 * gegen eine gefaltete Spalte oder gegen eine SQLite-Funktion), … braucht `radio` einen
 * eigenen Opener nach lagerbuch-Muster". Der Alt-Bestand faltet in SQL, mit einer
 * registrierten Funktion `lower_u` (`radio-admin/server/src/repos/loanRepo.ts:179`), die es
 * hier nicht gibt; SQLites eingebautes `LIKE` faltet nur ASCII und faende „Müller" mit
 * „muller" NIE. `normalisiereSuchtext` (`_lib/filter.ts:108-115`) tut beides.
 *
 * ⛔ DER DECKEL GREIFT NACH DEM FILTERN, NIE ALS `LIMIT` IM SQL. Ein `limit(deckel)` vor dem
 * Filtern liefert weniger Treffer als es gibt, sobald nicht passende Namen die neuesten
 * Zeitpunkte tragen — und der Testname „liefert HOECHSTENS deckel Vorschlaege" ist eine
 * OBERgrenze und bliebe dabei gruen.
 *
 * ⚠️ DIE ZAHL 10 STEHT ALS VORGABEWERT HIER UND NUR HIER (Spec:4084). `entleiherVorschlaege`
 * (A17) setzt KEINEN eigenen daneben — zwei Zahlen fuer dieselbe Grenze laufen auseinander.
 */
export function sucheEntleiher(db: DB, suchtext: string, deckel = 10): Vorschlag[] {
  // ⛔ AUF DEM ROHEN TEXT GEMESSEN, wie Spec:5119 es schreibt (`suchtext.trim().length < 2`).
  // Auf dem NORMALISIERTEN gemessen waere die Schwelle fuer „ß" eine andere: die Ersetzung
  // auf „ss" macht ein Zeichen zu zweien.
  if (suchtext.trim().length < VORSCHLAG_MIN_ZEICHEN) return [];
  const nadel = normalisiereSuchtext(suchtext);
  if (nadel.length === 0) return [];

  const grenze = Math.max(0, Math.trunc(deckel));
  const zeilen = db
    .select({
      name: loans.borrowerName,
      // ⚠️ EPOCH-SEKUNDEN. `loans.borrowed_at` ist `integer(..., { mode: "timestamp" })`
      // (`_db/schema.ts:218`); der Drizzle-Codec, der daraus ein `Date` macht, greift bei
      // einer Aggregatspalte NICHT — der Faktor steht deshalb unten sichtbar im Ausdruck
      // (Hausregel, `src/app/m/lagerbuch/_db/schema.ts:11-16`).
      zuletztSekunden: sql<number>`max(${loans.borrowedAt})`,
    })
    .from(loans)
    .groupBy(loans.borrowerName)
    .orderBy(sql`max(${loans.borrowedAt}) desc`)
    .all();

  return zeilen
    .filter((z) => normalisiereSuchtext(z.name).includes(nadel))
    .slice(0, grenze)
    .map((z) => ({
      name: z.name,
      /*
       * ⚠️ ABWEICHUNG VOM ALT-KIOSK, BENANNT STATT STILL: dort steht in der Nebenzeile ein
       * reines Datum (`radio-inventar/apps/frontend/src/lib/formatters.ts:15`,
       * `toLocaleDateString('de-DE')`), hier steht Datum UND Uhrzeit. Der Grund ist, dass
       * `_lib/anzeige.ts` genau zwei Formatierer fuehrt und fuer diese Datei GESCHLOSSEN
       * ist: ihr eigener Waechter zaehlt die Konstruktoraufrufe im ganzen Dateitext und
       * steht auf `toBe(2)` (`_lib/anzeige.test.ts:188-197`), und das Ledger weist A15
       * ausdruecklich an, aus ihr zu lesen und nicht in sie zu schreiben
       * (`.superpowers/sdd/planteil3/progress.md:291-295`). Ein eigener Formatierer HIER
       * braeuchte die Zone ein zweites Mal — genau das, wogegen `_lib/anzeige.ts:49` steht.
       * Der Preis ist von Spec:3500-3506 gedeckt: „wer den Code hat, sieht auf der
       * Uebersicht ohnehin JEDEN aktiven Entleihernamen samt Uhrzeit — die Vorschlaege
       * erweitern das um vergangene Namen, nicht um eine neue Klasse."
       * ⬜ Wer das reine Datum will, braucht eine dritte Funktion in `_lib/anzeige.ts` und
       * hebt dabei jene Zaehlung auf drei; das ist eine Aenderung an A12s Datei und
       * gehoert nicht in diese Aufgabe.
       */
      zuletztText: `zuletzt am ${datumMitUhrzeit(new Date(z.zuletztSekunden * 1000))}`,
    }));
}

/**
 * Der Abbruch EINER Ausleih-Transaktion, mit dem fertigen Ergebnis im Gepaeck.
 *
 * ⛔ DER WURF IST DER EINZIGE WEG, DIE TRANSAKTION ZURUECKZUROLLEN. Ein `return` aus dem
 * Rumpf von `db.transaction(...)` BESTAETIGT sie — die schon eingefuegten Leihen der
 * vorherigen Geraete blieben stehen, und die Zusage „Es wurde nichts gebucht."
 * (`_lib/meldungen.ts:413`) waere gebrochen, typkorrekt und lint-sauber. Der Wurf wird
 * unmittelbar ausserhalb wieder eingefangen; nach aussen wirft `bucheAusleihe` nicht.
 */
class AusleihAbbruch extends Error {
  constructor(readonly ergebnis: AusleihErgebnis) {
    super("ausleihe-abgebrochen");
    this.name = "AusleihAbbruch";
  }
}

/** Eine Ablehnung der Ausleihe, mit dem Satz aus `_lib/meldungen.ts` (Spec:5229-5232). */
function ausleihAblehnung(
  meldung: AusleihMeldung,
  betroffen: BetroffenesGeraet[] = [],
): AusleihErgebnis {
  return { ok: false, grund: meldung.grund, text: ausleihText(meldung), betroffen };
}

/**
 * Die Ablehnung `nicht-verfuegbar` — der GROEBERE Diskriminator, der drei Alt-Codes traegt
 * (Spec:5217-5221). Was sie auseinanderhaelt, ist `betroffen[].status` und der Satz.
 *
 * ⛔ `status` DARF NICHT VERLOREN GEHEN (Spec:5223-5228): es ist der Platz des heutigen
 * `condition`-Felds aus dem 409-Rumpf (`radio-admin/server/src/routes/loanApi.ts:168`) und
 * „das einzige, das dem Kiosk sagt, WARUM ein Geraet nicht verfuegbar ist".
 */
function nichtVerfuegbar(rufname: string, konflikt: Konflikt): AusleihErgebnis {
  return ausleihAblehnung({ grund: "nicht-verfuegbar", rufname, konflikt }, [
    { rufname, status: konflikt.zustand },
  ]);
}

/**
 * better-sqlite3 meldet eine Unique-Verletzung mit diesem Code. Auf `loans` ist der
 * PARTIELLE `loans_device_active_uidx` der einzige Unique-Index (die PK-Verletzung meldet
 * `SQLITE_CONSTRAINT_PRIMARYKEY`), der Code heisst hier also eindeutig „das Geraet hat
 * bereits eine aktive Leihe" — 1:1 aus
 * `radio-admin/server/src/repos/loanRepo.ts:60-66`.
 */
function istUniqueVerletzung(fehler: unknown): boolean {
  if (!(fehler instanceof Error)) return false;
  if ((fehler as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return true;
  const ursache = (fehler as { cause?: unknown }).cause;
  return ursache instanceof Error && (ursache as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

/**
 * DIE AUSLEIHE — ersetzt `POST /v1/loans` (Spec:5026), aber mit EINER Liste statt N Aufrufen.
 *
 * ⛔ EINE TRANSAKTION UEBER ALLE GEWAEHLTEN GERAETE, ALLES ODER NICHTS (§4.3.2,
 * Spec:3441-3449). Heute feuert der Alt-Knopf N unabhaengige POSTs
 * (`radio-inventar/apps/frontend/src/components/features/ConfirmLoanButton.tsx:55-59`) —
 * scheitert der dritte von vier, sind drei gebucht und die Flaeche meldet trotzdem einen
 * Fehler. Eine Ersatzsignatur mit einem Einzelgeraet zoege genau diese Form still wieder ein.
 *
 * ⛔ GERAET LESEN → `loanable` → ZUSTAND SIND DIE ERSTEN ANWEISUNGEN, IN DIESER REIHENFOLGE,
 * JE GEWAEHLTEM GERAET INNERHALB DER TRANSAKTION (Spec:5264-5268). Der Alt-Master begruendet
 * sie mit „the kiosk is open, so the caller is not trusted to enforce these"
 * (`radio-admin/server/src/routes/loanApi.ts:154-157`). ⚠️ Es ist verfuehrerisch, das nach
 * dem Wegfall der HTTP-Grenze als „jetzt ist der Aufrufer ja wir selbst" zu lesen — falsch:
 * der ANONYME Ausleiher und sein Formular sind unveraendert unvertraut, und mit Entscheidung
 * 4/10 ist die Flaeche sogar BREITER erreichbar als vorher.
 *
 * ⛔ DER RIEGEL GEGEN DOPPELBUCHEN IST DER PARTIELLE UNIQUE-INDEX, NICHT EIN `SELECT` VOR
 * DEM `INSERT` (Spec:3457-3464). Ein `SELECT`-dann-`INSERT` hat ein Rennen zwischen den zwei
 * Anweisungen; der Index hat keines. Er liegt von Hand in
 * `_db/migrations/0001_loans_aktiv_uidx.sql` und ist dem Drizzle-Schema UNSICHTBAR
 * (`_db/schema.ts:238-240`) — `drizzle-kit` emittiert keine partiellen Indizes.
 *
 * ⛔ RUECKGABEWERT STATT WURF FUER JEDE FACHLICHE ABLEHNUNG (Spec:3458-3459, `:5229-5232`):
 * ein `throw` aus einer Server Action kommt in Produktion als anonymisierte Meldung an und
 * verliert genau die Auskunft, die der Mensch braucht.
 */
export function bucheAusleihe(db: DB, e: AusleihEingabe): AusleihErgebnis {
  // Die zwei feldnahen Gruende (Spec:5203). Sie gehoeren auf der Flaeche ans FELD, geprueft
  // werden sie trotzdem hier: „Der Server prueft erneut — eine Regel, die nur im Client
  // steht, ist keine Regel" (Spec:3583-3585).
  if (e.geraeteIds.length === 0) return ausleihAblehnung({ grund: "keine-auswahl" });
  if (e.entleiher.trim().length === 0) return ausleihAblehnung({ grund: "kein-name" });
  /*
   * ⛔ DER DECKEL 100 IST SEIT DEM 2026-08-24 EINE SERVERZUSAGE (Fund F2,
   * Betreiberentscheidung desselben Tages). Eigentuemer der Zahl ist `ENTLEIHER_MAX`
   * (`_lib/meldungen.ts`); hier steht keine zweite.
   *
   * ⛔ GEMESSEN AUF `trim().length`, WEIL DER BESTAND ES SO MISST: zods `.trim()` laeuft VOR
   * `.max()` (`radio-admin/shared/src/loan.ts:39`), die Annahmegrenze ist dort also die
   * getrimmte Laenge. ⚠️ GESPEICHERT WIRD TROTZDEM UNVERAENDERT (Spec:3587-3592, Zeile
   * darueber) — der Bestand speichert getrimmt, dieses Modul nicht, und diese Abweichung
   * ist an der Eingabeform ausgeschrieben. Die Folge ist benannt statt still: ein
   * gespeicherter Name kann `ENTLEIHER_MAX` um Randleerzeichen ueberschreiten, um nichts
   * sonst.
   *
   * ⛔ ABGEWIESEN, NICHT GEKUERZT — und das ist NICHT dieselbe Wahl wie beim Deckel 20 zwei
   * Felder weiter oben. `auswahlLesen` NORMALISIERT (`_lib/auswahl.ts:76-85`): eine auf 20
   * gekuerzte Auswahlliste ist wiederherstellbar, es gibt nichts zu melden und darum
   * braucht sie keinen Satz. Ein gekuerzter NAME ist ein Datenschaden, den niemand mehr
   * sieht — bei „Mueller & Sohn" derselbe Fall wie beim verbotenen `sanitizeForDisplay`.
   * Also Ablehnung, also ein Satz, und den gab es bereits (`_lib/meldungen.ts`).
   */
  if (e.entleiher.trim().length > ENTLEIHER_MAX) {
    return ausleihAblehnung({ grund: "name-zu-lang" });
  }

  const jetzt = new Date();
  try {
    return db.transaction((tx) => {
      for (const geraeteId of e.geraeteIds) {
        const geraet = tx
          .select({
            rufname: devices.rufname,
            issi: devices.issi,
            seriennummer: devices.serialNumber,
            geraetetyp: devices.deviceType,
            loanable: devices.loanable,
            status: devices.status,
          })
          .from(devices)
          .where(eq(devices.id, geraeteId))
          .get();

        // 1. Geraet lesen — `device_not_found` (`loanApi.ts:165`) → `verschwunden`.
        if (!geraet) {
          throw new AusleihAbbruch(
            ausleihAblehnung({ grund: "verschwunden", rufname: RUFNAME_UNBEKANNT }),
          );
        }
        const rufname = rufnameVon(geraet);

        // 2. `loanable` — `device_not_loanable` (`loanApi.ts:166`). ⚠️ Eine NULL-Spalte
        // gilt als nicht freigegeben, wie im Bestand (`loanApi.ts:166`: `if (!device.loanable)`).
        if (!geraet.loanable) {
          throw new AusleihAbbruch(nichtVerfuegbar(rufname, { zustand: "NICHT_FREIGEGEBEN" }));
        }

        // 3. Der Zustand — `device_not_available` (`loanApi.ts:168`). Die Faltung ist
        // Fachlogik und wandert MIT TESTABDECKUNG mit (Spec:5268-5270); sie steht in
        // `_lib/status.ts:177-188` und hat dort ihre eigenen Faelle.
        const zustand = geraeteZustandAus(geraet.status);
        if (zustand !== "AVAILABLE") {
          const konflikt: Konflikt =
            zustand === "DEFECT" ? { zustand: "DEFECT" } : { zustand: "MAINTENANCE" };
          throw new AusleihAbbruch(nichtVerfuegbar(rufname, konflikt));
        }

        try {
          tx.insert(loans)
            .values({
              deviceId: geraeteId,
              // Der unveraenderliche Anzeige-Schnappschuss (`_db/schema.ts:201-205`).
              snapshotCallSign: rufname,
              snapshotSerialNumber: geraet.seriennummer,
              snapshotDeviceType: geraet.geraetetyp,
              borrowerName: e.entleiher,
              borrowedAt: jetzt,
              returnedAt: null,
              returnNote: null,
              zugangscodeId: e.zugangscodeId,
              createdAt: jetzt,
              updatedAt: jetzt,
            })
            .run();
        } catch (fehler) {
          if (!istUniqueVerletzung(fehler)) throw fehler;
          // `device_already_on_loan` (`loanApi.ts:180`) → `nicht-verfuegbar` mit
          // `betroffen[].status = "ON_LOAN"`; der Satz nennt Rufname UND Entleiher
          // (Spec:5199). Der Name wird erst JETZT nachgeschlagen — vor dem `INSERT` waere
          // es der `SELECT`, den Spec:3457-3464 verbietet.
          const aktiv = tx
            .select({ entleiher: loans.borrowerName })
            .from(loans)
            .where(and(eq(loans.deviceId, geraeteId), isNull(loans.returnedAt)))
            .get();
          throw new AusleihAbbruch(
            nichtVerfuegbar(rufname, {
              zustand: "ON_LOAN",
              // Konstruktiv vorhanden: die Verletzung bedeutet, dass es die Zeile gibt.
              // Der Rueckfall haelt den Satz grammatisch, falls sie zwischen `INSERT` und
              // `SELECT` zurueckgegeben wird.
              entleiher: aktiv?.entleiher ?? ENTLEIHER_UNBEKANNT,
            }),
          );
        }
      }
      return { ok: true, anzahl: e.geraeteIds.length, entleiher: e.entleiher };
    });
  } catch (fehler) {
    if (fehler instanceof AusleihAbbruch) return fehler.ergebnis;
    /*
     * ⛔ ALLES UEBRIGE WIRD ZU `unbekannt` UND NICHT WEITERGEWORFEN, und der Preis steht
     * hier: ein Programmierfehler in dieser Funktion erscheint dem Menschen als
     * Stoerungssatz statt als Absturz. Der Gegenwert ist die Zusage aus Spec:3458-3459 —
     * ein Wurf aus einer Server Action kommt in Produktion als anonymisierte Meldung an.
     * Der Fall, der ihn WIRKLICH ausloest, ist die Schreibsperre auf SQLite
     * (`_lib/meldungen.ts:406-413`), und die Zusage „Es wurde nichts gebucht." haelt, weil
     * der Wurf die Transaktion zurueckgerollt hat.
     */
    return ausleihAblehnung({ grund: "unbekannt" });
  }
}

/** Eine Ablehnung der Rueckgabe, mit dem Satz aus `_lib/meldungen.ts`. */
function rueckgabeAblehnung(meldung: RueckgabeMeldung): RueckgabeErgebnis {
  return { ok: false, grund: meldung.grund, text: rueckgabeText(meldung) };
}

/**
 * DIE RUECKGABE — ersetzt `PATCH /v1/loans/:loanId` (Spec:5027, §4.4).
 *
 * ⛔ ATOMAR UEBER `returned_at IS NULL` IN DER `WHERE`-KLAUSEL, nicht ueber ein `SELECT`
 * davor: nur die noch aktive Zeile wird angefasst, und ein Null-Zeilen-Update heisst „die
 * Leihe fehlt oder ist schon zurueck". 1:1 aus `returnLoan`
 * (`radio-admin/server/src/repos/loanRepo.ts:98-116`).
 *
 * ⛔ DIE ZEICHENGRENZE KOMMT AUS `_lib/meldungen.ts:88` UND WIRD NICHT NEU DEKLARIERT
 * (Auflage dort, `_lib/meldungen.ts:82-86`). Sie wird SERVERSEITIG erneut geprueft — das
 * `maxLength` am Feld ist eine Bequemlichkeit, keine Zusage (Spec:3583-3585).
 *
 * ⚠️ DIE NOTIZ WIRD NICHT UMGESCHRIEBEN (Spec:3587-3592): kein `sanitizeForDisplay`, kein
 * `trim()`. Geprueft wird die Laenge, gespeichert wird der Wert.
 */
export function bucheRueckgabe(
  db: DB,
  ausleiheId: string,
  notiz: string | null,
): RueckgabeErgebnis {
  if (notiz !== null && notiz.length > ZUSTANDSNOTIZ_MAX) {
    return rueckgabeAblehnung({ grund: "notiz-zu-lang" });
  }

  const jetzt = new Date();
  try {
    const ergebnis = db
      .update(loans)
      .set({ returnedAt: jetzt, returnNote: notiz, updatedAt: jetzt })
      .where(and(eq(loans.id, ausleiheId), isNull(loans.returnedAt)))
      .run();

    if (ergebnis.changes === 0) {
      const vorhanden = db
        .select({ rufname: loans.snapshotCallSign })
        .from(loans)
        .where(eq(loans.id, ausleiheId))
        .get();
      // `loan_already_returned` (409) gegen `loan_not_found` (404) — dieselbe
      // Unterscheidung wie im Bestand (`loanApi.ts:196-197`, Spec:5199-5200).
      return vorhanden
        ? rueckgabeAblehnung({ grund: "schon-zurueck", rufname: vorhanden.rufname })
        : rueckgabeAblehnung({ grund: "unbekannt-geworden" });
    }

    const zeile = db
      .select({ rufname: loans.snapshotCallSign })
      .from(loans)
      .where(eq(loans.id, ausleiheId))
      .get();
    // Konstruktiv vorhanden: das Update hat gerade eine Zeile geaendert.
    return { ok: true, rufname: zeile?.rufname ?? RUFNAME_UNBEKANNT };
  } catch {
    // Dieselbe Abwaegung wie bei `bucheAusleihe`; der Satz sagt hier zusaetzlich, dass die
    // RUECKGABE nicht gespeichert ist (`_lib/meldungen.ts:489-494`).
    return rueckgabeAblehnung({ grund: "unbekannt" });
  }
}

/**
 * ⛔ DIE GRENZEN STEHEN AUF `borrowedAt`, NICHT AUF `returnedAt` (`radio-admin/server/src/repos/loanRepo.ts:140-141`).
 * Eine Leihe, die VOR dem Fenster ausgeliehen und IM Fenster zurueckgegeben wurde, faellt
 * heraus — das ist die haeufigste Verwechslung dieser Signatur und hat einen eigenen Fall
 * (`_db/leihen.test.ts`, „filtert auf ein Zeitfenster ueber borrowedAt, nicht ueber returnedAt").
 *
 * ⛔ `Date`, NICHT `number` — und der Grund ist eine Einheitengrenze, die es hier gar nicht
 * erst geben soll. In der Quelle sind `from`/`to` epoch-MILLISEKUNDEN
 * (`radio-admin/shared/src/loan.ts:95-96`), im Ziel ist `loans.borrowed_at`
 * `integer(..., { mode: "timestamp" })` (`_db/schema.ts:218`), wo Drizzle ein `Date` nimmt und
 * gibt. Dieselbe Wahl wie B16 fuer den Importer (Spec:105): „`sekundenAusMs` liefert eine Zahl,
 * und eine Zahl ist in eine `mode: "timestamp"`-Spalte nicht einfuegbar." Damit steht der
 * Faktor nirgends im Ausdruck, weil er nirgends gebraucht wird.
 *
 * ⚠️ `geraeteId` WIRKT AUF WAHRHEIT, NICHT AUF `!== undefined` — 1:1 aus `loanRepo.ts:139`
 * (`if (params.deviceId)`), wo das Schema die leere Zeichenkette ohnehin ausschliesst
 * (`loan.ts:94`, `min(1)`). Eine leere Id filtert also nicht, statt nichts zu finden.
 *
 * ⛔ `seite` UND `seitenGroesse` SIND ZAHLEN, KEINE ZEICHENKETTEN — der Aufrufer faltet, bevor
 * er ruft. Der Aufrufer ist der Lesepfad aus Aufgabe V7, und dort kommen die zwei Werte aus
 * einem Suchparameter, also aus einer Zeichenkette. ⚠️ WAS EIN UNBRAUCHBARER WERT HIER TUT, IST
 * GEMESSEN UND NICHT VERMUTET (Sonde dieser Aufgabe, 2026-08-24, `BERICHT-V1.md`): vor der
 * Faltung unten lieferte `Number("zwei")` einen `NaN`-Deckel, better-sqlite3 band ihn als NULL,
 * und SQLite liest `LIMIT NULL` als KEINE GRENZE — die Antwort trug ALLE Zeilen der gefilterten
 * Menge in einer einzigen Seite. Deshalb faengt `ganzzahlOderVorgabe` unten den Fall, statt ihn
 * dem Aufrufer zu ueberlassen: „eine Regel, die nur im Client steht, ist keine Regel"
 * (Spec:3583-3585).
 */
export type LeihhistorieFilter = {
  geraeteId?: string;
  von?: Date;
  bis?: Date;
  /** 1-basiert. Vorgabe `SEITE_VORGABE`; kleinere Werte werden auf 1 gehoben. */
  seite: number;
  /** Vorgabe `SEITENGROESSE_VORGABE`, Deckel `SEITENGROESSE_MAX`. */
  seitenGroesse: number;
};

/**
 * Eine Zeile der Verwaltungs-Ausleihenliste: die SIEBEN Spalten der Alt-Liste
 * (`LoanList.tsx:16-46`) plus `id`, den Schluessel der Zeile (`LoanList.tsx:77`, `rowKey="id"`)
 * — acht Felder, in der Form, die ueber die RSC-Grenze darf.
 *
 * ⚠️ SIEBEN SPALTEN, NICHT ACHT: `id` ZEIGT DIE ALT-MASKE NICHT AN, sie schluesselt damit nur
 * die Zeile. Dieselbe Zaehlung fuehrt `KOPF.md:382` (Zeile V-L11). Korrigiert in der
 * Fix-Runde zu V1 (Fund F4); vorher stand hier „die acht Felder, die `LoanList.tsx:15-47`
 * anzeigt", und `:15-47` ist die Klammer des `columns`-Arrays, nicht sein Inhalt.
 *
 * ⛔ `rufname` UND `geraetetyp` KOMMEN AUS DEM SCHNAPPSCHUSS, NICHT AUS `devices`
 * (`_db/schema.ts:201-205`): „Die historische Richtigkeit traegt der unveraenderliche
 * Anzeige-Schnappschuss, der beim Ausleihen kopiert wird, nicht ein lebender Join. Ein
 * zusaetzlicher FK waere gueltiges Drizzle, gueltiges SQL und PARITAETSGRUEN; der Schaden
 * entstuende Monate spaeter, bei der ersten Geraeteausmusterung." Dieselbe Haltung wie bei
 * `offeneAusleihen` oben.
 *
 * ⛔ `ausgeliehenText` UND `zurueckText` SIND FERTIGE ZEICHENKETTEN, KEIN `Date` (§4.1 Punkt 1,
 * Spec:3338-3342): was an einer Uhr haengt, entsteht auf dem Server — sonst entscheiden Server
 * und Client an der Tagesgrenze verschieden, und gegen die Zone des Endgeraets systematisch.
 *
 * ⚠️ `geraetetyp` UND `notiz` BLEIBEN `null`, SIE WERDEN HIER NICHT AUF EINEN STRICH GEFALTET.
 * Der Alt-Bestand faltet alle drei Leerwerte in der Anzeige (`LoanList.tsx:21` fuer den
 * Geraetetyp, `:34` fuer die Rueckgabe ueber `formatTimestamp`, `:45` fuer die Notiz, die zwei
 * aeusseren je `render: (v) => v || '—'`) — hier faellt nur `zurueckText` darunter, weil er als einziger
 * ein `string` ist und seine Faltung eine ZEITFORMATIERUNG ist, die auf den Server gehoert
 * (`formatTimestamp(null)` in `radio-admin/client/src/utils/format.ts:2-4` tut beides in einer
 * Funktion). Die zwei uebrigen Striche sind reine Darstellung und gehoeren in die Insel.
 */
export type LeihZeile = {
  id: string;
  rufname: string;
  geraetetyp: string | null;
  entleiher: string;
  ausgeliehenText: string;
  zurueckText: string;
  aktiv: boolean;
  notiz: string | null;
};

/** Der Umschlag, 1:1 aus `ListLoansResult` (`loanRepo.ts:159`: `{ rows, total, page, pageSize }`). */
export type LeihhistorieSeite = {
  zeilen: LeihZeile[];
  gesamt: number;
  /** ⛔ DER GEHOBENE Wert, nicht der hereingereichte — siehe `leihhistorie`. */
  seite: number;
  /** ⛔ DER GEDECKELTE Wert, nicht der hereingereichte — siehe `leihhistorie`. */
  seitenGroesse: number;
};

/**
 * Die erste Seite — der VORGABEWERT und nur er. `radio-admin/shared/src/loan.ts:97`
 * (`default(1)`).
 *
 * ⛔ SIE IST NICHT DIE UNTERGRENZE UND NICHT DIE BASIS DER 1-INDIZIERUNG, auch wenn dieselbe
 * Ziffer dort steht: `min(1)` und `default(1)` sind im Bestand zwei getrennte Klauseln
 * (`loan.ts:97`), und die Basis des Offsets ist ein Literal (`loanRepo.ts:155`). Wer die drei
 * an einer Konstanten zusammenzieht, verschiebt beim naechsten Aendern der Vorgabe still die
 * Blaetterung (Fund F8 der Fix-Runde zu V1).
 */
export const SEITE_VORGABE = 1;

/**
 * Die Vorgabe-Seitengroesse. `radio-admin/shared/src/loan.ts:98` (`default(25)`).
 *
 * ⚠️ SIE STEHT HIER UND NUR HIER. Die Alt-Verwaltungsflaeche setzt daneben ihre eigene 20
 * (`LoanList.tsx:8`, `PAGE_SIZE`) und schickt sie mit (`useLoans.ts:18-23`) — die 25 ist die
 * Vorgabe des Servers fuer jeden Aufrufer, der KEINE schickt. Wer die 20 der Flaeche will,
 * reicht sie durch; eine zweite Zahl an einer zweiten Stelle laeuft auseinander.
 */
export const SEITENGROESSE_VORGABE = 25;

/**
 * Der Deckel der Seitengroesse. `radio-admin/shared/src/loan.ts:98` (`.max(1000)`), mit der
 * Begruendung woertlich an `loan.ts:89-91`: „The page-size ceiling matches radio-inventar's
 * existing history page size (1000) so the thin-client consumer is never rejected."
 */
export const SEITENGROESSE_MAX = 1000;

/**
 * Die Leerwert-Darstellung einer noch nicht erfolgten Rueckgabe. 1:1 aus `formatTimestamp`
 * (`radio-admin/client/src/utils/format.ts:2-4`: `if (!ms) return '—';`), das die Alt-Liste an
 * genau dieser Spalte ruft (`LoanList.tsx:34`).
 *
 * ⚠️ SIE STEHT HIER UND NICHT IN DER INSEL, weil sie an derselben Stelle entsteht wie die
 * Zeitformatierung daneben — `zurueckText` ist ein `string`, kein `string | null`, und ein
 * Aufrufer, der ihn ungeprueft anzeigt, bekommt nie ein leeres Feld. ⛔ FUER `geraetetyp` UND
 * `notiz` GILT DAS NICHT: die bleiben `null` und werden in der Flaeche gefaltet.
 */
const ZURUECK_OFFEN = "—";

/**
 * Ein Zahlenwert des Aufrufers, auf eine brauchbare Ganzzahl gebracht.
 *
 * ⛔ DER RUECKFALL IST DIE VORGABE, NICHT NULL UND NICHT DER ROHE WERT. `Math.trunc(NaN)` ist
 * `NaN`, `Math.max(1, NaN)` ebenfalls — die ganze Deckelkette laesst einen `NaN` unveraendert
 * durch, und das Ergebnis ist GEMESSEN eine unbegrenzte Abfrage (siehe `LeihhistorieFilter`
 * oben). Der Bestand loest dasselbe eine Ebene hoeher, mit `z.coerce.number().int().default(...)`
 * (`radio-admin/shared/src/loan.ts:97-98`); diese Ebene gibt es hier nicht mehr, also steht die
 * Faltung hier.
 */
function ganzzahlOderVorgabe(wert: number, vorgabe: number): number {
  return Number.isFinite(wert) ? Math.trunc(wert) : vorgabe;
}

/**
 * DIE LEIHHISTORIE DER VERWALTUNG — die SECHSTE und letzte Ersatzfunktion (Spec:5024,
 * Entscheidung E-V10). Mit ihr ist Bauabschnitt B der Reihenfolge-Auflage geschlossen
 * (Spec:5441-5486).
 *
 * ⛔ SIE ERSETZT ZWEI ALT-WEGE AUF EINMAL, und darum traegt sie den VOLLEN Vertrag, obwohl die
 * Alt-Verwaltungsflaeche heute nur `page`/`pageSize` schickt (`useLoans.ts:18-23`): der
 * Alt-Kiosk und die Alt-Verwaltung rufen DIESELBE Repo-Funktion `listLoans` mit DEMSELBEN
 * Schema (`radio-admin/server/src/routes/loans.ts:19-21` gegen
 * `radio-admin/server/src/routes/loanApi.ts:140-144`). Eine auf zwei Parameter verkuerzte
 * Signatur haette den Rest still verloren.
 *
 * ⛔ DAS FENSTER IST „AKTIV UND ZURUECKGEGEBEN" (`loanRepo.ts:136`) — anders als
 * `offeneAusleihen` oben, das auf `returned_at IS NULL` steht. Und ⛔ LESEN PURGT NICHT: die
 * Retention ist ein Job (`_lib/boot.ts:62`, `raeumeLeihhistorie`), kein Nebeneffekt eines
 * Lesepfads.
 *
 * ⛔ SORTIERT WIRD IMMER `desc(loans.borrowedAt)`, OHNE PARAMETER (`loanRepo.ts:153`). Eine
 * Sortierwahl waere eine Erweiterung ueber den Bestand hinaus und gehoert nicht in einen
 * 1:1-Posten.
 *
 * ⚠️ BENANNTE ABWEICHUNG VOM BESTAND: `seite` und `seitenGroesse` werden GEDECKELT UND
 * GEHOBEN, nicht abgelehnt. Der Bestand prueft sie in zod (`radio-admin/shared/src/loan.ts:97-98`,
 * `min(1)`/`max(1000)`), und zod WIRFT — die Route antwortet 400. Diese Funktion hat keinen
 * Antwortweg, auf dem ein 400 ankaeme: sie wird aus einer Server Component gerufen, wo ein
 * Wurf die ganze Seite kostet, und die zwei Zahlen kommen aus einem Suchparameter, den jeder
 * Mensch von Hand veraendern kann. Fuer GANZZAHLIGE Werte ist die angenommene Menge dieselbe
 * wie im Bestand; nur ausserhalb davon antwortet dieses Modul mit der naechsten gueltigen Seite
 * statt mit einem Fehler.
 *
 * ⚠️ ZWEITE BENANNTE ABWEICHUNG, GEMESSEN IN DER FIX-RUNDE ZU V1 (Fund F7): fuer einen
 * NICHT-ganzzahligen Wert weicht auch die ANGENOMMENE Menge ab. Der Bestand traegt ein
 * `.int()` (`radio-admin/shared/src/loan.ts:97-98`), das `pageSize=25.5` mit 400 ablehnt
 * (`radio-admin/server/src/routes/loans.ts:19-20` und `…/routes/loanApi.ts:141-142`, je
 * `if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)`); `ganzzahlOderVorgabe`
 * unten faltet ihn mit `Math.trunc` auf 25 und NIMMT ihn an. Das ist dieselbe Wahl wie oben —
 * diese Funktion hat keinen Antwortweg fuer ein 400 — und sie steht hier, damit sie nicht als
 * unbelegte Zusage im verfolgten Baum liegt.
 *
 * ⛔ DER GEDECKELTE WERT GEHT ZURUECK IN DEN UMSCHLAG, und zwar als DIESELBE Variable,
 * die als `limit` in die Abfrage geht — sonst zeigte die Blaetterung der Flaeche eine andere
 * Zahl an, als die Abfrage benutzt hat.
 */
export function leihhistorie(db: DB, f: LeihhistorieFilter): LeihhistorieSeite {
  // ⛔ DIE 1 IST HIER DIE UNTERGRENZE AUS `min(1)` (`radio-admin/shared/src/loan.ts:97`) UND
  // NICHT DIE VORGABE — dieselbe Form wie bei `seitenGroesse` darunter, wo `min(1)` und
  // `default(25)` ebenfalls zwei verschiedene Zahlen sind. `SEITE_VORGABE` steht nur noch fuer
  // das `default(1)`. Vorher trug die Konstante Untergrenze, Vorgabe UND die Basis der
  // 1-Indizierung unten auf einmal (Fund F8 der Fix-Runde zu V1).
  const seite = Math.max(1, ganzzahlOderVorgabe(f.seite, SEITE_VORGABE));
  const seitenGroesse = Math.min(
    SEITENGROESSE_MAX,
    Math.max(1, ganzzahlOderVorgabe(f.seitenGroesse, SEITENGROESSE_VORGABE)),
  );

  // Jede Bedingung einzeln und nur, wenn sie gesetzt ist — 1:1 aus `loanRepo.ts:137-142`.
  const bedingungen: SQL[] = [];
  if (f.geraeteId) bedingungen.push(eq(loans.deviceId, f.geraeteId));
  if (f.von !== undefined) bedingungen.push(gte(loans.borrowedAt, f.von));
  if (f.bis !== undefined) bedingungen.push(lte(loans.borrowedAt, f.bis));
  const wo = bedingungen.length > 0 ? and(...bedingungen) : undefined;

  // ⛔ DASSELBE `where` WIE DIE ZEILENABFRAGE (`loanRepo.ts:146`). `gesamt` zaehlt die
  // GEFILTERTE Menge, nicht die Seite und nicht die Tabelle — die Blaetterung der Flaeche
  // haengt an dieser Zahl.
  const gesamtZeile = db.select({ anzahl: count() }).from(loans).where(wo).get();

  const zeilen = db
    .select({
      id: loans.id,
      // Der unveraenderliche Anzeige-Schnappschuss, kein Join auf `devices`.
      rufname: loans.snapshotCallSign,
      geraetetyp: loans.snapshotDeviceType,
      entleiher: loans.borrowerName,
      ausgeliehen: loans.borrowedAt,
      zurueck: loans.returnedAt,
      notiz: loans.returnNote,
    })
    .from(loans)
    .where(wo)
    .orderBy(desc(loans.borrowedAt))
    .limit(seitenGroesse)
    // ⛔ DIE 1 IST DIE BASIS DER 1-INDIZIERUNG, KEIN VORGABEWERT — zeichengleich zum Bestand
    // (`loanRepo.ts:155`: `.offset((page - 1) * pageSize)`). Bewacht vom Fall „die zweite
    // Seite traegt die naechsten Zeilen" (`_db/leihen.test.ts`).
    .offset((seite - 1) * seitenGroesse)
    .all()
    .map((z) => ({
      id: z.id,
      rufname: z.rufname,
      geraetetyp: z.geraetetyp,
      entleiher: z.entleiher,
      ausgeliehenText: datumMitUhrzeit(z.ausgeliehen),
      // ⛔ `aktiv` IST GENAU `returnedAt === null` (`LoanList.tsx:11-13`, woertlich „derived
      // purely from `returnedAt`") — nie die Spalte `devices.status` und nie ein zweiter
      // Zustandsbegriff.
      zurueckText: z.zurueck === null ? ZURUECK_OFFEN : datumMitUhrzeit(z.zurueck),
      aktiv: z.zurueck === null,
      notiz: z.notiz,
    }));

  return { zeilen, gesamt: gesamtZeile?.anzahl ?? 0, seite, seitenGroesse };
}
