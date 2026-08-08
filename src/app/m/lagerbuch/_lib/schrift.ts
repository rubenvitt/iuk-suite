import type { CSSProperties } from "react";

/**
 * ROLLEN STATT WERTE (Entscheidung 32, docs/design/README.md:149-152).
 *
 * KEIN "use client" (Falle 6): Server Components lesen diese Konstante — jede
 * der 23 Seiten setzt ihre Ueberschrift damit. Aus einem Client-Modul kaeme
 * eine Client-Referenz statt des Objekts, HTTP 500 fuer die ganze Seite.
 *
 * DIE VERWALTUNG BEKOMMT GEIST — den Suite-Standard, ohne die drei
 * Google-Schriften des Bestands. Die Display-Rolle trug in der Verwaltung
 * Struktur, nicht Marke — und Struktur laesst sich mit Groesze, Gewicht,
 * Laufweite und Versalien ebenso ausdruecken.
 *
 * ANNAHME A-S1: die drei Schriften sind KEINE CD-Vorgabe (Betreiberfrage 29,
 * unbeantwortet; das Repo enthaelt keinen Hinweis). Falls sie doch gebunden
 * sind, aendert sich nur die modul-lokale Schriftregistrierung; diese Rollen
 * bleiben unveraendert, weil sie Rollen und keine Schriftnamen sind.
 *
 * AUS 21 GROESZEN WERDEN SECHS. Alle liegen auf antds Leiter
 * (12/14/16/20/24/30); die Halbpixelwerte fallen. `tabular-nums` ist Pflicht,
 * wo Ziffern verglichen werden: IBM Plex Mono war bislang die einzige Quelle
 * fuer ihre Ausrichtung und faellt hier weg.
 */
export const SCHRIFT: {
  titel: CSSProperties;
  abschnitt: CSSProperties;
  feldname: CSSProperties;
  text: CSSProperties;
  neben: CSSProperties;
  zahl: CSSProperties;
  mono: CSSProperties;
} = {
  /** Seitentitel — ersetzt `.mainhead h1` (24px Barlow Condensed versal). */
  titel: {
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "0.02em",
    lineHeight: 1.2,
  },
  /** Abschnittsueberschrift — ersetzt `.secthead` und `.cardtitle`. */
  abschnitt: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  /** Feldbeschriftung — ersetzt `.label`. */
  feldname: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
  /** Fliesztext und Tabelleninhalt. */
  text: { fontSize: 14 },
  /** Nebentext — ersetzt `.rowmeta small`, `.cardnote`, `.mainhead p`. */
  neben: { fontSize: 12 },
  /** Grosze Zahl — ersetzt `.bignum`, `.kpi b`, `.tbl .num`. */
  zahl: {
    fontSize: 24,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
  /** Fachinformation in Mono — Fachnummern, Journalzeilen, Zugangs-Codes. */
  mono: {
    fontFamily: "var(--font-geist-mono)",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
};
