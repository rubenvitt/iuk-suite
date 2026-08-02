/**
 * Grammatik, Hash und Normalisierung der Abgabelink-Tokens (`zugangslinks`, §4.7).
 *
 * Server-only: `node:crypto` steht am Modulkopf. Dieses Modul trägt bewusst
 * keine Client-Direktive und darf auch aus keinem Client-Modul importiert
 * werden — es wird von Server Components und Route Handlern gelesen (T29, T31,
 * T38), und ein Wert aus einem Client-Modul käme dort als Client-Referenz statt
 * als Wert an (Falle 6 in `docs/design/README.md`).
 *
 * (Die Zeichenfolge der Direktive steht hier absichtlich nicht wörtlich: sie
 * würde diese Datei in jeder Suche nach Client-Modulen als Treffer zeigen.)
 */
import { createHash, randomBytes } from "node:crypto";

/**
 * 32 Zeichen, ohne `0`, `1`, `l` und `o` — die vier, die beim Vorlesen und
 * Abschreiben verwechselt werden. Genau das ist die 1:1-Pflicht der Spec (§4.7):
 * Codes werden von Hand abgeschrieben und vorgelesen, ein erweitertes Alphabet
 * holt die Verwechselbarkeit zurück. Wörtlich aus `drop`
 * (`src/share-token-config.js:7`) — nicht, damit dort gedruckte Codes
 * weiterleben (der 72-Stunden-Freeze beendet sie, siehe `tokenHash`), sondern
 * weil dieselbe Menge dieselbe Vorlesbarkeit trägt.
 */
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
const PRAEFIX = "dz-";
const GRUPPEN_LAENGE = 4;
const GRUPPEN_ANZAHL = 3;
/** 12 Geheimzeichen aus 32 Möglichkeiten = 60 Bit Entropie (§4.7). */
const KOERPER_LAENGE = GRUPPEN_LAENGE * GRUPPEN_ANZAHL;

/**
 * Ein Byte auf ein Alphabetzeichen abbilden — verzerrungsfrei, und zwar
 * ausschließlich deshalb, weil 256 ein ganzzahliges Vielfaches von 32 ist: jedes
 * der 32 Zeichen trifft genau 8 der 256 Bytewerte. Bei einer Alphabetlänge, die
 * 256 nicht teilt (33 Zeichen etwa), wären die vorderen Zeichen häufiger und die
 * Entropie stillschweigend kleiner als 60 Bit. Die Länge 32 ist hier also keine
 * Ästhetik, sondern die Voraussetzung der Gleichverteilung.
 *
 * Exportiert allein, damit genau diese Zusage prüfbar ist (`token.test.ts`).
 */
export function zeichenAusByte(byte: number): string {
  return ALPHABET[byte % ALPHABET.length];
}

/**
 * Erzeugt einen vollständigen Token in kanonischer Form `dz-xxxx-xxxx-xxxx`
 * (17 Zeichen). `zufallsBytes` ist injizierbar, damit Tests deterministisch
 * bleiben; produktiv kommen die Bytes aus `crypto.randomBytes`.
 *
 * Der Rohtoken wird NIE gespeichert (§4.7) — gespeichert werden `tokenHash` und
 * `token_start`: die ersten SIEBEN Zeichen im Klartext, also `dz-` plus vier
 * Geheimzeichen (so benennt §4.7 die Form selbst). Nicht acht, obwohl die
 * Spec-Tabelle „8" schreibt: `"dz-2345-6789-abcd".slice(0, 8)` ergibt
 * `"dz-2345-"` mit hängendem Bindestrich, und der bereits geprüfte DB-Test setzt
 * `tokenStart: "dz-2345"` (`_db/migrations.test.ts`). Die Spalte zu füllen ist
 * Sache von T30, nicht dieses Moduls — hier steht nur, was dort hingehört.
 */
export function erzeugeToken(
  zufallsBytes: (anzahl: number) => Uint8Array = standardBytes,
): string {
  const bytes = zufallsBytes(KOERPER_LAENGE);
  let koerper = "";
  for (const byte of bytes) koerper += zeichenAusByte(byte);
  return PRAEFIX + gruppiere(koerper);
}

