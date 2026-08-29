import { describe, expect, it } from "vitest";
import { randomId } from "./zufallsId";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  it("liefert eindeutige Werte", () => {
    const ids = new Set(Array.from({ length: 200 }, () => randomId()));
    expect(ids.size).toBe(200);
  });

  it("nutzt crypto.randomUUID, wenn vorhanden (jsdom liefert es immer)", () => {
    expect(randomId()).toMatch(UUID_V4);
  });

  /**
   * Der Fund, den ein Vitest-Lauf strukturell nicht sehen kann, ohne
   * `crypto.randomUUID` gezielt wegzunehmen: jsdom stellt die Funktion
   * unabhängig vom „Secure Context" bereit (das Konzept existiert dort nicht),
   * ein `http://uav.localtest.me` im echten Browser dagegen nicht
   * (`e2e/uav.spec.ts`, Check 7 — `Uncaught TypeError: crypto.randomUUID is
   * not a function`). Dieser Test stellt genau die fehlende Bedingung her.
   */
  it("liefert ein UUID-v4-förmiges Ergebnis auch ohne crypto.randomUUID (Secure-Context-Fallback)", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      expect(randomId()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });

  it("liefert auch ohne crypto.randomUUID eindeutige Werte", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 200 }, () => randomId()));
      expect(ids.size).toBe(200);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
