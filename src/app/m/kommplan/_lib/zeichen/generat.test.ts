import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARIMO_TEXT_METRICS, RECIPES, TEXT_FONT_BOLD_SHA256, TEXT_FONT_SHA256 } from "@einsatzzeichen/catalog";
import { SECHSECK } from "../layout/masse";
import { VERBINDUNG_PIKTOGRAMM } from "./grundlagen";
import zeichen from "./zeichen.generiert.json";
import zeichenSw from "./zeichen-sw.generiert.json";
import schrift from "./schrift.generiert.json";
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
      for (const datei of ["zeichen.generiert.json", "zeichen-sw.generiert.json", "grundlagen.generiert.json", "schrift.generiert.json"]) {
        expect(
          readFileSync(join(ziel, datei), "utf8") === readFileSync(join(ORDNER, datei), "utf8"),
          `${datei} ist veraltet — pnpm exec tsx scripts/kommplan-zeichen-generat.ts`,
        ).toBe(true);
      }
    } finally {
      rmSync(ziel, { recursive: true, force: true });
    }
  }, 120_000);

  it("vermerkt fünf aufgelöste Paketversionen, in allen vier Dateien gleich", () => {
    expect(zeichen.stand).toEqual(grundlagen.stand);
    expect(zeichenSw.stand).toEqual(zeichen.stand);
    expect(schrift.stand).toEqual(zeichen.stand);
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

  it("Schwarzweiß (Phase 5, Entscheidung 14): dieselben Schlüssel, kein Buntton, Strichmuster der Organisationen", () => {
    const farbe = zeichen.zeichen as Record<string, { inhalt: string }>;
    const sw = zeichenSw.zeichen as Record<string, { viewBox: string; inhalt: string }>;
    expect(Object.keys(sw)).toEqual(Object.keys(farbe));
    const bunt = Object.entries(sw).flatMap(([k, e]) => [...e.inhalt.matchAll(/#([0-9a-f]{6})\b/gi)]
      .map((m) => m[1].toLowerCase()).filter((h) => !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6))).map((h) => `${k}: #${h}`));
    expect(bunt).toEqual([]);
    expect(Object.values(sw).some((e) => /rgb\(|hsl\(/.test(e.inhalt))).toBe(false);
    expect(Object.values(sw).filter((e) => e.inhalt.includes("stroke-dasharray")).length).toBeGreaterThan(100);
    expect(sw["rezept:C.1.1"].inhalt).not.toBe(farbe["rezept:C.1.1"].inhalt); // Löschstaffel: in Farbe rot
    for (const k of ["zusatz:eal", "zusatz:ea", "zusatz:stab", "zusatz:oel"]) expect(sw[k].inhalt).toContain(`>${k === "zusatz:oel" ? "ÖEL" : k === "zusatz:stab" ? "Stab" : k.slice(7).toUpperCase()}<`);
  });
  it("jede SVG-ID ist im SW-Satz samt Piktogrammen eindeutig (ein Druck lädt nur einen der beiden Sätze)", () => {
    const alle = [
      ...Object.values(zeichenSw.zeichen as Record<string, { inhalt: string }>),
      ...Object.values(grundlagen.piktogramme as Record<string, { inhalt: string }>),
    ].flatMap((e) => [...e.inhalt.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(alle).size).toBe(alle.length);
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

  it("Verbindungs-Piktogramme zeichnen im Sechseck mit mindestens 0,18 mm Strich (Draht war 0,07 mm)", () => {
    const pikto = grundlagen.piktogramme as Record<string, { viewBox: string; inhalt: string }>;
    for (const id of new Set(Object.values(VERBINDUNG_PIKTOGRAMM))) {
      const [, , w, h] = pikto[id].viewBox.split(/\s+/).map(Number);
      const s = Math.min(SECHSECK.piktoBreite / w, SECHSECK.piktoHoehe / h);
      for (const m of pikto[id].inhalt.matchAll(/<[^>]*\bstroke-width="([\d.]+)"[^>]*>/g)) {
        const skala = Number(/transform="scale\(([\d.]+)\)"/.exec(m[0])?.[1] ?? 1);
        expect(Number(m[1]) * skala * s, `${id}: ${m[0].slice(0, 60)}`).toBeGreaterThanOrEqual(0.18 - 1e-6);
      }
    }
  });

  it("große Kürzel (EL, UEAL, KatSL …) lassen im Führungszeichen Luft zum Rahmen", () => {
    const breite = (text: string, groesse: number) =>
      [...text].reduce((summe, c) => summe + (ARIMO_TEXT_METRICS.advanceEm(c.codePointAt(0)!) ?? 0.6), 0) * groesse;
    let gezaehlt = 0;
    for (const [k, e] of Object.entries(zeichen.zeichen as Record<string, { inhalt: string }>)) {
      for (const m of e.inhalt.matchAll(/<text\b[^>]*\bfont-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
        if (Number(m[1]) < 25) continue;
        gezaehlt++;
        expect(breite(m[2], Number(m[1])), `${k} „${m[2]}"`).toBeLessThanOrEqual(72.01); // Schriftgröße auf 0,001 gerundet
      }
    }
    expect(gezaehlt).toBeGreaterThan(5);
    expect((zeichen.zeichen as Record<string, { inhalt: string }>)["rezept:D.1.2"].inhalt).toContain(">KatSL<");
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
  it("die Schrift für den SVG-Export ist Arimo-Variable des Katalogs, byteweise (Entscheidung 15)", () => {
    const bytes = Buffer.from(schrift.arimoVariable, "base64");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(TEXT_FONT_SHA256);
    expect(sha("src/app/m/kommplan/_fonts/Arimo-Variable.ttf")).toBe(TEXT_FONT_SHA256);
    expect(schrift.stand).toEqual(zeichen.stand);
  });
});
