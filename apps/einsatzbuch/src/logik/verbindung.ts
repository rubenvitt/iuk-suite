/**
 * Reine Logik der Anbindung an die Suite (Spec §8, Aufgabe der Stufe 5): Formatierung der
 * Fehlerbilder, die aus einem Feld des `Status` berechnet werden statt wörtlich aus Rust zu
 * kommen. Keine React-Abhängigkeit, kein `invoke`; die Zeitzone kommt als Parameter in jeden
 * Aufruf — nie ein `timeZone`-Literal auf Modulebene, sonst friert sie beim Import ein.
 *
 * Die meisten Fehlerbilder aus §8 sind wörtliche Rust-Meldungen (die `#[error]`-Texte in Kern
 * und Hülle) und brauchen hier keine Funktion — sie laufen unverändert durch
 * `App.tsx`s allgemeine Fehleranzeige. Nur die beiden Texte unten entstehen aus Feldern.
 */
import type { Ankerabweichung } from "../typen";

const ZEITPUNKT_MUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `status.stammdatenVom` → „Stammdaten vom 25.9.2026, 10:00“, in `zeitzone`. Anders als
 * `zeitpunktText` aus `@kern/zeit` ohne „Uhr“ (Vorlage: Kopf der Ansicht `istVerwaltung`).
 */
export function stammdatenVomText(vom: string, zeitzone: string): string {
  if (!ZEITPUNKT_MUSTER.test(vom) || Number.isNaN(new Date(vom).getTime())) {
    throw new Error(`Kein gültiger Zeitpunkt: ${vom}`);
  }
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: zeitzone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(vom));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  return `Stammdaten vom ${t.day}.${t.month}.${t.year}, ${t.hour}:${t.minute}`;
}

/**
 * `status.ankerAbweichung` bzw. `Ankerstand.abweichung` → „Anker weicht ab bei Block 5: erwartet
 * #1a2b3c4d, hier #99887766“ (Spec §8). Die Hashes kürzen wie überall in der Oberfläche
 * (`Versiegelt.tsx`) auf die ersten acht Hex-Zeichen.
 */
export function ankerAbweichungText(a: Ankerabweichung): string {
  return `Anker weicht ab bei Block ${a.block}: erwartet #${a.erwartet.slice(0, 8)}, hier #${a.gemeldet.slice(0, 8)}`;
}
