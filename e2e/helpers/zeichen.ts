import type { APIRequestContext } from "@playwright/test";

/**
 * DIE EINE QUELLE fuer Host, Admin-Gruppe, Port, Anker-Id und Warmlauf der
 * `zeichen`-e2e-Faelle (Aufgabe 10; Bauform 1:1 aus `e2e/helpers/uav.ts`).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende ein Wert einmal in `playwright.config.ts`s
 * `webServer.env` und einmal im Spec, waeren es ZWEI Literale — und der Fehlerfall
 * ist nicht laut, sondern GEGENTEILIG: mit falscher `SUITE_ADMIN_GROUP_ZEICHEN`
 * bezeugte der Lauf den Riegel-404 und saehe dabei aus wie ein bestandener Test.
 * Derselbe Absatz steht fuer `radio` in `e2e/helpers/radio.ts:1-13`.
 *
 * ⛔ KEIN IMPORT AUS `src/`: e2e-Helfer und Modulcode laufen in verschiedenen
 * Prozessen mit verschiedenen `DATA_DIR`-Sichten, und ein Import zoege das ganze
 * Modul in den Testprozess.
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const ZEICHEN_HOST = "zeichen.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host. ⚠️ ER EXISTIERT BEREITS: `playwright.config.ts`
 * wartet heute schon auf `http://feedback.localtest.me:3100/login`. Es wird KEIN
 * dritter Host eingefuehrt — und `feedback` ist die schaerfere Probe, weil
 * `moduleForHost` dort tatsaechlich ein Modul liefert.
 */
export const FREMDER_HOST = "feedback.localtest.me";

/** Derselbe Port wie in `playwright.config.ts` (`next dev -p 3100`). */
export const ZEICHEN_PORT = 3100;

/**
 * Die Gruppe, die die kuratierten Lernsets pflegen darf. Registry-Vorgabe aus
 * Aufgabe 1 (`src/core/registry.ts`, `adminGroups: ["iuk-zeichen-admin"]`),
 * gelesen ueber `isModuleAdmin` in `moduleAdminPageOrNotFound`/`canAdminModule`.
 *
 * ⚠️ SIE STEHT ZUSAETZLICH IN `webServer.env` (`SUITE_ADMIN_GROUP_ZEICHEN`), genau
 * wert-gleich mit dieser Konstanten: `next dev` laeuft im Repo-Wurzelverzeichnis und
 * liest `.env.local` mit — ein dort eingetragener produktiver Gruppenname
 * verschoebe den E2E-Server sonst still auf einen anderen Wert.
 */
export const ZEICHEN_ADMIN_GRUPPE = "iuk-zeichen-admin";

/**
 * Die eine Zeile fuer `webServer.env`.
 *
 * ⚠️ `SUITE_HOST_ZEICHEN` steht bewusst NICHT darunter: `moduleForHost` trifft
 * `zeichen.localtest.me` VOR und UNABHAENGIG von `prodHostsFor`
 * (`src/core/registry.ts`), der Dev-Lauf braucht die Variable also nicht.
 *
 * ⛔ `ZEICHEN_SW` steht ebenfalls NICHT darunter, und das ist eine Entscheidung:
 * `http://zeichen.localtest.me:3100` ist KEIN sicherer Kontext (kein TLS, keine
 * Chrome-Flags in diesem Profil). Mit gesetztem Schalter registrierte `RegisterSW`
 * dort nichts (`window.isSecureContext` ist false) — der Schalter bewiese also
 * weder das eine noch das andere. Die PWA wird ausschliesslich in
 * `playwright.pwa.config.ts` gemessen (Port 3101, voller Chromium-Kanal,
 * `--unsafely-treat-insecure-origin-as-secure`).
 */
export const ZEICHEN_ENV: Record<string, string> = {
  SUITE_ADMIN_GROUP_ZEICHEN: ZEICHEN_ADMIN_GRUPPE,
};

/**
 * DIE ID, AUF DIE DIESE DATEI SICH STUETZT — sie steht in der `ANKER`-Liste von
 * `src/app/m/zeichen/_lib/katalog.test.ts` und im lokalen Seed (Aufgabe 4).
 *
 * ⛔ Wer sie hier aendert, aendert sie DORT mit. Faellt die Id bei einem
 * Paketupgrade weg, wird `katalog.test.ts` rot — das ist die laute Stelle; dieser
 * Test faende danach nur noch einen 404 und klaenge nach einem kaputten Router.
 */
