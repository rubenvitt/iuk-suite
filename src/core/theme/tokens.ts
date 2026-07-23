/**
 * Rohwerte des Suite-Designs — die einzige Datei mit Hex-Codes.
 * Übernommen aus dem `@theme`-Block der abgelösten `globals.css`, damit der
 * Farbeindruck der Suite über den Umbau hinweg derselbe bleibt.
 */
export const DRK = {
  rot: "#c8000f",
  rotDunkel: "#a2000c",
  rotBg: "#fbe9eb",
  tinte: "#1a1d20",
  stahl: "#5b6570",
  linie: "#d9dde1",
  papier: "#eef0f1",
  karte: "#ffffff",
  gelb: "#b26a00",
  gelbBg: "#fbf1dc",
  ok: "#1e7a3c",
  okBg: "#e4f2e9",
} as const;

/**
 * Tap-Ziele für die Bedienung mit Handschuhen im Einsatz (übernommen aus
 * easy-qr). Das ist eine Einsatzanforderung, keine Stilfrage — deshalb an
 * genau einer Stelle, abgesichert durch `theme.test.ts`.
 */
export const TAP = 56;
export const TAP_XL = 72;

/**
 * Abstands-Skala der Suite (px), 4er-Raster. Die Spec sagt zu, dass Module ihre
 * Abstände aus `core/theme` beziehen statt sie erneut zu erfinden — vorher
 * standen dieselben Zahlen (4/8/12/16/24/32) als Literale über ein Dutzend
 * Dateien verstreut. Plain-Konstanten wie `TAP`, nicht antds `token.padding`:
 * die bräuchten `theme.useToken()` (client-only) und wären in den
 * Server-Komponenten (`portal/page`, `qr/page`, `qr/admin/page`) nicht nutzbar.
 *
 * Nur für Abstände (`gap`/`padding`/`margin`/`Row gutter`). Dimensionale Werte
 * (Höhen, `maxWidth`, `borderRadius`, `fontSize`) bleiben bewusst außen vor —
 * sie gehören zu anderen Achsen und dürfen sich einen Wert nicht mit einem
 * Abstand teilen, nur weil er zufällig gleich ist.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Inline-Style fürs Wurzel-`<label>` von `<Radio>`/`<Checkbox>`. Beide leiten
 * ihre Marke nicht aus `controlHeight` ab (siehe theme.ts) — selbst mit
 * vergrößerter Marke reicht die allein nicht, denn die tatsächliche
 * Trefferfläche im Einsatz mit Handschuhen ist die ganze ZEILE aus Marke und
 * Beschriftung. `style` an `<Radio>`/`<Checkbox>` landet laut antd-Quelle
 * (`useSemanticRootStyle`) als `root`-Style auf genau diesem `<label>`.
 * `alignItems: "center"` überschreibt antds Vorgabe `baseline`, die bei
 * vergrößerter Zeile Marke und Text auseinanderreißt.
 */
export const TAP_ROW: React.CSSProperties = { minHeight: TAP, alignItems: "center" };
