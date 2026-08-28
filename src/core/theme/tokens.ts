/**
 * Rohwerte des Suite-Designs — die einzige Datei mit Hex-Codes.
 * Übernommen aus dem `@theme`-Block der abgelösten `globals.css`, damit der
 * Farbeindruck der Suite über den Umbau hinweg derselbe bleibt.
 *
 * AUSNAHME, ausdrücklich statt stillschweigend: fachsemantische Paletten eines
 * einzelnen Moduls (z. B. die Schulnoten-Ampel in
 * `app/m/feedback/_lib/noten.ts`) liegen beim Modul, weil sie Bedeutung eines
 * Fachbereichs tragen und nicht den Farbeindruck der Suite. Maßstab für einen
 * Umzug hierher bleibt ein zweiter, heute belegbarer Nutznießer — ein zweites
 * Modul, das deutsche Schulnoten anzeigt, existiert nicht.
 */
export const FARBEN = {
  rot: "#c8000f",
  rotDunkel: "#a2000c",
  /**
   * SUITE-ROT ALS TEXT AUF DUNKLEM GRUND. `#c8000f` selbst ist nie das
   * Problem — antds Dunkel-Algorithmus rechnet den Seed auf `#ad0310` herunter,
   * und das trägt auf `#141414` (Kartenfläche) 2,45:1: jeder Link, jede
   * Fehlermeldung, jeder `danger`-Knopf war im Dunkelmodus praktisch unlesbar
   * (gemessen 2026-08-28 in der Funkverwaltung, „Veraltete Geräte"; der Wert
   * gilt aber suiteweit, weil er im Theme sitzt). Derselbe Farbton (≈355°),
   * angehoben: 5,22:1 auf `#141414`, 4,67:1 auf `#1f1f1f` (Popover, Modal),
   * 5,95:1 auf `#000000`. Identisch mit `--iuk-marke` im Dunkelzweig von
   * `app/globals.css` — eigenes Markup und antd zeigen damit DASSELBE Rot;
   * `theme.test.ts` hält beide Stellen zusammen. Die zwei Nachbarn sind die
   * Hover-/Active-Stufen und bestehen ebenfalls 4,5:1 auf `#141414`.
   *
   * NUR TEXTROLLEN, nicht `colorPrimary`: ein gefüllter Knopf braucht weißen
   * Text mit 4,5:1 auf seiner Fläche, und das schließt sich mit 4,5:1 der
   * Fläche gegen `#141414` rechnerisch aus (L ≤ 0,18 gegen L ≥ 0,20). antds
   * Trennung bleibt deshalb: dunkles Rot als Fläche, dieses Rot als Text.
   */
  rotAufDunkel: "#e45a66",
  rotAufDunkelHover: "#ef7f89",
  rotAufDunkelActive: "#d9525e",
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
