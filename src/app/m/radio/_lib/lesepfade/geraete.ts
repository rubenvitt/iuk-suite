// src/app/m/radio/_lib/lesepfade/geraete.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): reine Datenzugriffe, deren
// WERTE Server Components lesen. Der Scan, der beides fuer `_lib/` und `_db/` modulweit
// durchsetzt, steht in `src/app/m/radio/riegel.test.ts:1064-1117`.
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  like,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { DB } from "../../_db/client";
import { devices, users, type Geraet } from "../../_db/schema";
import { datumMitUhrzeit } from "../anzeige";
import { berechneUpdateStand, type UpdateStand } from "../updateStand";
import { zielVersion } from "./versionen";

/**
 * DIE LESEPFADE DER GERAETEVERWALTUNG (Planteil 4, Aufgabe V6).
 *
 * Sie ersetzen `listDevices` (`radio-admin/server/src/repos/deviceRepo.ts:147-217`),
 * `getDeviceById` hinter `GET /devices/:id` (`radio-admin/server/src/routes/devices.ts:82-97`),
 * `listAllDevices` (`deviceRepo.ts:63-65`), den Vorschlags-Endpunkt
 * (`radio-admin/server/src/routes/suggestions.ts:20-34`) und die vier Kennzahl-Rundlaeufe der
 * Uebersicht (`radio-admin/client/src/hooks/useDashboardStats.ts:17-20`).
 *
 * ⛔ `db` IST DER ERSTE PARAMETER, IMMER, und keine Funktion hier holt sich die Verbindung
 * selbst — sonst ist sie im Test nicht gegen eine eigene Datei zu haengen, und `getModuleDb()`
 * waere dort ausserdem falsch: sein Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR`
 * (`src/core/db/index.ts:31-35`). Vorbild `_db/leihen.ts:30-35`, `_lib/lesepfade/versionen.ts:15-18`.
 */

/**
 * Eine Zeile der Geraeteliste — GENAU die zwanzig Felder aus
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:4542-4553`, woertlich uebernommen.
 *
 * ⛔ VORFORMATIERT UND SERIALISIERBAR, KEIN `Date`. Die Zeile geht als Prop an Insel 1
 * (`GeraeteTabelle.tsx`, V13); ein `Date` ueber diese Grenze ist verboten
 * (Bauform-Zulaessigkeitstafel Nr. 7, `.superpowers/sdd/planteil4/briefs/KOPF.md:320`).
 *
 * ⛔ KEINE AUDIT-SPALTE. `createdBy`/`updatedBy`/`updatedAt` gehoeren in `GeraetDetail`, den Typ
 * der Geraeteakte. Der Fall „GeraetZeile traegt genau die zwanzig Felder" in
 * `_lib/lesepfade/geraete.test.ts` ist der Waechter dagegen — er vergleicht den Feldsatz einer
 * ECHTEN Zeile, nicht eine zweite Liste, die mit der Projektion driften koennte.
 *
 * ⚠️ `status: string`, NICHT `GeraeteStatus` — das ist die ROHE Spalte (`_db/schema.ts:30`,
 * Freitext ohne `enum`), nicht die vier Zustaende aus `_lib/status.ts:48`. Entscheidung E-V14
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:938-957`) schreibt den Unterschied aus: die
 * Verwaltung ist die Maske, in der der Betreiber die Rohspalte pflegt.
 * ⛔ `geraeteZustandAus` (`_lib/status.ts:177-188`) WIRD HIER NICHT GERUFEN.
 *
 * ⚠️ BENANNTE ABWEICHUNG ZUR SPEC-ZEILE: `Spec:4544` schreibt `status: string`, die Spalte ist
 * aber nullable (`_db/schema.ts:30` traegt kein `.notNull()`). Der Nullwert wird deshalb hier auf
 * die LEERE ZEICHENKETTE gefaltet. Das kostet nichts Sichtbares: die Alt-Spalte rendert `status`
 * OHNE Rueckfall (`radio-admin/client/src/features/devices/deviceColumns.tsx:23` — `dataIndex`,
 * kein `render`), ein NULL erscheint dort also schon heute als leere Zelle.
 *
 * ⚠️ DIE VERWECHSLUNG IN DER SPALTENBESCHRIFTUNG IST ECHT UND WANDERT MIT. Die Alt-Spalte
 * „Letztes Update" zeigt `softwareVersion`, nicht ein Datum (`deviceColumns.tsx:34`:
 * `dataIndex: 'softwareVersion'`, `title: 'Letztes Update'`); dieselbe Beschriftung traegt auch
 * das Formularfeld (`DeviceFields.tsx:152`). Die Zeile fuehrt deshalb BEIDES: `softwareVersion`
 * roh und `letztesUpdateText` aus `lastUpdatedAt`.
 */
