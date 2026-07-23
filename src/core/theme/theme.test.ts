// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { theme as antdTheme } from "antd";
import { buildTheme, type ThemeMode } from "@/core/theme/theme";
import { DRK, TAP, TAP_XL } from "@/core/theme/tokens";

const MODES: ThemeMode[] = ["light", "dark"];

describe("buildTheme", () => {
  // Der eigentliche Grund für diese Datei: die Tap-Höhen sind eine
  // Einsatzanforderung (Handschuhe), die nach dem Umbau nur noch an einer
  // Stelle hängt. Ohne diesen Test kippt sie beim nächsten Theme-Tweak still.
  it.each(MODES)("hält die Tap-Ziele im Modus %s ein", (mode) => {
    const token = antdTheme.getDesignToken(buildTheme(mode));
    expect(token.controlHeight).toBeGreaterThanOrEqual(TAP);
    expect(token.controlHeightLG).toBeGreaterThanOrEqual(TAP_XL);
  });

  it.each(MODES)("setzt DRK-Rot als Seed im Modus %s", (mode) => {
    // Geprüft wird der SEED, nicht der abgeleitete Token: antds darkAlgorithm
    // rechnet colorPrimary für den Kontrast auf dunklem Grund bewusst um
    // (#c8000f -> #ad0310, via generate(seed, {theme:'dark'})[5]). Diese
    // Verschiebung ist gewollt — sie zurückzudrehen hieße, dem Design-System
    // seine Lesbarkeitsregel zu nehmen. Unsere Zusage ist "die Suite ist auf
    // DRK-Rot eingestellt", nicht "jeder Modus zeigt denselben Hexwert".
    expect(buildTheme(mode).token?.colorPrimary).toBe(DRK.rot);
  });

  it("gibt DRK-Rot im hellen Modus unverändert durch", () => {
    // Im hellen Modus rechnet der defaultAlgorithm den Seed nicht um — hier
    // muss der abgeleitete Token also wirklich exakt die DRK-Farbe sein.
    const token = antdTheme.getDesignToken(buildTheme("light"));
    expect(token.colorPrimary.toLowerCase()).toBe(DRK.rot);
  });

  it("unterscheidet hellen und dunklen Grundton", () => {
    const light = antdTheme.getDesignToken(buildTheme("light"));
    const dark = antdTheme.getDesignToken(buildTheme("dark"));
    expect(light.colorBgBase).not.toBe(dark.colorBgBase);
  });
});
