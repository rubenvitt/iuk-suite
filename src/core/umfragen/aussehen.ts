import type { GlobalToken } from "antd";

import type { ThemeMode } from "@/core/theme/theme";

/**
 * DAS AUSSEHEN DER UMFRAGEN — an den Hell/Dunkel-Umschalter der Suite gebunden
 * (DRK-357).
 *
 * Formbricks bringt keine Umschaltung mit. Das Aussehen einer Umfrage ist ein
 * Thema, das man in Formbricks einmal einstellt; es folgt weder
 * `prefers-color-scheme` noch einem Signal der einbettenden Seite. Ein festes
 * Thema liegt damit IMMER in einem der beiden Modi daneben — nicht gelegentlich,
 * sondern bei jedem Anwender, der den anderen Modus benutzt.
 *
 * Das Widget hängt unter der ID `#fbjs` und liest seine Farben aus eigenen
 * CSS-Variablen. Zwei Blöcke an `html[data-theme="…"] #fbjs` genügen deshalb —
 * ohne Eingriff in Formbricks und ohne eine Zeile JavaScript zur Laufzeit.
 * `AntdProvider` schreibt `data-theme` bei jedem Klick auf den Umschalter neu,
 * der Browser wertet die beiden Regeln also von selbst neu aus.
 *
 * ⚠️ DIE VALUES KOMMEN AUS ANTDS AUFGELÖSTEN TOKENS, NICHT AUS ZWEITGESCHRIEBENEN
 * HEXWERTEN. `theme.getDesignToken(buildTheme(mode))` ist dieselbe Rechnung, aus
 * der jede antd-Fläche der Suite ihre Farbe zieht (und dieselbe, mit der
 * `core/theme/theme.test.ts` seine Kontrastzahlen nachrechnet). Eine Umfrage
 * sieht damit nicht „so ähnlich aus wie" die Suite — sie benutzt buchstäblich
 * deren Farben, und ein späterer Themewechsel zieht sie mit, ohne dass jemand
 * diese Datei anfassen muss. Deshalb steht hier auch kein einziger Hexwert;
 * `aussehen.test.ts` hält das fest.
 *
 * ⚠️ `#fbjs` ALLEIN GENÜGT NICHT, UND ZWAR IN BEIDEN MODI. Formbricks hängt das
 * in „Look & Feel" eingestellte Thema ZUR LAUFZEIT als eigenen Block
 * `#fbjs { --fb-…: … }` in den `<head>` (`packages/surveys/src/lib/styles.ts`,
 * Stilelement `formbricks__css__custom`). Das ist dieselbe Spezifität (0,1,0) wie
 * eine eigene Regel auf `#fbjs` — und es kommt SPÄTER im Dokument, gewinnt also
 * den Gleichstand. Falle 5 in ihrer ersten Ausprägung, und still: die Regel
 * steht richtig da und greift nur nicht. `html[data-theme="…"] #fbjs` ist (0,1,1)
 * und gewinnt unabhängig von der Reihenfolge. Die Formbricks-Doku greift für
 * dasselbe Problem zu `!important`; die Spezifität ist der ruhigere Weg, weil sie
 * dem Betreiber die Möglichkeit lässt, mit einem eigenen `!important` doch noch
 * einzugreifen.
 *
 * ⚠️ ZWEI NAMENSFAMILIEN, UND DAS IST KEINE DOPPELUNG. Formbricks trägt zwei
 * Generationen von Variablennamen gleichzeitig: die ältere heißt
 * `--fb-heading-color`/`--fb-input-background-color`, die jüngere
 * `--fb-element-headline-color`/`--fb-input-bg-color`. Das ausgespielte Widget
 * deklariert die ältere in seinem Stylesheet, `styles.ts` schreibt BEIDE. Wer nur
 * eine setzt, bekommt genau dann eine halb umgestellte Umfrage, wenn der
 * Betreiber den zugehörigen Wert in „Look & Feel" angefasst hat — denn erst dann
 * entsteht die `!important`-Regel, die den jüngeren Namen liest. Eine Variable,
 * die das Widget nicht liest, kostet nichts; eine fehlende kostet die halbe
 * Umfrage.
 */

