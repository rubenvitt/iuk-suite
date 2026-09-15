/**
 * Der bedingte Beschreibungstext für den begrenzten Historienausschnitt.
 *
 * ⚠️ ER TRAEGT DEN AMPEL-HINWEIS MIT (DRK-308). Die Zeilen dieser Liste zeigen
 * dieselben Chips wie die Detailseite („N Flasche(n) wechseln"), und sie sind
 * wie dort gegen die HEUTE geltenden Vorgaben gerechnet — verschiebt jemand den
 * Wechselwert einer Flasche, ändern sich die Zahlen alter Checks rückwirkend
 * mit. Auf der Detailseite stand dieser Vorbehalt schon, hier fehlte er: eine
 * Liste abgeschlossener Checks liest sich von selbst als Stand bei Abschluss.
 */
export function deckelText(gezeigt: number, mehrVorhanden: boolean): string {
  const ampel = "Verfall- und Sauerstoff-Ampel sind gegen die heute geltenden Vorgaben gerechnet.";
  return mehrVorhanden
    ? `Neueste 50 von mehr Treffern — Zeitraum eingrenzen · ${ampel}`
    : `${gezeigt} Treffer · ${ampel}`;
}
