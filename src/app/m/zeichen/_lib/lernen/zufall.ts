/**
 * Der Finalizer aus MurmurHash3 (`fmix32`) — reine Avalanche-Mischung ohne eigenen
 * Zustand. Gebraucht wird sie, weil xorshift32 KLEINE Seeds schlecht startet: der
 * allererste Ausgabewert haengt fuer Seeds wie 1..200 fast linear am Seed selbst
 * (gemessen: `zufallsfolge(1)()` ≈ 0.0001, `zufallsfolge(2)()` ≈ 0.0002, …). Die
 * Fisher-Yates-Ziehung in `mische` liest genau diesen ersten Wert zuerst, und ein
 * Wert nahe 0 wirft an der ersten Position IMMER `Math.floor(v * n) === 0` —
 * `fragen.test.ts`s Gleichverteilungsfall deckt das auf (200 Ziehungen mit den
 * Seeds 0..199 landeten ohne diese Mischung zu 100 % auf demselben Platz). Die
 * Mischung wird EINMAL beim Start angewandt, nicht bei jedem Zug — der xorshift
 * danach bleibt unveraendert und die drei zufall.test.ts-Eigenschaften halten.
 */
function gemischterStartwert(seed: number): number {
  let z = (seed ^ 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z ^= z >>> 16;
  return z >>> 0;
}

/**
 * xorshift32 — zwoelf Zeilen, keine Abhaengigkeit, deterministisch.
 *
 * ⛔ KEIN Math.random() IM RUMPF, hier und in keiner Datei unter `lernen/`. Der Seed
 * kommt von aussen, und zwar aus (sub, zeichenId, typ, rundenNr). Zwei Gruende: die
 * Frage wuerfelt bei einem Rerender nicht neu, und derselbe Testfall ergibt zweimal
 * dasselbe. Ein Quiz mit Math.random() im Rumpf ist nicht testbar, nur beobachtbar.
 */
export function zufallsfolge(seed: number): () => number {
  // 0 ist der Fixpunkt von xorshift — jede Folge daraus waere konstant 0.
  let x = gemischterStartwert(seed) || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // >>> 0 macht aus dem vorzeichenbehafteten 32-Bit-Wert eine nichtnegative Zahl.
    return (x >>> 0) / 0x1_0000_0000;
  };
}

/** Fisher-Yates auf einer Kopie — die Eingabe bleibt unangetastet. */
export function mische<T>(liste: readonly T[], seed: number): T[] {
  const naechste = zufallsfolge(seed);
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(naechste() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/**
 * Ein stabiler Zahlen-Seed aus beliebigen Zeichenketten (FNV-1a, 32 Bit).
 * Damit haengt die Frage an Person, Zeichen, Fragetyp und Rundennummer — nicht an
 * der Uhr.
 */
export function seedAus(...teile: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const teil of teile) {
    const s = String(teil);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}
