// src/app/m/radio/_lib/lesepfade/codes.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): ein reiner Lesepfad, den
// eine Server Component ruft. `src/app/m/radio/riegel.test.ts` setzt beides fuer `_lib/` und
// `_db/` modulweit durch (Block „keine Bauform-Direktive unter _lib/ und _db/").
import { asc, desc, inArray } from "drizzle-orm";
// ⛔ NUR DER TYP, NIE EIN WERT-IMPORT: `_db/client.ts` zieht `@/core/db`, und das zieht
// `better-sqlite3` und `node:fs` (`src/core/db/index.ts:2-4`). Dieselbe Auflage und dieselbe
// Bauform wie in `_lib/lesepfade/ereignisse.ts:6-9`.
import type { DB } from "../../_db/client";
import { users, zugangscodes } from "../../_db/schema";
import { datumMitUhrzeit } from "../anzeige";

/**
 * DIE ZUGANGSVERWALTUNG DER `/admin`-FLAECHE (Planteil 4, Aufgabe V20) — die Liste, die
 * `/admin/zugaenge` zeigt und aus der V21 das Druckblatt setzt.
 *
 * ⛔ SIE ERSETZT NICHTS, UND DAS IST GEMESSEN. Der Alt-Bestand kennt die Zugangscodes nicht:
 * `radio-admin/client/src/features/` fuehrt `dashboard`, `devices`, `import`, `loans`,
 * `settings`, `update` — und `/usr/bin/grep -ril "zugangscode\|accessCode"` ueber
 * `radio-admin/{client,server}/src` liefert NICHTS (beides am 2026-08-26 gefahren).
 * §5.6.1s Insel-Tabelle traegt fuer Insel 8 in der Spalte „erbt von" deshalb woertlich
 * „Kapitel 3" statt einer Alt-Datei (`.superpowers/sdd/planteil4/E1-spec-kapitel5.md:434`).
 * ⛔ ES GIBT HIER ALSO KEINE 1:1-VORLAGE — die Zusagen dieser Datei stammen aus dem
 * DATENMODELL (`_db/schema.ts:147-192`) und aus Spec 1 §3.2.3/§3.2.4 (`Spec:2172-2250`).
 *
 * ⚠️ **DIE AUSSAGE IST AUF `zugangscodes` BEGRENZT, UND DIESE EINGRENZUNG IST EINE KORREKTUR
 * AUS FIX-RUNDE 1** (REVIEW-V20, N4). Der Messanker oben sucht nach dem BEGRIFF; eine
 * STRUKTURELL verwandte Alt-Maske findet er damit nicht. Die naechstgelegene ist
 * `radio-admin/client/src/features/settings/ApiTokensPage.tsx` — eine Liste ausgestellter
 * Zugangsmittel mit Name, Praefix, Erstellt, Zuletzt genutzt, Status und Aktionen, mit
 * `Popconfirm`, in der WIDERRUFENE ZEILEN STEHEN BLEIBEN, und ihr Leser sortiert
 * `desc(createdAt)` (`radio-admin/server/src/repos/apiTokenRepo.ts:88`).
 * ⛔ SIE IST TROTZDEM KEINE 1:1-VORLAGE: anderes Objekt (die Token-Tabelle des Alt-Bestands,
 * GEHASHT gespeichert), und `Spec:4510` traegt fuer Insel 8 „erbt von Kapitel 3".
 * ⚠️ SIE STUETZT DIE WAHLEN DIESER DATEI ABER, statt ihnen zu widersprechen — Sortierung und
 * Verbleib der widerrufenen Zeile decken sich. Die zwei Abweichungen sind erklaert: der
 * Alt-Knopf traegt `danger` UND `size="small"`, beides in der Suite gesperrt (Falle 3,
 * Falle 4).
 *
 * ⛔ `db` IST DER ERSTE PARAMETER, IMMER, und diese Datei holt sich die Verbindung nie selbst
 * — sonst waere sie im Test nicht gegen eine eigene Datei zu haengen, und `getModuleDb()`
 * waere dort ausserdem falsch: sein Cache ist per MODULSCHLUESSEL gekeyt, nicht per
 * `DATA_DIR` (`src/core/db/index.ts:31-35`). Dieselbe Auflage traegt `_db/leihen.ts:32-35`.
 *
 * ⛔ DIE SERVER COMPONENT FORMATIERT, DIE INSEL RENDERT. `CodeZeile` unten traegt jeden Wert
 * fertig; Insel 8 (`admin/(arbeit)/zugaenge/CodeTabelle.tsx`) bekommt
 * `{ zeilen: CodeZeile[] }` (`Spec:4510`) und sonst nichts.
 *
 * ⛔ **DER KLARTEXT-CODE STEHT IN DER ZEILE — UND DAS IST DER GRUND FUER DIE ADMIN-STUFE DER
 * SEITE, NICHT IHRE KUER.** `Spec:2180-2182`: der Code „wird EINMAL zurueckgegeben und danach
 * in der Verwaltungsliste im Klartext angezeigt und gedruckt — er ist kein Einmalgeheimnis,
 * sondern ein Dauerausweis", und `Spec:2249-2250` zieht die Folge: „die Codeliste IST das
 * Geheimnis." ⚠️ Der Vorabscan hat den GROESSTEN Traeger benannt (Fund **F23**,
 * `.superpowers/sdd/planteil4/VORABSCAN.md:542-556`): nicht die Protokollzeile und nicht die
 * Fehlermeldung, sondern die **Props-Grenze** — die Zeilen werden als RSC-Nutzlast
 * serialisiert und stehen im ausgelieferten HTML JEDER `/admin/zugaenge`-Antwort. ⛔ DESHALB
 * DARF DIESE FUNKTION VON KEINER FLAECHE AUF EINER ANDEREN STUFE GERUFEN WERDEN; der
 * namentliche Waechter darueber ist der Fall „V20: admin/(arbeit)/zugaenge/page.tsx nennt
 * requireRadioAdmin und NICHT requireRadioVerwaltung" in `admin/actions.test.ts`.
 *
 * ⬜ **V20-L2 — DIESER SATZ IST HEUTE NUR EIN SATZ, UND DAS IST GEMESSEN** (REVIEW-V20, N6,
 * Fix-Runde 1): `/usr/bin/grep -rn "codesListe" src e2e` liefert genau EINEN Aufrufer,
 * `admin/(arbeit)/zugaenge/page.tsx`. Der genannte Waechter prueft den LITERALEN Pfad dieser
 * einen Seite — ⛔ NICHT DIE AUFRUFERKLASSE. Eine kuenftige `(arbeit)`-Flaeche, die
 * `codesListe` zoege, faellt durch kein Tor; nur V21s Druckblatt waere gedeckt, weil
 * `riegel.test.ts` fuer `(druck)` den strengen Zweig fuehrt (`riegel.test.ts:256-266`).
 * **Eigentuemer: V21** — dort entsteht der zweite Aufrufer, und die Zusicherung heisst dann
 * „wer `codesListe` importiert, nennt `requireRadioAdmin`".
 */