export type GeraetZeile = {
  id: string;
  issi: string;
  tei: string | null;
  rufname: string | null;
  opta: string | null;
  funktion: string | null;
  geraeteTyp: string | null;
  status: string;
  lagerort: string | null;
  hersteller: string | null;
  bedieneinheit: string | null;
  geraeteFunktionen: string | null;
  zuordnung: string | null;
  seriennummer: string | null;
  ausleihbar: boolean;
  alamos: boolean;
  softwareVersion: string | null;
  updateStand: UpdateStand;
  hatAbweichung: boolean;
  /**
   * Der vorformatierte Wert von `lastUpdatedAt`.
   *
   * ⛔ ER WIRD NICHT GERECHNET, und das ist Entscheidung E-V11 Punkt 3
   * (`.superpowers/sdd/planteil4/briefs/KOPF.md:802-806`): die Suite-Spalte IST bereits die
   * Zeichenkette `YYYY-MM-DD` (`_db/schema.ts:34-39`), waehrend der Alt-Bestand dort epoch-ms
   * fuehrt. Ein nachgebautes `new Date(wert)` waere gueltiges JS und ergaebe je nach Zone
   * denselben Tag oder den Vortag — „genau das ist der Posten, den ein 1:1-Reflex hier kaputt
   * macht".
   *
   * ⛔ DER NULLWERT WIRD ZUM GEDANKENSTRICH, 1:1 aus
   * `radio-admin/client/src/utils/format.ts:3` (`if (!ms) return '—';`) — der Alt-Formatierer
   * derselben Spalte in der Detailansicht (`DeviceDetailDrawer.tsx:87`).
   *
   * ⬜ WELCHE ANZEIGEFORM DER TAG BEKOMMT (`YYYY-MM-DD` oder `dd.MM.yyyy`), ENTSCHEIDET NICHT
   * DIESE DATEI. Entscheidung E-V11 Punkt 4 (`.superpowers/sdd/planteil4/briefs/KOPF.md:807-808`) legt die Umrechnung dieser
   * Spalte in EINE Funktion in `_lib/csv/spalten.ts`, damit Formular und `formatiereZelle` nicht
   * zwei Wahrheiten ueber denselben Tag fuehren. Eigentuemer ist die Aufgabe, die jene Datei
   * anlegt; bis dahin geht der Spaltenwert WOERTLICH durch. Ein hier erfundener Umbruch waere
   * die zweite Wahrheit, bevor die erste existiert.
   *
   * ⬜ UND EINE ZWEITE LEERSTELLE AN DERSELBEN NAHT, EIGENTUEMER V14: dieses Feld ist die
   * EINZIGE Spur von `lastUpdatedAt` in `GeraetDetail` — und es ist gefaltet. Insel 6 verlangt
   * `GeraetFormWerte` mit „`lastUpdatedAt` als `YYYY-MM-DD`"
   * (`docs/superpowers/plans/2026-08-24-radio-modul-plan4-grenze-verwaltung.md:3421`; der
   * Props-Vertrag der Insel selbst steht auf `Spec:4508`); wer ihre Werte aus
   * `letztesUpdateText` zieht, belegt den Datumswaehler bei JEDEM Geraet ohne Tag mit dem
   * Gedankenstrich. ⛔ V14 traegt `GeraetFormWerte` und holt den Rohwert dort, wo er roh steht
   * — dieser Typ wird dafuer NICHT verbreitert, weil `Spec:4542-4553` seine zwanzig Felder
   * abschliessend aufzaehlt und der Feldsatzabgleich sie bewacht.
   */
  letztesUpdateText: string;
};

/**
 * Die Geraeteakte — WEITER als `GeraetZeile` (`Spec:4542-4553` gegen `devices.ts:82-97`).
 *
 * ⛔ NICHT MIT `GeraetZeile` ZUSAMMENLEGEN. Sonst wandern die Audit-Spalten in jede Listenzeile,
 * und die Liste traegt Felder, die sie nie anzeigt.
 *
 * ⚠️ BENANNTE ABWEICHUNG VOM AUFGABENTEXT: der Brief nennt das Feld `zuletztAktualisiert`, hier
 * heisst es `zuletztAktualisiertText`. Grund: es ist eine FERTIGE Zeichenkette, kein `Date`
 * (Bauform-Zulaessigkeitstafel Nr. 7, `.superpowers/sdd/planteil4/briefs/KOPF.md:320`), und die Hausform benennt genau das mit dem
 * Anhang `Text` — `angelegtText` (`_lib/lesepfade/versionen.ts:44`), `letztesUpdateText` oben,
 * `zeitText` (`lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx:7-14`). Ein Name ohne den
 * Anhang laedt den naechsten Leser ein, dort ein `Date` zu erwarten.
 */
