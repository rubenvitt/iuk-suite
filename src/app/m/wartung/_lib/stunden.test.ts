import { describe, expect, it } from "vitest";
import { korrekturFrage, leseStunden, pruefeStundenEingabe, sprungFrage, STUNDEN_SPRUNG, stundenZeile } from "./stunden";

const wert = (t: string) => {
  const l = leseStunden(t);
  return l.art === "zahl" ? l.wert : l.art;
};

describe("leseStunden (IDA-381)", () => {
  it("liest das Komma als Dezimalzeichen und rundet, statt es zu verschlucken", () => {
    expect(wert("231,5")).toBe(232);
    expect(wert("231,4")).toBe(231);
    expect(wert("231,")).toBe(231);
    expect(leseStunden("231,5")).toEqual({ art: "zahl", wert: 232, gerundet: true });
  });

  it("ein Punkt vor ein oder zwei Ziffern ist ein Dezimalpunkt", () => {
    expect(wert("231.5")).toBe(232);
    expect(wert("231.25")).toBe(231);
    expect(wert("0.5")).toBe(1);
  });

  it("ein Punkt vor genau drei Ziffern trennt Tausender", () => {
    expect(wert("1.234")).toBe(1234);
    expect(wert("12.345.678")).toBe("ungueltig");
    expect(wert("123.456")).toBe(123456);
    expect(wert("1.234,5")).toBe(1235);
    expect(leseStunden("1.234")).toEqual({ art: "zahl", wert: 1234, gerundet: false });
  });

  it("verträgt Leerzeichen und ein angehängtes h", () => {
    expect(wert(" 1 234 h")).toBe(1234);
    expect(wert("231H")).toBe(231);
    expect(wert("  ")).toBe("leer");
  });

  it("lehnt ab, was keine Zahl ist", () => {
    for (const t of ["abc", "12a", "1,2,3", "1.23.4,5", "12.34.5", "-5", "1e5", "1..2", ","]) expect(wert(t), t).toBe("ungueltig");
    expect(leseStunden("-5")).toEqual({ art: "ungueltig", fehler: "Nicht negativ." });
    expect(wert("1000001")).toBe("ungueltig");
    expect(wert("1000000")).toBe(1_000_000);
  });
});

describe("pruefeStundenEingabe (IDA-381)", () => {
  it("fragt bei mehr als STUNDEN_SPRUNG über dem letzten Stand nach", () => {
    expect(pruefeStundenEingabe(String(231 + STUNDEN_SPRUNG), 231).art).toBe("ok");
    expect(pruefeStundenEingabe(String(232 + STUNDEN_SPRUNG), 231).art).toBe("sprung");
    expect(pruefeStundenEingabe("2121", 231)).toEqual({ art: "sprung", wert: 2121, gerundet: false, plus: 1890 });
    expect(sprungFrage(1890)).toBe("+1.890 h seit dem letzten Stand?");
  });

  it("ohne letzten Stand gibt es weder Sprung noch Rückschritt", () => {
    expect(pruefeStundenEingabe("99999", null).art).toBe("ok");
  });

  it("meldet einen kleineren Stand, auch wenn er erst durch Runden kleiner ist", () => {
    expect(pruefeStundenEingabe("230", 231)).toEqual({ art: "kleiner", wert: 230, gerundet: false, zuletzt: 231 });
    expect(pruefeStundenEingabe("231,4", 231).art).toBe("ok");
    expect(pruefeStundenEingabe("230,4", 231).art).toBe("kleiner");
    expect(korrekturFrage(2315, 231)).toBe("Stand von 2.315 h auf 231 h korrigieren?");
  });

  it("die Zeile unter dem Feld nennt Fehler, Rundung und den letzten Stand", () => {
    expect(stundenZeile(pruefeStundenEingabe("", 100), 100)).toBe("Zuletzt 100 h");
    expect(stundenZeile(pruefeStundenEingabe("", null), null)).toBeNull();
    expect(stundenZeile(pruefeStundenEingabe("120,5", 100), 100)).toBe("Gerundet auf 121 h");
    expect(stundenZeile(pruefeStundenEingabe("x", 100), 100)).toBe("Bitte den Stand als Zahl eingeben.");
    expect(stundenZeile(pruefeStundenEingabe("90", 100), 100)).toBe("Kleiner als der letzte Stand (100 h).");
  });
});
