import { describe, it, expect } from "vitest";
import { normalisiereCode } from "./code";

describe("normalisiereCode", () => {
  it("bringt jede zumutbare Eingabeform auf DIESELBE kanonische Gestalt", () => {
    // Der Fall, um den es geht: `123456` findet heute `123-456` nicht und
    // verbrennt einen Fehlversuch aus einem Eimer, den sich eine ganze
    // Bereitschaft teilt.
    for (const roh of ["123456", "123-456", " 123 - 456 ", "123 456", "\t123456\n"]) {
      expect(normalisiereCode(roh)).toBe("123-456");
    }
  });

  it("laesst die Erzeugerform unveraendert", () => {
    // Die Erzeugerform ist der Fixpunkt: normalisiereCode(x) === x fuer jedes x,
    // das der Generator ausgibt. Ohne diese Eigenschaft aendert die Funktion die
    // Bedeutung bestehender laminierter Kaertchen.
    expect(normalisiereCode("482-137")).toBe("482-137");
    expect(normalisiereCode(normalisiereCode("482137"))).toBe("482-137");
  });

  it("verstuemmelt einen fremdartigen Wert NICHT still", () => {
    /**
     * Die Mutation, die ohne diesen Fall gruen bliebe: die Bindestrich-Ergaenzung
     * entfernen. Sie liefert `{ok:false}` — also genau das, was ein FALSCHER Code
     * liefern soll — und hat damit KEINE Fehlerform. Der Ausfall waere „das Gate
     * nimmt meinen Code nicht", und die Ursache stuende nirgends.
     *
     * Deshalb ist der Filter bewusst weiter als sechs Ziffern: sollte der
     * Betreiber je alphanumerische Codes ausgeben, bleibt die Funktion RICHTIG,
     * statt still zu verstuemmeln.
     */
    expect(normalisiereCode("ABC-DEF")).toBe("ABCDEF");
    expect(normalisiereCode("12345")).toBe("12345");    // zu kurz: kein Bindestrich
    expect(normalisiereCode("1234567")).toBe("1234567"); // zu lang: kein Bindestrich
    expect(normalisiereCode("")).toBe("");
  });

  it("faltet Kleinbuchstaben nach oben, wie der Bestand", () => {
    expect(normalisiereCode("abc-def")).toBe("ABCDEF");
  });

  it("wirft NIE — sie ist eine Normalisierung, kein Validator", () => {
    // Der Validator ist die Gleichheitssuche gegen tokens.code. Ein Wurf hier
    // machte aus einem Tippfehler einen 500 im Route Handler.
    expect(() => normalisiereCode("!!!")).not.toThrow();
    expect(normalisiereCode("!!!")).toBe("");
  });
});
