import { describe, it, expect } from "vitest";
import { RATELIMIT_MAX_SCHLUESSEL, RateLimiter, clientIpAus } from "./ratelimit";

describe("RateLimiter", () => {
  it("erlaubt bis max und blockt dann im Fenster", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 2, now: () => t });
    expect(rl.check("ip1")).toBe(true);
    expect(rl.check("ip1")).toBe(true);
    expect(rl.check("ip1")).toBe(false); // 3. im Fenster
  });
  it("trennt Schlüssel", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, now: () => t });
    expect(rl.check("a")).toBe(true);
    expect(rl.check("b")).toBe(true);
    expect(rl.check("a")).toBe(false);
  });
  it("gibt nach Ablauf des Fensters wieder frei", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, now: () => t });
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(false);
    t = 2001; // Fenster vorbei
    expect(rl.check("a")).toBe(true);
  });
});

/**
 * DRK-287 (CWE-770): die Map darf weder durch viele eindeutige Schlüssel noch durch
 * abgelaufene Fenster unbegrenzt wachsen — und Kapazitätsdruck darf eine AKTIVE Sperre
 * nicht verdrängen, sonst setzt ein Angreifer seine eigene Sperre durch Fluten zurück.
 */
describe("RateLimiter — Speicherrahmen (DRK-287)", () => {
  it("entfernt abgelaufene Schlüssel, statt sie dauerhaft zu halten", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, now: () => t });
    for (let i = 0; i < 32; i++) rl.check(`k${i}`);
    expect(rl.schluesselAnzahl).toBe(32);
    t = 2001; // Fenster aller 32 vorbei
    rl.check("neu");
    expect(rl.schluesselAnzahl).toBe(1);
  });

  it("hält bei vielen eindeutigen Schlüsseln im selben Fenster die Obergrenze", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 10, maxKeys: 100, now: () => t });
    for (let i = 0; i < 10_000; i++) rl.check(`k${i}`);
    expect(rl.schluesselAnzahl).toBeLessThanOrEqual(100);
  });

  it("hat ohne Angabe eine feste Vorgabe-Obergrenze", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 10, now: () => t });
    for (let i = 0; i < 50_000; i++) rl.check(`k${i}`);
    expect(rl.schluesselAnzahl).toBeLessThanOrEqual(RATELIMIT_MAX_SCHLUESSEL);
  });

  it("verdrängt bei vollem Speicher nie eine aktive Sperre", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 3, maxKeys: 10, now: () => t });
    for (let i = 0; i < 4; i++) rl.check("angreifer");
    expect(rl.check("angreifer")).toBe(false);
    // Fluten mit frischen Schlüsseln, weit über die Kapazität hinaus
    for (let i = 0; i < 1000; i++) { t += 1; rl.check(`flut${i}`); }
    expect(rl.check("angreifer")).toBe(false);
    expect(rl.schluesselAnzahl).toBeLessThanOrEqual(10);
  });

  it("nimmt einen neuen Schlüssel an, solange ein ungesperrter Eintrag Platz machen kann", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 3, maxKeys: 2, now: () => t });
    for (let i = 0; i < 4; i++) rl.check("gesperrt");
    rl.check("halb");
    expect(rl.check("frisch")).toBe(true);
    expect(rl.check("gesperrt")).toBe(false);
  });

  it("weist neue Schlüssel ab, solange der Speicher nur aus aktiven Sperren besteht, und nimmt sie nach Fensterablauf wieder an", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, maxKeys: 3, now: () => t });
    for (const k of ["a", "b", "c"]) { rl.check(k); rl.check(k); }
    expect(rl.check("d")).toBe(false);
    expect(rl.schluesselAnzahl).toBe(3);
    t = 2001;
    expect(rl.check("d")).toBe(true);
  });

  it("gibt bei vollem Speicher den Platz frei, sobald die ERSTE Sperre fällt — nicht erst, wenn alle fallen", () => {
    let t = 0;
    const rl = new RateLimiter({ windowMs: 1000, max: 2, maxKeys: 2, now: () => t });
    rl.check("a"); t = 1; rl.check("a");
    t = 500; rl.check("b"); t = 501; rl.check("b");
    t = 600;
    expect(rl.check("c")).toBe(false);
    t = 1000.5; // der ältere Treffer von "a" ist abgelaufen, "a" hält nur noch einen
    expect(rl.check("c")).toBe(true);
    expect(rl.check("b")).toBe(false);
  });

  it("ein voll gesperrter Speicher macht jede weitere Flut billig", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 60_000, max: 1, maxKeys: 5_000, now: () => t });
    for (let i = 0; i < 5_000; i++) { rl.check(`s${i}`); rl.check(`s${i}`); }
    const start = performance.now();
    for (let i = 0; i < 20_000; i++) { t += 0.001; expect(rl.check(`flut${i}`)).toBe(false); }
    // Ohne Merker wären das 20 000 Durchläufe über 5 000 Einträge.
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(rl.schluesselAnzahl).toBe(5_000);
  });

  it("speichert einen überlangen Schlüssel nicht im Wortlaut, zählt ihn aber weiter getrennt", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 1, now: () => t });
    const lang = "A".repeat(1024 * 1024);
    expect(rl.check(lang)).toBe(true);
    expect(rl.check(lang)).toBe(false);
    expect(rl.check(lang + "B")).toBe(true);
    expect(rl.schluesselLaengeMax).toBeLessThanOrEqual(64);
  });

  it("istGesperrt fragt ab, ohne zu buchen oder einen Eintrag anzulegen", () => {
    const t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 2, now: () => t });
    expect(rl.istGesperrt("a")).toBe(false);
    expect(rl.schluesselAnzahl).toBe(0);
    rl.check("a");
    expect(rl.istGesperrt("a")).toBe(false);
    rl.check("a");
    expect(rl.istGesperrt("a")).toBe(true);
    expect(rl.istGesperrt("a")).toBe(true);
  });
});

