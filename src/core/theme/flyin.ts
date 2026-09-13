/**
 * DIE BREITE EINER SCHUBLADE — als CSS-Ausdruck, nicht als Zahl.
 *
 * ⚠️ DER DECKEL, DEN antd SCHON HAT, IST KEINER, AUF DEN MAN BAUEN KANN.
 * `size` landet ueber `rc-drawer` (`DrawerPopup.js:159`) als nacktes `width`
 * auf einem Rahmen, der an `right: 0` haengt; gekappt wird er allein durch
 * antds eigenes `max-width: 100vw`. Das ist gemessenes Verhalten zweier
 * Fremdpakete, kein zugesagter Vertrag — und es traegt weniger weit, als es
 * aussieht: **`100vw` ist nicht die sichtbare Breite, sobald die Seite
 * waagerecht ueberlaeuft.** Genau daran ist es aufgefallen.
 *
 * GEMESSEN, NICHT VERMUTET (13.09.2026, echter Chromium):
 *
 *   Artikeldetails (`size={520}`) bei 480 px Fensterbreite
 *     `100vw` der Seite ........... 506 px   ← mehr als das Fenster
 *     Rahmen linke Kante .......... -26 px
 *     Schliessen-Knopf linke Kante .. -2 px  ← ausserhalb des Bildes
 *
 *   Zum Vergleich, dieselbe Messung, wo die Seite NICHT ueberlaeuft:
 *     uav-Katalog (`size={480}`) bei 320 px .... Knopf bei +24 px
 *     radio-Filter (`width={360}`) bei 320 px .. Knopf bei +24 px
 *
 * Der Unterschied liegt also nicht in der Zahl, sondern in der Seite
 * dahinter — und keine Schublade weiss, auf welcher Seite sie einmal
 * geoeffnet wird. `92vw` nimmt sich die Reserve, die `100vw` nicht hat.
 *
 * Kein Tor der Kette findet das. `typecheck` sieht eine gueltige Zahl,
 * `build` serialisiert sie klaglos, und **Vitest kann es strukturell nicht
 * finden** — jsdom rechnet keine Layoutboxen (`getBoundingClientRect()`
 * liefert ueberall Nullen) und wertet weder `min()` noch `vw` aus. Nur ein
 * echter Browser kennt die Kante. Dieselbe Klasse wie Falle 8 in
 * `docs/design/README.md`.
 *
 * DER RIEGEL IST EIN CSS-AUSDRUCK UND KEIN `useEffect`-MESSWERT, und das ist
 * der Punkt: `min()` wird vom Browser bei JEDER Groessenaenderung neu
 * ausgewertet — beim Drehen eines Geraets, beim Ziehen eines Fensters, beim
 * Ein- und Ausblenden einer Werkzeugleiste. Eine in JavaScript gemessene
 * Zahl waere beim Oeffnen richtig und danach still falsch.
 *
 * `grund` ist die Breite, die das Modul auf einem geraeumigen Schirm haben
 * WILL — eine Fachentscheidung des Moduls, die hier bewusst NICHT
 * vereinheitlicht wird: eine Filterliste braucht etwas anderes als eine
 * Arbeitsflaeche mit zwei Formularen. Geteilt wird allein die Obergrenze.
 */
export const FLYIN_MAX_ANTEIL_PROZENT = 92;

/**
 * Die `size` fuer einen antd-`Drawer`: `grund`, aber nie breiter als das
 * Fenster erlaubt.
 *
 * Das Ergebnis ist ein CSS-`min()` und geht als Zeichenkette an `size`.
 * antd reicht eine Zeichenkette, die nicht rein numerisch ist, unveraendert
 * an `rc-drawer` weiter (`antd/es/drawer/Drawer.js:93-98`), und
 * `parseWidthHeight` gibt sie ebenso unveraendert zurueck, weil
 * `Number("min(…)")` `NaN` ist (`@rc-component/drawer/es/util.js:3-14`).
 * ⚠️ Damit haengt diese Funktion an einem GEMESSENEN Durchleitungsverhalten
 * zweier Fremdpakete, nicht an einer zugesagten Schnittstelle —
 * `src/core/theme/flyin.test.ts` haelt die Form der Zeichenkette fest, und
 * `e2e/flyin-breite.spec.ts` misst im echten Browser nach, dass sie auch
 * ankommt.
 */
export function flyinBreite(grund: number): string {
  return `min(${grund}px, ${FLYIN_MAX_ANTEIL_PROZENT}vw)`;
}
