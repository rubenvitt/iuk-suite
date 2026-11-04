import { describe, expect, it } from "vitest";
import { AblehnungsDrossel } from "./drossel";


describe("AblehnungsDrossel mit Bündelfenster", () => {
  it("still innerhalb des Bündels, ohne das Budget zu belasten", () => {
    let t = 1_000_000;
    const drossel = new AblehnungsDrossel({ max: 2, windowMs: 60_000, buendelMs: 2_000, now: () => t });
    expect(drossel.entscheiden()).toBe("einzeln");
    t += 10;
    expect(drossel.entscheiden()).toBe("still");
    t += 1_989;
    expect(drossel.entscheiden()).toBe("still");
    t += 1;
    expect(drossel.entscheiden()).toBe("einzeln");
    t += 2_000;
    expect([drossel.entscheiden(), drossel.entscheiden()]).toEqual(["gedrosselt", "still"]);
  });
});
