import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import kanonischJson from "./kanonisch.json";
import { erzeugeKanonisch, KANONISCH_FAELLE } from "./kanonisch-faelle";

type Kanonisch = { name: string; wert: unknown; kanonisch: string }[];
const erwartet = kanonischJson as unknown as Kanonisch;

describe("JCS-Randfälle (Format-Vertrag mit der Desktop-App)", () => {
  it("kanonisch.json ist byte-genau das, was die Fälle erzeugen", () => {
    const datei = readFileSync(path.join(__dirname, "kanonisch.json"), "utf8");
    expect(datei).toBe(JSON.stringify(erzeugeKanonisch(), null, 2) + "\n");
  });
  it("die eingecheckten Fälle stimmen mit erzeugeKanonisch() überein", () => {
    expect(erzeugeKanonisch()).toEqual(erwartet);
  });
  it("jeder kanonische String ist ein Rundlauf: JSON.parse(kanonisch) === wert", () => {
    for (const fall of erwartet) {
      expect(JSON.parse(fall.kanonisch)).toEqual(fall.wert);
    }
  });
  /**
   * Stolperdraht: In `kanonisch-faelle.ts` ist ein roher Zeilentrenner (U+2028/U+2029) einmal
   * still zu einem gewöhnlichen Leerzeichen geworden — ein Editor kann das mit unsichtbaren
   * Codepunkten im Quelltext jederzeit wieder tun. Kein anderer Test bemerkt das:
   * `kanonisch.json` wird aus denselben Fällen erzeugt, und `kanonisch.rs` rechnet nur gegen
   * diese Datei nach — ein Verlust in `kanonisch-faelle.ts` bliebe also unbemerkt, solange
   * `kanonisch.json` nicht neu erzeugt wird. Dieser Test verlangt die Codepunkte ausdrücklich.
   * Die Vergleichswerte stehen deshalb selbst als `\u`-Escape da, nie als roher Codepunkt:
   * sonst träfe dieselbe stille Ersetzung Quelltext und Vergleichswert gleichermaßen, und der
   * Stolperdraht bliebe wirkungslos.
   */
  it("roh-bleibt-roh enthält U+2028, U+2029, DEL und BOM als echte Codepunkte", () => {
    const fall = KANONISCH_FAELLE.find((f) => f.name === "roh-bleibt-roh");
    expect(typeof fall?.wert).toBe("string");
    const wert = fall!.wert as string;
    expect(wert).toContain("\u2028");
    expect(wert).toContain("\u2029");
    expect(wert).toContain("\u007f");
    expect(wert).toContain("\uFEFF");
  });
  it("steuerzeichen enthält alle erwarteten Steuerzeichen als echte Codepunkte", () => {
    const fall = KANONISCH_FAELLE.find((f) => f.name === "steuerzeichen");
    expect(typeof fall?.wert).toBe("string");
    const wert = fall!.wert as string;
    for (const zeichen of ["\u0000", "\u0001", "\u0008", "\u0009", "\u000a", "\u000b", "\u000c", "\u000d", "\u001f"]) {
      expect(wert).toContain(zeichen);
    }
  });
});
