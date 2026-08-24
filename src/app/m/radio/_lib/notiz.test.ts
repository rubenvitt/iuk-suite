// src/app/m/radio/_lib/notiz.test.ts
import { describe, it, expect } from "vitest";
import { haengeNotizAn } from "./notiz";

/**
 * DIE FAELSCHUNGSSICHERE UPDATE-ANMERKUNG — 1:1 aus
 * `radio-admin/shared/src/update-note.ts:25-35` (Aufgabe V8,
 * `.superpowers/sdd/planteil4/briefs/V8.md:29-59`).
 *
 * ⚠️ ZWEI ZUSAGEN DES AUFRUFERS LIEGEN NICHT HIER, UND DAS IST KEINE AUSLASSUNG:
 * dass die angehaengte Zeile und ihr Ereignis EINEN Zeitstempel teilen („damit beide nicht
 * ueber eine Mitternachtsgrenze auseinanderlaufen",
 * `radio-admin/server/src/routes/devices.ts:172-176`), und dass das Ereignis als `newValue`
 * NUR die neue Zeile traegt (`devices.ts:180`). Diese Funktion nimmt `wann` als Parameter
 * entgegen — sie liest keine Uhr und schreibt kein Ereignis; ein Fall dazu haette hier kein
 * Pruefobjekt. Eigentuemer ist Aufgabe V10, `notizAnfuegenAction`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1283-1288`).
 */

/*
 * ⛔ DER ZEITPUNKT IST MIT ABSICHT EIN GRENZFALL UND KEIN GLATTER MITTAG: 23:30 UTC am
 * Monatsletzten ist in Europe/Berlin bereits der 1. Juli, 01:30 (CEST, UTC+2). Ein
 * ortszeitbasierter Aufbau des Datums traegt hier einen anderen MONAT ein. Der Fall „das
 * Datum ist UTC" unten haengt an genau dieser Differenz.
 */
const wann = new Date("2026-06-30T23:30:00Z");

describe("haengeNotizAn — anhaengen, nie ueberschreiben", () => {
  it("haengeNotizAn ueberschreibt nie", () => {
    /*
     * `radio-admin/shared/src/update-note.ts:34`. Alt-Faelle `update-note.test.ts:14-25`.
     *
     * ⛔ DER BESTEHENDE INHALT STEHT WOERTLICH IM ERGEBNIS, EINSCHLIESSLICH SEINES LEERRAUMS.
     * Der Alt-Kommentar sagt es aus (`update-note.ts:17-18`): „the existing value is preserved
     * verbatim". Gepruefte Gegenrichtung in derselben Zusicherung: der NEUE Text wird getrimmt
     * (`:32`), der bestehende nicht. Die Spalte ist append-only (`_db/schema.ts:54-56`); ein
     * Nachbau, der `bisher` trimmt oder ersetzt, loescht Auditzeilen, ohne dass ein Tor es
     * sieht. Sonden S-V8i (Trim des neuen Textes) und S-V8j (Ueberschreiben) haengen hier.
     */
    expect(haengeNotizAn("  behalten  ", "  Text  ", "Max", wann)).toBe(
      "  behalten  \n[2026-06-30 · Max] Text",
    );
    const bisher = "[2026-06-01 · Eva] alt";
    expect(haengeNotizAn(bisher, "neu", "Max", wann)).toBe(
      "[2026-06-01 · Eva] alt\n[2026-06-30 · Max] neu",
    );
  });

  it("ohne bisherigen Inhalt entsteht die Zeile ohne fuehrenden Zeilenumbruch", () => {
    /*
     * `radio-admin/shared/src/update-note.ts:34`: `existing && existing.length > 0`. Alt-Fall
     * `update-note.test.ts:7-12`. Alle drei leeren Formen fuehren zur selben Antwort — `null`,
     * `undefined` (der Spaltenwert ist nullable, `_db/schema.ts:56`) und die leere
     * Zeichenkette. Ein `${bisher}\n${zeile}` ohne diese Fallunterscheidung setzte eine
     * leere erste Zeile vor jede erste Notiz, und der Zeilenzaehler des Falls darunter
     * zaehlte fuer immer eins zu viel.
     */
    expect(haengeNotizAn(null, "ISSI weicht ab: 999", "Max", wann)).toBe(
      "[2026-06-30 · Max] ISSI weicht ab: 999",
    );
    expect(haengeNotizAn(undefined, "x", "Max", wann)).toBe("[2026-06-30 · Max] x");
    expect(haengeNotizAn("", "x", "Max", wann)).toBe("[2026-06-30 · Max] x");
  });

  it("das Datum ist UTC", () => {
    /*
     * `isoDate`, `radio-admin/shared/src/update-note.ts:2-4`: `toISOString().slice(0, 10)`.
     * Der Alt-Kommentar nennt den Grund (`:1`): „stable, locale-independent".
     *
     * ⛔ DER ZEITPUNKT LIEGT IN BERLIN SCHON IM NAECHSTEN MONAT (01:30 am 1. Juli, CEST).
     * Ein Nachbau ueber `toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })` oder ueber
     * `getFullYear()/getMonth()/getDate()` schriebe `2026-07-01` — und die Auditzeile truege
     * ein Datum, das der gespeicherte Zeitstempel des zugehoerigen Ereignisses nicht hat.
     * Sonde S-V8k haengt an dieser Zeile.
     */
    expect(haengeNotizAn(null, "x", "Max", wann)).toBe("[2026-06-30 · Max] x");
  });
});

