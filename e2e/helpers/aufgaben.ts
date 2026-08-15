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
