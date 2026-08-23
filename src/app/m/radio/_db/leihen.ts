// src/app/m/radio/_db/leihen.ts
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "./client";
import { devices, loans } from "./schema";
import { datumMitUhrzeit, uhrzeit } from "../_lib/anzeige";
import { normalisiereSuchtext } from "../_lib/filter";
import {
  ausleihText,
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
 * DIE FUENF LESE- UND SCHREIBPFADE DER AUSLEIHE (Spec 1 §6.1,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:5014-5027`; Feldform §4.12 Nr. 6,
 * `:4082-4088`). Sie ersetzen die sechs `/v1`-Routen des Alt-Masters durch Drizzle-Aufrufe
 * IM SELBEN PROZESS.
 *
 * ⛔ KEIN `"use client"`, KEIN `"use server"` — reine Datenzugriffe (Spec:5014). Die
 * `"use client"`-Haelfte setzt `src/app/m/radio/riegel.test.ts:924-977` modulweit durch; fuer
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
 * ⛔ DIE SECHSTE FUNKTION `leihhistorie` STEHT HIER NICHT. Sie speist ausschliesslich die
 * Verwaltungsansicht `/admin/ausleihen` (Spec:5024) und gehoert Planteil 4 (Entscheidung E2,
 * `.superpowers/sdd/planteil3/briefs/KOPF.md:539-542`).
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
 * `_lib/anzeige.ts` fuer den Namen ihres Formatierers und `_lib/meldungen.ts:384-389` fuer
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
   * ⬜ DIESE FUNKTION SETZT DEN DECKEL NICHT NOCH EINMAL, und das ist benannt statt still:
   * die Union `AusleihGrund` (`_lib/meldungen.ts:166`) hat keinen Zweig fuer „zu viele",
   * und einen zu erfinden waere ein achter `grund` gegen Entscheidung E13, die die
   * Vollzaehligkeitszahlen auf SIEBEN und SECHS festsetzt (`KOPF.md:775-778`). Wer den
   * Deckel auch hier durchsetzen will, braucht zuerst eine Betreiberentscheidung ueber den
   * Satz dazu.
   */
  geraeteIds: string[];
  /**
   * Der Name aus dem Formular, UNVERAENDERT (Spec:3587-3592): `sanitizeForDisplay` wandert
   * NICHT mit, und auch ein `trim()` auf dem Weg IN die Datenbank waere eine dauerhafte
   * Veraenderung der gespeicherten Zeichenkette — bei „Mueller & Sohn" ein Datenschaden,
   * kein Schutz. ⛔ GEPRUEFT WIRD NUR AUF NICHTLEERE (`trim().length === 0` → `kein-name`),
   * NICHT UMGESCHRIEBEN — und NICHT auf Laenge.
   *
   * ⬜ A-L17 — EINE LAENGENGRENZE FUER DEN ENTLEIHERNAMEN GIBT ES HIER NICHT, und das ist
   * benannt statt still. Der Alt-Bestand klemmt bei 100: `BORROWER_NAME_MAX: 100` in
   * `/Users/rubeen/dev/personal/drk/radio-admin/shared/src/loan.ts:5` (gemessen; die
   * Nachbarzeile `:6` deckelt die Rueckgabenotiz auf 500 — die HAT hier eine Entsprechung,
   * `ZUSTANDSNOTIZ_MAX` aus `_lib/meldungen.ts:88`). Sie faellt aus DEMSELBEN Grund wie der
   * Deckel 20 zwei Felder weiter oben: die Union `AusleihGrund` (`_lib/meldungen.ts:166`)
   * hat keinen Zweig fuer „zu lang", `kein-name` („Kein Name eingetragen") waere der
   * falsche Satz, und einen achten `grund` zu erfinden verbietet Entscheidung E13: sie
   * setzt die Vollzaehligkeitszahlen auf SIEBEN und SECHS fest
   * (`.superpowers/sdd/planteil3/briefs/KOPF.md:775-778`). ⚠️ DER PREIS: dies ist der
   * einzige ANONYME Schreibpfad des Moduls — ein beliebig langer Name landet ungekuerzt in
   * `loans.borrower_name` und von dort in jeden Satz, der ihn nennt. Wer die Grenze will,
   * braucht zuerst eine Betreiberentscheidung ueber den Satz dazu; A17 kann sie auf
   * FORMULAREBENE abfangen, wo es Feldfehler ohne `grund` gibt.
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
 * `verschwunden` verlangt trotzdem einen (`_lib/meldungen.ts:161`, Regel 1 aus Spec:3547:
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
 * (`_lib/meldungen.ts:375`). `RUFNAME_UNBEKANNT` steht fuer ein GERAET und ergaebe dort
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
 * (`_lib/meldungen.ts:348`) waere gebrochen, typkorrekt und lint-sauber. Der Wurf wird
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
     * (`_lib/meldungen.ts:341-348`), und die Zusage „Es wurde nichts gebucht." haelt, weil
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
    // RUECKGABE nicht gespeichert ist (`_lib/meldungen.ts:424-429`).
    return rueckgabeAblehnung({ grund: "unbekannt" });
  }
}
