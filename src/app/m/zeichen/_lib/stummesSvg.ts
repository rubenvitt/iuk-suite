// src/app/m/zeichen/_lib/stummesSvg.ts
// KEIN "use client" (Falle 6): die Funktion ist ein WERT, den auch eine Server
// Component lesen koennen muss. Aus einem Client-Modul kaeme dort eine
// Client-Referenz statt der Funktion — HTTP 500 fuer die ganze Seite, und weder
// `build` noch Vitest sehen es.

/**
 * MACHT EIN GENERAT-SVG STUMM — es zeigt sein Bild und verraet seinen Namen nicht.
 *
 * ⛔ WARUM ES DAS GEBEN MUSS. Gemessen an `_lib/katalog.generiert.json`
 * (2026-09-03, alle 246 Eintraege): JEDES SVG traegt ein `<title>`, ein `<desc>`
 * und ein `aria-labelledby`, das auf beide zeigt. Der `<title>` ist bei allen 246
 * byteidentisch mit `titel` und bei 240 mit `antwort`; der `<desc>` ist bei 232
 * byteidentisch mit `bedeutung` und ENTHAELT `bedeutung` bei allen 246. Im Quiz
 * (`_ui/QuizInsel.tsx`) sind genau `antwort` und `bedeutung` die Loesung — das
 * Bild trug die Antwort also im Klartext mit sich.
 *
 * ⛔ `aria-hidden` AM UMHUELLENDEN ELEMENT REICHT NICHT, und das ist der Grund,
 * warum diese Funktion neben dem Attribut steht statt an seiner Stelle:
 * `aria-hidden` wirkt auf den Barrierefreiheitsbaum, NICHT auf die
 * Browseroberflaeche. Ein `<title>` im SVG ist zugleich der native Tooltip beim
 * Ueberfahren mit der Maus — der bleibt stehen, egal was `aria-hidden` sagt. Die
 * zwei Massnahmen decken zwei verschiedene Lecks:
 *   * diese Funktion nimmt den TOOLTIP und den vorgelesenen Namen aus dem Bild,
 *   * `aria-hidden` am Umhuellenden nimmt das dann NAMENLOSE `role="img"` aus dem
 *     Baum, damit ein Bildschirmleser nicht „Grafik" ohne Beschriftung ansagt.
 * Wer nur eines von beiden setzt, hat die Haelfte behoben.
 *
 * ⛔ ZEICHENKETTEN-ARBEIT, KEIN DOM. Die Funktion laeuft im Server-Rendern, im
 * Browser und in Vitest; `DOMParser` gibt es nur an einer der drei Stellen. Die
 * Eingabe ist ausschliesslich das EINGECHECKTE Generat (`katalog.generiert.json`)
 * — kein vom Client geliefertes Markup (Spec §4.3). Sie ist deshalb ein
 * Aufraeumschritt fuer bekanntes Markup und ausdruecklich KEINE
 * Sicherheitsbereinigung; wer sie je auf fremdes SVG anwendet, braucht etwas
 * anderes.
 *
 * ⬜ WAS SIE NICHT ANFASST: `role="img"`, `viewBox`, Groessenattribute und die
 * Zeichnung selbst. Am Bild aendert sich nichts — `<title>` und `<desc>` werden
 * nicht dargestellt, und `aria-labelledby` hat keine Darstellung.
 */
export function stummesSvg(svg: string): string {
  return (
    svg
      // `<title>…</title>` und `<desc>…</desc>`, beide auch in leerer Form.
      .replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<(title|desc)\b[^>]*\/>/gi, "")
      // Der Verweis auf die eben entfernten Knoten. Bliebe er stehen, zeigte er
      // ins Leere — je nach Bildschirmleser auf den Rohtext der IDs.
      .replace(/\saria-labelledby\s*=\s*("[^"]*"|'[^']*')/gi, "")
  );
}
