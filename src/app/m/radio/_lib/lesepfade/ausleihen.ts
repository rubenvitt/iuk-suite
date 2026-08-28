// src/app/m/radio/_lib/lesepfade/ausleihen.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): reine Datenzugriffe, deren
// WERTE Server Components lesen. Der Scan, der beides fuer `_lib/` und `_db/` modulweit
// durchsetzt, steht in `src/app/m/radio/riegel.test.ts:909-962`.
//
// ⛔ NUR DER TYP DER VERBINDUNG, NIE EIN WERT-IMPORT: `_db/client.ts:19` zieht `@/core/db`, und
// das zieht `better-sqlite3` und `node:fs` (`src/core/db/index.ts:2-4`). Ein Wert-Import ist die
// Klasse, die `build` MAL faengt und mal nicht — und im Zweifel erst im echten Abruf.
import type { DB } from "../../_db/client";
import { geraeteMitLeihen, leihhistorie, type GeraetMitLeihe, type LeihZeile } from "../../_db/leihen";

/**
 * DIE AUSLEIHENLISTE DER VERWALTUNG (Planteil 4, Aufgabe V7).
 *
 * ⛔ SIE IST EIN DUENNER UMSCHLAG UND BAUT KEINE ZWEITE ABFRAGE. NS-A1
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md`): „Planteil 4 ergaenzt `leihhistorie(db, f)` in
 * DERSELBEN Datei — keine zweite." Ein Lesepfad, der die Tabelle selbst befragte, waere genau
 * das: gueltiges Drizzle, gueltiges SQL, und beim ersten Auseinanderlaufen der zwei Fassungen
 * eine stille zweite Wahrheit. `_lib/lesepfade/ausleihen.test.ts` setzt es als Quelltext-Scan
 * durch, nicht als Vorsatz.
 *
 * ⛔ ALLES, WAS UEBER DAS UEBERSETZEN HINAUSGEHT, STEHT IN `_db/leihen.ts` UND NICHT HIER: das
 * Fenster „aktiv und zurueckgegeben" (`radio-admin/server/src/repos/loanRepo.ts:136`), die feste
 * Sortierung (`loanRepo.ts:153`), die sieben Spalten der Alt-Liste
 * (`LoanList.tsx:16-46`) und die Faltung unbrauchbarer
 * Zahlen. Diese Datei uebersetzt Suchparameter in den Filter und reicht die Zeilen durch.
 *
 * ⛔ `db` IST DER ERSTE PARAMETER, IMMER. Vorbild `_lib/lesepfade/geraete.ts:34-37`.
 */

/**
 * Eine Zeile der Verwaltungs-Ausleihenliste. ⛔ SIE IST DIESELBE ZEILE wie die der
 * Datenfunktion — der Umschlag reicht sie durch und formt sie nicht um. Ein eigener Typ mit
 * eigenen Feldnamen waere eine zweite Abschrift der sieben Spalten und liefe beim naechsten
 * Feld auseinander.
 */
export type AusleihZeile = LeihZeile;

/**
 * Ein Eintrag des Geraetefilters. ⛔ DERSELBE TYP wie der der Datenfunktion — ein eigener
 * mit eigenen Feldnamen waere eine zweite Abschrift und liefe beim naechsten Feld auseinander.
 */
export type GeraetWahl = GeraetMitLeihe;

/**
 * Die Seitengroesse der Verwaltungsflaeche: ⛔ ZWANZIG, UND OHNE GROESSENWECHSLER
 * (`LoanList.tsx:8` `PAGE_SIZE = 20`, `:66` `showSizeChanger: false`).
 *
 * ⚠️ SIE IST NICHT DIE VORGABE DER DATENFUNKTION. Die ist 25 (`_db/leihen.ts`,
 * `SEITENGROESSE_VORGABE`, 1:1 aus `radio-admin/shared/src/loan.ts:98`) und gilt fuer jeden
 * Aufrufer, der KEINE Groesse schickt. Die Alt-Verwaltungsflaeche schickt eine
 * (`radio-admin/client/src/hooks/useLoans.ts:18-23`), und das ist die 20 — deshalb reicht dieser
 * Umschlag sie mit, statt sich auf die Vorgabe zu verlassen.
 *
 * ⛔ SIE KOMMT NICHT AUS EINEM SUCHPARAMETER. Der Bestand hat keinen Groessenwechsler; ein
 * Umschlag, der die Zahl aus der Adresse naehme, waere eine Erweiterung ueber den Bestand hinaus
 * und stuende ausserdem jedem offen, der die Adresse von Hand aendert.
 */
export const AUSLEIHEN_SEITENGROESSE = 20;

/**
 * Die Parameter der Flaeche.
 *
 * ⚠️ `seite` KOMMT ALS ZEICHENKETTE AUS DER ADRESSE, und die Faltung in eine Zahl gehoert
 * hierher: `_db/leihen.ts` sagt es woertlich im Kopf von `LeihhistorieFilter` — „der Aufrufer
 * faltet, bevor er ruft. Der Aufrufer ist der Lesepfad aus Aufgabe V7." Die GRENZEN der Zahl
 * (heben auf 1, deckeln) bleiben dort; hier steht nur die Umwandlung.
 *
 * ⛔ `von` UND `bis` SIND EIN `Date`, KEINE ZEICHENKETTE. Fuer das Format eines Datums in der
 * Adresse gibt es im Bestand keine Regel — die Alt-Flaeche schickt gemessen nur `page` und
 * `pageSize` (`useLoans.ts:18-23`). Ein hier erfundenes Format waere genau die plausibel
 * aussehende Erfindung, die dieser Planteil verbietet; die Normalisierung des Suchparameters
 * baut die Flaeche (V13/V16), die auch ihr Bedienelement traegt.
 *
 * ✅ DIE DREI FILTER HABEN SEIT AUFGABE V16 IHR BEDIENELEMENT. ⬜ V-L11 ist am 2026-08-24
 * entschieden — „Beides", nach Geraet UND Zeitraum
 * (`.superpowers/sdd/planteil4/progress.md`); die Flaeche traegt ein Auswahlfeld und zwei
 * Datumsfelder (`admin/(arbeit)/ausleihen/AusleihenTabelle.tsx`), die Normalisierung der
 * rohen Suchparameter steht in `_lib/suchparameter.ts` (`ausleihenParameterAus`) und NICHT in
 * einer zweiten Datei (Vorabscan-Fund F3). ⛔ Die 1:1-Untergrenze bleibt unangetastet:
 * Grundliste, Sortierung und Spalten bleiben, wie der Bestand sie hat, der Filter kommt HINZU.
 */
