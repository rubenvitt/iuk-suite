import { describe, expect, it } from "vitest";
import { freieLuecke, spurenZahl, verteileSpuren } from "./spuren";

const H = 3_600_000;
const s = (id: string, von: number, bis: number) => ({ id, von: von * H, bis: bis * H });

describe("verteileSpuren (IDA-385)", () => {
  it("ohne Überschneidung eine Spur je Schicht, volle Höhe", () => {
    const l = verteileSpuren([s("a", 8, 11), s("b", 11, 14), s("c", 14, 17)]);
    expect([...l.values()]).toEqual([{ spur: 0, spuren: 1 }, { spur: 0, spuren: 1 }, { spur: 0, spuren: 1 }]);
  });

  it("deckungsgleiche Schichten liegen übereinander, keine verdeckt die andere", () => {
    const l = verteileSpuren([s("alt", 8, 11), s("neu", 8, 11), s("rest", 11, 22)]);
    expect(l.get("alt")).toEqual({ spur: 0, spuren: 2 });
    expect(l.get("neu")).toEqual({ spur: 1, spuren: 2 });
    expect(l.get("rest")).toEqual({ spur: 0, spuren: 1 });
    expect(spurenZahl(l)).toBe(2);
  });

  it("eine Kette von Überschneidungen ist eine Gruppe, freie Spuren werden wiederverwendet", () => {
    const l = verteileSpuren([s("a", 8, 12), s("b", 10, 14), s("c", 12, 16)]);
    expect(l.get("a")).toEqual({ spur: 0, spuren: 2 });
    expect(l.get("b")).toEqual({ spur: 1, spuren: 2 });
    expect(l.get("c")).toEqual({ spur: 0, spuren: 2 });
  });
});

describe("freieLuecke (IDA-385)", () => {
  const rahmen = { von: 8 * H, bis: 22 * H };

  it("hinter der letzten Schicht, wenn dort Platz ist", () => {
    expect(freieLuecke([s("a", 8, 11)], rahmen, 3 * H, H / 6)).toEqual({ von: 11 * H, bis: 14 * H });
  });

  it("sonst die erste Lücke, zur Not kürzer", () => {
    expect(freieLuecke([s("a", 8, 11), s("b", 14, 22)], rahmen, 3 * H, H / 6)).toEqual({ von: 11 * H, bis: 14 * H });
    expect(freieLuecke([s("a", 8, 11), s("b", 12, 22)], rahmen, 3 * H, H / 6)).toEqual({ von: 11 * H, bis: 12 * H });
  });

  it("lückenlos belegt: keine Lücke", () => {
    expect(freieLuecke([s("a", 8, 11), s("b", 11, 15), s("c", 14, 22)], rahmen, 3 * H, H / 6)).toBeNull();
  });

  it("leere Zeile beginnt am Anfang", () => {
    expect(freieLuecke([], rahmen, 4 * H, H / 6)).toEqual({ von: 8 * H, bis: 12 * H });
  });
});
