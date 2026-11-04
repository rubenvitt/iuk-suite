/**
 * BEWEGUNG UND SCHATTEN DER HAARLINIE (IDA-347).
 *
 * Federn statt linearer Rampen: ein Übergang schießt kaum merklich über und
 * kommt zur Ruhe, statt steif anzuhalten. Die Kurve ist eine echte gedämpfte
 * Schwingung, abgetastet als CSS-`linear()`; antd nimmt sie als Token
 * (`motionEaseOut`), eigenes CSS als `--iuk-feder` aus `globals.css`.
 * `bewegung.test.ts` hält beide Seiten deckungsgleich.
 *
 * Reduzierte Bewegung schaltet `globals.css` ab, nicht diese Datei: antd und
 * eigenes CSS laufen dort durch dieselbe Medienabfrage.
 *
 * Reine Werte, kein React, kein "use client" — aus Server Components wie
 * Client-Inseln importierbar (Falle 6).
 */

/** Gedämpfte Feder als `linear()`; `steifigkeit`/`daempfung` in Federeinheiten, Masse 1. */
export function feder(steifigkeit: number, daempfung: number): { kurve: string; dauerMs: number } {
  const w0 = Math.sqrt(steifigkeit);
  const zeta = daempfung / (2 * Math.sqrt(steifigkeit));
  const x = (t: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  let ende = 0.05;
  while (ende < 3 && !(Math.abs(1 - x(ende)) < 0.002 && Math.abs(1 - x(ende + 0.05)) < 0.002)) ende += 0.01;
  const n = 32;
  const punkte = Array.from({ length: n + 1 }, (_, i) => (i === n ? 1 : +x((ende * i) / n).toFixed(3)));
  return { kurve: `linear(${punkte.join(", ")})`, dauerMs: Math.round(ende * 1000) };
}

const FEDER = feder(260, 26);

export const BEWEGUNG = {
  /** Die Feder der Suite: Flyins, Einblenden, Rückfedern nach dem Drücken. */
  feder: FEDER.kurve,
  /** Wie lange die Feder bis zur Ruhe braucht. */
  federDauerMs: FEDER.dauerMs,
  /** Gleiten ohne Überschwingen, für Ein-/Ausblenden von Flächen. */
  gleiten: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/** Erhobene Flächen (Popover, Auswahlliste, Dropdown): Haarlinie plus weicher, tiefer Schatten. */
export const SCHATTEN_ERHOBEN = {
  light: "0 0 0 1px rgba(24, 24, 27, 0.08), 0 16px 40px -16px rgba(24, 24, 27, 0.22)",
  dark: "0 0 0 1px rgba(255, 255, 255, 0.10), 0 16px 40px -16px rgba(0, 0, 0, 0.6)",
} as const;