export type AusleihenParameter = {
  /** 1-basiert; roh aus der Adresse. Unbrauchbare Werte fallen auf die erste Seite. */
  seite?: string | number;
  /** ⛔ Wirkt auf WAHRHEIT, nicht auf `!== undefined` — 1:1 aus `loanRepo.ts:139`. */
  geraeteId?: string;
  von?: Date;
  bis?: Date;
};

/** Der Umschlag der Antwort — 1:1 die Form der Datenfunktion, mit der Zeile dieser Datei. */
export type AusleihenSeite = {
  zeilen: AusleihZeile[];
  gesamt: number;
  /** ⛔ DER GEHOBENE Wert, nicht der hereingereichte. */
  seite: number;
  /**
   * ⛔ DER BENUTZTE Wert — er geht in die Blaetterung, sonst zeigte sie eine andere Zahl an,
   * als die Abfrage benutzt hat.
   *
   * ⚠️ RICHTIGGESTELLT IN AUFGABE V16: hier stand „Insel 2 nimmt ihn nicht entgegen (ihr
   * Props-Vertrag ist bei drei geschlossen, `Spec:4504`)". Das gilt nicht mehr. Die
   * Betreiberentscheidung ⬜ V-L11 vom 2026-08-24
   * (`.superpowers/sdd/planteil4/progress.md`) verlangt einen Filter nach Geraet UND
   * Zeitraum; der Dreiervertrag kann ihn nicht tragen (Vorabscan-Fund F3,
   * `.superpowers/sdd/planteil4/VORABSCAN.md:126-150`). Insel 2 bekommt deshalb sechs Props,
   * `seitenGroesse` darunter — und die Blaetterung bleibt IN der Insel, weil dort der EINE
   * Schreibweg in die Adresszeile liegt (Vorbild `geraete/GeraeteTabelle.tsx`). Zwei
   * unabhaengige Schreiber derselben Adresse haetten keinen Eigentuemer fuer das
   * Zuruecksetzen auf Seite 1.
   */
  seitenGroesse: number;
};

/**
 * ⛔ EIN AUFRUF DER DATENFUNKTION UND SONST NICHTS. Alles unten ist Uebersetzung: aus der
 * Zeichenkette eine Zahl, aus den drei Filtern dieselben drei Filter, aus der Zeile dieselbe
 * Zeile.
 */
export function ausleihenListe(db: DB, p: AusleihenParameter): AusleihenSeite {
  return leihhistorie(db, {
    geraeteId: p.geraeteId,
    von: p.von,
    bis: p.bis,
    // `Number` ist die ganze Umwandlung, und die unbrauchbaren Werte laufen GEMESSEN ueber
    // ZWEI VERSCHIEDENE WAECHTER der Datenfunktion, nicht ueber einen: ein FEHLENDER oder ein
    // unsinniger Suchparameter wird `NaN` und faellt in `ganzzahlOderVorgabe` auf die Vorgabe
    // zurueck (`_db/leihen.ts:834-836`). Ein LEERER wird `Number("")` === 0 — `Number.isFinite(0)`
    // ist wahr, die Vorgabe greift also NICHT, und gehoben wird die 0 erst von der Untergrenze
    // `Math.max(1, ...)` (`_db/leihen.ts:887`). Beide enden auf der ersten Seite. Die Grenzen
    // stehen dort und nicht hier, weil „eine Regel, die nur im Client steht, keine Regel ist"
    // (`Spec:3583-3585`).
    seite: Number(p.seite),
    seitenGroesse: AUSLEIHEN_SEITENGROESSE,
  });
}

/**
 * DER OPTIONSVORRAT DES GERAETEFILTERS — ⛔ EIN DURCHREICHER, KEINE ZWEITE ABFRAGE. Dieselbe
 * Auflage wie bei `ausleihenListe` darueber (NS-A1), und derselbe Scan haelt sie: der erste
 * Fall in `_lib/lesepfade/ausleihen.test.ts` liest den ROHEN Dateitext dieser Datei.
 *
 * ⛔ ER STEHT HIER UND NICHT IN DER SEITE, damit die Verwaltungsflaeche ihre Daten wie jede
 * andere ueber `_lib/lesepfade/` bezieht (Vorbild `geraete/page.tsx`, das `geraeteListe` und
 * `vorschlaege` aus `_lib/lesepfade/geraete.ts` nimmt).
 *
 * ⛔ WARUM ES IHN GIBT: ⬜ **V-L11**, entschieden am 2026-08-24
 * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L11"). Die Begruendung, warum die
 * Menge aus den Leihzeilen und nicht aus der Geraetetabelle kommt, steht bei der Datenfunktion.
 */
export function geraeteAuswahl(db: DB): GeraetWahl[] {
  return geraeteMitLeihen(db);
}
