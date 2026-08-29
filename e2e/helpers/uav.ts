/**
 * DIE EINE QUELLE fuer Host, Admin-Gruppe, Port und die Teilnehmer-Codes der
 * `uav`-e2e-Faelle (Task 21; Bauform 1:1 aus `e2e/helpers/radio.ts`/
 * `e2e/helpers/lagerbuch.ts`).
 *
 * ⚠️ WARUM NICHT ALS LITERALE. Stuende ein Wert einmal in
 * `playwright.config.ts`s `webServer.env` und einmal im Spec, waeren es ZWEI
 * Literale — und der Fehlerfall ist nicht laut, sondern GEGENTEILIG: mit
 * falscher `SUITE_ADMIN_GROUP_UAV` bezeugte der Lauf den Riegel-404 und saehe
 * dabei aus wie ein bestandener Test. Derselbe Absatz steht fuer `radio` in
 * `e2e/helpers/radio.ts:1-13`.
 */

/** Der Modul-Host. Wildcard-DNS loest jeden `*.localtest.me` auf 127.0.0.1 auf. */
export const UAV_HOST = "uav.localtest.me";

/**
 * Der ZWEITE erreichbare Suite-Host fuer die „fremder Host"-Zusagen (Checks 4,
 * 9 aus der Aufgabenbeschreibung).
 *
 * ⚠️ ER EXISTIERT BEREITS: `playwright.config.ts` wartet heute schon auf
 * `http://feedback.localtest.me:3100/login`. Es wird KEIN dritter Host
 * eingefuehrt — und `feedback` ist die schaerfere Probe, weil `moduleForHost`
 * dort tatsaechlich ein Modul liefert.
 */
export const FREMDER_HOST = "feedback.localtest.me";

/** Derselbe Port wie in `playwright.config.ts` (`next dev -p 3100`). */
export const UAV_PORT = 3100;

/**
 * Die Gruppe der Verwaltungsstufe. Registry-Vorgabe (`src/core/registry.ts:204`,
 * `"uav-training-admin"`), gelesen ueber `adminGroupsFor`/`isModuleAdmin` in
 * `_lib/requireUavAdmin.ts`.
 *
 * ⚠️ SIE STEHT ZUSAETZLICH IN `webServer.env` (`playwright.config.ts`,
 * `SUITE_ADMIN_GROUP_UAV`) — genau wert-gleich mit dieser Konstanten, aus
 * demselben Grund wie beim Kopfkommentar oben: ein `next dev` im
 * Repo-Wurzelverzeichnis liest `.env.local` mit, und ein dort eingetragener
 * produktiver Gruppenname wuerde den E2E-Server sonst still auf einen anderen
 * Wert verschieben.
 */
export const UAV_ADMIN_GRUPPE = "uav-training-admin";

/**
 * DIE ZWEI CODES, DIE DER LOKALE SEED ANLEGT — `_lib/seedLokal.ts:87-90`
 * (`LOKALE_TEILNEHMER`), der ueber `scripts/seed-lokal.ts uav` VOR `next dev`
 * laeuft (`playwright.config.ts`).
 *
 * ⛔ EINE KOPPLUNG, UND SIE WIRD BENANNT STATT WEGIMPORTIERT: dieselben zwei
 * Werte stehen ein zweites Mal in `src/app/m/uav/_lib/seedLokal.ts`. Wer sie
 * dort aendert, aendert hier die zweite Stelle mit.
 * ⛔ KEIN IMPORT AUS `src/`: e2e-Helfer und Modulcode laufen in verschiedenen
 * Prozessen mit verschiedenen `DATA_DIR`-Sichten, und ein Import zoege das
 * ganze Modul in den Testprozess.
 */
export const E2E_CODE_AKTIV = "E2ETEST1";
export const E2E_CODE_INAKTIV = "E2EGESP2";

/**
 * Die eine Gruppenzeile fuer `webServer.env`.
 *
 * ⚠️ `SUITE_HOST_UAV` STEHT BEWUSST NICHT DARUNTER — `moduleForHost` trifft
 * `uav.localtest.me` VOR und UNABHAENGIG von `prodHostsFor` (`${m.key}.localtest.me`,
 * `src/core/registry.ts:257-261`), und die einzige Boot-Pruefung, die an einem
 * gesetzten `SUITE_HOST_UAV` haengt (`_lib/boot.ts`s `UAV_SW_MODUS`-Pflicht),
 * greift NUR dann — `UAV_SW_MODUS: "cachen"` steht unten ohnehin, unabhaengig
 * vom Host-Schalter.
 */
export const UAV_ENV: Record<string, string> = {
  SUITE_ADMIN_GROUP_UAV: UAV_ADMIN_GRUPPE,
  // Spec §5: erst in diesem Modus liefert `/sw.js` den Cache-Worker aus, und
  // nur dann traegt er `uav-pwa-v1` (Check 4). Vorgabe ist `"abraeumen"` — ohne
  // diese Zeile bliebe der Cache-Zweig in E2E unpruefbar.
  UAV_SW_MODUS: "cachen",
};

/**
 * Absolute Per-Host-URL: `baseURL` zeigt auf den PORTAL-Host
 * (`playwright.config.ts`), und `portal` traegt `requiresAuth: true` — jeder
 * RELATIVE Aufruf landete dort im Login.
 */
export function uavUrl(pfad: string): string {
  return `http://${UAV_HOST}:${UAV_PORT}${pfad}`;
}

/** Dieselbe URL auf dem FREMDEN Suite-Host — fuer die 404-Zusagen (Checks 4, 9). */
export function fremdUrl(pfad: string): string {
  return `http://${FREMDER_HOST}:${UAV_PORT}${pfad}`;
}

/**
 * CLAUDE.md Falle 10: `next dev` uebersetzt jeden Route Handler erst beim
 * ERSTEN Treffer. `TeilnehmerApp.tsx` feuert direkt beim ersten Render von `/`
 * bzw. `/aufgabe` ein `api.me()` und (nach bestaetigter Identitaet) sofort
 * einen `POST /api/sync` — trifft der ECHTE, nicht wiederholte Sync-Aufruf des
 * Offline-Checks (Check 7) dieses Uebersetzungsfenster, bricht er mit
 * `net::ERR_ABORTED` ab, ohne je eine Antwort zu liefern.
 *
 * Ein einziger `pnpm exec playwright test e2e/uav.spec.ts` faehrt alle
 * Faelle dieser Datei in genau diesem Prozess (`workers: 1`), spaetere Faelle
 * treffen die Routen also ohnehin schon warm — dieser Aufruf sichert aber
 * auch einen GEFILTERTEN Lauf (`--grep`) ab, der nur einen Teil der Datei
 * ausfuehrt. Status/Fehlerkoerper der Antworten sind hier bedeutungslos (401
 * anonym, 405 auf reinen POST-Routen) — tragend ist allein die einmalige
 * Kompilation.
 */
export async function warmeUavRouten(request: {
  get(url: string): Promise<unknown>;
}): Promise<void> {
  const routen = ["/api/anmeldung", "/api/me", "/api/tasks", "/api/progress", "/api/sync"];
  for (const pfad of routen) {
    await request.get(uavUrl(pfad)).catch(() => {});
  }
}
