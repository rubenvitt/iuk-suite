import { DRK } from "@/core/theme/tokens";

/**
 * Geteilte Inline-Style-Bausteine fuer Stellen, die ausserhalb von antds
 * Token-System liegen (native Elemente, Server-Komponenten ohne `X.Y`-Zugriff
 * auf antd-Compounds — siehe die Kommentare in admin/page.tsx).
 */

/**
 * Die Rahmenfarbe der Suite als CSS-Variable statt eingebettetem Hex-Wert.
 *
 * `buildTheme` (src/core/theme/theme.ts) setzt `cssVar: { key: "iuk" }` — das
 * bestimmt aber nur den SELEKTOR, unter dem antd die Variablen ablegt, nicht
 * ihren Namen. Der Name haengt an `cssVar.prefix`, das dort nicht gesetzt ist
 * und darum auf antds Vorgabe "ant" faellt: die Variable heisst zur Laufzeit
 * `--ant-color-border`, nicht `--iuk-color-border`. Eine an drei Stellen
 * unabhaengig getippte falsche Variable faellt nicht auf, weil der
 * Literal-Fallback dahinter still eingreift — deshalb hier an genau einer
 * Stelle, statt das Risiko dreimal einzugehen.
 *
 * Der Fallback selbst ist `DRK.linie`, nicht antds Grau (`#d9d9d9`): greift
 * die CSS-Variable einmal nicht (z. B. ausserhalb des Theme-Providers), soll
 * die Linie auf die Suite-Farbe zurueckfallen, nicht still auf antds eigene.
 */
export const RAHMEN = `1px solid var(--ant-color-border, ${DRK.linie})`;
