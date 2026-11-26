import { describe, expect, it } from "vitest";
import { neuerBeitrittCode, neuesSecret, tokenHash } from "./codes";

describe("codes", () => {
  it("Secret: 32 Byte als base64url", () => {
    const s = neuesSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(neuesSecret()).not.toBe(s);
  });
  it("Beitrittscode: 6 Zeichen aus dem Alphabet ohne Verwechsler", () => {
    for (let i = 0; i < 200; i++) expect(neuerBeitrittCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
  it("Token-Hash: sha256 hex", () => {
    expect(tokenHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
