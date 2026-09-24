import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import kanonischJson from "./kanonisch.json";
import { erzeugeKanonisch } from "./kanonisch-faelle";

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
});
