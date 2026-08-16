import type { Page } from "@playwright/test";

/**
 * DIE EINE QUELLE fuer die beiden Gruppennamen des Moduls `aufgaben` — Vorbild
 * `e2e/helpers/lagerbuch.ts`, woertlich dieselbe Begruendung.
 *
 * ⚠️ WARUM NICHT ALS LITERALE IM SPEC. Seit dem Quellenwechsel vom 2026-08-15
 * traegt `SUITE_ADMIN_GROUP_AUFGABEN` die GANZE Koordinationsrolle
 * (`_lib/zugang.ts`s `akteurFuer` → `canAdminModule`) — die Variable entscheidet
 * also nicht mehr ueber eine Route, sondern ueber jede Koordinationsflaeche des
 * Moduls. `next dev` der E2E-Suite laeuft im Repo-Wurzelverzeichnis und liest
 * dabei `.env.local` MIT. Traegt jemand dort die produktiven Pocket-ID-Namen ein
 * (`aufgaben_nutzer`/`aufgaben_koordination`, s. `.env.example` — heute
 * ausdruecklich abgeraten, aber eine `.env.local` ist gitignored und in jeder
 * Arbeitskopie anders), waeren die Literale im Spec und die tatsaechlich
 * geltenden Gruppennamen des Servers ZWEI auseinanderlaufende Werte. Die
 * `AUFGABEN_ENV` unten schliesst das aus, statt sich darauf zu verlassen, dass
 * niemand es tut.
 *
 * UND DER FEHLERFALL IST NICHT LAUT, SONDERN GEGENTEILIG GRUEN: eine Anmeldung
 * ohne (oder mit falscher) Koordinationsgruppe bezeugt genau die 404-Riegel,
 * die die Gegenproben dieser Suite ohnehin behaupten (`/verteilen`,
 * `/personen`, `/freigaben`) — der Lauf saehe aus wie bestanden. Dieselbe
 * Klasse steht in `playwright.config.ts:2-6` schon ausgeschrieben: „Zwei
 * Literale liefen auseinander, ohne dass ein Lauf rot wuerde."
 *
 * FUER E2E GELTEN DIE REGISTRY-VORGABEN (`src/core/registry.ts`), nicht die
 * Instanznamen: der Spec prueft die eingebaute Vorgabe, nicht die Konfiguration
 * einer bestimmten Instanz — dieselbe Annahme wie bei lagerbuch (A-T3-2).
 */

/** Zugang zum Modul ueberhaupt (`requiredGroups`, `core/registry.ts`). */
export const AUFGABEN_ZUGANG_GRUPPE = "iuk-aufgaben-nutzer";

/** Die Koordinationsrolle (`adminGroups`) — seit dem 2026-08-15 die ganze Rolle, nicht nur `/personen`. */
export const AUFGABEN_KOORDINATION_GRUPPE = "iuk-aufgaben-koordination";

/**
 * Die zwei Zeilen fuer `webServer.env` in `playwright.config.ts`. Sie pinnen den
 * E2E-Server auf dieselben Werte, die die Konstanten oben tragen — und schirmen
 * ihn damit gegen ein abweichendes `.env.local` ab (s. Kopfkommentar).
 *
 * ⚠️ Anders als bei lagerbuch ist `SUITE_ACCESS_GROUP_AUFGABEN` hier ZULAESSIG:
 * der Boot-Riegel dort haengt an `requiresAuth: false` (ein gesetzter Wert waere
 * still wirkungslos), `aufgaben` traegt `requiresAuth: true`. Leer gesetzt
 * bliebe die Variable trotzdem wirkungslos — `validateGroupConfig`
 * (`core/groups.ts`) meldet genau das.
 */
export const AUFGABEN_ENV: Record<string, string> = {
  SUITE_ACCESS_GROUP_AUFGABEN: AUFGABEN_ZUGANG_GRUPPE,
  SUITE_ADMIN_GROUP_AUFGABEN: AUFGABEN_KOORDINATION_GRUPPE,
};

/* ── BEDIENHILFEN FUER DIE antd-AUSWAHLFELDER (`_ui/Felder.tsx`) ─────────────────────────────── */

/**
 * SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16) SIND DATUM, UHRZEIT UND JEDE LISTENWAHL DES
 * MODULS antd-KOMPONENTEN, NICHT MEHR `<input type="date">`/`<select>`. Fuer Playwright aendert das
 * genau zwei Dinge, und beide sind hier gebuendelt, statt an jeder der acht Aufrufstellen einzeln:
 *
 *  1. EIN GETIPPTES DATUM GILT ERST MIT `Enter`. `@rc-component/picker` uebernimmt eine Eingabe
 *     nicht bei jedem Anschlag (sonst meldete das Feld schon bei „01.0" ein Datum). Ohne die
 *     Bestaetigung bliebe das versteckte Feld leer und das Formular ginge OHNE Datum los — die
 *     Action antwortete mit einem Feldfehler, und der Test scheiterte drei Schritte spaeter an
 *     etwas, das nach einem ganz anderen Fehler aussieht.
 *
 *  2. DAS PANEL BLEIBT NACH DER EINGABE OFFEN und liegt ueber dem, was darunter steht. Das naechste
 *     `fill()` traefe dann auf ein Element, das Playwright als verdeckt meldet — `Escape` schliesst
 *     es. Das ist dieselbe Klasse Fehler wie Falle 10/11 in `CLAUDE.md`: ein e2e-Test, der etwas
 *     anderes misst, als sein Name sagt.
 *
 * DIE ISO-FORM BLEIBT DER UEBERGABEWERT, auch wenn das Feld deutsch ANZEIGT: `DatumFeld` liest
 * beide Formate (s. `_ui/Felder.tsx`). Die Tests dieser Suite rechnen durchgehend in ISO
 * (`inTagen()`), und das soll so bleiben.
 */
export async function waehleDatum(page: Page, selektor: string, iso: string): Promise<void> {
  const feld = page.locator(selektor);
  await feld.fill(iso);
  await feld.press("Enter");
  await feld.press("Escape");
}

/** Wie `waehleDatum`, fuer eine Uhrzeit `HH:MM`. */
export async function waehleZeit(page: Page, selektor: string, hhmm: string): Promise<void> {
  const feld = page.locator(selektor);
  await feld.fill(hhmm);
  await feld.press("Enter");
  await feld.press("Escape");
}

/**
 * Eine Option eines antd-`Select` nach ihrem ANZEIGETEXT waehlen — der Ersatz fuer
 * `selectOption(<wert>)`, das nur an einem nativen `<select>` geht.
 *
 * NACH DEM TEXT UND NICHT NACH DEM SCHLUESSEL, und das ist kein Notbehelf: der Schluessel steht im
 * DOM einer antd-Liste gar nicht mehr: was dort steht, ist die Beschriftung — also genau das, was
 * eine bedienende Person sieht. Ein Test, der sie anklickt, bezeugt zusaetzlich, dass die richtige
 * Beschriftung am richtigen Schluessel haengt.
 *
 * `.ant-select-dropdown` GRENZT DIE SUCHE EIN: die Option haengt in einem Portal am `<body>`, und
 * eine unbegrenzte Textsuche faende dieselbe Zeichenkette auch in der Liste darunter.
 */
export async function waehleAusListe(page: Page, selektor: string, text: string): Promise<void> {
  await page.locator(selektor).click();
  await page
    .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
    .getByTitle(text, { exact: true })
    .click();
}
