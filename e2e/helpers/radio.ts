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
 * `playwright.config.ts:229-248`.
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
 * Die zwei Gruppenzeilen fuer `webServer.env`.
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
 * `aufgaben` ausgeschrieben in `playwright.config.ts:234-247`; ein in
 * `webServer.env` gesetzter Wert hat Vorrang vor jeder `.env`-Datei.
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
