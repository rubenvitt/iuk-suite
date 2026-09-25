/**
 * §8.3 — DER TOKEN-VERTRAG UND DER TEXT ZU ENTSCHEIDUNG 8-F.
 *
 * WARUM DIESE WERTE HIER STEHEN UND NICHT IN `_actions/`:
 * Ein `"use server"`-Modul darf ausschliesslich async-Funktionen exportieren —
 * jeder Export wird dort zu einer Server Action mit global aufrufbarer ID.
 * Der Bauform-Scan in `_actions/guards.test.ts` (Zusicherung „kennt an einem
 * Zeilenanfang mit `export` NUR die eine Action-Bauform und Typ-Exporte")
 * meldet deshalb jedes `export const` in
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
 * Sie haelt nur Werte und sonst nichts — keine Importe, keine Logik.
 */

// ——— §8.3: die Codeform ————————————————————————————————————————————————
//
// DIESE ZAHLEN STEHEN AUF LAMINIERTEN KAERTCHEN IM FAHRZEUG. Sie zu aendern
// macht gedruckte Gegenstaende wertlos — 1:1-Pflicht.
//
// SEIT DRK-442 IST DER CODERAUM DIE ABWEHR, NICHT DIE DROSSELUNG: 28 Zeichen
// Crockford-Base32 in sieben Vierergruppen, 28 × 5 = 140 bit — dieselbe Form wie
// im Funkmodul (`radio/_lib/code.ts`) und ueber der 128-bit-Schwelle aus
// `docs/radio-portierung-analyse.md`. Selbst ungebremst, bei 10^6 Versuchen je
// Sekunde und 1.000 aktiven Codes, liegt der erste Treffer bei rund 10^25
// Jahren. Deshalb weist die modulweite Sperre eine Eingabe in DIESER Form nie ab
// (`gateSchranke.ts`, `gateGesperrt`).
//
// Das Alphabet laesst I, L, O und U KONSTRUKTIV weg; beim Eintippen bildet
// `normalisiereCode` O auf 0 und I/L auf 1 zurueck. 32 Zeichen teilen 256, die
// Ziehung ist damit ohne Verzerrung.
//
// ⚠️ DIE ALTE FORM (6 Ziffern, `NNN-NNN`, 10^6) BLEIBT GUELTIG, bis ihre Karte
// neu gedruckt ist (Betreiberentscheidung 24.09.2026) — aber nur hinter der
// Sperre. Erzeugt wird sie nie mehr; erkannt wird sie in `code.ts`.
export const TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TOKEN_ZEICHEN = 28;
export const TOKEN_GRUPPE = 4;

/**
 * DAS EINGABEFELD FUER EINEN CODE — am Gate (`_ui/Gate.tsx`) und bei der
 * Erneuerung mitten im Check (`_ui/CheckFlow.tsx`). Ein Wert an einer Stelle,
 * weil zwei Felder, die verschiedene Formen annehmen, genau an der Erneuerung
 * auseinanderliefen: dort, wo zwanzig Minuten Zaehlarbeit auf dem Spiel stehen.
 *
 * Das Muster nimmt beide Formen, mit oder ohne Trenner je Gruppe, und Klein-
 * buchstaben. Es ist die billigste Massnahme gegen Fehleingaben am GEMEINSAMEN
 * Fehlversuchs-Eimer der alten Form (§7.5.3, Falle 24): eine offensichtlich
 * falsche Eingabe geht gar nicht erst ab. `normalisiereCode` bringt, was
 * durchkommt, auf die Erzeugerform.
 *
 * ⚠️ `(-| )` UND NICHT `[- ]`: Chromium uebersetzt `pattern` mit dem `v`-Flag,
 * und dort ist ein nacktes `-` in einer Zeichenklasse ein Syntaxfehler — das
 * Feld naehme dann still JEDE Eingabe an.
 */
export const CODEFELD_MUSTER =
  "[0-9]{3}(-| )?[0-9]{3}|([0-9A-Za-z]{4}(-| )?){6}[0-9A-Za-z]{4}";
/** 28 Zeichen und sechs Trenner. */
export const CODEFELD_LAENGE = 34;
export const CODEFELD_PLATZHALTER = "Code vom Etikett";

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
