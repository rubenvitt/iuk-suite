// src/app/m/radio/_lib/geraeteFelder.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`): reine Namenslisten, die die
// Server Components UND die Client-Insel 1 lesen. Der Scan darueber steht in
// `src/app/m/radio/riegel.test.ts:909-962`.
//
// ⛔ UND KEIN IMPORT AUS `_db/` UND KEIN `drizzle-orm` — WEDER ALS WERT NOCH ALS TYP. Das ist
// der ganze Zweck dieser Datei, und die Regel steht im Modul schon woertlich
// (`_lib/csv/klassifizieren.ts:6-9`): „ein Wertimport aus `_db/` zoege Drizzle und
// `better-sqlite3` ins Browser-Bundle, und weder `typecheck` noch `lint` noch `build` saehen
// es." Der Waechter dagegen ist der Fall „keine Insel-Datei zieht _db/ oder drizzle-orm in den
// Browser" in `admin/(arbeit)/geraete/GeraeteTabelle.test.tsx`.

/**
 * DIE DREI SCHLUESSELLISTEN DER GERAETELISTE — die EINE Wahrheit fuer Server UND Insel.
 *
 * ⛔ WARUM SIE HIER STEHEN UND NICHT IN `_lib/lesepfade/geraete.ts`, wo sie bis V13 standen:
 * dort entstanden sie aus `Object.keys(...)` ueber Abbildungen auf Drizzle-SPALTEN. Wer sie
 * aus einer `"use client"`-Datei liest — und genau das tun die Feldauswahl und der
 * Suchparameter-Vertrag —, zieht damit die Tabellendefinitionen und `drizzle-orm` in das
 * Browser-Bundle: die Listen sind aus den Spaltenobjekten GERECHNET und deshalb nicht
 * wegoptimierbar.
 *
 * ⛔ DIE RICHTUNG IST DAMIT UMGEDREHT, UND DAS IST DIE VERBESSERUNG: frueher war die
 * Spaltenabbildung die Wahrheit und die Liste ihr Abfall; jetzt ist die Liste die Wahrheit und
 * die Abbildung wird gegen sie GEPRUEFT (`satisfies Record<Suchfeld, SQLiteColumn>` bzw.
 * `Record<Sortierspalte, SQLiteColumn>` in `_lib/lesepfade/geraete.ts:197`, `:254`). Ein
 * fehlender ODER ein ueberzaehliger Eintrag dort ist seitdem ein TYPFEHLER — vorher war beides
 * still moeglich.
 *
 * ⛔ `_lib/lesepfade/geraete.ts` EXPORTIERT SIE WEITER (`:224`, `:239`, `:273`). Jeder
 * bestehende Leser und jede bestehende Belegzeile bleibt gueltig; es gibt keine zweite Liste.
 */

/**
 * Die ZWOELF waehlbaren Suchfelder — die Namen werden NIE in SQL interpoliert
 * (`radio-admin/server/src/repos/deviceRepo.ts:123-138`, Kommentar `:123-124`: „NEVER
 * interpolate a client-supplied name into SQL").
 *
 * ⛔ WARUM DIESER POSTEN SCHAERFER IST ALS DER DER SORTIERUNG: ein unbekannter
 * Sortierschluessel faellt auf die Vorgabe zurueck und tut nichts. Ein unbekanntes SUCHFELD tut
 * etwas Schlimmeres — waehlt jemand ausschliesslich ein Feld, dessen Name hier nicht steht,
 * greift der Sicherheitszweig `sql\`0\`` (`deviceRepo.ts:168-172`) und die Suche liefert fuer
 * jeden Begriff KEINE Zeile. Schriebe die Flaeche `location` und diese Liste `lagerort`,
 * blieben typecheck, lint, build und jeder Test gruen, und die Geraeteliste waere fuer diese
 * Auswahl dauerhaft leer.
 *
 * Links der Suite-Name (der Feldname aus `GeraetZeile`); der Alt-Schluessel steht in
 * `_lib/lesepfade/geraete.ts:198-209` neben der Spalte, weil die Flaeche ihn heute im
 * Auswahlmenue fuehrt (`radio-admin/client/src/features/devices/SearchFieldPicker.tsx:5-18`).
 */
export const SUCHFELDER = [
  "rufname",
  "issi",
  "tei",
  "seriennummer",
  "zuordnung",
  "opta",
  "funktion",
  "geraeteTyp",
  "lagerort",
  "hersteller",
  "bedieneinheit",
  "hiorgId",
] as const;

/** Ein waehlbares Suchfeld. ⛔ Faellt aus der Liste ab — keine zweite Aufzaehlung. */
export type Suchfeld = (typeof SUCHFELDER)[number];

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
] as const satisfies readonly Suchfeld[];

