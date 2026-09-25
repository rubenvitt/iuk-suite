import { kanonisch } from "../kanonisch";
import { GENESIS, type Blockkopf } from "../format";

/**
 * JCS-Randfälle, die die Blockvektoren nicht abdecken — Format-Vertrag mit der Rust-Kanonik
 * der Desktop-App (`apps/einsatzbuch/src-tauri/kern/tests/kanonisch.rs`). Die Datei
 * `kanonisch.json` ist aus dieser Liste erzeugt; `kanonisch.test.ts` rechnet sie nach.
 */
const TESTKOPF: Blockkopf = { v: 1, block: 7, prev: GENESIS, versiegelt: "2027-01-01T00:30:00+01:00", schluesselId: "0123456789abcdef", umgebung: "test" };
export const KANONISCH_FAELLE: { name: string; wert: unknown }[] = [
  { name: "blockkopf-test", wert: TESTKOPF },
  { name: "steuerzeichen", wert: "\u0000\u0001\u0008\u0009\u000a\u000b\u000c\u000d\u001f " },
  { name: "rueckstrich-und-anfuehrung", wert: "a\\b\"c/d" },
  // U+2028/U+2029/DEL/U+0080/BOM ausdrücklich als \u-Escape, nie als roher Codepunkt im
  // Quelltext: Ein Editor ersetzt einen rohen Zeilentrenner (U+2028/U+2029) sonst still durch
  // ein gewöhnliches Leerzeichen — genau das ist hier schon einmal passiert.
  { name: "roh-bleibt-roh", wert: "ä ß „x“ 😀 \u2028 \u2029 \u007f \u0080 \uFEFF" },
  { name: "schluesselsortierung", wert: { b: 1, a: { z: [3, 2, 1], "": null, "10": true, "2": false }, "ä": "x", A: "y" } },
  { name: "zahlen", wert: [0, 1, -1, 999, 9007199254740991, -9007199254740991] },
  { name: "leer", wert: { o: {}, a: [], s: "" } },
];
export function erzeugeKanonisch(): { name: string; wert: unknown; kanonisch: string }[] {
  return KANONISCH_FAELLE.map((f) => ({ ...f, kanonisch: kanonisch(f.wert) }));
}