/**
 * ⛔ „nie eingeloest" IST EIN TEXT UND KEINE LEERE ZELLE (`_db/schema.ts:190-191`: „NULL =
 * 'nie eingeloest'. REINE ANZEIGE, ohne Einfluss auf Gueltigkeit"). Eine leere Zelle liesse
 * offen, ob der Wert fehlt oder ob die Spalte gar nicht gelesen wird.
 *
 * ⛔ ER STEHT HIER UND NICHT IN DER INSEL, weil diese Datei formatiert und die Insel rendert
 * — dieselbe Wahl und derselbe Ort wie `LEER` in `_lib/lesepfade/ereignisse.ts:118`.
 * ⛔ NICHT EXPORTIERT: es gibt keinen zweiten Verbraucher, und ein Export ohne einen solchen
 * ist im Modul ausdruecklich unerwuenscht (REVIEW-V17, Fund F4). Der Test schreibt den Satz
 * bewusst aus, statt ihn zu importieren — sonst pruefte er nur, dass eine Konstante gleich
 * sich selbst ist.
 */
const NIE_EINGELOEST = "nie eingelöst";

/**
 * Eine Zeile der Zugangsverwaltung — FUENF SPALTEN
 * (`.superpowers/sdd/planteil4/briefs/V20.md:33-34`): Bezeichnung, Code, Zustand, zuletzt
 * benutzt, Aktionen.
 *
 * ⛔ VORFORMATIERT UND SERIALISIERBAR, KEIN `Date` (Bauform-Zulaessigkeitstafel Nr. 7,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:320`; `Spec:4536-4539`) — was an einer Uhr
 * haengt, entsteht auf dem Server, sonst entscheiden Server und Browser an der Tagesgrenze
 * verschieden (`Spec:3341-3342`).
 *
 * ⛔ `aktiv` BLEIBT EIN WAHRHEITSWERT UND WIRD NICHT ZUM WORT VERDICHTET. Die Insel braucht
 * beides: das Wort fuer die Marke UND die Unterscheidung fuer den EINEN Knopf, der „Sperren"
 * oder „Entsperren" heisst. Traege die Zeile nur das Wort, muesste die Insel es
 * zurueckuebersetzen — und die Rueckuebersetzung ist die, die auseinanderlaeuft (derselbe
 * Gedanke wie bei `quelle`/`quelleWort` in `_lib/lesepfade/ereignisse.ts:131-137`).
 */
