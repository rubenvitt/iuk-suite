/**
 * DIE EINE QUELLE fuer Host, Admin-Gruppe, Port und die drei Token-Codes
 * (Festlegung H9, Spec §12.6 Punkt 2).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende die Admin-Gruppe einmal in
 * `webServer.env` und einmal im Spec, haette man ZWEI Literale — und der
 * Fehlerfall ist nicht laut, sondern GEGENTEILIG: ohne (oder mit falschem)
 * `groups` bezeugt der Lauf den 404 aus §11.5, Zustand 19 und sieht dabei aus wie
 * ein bestandener Test.
 *
 * Dieselbe Klasse steht in `playwright.config.ts:2-6` schon ausgeschrieben (fuer
 * AV_MODUS_DATEI): „Zwei Literale liefen auseinander, ohne dass ein Lauf rot
 * wuerde — er waere rennabhaengig gruen."
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const LAGERBUCH_HOST = "lagerbuch.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host fuer die „fremder Host"-Zusagen (§3.8.3,
 * §12.2, §12.6 Punkt 3).
 *
 * ⚠️ ER EXISTIERT BEREITS: `playwright.config.ts:95` wartet heute schon auf
 * `http://feedback.localtest.me:3100/login`. Es wird KEIN dritter Host
 * eingefuehrt — und `feedback` ist zugleich die schaerfere Probe, weil
 * `moduleForHost` dort tatsaechlich ein Modul liefert (Festlegung H8).
 */
export const FREMDER_HOST = "feedback.localtest.me";

/**
 * Der Wert, den `SUITE_ADMIN_GROUP_LAGERBUCH` im E2E-Server traegt UND den
 * `devLogin(…, { groups })` mitgeben MUSS.
 *
 * ⚠️ Annahme A-T3-2: der produktive Wert ist eine Betreiberentscheidung und wird
 * beim Cutover als eine `.env`-Zeile gesetzt. Fuer E2E gilt der
 * Registry-Vorgabewert.
 */
export const LAGERBUCH_ADMIN_GRUPPE = "lagerbuch_nutzer";

/** Derselbe Port wie in `playwright.config.ts` (`next dev -p 3100`). */
export const LAGERBUCH_PORT = 3100;

/**
 * DREI aktive Token-Codes, nicht einer.
 *
 * ⚠️ `lagerbuch/e2e/migrate-db.ts:84-88` schreibt aus, warum ein zweiter noetig
 * war: sonst bucht der Check ins Journal des Helfer-Flows hinein — Playwright
 * faehrt alle Spec-Dateien in EINEM Worker gegen EINE SQLite-Datei. Der dritte
 * trennt den Geraete-Check vom Artikel-Check.
 */
export const E2E_TOKEN_HELFER = "111-111";
export const E2E_TOKEN_CHECK = "222-222";
export const E2E_TOKEN_GERAETE = "333-333";

/**
 * Die neun Lagerbuch-Zeilen fuer `webServer.env` (§10.3, „Werte fuer Dev und
 * E2E"). „Klein" ist hier KEIN zulaessiger Eintrag: die Kopplungen aus §10.5
 * greifen sonst, bevor ein Test laeuft.
 *
 * ⚠️ `SUITE_ACCESS_GROUP_LAGERBUCH` steht bewusst NICHT darunter — ein gesetzter
 * Wert bricht den Boot ab (§2.5, §10.5 Pruefung 6).
 */
export const LAGERBUCH_ENV: Record<string, string> = {
  // Der Host-Riegel braeuchte sie nicht (§2.6), aber die Boot-Pruefungen haengen
  // an `prodHostsFor(...).length > 0`, und der Zwei-Host-E2E ist sonst nicht
  // darstellbar.
  SUITE_HOST_LAGERBUCH: LAGERBUCH_HOST,
  SUITE_ADMIN_GROUP_LAGERBUCH: LAGERBUCH_ADMIN_GRUPPE,
  // ≠ leer, ≠ Alt-Default, ≠ AUTH_SECRET der E2E-Konfiguration ("test-secret"),
  // ≥ 32 Zeichen — alle vier Bedingungen aus Boot-Pruefung 4.
  LAGERBUCH_HELFER_SITZUNG_SECRET: "e2e-helfer-secret-nicht-produktiv-32z",
  // Fixtures rechnen gegen die Vorgaben.
  LAGERBUCH_VERFALL_ROT_TAGE: "31",
  LAGERBUCH_VERFALL_GELB_TAGE: "56",
  // 1:1; kuerzer bringt nichts, weil kein Test 12 h wartet.
  LAGERBUCH_HELFER_SITZUNG_STUNDEN: "12",
  // Der Sperrtest braucht eine erreichbare Grenze: bei 5 sind es sechs
  // Fehleingaben.
  LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "5",
  // ≥ ABSENDER — der Absendertest darf die Gesamtbremse nicht ausloesen und damit
  // die Ursache verwischen.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "30",
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "300",
};

/** Absolute Per-Host-URL (§12.6, Punkt 3): `baseURL` zeigt auf den PORTAL-Host,
 *  und portal traegt `requiresAuth: true` — jeder relative Aufruf landete im
 *  Login. */
export function lagerbuchUrl(pfad: string): string {
  return `http://${LAGERBUCH_HOST}:${LAGERBUCH_PORT}${pfad}`;
}

/** Dieselbe URL auf dem FREMDEN Suite-Host — fuer die 404-Schleife aus §3.8.3. */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${LAGERBUCH_PORT}${pfad}`;
}
