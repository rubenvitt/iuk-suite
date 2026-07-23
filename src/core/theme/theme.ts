import { theme as antdTheme, type ThemeConfig } from "antd";
import { DRK, TAP, TAP_XL } from "@/core/theme/tokens";

/** Die beiden Betriebsarten des Suite-Themes. Hier definiert, weil sie zum
 *  Theme gehören — `mode.ts` (Cookie-Transport) reicht den Typ nur weiter. */
export type ThemeMode = "light" | "dark";

/**
 * Das Design-System der Suite als eine Funktion. Reine Berechnung, kein React —
 * dadurch in `theme.test.ts` statisch prüfbar und aus Server- wie
 * Client-Komponenten aufrufbar.
 */
export function buildTheme(mode: ThemeMode): ThemeConfig {
  const dark = mode === "dark";
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    // CSS-Variablen statt eingebetteter Werte: der Moduswechsel ist damit ein
    // Variablen-Swap und keine Neu-Serialisierung der Stylesheets.
    cssVar: { key: "iuk" },
    hashed: false,
    token: {
      colorPrimary: DRK.rot,
      colorError: DRK.rot,
      colorWarning: DRK.gelb,
      colorSuccess: DRK.ok,
      colorLink: DRK.rot,
      borderRadius: 8,
      fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
      fontFamilyCode: "var(--font-geist-mono), ui-monospace, monospace",
      // GLOBAL, nicht unter `components`: nur globale Tokens sieht
      // theme.getDesignToken(), und nur so greift die Höhe auch auf Select,
      // DatePicker & Co., statt auf eine handgepflegte Komponentenliste.
      controlHeight: TAP,
      controlHeightLG: TAP_XL,
    },
    components: {
      // Layout-Flächen explizit, weil antds Vorgabe für Layout.Header ein
      // dunkles Blau ist, das mit DRK-Rot streitet.
      Layout: {
        headerBg: dark ? "#141414" : DRK.karte,
        headerColor: dark ? "#ffffff" : DRK.tinte,
        bodyBg: dark ? "#000000" : DRK.papier,
        headerHeight: 64,
      },
    },
  };
}
