import type { CSSProperties } from "react";
import { SCHRIFT as SUITE } from "@/core/theme/schrift";

/**
 * ROLLEN STATT WERTE — SEIT 2026-08-12 EIN ADAPTER ueber `core/theme/schrift.ts`.
 *
 * KEIN "use client" (Falle 6): Server Components lesen diese Konstante — jede
 * der 23 Seiten setzt ihre Ueberschrift damit. Aus einem Client-Modul kaeme eine
 * Client-Referenz statt des Objekts, HTTP 500 fuer die ganze Seite.
 *
 * ⚠️ ANNAHME A-S1 IST ZURUECKGENOMMEN, UND ZWAR AUSDRUECKLICH.
 *
 * Hier stand: „DIE VERWALTUNG BEKOMMT GEIST — den Suite-Standard, ohne die drei
 * Google-Schriften des Bestands. Die Display-Rolle trug in der Verwaltung
 * Struktur, nicht Marke — und Struktur laesst sich mit Groesze, Gewicht,
 * Laufweite und Versalien ebenso ausdruecken."
 *
 * Das war richtig gedacht und ist ueberholt. Der Auftrag vom 2026-08-12 lautete,
 * die Anmutung des alten Lagerbuchs zurueckzuholen; die Suite laedt seither
 * Barlow Condensed als `--font-display`. Die Rueckname steht HIER und nicht nur
 * im Entwurf, weil eine stillschweigende Umkehr fuer den naechsten Leser nicht
 * von einem Versehen zu unterscheiden waere.
 *
 * A-S1 SELBST BLEIBT OFFEN und unberuehrt: sie sagt „die drei Schriften sind
 * KEINE CD-Vorgabe" (Betreiberfrage 29, unbeantwortet). Daraus folgte die
 * FREIHEIT, Geist zu waehlen — nie die Pflicht. Dieselbe Freiheit traegt jetzt
 * die andere Wahl. Und weil das hier Rollen sind und keine Schriftnamen, aendert
 * eine Antwort auf Frage 29 nur `app/globals.css`, nicht diese Datei.
 *
 * DIE NAMEN BLEIBEN. `SCHRIFT.titel`, `.abschnitt`, `.feldname` … stehen auf 23
 * Seiten; der Adapter ist die billigere Haelfte. Farbe traegt `core` bewusst
 * nicht — die Verwaltung rendert unter `.modul` und faerbt ueber `--lb-stahl`
 * am Verwendungsort.
 */

/**
 * DIE ZIFFERNSTELLUNG IST IN DIESEM MODUL EINE EIGENE ENTSCHEIDUNG.
 *
 * `core/theme/schrift.ts` legt `tabular-nums lining-nums` auf JEDE Rolle. Dieses
 * Modul hat die Frage enger entschieden (Kopf dieser Datei: „Pflicht, wo Ziffern
 * VERGLICHEN werden") und traegt sie nur auf `zahl` und `mono`. `lining-nums` ist
 * mit den Schriften dieser Suite ohnehin wirkungslos — Geist wie Barlow Condensed
 * setzen lining figures von Haus aus; die Angabe stammt aus dem Entwurf von
 * `feedback` und ist dort eine bewusste Absicherung, kein geteilter Vertrag.
 *
 * Wuerde die Suite-Angabe hier durchgereicht, muessten zwei Tests nachziehen, die
 * mit dieser Aufgabe nichts zu tun haben — darunter `ImportForm.test.tsx`, das
 * eine Zahlenspalte prueft und keine Typo-Leiter. Ein Test, den man anfassen muss,
 * obwohl sein Gegenstand unberuehrt ist, ist das Signal, dass die Aenderung falsch
 * geschnitten war.
 */
function ohneZiffernstellung(rolle: CSSProperties): CSSProperties {
  const { fontVariantNumeric: _suiteWert, ...rest } = rolle;
  return rest;
}

export const SCHRIFT: {
  titel: CSSProperties;
  abschnitt: CSSProperties;
  feldname: CSSProperties;
  text: CSSProperties;
  neben: CSSProperties;
  zahl: CSSProperties;
  mono: CSSProperties;
} = {
  /** Seitentitel. */
  titel: ohneZiffernstellung(SUITE.titel),
  /** Abschnittsueberschrift — ersetzte `.secthead` und `.cardtitle`. */
  abschnitt: ohneZiffernstellung(SUITE.kicker),
  /** Feldbeschriftung — ersetzte `.label`. Optisch gleich dem Abschnitt, und
   *  das ist Absicht: zwei Namen fuer eine Gestalt, weil sie an verschiedenen
   *  Orten verschieden gelesen werden und getrennt wandern duerfen. */
  feldname: ohneZiffernstellung(SUITE.kicker),
  /** Fliesztext und Tabelleninhalt. */
  text: ohneZiffernstellung(SUITE.text),
  /** Nebentext — ersetzte `.rowmeta small`, `.cardnote`, `.mainhead p`. */
  neben: ohneZiffernstellung(SUITE.neben),
  /**
   * Grosze Zahl — ersetzte `.bignum`, `.kpi b`, `.tbl .num`.
   * 24, NICHT die 30 der Suite-Rolle: die Verwaltung setzt sie in KPI-Kacheln
   * nebeneinander, und 30 sprengt dort die Zeile. 24 liegt auf antds Leiter.
   * `fontVariantNumeric` bewusst gepickt statt gespreadet — die enge Geltung
   * dieses Moduls (nur `zahl`/`mono`), s. o.
   */
  zahl: { ...ohneZiffernstellung(SUITE.zahl), fontSize: 24, fontVariantNumeric: "tabular-nums" },
  /**
   * Fachinformation in Mono — Fachnummern, Journalzeilen, Zugangs-Codes.
   * `fontVariantNumeric` bewusst gepickt statt gespreadet, s. o.
   */
  mono: { ...ohneZiffernstellung(SUITE.mono), fontVariantNumeric: "tabular-nums" },
};