describe("clientIpAus", () => {
  it("nimmt `cf-connecting-ip`", () => {
    const h = new Headers({ "cf-connecting-ip": "203.0.113.7" });
    expect(clientIpAus(h)).toBe("203.0.113.7");
  });

  /**
   * DIE ZEILE, WEGEN DER ES DIESEN TEST GIBT — CWE-348, Vorarbeit vor
   * Planteil 3 des Moduls `radio` (2026-08-21). `clientIpAus` nahm bislang
   * ohne `cf-connecting-ip` den ERSTEN `x-forwarded-for`-Eintrag — den vom
   * Client selbst behaupteten Wert. Der Suite-Container ist auf dem Server
   * direkt erreichbar (Betreiber, 03.08.2026,
   * `src/app/m/lagerbuch/_lib/absender.ts:6-7`); wer ihn direkt erreicht,
   * setzt den Header vollständig selbst — gleich ob der erste oder ein
   * anderer Eintrag gelesen wird.
   *
   * Die Mutation, die ohne diesen Test grün bliebe: „x-forwarded-for als
   * Rückfall wieder einbauen". Sie sieht wie eine Verbesserung aus (mehr
   * Präzision ohne Cloudflare) und ist der ganze Fehler.
   */
  it("liest x-forwarded-for in KEINER Richtung — weder als einziger Kopf noch neben cf-connecting-ip", () => {
    expect(clientIpAus(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }))).toBe(
      "unknown",
    );
    expect(clientIpAus(new Headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("unknown");
    expect(
      clientIpAus(
        new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }),
      ),
    ).toBe("203.0.113.7");
  });

  it('liefert ohne "cf-connecting-ip" "unknown"', () => {
    expect(clientIpAus(new Headers())).toBe("unknown");
  });

  /**
   * Der residuale Sammel-Eimer, bewusst nicht beseitigt (Begründung in
   * `clientIpAus`, Schritt 3 der Vorarbeit): ohne Präfix — anders als
   * lagerbuchs `absenderAus` — kann ein gefälschtes
   * `cf-connecting-ip: unknown` denselben Sammel-Eimer treffen wie ein
   * kopfloser Aufruf. Das ist eine BÜNDELUNG, keine neue Fälschbarkeit: sie
   * verstopft/teilt einen Eimer, sie eröffnet KEINEN frischen je Versuch —
   * das unterscheidet sie von CWE-348.
   */
  it('ein gefälschtes "cf-connecting-ip: unknown" trifft denselben Sammel-Eimer wie ein kopfloser Aufruf', () => {
    expect(clientIpAus(new Headers({ "cf-connecting-ip": "unknown" }))).toBe("unknown");
  });
});