export type GeraetDetail = GeraetZeile & {
  notizen: string | null;
  updateAnmerkung: string | null;
  hiorgId: string | null;
  /** OIDC-`sub`, roh (`_db/schema.ts:62-64`). Alt-Name `createdBy` (`devices.ts:89-95`). */
  angelegtVon: string | null;
  /** Der ueber `users` aufgeloeste Name — ⛔ mit Rueckfall auf den rohen `sub`. */
  angelegtVonName: string | null;
  /** Alt-Name `updatedBy`. */
  geaendertVon: string | null;
  /** Alt-Name `updatedByName`, dieselbe Rueckfallregel. */
  geaendertVonName: string | null;
  zuletztAktualisiertText: string;
};

/**
 * Die Spalten, die die Freitextsuche treffen darf — ⛔ ZWOELF, und die Namen werden NIE in SQL
 * interpoliert (`deviceRepo.ts:123-138`, Kommentar `:123-124`: „NEVER interpolate a
 * client-supplied name into SQL").
 *
 * Links der Suite-Name (der Feldname aus `GeraetZeile`), rechts die Spalte; der Alt-Schluessel
 * steht daneben, weil die Flaeche ihn heute im Auswahlmenue fuehrt
 * (`radio-admin/client/src/features/devices/SearchFieldPicker.tsx:5-18`).
 */
const SUCHBARE_FELDER: Record<string, SQLiteColumn | undefined> = {
  rufname: devices.rufname, // rufname
  issi: devices.issi, // issi
  tei: devices.tei, // tei
  seriennummer: devices.serialNumber, // serialNumber
  zuordnung: devices.assignedTo, // assignedTo
  opta: devices.opta, // opta
  funktion: devices.funktion, // funktion
  geraeteTyp: devices.deviceType, // deviceType
  lagerort: devices.location, // location
  hersteller: devices.hersteller, // hersteller
  bedieneinheit: devices.bedieneinheit, // bedieneinheit
  hiorgId: devices.hiorgId, // hiorgId — kein Feld in `GeraetZeile`, deshalb der Quellname
};

/**
 * Die zwoelf waehlbaren Suchfelder als LESBARE Liste — ⛔ die EINE Wahrheit, aus der die
 * Feldauswahl der Flaeche (V13, Nachfolger von `SearchFieldPicker.tsx`) ihre Schluessel nimmt.
 *
 * ⛔ WARUM SIE EXPORTIERT IST, UND WARUM DIESER POSTEN SCHAERFER IST ALS DER DER SORTIERUNG:
 * ein unbekannter Sortierschluessel faellt auf die Vorgabe zurueck und tut nichts. Ein
 * unbekanntes SUCHFELD tut etwas Schlimmeres — waehlt jemand ausschliesslich ein Feld, dessen
 * Name hier nicht steht, greift der Sicherheitszweig `sql\`0\`` (`deviceRepo.ts:168-172`) und
 * die Suche liefert **fuer jeden Begriff KEINE Zeile**. Schriebe die Flaeche `location` und
 * diese Datei `lagerort`, blieben typecheck, lint, build und jeder Test gruen, und die
 * Geraeteliste waere fuer diese Auswahl dauerhaft leer.
 */
export const SUCHFELDER: readonly string[] = Object.keys(SUCHBARE_FELDER);

/**
 * ⛔ DIE SIEBEN VORGEWAEHLTEN SUCHFELDER, 1:1 aus `deviceRepo.ts:140` (und zeichengleich zur
 * Client-Kopie `SearchFieldPicker.tsx:21`, die der Alt-Kommentar `deviceRepo.ts:139`
 * ausdruecklich synchron halten will). In der Suite gibt es nur noch DIESE eine Liste.
 */
export const SUCHFELDER_VORGABE = [
  "rufname",
  "issi",
  "tei",
  "seriennummer",
  "zuordnung",
  "opta",
  "funktion",
] as const;

/**
 * Die Spalten-Sortierschluessel, 1:1 aus `deviceRepo.ts:113-121` — SIEBEN. Zusammen mit dem
 * Sonderfall `updateStand` (der SQL-Ausdruck, `deviceRepo.ts:198-199`) sind es die ACHT
 * annehmbaren Schluessel aus Entscheidung E-V9
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:708-733`).
 *
 * ⛔ `lastUpdatedAt` UND `createdAt` STEHEN HIER, OBWOHL DIE OBERFLAECHE SIE NICHT ANBIETET.
 * Der Alt-Kommentar `deviceColumns.tsx:12-15` nennt nur sechs Schluessel — der Vertrag ist aber
 * der Code, den er beschreibt. Eine Suite, die nur sechs annaehme, wuerfe eine gespeicherte
 * Sortierung `lastUpdatedAt:desc` STILL weg und fiele auf die Vorgabe zurueck, ohne dass es
 * jemand sieht. Beide behalten ihren Quellnamen, weil `GeraetZeile` fuer sie keinen Feldnamen
 * fuehrt.
 */
