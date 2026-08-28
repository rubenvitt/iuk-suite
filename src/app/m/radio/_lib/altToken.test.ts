import { describe, it, expect } from "vitest";
import { altTokenFehler, altTokenZiel } from "./altToken";

const TOKEN = "radio-inventar-2025-secure-token";
const B64 = Buffer.from(TOKEN).toString("base64");
const CODE = "4Y1Q-7K3M-2N8P-5R6S-9T0V-W1X2-Y3Z4";
const env = {
  RADIO_ALT_TOKEN: TOKEN,
  RADIO_ALT_TOKEN_CODE: CODE,
  RADIO_ALT_TOKEN_BIS: "2026-12-31",
};
const jetzt = new Date("2026-09-01T10:00:00Z");

describe("altTokenZiel — der gedruckte Alt-QR mit ?token=", () => {
  it("leitet einen passenden Token auf /t/<code> um", () => {
    expect(altTokenZiel(B64, env, jetzt)).toBe(`/t/${CODE}`);
  });

  it("ignoriert einen fehlenden Parameter", () => {
    expect(altTokenZiel(undefined, env, jetzt)).toBeNull();
    expect(altTokenZiel("", env, jetzt)).toBeNull();
  });

  it("weist einen fremden oder kaputten Token ab", () => {
    expect(altTokenZiel(Buffer.from("anderer-token-mit-gleicher-laenge").toString("base64"), env, jetzt)).toBeNull();
    expect(altTokenZiel(Buffer.from("kurz").toString("base64"), env, jetzt)).toBeNull();
    expect(altTokenZiel("%%%nicht-base64", env, jetzt)).toBeNull();
    expect(altTokenZiel(TOKEN, env, jetzt)).toBeNull(); // Klartext statt Base64
  });

  it("ist aus, wenn RADIO_ALT_TOKEN fehlt", () => {
    expect(altTokenZiel(B64, { ...env, RADIO_ALT_TOKEN: "" }, jetzt)).toBeNull();
    expect(altTokenZiel(B64, {}, jetzt)).toBeNull();
  });

  it("ist aus, sobald das Ablaufdatum erreicht ist", () => {
    expect(altTokenZiel(B64, env, new Date("2026-12-31T00:00:00Z"))).toBeNull();
    expect(altTokenZiel(B64, env, new Date("2026-12-30T23:59:59Z"))).toBe(`/t/${CODE}`);
  });

  it("ist aus, wenn Code oder Ablaufdatum fehlen oder kaputt sind", () => {
    expect(altTokenZiel(B64, { ...env, RADIO_ALT_TOKEN_CODE: "" }, jetzt)).toBeNull();
    expect(altTokenZiel(B64, { ...env, RADIO_ALT_TOKEN_BIS: "" }, jetzt)).toBeNull();
    expect(altTokenZiel(B64, { ...env, RADIO_ALT_TOKEN_BIS: "bald" }, jetzt)).toBeNull();
  });
});

describe("altTokenFehler — die Boot-Meldungen", () => {
  it("schweigt ohne RADIO_ALT_TOKEN", () => {
    expect(altTokenFehler({})).toEqual([]);
    expect(altTokenFehler({ RADIO_ALT_TOKEN_CODE: CODE })).toEqual([]);
  });

  it("schweigt bei vollstaendiger Brücke", () => {
    expect(altTokenFehler(env)).toEqual([]);
  });

  it("meldet fehlenden Code und fehlendes/kaputtes Ablaufdatum getrennt", () => {
    const f = altTokenFehler({ RADIO_ALT_TOKEN: TOKEN });
    expect(f).toHaveLength(2);
    expect(f.join("\n")).toMatch(/RADIO_ALT_TOKEN_CODE/);
    expect(f.join("\n")).toMatch(/RADIO_ALT_TOKEN_BIS/);
    expect(altTokenFehler({ ...env, RADIO_ALT_TOKEN_BIS: "31.12.2026" })).toHaveLength(1);
  });

  it("meldet einen Code, der nicht die Erzeugerform hat", () => {
    expect(altTokenFehler({ ...env, RADIO_ALT_TOKEN_CODE: "abc" })).toHaveLength(1);
  });

  it("meldet ein Ablaufdatum in der Vergangenheit", () => {
    expect(altTokenFehler({ ...env, RADIO_ALT_TOKEN_BIS: "2020-01-01" }, jetzt)).toHaveLength(1);
  });
});
