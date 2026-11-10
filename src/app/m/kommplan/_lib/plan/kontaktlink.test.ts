import { describe, expect, it } from "vitest";
import { kontaktLink, telefonLink } from "./kontaktlink";

describe("kontaktLink (IDA-390)", () => {
  it("Telefonnummern ohne Leerzeichen und Trenner", () => {
    expect(telefonLink("0581 / 82 266")).toBe("tel:058182266");
    expect(telefonLink("0581 / 82-0")).toBe("tel:0581820");
    expect(telefonLink("+49 (0) 581 1234")).toBe("tel:+495811234");
    expect(telefonLink(" 0170 0000000 ")).toBe("tel:01700000000");
  });

  it("Text im Telefonfeld bleibt Text", () => {
    expect(telefonLink("EA NuK 1.")).toBeNull();
    expect(telefonLink("112 über Leitstelle")).toBeNull();
    expect(telefonLink("40-12-1")).toBeNull(); // Funkrufname im Telefonfeld
    expect(telefonLink("12")).toBeNull();
    expect(telefonLink("112")).toBe("tel:112");
    expect(telefonLink("")).toBeNull();
  });

  it("nach Art: Telefon und Mobil wählen, E-Mail schreibt, Fax und Funk bleiben Text", () => {
    expect(kontaktLink("mobil", "0170 1234567")).toBe("tel:01701234567");
    expect(kontaktLink("telefon", "0581 9032293")).toBe("tel:05819032293");
    expect(kontaktLink("email", "lage@example.org")).toBe("mailto:lage@example.org");
    expect(kontaktLink("email", "keine Adresse")).toBeNull();
    expect(kontaktLink("email", "a@b.de?cc=x%40y.de")).toBeNull();
    expect(kontaktLink("email", "a@b.de,x@y.de")).toBeNull();
    expect(kontaktLink("email", "a+tag@b.de")).toBe("mailto:a+tag@b.de");
    expect(kontaktLink("fax", "0581 82 284")).toBeNull();
    expect(kontaktLink("digitalfunk", "RK 40-12-1")).toBeNull();
  });
});