/**
 * Die SIEBEN Spalten-Sortierschluessel, 1:1 aus `deviceRepo.ts:113-121`.
 *
 * ⛔ `lastUpdatedAt` UND `createdAt` STEHEN HIER, OBWOHL DIE OBERFLAECHE SIE NICHT ANBIETET.
 * Der Alt-Kommentar `deviceColumns.tsx:12-15` nennt nur sechs Schluessel — der Vertrag ist aber
 * der Code, den er beschreibt (Entscheidung E-V9,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:708-733`). Eine Suite, die nur sechs annaehme,
 * wuerfe eine gespeicherte Sortierung `lastUpdatedAt:desc` STILL weg. Beide behalten ihren
 * Quellnamen, weil `GeraetZeile` fuer sie keinen Feldnamen fuehrt.
 */
export const SORTIER_SPALTEN = [
  "rufname",
  "issi",
  "status",
  "lagerort",
  "softwareVersion",
  "lastUpdatedAt",
  "createdAt",
] as const;

/** Eine Sortier-SPALTE. ⛔ `updateStand` ist KEINE — er ist der SQL-Ausdruck-Sonderfall. */
export type Sortierspalte = (typeof SORTIER_SPALTEN)[number];

/**
 * Die ACHT annehmbaren Sortierschluessel: die sieben Spalten plus den Sonderfall `updateStand`
 * (der SQL-Ausdruck, `deviceRepo.ts:198-199`).
 *
 * ⛔ EIN UNBEKANNTER SCHLUESSEL IST KEIN FEHLER, sondern faellt still auf die Vorgabe
 * `desc(createdAt)` zurueck (`deviceRepo.ts:196-201`). Schriebe die Flaeche `location` und
 * diese Liste `lagerort`, blieben typecheck, lint, build und jeder Test gruen — und die
 * Sortierung taete einfach nichts.
 */
export const SORTIER_SCHLUESSEL: readonly string[] = [...SORTIER_SPALTEN, "updateStand"];

/**
 * Die VIER Geraetefunktionen, in der Reihenfolge des Bestands — ⛔ 1:1 aus
 * `radio-admin/shared/src/constants.ts:4` (`DEVICE_MODES`), gehalten von `constants.test.ts:6`
 * und `index.test.ts:19`.
 *
 * ⛔ DIE REIHENFOLGE HIER IST DIE KANONISCHE AUSGABEREIHENFOLGE — sie wird NICHT sortiert. Ein
 * `sort()` in `normalisiereModi` (`_lib/csv/klassifizieren.ts:203-215`) machte aus „TMO,DMO"
 * ein „DMO,TMO", und die Zelle saehe fuer jeden Leser anders aus als im Bestand.
 *
 * ⚠️ SIE STAND BIS ZUM NACHTRAG ZU V13 IN `_lib/csv/klassifizieren.ts:33` und wird VON DORT
 * weiterexportiert — jeder bestehende Leser und jede Belegzeile bleibt gueltig. Der Umzug hat
 * denselben Grund wie der der Schluessellisten oben: die Filterschublade der Insel 1 liest die
 * vier Zeichenketten, und ueber `klassifizieren.ts` haenge daran der ganze CSV-Teilbaum
 * (`geraeteDiff`, `rollen`, `csv/spalten`). Das war kein Bruch, aber unnoetiges Gewicht im
 * Browser-Bundle — und dieselbe Klasse eine Stufe milder.
 */
export const GERAETE_MODI = ["TMO", "DMO", "REP", "GAT"] as const;

/**
 * Die FUENF festen Statuswerte der Rohspalte, in der Reihenfolge des Bestands — ⛔ 1:1 aus
 * `radio-admin/shared/src/constants.ts:10-16` (`STATUS_OPTIONS`).
 *
 * ⛔ SIE SIND EINE ANZEIGE-OPTIONSLISTE UND KEINE SCHEMAGRENZE: weder der Alt-Bestand noch die
 * Suite begrenzen die Spalte serverseitig auf sie (`radio-admin/shared/src/schemas.ts:50-99`;
 * `admin/actions.ts:92-96` schreibt denselben Befund aus, und der Alt-Kommentar
 * `constants.ts:7-9` sagt es woertlich: „the `status` field is NOT constrained to these values
 * at the schema level"). Wer daraus einen Riegel machte, verlore jeden im Bestand gewachsenen
 * Wert beim naechsten Speichern.
 *
 * ⚠️ SIE SIND NICHT DIE VIER ZUSTAENDE AUS `_lib/status.ts:48`. Jene sind die abgeleitete
 * KIOSK-Sicht (`geraeteZustandAus`, `_lib/status.ts:177-188`); dies hier ist die Rohspalte, die
 * die Verwaltung pflegt (Entscheidung E-V14, `.superpowers/sdd/planteil4/briefs/KOPF.md:938-957`).
 *
 * ⛔ SIE IST DIE EINE KOPIE. ⬜ Aufgabe V14 baut die Statusauswahl des Formulars und liest sie
 * VON HIER — sie legt keine zweite an.
 */
export const STATUS_OPTIONEN = [
  "Einsatzbereit",
  "Defekt",
  "Ausgeliehen",
  "Wartung",
  "Sonstiges",
] as const;
