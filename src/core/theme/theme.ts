import { theme as antdTheme, type MappingAlgorithm, type ThemeConfig } from "antd";
import { FARBEN, SPACE, TAP, TAP_XL } from "@/core/theme/tokens";

/**
 * ZWEITER ALGORITHMUS-SCHRITT IM DUNKELMODUS: Suite-Rot als Text lesbar machen.
 *
 * antds `darkAlgorithm` leitet aus dem Seed `#c8000f` für ALLE Rollen dasselbe
 * `#ad0310` ab — Fläche wie Text. Als Fläche unter weißem Text ist das richtig
 * (7,5:1); als Text auf `#141414` sind es 2,45:1, und genau so sahen Links,
 * Formularfehler, `Typography.Text type="danger"` und `Button danger` aus.
 *
 * Warum ein Algorithmus-Schritt und kein `token`-Eintrag: `colorLink` und
 * `colorError` sind SEED-Token, und antd streicht Seeds aus den Overrides,
 * bevor es die abgeleiteten Werte zusammensetzt (`theme/util/alias.js`) — ein
 * `token.colorLink: "#e45a66"` liefe durch `generate()` und käme als `#c5505a`
 * (4,10:1) heraus. Ein Mapping-Schritt NACH `darkAlgorithm` setzt dagegen die
 * fertigen Werte; antd nimmt `algorithm` als Array genau dafür entgegen.
 *
 * Was NICHT angehoben wird: `colorPrimary` und seine Flächenableitungen
 * (`colorPrimaryHover/Active/Bg/Border`) — Begründung an `FARBEN.rotAufDunkel`.
 * `colorError` dagegen schon: in dieser Suite trägt es ausschließlich Text und
 * Konturen (`Button danger` ist hier nie `type="primary"`, `Alert type="error"`
 * ist durch Falle 3 aus den Modulen verbannt).
 */
const dunkleTextfarben: MappingAlgorithm = (_seed, map) => ({
  ...map!,
  colorLink: FARBEN.rotAufDunkel,
  colorLinkHover: FARBEN.rotAufDunkelHover,
  colorLinkActive: FARBEN.rotAufDunkelActive,
  colorPrimaryText: FARBEN.rotAufDunkel,
  colorPrimaryTextHover: FARBEN.rotAufDunkelHover,
  colorPrimaryTextActive: FARBEN.rotAufDunkelActive,
  colorError: FARBEN.rotAufDunkel,
  colorErrorHover: FARBEN.rotAufDunkelHover,
  colorErrorActive: FARBEN.rotAufDunkelActive,
  colorErrorText: FARBEN.rotAufDunkel,
  colorErrorTextHover: FARBEN.rotAufDunkelHover,
  colorErrorTextActive: FARBEN.rotAufDunkelActive,
});

/** Die beiden Betriebsarten des Suite-Themes. Hier definiert, weil sie zum
 *  Theme gehören — `mode.ts` (Cookie-Transport) reicht den Typ nur weiter. */
export type ThemeMode = "light" | "dark";

/**
 * Was die Person GEWÄHLT hat — nicht, was daraus folgt. `auto` ist die Vorgabe
 * und heißt „folge dem Betriebssystem"; die Auflösung nach `ThemeMode` macht
 * `resolveThemeMode` in `mode.ts`, weil sie den zweiten Cookie-Wert braucht.
 *
 * Die Trennung ist keine Kosmetik: `buildTheme` und `<html data-theme>` dürfen
 * `auto` nie zu sehen bekommen.
 */
export type ThemePreference = "auto" | "light" | "dark";

/**
 * Das Design-System der Suite als eine Funktion. Reine Berechnung, kein React —
 * dadurch in `theme.test.ts` statisch prüfbar und aus Server- wie
 * Client-Komponenten aufrufbar.
 */