function standardBytes(anzahl: number): Uint8Array {
  return randomBytes(anzahl);
}

/**
 * `base64url_ohne_padding(SHA-256(utf8(voller Token)))` — über den **vollen**
 * Token inklusive `dz-` und Bindestrichen, ohne Salt, ohne Trim, ohne
 * Kleinschreibung. So schreibt die Spec die Form verbindlich vor (§4.7,
 * `token_hash`); es ist derselbe Aufbau wie in `drop` (gemessen gegen
 * better-auths `defaultKeyHasher`, `api-key/dist/index.mjs:2085-2088`).
 *
 * Die Parität ist dabei Absicht, aber **kein** Datenzwang: es wird keine
 * `token_hash`-Zeile aus `drop` importiert. Der 72-Stunden-Token-Freeze macht
 * zum Cutover-Termin jedes Alt-Token ungültig, deshalb wird das
 * better-auth-`apikey`-Schema gar nicht nachgebaut (Spec §4.7, Analyse E15).
 *
 * SHA-256 statt bcrypt ist begründet: 60 Bit Entropie und höchstens 72 Stunden
 * Laufzeit; bcrypt auf jedem Upload-Chunk wäre Rechenlast ohne Gewinn (§4.7).
 *
 * **Diese Funktion normalisiert nicht.** Wer eine Eingabe hashen will, ruft
 * zuerst `normalisiereToken` — sonst findet die Suche nach `token_hash` nichts,
 * und zwar still.
 */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Bringt eine Eingabe in die kanonische Form oder lehnt sie ab (`null`).
 *
 * Toleriert wird genau zweierlei: Groß-/Kleinschreibung und die Trennzeichen
 * (fehlend, zu viele, falsch gesetzt, Weißraum statt Bindestrich). Alles andere
 * ist eine Ablehnung — insbesondere jedes Zeichen außerhalb des Alphabets, also
 * auch `0`, `1`, `l` und `o`.
 *
 * Der einzige Aufrufer ist der Pfadabschnitt von `/u/<token>`: eine Ablehnung
 * führt dort zu HTTP 200 mit Korrekturaufforderung, nicht zu einem Fehler
 * (§8.1). Ein Eingabefeld für Tokens gibt es nicht mehr (§8.1: es wäre ein
 * Rateweg) — deshalb ergänzt diese Fassung, anders als die Alt-Normalisierung,
 * **kein** fehlendes `dz-` und schält keinen Token aus einer URL.
 */
export function normalisiereToken(eingabe: string): string | null {
  /*
   * Es fallen NUR Trennzeichen weg: Bindestriche und Weißraum. Niemals
   * `replace(/[^a-z0-9]/g, "")` — genau dieses stille Wegputzen fremder Zeichen
   * machte die Alt-Normalisierung am Ende zu einem Pass-through
   * (`drop/web/src/lib/utils.ts:75,96`): aus `dz-abc!x-6789-abcd` wurde dort ein
   * gültig aussehendes `dz-abcx-6789-abcd`.
   */
  const kompakt = eingabe.toLowerCase().replace(/[-\s]/g, "");
  if (!kompakt.startsWith("dz")) return null;

  const koerper = kompakt.slice("dz".length);
  if (koerper.length !== KOERPER_LAENGE) return null;
  for (const zeichen of koerper) {
    if (!ALPHABET.includes(zeichen)) return null;
  }

  // Die Bindestriche müssen wieder hinein: der gespeicherte Hash steht über der
  // kanonischen Form, eine kompakte Fassung träfe ihn nicht.
  return PRAEFIX + gruppiere(koerper);
}

function gruppiere(koerper: string): string {
  const gruppen: string[] = [];
  for (let i = 0; i < koerper.length; i += GRUPPEN_LAENGE) {
    gruppen.push(koerper.slice(i, i + GRUPPEN_LAENGE));
  }
  return gruppen.join("-");
}
