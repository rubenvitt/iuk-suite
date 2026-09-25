import { describe, it, expect } from "vitest";
import { AblehnungsDrossel } from "./anmeldeSchranke";

describe("AblehnungsDrossel (DRK-447)", () => {
  const mitUhr = (max: number) => {
    let t = 1_000_000;
    const drossel = new AblehnungsDrossel({ max, windowMs: 60_000, now: () => t });
    return { drossel, vor: (ms: number) => { t += ms; } };
  };

  it("bis zum Budget einzeln, dann genau eine Markierung, danach still", () => {
    const { drossel } = mitUhr(3);
    const folge = Array.from({ length: 7 }, () => drossel.entscheiden());
    expect(folge).toEqual(["einzeln", "einzeln", "einzeln", "gedrosselt", "still", "still", "still"]);
  });

  it("ein neues Fenster beginnt mit vollem Budget und erlaubt wieder eine Markierung", () => {
    const { drossel, vor } = mitUhr(2);
    for (let i = 0; i < 5; i++) drossel.entscheiden();
    vor(59_999);
    expect(drossel.entscheiden()).toBe("still");
    vor(1);
    expect([drossel.entscheiden(), drossel.entscheiden(), drossel.entscheiden(), drossel.entscheiden()]).toEqual(["einzeln", "einzeln", "gedrosselt", "still"]);
  });

  it("unter dem Budget keine Markierung", () => {
    const { drossel, vor } = mitUhr(2);
    expect(drossel.entscheiden()).toBe("einzeln");
    vor(60_000);
    expect(drossel.entscheiden()).toBe("einzeln");
    expect(drossel.entscheiden()).toBe("einzeln");
  });
});
