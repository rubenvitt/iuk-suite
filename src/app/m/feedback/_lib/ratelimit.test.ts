import { describe, it, expect } from "vitest";
import { RateLimiter } from "./ratelimit";

describe("RateLimiter", () => {
  it("erlaubt bis max und blockt dann im Fenster", () => {
    let t = 1000;
    const rl = new RateLimiter({ windowMs: 1000, max: 2, now: () => t });
    expect(rl.check("ip1")).toBe(true);
    expect(rl.check("ip1")).toBe(true);
    expect(rl.check("ip1")).toBe(false); // 3. im Fenster
  });
  it("trennt Schlüssel", () => {
    let t = 1000;
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
