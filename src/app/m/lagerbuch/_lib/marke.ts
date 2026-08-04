/**
 * Die Wortmarke des Moduls — drei Alt-Env-Variablen, die zu Konstanten werden
 * (§10.2): APP_NAME, APP_ORG, APP_TAGLINE (`lagerbuch/src/lib/config.ts:30-32`).
 *
 * WARUM KEINE ENV. Der Modulname steht in `core/registry.ts`; die Wortmarke ist
 * Gestaltung, keine Konfiguration. Die Organisation ist seit Bestehen unveraendert
 * und gehoert nicht in eine Datei, die jeder Deploy anfassen kann — eine
 * Env-Variable dafuer ist ein Regler, an dem niemand drehen soll und den trotzdem
 * jeder Deploy neu setzen muss.
 *
 * KEINE CLIENT-DIREKTIVE. Die Gate-Seite (§7.2.4) und die PWA-Route-Handler
 * (§7.10.2) sind Server-Code; ein Wert aus einem Client-Modul kaeme dort als
 * Client-Referenz an (Falle 6).
 *
 * KEIN ZUGRIFF AUF DIE PROZESSUMGEBUNG in dieser Datei — auch nicht als
 * Rueckfall. Ein `… ?? "…"` mit einer Umgebungsvariablen gaebe die Variable
 * wieder, nur undokumentiert. `_lib/marke.test.ts` scannt den Quelltext darauf.
 *
 * ⚠️ DESHALB STEHT DER GESUCHTE AUSDRUCK HIER NICHT AUSGESCHRIEBEN. Der Scan ist
 * ein schlichtes `toContain` ueber die ganze Datei, KOMMENTARE EINGESCHLOSSEN —
 * eine Kommentar-Ausnahme waere hier die falsche Loesung: die Datei ist zwoelf
 * Zeilen lang, und ein Scan ohne Sonderfaelle ist der, den niemand abschaltet.
 *
 * ⚠️ ANNAHME A-T3-4: `LAGERBUCH_ORGANISATION` steht im Repo nur als
 * Dev-Vorbelegung (`lagerbuch/playwright.config.ts:31`); die produktive stack.env
 * ist gitignoriert. Der wahre Wert ist eine RUNBOOK-EINGABE — er steht auf jedem
 * gedruckten Etikett und auf dem Gate. Die Korrektur ist danach ein
 * Ein-Zeilen-Commit, kein Deploy-Schalter; genau das ist der Zweck.
 */

/** Alt: APP_NAME. Erscheint in der Kopfzeile des Gates und im PWA-Manifest. */
export const LAGERBUCH_MARKE = "Lagerbuch";

/** Alt: APP_ORG. Erscheint am Gate und auf dem Etikettenbogen. ⚠️ A-T3-4. */
export const LAGERBUCH_ORGANISATION = "DRK Bereitschaft Musterstadt";

/** Alt: APP_TAGLINE. Die Unterzeile am Gate und die `description` des Manifests. */
export const LAGERBUCH_ZEILE = "Bestand, Fahrzeuge, Geräte";
