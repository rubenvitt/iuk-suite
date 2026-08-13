// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { theme as antdTheme } from "antd";
import { ARBEITSDICHTE, buildTheme, type ThemeMode } from "@/core/theme/theme";
import { FARBEN, SPACE, TAP, TAP_XL } from "@/core/theme/tokens";

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

  it.each(MODES)("setzt Suite-Rot als Seed im Modus %s", (mode) => {
    // Geprüft wird der SEED, nicht der abgeleitete Token: antds darkAlgorithm
    // rechnet colorPrimary für den Kontrast auf dunklem Grund bewusst um
    // (#c8000f -> #ad0310, via generate(seed, {theme:'dark'})[5]). Diese
    // Verschiebung ist gewollt — sie zurückzudrehen hieße, dem Design-System
    // seine Lesbarkeitsregel zu nehmen. Unsere Zusage ist "die Suite ist auf
    // Suite-Rot eingestellt", nicht "jeder Modus zeigt denselben Hexwert".
    expect(buildTheme(mode).token?.colorPrimary).toBe(FARBEN.rot);
  });

  it("gibt Suite-Rot im hellen Modus unverändert durch", () => {
    // Im hellen Modus rechnet der defaultAlgorithm den Seed nicht um — hier
    // muss der abgeleitete Token also wirklich exakt die Suite-Farbe sein.
    const token = antdTheme.getDesignToken(buildTheme("light"));
    expect(token.colorPrimary.toLowerCase()).toBe(FARBEN.rot);
  });

  it("unterscheidet hellen und dunklen Grundton", () => {
    const light = antdTheme.getDesignToken(buildTheme("light"));
    const dark = antdTheme.getDesignToken(buildTheme("dark"));
    expect(light.colorBgBase).not.toBe(dark.colorBgBase);
  });

  it.each(MODES)("hängt die Polsterung der Kopfzeile nicht am Tap-Ziel, Modus %s", (mode) => {
    /*
     * DAS TAP-ZIEL HAT DIE KOPFZEILE STILLSCHWEIGEND VERENGT.
     *
     * antd rechnet `headerPadding = 0 ${controlHeightLG * 1.25}px`
     * (antd/es/layout/style/index.js:85 und 94). Mit antds Vorgabe 40 sind das
     * 50px; mit `TAP_XL` = 72 werden daraus 90px JE SEITE. Auf einem
     * 768px-Fenster blieben davon 588px Inhalt — zu wenig für Modultitel und
     * Nutzerblock, der Titel fiel auf 0px und jede Seite scrollte seitwärts.
     *
     * Die zweite Zusicherung belegt, dass die Falle wirklich existiert: ohne
     * sie wäre die erste bloß eine Abschrift des Codes und bliebe auch dann
     * grün, wenn antd die Ableitung eines Tages fallen ließe.
     */
    expect(buildTheme(mode).components?.Layout?.headerPadding).toBe(`0 ${SPACE.lg}px`);
    expect(TAP_XL * 1.25).toBeGreaterThan(SPACE.lg);
  });

  it.each(MODES)("hält die interaktive Größe der Radio-Marke im Modus %s", (mode) => {
    // Eigener Test, weil antd dieses Maß NICHT aus controlHeight ableitet —
    // der Test oben würde die Regression nicht sehen. Kein Checkbox-Gegenstück:
    // `controlInteractiveSize` ist bei Checkbox ein reines Alias-Token
    // (= controlHeight / 2) und wird von antds getComponentToken verworfen,
    // sobald der Component-Token dem globalen Wert gleicht — ein Eintrag hier
    // fände die Regression also nie. Dieser Test fängt "jemand löscht das
    // Radio-Override", nicht "antd benennt ein Token um oder honoriert es
    // nicht mehr" — die tatsächliche Zusage an der gerenderten Geometrie misst
    // e2e/qr.spec.ts ("Bedienelemente bleiben mit Handschuhen treffbar").
    const cfg = buildTheme(mode);
    expect(cfg.components?.Radio?.radioSize).toBeGreaterThanOrEqual(28);
  });
});

describe("ARBEITSDICHTE", () => {
  it("setzt genau die drei Größen und erbt alles andere", () => {
    /*
     * `controlHeight: TAP` (56) ist eine EINSATZANFORDERUNG — Bedienung mit
     * Handschuhen —, keine Stilfrage. Der Fehler war nie der Wert, sondern
     * seine REICHWEITE: er galt auch dort, wo mit Maus und Tastatur an einem
     * Schreibtisch gearbeitet wird.
     *
     * NACHGESEHEN, NICHT ANGENOMMEN (antd/es/config-provider/hooks/
     * useTheme.js:44-53): antd mischt `{...parentThemeConfig, ...themeConfig}`,
     * `token` flach und `components` eine Ebene tief. `algorithm`,
     * `colorPrimary`, `fontFamily`, `Layout` und `Input.inputFontSize` werden
     * also GEERBT. Wiederholte man sie hier, liefe die Kopie beim nächsten
     * Themewechsel still auseinander — genau das prüft dieser Test.
     *
     * `Radio` MUSS mit: das Elterntheme setzt `radioSize: 28, dotSize: 14`,
     * weil die Trefferfläche mit Handschuhen die ganze Zeile ist. Neben einem
     * 40px-Bedienelement ist eine 28px-Marke unverhältnismäßig, und der
     * Grund trägt am Schreibtisch nicht.
     */
    expect(ARBEITSDICHTE.token).toEqual({ controlHeight: 40, controlHeightLG: 48 });
    expect(ARBEITSDICHTE.components).toEqual({ Radio: { radioSize: 16, dotSize: 8 } });
    expect(ARBEITSDICHTE.algorithm, "algorithm wird geerbt, nie wiederholt").toBeUndefined();
    expect(ARBEITSDICHTE.token?.colorPrimary, "Farben werden geerbt, nie wiederholt").toBeUndefined();
  });

  it("trägt einen ausdrücklichen cssVar-Schlüssel", () => {
    /*
     * Ohne ihn erzeugt antd über `useId` einen generierten Schlüssel
     * (useTheme.js:35) und warnt in der Entwicklung ausdrücklich davor
     * (useTheme.js:19). Ein stabiler Name ist außerdem im Inspektor
     * auffindbar — `iuk` für die Suite, `iuk-arbeit` für die Dichte darin.
     */
    expect(ARBEITSDICHTE.cssVar).toEqual({ key: "iuk-arbeit" });
  });

  it("lässt `buildTheme` beim Handschuh-Maß", () => {
    // Die Einsatzanforderung bleibt die Vorgabe der Suite. Was sich geändert
    // hat, ist allein, wo sie NICHT mehr gilt.
    const t = buildTheme("light");
    expect(t.token?.controlHeight).toBe(56);
    expect(t.token?.controlHeightLG).toBe(72);
  });
});
