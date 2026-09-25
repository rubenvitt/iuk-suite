import { describe, expect, it } from "vitest";
import { bearerAus, gleich, hashVon, neuesGeheimnis, s256 } from "./token";

const anfrage = (authorization?: string) =>
  new Request("https://einsatzbuch.localtest.me/m/einsatzbuch/api/anker", authorization === undefined ? {} : { headers: { authorization } });

describe("neuesGeheimnis / hashVon", () => {
  it("liefert 43 Zeichen base64url ohne Padding und jedes Mal ein anderes", () => {
    const a = neuesGeheimnis();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(neuesGeheimnis()).not.toBe(a);
  });
  it("hasht SHA-256 als Hex", () => {
    expect(hashVon("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("s256", () => {
  it("rechnet das Beispiel aus RFC 7636, Anhang B", () => {
    expect(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("gleich", () => {
  it("vergleicht gleich lange Werte", () => {
    expect(gleich("abc", "abc")).toBe(true);
    expect(gleich("abc", "abd")).toBe(false);
  });
  it("ist bei ungleicher Länge false, ohne zu werfen — auch bei gleicher Zeichen-, aber anderer Bytelänge", () => {
    expect(gleich("abc", "abcd")).toBe(false);
    expect(gleich("", "a")).toBe(false);
    expect(gleich("ä", "a")).toBe(false);
  });
});

describe("bearerAus", () => {
  const token = neuesGeheimnis();
  it("liest ein Token aus „Bearer <43 Zeichen base64url>“", () => {
    expect(bearerAus(anfrage(`Bearer ${token}`))).toBe(token);
  });
  it("lehnt fehlende, kleingeschriebene, zu kurze, zu lange und fremde Werte ab", () => {
    expect(bearerAus(anfrage())).toBeNull();
    expect(bearerAus(anfrage(`bearer ${token}`))).toBeNull();
    expect(bearerAus(anfrage(`Bearer ${token.slice(1)}`))).toBeNull();
    expect(bearerAus(anfrage(`Bearer ${token}A`))).toBeNull();
    expect(bearerAus(anfrage(`Bearer ${token.slice(1)}+`))).toBeNull();
    expect(bearerAus(anfrage(`Basic ${token}`))).toBeNull();
    expect(bearerAus(anfrage(`Bearer  ${token}`))).toBeNull();
  });
});