export type CodeZeile = {
  id: string;
  /** Der Anzeigename (`_db/schema.ts:170-174`). ⛔ HEISST `bezeichnung`, NICHT `label` (B6). */
  bezeichnung: string;
  /** ⛔ DER KLARTEXT. Siehe den Kopf dieser Datei — er ist der Grund der Admin-Stufe. */
  code: string;
  /** ⛔ DER EINZIGE WIDERRUF, DEN ES GIBT (`_db/schema.ts:180-183`). */
  aktiv: boolean;
  /** Vorformatiert; ⛔ LEER, wenn die Spalte `NULL` traegt — nie ein erfundener Zeitpunkt. */
  gesperrtAmText: string;
  /** Aufgeloester Name; Rueckfall = roher `sub`. ⛔ LEER, wenn die Spalte `NULL` traegt. */
  gesperrtVonText: string;
  /** Der rohe `sub`, ⛔ NUR fuer das `title`-Attribut — leer, wenn es keinen gibt. */
  gesperrtVonSub: string;
  /** Vorformatiert ODER `NIE_EINGELOEST` — ⛔ nie eine leere Zeichenkette. */
  zuletztText: string;
};

/**
 * `sub` → Anzeigename fuer die bekannten `sub`s — 1:1 aus `resolveUserNames`
 * (`radio-admin/server/src/repos/userRepo.ts:28-40`).
 *
 * ⛔ DIE LEERE EINGABE FRAEGT DIE DATENBANK NICHT. Der Alt-Kommentar nennt den Grund
 * (`userRepo.ts:25-26`): sonst entstuende das ungueltige `IN ()`. ⚠️ HIER IST DAS DER
 * NORMALFALL DER FLAECHE — solange kein Zugang gesperrt ist, gibt es keinen `sub`
 * aufzuloesen.
 *
 * ⚠️ DIESELBEN ZWOELF ZEILEN STEHEN AUSSERDEM IN `_lib/lesepfade/ereignisse.ts:171-183` UND
 * IN `_lib/lesepfade/geraete.ts:601-611` — mit dieser hier sind es DREI. Das ist bewusst so
 * gelassen und keine Nachlaessigkeit: eine gemeinsame Datei waere ein fuenfter Baustein in
 * einer Aufgabe, die vier vorsieht (die Begruendung steht seit V7 an der ersten Kopie,
 * `_lib/lesepfade/ereignisse.ts:165-170`), und die Wiederholung ist mechanisch — alle drei
 * bilden denselben Alt-Rumpf ab und haben keinen eigenen Ermessensspielraum, der
 * auseinanderlaufen koennte.
 * ⚠️ **DIE ZAEHLUNG IN DER ERSTEN KOPIE IST IN FIX-RUNDE 1 NACHGEZOGEN** (REVIEW-V20, N3):
 * `_lib/lesepfade/ereignisse.ts:165` sagte „EIN ZWEITES MAL" und meinte damit zwei; sie nennt
 * jetzt beide Nachbarn. ⛔ NUR DIESE EINE STELLE TRUG DIE ZAHL — gemessen mit
 * `/usr/bin/grep -n "ZWEITES MAL" _lib/lesepfade/geraete.ts` → kein Treffer am Kopf von
 * `nutzernamen` (`geraete.ts:592-599`), REVIEW-V20s N3 nennt faelschlich beide Kopien.
 *
 * ⛔ UND WARUM DIE AUFLOESUNG HIER UEBERHAUPT ETWAS KAUFT, anders als bei den per CSV
 * importierten Ereigniszeilen: `gesperrt_von` traegt den `sub` einer LEBENDEN Suite-Sitzung
 * (`_actions/codes.ts:121-133`), und derselbe Aufruf hat die Person eine Anweisung vorher in
 * `users` eingetragen — `setzeCodeAktiv` ruft als erste Anweisung `requireRadioAdmin()`, und
 * `riegelAufStufe` schreibt `merkeNutzer(getDb(), viewer)` (`_lib/zugang.ts:459-470`). Der
 * lokale Seed legt die Zeile ausdruecklich an, „damit die sechs Auditspalten einen Namen
 * aufloesen" (`_lib/seedLokal.ts:102-104`).
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
 * DIE VERWALTUNGSLISTE UEBER `zugangscodes` — ⛔ VOLLSTAENDIG, OHNE FILTER UND OHNE
 * BLAETTERUNG.
 *
 * ⛔ EIN GESPERRTER ZUGANG BLEIBT IN DER LISTE, und das ist die tragende Zusage dieser
 * Funktion, nicht eine Auslassung. `_db/schema.ts:180-183`: „DER EINZIGE WIDERRUF, DEN ES
 * GIBT. Ein Import oder ein Seed, der alles als aktiv anlegt, reaktiviert still jeden
 * gesperrten Code." Ein `where(eq(aktiv, true))` hier machte die gesperrten Zeilen
 * unsichtbar — und damit `gesperrt_am`/`gesperrt_von` sinnlos, die genau deshalb existieren,
 * „WEIL die Zeile dauerhaft in der Liste steht" (`:184-187`).
 *
 * ⛔ KEINE BLAETTERUNG UND KEINE GRENZE. Die Tabelle liegt in der Groessenordnung „Zahl der
 * Aufsteller" — das schreibt das Schema an derselben Stelle aus, an der es den Index auf
 * `aktiv` ablehnt (`_db/schema.ts:193-195`). Eine Blaetterung ueber einer solchen Liste
 * schnitte das Druckblatt aus V21 in Seiten.
 *
 * ⛔ SORTIERUNG: `desc(createdAt)`, Gleichstand ueber `asc(id)`. ⚠️ SIE IST EINE BENANNTE
 * WAHL DIESER AUFGABE UND KEIN PORT — es gibt keine Alt-Liste (siehe Dateikopf), und der
 * Auftragsbrief nennt keine (`.superpowers/sdd/planteil4/briefs/V20.md:20-29`). Der neueste
 * Zugang steht oben, weil er der ist, den jemand gerade ausgestellt hat und sucht.
 * ⛔ DER ZWEITE SCHLUESSEL KAUFT DETERMINISMUS, NICHT RICHTIGKEIT: `created_at` ist ein
 * SEKUNDENstempel (`_db/schema.ts:187`), zwei in derselben Sekunde ausgestellte Zugaenge sind
 * moeglich, und ohne den Gleichstandsbrecher antwortete derselbe Bestand je nach
 * Speicherlage verschieden. Dieselbe Unterscheidung und dieselbe Formulierung wie im Kopf von
 * `zielVersion` (`_lib/lesepfade/versionen.ts`).
 */