export const ANKER_ID = "rezept:C.1.1";

/**
 * Die Routen aus Spec §2, die eine EIGENE Server-Auswertung haben. `/lernen/runde`
 * fehlt bewusst: die Route kann ohne faellige Karte auf einen anderen Inhalt
 * ausweichen, und ein Statusvergleich waere dann eine Wette auf den Lernstand.
 */
export const MODULROUTEN = [
  "/",
  "/katalog",
  "/merkliste",
  "/baukasten",
  "/meine",
  "/lernen",
  "/verwaltung/lernsets",
  "/offline",
] as const;

/**
 * Absolute Per-Host-URL: `baseURL` zeigt auf den PORTAL-Host
 * (`playwright.config.ts`), und `portal` traegt `requiresAuth: true` — jeder
 * RELATIVE Aufruf landete dort im Login.
 */
export function zeichenUrl(pfad: string): string {
  return `http://${ZEICHEN_HOST}:${ZEICHEN_PORT}${pfad}`;
}

/** Dieselbe URL auf dem FREMDEN Suite-Host. */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${ZEICHEN_PORT}${pfad}`;
}

/**
 * Die Adresse der Detail-EINZELSEITE zu einer Katalog-Id.
 *
 * ⛔ `encodeURIComponent`, UND DAS IST GEMESSEN, NICHT VORSORGE (Aufgabe 6, Next
 * 16.3.3/Turbopack): eine Zeichen-Id traegt einen Doppelpunkt
 * („rezept:C.1.1"), und `params.id` kommt in einer dynamischen Route
 * PROZENTKODIERT an — auch dann, wenn die URL einen literalen Doppelpunkt
 * traegt. Die Detailseite antwortete deshalb zunaechst fuer ALLE 246 Ids mit
 * 404; die Naht dagegen heisst `zeichenIdAusPfad()`. Wer diese Zeile
 * „vereinfacht", dreht den Fehler zurueck.
 *
 * ⚠️ IN DEN `data-testid` STEHT DIE ID DAGEGEN ROH (`zeichen-kachel-rezept:C.1.1`)
 * — kodiert wird ausschliesslich die URL.
 */
export function detailUrl(id: string): string {
  return zeichenUrl(`/katalog/${encodeURIComponent(id)}`);
}

/**
 * CLAUDE.md Falle 10: `next dev` uebersetzt eine Route erst beim ERSTEN Treffer.
 * Landet der eigentliche POST einer Server Action in genau diesem Fenster, loest
 * der HMR-Kanal einen vollen Reload aus, der Browser bricht die laufende Anfrage
 * mit ab (`net::ERR_ABORTED`, `canceled: true`), und es kommt NIE eine Antwort —
 * keine Datenbankzeile, keine Protokollzeile, ein Test, der in sein Zeitbudget
 * laeuft und dabei nach etwas ganz anderem klingt.
 *
 * ⛔ DER WARMLAUF MUSS ANGEMELDET LAUFEN, und das ist der Unterschied zu
 * `warmeUavRouten`: `zeichen` traegt `requiresAuth: true`. Ein anonymer GET
 * beantwortet der Proxy mit `307 -> /login` — er uebersetzt die Modulroute damit
 * gerade NICHT und der Warmlauf waere ein wirkungsloses Ritual. Deshalb bekommt
 * diese Funktion `page.request` NACH `devLogin` und nicht den `request`-Fixture
 * aus einem `beforeAll` (der traegt keine Cookies).
 *
 * Statuscodes sind hier bedeutungslos (`/verwaltung/lernsets` antwortet ohne
 * Admin-Gruppe mit 404); tragend ist allein die einmalige Kompilation.
 */
export async function warmeZeichenRouten(request: APIRequestContext): Promise<void> {
  for (const pfad of MODULROUTEN) {
    await request.get(zeichenUrl(pfad)).catch(() => {});
  }
  await request.get(detailUrl(ANKER_ID)).catch(() => {});
  await request.get(zeichenUrl("/lernen/runde")).catch(() => {});
}
