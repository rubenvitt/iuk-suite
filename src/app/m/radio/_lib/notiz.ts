// src/app/m/radio/_lib/notiz.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): `haengeNotizAn` ist eine
// reine Rechnung, die Server Actions und ihre Tests rufen; eine Direktive machte daraus eine
// Modulreferenz. Der Scan, der das fuer `_lib/` und `_db/` modulweit durchsetzt, steht in
// `src/app/m/radio/riegel.test.ts:1064-1117`.

/**
 * Formt ein `Date` als `YYYY-MM-DD` in UTC (stabil, sprach- und ortsunabhaengig).
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/update-note.ts:2-4` (`isoDate`), samt der Begruendung des
 * Alt-Kommentars (`:1`): „stable, locale-independent". ⛔ UTC UND NICHT Europe/Berlin — und
 * das ist hier NICHT dieselbe Frage wie bei `devices.last_updated_at`, wo der Import
 * ausdruecklich in Berliner Ortszeit kuerzt (`_db/schema.ts:34-39`). Dort ist der Wert ein
 * erfasstes STAMMDATUM, hier ist er der Zeitstempel eines Ereignisses: die Auditzeile und die
 * Ereigniszeile, die im selben Zug entsteht, muessen dasselbe Datum tragen, und die
 * Ereigniszeile fuehrt einen rohen Zeitstempel (`_db/schema.ts:134`).
 */
function isoDatum(wann: Date): string {
  return wann.toISOString().slice(0, 10);
}

/**
 * Kollabiert alle Zeilenumbrueche (CR/LF) zu einzelnen Leerzeichen, damit ein angehaengter
 * Eintrag nie mehr als eine Zeile umfassen kann.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/update-note.ts:11-13` (`singleLine`). Der Alt-Kommentar
 * nennt sie beim Namen (`:7-9`): „This is the integrity guarantee that keeps the append-only
 * log forge-proof". Sie wird auf BEIDE Argumente angewandt, siehe `haengeNotizAn`.
 */
function eineZeile(wert: string): string {
  return wert.replace(/[\r\n]+/g, " ");
}

/**
 * Haengt EINE mit Datum und Namen gezeichnete Zeile an eine Update-Anmerkung an, ohne
 * bestehenden Inhalt je zu veraendern. Gibt den neuen Gesamtwert zurueck.
 *
 * ⛔ 1:1 AUS `radio-admin/shared/src/update-note.ts:25-35` (`appendUpdateNote`). Die Zeile
 * lautet `[YYYY-MM-DD · Autor] Text`; das Trennzeichen ist U+00B7 MIDDLE DOT mit je einem
 * Leerzeichen daneben, und die bereits erfassten `update_note`-Werte der Quelle tragen genau
 * diese Bytefolge — eine andere Schreibweise machte die importierte Historie von der neu
 * geschriebenen unterscheidbar.
 *
 * ⛔ DER GRUND DES FAELSCHUNGSSCHUTZES STEHT IM QUELLKOMMENTAR UND WANDERT WOERTLICH MIT
 * (`radio-admin/shared/src/update-note.ts:20-23`): „each call appends **exactly one** line.
 * `text` and `author` are sanitized — embedded newlines are collapsed to spaces and `]` is
 * stripped from `author` — so neither argument can forge a second `[date · author]` audit
 * entry (audit-trail injection)."
 *
 * Die vier Regeln, drei davon Faelschungsschutz:
 *
 * 1. Das Datum ist UTC (`isoDatum`, `update-note.ts:2-4`).
 * 2. ⛔ ZEILENUMBRUECHE IN `text` UND IN `autor` WERDEN KOLLABIERT (`eineZeile`, `:11-13`).
 *    Beide Wege einzeln — der zweite ist der, den ein Nachbau vergisst, weil der Autorname
 *    „ja vom Server kommt"; er kommt aus `users.name` (`_db/schema.ts:115`) und traegt, was
 *    die Identitaetsquelle geliefert hat.
 * 3. ⛔ AUS `autor` WIRD JEDES `]` ENTFERNT, NICHT ERSETZT (`:31`). Die schliessende Klammer
 *    beendet eine Auditzeile; ohne dieses Entfernen faelscht ein Autorname einen zweiten
 *    Eintrag INNERHALB derselben Zeile — also an jedem Zeilenzaehler vorbei.
 * 4. `text` wird getrimmt, `autor` nach der Bereinigung ebenfalls (`:31-32`).
 *
 * ⛔ BESTEHENDER INHALT BLEIBT WOERTLICH ERHALTEN (`:34`), die neue Zeile kommt mit `\n`
 * dahinter. UEBERSCHREIBEN GIBT ES NICHT: die Spalte ist append-only (`_db/schema.ts:56-59`),
 * und der Alt-Kommentar sagt es aus (`update-note.ts:17-18`): „the existing value is
 * preserved verbatim".
 *
 * ⚠️ DER AUFRUFER BENUTZT EINEN EINZIGEN ZEITSTEMPEL FUER DIE ANGEHAENGTE ZEILE UND IHR
 * EREIGNIS — „damit beide nicht ueber eine Mitternachtsgrenze auseinanderlaufen"
 * (`radio-admin/server/src/routes/devices.ts:172-176` baut `line` und `nextNote` mit
 * demselben `now`; die Zeile allein ist der `newValue` des Ereignisses, `devices.ts:180`).
 * Diese Funktion liest deshalb KEINE Uhr, sondern nimmt `wann` entgegen. Eigentuemer der
 * Zusage ist `notizAnfuegenAction` in Aufgabe V10
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1283-1288`).
 */
export function haengeNotizAn(
  bisher: string | null | undefined,
  text: string,
  autor: string,
  wann: Date,
): string {
  const sichererAutor = eineZeile(autor).replace(/]/g, "").trim();
  const sichererText = eineZeile(text.trim());
  const zeile = `[${isoDatum(wann)} · ${sichererAutor}] ${sichererText}`;
  return bisher && bisher.length > 0 ? `${bisher}\n${zeile}` : zeile;
}
