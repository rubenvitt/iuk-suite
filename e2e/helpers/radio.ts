/**
 * DIE EINE QUELLE fuer Host, Port, Gruppennamen und die Serverumgebung der
 * `radio`-e2e-Faelle (NS-V10; Bauform 1:1 aus `e2e/helpers/lagerbuch.ts`).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende ein Gruppenname einmal in
 * `playwright.config.ts`s `webServer.env` und einmal im Spec, waeren es ZWEI
 * Literale — und der Fehlerfall ist nicht laut, sondern GEGENTEILIG: mit
 * falschem `groups` bezeugte der Lauf den Riegel-404 und saehe dabei aus wie ein
 * bestandener Test. Derselbe Absatz steht fuer `lagerbuch` in
 * `e2e/helpers/lagerbuch.ts:5-13` und fuer `aufgaben` in
 * `playwright.config.ts:245-268`.
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const RADIO_HOST = "radio.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host fuer die „fremder Host"-Zusage (Spec:4891,
 * Fall 8).
 *
 * ⚠️ ER EXISTIERT BEREITS: `playwright.config.ts:156` wartet heute schon auf
 * `http://feedback.localtest.me:3100/login`. Es wird KEIN dritter Host
 * eingefuehrt — und `feedback` ist die schaerfere Probe, weil `moduleForHost`
 * dort tatsaechlich ein Modul liefert (`e2e/helpers/lagerbuch.ts:23-27`).
 */
export const FREMDER_HOST = "feedback.localtest.me";

/** Derselbe Port wie in `playwright.config.ts` (`next dev -p 3100`). */
export const RADIO_PORT = 3100;

/**
 * Die Gruppe der Verwaltungsstufe. Registry-Vorgabe (`src/core/registry.ts:198`),
 * gelesen ueber `adminGroupsFor` (`src/app/m/radio/_lib/zugang.ts:188-192`).
 *
 * ⬜ **V-L2 / E1** — wie sie in Produktion heisst, weiss nur der Betreiber
 * (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „Offen"). Fuer E2E gilt
 * der Registry-Vorgabewert, wie bei `lagerbuch`
 * (`e2e/helpers/lagerbuch.ts:34-38`).
 */
export const RADIO_ADMIN_GRUPPE = "iuk-radio-admin";

/**
 * Die Gruppe der Updater-Stufe.
 *
 * ⛔ EIN FREI GEWAEHLTER WERT, UND DAS IST RICHTIG — ⬜ **V-L1 / E1b**. Er steht
 * zeichengleich als auskommentierter Vorschlag in `.env.example:114`; der echte
 * Name ist eine Betreiberentscheidung vor Cut 26
 * (`docs/superpowers/plans/SPERREN-radio-spec2.md:110`). ⛔ Er darf hier nicht
 * als Produktionsname erraten werden.
 */
export const RADIO_UPDATER_GRUPPE = "iuk-radio-updater";

