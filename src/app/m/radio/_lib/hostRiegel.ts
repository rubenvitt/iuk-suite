import { radioHostOderNull } from "./host";

/**
 * DIE VIERTE RIEGELFORM (Spec:530-547, nachgetragen in B13). Fuer Route Handler, deren
 * FEHLantwort einen bestimmten `Content-Type` braucht — einziger heutiger Fall
 * `sw.js/route.ts` (Kapitel 7 §7.1.3, Planteil 5).
 *
 * ⚠️ `radioHostOderNull` UND NICHT DIE WERFENDE FORM `requireRadioHost`. Ein `notFound()`
 * waere eine HTML-Fehlerseite mit `Content-Type: text/html`, und der Browser meldete
 * „manifest fetch failed" statt einer sauberen Abweisung (Spec:544-546).
 *
 * ⛔ DER NAME OBEN STEHT OHNE KLAMMER, UND DAS IST KEINE NACHLAESSIGKEIT: `host.test.ts`
 * prueft `not.toMatch(/\brequireRadioHost\s*\(/)` auf dem ROHTEXT dieser Datei. Ein `(`
 * hinter dem Namen — auch in diesem Kommentar — macht den Test in dem Moment rot, in dem
 * er geschrieben wird. Dasselbe gilt fuer eine Importzeile aus `next/navigation`.
 *
 * ⚠️ DIE RUECKGABE IST `Response | null`, DAMIT DER AUFRUFER SIE MIT `??` KURZSCHLIESSEN
 * KANN: `return hostAbweisung(req) ?? <Antwort>`. Genau das macht „als erste Anweisung"
 * STRUKTURELL wahr statt konventionell — im rechten Zweig kann nichts vor dem Riegel
 * laufen, weil er erst ausgewertet wird, wenn der linke `null` ist (Spec:538-540). Ein
 * Riegel, der als ZWEITE Anweisung stuende, antwortete auf fremdem Host genauso mit 404,
 * und kein Verhaltenstest saehe den Unterschied.
 *
 * WARUM EINE EIGENE DATEI UND KEINE ZEILE IN JEDEM HANDLER: der Riegel ist keine Route,
 * sondern eine GETEILTE ZUSAGE. Bei `lagerbuch` standen fuenf Kopien, und fuenf Kopien
 * heissen fuenf Orte fuer dieselbe Aenderung (lagerbuch/_lib/hostRiegel.ts:6-13,
 * Befund 43). `radio` hat heute EINEN kuenftigen Konsumenten — die Datei existiert
 * trotzdem, weil `riegel.test.ts` (Z5) sie als erlaubte Alternative fuehren muss.
 *
 * ✅ DIESE RIEGELFORM IST SEIT DEM 2026-08-27 WIRKGEPRUEFT (Planteil 5, T4) — bis dahin war
 * fuer sie KEIN Wirknachweis bei echtem Abruf vorhanden, nur der Quelltext-Scan. Der Beleg:
 * `e2e/radio-hosts.spec.ts`, Schleifeneintrag `/m/radio/sw.js` (404 auf dem fremden, 200 auf
 * dem eigenen Host). ⛔ Und er ist falsifiziert: Sonde S-T4a hat den `??`-Kurzschluss in
 * `sw.js/route.ts` durch einen unbedingten Antwortbau ersetzt — der Eintrag wurde rot
 * (`Expected: 404 / Received: 200`).
 *
 * KEIN "use client" (Falle 6): der Konsument ist eine Server-Datei; ein WERT aus einem
 * Client-Modul kaeme dort als Client-Referenz an.
 */
export function hostAbweisung(req: Request): Response | null {
  return radioHostOderNull(new Headers(req.headers))
    ? null
    : new Response("Not found", { status: 404 });
}
