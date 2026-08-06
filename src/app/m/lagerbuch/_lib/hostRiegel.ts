import { lagerbuchHostOderNull } from "./host";

/**
 * DER HOST-RIEGEL DER FUENF PWA-ROUTE-HANDLER — §2.6, §7.10.2.
 *
 * WARUM ES DIESE DATEI GIBT (Befund 43). Der Plan druckt den dreizeiligen
 * Riegel fuenfmal woertlich ab und begruendet die Wiederholung damit, dass Next
 * die Route aus dem VERZEICHNISNAMEN ableitet. Das ist richtig und gilt fuer die
 * Dateien und Verzeichnisse — ueber den Riegel sagt es nichts. Der ist keine
 * Route, sondern eine GETEILTE ZUSAGE: fuenf Kopien heissen, dass eine spaetere
 * Aenderung an fuenf Stellen nachgezogen werden muss. `_lib/pwaIcons.ts` hat mit
 * `pngAntwort` denselben geteilten Helfer fuer die Antwortform bereits
 * vorgemacht.
 *
 * ⚠️ `lagerbuchHostOderNull` UND NICHT DIE WERFENDE FORM `requireLagerbuchHost`.
 * Ein `notFound()`
 * waere eine HTML-Fehlerseite mit `Content-Type: text/html`, und der Browser
 * meldete „manifest fetch failed" statt eines sauberen 404. Route Handler haben
 * ausserdem kein Layout ueber sich, das den Riegel fuer sie traegt (Falle 55).
 *
 * ⚠️ DIE RUECKGABE IST `Response | null`, DAMIT DER AUFRUFER SIE MIT `??`
 * KURZSCHLIESSEN KANN. Genau das macht §2.6s „als erster Anweisung"
 * STRUKTURELL wahr statt konventionell: in `hostAbweisung(req) ?? <Antwort>`
 * kann nichts vor dem Riegel laufen, weil der rechte Zweig erst ausgewertet
 * wird, wenn der linke `null` ist. Ein Riegel, der als zweite Anweisung stuende,
 * antwortete auf fremdem Host genauso mit 404 — und kein Verhaltenstest saehe
 * den Unterschied.
 *
 * KEIN "use client" (Falle 6): die fuenf Handler sind Server-Dateien; ein WERT
 * aus einem Client-Modul kaeme dort als Client-Referenz an.
 */
export function hostAbweisung(req: Request): Response | null {
  return lagerbuchHostOderNull(new Headers(req.headers))
    ? null
    : new Response("Not found", { status: 404 });
}