/**
 * Die zwei Gruppenzeilen und das Sitzungsgeheimnis fuer `webServer.env`.
 *
 * ⛔ OHNE `SUITE_UPDATER_GROUP_RADIO` IST DIE UPDATER-STUFE IM LAUF FUER JEDE
 * IDENTITAET ZU, und zwar aus Absicht: ein leerer oder fehlender Wert SCHLIESST
 * die Stufe (`src/app/m/radio/_lib/zugang.ts:225-227`, `.env.example:107-110`).
 * Die zwei Wirkproben der zweiten Rechtestufe in Aufgabe V23 bekaemen dann ihren
 * 404 aus dem falschen Grund und bewiesen das Falsche — dieselbe Klasse, vor der
 * `e2e/lagerbuch-hosts.spec.ts:145-149` warnt. Der Befund steht in
 * `.superpowers/sdd/planteil4/VORABSCAN.md`, Fund F24 (BAU-ANHALTEND).
 *
 * ⚠️ `SUITE_ADMIN_GROUP_RADIO` STEHT DANEBEN, OBWOHL DIE REGISTRY EINE VORGABE
 * TRAEGT (`src/core/registry.ts:198`): `next dev` laeuft im
 * Repo-Wurzelverzeichnis und liest `.env.local` mit; wer dort den produktiven
 * Namen eintraegt, verschoebe still die Gruppe des E2E-Servers, und der Lauf
 * waere nicht rot, sondern gegenteilig gruen. Die Begruendung steht fuer
 * `aufgaben` ausgeschrieben in `playwright.config.ts:261-263`; ein in
 * `webServer.env` gesetzter Wert hat Vorrang vor jeder `.env`-Datei.
 *
 * ⛔ DAS SITZUNGSGEHEIMNIS GEHOERT AUS DEMSELBEN GRUND HIERHER UND NICHT NACH
 * `.env.local`: `ausleihSitzungGeheimnis()` wirft `GrenzenUngueltig`, sobald sie
 * zur Anfragezeit ohne `RADIO_AUSLEIH_SITZUNG_SECRET` laeuft
 * (`src/app/m/radio/_lib/grenzen.ts:234-240`, Datei 366 Zeilen) — und das ist die
 * ERSTE Einloesung eines Codes am Gate. Ein Wert in `.env.local` machte den Lauf
 * nicht rot, sondern rennabhaengig gruen: er bestuende auf dem Rechner, der die
 * Datei hat, und fiele auf jedem anderen.
 *
 * ⚠️ `SUITE_HOST_RADIO` STEHT BEWUSST NICHT DARUNTER — anders als bei
 * `lagerbuch` (`e2e/helpers/lagerbuch.ts:67`), wo Boot-Pruefungen an
 * `prodHostsFor(...).length > 0` haengen. `moduleForHost` trifft
 * `radio.localtest.me` VOR und UNABHAENGIG von `prodHostsFor`, gemessen und
 * ausgeschrieben in `src/app/m/radio/_lib/host.ts:37-41`.
 */
export const RADIO_ENV: Record<string, string> = {
  SUITE_ADMIN_GROUP_RADIO: RADIO_ADMIN_GRUPPE,
  SUITE_UPDATER_GROUP_RADIO: RADIO_UPDATER_GRUPPE,
  // ⛔ ZEICHENGLEICH AUS DER VORLAGE, NICHT GEWUERFELT: dieselbe Zeile fuehrt
  // `.env.example` im E2E-Block (Textanker `# RADIO_AUSLEIH_SITZUNG_SECRET=` MIT
  // `nicht-produktiv`; die frueher notierte Zeilennummer ist gewandert). Der
  // Wert ist ein Wegwerf-Geheimnis und steht bewusst im oeffentlichen Repo.
  // ⚠️ Die Boot-Pruefungen desselben Werts (>= 32 Zeichen, != `AUTH_SECRET`,
  // gebaut in `src/app/m/radio/_lib/grenzen.ts#grenzenFehler`) feuern in diesem
  // Lauf NICHT — `radioBootFehler()` kehrt am Host-Schalter zurueck, weil
  // `SUITE_HOST_RADIO` hier absichtlich fehlt (Absatz unten). Er erfuellt sie
  // trotzdem, damit dieselbe Zeile auch in einem Dev-Versuch MIT Host traegt.
  RADIO_AUSLEIH_SITZUNG_SECRET: "e2e-radio-ausleih-secret-nicht-produktiv-32z",
  // ⛔ WERTGLEICH MIT DER VORBELEGUNG, UND DESHALB VERHALTENSNEUTRAL:
  // `_lib/grenzen.ts:76` fuehrt `RADIO_AUSLEIH_SITZUNG_STUNDEN` mit
  // `vorgabe: 12` (Datei 366 Zeilen). Diese Zeile aendert am Lauf nichts — sie
  // holt die Zahl nur aus einer im Testprozess UNERREICHBAREN Vorbelegung in
  // einen ABLESBAREN konfigurierten Wert.
  // ⛔ SIE STEHT HIER UND NICHT IN `.env.local`: ein Wert dort machte den Lauf
  // nicht rot, sondern rennabhaengig gruen (derselbe Grund wie beim Geheimnis
  // darueber; ein in `webServer.env` gesetzter Wert hat Vorrang vor jeder
  // `.env`-Datei).
  // ⛔ UND SIE IST DER GRUND, WARUM IN `e2e/radio-kiosk.spec.ts` KEINE `12`
  // STEHT: Spec:6573 woertlich „Der Test prueft die Grenze relativ zum
  // konfigurierten Wert, nie die Zahl 12 — sonst wandert die Entscheidung in
  // eine Testdatei." Dieselbe Bauform traegt `lagerbuch`
  // (`e2e/helpers/lagerbuch.ts:76`, `LAGERBUCH_HELFER_SITZUNG_STUNDEN: "12"`,
  // Vermerk „kuerzer bringt nichts, weil kein Test 12 h wartet") — und genau
  // jene Zeile nennt Spec:6570-6572 als Vorbild.
  RADIO_AUSLEIH_SITZUNG_STUNDEN: "12",
};