export function codesListe(db: DB): CodeZeile[] {
  const roh = db
    .select({
      id: zugangscodes.id,
      bezeichnung: zugangscodes.bezeichnung,
      code: zugangscodes.code,
      aktiv: zugangscodes.aktiv,
      gesperrtAm: zugangscodes.gesperrtAm,
      gesperrtVon: zugangscodes.gesperrtVon,
      lastUsedAt: zugangscodes.lastUsedAt,
    })
    .from(zugangscodes)
    .orderBy(desc(zugangscodes.createdAt), asc(zugangscodes.id))
    .all();

  // Ein Rundlauf fuer alle Namen, nicht einer je Zeile — dieselbe Form wie
  // `_lib/lesepfade/ereignisse.ts:225-232`.
  const namen = nutzernamen(
    db,
    roh.map((z) => z.gesperrtVon).filter((sub): sub is string => sub !== null),
  );

  return roh.map((z) => ({
    id: z.id,
    bezeichnung: z.bezeichnung,
    code: z.code,
    aktiv: z.aktiv,
    // ⛔ KEIN `?? new Date(0)` UND KEIN ERFUNDENER ZEITPUNKT. Der Praezedenzfall dieses Wegs
    // ist vernarbt (B7 im Ausfuehrungsplan, im Ledger zitiert:
    // `.superpowers/sdd/planteil4/progress.md`, Abschnitt „V-L6", Punkt 2) — ein Rueckfall
    // auf die Epoche haette dort jede aktive Leihe zu einer 1970 zurueckgegebenen gemacht.
    // Fehlt die Angabe, steht nichts da; die Insel zeigt dann die Marke ohne Zusatz.
    gesperrtAmText: z.gesperrtAm === null ? "" : datumMitUhrzeit(z.gesperrtAm),
    // Rueckfall = roher `sub`, „so the field is never blank" (`devices.ts:70-71`, im Modul
    // schon zweimal so gebaut); ohne jeden Wert bleibt der Text leer.
    gesperrtVonText:
      z.gesperrtVon === null ? "" : (namen.get(z.gesperrtVon) ?? z.gesperrtVon),
    gesperrtVonSub: z.gesperrtVon ?? "",
    zuletztText: z.lastUsedAt === null ? NIE_EINGELOEST : datumMitUhrzeit(z.lastUsedAt),
  }));
}
