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
