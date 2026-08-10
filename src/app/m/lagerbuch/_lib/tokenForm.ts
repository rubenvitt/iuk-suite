/**
 * §8.3 — DER TOKEN-VERTRAG UND DER TEXT ZU ENTSCHEIDUNG 8-F.
 *
 * WARUM DIESE VIER WERTE HIER STEHEN UND NICHT IN `_actions/`:
 * Ein `"use server"`-Modul darf ausschliesslich async-Funktionen exportieren —
 * jeder Export wird dort zu einer Server Action mit global aufrufbarer ID.
 * `_actions/guards.test.ts:265-267` meldet deshalb jedes `export const` in
 * `_actions/` als Fremdform, und sein Kopfkommentar sagt woertlich, wohin
 * Konstanten gehoeren: nach `_lib/`.
 *
 * WARUM OHNE `"use client"`: `_actions/tokens.ts` und `_actions/loeschen.ts`
 * lesen diese Werte SERVERSEITIG. Aus einem Client-Modul kaeme dort eine
 * Client-Referenz statt des Wertes an — HTTP 500 fuer die ganze Seite, waehrend
 * typecheck und build gruen bleiben und Vitest es strukturell nicht sehen kann
 * (Falle 6, CLAUDE.md). Diese Datei ist damit von beiden Seiten lesbar, und
 * genau das ist ihr Zweck.
 *
 * Sie haelt vier Werte und sonst nichts — keine Importe, keine Logik.
 */

// ——— §8.3: die Codeform ————————————————————————————————————————————————
//
// DIESE DREI ZAHLEN STEHEN AUF LAMINIERTEN KAERTCHEN IM FAHRZEUG. Sie zu
// aendern macht gedruckte Gegenstaende wertlos — 1:1-Pflicht.
//
// Coderaum 10^6. Die Sicherheit gegen Raten liegt NICHT in der Laenge, sondern
// in der Drosselung davor (§3.5.3): bei N aktiven Codes rund 10^6/N Versuche im
// Erwartungswert.
export const TOKEN_ALPHABET = "0123456789";
export const TOKEN_ZIFFERN = 6;

/**
 * Hoechstzahl der Ziehungen in `erzeugeFreienCode` (`_actions/tokens.ts`).
 * Danach gibt die Funktion `null` zurueck, und die Action verwandelt das in
 * einen festen deutschen Fehler — sie wirft nicht.
 */
export const TOKEN_ZIEHUNGEN = 20;

// ——— Entscheidung 8-F: der Code-Namensraum ist gesperrt ————————————————
//
// Ein Zugangs-Code kann nur noch gesperrt werden (`aktiv = false`); sein Code
// bleibt fuer immer belegt. Der Grund: bis T160 war ein Code loeschbar, solange
// keine Buchung auf ihn zeigte — ein gedrucktes, nie eingeloestes Kaertchen
// konnte seinen Code also an ein spaeter ausgestelltes verlieren. Weil
// `tokens.code` zugleich der Anzeigeschluessel im Journal ist (1:1-Pflicht 6),
// erschienen historische Zeilen danach unter dem NEUEN Label.
//
// §11.7: Jeder abgelehnte Weg nennt den Weg, der bleibt. Das Wort „sperren"
// gehoert deshalb in den TEXT und nicht nur auf den zweiten Knopf — der Dialog
// zeigt `grund` woertlich an, und ein Grund ohne Alternative liesse die Person
// vor einer Sackgasse stehen.
//
// §11.2 (d): ein Satz ohne Technik. Kein SQL, kein Fremdschluessel, kein Stack.
export const TOKEN_LOESCHGRUND =
  "Zugangs-Codes bleiben als Nachweis erhalten und ihr Code bleibt dauerhaft "
  + "belegt — sonst erschienen alte Journalzeilen unter dem Label eines neuen "
  + "Codes. Du kannst diesen Code stattdessen sperren.";
