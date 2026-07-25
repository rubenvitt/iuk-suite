import type { CSSProperties } from "react";

/**
 * DIE TYPO-LEITER DES MODULS ALS DATEI (Entwurf §4.7).
 *
 * Sieben Rollen, fertige `CSSProperties` — damit es KEINE Ad-hoc-Schriftgroesse
 * irgendwo sonst im Modul gibt. Der Grund ist nicht Ordnungsliebe: sobald eine
 * Seite `fontSize: 13` erfindet, weil „das passt hier besser", entsteht eine
 * zweite Leiter, und zwei Leitern kann niemand mehr prueflich halten. Wer eine
 * Groesse braucht, die hier fehlt, aendert diese Datei — dann sehen es alle.
 *
 * Die Werte stammen wortgenau aus §4.7 (px/Gewicht) und sind ausschliesslich
 * antds eigene Leiter. `lineHeight` steht bewusst NICHT drin, wo der Entwurf
 * keine nennt: dann gilt antds Vorgabe, und es wird kein Wert erfunden, der
 * spaeter als „geprueft" gelesen wird.
 *
 * FARBE: nur `kicker` und `meta` tragen eine (`--fb-muted`), weil der Entwurf
 * genau dort eine nennt. Fliesstext erbt die Tinte — `--fb-ink` auf `--fb-card`
 * ergibt 15,5:1 (§4.14).
 *
 * WARUM `--fb-*` UND NICHT `--ant-*`: antd deklariert seine Variablen auf der
 * Scope-Klasse an den Wurzelelementen SEINER Komponenten, nicht auf `:root`.
 * Eigenes Markup sieht sie nie, `pnpm build` merkt das nicht, und die Schrift
 * verliert still ihre Farbe. Die eigenen Variablen stehen in `feedback.css`.
 */

/**
 * Ziffern durchgehend tabellarisch (§4.7): Ruecklaufzaehler, Notenmittel und
 * Datumsangaben stehen in Tabellen und Karten untereinander — mit
 * proportionalen Ziffern wandert die Spalte bei jedem Wert.
 *
 * Exportiert fuer die EINE Stelle mit einer Groesse ausserhalb der Leiter (die
 * Notenplakette, 40/700 laut §3.2): sie braucht die Ziffernstellung, nicht die
 * Groesse von `T.zahl` — die gehoert laut §4.7 allein dem Ruecklaufzaehler.
 */
export const ZIFFERN: CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" };

export const T = {
  /** 12/600, uppercase — Kartentitel, Spaltenkoepfe, Achsenlabel, Feld-Labels. */
  kicker: {
    ...ZIFFERN,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".12em",
    color: "var(--fb-muted)",
  },
  /** 12/400 — Metazeilen, Fristen, Hilfetexte, Feldfehler, Zeichenzaehler. */
  meta: { ...ZIFFERN, fontSize: 12, fontWeight: 400, color: "var(--fb-muted)" },
  /**
   * 14/400 — Fliesstext, Tabellenzellen, Fragetexte. Knoepfe tragen laut §4.7
   * dieselbe Groesse mit 600; das ist antds `Button`-Vorgabe und braucht keine
   * eigene Rolle (`{ ...T.body, fontWeight: 600 }` am Ort der Verwendung).
   */
  body: { ...ZIFFERN, fontSize: 14, fontWeight: 400 },
  /** 16/600 — Gruppenname auf Einstiegskarten, Kartenueberschrift 2. Ordnung. */
  lead: { ...ZIFFERN, fontSize: 16, fontWeight: 600 },
  /** 20/600 — Ueberschrift der Lagekarte, `Statistic` „Letzter Abend". */
  h2: { ...ZIFFERN, fontSize: 20, fontWeight: 600 },
  /** 24/600 — `<h1>`. */
  h1: { ...ZIFFERN, fontSize: 24, fontWeight: 600 },
  /** 30/600 — NUR der laufende Ruecklaufzaehler. Sonst nirgends. */
  zahl: { ...ZIFFERN, fontSize: 30, fontWeight: 600 },
} satisfies Record<string, CSSProperties>;

export type TypoRolle = keyof typeof T;
