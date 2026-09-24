import { describe, expect, it } from "vitest";
import { ausBase64, ausUtf8, sha256Hex, utf8, zuBase64, zuHex } from "./bytes";

describe("bytes", () => {
  it("Base64 hin und zurück, auch über 32 KiB", () => {
    const gross = new Uint8Array(70_000).map((_, i) => i % 251);
    expect(ausBase64(zuBase64(gross))).toEqual(gross);
    expect(zuBase64(new Uint8Array([0, 1, 2, 255]))).toBe("AAEC/w==");
  });
  it("ungültiges Base64 wird abgelehnt statt still verstümmelt", () => {
    expect(() => ausBase64("AAEC/w=")).toThrow("Kein gültiges Base64");
    expect(() => ausBase64("AA EC")).toThrow("Kein gültiges Base64");
  });
  it("SHA-256 kennt den Prüfwert aus FIPS 180-2", async () => {
    expect(await sha256Hex(utf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("UTF-8 mit Umlauten, ungültige Folgen werfen", () => {
    expect(ausUtf8(utf8("Übergabe “ok”"))).toBe("Übergabe “ok”");
    expect(() => ausUtf8(new Uint8Array([0xff]))).toThrow();
    expect(zuHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });
});