const SORTIERBAR: Record<string, SQLiteColumn | undefined> = {
  rufname: devices.rufname,
  issi: devices.issi,
  status: devices.status,
  lagerort: devices.location, // Alt-Schluessel `location`
  softwareVersion: devices.softwareVersion,
  lastUpdatedAt: devices.lastUpdatedAt,
  createdAt: devices.createdAt,
};

/**
 * Die acht annehmbaren Sortierschluessel als LESBARE Liste — ⛔ die EINE Wahrheit, aus der V13
 * seine URL-Schluessel nimmt.
 *
 * ⛔ WARUM SIE EXPORTIERT IST UND NICHT ZWEIMAL GESCHRIEBEN WIRD: ein unbekannter Schluessel ist
 * KEIN Fehler, sondern faellt still auf die Vorgabe zurueck (`deviceRepo.ts:196-201`). Schriebe
 * die Flaeche `location` und diese Datei `lagerort`, blieben typecheck, lint, build und jeder
 * Test gruen — und die Sortierung taete einfach nichts.
 */
export const SORTIER_SCHLUESSEL: readonly string[] = [...Object.keys(SORTIERBAR), "updateStand"];

/**
 * ⛔ DIE ACHT VORSCHLAGSFELDER, DIE EINE FLAECHE WIRKLICH BRAUCHT.
 *
 * ⚠️ UND DIE ZAHL IM PLANTEXT STIMMT NICHT, GEMESSEN: der Alt-Endpunkt fuehrt NEUN Felder
 * (`radio-admin/server/src/routes/suggestions.ts:8-18`) — die acht hier plus `status`. Das
 * Formular nutzt genau diese acht (`DeviceFields.tsx:76-127`; ⚠️ der Plan nennt `:76-121` und schneidet damit das achte Feld
 * `assignedTo` ab, das auf `:122-127` steht — selbst nachgemessen); `status` bleibt draussen, weil es
 * eine feste Optionsliste hat (`radio-admin/shared/src/constants.ts:10-16`). Ein neunter
 * Eintrag, den niemand liest, waere eine Abfrage je Seitenaufruf ohne Verbraucher.
 *
 * Die Reihenfolge ist die des Alt-Endpunkts (`suggestions.ts:9-17`), ohne `status`.
 */
export const VORSCHLAGSFELDER = [
  "rufname",
  "geraeteTyp",
  "lagerort",
  "zuordnung",
  "opta",
  "funktion",
  "hersteller",
  "bedieneinheit",
] as const;

export type Vorschlagsfeld = (typeof VORSCHLAGSFELDER)[number];

/** Feldname → Spalte, 1:1 zu `suggestions.ts:8-18` (ohne `status`, siehe oben). */
const VORSCHLAG_SPALTE: Record<Vorschlagsfeld, SQLiteColumn> = {
  rufname: devices.rufname,
  geraeteTyp: devices.deviceType,
  lagerort: devices.location,
  zuordnung: devices.assignedTo,
  opta: devices.opta,
  funktion: devices.funktion,
  hersteller: devices.hersteller,
  bedieneinheit: devices.bedieneinheit,
};

/**
 * ⛔ DIE EINE ABWEICHUNGS-BEDINGUNG, und sie traegt BEIDES: den Filter `hatAbweichung`
 * (`deviceRepo.ts:188`) und die Projektion `GeraetZeile.hatAbweichung`.
 *
 * ⛔ DIE LEERE ZEICHENKETTE ZAEHLT NICHT ALS ABWEICHUNG — `ne(updateNote, '')` steht im
 * Alt-Filter, und die Alt-Spalte rendert das Warnzeichen ueber die Wahrheitswertigkeit desselben
 * Feldes (`deviceColumns.tsx:25`: `d.updateNote ? … : null`), stimmt also mit ihm ueberein.
 * Waeren Filter und Projektion zwei Ausdruecke, koennte eine gefilterte Zeile mit
 * `hatAbweichung: false` zurueckkommen.
 */
const ABWEICHUNG = and(
  isNotNull(devices.updateNote),
  ne(devices.updateNote, ""),
) as SQL;

/** Die Abweichung als 0/1, damit Projektion und Filter denselben Ausdruck benutzen. */
const ABWEICHUNG_ZAHL = sql<number>`CASE WHEN ${ABWEICHUNG} THEN 1 ELSE 0 END`;

