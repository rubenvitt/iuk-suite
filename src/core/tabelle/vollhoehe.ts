/**
 * DIE RECHNUNG HINTER „EINE SEITE, EIN SCROLLER" — als REINE Funktion,
 * absichtlich getrennt von der Komponente (DRK-334).
 *
 * Sie steht hier aus demselben Grund wie `masse.ts`: sie ist der Teil, der
 * still falsch sein kann, und in einer Client-Komponente wäre sie nur über
 * jsdom erreichbar — wo `getBoundingClientRect()` überall Nullen liefert und
 * keine Layoutbox gerechnet wird (Falle 13/14). Als Funktion von gemessenen
 * Zahlen auf gerechnete Zahlen ist sie vollständig prüfbar, ohne irgendetwas
 * zu rendern. Das Messen selbst bleibt der Komponente; nur ein echter Browser
 * kennt die Eingabewerte.
 *
 * KEIN "use client" (Falle 6).
 */

export type VollhoeheEingabe = {
  /** `window.innerHeight` — die SICHTBARE Höhe, nicht `100vh`. */
  fensterHoehe: number;
  /** Oberkante des Rahmens, der Werkzeugleiste und Tabelle zusammenfasst. */
  rahmenOben: number;
  /** Oberkante des Kastens, in dem die Tabelle steckt. */
  tabelleOben: number;
  /**
   * Höhe des Tabellen-KOPFES (`.ant-table-header`).
   *
   * ⚠️ DER TEIL, DEN MAN VERGISST, UND GENAU ER WAR DER FEHLER. `virtuell`
   * setzt `scroll.y`, und `scroll.y` ist die Höhe des KÖRPERS — der
   * Spaltenkopf kommt oben drauf. Wer „Fensterhöhe minus Oberkante" direkt als
   * `virtuell` durchreicht, baut eine Tabelle, die um genau eine Kopfzeile
   * höher ist als der Platz, den sie hat. Das Dokument bekommt dadurch einen
   * Scrollweg von ~50px — zu wenig, um als Fehler aufzufallen, und genug für
   * zwei Scrollbalken, von denen mal der eine, mal der andere reagiert.
   */
  tabellenkopfHoehe: number;
  /** Luft, die unten frei bleibt (der Innenabstand von `SuiteRahmen`). */
  rand: number;
  /** Unter dieser Körperhöhe lohnt die Tabelle nicht mehr. */
  mindestens: number;
};

export type VollhoeheErgebnis = {
  /** Höhe des Rahmens, als `--tab-vollhoehe`. */
  rahmenHoehe: number;
  /** Höhe des Tabellenkörpers, als `virtuell` (`scroll.y`). */
  koerperHoehe: number;
  /**
   * ⚠️ DIE NOTBREMSE. `true` heißt: der Platz reicht nicht für `mindestens`,
   * die Deckelung ist abzuschalten und die Seite darf wieder scrollen.
   *
   * Der Grund ist eine Abwägung, keine Vorsicht: wächst die Werkzeugleiste
   * über den Schirm — vier Zeilen umgebrochene Knöpfe, eine eingeblendete
   * Sammelleiste, ein Hinweis darüber —, dann schneidet ein Rahmen mit
   * `overflow: hidden` Bedienelemente ab, die niemand mehr erreichen kann.
   * Zwei Scrollbalken sind lästig; ein unerreichbarer Knopf ist kaputt.
   */
  gedeckelt: boolean;
};

/**
 * ⚠️ ABGERUNDET WIRD NACH UNTEN, UND DAS IST KEINE KOSMETIK. Ein halbes Pixel
 * zu viel ist ein Dokument mit Scrollweg — also genau der Zustand, den diese
 * Rechnung abschaffen soll. Ein halbes Pixel zu wenig ist unsichtbar.
 */
export function vollhoehe({
  fensterHoehe,
  rahmenOben,
  tabelleOben,
  tabellenkopfHoehe,
  rand,
  mindestens,
}: VollhoeheEingabe): VollhoeheErgebnis {
  const rahmenHoehe = Math.max(0, Math.floor(fensterHoehe - rahmenOben - rand));
  const koerperRoh = fensterHoehe - tabelleOben - tabellenkopfHoehe - rand;
  return {
    rahmenHoehe,
    koerperHoehe: Math.max(mindestens, Math.floor(koerperRoh)),
    gedeckelt: koerperRoh < mindestens,
  };
}
