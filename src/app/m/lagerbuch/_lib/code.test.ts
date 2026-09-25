import { describe, it, expect } from "vitest";
import { gruppiereCode, istLangerCode, normalisiereCode } from "./code";

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

describe("die lange Form — DRK-442", () => {
  const LANG = "7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J50E";

  it("bringt jede zumutbare Eingabe auf die Erzeugerform", () => {
    for (const roh of [
      LANG,
      "7K3MQ9XD2RTP4W8NHV6BC1ZFJ50E",
      "7k3m q9xd 2rtp 4w8n hv6b c1zf j50e",
      " 7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J50E\n",
    ]) expect(normalisiereCode(roh), roh).toBe(LANG);
  });

  it("bildet O auf 0 und I/L auf 1 zurueck — nur bei genau 28 Zeichen", () => {
    expect(normalisiereCode("7K3M-Q9XD-2RTP-4W8N-HV6B-CIZF-J50E")).toBe(LANG);
    expect(normalisiereCode("7K3M-Q9XD-2RTP-4W8N-HV6B-ClZF-J50E")).toBe(LANG);
    expect(normalisiereCode("7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J5OE")).toBe(LANG);
    // Ein Altbestand mit Buchstaben bleibt, wie er ist: kein O wird still zur 0.
    expect(normalisiereCode("BOOT-1")).toBe("BOOT1");
  });

  it("laesst die alte Form unangetastet", () => {
    expect(normalisiereCode("482137")).toBe("482-137");
    expect(istLangerCode("482-137")).toBe(false);
  });

  it("istLangerCode prueft Gestalt UND Alphabet", () => {
    expect(istLangerCode(LANG)).toBe(true);
    expect(istLangerCode(LANG.replaceAll("-", ""))).toBe(false);          // nicht gruppiert
    expect(istLangerCode(LANG.toLowerCase())).toBe(false);               // nicht kanonisch
    expect(istLangerCode(normalisiereCode("U".repeat(28)))).toBe(false); // U ist kein Zeichen
    expect(istLangerCode(LANG.slice(0, -1))).toBe(false);
  });

  it("gruppiert in Vieren", () => {
    expect(gruppiereCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(normalisiereCode(normalisiereCode(LANG))).toBe(LANG);
  });
});
