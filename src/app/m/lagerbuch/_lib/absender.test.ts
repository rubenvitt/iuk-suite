import { describe, it, expect } from "vitest";
import { absenderAus } from "./absender";

const kopf = (h: Record<string, string>) => new Headers(h);

describe("absenderAus", () => {
  it("nimmt cf-connecting-ip und traegt den cf:-Praefix", () => {
    expect(absenderAus(kopf({ "cf-connecting-ip": "203.0.113.7" }))).toBe("cf:203.0.113.7");
  });

  it("liest x-forwarded-for in KEINER Richtung — weder erster noch letzter Eintrag", () => {
    /**
     * DIE ZEILE, WEGEN DER ES DIESE DATEI GIBT. Sie ersetzt
     * `lagerbuch/src/lib/auth/rateLimit.test.ts:33-38`.
     *
     * Der Suite-Container ist direkt erreichbar (Betreiber, 03.08.2026). Wer ihn
     * direkt erreicht, setzt den Header VOLLSTAENDIG selbst — den ersten Eintrag
     * zu nehmen (core/ratelimit.ts:60) oder den letzten
     * (lagerbuch/rateLimit.ts:29-35) macht dabei keinen Unterschied: beide
     * ergeben einen FRISCHEN Eimer je Versuch.
     *
     * Die Mutation, die ohne diesen Test gruen bliebe: „x-forwarded-for als
     * Rueckfall einbauen". Sie sieht wie eine Verbesserung aus und ist der ganze
     * Fehler.
     */
    expect(absenderAus(kopf({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }))).toBe("direkt");
    expect(absenderAus(kopf({ "x-forwarded-for": "198.51.100.1" }))).toBe("direkt");
  });

  it("liest x-forwarded-for auch NEBEN cf-connecting-ip nicht mit", () => {
    // Kein zusammengesetzter Schluessel, keine Verkettung: der Wert traegt genau
    // eine Herkunft, sonst rotiert ein Angreifer die zweite Haelfte.
    expect(absenderAus(kopf({
      "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1",
    }))).toBe("cf:203.0.113.7");
  });

  it("faellt ohne beide Koepfe auf EINEN konstanten Sammelschluessel", () => {
    // Der sichere Ausfallmodus: alle kopflosen Aufrufer teilen sich EINEN Eimer.
    // Er kann nur zu STRENG sein, nie zu lasch — und ein richtiger Code
    // funktioniert dabei immer, weil nur Fehlversuche buchen (§3.5.3).
    expect(absenderAus(kopf({}))).toBe("direkt");
    expect(absenderAus(kopf({ "cf-connecting-ip": "" }))).toBe("direkt");
    expect(absenderAus(kopf({ "cf-connecting-ip": "   " }))).toBe("direkt");
  });

  it("der Praefix trennt die Namensraeume", () => {
    // Ohne ihn koennte ein gefaelschtes `cf-connecting-ip: direkt` den
    // Sammel-Eimer der kopflosen Aufrufer mitbenutzen oder umgekehrt verstopfen.
    expect(absenderAus(kopf({ "cf-connecting-ip": "direkt" }))).toBe("cf:direkt");
    expect(absenderAus(kopf({ "cf-connecting-ip": "direkt" })))
      .not.toBe(absenderAus(kopf({})));
  });

  it("trimmt den Wert, damit ein Leerzeichen keinen zweiten Eimer oeffnet", () => {
    expect(absenderAus(kopf({ "cf-connecting-ip": " 203.0.113.7 " }))).toBe("cf:203.0.113.7");
  });
});
