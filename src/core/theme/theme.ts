import { theme as antdTheme, type ThemeConfig } from "antd";
import { FARBEN, SPACE, TAP, TAP_XL } from "@/core/theme/tokens";

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
      colorPrimary: FARBEN.rot,
      colorError: FARBEN.rot,
      colorWarning: FARBEN.gelb,
      colorSuccess: FARBEN.ok,
      colorLink: FARBEN.rot,
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
      // dunkles Blau ist, das mit Suite-Rot streitet.
      Layout: {
        headerBg: dark ? "#141414" : FARBEN.karte,
        headerColor: dark ? "#ffffff" : FARBEN.tinte,
        bodyBg: dark ? "#000000" : FARBEN.papier,
        headerHeight: 64,
        /*
         * DAS TAP-ZIEL HAT DIE KOPFZEILE STILLSCHWEIGEND UM 80px VERENGT.
         *
         * antd leitet die Polsterung der Kopfzeile aus `controlHeightLG` ab:
         * `paddingInline = controlHeightLG * 1.25` (antd/es/layout/style/
         * index.js:85, eingesetzt Zeile 94). Mit antds Vorgabe 40 sind das die
         * bekannten 50px; mit `TAP_XL` = 72 — dem Handschuh-Masz der Suite —
         * werden daraus 90px JE SEITE, also 180px. Auf einem 768px-Fenster
         * blieben 588px Inhalt, und der Modultitel wurde auf 0px gedrueckt.
         *
         * `shell.module.css` hatte dagegen schon `padding-inline: 16px`
         * deklariert — nur galt es nie: `.kopf` und `.ant-layout-header` sind
         * beide (0,1,0), und antds Stylesheet kommt spaeter. Dieselbe Kollision
         * wie bei `.nurMobil` gegen `.ant-btn`. GEMESSEN, nicht hergeleitet:
         * `getComputedStyle(header).paddingLeft` war "90px".
         *
         * Der Weg ueber den Token statt ueber CSS-Spezifitaet ist derselbe wie
         * bei `inputFontSize` unten — er nimmt den Streit heraus, statt ihn zu
         * gewinnen. `SPACE.lg` deckt sich mit der Polsterung der Modulnavigation
         * in `shell.module.css`, damit Titel und Navigationszeile denselben
         * linken Rand haben.
         */
        headerPadding: `0 ${SPACE.lg}px`,
      },
      // antd leitet die Radio-Marke NICHT aus controlHeight ab, sondern aus
      // fontSizeLG (Default 16). Ohne dieses Override schrumpft die Marke der
      // Verschlüsselungswahl im WLAN-Formular auf gut ein Drittel — nachgewiesen
      // im Task-4-Review. (Checkbox braucht kein Gegenstück: ihre Marke ist
      // bereits `controlHeight / 2` = 28, mit wie ohne Override — ein
      // gleichlautender Eintrag unter `Checkbox` wäre totes Gewicht, siehe der
      // Review vor Task 6.)
      Radio: { radioSize: 28, dotSize: 14 },
      /*
       * Die Optionen der offenen Auswahlliste sind Tap-Ziele, die gelesen
       * werden muessen, bevor man sie trifft. Sie sind KEIN `input` — die
       * 16px-Regel in `globals.css` erreicht sie nicht, deshalb hier.
       *
       * Das ist keine Doppelung: die CSS-Regel deckt das geschlossene Feld ab
       * (ueber `.ant-select-selector`), dieser Token die offene Liste. Fuer den
       * Selektor selbst bietet antd keinen Token an — sonst staende er hier
       * statt in CSS.
       *
       * 16 ist ein Wert aus antds eigener Leiter (12/14/16/20/24/30), also
       * keine dritte Skala im Sinne von docs/design/README.md:110.
       */
      Select: { optionFontSize: 16 },
      /*
       * `inputFontSize`, NICHT `fontSize` — antd nennt den Token an diesen drei
       * Komponenten so. Der globale `fontSize` bliebe verboten, er verschoebe
       * die ganze Leiter (docs/design/README.md:110).
       *
       * Ueber Tokens statt ueber CSS-Spezifitaet, damit die Regel in
       * `globals.css` niedrig spezifisch bleiben kann und Modul-CSS sie
       * weiterhin nach oben ueberschreibt.
       *
       * `inputFontSizeLG` ZUSAETZLICH, weil `size="large"` sonst durch BEIDE
       * Wege faellt: antd leitet die groesze Variante nicht aus `inputFontSize`
       * ab (`antd/es/input/style/token.js:34` rechnet
       * `inputFontSizeLG || fontSizeLG`), und `.ant-input-lg` (0,1,0) schlaegt
       * die globale Regel `input { … }` (0,0,1) aus `globals.css`. Heute stehen
       * diese Felder nur ZUFAELLIG auf 16px, weil antds `fontSizeLG` per
       * Default 16 ist — ein Aufraeumen an den Tokens senkte sie still. Und
       * betroffen ist die haeufigste Eingabeform der Suite (preset-form 10x,
       * UrlInput, wifi, tel, contact, login-form).
       *
       * Kein `inputFontSizeSM`: das erbt laut `token.js:33` von
       * `inputFontSize`, dort ist keine Luecke.
       */
      Input: { inputFontSize: 16, inputFontSizeLG: 16 },
      InputNumber: { inputFontSize: 16, inputFontSizeLG: 16 },
      DatePicker: { inputFontSize: 16, inputFontSizeLG: 16 },
    },
  };
}