/**
 * Absolute Per-Host-URL: `baseURL` zeigt auf den PORTAL-Host
 * (`playwright.config.ts:65`), und `portal` traegt `requiresAuth: true` — jeder
 * RELATIVE Aufruf landete dort im Login (`e2e/helpers/lagerbuch.ts:86-91`).
 */
export function radioUrl(pfad: string): string {
  return `http://${RADIO_HOST}:${RADIO_PORT}${pfad}`;
}

/**
 * Dieselbe URL auf dem FREMDEN Suite-Host — fuer die 404-Zusage aus Spec:4891.
 *
 * ⛔ SIE BRAUCHT KEINEN ZWEITEN `baseURL` (⬜ V-L4, gestrichen 2026-08-24): das
 * Repo faehrt genau diesen Fall heute schon ueber eine absolute URL,
 * `e2e/lagerbuch-hosts.spec.ts:151-152` mit `e2e/helpers/lagerbuch.ts:94`.
 */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${RADIO_PORT}${pfad}`;
}

/**
 * DIE ZWEI AUSLEIHCODES, DIE DER SEED IM LAUF ANLEGT — der eine aktiv, der andere
 * gesperrt.
 *
 * ⛔ EINE KOPPLUNG, UND SIE WIRD BENANNT STATT WEGIMPORTIERT: dieselben zwei Werte
 * stehen ein zweites Mal in `src/app/m/radio/_lib/seedLokal.ts:96-97` (dort als
 * modul-private `CODE_AKTIV`/`CODE_GESPERRT`, OHNE `export` und ohne `E2E_`-Praefix).
 * Wer sie dort aendert, aendert hier die zweite Stelle mit.
 * ⛔ KEIN IMPORT AUS `src/`: e2e-Helfer und Modulcode laufen in verschiedenen
 * Prozessen mit verschiedenen `DATA_DIR`-Sichten, und ein Import zoege das ganze
 * Modul in den Testprozess.
 *
 * Beide sind im Lauf vorhanden, weil `playwright.config.ts:158` vor `next dev`
 * `pnpm exec tsx scripts/seed-lokal.ts radio` faehrt. Die Zusage „aktiv" bzw.
 * „gesperrt" tragen die Seed-Zeilen `seedLokal.ts:190` (`aktiv: true`) und
 * `:192-193` (`aktiv: false`, `gesperrtAm`, `gesperrtVon`).
 *
 * ⚠️ DIE FORM IST 28 ZEICHEN CROCKFORD-BASE32 IN SIEBEN VIERERGRUPPEN (§3.2.1), der
 * Bindestrich ist TEIL des gespeicherten Werts. ⛔ Die sechsstelligen Beispielwerte
 * des Kapiteltexts (`"111-111"`/`"222-222"`) sind veraltet — wer sie uebernimmt,
 * loest einen Code ein, den es nicht gibt.
 */
export const E2E_CODE_AKTIV = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";
export const E2E_CODE_GESPERRT = "7QK2-M4XN-B9HV-3ZTD-5PJW-6RSG-8YFA";
