import { describe, expect, it } from "vitest";
import { einsatzAus, einsatzLink, einsatzText } from "./einsatz";

describe("Einsatz-Verweis auf Lifeline Hub", () => {
  it("liest den Link aus der Adresszeile, auch mit Unterseite", () => {
    expect(einsatzAus(" https://hub.example.org/einsaetze/42/etb?eintrag=3 ")).toEqual({ system: "lifeline-hub", id: "42", adresse: "https://hub.example.org" });
    expect(einsatzAus("http://localhost:8080/einsaetze/7")).toEqual({ system: "lifeline-hub", id: "7", adresse: "http://localhost:8080" });
  });

  it("nimmt auch nur die Nummer", () => {
    expect(einsatzAus("42")).toEqual({ system: "lifeline-hub", id: "42", adresse: null });
  });

  it("lehnt alles andere ab", () => {
    for (const x of ["", "abc", "https://hub.example.org/lagekarte", "javascript:alert(1)//einsaetze/1", "ftp://hub/einsaetze/1", "https://hub/einsaetze/x"]) {
      expect(einsatzAus(x), x).toBeNull();
    }
  });

  it("baut den Link zurück", () => {
    const v = einsatzAus("https://hub.example.org/einsaetze/42/etb")!;
    expect(einsatzLink(v)).toBe("https://hub.example.org/einsaetze/42");
    expect(einsatzText(v)).toBe("https://hub.example.org/einsaetze/42");
    expect(einsatzText(einsatzAus("42"))).toBe("42");
    expect(einsatzText(null)).toBe("");
  });
});