export function buildTheme(mode: ThemeMode): ThemeConfig {
  const dark = mode === "dark";
  return {
    algorithm: dark ? [antdTheme.darkAlgorithm, dunkleTextfarben] : antdTheme.defaultAlgorithm,
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
      // ROLLE STATT SCHRIFTNAME, seit 2026-08-12. Hier stand
      // `var(--font-geist-sans), …` bzw. `var(--font-geist-mono), …` — und
      // genau das machte den Satz aus `docs/design/README.md` unwahr, ein
      // Schriftwechsel sei „eine Zeile in `globals.css`": antds Fliesztext, also
      // der Fliesztext der ganzen Suite, lief an `--font-body` vorbei. Die
      // Gattungs-Rueckfaelle sind hier ABSICHTLICH nicht wiederholt: sie stehen
      // in der Aufloesung in `globals.css` und wandern damit mit.
      fontFamily: "var(--font-body)",
      fontFamilyCode: "var(--font-mono)",
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

/**
 * DIE ZWEITE BEDIENDICHTE — für Arbeitsflächen am Schreibtisch.
 *
 * `buildTheme` setzt `controlHeight: TAP` (56) und `controlHeightLG: TAP_XL`
 * (72). Das ist eine EINSATZANFORDERUNG (Bedienung mit Handschuhen), keine
 * Stilfrage, und sie bleibt unverändert. Der Fehler war ihre REICHWEITE: sie
 * galt auch auf den Verwaltungsseiten, die mit Maus und Tastatur bedient
 * werden — und ein 56px-Knopf neben einem 56px-Select neben einem 56px-Feld
 * ergibt genau den Eindruck „zu viel Weißraum, nicht Ant Design".
 *
 * NUR DREI GRÖSZEN, ALLES ANDERE GEERBT. antd mischt ein verschachteltes
 * Theme in das Elterntheme (`antd/es/config-provider/hooks/useTheme.js:44-53`):
 * `token` flach, `components` eine Ebene tief, der Rest per Spread. `algorithm`,
 * `colorPrimary`, `fontFamily`, `Layout` und `Input.inputFontSize` kommen
 * dadurch von selbst. Sie hier zu wiederholen wäre eine Kopie, die beim
 * nächsten Themewechsel still auseinanderläuft; `theme.test.ts` verbietet es.
 *
 * 44 UND NICHT 40, seit dem gebündelten Playwright-Lauf (Aufgabe 6). Der Plan
 * hatte SHELL-VARIANTE mit ZEIGERGERÄT gleichgesetzt — das ist falsch:
 * `FullShell` rendert auch auf einem 390px-Telefon, dort liegt dieselbe Dichte
 * unter demselben Daumen. 40px unterschritten damit die Mindest-Tapfläche, und
 * drei Zusicherungen sagten es gleichzeitig
 * (`e2e/lagerbuch-mobil.spec.ts:312`, `e2e/mobil-admin.spec.ts:304` und `:413`
 * — „Entfernen" stand auf 94x40). 44px ist WCAG 2.5.5 (Target Size, Enhanced,
 * Stufe AAA) und im Repo längst die verankerte Untergrenze; sie ist keine neue
 * Zahl. NICHT 2.5.8 (Target Size, Minimum) — das ist die AA-Stufe und verlangt
 * nur 24x24; die Suite liegt hier bewusst darüber, nicht knapp darunter.
 *
 * EINE ZAHL, ÜBERALL — kein Media Query, keine viewport-abhängige Dichte. Die
 * Höhe kommt aus einem antd-Token und landet als `--iuk-arbeit-control-height`
 * auf antds SCOPE-Klasse; sie unter 768px zurückzudrehen hieße, genau diese
 * `--ant-*`/`--iuk-arbeit-*`-Variablen von auszen zu überschreiben. Das ist
 * Falle 5 (docs/design/README.md) in Reinform, und der Fehler wäre still: die
 * Regel stünde richtig da und griffe nicht.
 *
 * `controlHeightLG` BLEIBT BEI 48, und das ist eine Entscheidung, keine
 * Auslassung. Der Anlass der Änderung ist der 44px-Boden, und 48 liegt schon
 * darüber. Alles, was spürbar größer wäre, landet bei TAP (56) — dem
 * EINSATZ-Grundmaß —, und eine „große" Arbeitsfläche wäre dann so hoch wie ein
 * Einsatzformular: genau der Unterschied, für den diese Dichte existiert, wäre
 * wieder weg. Die eigentliche Aufgabe des Eintrags ist ohnehin, den Durchfall
 * auf `TAP_XL` (72) zu verhindern.
 *
 * Und er kann NICHT die Kopfzeile verengen, auch wenn antd
 * `headerPadding = controlHeightLG * 1.25` ableitet (`prepareComponentToken`,
 * antd/es/layout/style/index.js:85+94): `buildTheme` setzt
 * `components.Layout.headerPadding` (und `headerHeight`) ausdrücklich, und
 * `useTheme` mischt `components` eine Ebene tief — `ARBEITSDICHTE` erbt den
 * ganzen `Layout`-Block des Elterntheme unverändert. Nachgesehen, nicht
 * angenommen.
 *
 * `Radio` MUSS mit. `buildTheme` setzt `radioSize: 28, dotSize: 14`, weil die
 * Trefferfläche mit Handschuhen die ganze Zeile aus Marke und Beschriftung
 * ist. Neben einem 44px-Bedienelement ist eine 28px-Marke unverhältnismäßig,
 * und der Grund trägt am Schreibtisch nicht. Checkbox braucht kein
 * Gegenstück: ihre Marke ist `controlHeight / 2` und fällt automatisch mit.
 *
 * `cssVar.key` AUSDRÜCKLICH: ohne ihn erzeugt antd über `useId` einen
 * generierten Schlüssel und warnt in der Entwicklung davor (useTheme.js:19).
 *
 * KEIN `"use client"` in dieser Datei — `FullShell` ist eine Server Component
 * und liest diesen Wert mittelbar. Aus einem Client-Modul käme eine
 * Client-Referenz statt des Objekts (Falle 6).
 *
 * WO SIE GILT: über dem INHALT von `FullShell` — portal, feedback, files,
 * lagerbuch, alpha, gamma. NICHT über `MinimalShell` (qr, beta: Einsatz-
 * formulare) und NICHT über der Kopfzeile, die in jedem Modul gleich aussehen
 * soll. Die drei tatsächlich handschuhkritischen Ansichten
 * (`lagerbuch/helfer`, `feedback/f`, `files/(oeffentlich-*)`) benutzen gar
 * keine Shell und sind strukturell unberührt.
 */
export const ARBEITSDICHTE: ThemeConfig = {
  cssVar: { key: "iuk-arbeit" },
  token: { controlHeight: 44, controlHeightLG: 48 },
  components: { Radio: { radioSize: 16, dotSize: 8 } },
};

/**
 * DIE DRITTE BEDIENDICHTE — für Datenflächen, die nur mit Maus und Tastatur
 * bedient werden. Betreiberentscheidung vom 2026-08-28.
 *
 * `ARBEITSDICHTE` (44/48) hat den Einsatzwert 56/72 dort zurückgenommen, wo am
 * Schreibtisch gearbeitet wird. Für die VERWALTUNG des Moduls `radio` war auch
 * das noch zu groß: die Alt-Anwendung fuhr ihre Tabellen, Filterleisten und
 * Formulare auf antds Vorgabe 32/40, und der Nachbau wirkt daneben leer.
 * 32/40 ist deshalb kein neuer Wert, sondern antds eigene Vorgabe.
 *
 * BEWUSSTE ABWEICHUNG VON 44, nicht Unachtsamkeit. 44px ist WCAG 2.5.5 (Target
 * Size, Enhanced — Stufe AAA) und sonst die Untergrenze des Repos. 32 liegt
 * darunter, aber über der AA-Untergrenze 24 (WCAG 2.5.8, Target Size, Minimum).
 * Der Betreiber hat diesen Tausch für den Verwaltungszweig ausdrücklich
 * beauftragt; wer ihn zurückdreht, dreht eine Entscheidung zurück, kein Versehen.
 *
 * REICHWEITE: NUR wo ein Modul sie ausdrücklich anlegt — heute allein
 * `src/app/m/radio/_ui/RadioVerwaltungsRahmen.tsx`. Kein Shell-Pfad zieht sie
 * von selbst; der Ausleih-Zweig von `radio` (56/72, ohne Shell) und jedes andere
 * Modul bleiben unberührt. Damit steht sie in `core`, obwohl heute genau EIN
 * Modul sie braucht — die Regel „nur was ein zweites Modul braucht" (`CLAUDE.md`)
 * ist hier bewusst zugunsten der Betreiberentscheidung ausgesetzt, weil die
 * Dichte zum Theme gehört und nicht in ein Modul-Stylesheet gehört (Falle 5).
 *
 * ZWEI GRÖSZEN, ALLES ANDERE GEERBT — wie bei `ARBEITSDICHTE` und aus demselben
 * Grund (`useTheme.js:44-53`: `token` flach, `components` eine Ebene tief).
 * `Radio: { radioSize: 16, dotSize: 8 }` steht schon in `ARBEITSDICHTE`, in die
 * hinein diese Dichte geschachtelt wird; eine Wiederholung liefe still
 * auseinander. `cssVar.key` ausdrücklich, sonst generiert antd einen Schlüssel
 * und warnt (useTheme.js:19). KEIN `"use client"` in dieser Datei (Falle 6).
 */
export const SCHREIBTISCHDICHTE: ThemeConfig = {
  cssVar: { key: "iuk-schreibtisch" },
  token: { controlHeight: 32, controlHeightLG: 40 },
};
