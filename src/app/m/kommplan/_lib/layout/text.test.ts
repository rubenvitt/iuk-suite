import { describe, expect, it } from "vitest";
import { ARIMO_TEXT_METRICS } from "@einsatzzeichen/catalog";
import { PT_IN_MM } from "./masse";
import { grundlinie, kuerze, textBreite, umbrechen } from "./text";

/** Unabhängige Referenz über das Paket selbst (nur im Test erlaubt). */
function referenz(text: string, pt: number, fett = false): number {
  const m = fett ? ARIMO_TEXT_METRICS.bold! : ARIMO_TEXT_METRICS;
  const cps = [...text].map((c) => c.codePointAt(0)!);
  let em = 0;
  cps.forEach((cp, i) => {
    em += m.advanceEm(cp) ?? 0;
    // `kerningEm` ist in der Schnittstelle (core 1.5.0, verschachtelt im Katalog) OPTIONAL —
    // ohne `?.` bricht `pnpm typecheck` mit TS2722, während Vitest grün bleibt.
    if (i > 0) em += m.kerningEm?.(cps[i - 1], cp) ?? 0;
  });
  return em * pt * PT_IN_MM;
}

describe("textBreite", () => {
  it.each(["Leitstelle Uelzen", "RK UE 40-05-1", "fel@landkreis-uelzen.de", "ÖEL Fußstreife", "AV Tê"])(
    "%s misst wie ARIMO_TEXT_METRICS (normal und fett)",
    (t) => {
      expect(textBreite(t, 8)).toBeCloseTo(referenz(t, 8), 9);
      expect(textBreite(t, 9.5, true)).toBeCloseTo(referenz(t, 9.5, true), 9);
    },
  );
  it("wächst linear mit der Schriftgröße", () => {
    expect(textBreite("Stab", 16)).toBeCloseTo(2 * textBreite("Stab", 8), 9);
  });
  it("leerer Text ist 0 breit", () => expect(textBreite("", 8)).toBe(0));
  it("Zeichen außerhalb des Subsets (Emoji, CJK) werfen nicht und bekommen eine Breite > 0", () => {
    expect(textBreite("🚑", 8)).toBeGreaterThan(0);
    expect(textBreite("救护车", 8)).toBeGreaterThan(0);
  });
});

describe("umbrechen", () => {
  it("bricht an Wortgrenzen", () => {
    const r = umbrechen("EA 2 Notunterkunft 2. Sternschule", 32, 9.5, true, 3);
    expect(r.zeilen.length).toBeGreaterThan(1);
    expect(r.zeilen.join(" ")).toBe("EA 2 Notunterkunft 2. Sternschule");
    for (const z of r.zeilen) expect(textBreite(z, 9.5, true)).toBeLessThanOrEqual(32 + 1e-9);
    expect(r.gekuerzt).toBe(false);
  });
  it("bricht ein überlanges Wort bevorzugt nach - / @ . _", () => {
    // bei 22 mm passt „fel@landkreis-uel"; die letzte Bruchstelle darin ist der Bindestrich
    const r = umbrechen("fel@landkreis-uelzen.de", 22, 8, false, 2);
    expect(r.zeilen).toEqual(["fel@landkreis-", "uelzen.de"]);
  });
  it("bricht ein Wort ohne Bruchstelle hart und verliert kein Zeichen", () => {
    const r = umbrechen("Bereitstellungsraumkoordinationsstelle", 20, 9.5, true, 10);
    expect(r.zeilen.length).toBeGreaterThan(1);
    for (const z of r.zeilen) expect(textBreite(z, 9.5, true)).toBeLessThanOrEqual(20 + 1e-9);
    expect(r.zeilen.join("")).toBe("Bereitstellungsraumkoordinationsstelle");
    expect(r.gekuerzt).toBe(false);
  });
  it("kürzt nach maxZeilen mit … und meldet es", () => {
    const r = umbrechen("eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf", 15, 9.5, true, 3);
    expect(r.zeilen).toHaveLength(3);
    expect(r.zeilen[2].endsWith("…")).toBe(true);
    expect(textBreite(r.zeilen[2], 9.5, true)).toBeLessThanOrEqual(15 + 1e-9);
    expect(r.gekuerzt).toBe(true);
  });
  it("leerer Text ergibt eine leere Zeile", () => {
    expect(umbrechen("", 30, 8, false, 2)).toEqual({ zeilen: [""], gekuerzt: false });
  });
  it("mehrfache Leerzeichen und Zeilenumbrüche werden zu einem Leerzeichen", () => {
    expect(umbrechen("  A \n  B  ", 30, 8, false, 2).zeilen).toEqual(["A B"]);
  });
});

describe("kuerze / grundlinie", () => {
  it("lässt passenden Text unverändert", () => expect(kuerze("RTW", 40, 8, false)).toEqual({ text: "RTW", gekuerzt: false }));
  it("kürzt mit … auf die Breite", () => {
    const r = kuerze("KTW RK UE 41-92-12 mit sehr langem Anhang", 20, 8, false);
    expect(r.gekuerzt).toBe(true);
    expect(r.text.endsWith("…")).toBe(true);
    expect(textBreite(r.text, 8)).toBeLessThanOrEqual(20 + 1e-9);
  });
  it("die Grundlinie liegt innerhalb der Zeile und unterhalb der Mitte", () => {
    const y = grundlinie(10, 4.5, 8);
    expect(y).toBeGreaterThan(12.25);
    expect(y).toBeLessThan(14.5);
  });
});
