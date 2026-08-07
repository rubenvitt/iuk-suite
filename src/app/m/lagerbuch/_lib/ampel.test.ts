import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { loadBindings } from "next/dist/build/swc";
import { AMPEL_HELL, AMPEL_DUNKEL, AMPEL_RANG, ampelVar } from "./ampel";
import { FARBEN } from "@/core/theme/tokens";

function luminanz(hex: string): number {
  const kanaele = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * kanaele[0] + 0.7152 * kanaele[1] + 0.0722 * kanaele[2];
}

function kontrast(a: string, b: string): number {
  const [l1, l2] = [luminanz(a), luminanz(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("Ampelpalette: die Werte", () => {
  it("hell traegt genau die vier Paare aus Spec 6.6.2", () => {
    expect(AMPEL_HELL).toEqual({
      ok: { text: "#1e7a3c", flaeche: "#e4f2e9" },
      gelb: { text: "#8a5200", flaeche: "#fbf1dc" },
      rot: { text: "#8c0d16", flaeche: "#f6e3e0" },
      grau: { text: "#5b6570", flaeche: "#e7eaec" },
    });
  });

  it("dunkel traegt genau die vier Paare aus Spec 6.6.2", () => {
    expect(AMPEL_DUNKEL).toEqual({
      ok: { text: "#7ee0a0", flaeche: "#10261a" },
      gelb: { text: "#d9a032", flaeche: "#2a1e05" },
      rot: { text: "#e8837c", flaeche: "#2a1113" },
      grau: { text: "#9aa4ad", flaeche: "#1c2024" },
    });
  });

  it("Gruen bleibt der gewohnte Wert vom Etikett", () => {
    expect(AMPEL_HELL.ok.text).toBe("#1e7a3c");
  });
});

describe("Ampelpalette: Luminanz als farbunabhaengiger Rangkanal", () => {
  it.each([
    ["hell", AMPEL_HELL],
    ["dunkel", AMPEL_DUNKEL],
  ])("%s faellt bzw. steigt streng monoton ueber ok -> gelb -> rot", (_name, palette) => {
    const werte = AMPEL_RANG.map((t) => luminanz(palette[t].text));
    const richtung = Math.sign(werte[1] - werte[0]);
    expect(richtung, "ok und gelb duerfen nicht dieselbe Luminanz haben").not.toBe(0);
    for (let i = 1; i < werte.length; i++) {
      expect(
        Math.sign(werte[i] - werte[i - 1]),
        `Rangfolge bricht zwischen ${AMPEL_RANG[i - 1]} und ${AMPEL_RANG[i]}`,
      ).toBe(richtung);
    }
  });

  it("`grau` steht AUSSERHALB der Rangfolge", () => {
    expect(AMPEL_RANG).toEqual(["ok", "gelb", "rot"]);
    expect(AMPEL_RANG).not.toContain("grau");
  });
});

describe("Ampelpalette: Kontrast", () => {
  it.each([
    ["hell", AMPEL_HELL],
    ["dunkel", AMPEL_DUNKEL],
  ])("%s erreicht je Ton mindestens AA gegen die eigene Flaeche", (_name, palette) => {
    for (const [ton, paar] of Object.entries(palette)) {
      expect(kontrast(paar.text, paar.flaeche), `${_name}/${ton}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("heilt den bestehenden AA-Verstosz von chip-gelb (heute 3,78 : 1)", () => {
    expect(kontrast("#b26a00", "#fbf1dc")).toBeLessThan(4.5);
    expect(kontrast(AMPEL_HELL.gelb.text, AMPEL_HELL.gelb.flaeche)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Ampelpalette: Ampel-Rot ist NICHT Suite-Rot", () => {
  it("kein Ton traegt #c8000f — Rot ist Marke und Primaeraktion, nie Statusfarbe", () => {
    for (const palette of [AMPEL_HELL, AMPEL_DUNKEL]) {
      for (const paar of Object.values(palette)) {
        expect(paar.text.toLowerCase()).not.toBe(FARBEN.rot.toLowerCase());
        expect(paar.flaeche.toLowerCase()).not.toBe(FARBEN.rot.toLowerCase());
      }
    }
    expect(AMPEL_HELL.rot.text).not.toBe(FARBEN.rot);
  });
});

describe("ampelVar", () => {
  it("bildet Ton und Rolle auf den CSS-Variablennamen ab", () => {
    expect(ampelVar("rot", "text")).toBe("--lb-ampel-rot-text");
    expect(ampelVar("ok", "flaeche")).toBe("--lb-ampel-ok-flaeche");
  });
});

const CSS_DATEIEN = [
  { pfad: "src/app/m/lagerbuch/_ui/verwaltung.module.css", traeger: "modul", pflicht: true },
  { pfad: "src/app/m/lagerbuch/_ui/helfer.module.css", traeger: "rahmen", pflicht: false },
] as const;

describe("Ampelpalette: TS und CSS tragen dieselben Werte", () => {
  it("verwaltung.module.css existiert — sie ist Pflicht", () => {
    expect(existsSync(CSS_DATEIEN[0].pfad)).toBe(true);
  });

  it("laesst den KPI-Raster bei Row und Col und exportiert den neutralen .kpis-Marker", async () => {
    const css = readFileSync(CSS_DATEIEN[0].pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const treffer = /^\.kpis\s*\{([^}]*)\}/m.exec(css);
    expect(treffer, ".kpis muss als CSS-Regel bestehen").not.toBeNull();
    expect(treffer?.[1] ?? "").not.toMatch(/\b(?:display|grid(?:-[\w-]+)?|columns)\s*:/);

    const bindings = await loadBindings();
    for (const minify of [false, true]) {
      const transformed = await bindings.css.lightning.transform({
        filename: CSS_DATEIEN[0].pfad,
        code: Buffer.from(css),
        cssModules: { pattern: "[name]__[local]" },
        minify,
      }) as { exports?: Record<string, unknown> };
      expect(transformed.exports, `minify=${minify}`).toHaveProperty("kpis");
    }
  });

  for (const datei of CSS_DATEIEN) {
    describe(datei.pfad, () => {
      for (const [ton, paar] of Object.entries(AMPEL_HELL)) {
        for (const rolle of ["text", "flaeche"] as const) {
          it(`hell: --lb-ampel-${ton}-${rolle} traegt ${paar[rolle]}`, () => {
            if (!datei.pflicht && !existsSync(datei.pfad)) return;
            const css = readFileSync(datei.pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            const hell = css.slice(0, css.indexOf('[data-theme="dark"]'));
            expect(hell, `Traeger .${datei.traeger} fehlt`).toMatch(new RegExp(`\\.${datei.traeger}\\s*\\{`));
            expect(hell).toMatch(
              new RegExp(`--lb-ampel-${ton}-${rolle}\\s*:\\s*${paar[rolle]}\\s*[;}]`, "i"),
            );
          });
        }
      }

      for (const [ton, paar] of Object.entries(AMPEL_DUNKEL)) {
        for (const rolle of ["text", "flaeche"] as const) {
          it(`dunkel: --lb-ampel-${ton}-${rolle} traegt ${paar[rolle]}`, () => {
            if (!datei.pflicht && !existsSync(datei.pfad)) return;
            const css = readFileSync(datei.pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
            const i = css.indexOf('[data-theme="dark"]');
            expect(i, "kein :root[data-theme=\"dark\"]-Block").toBeGreaterThan(-1);
            expect(css.slice(i)).toMatch(
              new RegExp(`--lb-ampel-${ton}-${rolle}\\s*:\\s*${paar[rolle]}\\s*[;}]`, "i"),
            );
          });
        }
      }

      it("schaltet ueber `data-theme`, nicht ueber `prefers-color-scheme`", () => {
        if (!datei.pflicht && !existsSync(datei.pfad)) return;
        const css = readFileSync(datei.pfad, "utf8");
        expect(css).not.toMatch(/prefers-color-scheme/);
        expect(css).toMatch(/:root\[data-theme="dark"\]/);
      });

      it("benutzt keine `--ant-*`-Variablen (die sieht eigenes Markup nicht)", () => {
        if (!datei.pflicht && !existsSync(datei.pfad)) return;
        expect(readFileSync(datei.pfad, "utf8")).not.toMatch(/var\(--ant-/);
      });

      it("enthaelt keine Medienabfrage; jede vorhandene max-width schreibt 767.98", () => {
        if (!datei.pflicht && !existsSync(datei.pfad)) return;
        const css = readFileSync(datei.pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        for (const treffer of css.matchAll(/\(max-width:\s*([\d.]+)px\)/g)) {
          expect(treffer[1]).toBe("767.98");
        }
        expect(css).not.toMatch(/\(min-width:/);
      });
    });
  }
});
