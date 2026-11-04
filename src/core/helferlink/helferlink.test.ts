import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gruppiereZugangscode, neuerZugangscode, normalisiereZugangscode, ZUGANG_ALPHABET, ZUGANG_ZEICHEN } from "./code";
import { helferCookieAttribute, pruefeHelferSitzung, stelleHelferSitzungAus } from "./sitzung";

describe("Zugangscode der Helfer-Links (Lagerbuch, Verpflegungslager)", () => {
  it("zieht Codes aus dem Alphabet und liest sie mit Gruppen, Kleinbuchstaben und Verwechslern", () => {
    const c = neuerZugangscode();
    const ohne = c.split("-").join("");
    expect(ohne).toHaveLength(ZUGANG_ZEICHEN);
    expect([...ohne].every((z) => ZUGANG_ALPHABET.includes(z))).toBe(true);
    expect(gruppiereZugangscode(ohne)).toBe(c);
    expect(normalisiereZugangscode(` ${ohne.toLowerCase()} `)).toBe(c);
    expect(normalisiereZugangscode("zu-kurz")).toBeNull();
  });
});

describe("Helfer-Sitzung", () => {
  it("trägt nur die Kennung und lehnt fremde Schlüssel und Müll ab, ohne zu werfen", async () => {
    const wert = await stelleHelferSitzungAus("geheim-a", "link-1", 600);
    expect(await pruefeHelferSitzung("geheim-a", wert)).toMatchObject({ tokenId: "link-1" });
    expect(await pruefeHelferSitzung("geheim-b", wert)).toBeNull();
    expect(await pruefeHelferSitzung("geheim-a", "kein-jwt")).toBeNull();
  });

  it("setzt das Cookie host-gebunden: ohne Domain, httpOnly", () => {
    const a = helferCookieAttribute(60);
    expect(a).toMatchObject({ httpOnly: true, path: "/", maxAge: 60 });
    expect("domain" in a).toBe(false);
    expect(readFileSync("src/core/helferlink/sitzung.ts", "utf8")).not.toMatch(/domain:/);
  });
});
