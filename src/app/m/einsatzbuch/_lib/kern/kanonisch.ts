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
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(",")}]`;
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
