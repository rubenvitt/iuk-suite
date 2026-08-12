import type { CSSProperties } from "react";

/**
 * DIE TYPO-ROLLEN DER SUITE — Rollen statt Werte (`docs/design/README.md`).
 *
 * WARUM SIE NACH `core` DURFTE: der Maszstab ist ein zweiter, heute
 * belegbarer Nutznieszer, und er lag zweifach im Repo. `feedback/_ui/typo.ts`
 * (`T`) und `lagerbuch/_lib/schrift.ts` (`SCHRIFT`) waren zwei unabhaengig
 * entstandene Fassungen derselben Sache — beide auf antds Leiter, beide mit
 * tabellarischen Ziffern, verschieden nur in den Namen. Keine Vermutung ueber
 * kuenftigen Bedarf, sondern eine bereits eingetretene Verdopplung. Beide sind
 * jetzt Adapter ueber dieser Datei und behalten ihre Namen.
 *
 * KEIN "use client" (Falle 6): Server Components lesen diese Konstante — die 23
 * Verwaltungsseiten des Lagerbuchs setzen ihre Ueberschrift damit. Aus einem
 * Client-Modul kaeme eine Client-Referenz statt des Objekts, HTTP 500 fuer die
 * ganze Seite, und Vitest koennte es strukturell nicht finden.
 *
 * KEINE NEUEN GROESZEN. Alle Werte liegen auf antds Leiter (12/14/16/20/24/30).
 * Der Charakter kommt aus den ANDEREN vier Achsen — Familie, Versalien und
 * Laufweite, Gewicht, Ziffernstellung. Genau so hat es das alte Lagerbuch
 * gemacht, dessen Anmutung hier zurueckkommt: es benutzte keine exotischen
 * Groeszen, sondern Barlow Condensed und ein durchgehendes Kicker-Muster.
 *
 * KEINE FARBE. Sie gehoert dem Traeger, nicht der Rolle: `feedback` faerbt
 * ueber `--fb-muted`, `lagerbuch` unter `.modul` ueber `--lb-stahl`, Shell und
 * Portal ueber `--iuk-gedaempft`. Eine Farbe hier muesste einem der drei
 * aufgezwungen werden. Wer Nebentext gedaempft braucht, setzt die Farbe am
 * Verwendungsort dazu.
 *
 * `lineHeight` steht nur dort, wo es eine Aussage traegt. Sonst gilt antds
 * Vorgabe — es wird kein Wert erfunden, den ein spaeterer Leser fuer geprueft
 * haelt.
 */

/**
 * Ziffern durchgehend tabellarisch: Zaehler, Mittelwerte und Datumsangaben
 * stehen in Tabellen und Karten untereinander — mit proportionalen Ziffern
 * wandert die Spalte bei jedem Wert.
 *
 * Exportiert fuer Stellen mit einer Groesze auszerhalb der Leiter (die
 * Notenplakette im Modul `feedback`, 40/700): sie brauchen die Ziffernstellung,
 * nicht die Groesze einer Rolle.
 */
export const ZIFFERN: CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" };

const DISPLAY = "var(--font-display)";
const MONO = "var(--font-mono)";

export const SCHRIFT: {
  titel: CSSProperties;
  unterTitel: CSSProperties;
  kicker: CSSProperties;
  zahl: CSSProperties;
  text: CSSProperties;
  neben: CSSProperties;
  mono: CSSProperties;
} = {
  /** 24/600 — Seitentitel, `<h1>`. */
  titel: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "0.02em",
    lineHeight: 1.2,
  },
  /** 20/600 — Abschnitt zweiter Ordnung; auch Wortmarke und Modultitel der Shell. */
  unterTitel: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "0.02em",
  },
  /** 12/600 versal — Kartentitel, Spaltenkoepfe, Feldbeschriftungen, Achsenlabel. */
  kicker: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  /** 30/700 — Zaehler und KPI-Werte. `lineHeight: 1`, damit die Zahl nicht schwebt. */
  zahl: {
    ...ZIFFERN,
    fontFamily: DISPLAY,
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1,
  },
  /** 14/400 — Fliesztext, Tabellenzellen. */
  text: { ...ZIFFERN, fontSize: 14, fontWeight: 400 },
  /** 12/400 — Metazeilen, Hilfetexte, Fristen. */
  neben: { ...ZIFFERN, fontSize: 12, fontWeight: 400 },
  /** 12/400 Mono — Journalzeilen, Zugangscodes, IDs, Fachnummern. */
  mono: { ...ZIFFERN, fontFamily: MONO, fontSize: 12, fontWeight: 400 },
};

export type SchriftRolle = keyof typeof SCHRIFT;
