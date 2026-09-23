// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import {
  Checkbox,
  ConfigProvider,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Select,
  theme as antdTheme,
} from "antd";
import { ARBEITSDICHTE, SCHREIBTISCHDICHTE, buildTheme, type ThemeMode } from "@/core/theme/theme";
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
    // rechnet colorPrimary auf dunklem Grund um (#c8000f -> #ad0310, via
    // generate(seed, {theme:'dark'})[5]). Für FLÄCHEN ist das richtig (weißer
    // Text darauf: 7,5:1). Hier stand bis 2026-08-28, die Verschiebung sei „die
    // Lesbarkeitsregel des Design-Systems" — das stimmte nur für Flächen; als
    // TEXT trug #ad0310 auf #141414 ganze 2,45:1. Die Textrollen korrigiert
    // der zweite Algorithmus-Schritt in `theme.ts`, geprüft unten.
    expect(buildTheme(mode).token?.colorPrimary).toBe(FARBEN.rot);
  });

  /**
   * WCAG-Kontrast (sRGB-linearisiert) — dieselbe Rechnung wie im Kommentar von
   * `app/globals.css` an `--iuk-marke`. Hier im Test, damit ein späterer
   * „schönerer" Rotton den Text nicht still wieder unter die Schwelle drückt.
   */
  const kontrast = (a: string, b: string) => {
    const lum = (hex: string) => {
      const c = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4]
        .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hoch, tief] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hoch + 0.05) / (tief + 0.05);
  };

  const TEXTROLLEN = [
    "colorLink",
    "colorLinkHover",
    "colorPrimaryText",
    "colorPrimaryTextHover",
    "colorError",
    "colorErrorText",
    "colorErrorHover",
    "colorErrorTextHover",
  ] as const;

  it("hebt Suite-Rot im Dunkelmodus als Text auf AA (4,5:1)", () => {
    // Der Anlass: „Veraltete Geräte" in der Funkverwaltung, dunkelrote Links
    // auf nahezu Schwarz. Gemessen wird gegen die beiden dunklen Flächen, auf
    // denen Text tatsächlich sitzt: colorBgContainer (Karte, #141414) und
    // colorBgElevated (Popover/Modal, #1f1f1f). Nicht gegen bodyBg #000000 —
    // dort ist der Kontrast ohnehin höher.
    const token = antdTheme.getDesignToken(buildTheme("dark"));
    for (const rolle of TEXTROLLEN) {
      for (const flaeche of [token.colorBgContainer, token.colorBgElevated]) {
        expect(
          kontrast(token[rolle], flaeche),
          `${rolle} ${token[rolle]} auf ${flaeche}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Active-Stufen sind flüchtig (nur während des Drucks) — dort reicht die
    // Kartenfläche; auf #1f1f1f liegen sie knapp darunter, und das ist bekannt.
    expect(kontrast(token.colorLinkActive, token.colorBgContainer)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(token.colorErrorActive, token.colorBgContainer)).toBeGreaterThanOrEqual(4.5);
  });

  it("lässt die Flächenrollen im Dunkelmodus bei antds Rechnung", () => {
    // Ein gefüllter Primärknopf trägt weißen Text; würde colorPrimary mit
    // angehoben, fiele der auf 3,5:1. Beide Forderungen zugleich sind
    // rechnerisch unerfüllbar (Begründung an `FARBEN.rotAufDunkel`).
    const token = antdTheme.getDesignToken(buildTheme("dark"));
    expect(token.colorPrimary.toLowerCase()).not.toBe(FARBEN.rotAufDunkel);
    expect(kontrast("#ffffff", token.colorPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  it("zeigt in antd dasselbe Dunkel-Rot wie eigenes Markup (`--iuk-marke`)", () => {
    // `globals.css` ist CSS und kann `FARBEN` nicht importieren; das Paar wird
    // deshalb hier zusammengehalten, nicht in einer Build-Regel.
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    const dunkelzweig = css.slice(css.indexOf(':root[data-theme="dark"]'));
    expect(dunkelzweig).toMatch(new RegExp(`--iuk-marke:\\s*${FARBEN.rotAufDunkel};`));
  });

  it("lässt die Textrollen im hellen Modus unverändert", () => {
    const token = antdTheme.getDesignToken(buildTheme("light"));
    expect(token.colorLink.toLowerCase()).toBe(FARBEN.rot);
    expect(token.colorError.toLowerCase()).toBe(FARBEN.rot);
  });

  it("gibt Suite-Rot im hellen Modus unverändert durch", () => {
    // Im hellen Modus rechnet der defaultAlgorithm den Seed nicht um — hier
    // muss der abgeleitete Token also wirklich exakt die Suite-Farbe sein.
    const token = antdTheme.getDesignToken(buildTheme("light"));
    expect(token.colorPrimary.toLowerCase()).toBe(FARBEN.rot);
  });

  /**
   * DIE KONTUR EINES RUHENDEN BEDIENELEMENTS TRÄGT 3:1 (DRK-370, WCAG 1.4.11).
   * Gerechnet gegen jede Fläche, auf der ein Feld tatsächlich steht: seine
   * eigene (`colorBgContainer`), die eines Modals/Popovers (`colorBgElevated`)
   * und den Seitengrund (`Layout.bodyBg`). Ohne diesen Fall drückt der nächste
   * „ruhigere" Grauton die Zahl still wieder unter die Schwelle.
   */
  const BEDIENELEMENTE = ["Input", "InputNumber", "Select", "DatePicker", "Checkbox", "Radio"] as const;

  it.each(MODES)("hebt die Kontur der Bedienelemente im Modus %s auf 3:1", (mode) => {
    const cfg = buildTheme(mode);
    const token = antdTheme.getDesignToken(cfg);
    const flaechen = [token.colorBgContainer, token.colorBgElevated, cfg.components!.Layout!.bodyBg!];
    for (const bauteil of BEDIENELEMENTE) {
      const kontur = (cfg.components![bauteil] as { colorBorder?: string }).colorBorder;
      expect(kontur, `${bauteil} setzt keine eigene Kontur`).toBeDefined();
      for (const flaeche of flaechen) {
        expect(
          kontrast(kontur!, flaeche),
          `${bauteil} ${kontur} auf ${flaeche}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(MODES)("lässt die globale Kontur im Modus %s bei antds Rechnung", (mode) => {
    // Die Entscheidung aus DRK-370: nur Bedienelemente. Trennlinien, Karten-
    // und Tabellenränder bleiben, wie sie sind. Die zweite Zusicherung belegt,
    // dass es die Lücke wirklich gibt — sonst wäre die erste nur eine Abschrift.
    const eigen = antdTheme.getDesignToken(buildTheme(mode));
    const antd = antdTheme.getDesignToken({
      algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    });
    expect(eigen.colorBorder).toBe(antd.colorBorder);
    expect(kontrast(antd.colorBorder, antd.colorBgContainer)).toBeLessThan(3);
  });

  it.each(MODES)("legt die Kontur im Modus %s wirklich auf jedes Bauteil", (mode) => {
    /*
     * GEMESSEN AM ERZEUGTEN CSS, nicht am Config-Objekt. Dass `components.X.
     * colorBorder` als `--ant-color-border` auf `.iuk.ant-X-css-var` landet, ist
     * antds Verhalten, nicht unseres — benennt ein Major die Scope-Klasse um
     * oder honoriert er den Token nicht mehr, stünde der Wert oben weiter im
     * Objekt und wirkte nirgends (dieselbe Lage wie Falle 20). Die Scope-Klasse
     * steht zusätzlich im Markup; ohne sie träfe die Regel nichts.
     */
    const kontur = mode === "dark" ? FARBEN.konturAufDunkel : FARBEN.kontur;
    const cache = createCache();
    const markup = renderToString(
      createElement(
        StyleProvider,
        { cache },
        createElement(
          ConfigProvider,
          { theme: buildTheme(mode) },
          createElement(Input),
          createElement(InputNumber),
          createElement(Select, { options: [] }),
          createElement(DatePicker),
          createElement(Checkbox),
          createElement(Radio),
        ),
      ),
    );
    const css = extractStyle(cache, true);
    const scopeVon = (selektor: string) =>
      [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
        .filter((b) => b[1].trim() === selektor)
        .map((b) => b[2])
        .join(";");
    for (const scope of ["input", "input-number", "select", "picker", "checkbox", "radio"]) {
      expect(markup, `Scope-Klasse ant-${scope}-css-var fehlt im Markup`).toContain(
        `ant-${scope}-css-var`,
      );
      expect(scopeVon(`.iuk.ant-${scope}-css-var`), `ant-${scope}`).toContain(
        `--ant-color-border:${kontur}`,
      );
    }
    // Und die globale Variable bleibt antds Wert — der Schnitt aus DRK-370.
    expect(scopeVon(".iuk")).not.toContain(`--ant-color-border:${kontur}`);
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
     * 44px-Bedienelement ist eine 28px-Marke unverhältnismäßig, und der
     * Grund trägt am Schreibtisch nicht.
     *
     * 44 UND NICHT 40 — der gebündelte Playwright-Lauf (Aufgabe 6) hat den
     * Planfehler aufgedeckt: die Dichte hängt an der Shell-VARIANTE, aber
     * `FullShell` rendert auch bei 390px. 40px unterschritt dort die
     * Mindest-Tapfläche (WCAG 2.5.5), und drei Zusicherungen sagten es
     * gleichzeitig. Die Begründung in voller Länge steht am Wert selbst
     * (`theme.ts`), samt der Frage, warum `controlHeightLG` NICHT mitwandert.
     */
    expect(ARBEITSDICHTE.token).toEqual({ controlHeight: 44, controlHeightLG: 48 });
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

describe("SCHREIBTISCHDICHTE", () => {
  it("setzt genau die zwei Größen und erbt alles andere", () => {
    /*
     * DIE DRITTE DICHTE, und die einzige, die unter 44 geht — Betreiberentscheidung
     * vom 2026-08-28 für den Verwaltungszweig von `radio`. 32/40 ist antds eigene
     * Vorgabe und das Maß der Alt-Anwendung, nicht eine vierte Skala.
     *
     * `components` ist HIER LEER, und das ist die Zusicherung dieses Falls: die
     * Dichte wird INNERHALB von `ARBEITSDICHTE` gesetzt (`RadioVerwaltungsRahmen`
     * wickelt `{children}` in `<Schreibtischdichte>`, innerhalb von `Shell`), und
     * antd mischt `components` eine Ebene tief (`useTheme.js:44-53`).
     * `Radio: { radioSize: 16, dotSize: 8 }` kommt damit von auszen. Wiederholte
     * man es, liefe die Kopie beim nächsten Themewechsel still auseinander — genau
     * derselbe Grund wie eine Ebene höher.
     */
    expect(SCHREIBTISCHDICHTE.token).toEqual({ controlHeight: 32, controlHeightLG: 40 });
    expect(SCHREIBTISCHDICHTE.components, "Radio wird geerbt, nie wiederholt").toBeUndefined();
    expect(SCHREIBTISCHDICHTE.algorithm, "algorithm wird geerbt, nie wiederholt").toBeUndefined();
    expect(
      SCHREIBTISCHDICHTE.token?.colorPrimary,
      "Farben werden geerbt, nie wiederholt",
    ).toBeUndefined();
  });

  it("trägt einen ausdrücklichen cssVar-Schlüssel", () => {
    // Ohne ihn erzeugt antd über `useId` einen generierten Schlüssel und warnt in
    // der Entwicklung davor (useTheme.js:19). `iuk` für die Suite, `iuk-arbeit` für
    // die zweite, `iuk-schreibtisch` für die dritte Dichte — im Inspektor
    // auseinanderzuhalten ist der halbe Zweck.
    expect(SCHREIBTISCHDICHTE.cssVar).toEqual({ key: "iuk-schreibtisch" });
  });

  it("lässt die beiden anderen Dichten unverändert", () => {
    /*
     * Was sich geändert hat, ist allein die REICHWEITE — wie schon bei
     * `ARBEITSDICHTE`. Das Handschuh-Maß bleibt die Vorgabe der Suite, und 44/48
     * bleibt der Boden jeder `FullShell`-Fläche, die diese Dichte NICHT anlegt.
     * Ohne diesen Fall wäre „nur wo ein Modul sie ausdrücklich anlegt" eine
     * Behauptung im Kommentar statt einer Zusicherung.
     */
    const t = buildTheme("light");
    expect(t.token?.controlHeight).toBe(56);
    expect(t.token?.controlHeightLG).toBe(72);
    expect(ARBEITSDICHTE.token).toEqual({ controlHeight: 44, controlHeightLG: 48 });
  });
});

/**
 * DIE VERSCHACHTELUNG, AUSGEFUEHRT STATT GELESEN.
 *
 * `SCHREIBTISCHDICHTE` steht INNERHALB von `ARBEITSDICHTE` (`RadioVerwaltungsRahmen`
 * wickelt `{children}` in `<Schreibtischdichte>`, innerhalb von `Shell`). Die ganze
 * Aufgabe haengt an einem Satz, den vier Kommentare aus
 * `antd/es/config-provider/hooks/useTheme.js:44-53` ABLESEN: „der innere Provider gewinnt
 * bei `token`, alles Uebrige wird geerbt".
 *
 * ⛔ EIN GELESENER SATZ IST KEINE MESSUNG. Mischte antd `token` durch ERSETZUNG statt
 * durch Spread, waere die Dichte ein stiller Leerlauf — `typecheck`, `lint`, `build` und
 * jeder Wertetest oben blieben gruen, und auf dem Bildschirm stuende weiter 44. Genau
 * dafuer gibt es diesen Fall: er rendert die Schachtelung wirklich und liest den
 * abgeleiteten Token aus `useToken()`.
 *
 * ⛔ UND ER UNTERSCHEIDET WIRKLICH — gegengeprobt am 2026-08-28 mit einer Wegwerf-Datei,
 * beide Male GRUEN: dieselbe Sonde meldet **44**, wenn man die zwei Dichten VERTAUSCHT,
 * und ebenso 44, wenn man die innerste ganz weglaesst. Die 32 unten kommt also aus der
 * Schachtelung und nicht daher, dass die Sonde irgendetwas ablaese.
 *
 * ⚠️ WAS ER NICHT MESSEN KANN: die Radio-Marke. `useToken()` gibt die GLOBALEN Tokens,
 * nicht die je Komponente; `radioSize` liegt unter `components.Radio` und ist von hier aus
 * unsichtbar. Die Erbung folgt derselben Mischung, die dieser Fall an `colorPrimary`
 * belegt — `SCHREIBTISCHDICHTE` fuehrt gar keinen `components`-Block, es gibt also nichts
 * zu ueberschreiben. Die gerenderte Geometrie bleibt der Browserlauf; jsdom rechnet keine
 * Hoehen (Hauslehre „UI-Abnahme: messen, nicht schauen").
 */
describe("ARBEITSDICHTE + SCHREIBTISCHDICHTE verschachtelt", () => {
  it("der innere Provider gewinnt bei den Groessen und erbt den Rest", async () => {
    const gelesen: { controlHeight: number; controlHeightLG: number; colorPrimary: string }[] = [];

    function Sonde() {
      const { token } = antdTheme.useToken();
      gelesen.push({
        controlHeight: token.controlHeight,
        controlHeightLG: token.controlHeightLG,
        colorPrimary: token.colorPrimary,
      });
      return null;
    }

    const traeger = document.createElement("div");
    document.body.append(traeger);
    const wurzel = createRoot(traeger);
    await act(async () => {
      wurzel.render(
        createElement(
          ConfigProvider,
          { theme: buildTheme("light") },
          createElement(
            ConfigProvider,
            { theme: ARBEITSDICHTE },
            createElement(
              ConfigProvider,
              { theme: SCHREIBTISCHDICHTE },
              createElement(Sonde, null),
            ),
          ),
        ),
      );
    });

    const token = gelesen.at(-1);
    expect(token, "die Sonde hat nie gerendert — der Fall waere leer-gruen").toBeDefined();
    expect(token!.controlHeight, "die innerste Dichte setzt sich NICHT durch").toBe(32);
    expect(token!.controlHeightLG).toBe(40);
    expect(
      token!.colorPrimary.toLowerCase(),
      "Suite-Rot kommt durch beide Schachteln nicht durch",
    ).toBe(FARBEN.rot);

    await act(async () => {
      wurzel.unmount();
    });
    traeger.remove();
  });
});
