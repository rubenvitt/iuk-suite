import { ausUtf8, utf8, type Bytes } from "./bytes";

/**
 * Kanonisches JSON nach RFC 8785 (JCS) für die Werte, die das Einsatzbuch kennt:
 * Objekte, Arrays, Zeichenketten, ganze Zahlen, Wahrheitswerte und `null`.
 * Brüche, `undefined` und einzelne Surrogate sind hier Fehler, keine Randfälle:
 * Der Fingerabdruck eines Blocks muss in TypeScript und Rust byte-gleich entstehen.
 */
const EINZELNES_SURROGAT = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function kanonisch(wert: unknown): string {
  if (wert === null) return "null";
  if (typeof wert === "boolean") return wert ? "true" : "false";
  if (typeof wert === "number") {
    if (!Number.isSafeInteger(wert)) throw new Error(`Nur ganze Zahlen erlaubt: ${wert}`);
    return String(wert);
  }
  if (typeof wert === "string") {
    if (EINZELNES_SURROGAT.test(wert)) throw new Error("Zeichenkette enthält ein einzelnes Surrogat");
    return JSON.stringify(wert);
  }
  if (Array.isArray(wert)) return `[${Array.from(wert, (x) => kanonisch(x)).join(",")}]`;
  if (typeof wert === "object") {
    const proto = Object.getPrototypeOf(wert);
    if (proto !== Object.prototype && proto !== null) throw new Error("Nur einfache Objekte erlaubt");
    const eintraege = Object.entries(wert as Record<string, unknown>);
    for (const [k, v] of eintraege) if (v === undefined) throw new Error(`Feld ${k} ist undefined`);
    eintraege.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${eintraege.map(([k, v]) => `${kanonisch(k)}:${kanonisch(v)}`).join(",")}}`;
  }
  throw new Error(`Nicht darstellbar: ${typeof wert}`);
}

/**
 * Dekodiert `bytes` als UTF-8, parst sie als JSON und verlangt, dass der Wert byte-genau
 * kanonisch ist — `utf8(kanonisch(wert))` muss mit `bytes` übereinstimmen. Das fängt auch
 * ein führendes U+FEFF (BOM) ab, das `TextDecoder` sonst still entfernt: Ein Klartext mit
 * BOM bestünde `kanonisch(JSON.parse(text)) === text` scheinbar, obwohl seine Bytes nicht
 * kanonisch sind. Jeder Fehler — ungültiges UTF-8, `JSON.parse`,
 * `kanonisch`-Wurf, jede Abweichung der Bytes — wird zu genau einer Meldung, damit kein
 * Aufrufer eine englische oder uneinheitliche Fehlermeldung durchreicht.
 */
export function ausKanonischemJson(bytes: Bytes): unknown {
  try {
    const text = ausUtf8(bytes);
    const wert: unknown = JSON.parse(text);
    const zurueck = utf8(kanonisch(wert));
    if (zurueck.length !== bytes.length) throw new Error("Länge weicht ab");
    for (let i = 0; i < bytes.length; i++) if (zurueck[i] !== bytes[i]) throw new Error("Bytes weichen ab");
    return wert;
  } catch {
    throw new Error("kein kanonisches JSON");
  }
}