/**
 * DIE ZUORDNUNG: Formbricks-Variable → Rolle im Suite-Theme.
 *
 * Gelesen aus dem, was das ausgelieferte Widget wirklich tut
 * (`@formbricks/surveys`, Klassenzuordnung in `packages/surveys/tailwind.config.cjs`,
 * Verwendung in den Fragekomponenten) — nicht aus der Doku, die für mehrere
 * Generationen gleichzeitig gilt.
 *
 * ⚠️ FLÄCHEN NEHMEN `colorPrimary`, KONTUREN UND RINGE NEHMEN `colorLink` — und
 * das ist genau die Trennung, für die `FARBEN.rotAufDunkel` existiert. antds
 * Dunkel-Algorithmus rechnet den Seed für Flächen auf ein dunkles Rot herunter
 * (weißer Text darauf trägt 7,5:1); als Kontur auf der Kartenfläche hätte
 * dasselbe Rot nur 2,2:1 und wäre praktisch unsichtbar. `colorLink` ist im
 * Dunkelmodus das angehobene Rot (4,67:1 auf `#1f1f1f`) und im Hellmodus
 * derselbe Wert wie `colorPrimary` — eine Rolle, zwei Modi, keine Ausnahme.
 */
export const FARBROLLEN = {
  // ── Marke und Aktion ──────────────────────────────────────────────────────
  /** Fortschrittsbalken, Absendeknopf, Marke von Radio/Checkbox. */
  "brand-color": "colorPrimary",
  "survey-brand-color": "colorPrimary",
  "button-bg-color": "colorPrimary",
  "progress-indicator-bg-color": "colorPrimary",
  /** Schrift AUF der Markenfläche — antds eigener Token für genau das. */
  "brand-text-color": "colorTextLightSolid",
  "button-text-color": "colorTextLightSolid",

  // ── Konturen und Ringe ────────────────────────────────────────────────────
  "focus-color": "colorLink",
  "border-color-highlight": "colorLink",
  /** Der „Zurück"-Knopf ohne Fläche trägt die Marke als SCHRIFT auf der Karte. */
  "back-button-color": "colorLink",
  "border-color": "colorBorder",
  "input-border-color": "colorBorder",
  "option-border-color": "colorBorder",
  "survey-border-color": "colorBorderSecondary",

  // ── Flächen ───────────────────────────────────────────────────────────────
  /**
   * `colorBgElevated`, nicht `colorBgContainer`: die Umfrage liegt als Karte
   * ÜBER dem Inhalt, wie Modal und Popover. Im Dunkelmodus ist das `#1f1f1f`
   * statt `#141414` — und das ist die Fläche, gegen die `theme.test.ts` die
   * Textrollen der Suite ohnehin schon prüft.
   */
  "survey-background-color": "colorBgElevated",
  "input-background-color": "colorBgElevated",
  "input-bg-color": "colorBgElevated",
  "option-bg-color": "colorBgElevated",
  /** Getönte Markenfläche: überfahrene bzw. gewählte Antwortzeile. */
  "accent-background-color": "colorPrimaryBg",
  "accent-background-color-selected": "colorPrimaryBgHover",
  "input-background-color-selected": "colorFillTertiary",
  "calendar-tile-color": "colorFillTertiary",
  "progress-track-bg-color": "colorFillSecondary",

  // ── Schrift ───────────────────────────────────────────────────────────────
  /**
   * `colorText`, nicht `colorTextHeading`: `--fb-heading-color` trägt im
   * ausgelieferten Widget nicht nur die Überschrift, sondern auch jede
   * Antwortbeschriftung, den Text in Eingabefeldern und die Zahlen der
   * NPS-Leiter. Die beiden Tokens sind in beiden Modi ohnehin wertgleich; die
   * Rolle ist Fliesstext.
   */
  "heading-color": "colorText",
  "element-headline-color": "colorText",
  "input-color": "colorText",
  "input-text-color": "colorText",
  "option-label-color": "colorText",
  "close-btn-color-hover": "colorText",
  /**
   * ⚠️ DERSELBE WERT UNTER ZWEI NAMEN, WEIL FORMBRICKS SICH SELBST WIDERSPRICHT:
   * das Stylesheet deklariert `--fb-close-btn-color-hover`, die
   * Klassenzuordnung liest `--fb-close-btn-hover-color`. Welcher Name der
   * gemeinte ist, entscheidet die Version — beide zu setzen kostet eine Zeile.
   */
  "close-btn-hover-color": "colorText",
  "subheading-color": "colorTextSecondary",
  "element-description-color": "colorTextSecondary",
  "label-color": "colorTextSecondary",
  "element-upper-label-color": "colorTextSecondary",
  /**
   * `colorTextSecondary` und nicht `colorTextTertiary`, obwohl diese drei
   * Rollen die unauffälligsten der Umfrage sind: sie tragen 12px-Schrift, und
   * `colorTextTertiary` liegt mit 4,4:1 knapp unter AA. Formbricks hat dieselbe
   * Rechnung im eigenen Stylesheet stehen und ist aus demselben Grund eine
   * Stufe dunkler gegangen.
   */
  "info-text-color": "colorTextSecondary",
  "signature-text-color": "colorTextSecondary",
  "branding-text-color": "colorTextSecondary",
  "close-btn-color": "colorTextTertiary",
  "placeholder-color": "colorTextPlaceholder",
  "input-placeholder-color": "colorTextPlaceholder",
} as const;