/**
 * ⛔ DER UPDATE-STAND ALS SQL — DIE ZWEITE HAELFTE VON ENTSCHEIDUNG E-V8
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:673-704`), 1:1 aus `deviceRepo.ts:153-156`.
 *
 * Die erste Haelfte ist `berechneUpdateStand` (`_lib/updateStand.ts:48-55`). Beide muessen
 * ueber JEDE Eingabelage dasselbe sagen; der Fall „der SQL-Ausdruck der Liste und
 * berechneUpdateStand stimmen ueber alle vier Eingabelagen ueberein" in
 * `_lib/lesepfade/geraete.test.ts` haelt sie gegeneinander. Der Alt-Kommentar sagt selbst, dass
 * genau das die Sorge war (`deviceRepo.ts:149-150`: „SQL expression mirroring
 * computeUpdateStatus(device, target)").
 *
 * ⛔ ER ENTSTEHT AN GENAU EINER STELLE UND WIRD VIERMAL BENUTZT: im `where` des
 * `updateStand`-Filters, im `orderBy`, in der Projektion der Liste und im `GROUP BY` der
 * Kennzahlen. Stuende der CASE-Text zweimal in dieser Datei, koennte eine Mutation die eine
 * Abschrift treffen, waehrend die andere jeden Test gruen haelt — das ist die Drift, gegen die
 * E-V8 gebaut ist.
 *
 * ⛔ DER DRITTE ZWEIG IST DER, DEN EIN NACHBAU FALSCH MACHT: ohne Zielversion faellt jede
 * nicht-leere Version auf „veraltet", nicht auf „unbekannt" (`deviceRepo.ts:151-152`).
 */
function updateStandAusdruck(ziel: string | null): SQL<UpdateStand> {
  return sql<UpdateStand>`CASE
    WHEN ${devices.softwareVersion} IS NULL THEN 'unbekannt'
    WHEN ${ziel} IS NOT NULL AND ${devices.softwareVersion} = ${ziel} THEN 'aktuell'
    ELSE 'veraltet' END`;
}

/**
 * Getrimmte, nicht-leere Werte einer Mehrfachauswahl — 1:1 zur Bedeutung von `csv()`
 * (`deviceRepo.ts:142-145`).
 *
 * ⚠️ DIE SUITE REICHT LISTEN, NICHT KOMMATEXTE. Der Alt-Weg lief ueber HTTP: die Flaeche
 * verband mit Komma (`radio-admin/client/src/hooks/useDevices.ts:40-42`), der Server spaltete
 * wieder auf. Ohne HTTP-Grenze entfaellt beides — die Semantik (trimmen, Leeres verwerfen,
 * leere Liste = KEIN Filter) bleibt zeichengleich, und genau sie traegt die Zusage „ein
 * geleerter Filter verschwindet aus der Abfrage" (`DeviceList.tsx:77-78`).
 */