describe("haengeNotizAn — der Faelschungsschutz, jeder Weg einzeln", () => {
  /*
   * ⛔ DER GRUND STEHT IM QUELLKOMMENTAR UND WANDERT WOERTLICH MIT
   * (`radio-admin/shared/src/update-note.ts:20-23`): „each call appends **exactly one** line.
   * `text` and `author` are sanitized … so neither argument can forge a second
   * `[date · author]` audit entry (audit-trail injection)."
   */

  it("ein Zeilenumbruch im Text wird zu einem Leerzeichen", () => {
    /*
     * `singleLine`, `radio-admin/shared/src/update-note.ts:12`. Alt-Fall
     * `update-note.test.ts:27-33`.
     *
     * ⛔ DER ERSTE DER DREI WEGE. Ohne die Kollabierung faelscht ein
     * `\n[2020-01-01 · Chef] genehmigt` im Textfeld eine zweite, aelter datierte Auditzeile,
     * die von einer echten nicht zu unterscheiden waere. Sonde S-V8l haengt hier.
     */
    const gefaelscht = "ok\n[2020-01-01 · Chef] genehmigt";
    expect(haengeNotizAn(null, gefaelscht, "Max", wann)).toBe(
      "[2026-06-30 · Max] ok [2020-01-01 · Chef] genehmigt",
    );
  });

  it("ein Zeilenumbruch im Autor wird ebenfalls kollabiert", () => {
    /*
     * `singleLine` auf `author`, `radio-admin/shared/src/update-note.ts:31`.
     *
     * ⛔ DER ZWEITE WEG — DER, DEN EIN NACHBAU VERGISST, weil der Autorname „ja vom Server
     * kommt" (`.superpowers/sdd/planteil4/briefs/V8.md:70`). Er kommt aus `users.name`
     * (`_db/schema.ts:111`), und dort steht, was die Identitaetsquelle geliefert hat. Sonde
     * S-V8m haengt hier — sie ist die, die `singleLine` NUR auf `text` anwendet.
     *
     * Der `]` im Autornamen faellt in derselben Zusicherung mit weg; das ist der dritte Weg,
     * und er hat unten seinen eigenen Fall.
     */
    const ergebnis = haengeNotizAn(null, "x", "Eve\n[2020-01-01 · Root", wann);
    expect(ergebnis).toBe("[2026-06-30 · Eve [2020-01-01 · Root] x");
  });

  it("eine eckige Klammer im Autor wird entfernt", () => {
    /*
     * `radio-admin/shared/src/update-note.ts:31`: `.replace(/]/g, "")`. Alt-Fall
     * `update-note.test.ts:35-39`.
     *
     * ⛔ DER DRITTE WEG, UND ER BRAUCHT KEINEN ZEILENUMBRUCH. Die schliessende Klammer ist das
     * Zeichen, das eine Auditzeile beendet; ein Autor namens `Eve] x [2020-01-01 · Root`
     * schnitte die echte Zeile mitten entzwei und haenge eine gefaelschte an sie an — alles
     * in EINER Zeile, also am Zeilenzaehler vorbei. ⛔ ENTFERNT, NICHT ERSETZT: ein
     * Ersatzzeichen bliebe im Namen stehen. Sonde S-V8n haengt hier.
     */
    expect(haengeNotizAn(null, "x", "Eve] [2020-01-01 · Root", wann)).toBe(
      "[2026-06-30 · Eve [2020-01-01 · Root] x",
    );
  });

  it("ein Aufruf haengt GENAU EINE Zeile an", () => {
    /*
     * ⛔ DIE ZUSICHERUNG, DIE ALLE DREI REGELN ZUSAMMEN TRAGEN
     * (`.superpowers/sdd/planteil4/briefs/V8.md:72`): Zeilen zaehlen, vorher und nachher. Die
     * drei Faelle darueber pruefen je einen Weg an seinem Ergebnistext; dieser prueft die
     * Eigenschaft, die der Alt-Kommentar zusichert („each call appends **exactly one** line",
     * `radio-admin/shared/src/update-note.ts:20`), und zwar mit ALLEN Wegen gleichzeitig
     * bespielt. Er ist damit der einzige Fall, den auch eine noch unbekannte vierte
     * Faelschungsform rot faerben wuerde.
     */
    const bisher = "[2026-06-01 · Eva] alt\n[2026-06-02 · Eva] noch alt";
    const vorher = bisher.split("\n").length;
    const ergebnis = haengeNotizAn(
      bisher,
      "ok\n[2020-01-01 · Chef] genehmigt",
      "Eve]\n[2020-01-01 · Root",
      wann,
    );
    expect(ergebnis.split("\n")).toHaveLength(vorher + 1);
    expect(ergebnis.startsWith(bisher)).toBe(true);
  });
});