/**
 * WAS BEWUSST OFFEN BLEIBT — ausgeschrieben, damit die Auslassung nicht als
 * Versehen gelesen wird. `aussehen.test.ts` verlangt, dass diese Liste und
 * `FARBROLLEN` zusammen die volle Bestandsaufnahme ergeben; eine neue Rolle kann
 * also nicht still zwischen beide fallen.
 */
export const OHNE_MODUSFARBE = {
  /**
   * ⚠️ DIESE ZWEI SIND EIN PAAR, UND IHR GRUND IST DIE JEWEILS ANDERE HÄLFTE,
   * NICHT DIE KARTE. Gelesen in `RatingQuestion.tsx`: das gewählte Gesicht wird
   * mit `--fb-rating-fill` GEFÜLLT und mit `--fb-rating-selected` UMRANDET
   * (blasses Gelb, schwarze Kontur). Wer `--fb-rating-selected` mit der
   * Schriftfarbe mitdrehte, bekäme im Dunkelmodus eine helle Kontur auf blassem
   * Gelb — unsichtbar, und zwar genau dann, wenn jemand eine Bewertungsfrage
   * stellt. Das Paar ist in sich geschlossen und in beiden Modi lesbar; es
   * bleibt bei den Vorgaben von Formbricks.
   */
  "rating-fill": "Füllung des gewählten Gesichts — Grund ist die Kontur, nicht die Karte",
  "rating-selected": "Kontur auf genau dieser Füllung",
  /**
   * Die Klassenzuordnung kennt `--fb-rating-hover`, aber keine Komponente des
   * ausgelieferten Widgets benutzt sie (der Überfahren-Zustand läuft über
   * `--fb-accent-background-color`). Eine Variable ohne Leser zu setzen wäre
   * eine Zusage, die niemand einlöst.
   */
  "rating-hover": "kein Leser im ausgelieferten Widget",
  /** Kein Farbwert, sondern `transparent` — in beiden Modi richtig. */
  "back-btn-border": "transparent, nicht modusabhängig",
  "submit-btn-border": "transparent, nicht modusabhängig",
} as const;

/** Name einer Formbricks-Variable, die eine Modusfarbe bekommt. */
export type Farbvariable = keyof typeof FARBROLLEN;

/** Rolle im Suite-Theme, an der eine solche Variable hängt. */
export type Farbtoken = (typeof FARBROLLEN)[Farbvariable];

/** Der Ausschnitt aus antds Tokens, den diese Datei braucht. */
export type Farbquelle = Pick<GlobalToken, Farbtoken>;

/** Die Zuordnung als Paarliste — einmal getypt, damit sie es überall ist. */
export const FARBPAARE = Object.entries(FARBROLLEN) as Array<[Farbvariable, Farbtoken]>;

/**
 * Der Block für einen Modus. Eigene Funktion, weil die Zeile
 * `html[data-theme="…"] #fbjs` die tragende Zusicherung dieser Datei ist und
 * nur an EINER Stelle stehen soll.
 */
function block(mode: ThemeMode, token: Farbquelle): string {
  const zeilen = FARBPAARE.map(([name, rolle]) => `  --fb-${name}: ${token[rolle]};`);
  return `html[data-theme="${mode}"] #fbjs {\n${zeilen.join("\n")}\n}`;
}

/**
 * Das fertige Stylesheet: zwei Blöcke, ein Modus je Block.
 *
 * Rein und ohne React, damit `aussehen.test.ts` es ohne Rendern prüfen kann —
 * und ohne antd-Import, damit diese Datei aus jeder Ebene erreichbar bleibt
 * (Falle 7: der nackte Spezifizierer `antd` löst in der RSC-Ebene auf CJS auf
 * und ruft `createContext` auf Modulebene). Die Tokens kommen deshalb als
 * ARGUMENT herein; `theme.getDesignToken` ruft die Client-Insel.
 */
export function umfragenFarbCss(hell: Farbquelle, dunkel: Farbquelle): string {
  return `${block("light", hell)}\n${block("dark", dunkel)}\n`;
}