function werte(liste?: string[]): string[] {
  return liste ? liste.map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Die zehn Filter, die Freitextsuche, die Sortierung und die Blaetterung der Geraeteliste —
 * 1:1 zu `ListParams` (`deviceRepo.ts:86-102`), mit den Feldnamen aus `GeraetZeile`.
 */
export type GeraetFilter = {
  /** Freitext; ohne ihn werden `suchfelder` gar nicht gelesen (`deviceRepo.ts:159`). */
  q?: string;
  /** Die gewaehlten Suchfelder; leer ⇒ die sieben Vorgabefelder (`deviceRepo.ts:162`). */
  suchfelder?: string[];
  updateStand?: UpdateStand;
  status?: string[];
  lagerort?: string[];
  geraeteTyp?: string[];
  funktion?: string[];
  hersteller?: string[];
  geraeteFunktionen?: string[];
  /** ⛔ Filtert NUR, wenn wahr — „nicht ausleihbar" ist nicht ausdrueckbar (`deviceRepo.ts:186`). */
  ausleihbar?: boolean;
  /** Dieselbe Regel (`deviceRepo.ts:187`). */
  alamos?: boolean;
  /** Dieselbe Regel (`deviceRepo.ts:188`). */
  hatAbweichung?: boolean;
  /** `schluessel:asc` oder `schluessel:desc`; unbekannt ⇒ Vorgabe (`deviceRepo.ts:196-201`). */
  sortierung?: string;
  /** 1-basiert (`deviceRepo.ts:192`). */
  seite?: number;
  /** Vorgabe 25, Deckel 200 (`deviceRepo.ts:193`); die Flaeche schickt 20 (`DeviceList.tsx:28`). */
  seitenGroesse?: number;
};

export type GeraeteSeite = {
  zeilen: GeraetZeile[];
  gesamt: number;
  seite: number;
  seitenGroesse: number;
};

/** Aus einer Datenbankzeile die vorformatierte Listenzeile. */
function zuZeile(d: Geraet, stand: UpdateStand, abweichung: boolean): GeraetZeile {
  return {
    id: d.id,
    issi: d.issi,
    tei: d.tei,
    rufname: d.rufname,
    opta: d.opta,
    funktion: d.funktion,
    geraeteTyp: d.deviceType,
    // Siehe die benannte Abweichung am Typ: `Spec:4544` fuehrt `string`, die Spalte ist nullable.
    status: d.status ?? "",
    lagerort: d.location,
    hersteller: d.hersteller,
    bedieneinheit: d.bedieneinheit,
    geraeteFunktionen: d.deviceModes,
    zuordnung: d.assignedTo,
    seriennummer: d.serialNumber,
    // `loanable` und `alamos_integrated` sind nullable 0/1-Integer (`_db/schema.ts:50`, `:55`);
    // die Zeile traegt sie als echte Wahrheitswerte, wie die Alt-Spalten sie lesen
    // (`deviceColumns.tsx:32-33`: `d.loanable ? … : null`).
    ausleihbar: d.loanable === true,
    alamos: d.alamosIntegrated === true,
    softwareVersion: d.softwareVersion,
    updateStand: stand,
    hatAbweichung: abweichung,
    letztesUpdateText: d.lastUpdatedAt ?? "—",
  };
}

/**
 * ERSETZT `listDevices` (`radio-admin/server/src/repos/deviceRepo.ts:147-217`), Regel fuer Regel.
 *
 * ⛔ JEDER DER ZEHN FILTER IST EINZELN ABGEBILDET. Der Alt-Client begruendet es namentlich
 * (`DeviceList.tsx:77-78`, woertlich): „Map every filter key explicitly (**not a spread**) so
 * that clearing a filter actually removes it from params." Ein Spread liesse einen geleerten
 * Filter stehen — die Liste bliebe gefiltert, und niemand saehe, warum.
 *
 * ⛔ DER UPDATE-STAND FILTERT UND SORTIERT IN SQL, VOR `LIMIT`/`OFFSET` (`:189`, `:199`). Wer
 * ihn erst danach in JavaScript rechnet, filtert und sortiert die falsche Seite: bei 25 Geraeten,
 * davon drei veraltet, und Seitengroesse 20 kaeme null statt drei.
 */
export function geraeteListe(db: DB, p: GeraetFilter): GeraeteSeite {
  const ziel = zielVersion(db);
  const standAusdruck = updateStandAusdruck(ziel);

  const bedingungen: SQL[] = [];

  if (p.q) {
    const begriff = `%${p.q}%`;
    const angefordert = werte(p.suchfelder);
    const spalten = (angefordert.length ? angefordert : [...SUCHFELDER_VORGABE])
      .map((f) => SUCHBARE_FELDER[f])
      .filter((s): s is SQLiteColumn => s != null);
    if (spalten.length) {
      const oder = or(...spalten.map((s) => like(s, begriff)));
      if (oder) bedingungen.push(oder);
    } else if (angefordert.length) {
      // ⛔ DER SICHERHEITSFALL, 1:1 aus `deviceRepo.ts:168-172` samt seinem Kommentar: waren ALLE
      // angeforderten Felder unbekannt, liefert die Abfrage KEINE Zeilen — „never interpolate
      // unknown names into SQL". Ein weggelassener Zweig gaebe stattdessen die UNGEFILTERTE
      // Liste heraus, und das ist die gefaehrliche Richtung.
      bedingungen.push(sql`0`);
    }
  }

  const inFilter = (spalte: SQLiteColumn, liste?: string[]) => {
    const w = werte(liste);
    if (w.length) bedingungen.push(inArray(spalte, w));
  };
  inFilter(devices.status, p.status);
  inFilter(devices.location, p.lagerort);
  inFilter(devices.deviceType, p.geraeteTyp);
  inFilter(devices.funktion, p.funktion);
  inFilter(devices.hersteller, p.hersteller);

  // ⛔ UND-VERKNUEPFUNG, NICHT ODER (`deviceRepo.ts:183-185`): zwei gewaehlte Geraetefunktionen
  // heissen „beide", nicht „eines von beiden". Die Spalte ist Klartext (`_db/schema.ts:47-49`),
  // deshalb je Token ein eigenes `LIKE`.
  for (const token of werte(p.geraeteFunktionen)) {
    bedingungen.push(like(devices.deviceModes, `%${token}%`));
  }

  // ⛔ NUR WENN WAHR (`deviceRepo.ts:186-187`). `ausleihbar: false` liefert ALLE Geraete — die
  // 1:1-Wahrheit: „nicht ausleihbar" ist in dieser Maske nicht ausdrueckbar.
  if (p.ausleihbar) bedingungen.push(eq(devices.loanable, true));
  if (p.alamos) bedingungen.push(eq(devices.alamosIntegrated, true));
  if (p.hatAbweichung) bedingungen.push(ABWEICHUNG);
  if (p.updateStand) bedingungen.push(eq(standAusdruck, p.updateStand));

  const wo = bedingungen.length ? and(...bedingungen) : undefined;

  const seite = Math.max(1, p.seite ?? 1);
  const seitenGroesse = Math.min(200, Math.max(1, p.seitenGroesse ?? 25));

  // ⛔ VORGABESORTIERUNG IST `desc(createdAt)`, NICHT `rufname` (`deviceRepo.ts:195`). Ein
  // unbekannter Schluessel laesst sie stehen — kein Fehler, keine Interpolation (`:196-201`).
  let ordnung: SQL = desc(devices.createdAt);
  if (p.sortierung) {
    const [feld, richtung] = p.sortierung.split(":");
    const spalte: SQLiteColumn | SQL<UpdateStand> | undefined =
      feld === "updateStand" ? standAusdruck : feld ? SORTIERBAR[feld] : undefined;
    if (spalte) ordnung = richtung === "desc" ? desc(spalte) : asc(spalte);
  }

  const gesamtZeile = db.select({ c: count() }).from(devices).where(wo).get();
  const gesamt = gesamtZeile?.c ?? 0;

  const zeilen = db
    .select({ d: devices, stand: standAusdruck, abweichung: ABWEICHUNG_ZAHL })
    .from(devices)
    .where(wo)
    .orderBy(ordnung)
    .limit(seitenGroesse)
    .offset((seite - 1) * seitenGroesse)
    .all()
    .map((r) => zuZeile(r.d, r.stand, r.abweichung !== 0));

  return { zeilen, gesamt, seite, seitenGroesse };
}

/**
 * `sub` → Anzeigename fuer die bekannten `sub`s — 1:1 aus `resolveUserNames`
 * (`radio-admin/server/src/repos/userRepo.ts:28-40`).
 *
 * ⛔ DIE LEERE EINGABE FRAEGT DIE DATENBANK NICHT. Der Alt-Kommentar nennt den Grund
 * (`userRepo.ts:25-26`): sonst entstuende das ungueltige `IN ()`, das SQLite zurueckweist. Ein
 * Geraet ohne beide Auditwerte ist der Normalfall (beide Spalten sind nullable,
 * `_db/schema.ts:62-64`), der Zweig also kein Randfall.
 */
function nutzernamen(db: DB, subs: string[]): Map<string, string> {
  const karte = new Map<string, string>();
  const eindeutig = [...new Set(subs)];
  if (eindeutig.length === 0) return karte;
  for (const z of db
    .select({ sub: users.sub, name: users.name })
    .from(users)
    .where(inArray(users.sub, eindeutig))
    .all()) {
    karte.set(z.sub, z.name);
  }
  return karte;
}

/**
 * ERSETZT den Handler hinter `GET /devices/:id`
 * (`radio-admin/server/src/routes/devices.ts:82-97`) — mit den drei Dingen, die er ZUSAETZLICH
 * zum reinen Lesen tut:
 *
 * 1. Der Update-Stand wird BERECHNET (`:86`) — hier ueber `berechneUpdateStand`
 *    (`_lib/updateStand.ts:48-55`), die TypeScript-Haelfte von E-V8.
 * 2. `createdBy`/`updatedBy` werden ADDITIV ueber `users` in Namen aufgeloest (`:89-95`),
 *    ⛔ mit Rueckfall auf den rohen `sub` — „so the field is never blank"
 *    (`radio-admin/server/src/routes/devices.ts:70-71` fuer dieselbe Regel auf den Ereignissen).
 *    ⛔ DIE ROHEN `sub`s BLEIBEN DANEBEN STEHEN (`:92`, das `...device`), sie werden nicht ersetzt.
 * 3. Fehlt das Geraet → `null` (`:84`). Die Seite ruft dann `notFound()`; ⛔ eine Fehlerseite
 *    waere die falsche Antwort.
 */
export function geraet(db: DB, id: string): GeraetDetail | null {
  const treffer = db
    .select({ d: devices, abweichung: ABWEICHUNG_ZAHL })
    .from(devices)
    .where(eq(devices.id, id))
    .get();
  if (!treffer) return null;

  const d = treffer.d;
  const stand = berechneUpdateStand(d.softwareVersion, zielVersion(db));
  const subs = [d.createdBy, d.updatedBy].filter((s): s is string => s != null);
  const namen = nutzernamen(db, subs);

  return {
    ...zuZeile(d, stand, treffer.abweichung !== 0),
    notizen: d.notes,
    updateAnmerkung: d.updateNote,
    hiorgId: d.hiorgId,
    angelegtVon: d.createdBy,
    angelegtVonName: d.createdBy != null ? (namen.get(d.createdBy) ?? d.createdBy) : null,
    geaendertVon: d.updatedBy,
    geaendertVonName: d.updatedBy != null ? (namen.get(d.updatedBy) ?? d.updatedBy) : null,
    zuletztAktualisiertText: datumMitUhrzeit(d.updatedAt),
  };
}

export type GeraeteKennzahlen = {
  gesamt: number;
  aktuell: number;
  veraltet: number;
  unbekannt: number;
};

/**
 * Die vier Kennzahlen der Uebersicht — ⛔ IN EINER ABFRAGE MIT `GROUP BY`, nicht in vier mit
 * `pageSize: 1`.
 *
 * Der Alt-Bestand fuehrt vier Rundlaeufe (`radio-admin/client/src/hooks/useDashboardStats.ts:17-20`),
 * und `Spec:4780-4784` sagt, warum das kein Vorbild ist: „Die vier Rundlaeufe waren eine Folge
 * der HTTP-Grenze, nicht der Fachlichkeit."
 *
 * ⛔ GRUPPIERT WIRD UEBER DENSELBEN AUSDRUCK WIE IN `geraeteListe` — nicht ueber eine zweite
 * Abschrift (E-V8). `updateStandAusdruck` ist die eine Quelle.
 *
 * ⛔ `gesamt` IST DIE SUMME UEBER ALLE GRUPPEN, NICHT `aktuell + veraltet + unbekannt`. Waere es
 * die Summe der drei, waere die Zusicherung „die vier Zahlen summieren sich auf gesamt" eine
 * Tautologie, die keine Mutation rot machen kann — und eine vergessene Kategorie fiele lautlos
 * durch. So faellt sie auf.
 */
export function geraeteKennzahlen(db: DB): GeraeteKennzahlen {
  const standAusdruck = updateStandAusdruck(zielVersion(db));
  const gruppen = db
    .select({ stand: standAusdruck, anzahl: count() })
    .from(devices)
    .groupBy(standAusdruck)
    .all();

  let gesamt = 0;
  const nachStand = new Map<string, number>();
  for (const g of gruppen) {
    gesamt += g.anzahl;
    nachStand.set(g.stand, g.anzahl);
  }

  return {
    gesamt,
    aktuell: nachStand.get("aktuell") ?? 0,
    veraltet: nachStand.get("veraltet") ?? 0,
    unbekannt: nachStand.get("unbekannt") ?? 0,
  };
}

/**
 * ERSETZT den Vorschlags-Endpunkt (`radio-admin/server/src/routes/suggestions.ts:20-34`).
 *
 * ⛔ EIN AUFRUF LIEFERT ALLE ACHT FELDLISTEN, nicht acht Aufrufe (`Spec:4599-4601`). Der
 * Alt-Client rief `useSuggestions(field)` je Feld einzeln — das war die HTTP-Grenze, nicht die
 * Fachlichkeit.
 *
 * Je Feld: `selectDistinct`, `isNotNull`, `orderBy(spalte)` (`suggestions.ts:26-31`) —
 * NULL-Werte fallen also heraus, und sortiert wird aufsteigend.
 */
export function vorschlaege(db: DB): Record<Vorschlagsfeld, string[]> {
  const ergebnis = {} as Record<Vorschlagsfeld, string[]>;
  for (const feld of VORSCHLAGSFELDER) {
    const spalte = VORSCHLAG_SPALTE[feld];
    ergebnis[feld] = db
      .selectDistinct({ v: spalte })
      .from(devices)
      .where(isNotNull(spalte))
      .orderBy(spalte)
      .all()
      .map((z) => z.v as string);
  }
  return ergebnis;
}

/**
 * ERSETZT `listAllDevices` (`radio-admin/server/src/repos/deviceRepo.ts:63-65`): ALLE Geraete,
 * `desc(createdAt)`, KEIN Filter, KEINE Blaetterung. Gelesen vom CSV-Export (V22).
 *
 * ⛔ HIER WAERE EIN `loanable`-FILTER DER FEHLER — und das ist der Gegenfall zu
 * `geraeteMitLeihstand` (`_db/leihen.ts`), wo sein FEHLEN der Fehler waere. Der Alt-Bestand
 * fuehrt zwei Leser nebeneinander: `listLoanableDevices` filtert (`:53-59`, „All devices flagged
 * loanable"), `listAllDevices` filtert nicht (`:62`, „All devices, newest-first. Backs the full
 * CSV export"). Ein Export, der stillschweigend nur die ausleihbaren Geraete traegt, ist ein
 * unvollstaendiger Datenbestand ohne Fehlermeldung.
 *
 * ⛔ ROHZEILEN, KEINE `GeraetZeile`: der Export braucht die 19 Quellspalten in ihrer
 * Rohform (`radio-admin/server/src/routes/export.ts:16-36`), nicht die vorformatierte
 * Listenzeile. Er laeuft serverseitig und ueberquert keine Insel-Grenze.
 */
export function geraeteFuerExport(db: DB): Geraet[] {
  return db.select().from(devices).orderBy(desc(devices.createdAt)).all();
}
