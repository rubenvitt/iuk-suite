import { describe, expect, it } from "vitest";
import { kanonisch } from "./kanonisch";

describe("kanonisch (RFC 8785 für die Werte des Einsatzbuchs)", () => {
  it("sortiert Schlüssel, lässt Leerraum weg, verschachtelt", () => {
    expect(kanonisch({ b: 1, a: [true, null, "x"], c: { z: "", y: -3 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":-3,"z":""}}');
  });
  it("sortiert Zahlschlüssel als Zeichenketten", () => {
    expect(kanonisch({ "10": 1, "2": 2, "1": 3 })).toBe('{"1":3,"10":1,"2":2}');
  });
  it("maskiert wie JSON.stringify: Anführungszeichen, Zeilenumbruch, Steuerzeichen; Umlaute und Emoji bleiben roh", () => {
    expect(kanonisch("ä\n\"x\u0001😀")).toBe('"ä\\n\\"x\\u0001😀"');
  });
  it("lehnt Brüche, undefined, einzelne Surrogate und Nicht-Objekte wie Date ab", () => {
    expect(() => kanonisch({ a: 1.5 })).toThrow("Nur ganze Zahlen");
    expect(() => kanonisch({ a: undefined })).toThrow("undefined");
    expect(() => kanonisch("\uD800")).toThrow("Surrogat");
    expect(() => kanonisch("a\uDC00")).toThrow("Surrogat");
    expect(() => kanonisch({ a: new Date(0) })).toThrow("Nur einfache Objekte");
    expect(() => kanonisch(new Map())).toThrow("Nur einfache Objekte");
  });
});
