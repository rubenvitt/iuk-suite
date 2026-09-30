import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARIMO_TEXT_METRICS, RECIPES, TEXT_FONT_BOLD_SHA256, TEXT_FONT_SHA256 } from "@einsatzzeichen/catalog";
import zeichen from "./zeichen.generiert.json";
import grundlagen from "./grundlagen.generiert.json";

const ORDNER = "src/app/m/kommplan/_lib/zeichen";
const sha = (pfad: string) => createHash("sha256").update(readFileSync(pfad)).digest("hex");

describe("kommplan-Generat", () => {
  it("entspricht dem installierten Paketstand (neu erzeugt, byteweise verglichen)", () => {
    // Schreibt in einen Wegwerfordner, NIE in die eingecheckte Datei: ein Wächter, der die
    // Abweichung selbst wegschreibt, wäre genau einmal rot (Vorbild: der alte zeichen-Generator).
    const ziel = mkdtempSync(join(tmpdir(), "kommplan-generat-"));
    try {
      execFileSync("pnpm", ["exec", "tsx", "scripts/kommplan-zeichen-generat.ts", ziel], { stdio: "pipe" });
      for (const datei of ["zeichen.generiert.json", "grundlagen.generiert.json"]) {
        expect(
          readFileSync(join(ziel, datei), "utf8") === readFileSync(join(ORDNER, datei), "utf8"),
          `${datei} ist veraltet — pnpm exec tsx scripts/kommplan-zeichen-generat.ts`,
        ).toBe(true);
      }
    } finally {
      rmSync(ziel, { recursive: true, force: true });
    }
  }, 120_000);

  it("vermerkt fünf aufgelöste Paketversionen, in beiden Dateien gleich", () => {
    expect(zeichen.stand).toEqual(grundlagen.stand);
    for (const v of Object.values(zeichen.stand)) expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.keys(zeichen.stand).sort()).toEqual(["catalog", "catalogCore", "catalogSchema", "core", "schema"]);
  });

  it("trägt jedes Hauptrezept und die vier Zusatzzeichen", () => {
    const haupt = Object.keys(RECIPES).filter((k) => !k.includes("#"));
    const schluessel = Object.keys(zeichen.zeichen);
    expect(schluessel.length).toBe(haupt.length + 4);
    for (const k of haupt) expect(schluessel).toContain(`rezept:${k}`);
    for (const k of ["zusatz:eal", "zusatz:ea", "zusatz:stab", "zusatz:oel"]) expect(schluessel).toContain(k);
    const eintrag = (k: string) => (zeichen.zeichen as Record<string, { inhalt: string }>)[k].inhalt;
    expect(eintrag("rezept:D.1.4")).toContain(">EL<");
    expect(eintrag("zusatz:eal")).toContain(">EAL<");
    expect(eintrag("zusatz:eal")).not.toContain("Nord");
    // Wie das EL-Zeichen: schwarzes Kürzel auf Gelb, nicht Weiß auf Gelb (Abweichung U2).
    for (const k of ["zusatz:eal", "zusatz:ea", "zusatz:stab", "zusatz:oel"]) expect(eintrag(k)).not.toMatch(/<text[^>]*fill="#ffffff"/);
  });

  it("jede SVG-ID ist über beide Generate eindeutig (Befund M11)", () => {
    const alle = [
      ...Object.values(zeichen.zeichen as Record<string, { inhalt: string }>),
      ...Object.values(grundlagen.piktogramme as Record<string, { inhalt: string }>),
    ].flatMap((e) => [...e.inhalt.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("kein Symbol trägt font-family, title oder desc — die Schrift erbt es vom <svg>", () => {
    for (const e of [
      ...Object.values(zeichen.zeichen as Record<string, { inhalt: string }>),
      ...Object.values(grundlagen.piktogramme as Record<string, { inhalt: string }>),
    ]) {
      expect(e.inhalt).not.toMatch(/font-family|<title|<desc/);
    }
  });

  it("die kopierten Schriften sind die des Katalogs", () => {
    expect(sha("src/app/m/kommplan/_fonts/Arimo-Variable.ttf")).toBe(TEXT_FONT_SHA256);
    expect(sha("src/app/m/kommplan/_fonts/Arimo-Bold.ttf")).toBe(TEXT_FONT_BOLD_SHA256);
  });

  it("die Vorschübe stimmen mit ARIMO_TEXT_METRICS überein (normal und fett)", () => {
    const upem = grundlagen.metrik.einheitenProEm;
    const normal = grundlagen.metrik.normal.vorschub as Record<string, number>;
    const fett = grundlagen.metrik.fett.vorschub as Record<string, number>;
    for (let cp = 32; cp < 0x250; cp++) {
      const erwartet = ARIMO_TEXT_METRICS.advanceEm(cp);
      if (erwartet === undefined) { expect(normal[String(cp)]).toBeUndefined(); continue; }
      expect(normal[String(cp)] / upem).toBeCloseTo(erwartet, 12);
      expect(fett[String(cp)] / upem).toBeCloseTo(ARIMO_TEXT_METRICS.bold!.advanceEm(cp)!, 12);
    }
  });
});
