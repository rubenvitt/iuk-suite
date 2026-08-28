import { describe, it, expect } from "vitest";
import { RateLimiter, clientIpAus } from "./ratelimit";

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
