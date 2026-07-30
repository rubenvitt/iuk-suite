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
  /*
   * Vorrang nur belegbar, wenn BEIDE Header mit VERSCHIEDENEN Werten anliegen:
   * mit nur `cf-connecting-ip` wäre auch die vertauschte Reihenfolge grün.
   */
  it("gibt `cf-connecting-ip` den Vorrang vor `x-forwarded-for`", () => {
    const h = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1",
    });
    expect(clientIpAus(h)).toBe("203.0.113.7");
  });

  /*
   * Ein Fall gegen zwei Mutationen gleichzeitig: „ganzen Header zurückgeben"
   * (dann käme die Liste) und „`.trim()` weglassen" (dann käme " 203.0.113.7").
   */
  it("nimmt ohne `cf-connecting-ip` den ERSTEN Wert aus `x-forwarded-for`, getrimmt", () => {
    const h = new Headers({ "x-forwarded-for": "  203.0.113.7 , 198.51.100.1" });
    expect(clientIpAus(h)).toBe("203.0.113.7");
  });

  it("liefert ohne beide Header `\"unknown\"`", () => {
    expect(clientIpAus(new Headers())).toBe("unknown");
  });

  /*
   * Heutiges Verhalten, ausdrücklich festgehalten statt „behoben": ein leeres
   * erstes Segment fällt auf "unknown" durch, es wird NICHT zum zweiten Wert
   * weitergesucht. Die Hebung ändert die Signatur, nicht die Auswertung.
   */
  it("fällt bei leerem erstem `x-forwarded-for`-Segment auf `\"unknown\"` zurück", () => {
    const h = new Headers({ "x-forwarded-for": "  , 198.51.100.1" });
    expect(clientIpAus(h)).toBe("unknown");
  });
});
