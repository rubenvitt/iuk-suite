import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  AUSLEIH_GRUENDE,
  RUECKGABE_GRUENDE,
  KEINE_GERAETE_ERFASST,
  KEINE_VERBINDUNG,
  SCHREIBSPERRE,
  ZUSTANDSNOTIZ_MAX,
  ausleihText,
  rueckgabeText,
  type AusleihErgebnis,
  type AusleihMeldung,
  type BetroffenesGeraet,
  type KonfliktZustand,
  type RueckgabeErgebnis,
  type RueckgabeMeldung,
} from "./meldungen";
import { gateMeldung } from "./gateTexte";
import { statusEtikett } from "./status";

/**
 * ⛔ DIE FESTE ERWARTUNGSTABELLE — SIE ERSETZT DEN VORGESCHRIEBENEN SUBSTRING-SCAN.
 *
 * Der Auftrag (`.superpowers/sdd/planteil3/briefs/A14.md:72-77`) nennt den Fall „jeder grund
 * hat genau einen Satz, UND KEINER NENNT EINEN SCHLUESSEL". Ein Scan „kein Text enthaelt
 * seinen `grund`-Schluessel" waere hier ROT-BY-CONSTRUCTION: der Satz zu `gesperrt` traegt
 * das Wort „gesperrt" als gewoehnliches deutsches Bildschirmwort
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:207-216`, Fund F3). Der billige Gruen-Fix
 * waere, den Bildschirmtext zu verstuemmeln — die stille Naeherung, gegen die dieser ganze
 * Bauweg steht.
 *
 * ⛔ DIE TABELLE FAENGT BEIDES IN EINEM ZUG, weil JEDE Abweichung vom Wortlaut rot ist: die
 * Verstuemmelung eines Satzes UND einen eingeschmuggelten Schluessel („Fehler: unbekannt").
 * ⛔ KEINEN ZWEITEN, SCHWAECHEREN SCAN DANEBEN STELLEN (`VORABSCAN-A.md:216`). Vorbild und
 * Praezedenzfall im Modul: `_lib/gateTexte.test.ts:30-41`.
 *
 * ⚠️ ZEHN ZEILEN FUER SIEBEN GRUENDE: `nicht-verfuegbar` traegt VIER, weil der Diskriminator
 * `grund` groeber ist als das Alt-Vokabular (drei Alt-Codes fallen auf einen `grund`,
 * Spec:5217-5221) und die Unterscheidung im `Konflikt` steckt. Genau deshalb sind Zeilenzahl
 * und Schluesselmenge unten ZWEI getrennte Zusicherungen.
 */
const RUFNAME = "41/12";
const ENTLEIHER = "Anna Beispiel";

/**
 * ⛔ DER ROHE QUELLTEXT DER IMPLEMENTIERUNG — fuer die zwei Zusicherungen, die ein
 * Verhaltenstest strukturell nicht halten kann: „dieser Satz steht hier NICHT ein zweites
 * Mal". Schriebe jemand einen geholten Wert als zeichengleiches Literal aus, bliebe jeder
 * Vergleich gruen und die Kopplung waere trotzdem weg — genau der Umbau, den Fund F25
 * (`.superpowers/sdd/planteil3/VORABSCAN-A.md:402-411`) beschreibt. Hausform des Moduls:
 * `src/app/m/radio/riegel.test.ts:102` liest ueber `process.cwd()`.
 *
 * ⚠️ KOMMENTARE SIND MITGELESEN, und das ist Absicht: eine Erwaehnung des Satzes im Kopf
 * der Datei macht diese Faelle rot. Sie nennt deshalb nur die Fundstelle
 * (`_lib/gateTexte.ts:71`), nie den Wortlaut.
 */
const QUELLE = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/meldungen.ts"), "utf8");

const ERWARTET_AUSLEIHE: [AusleihMeldung, string][] = [
  [{ grund: "keine-auswahl" }, "Kein Gerät ausgewählt. Wähle mindestens ein Gerät aus."],
  [{ grund: "kein-name" }, "Kein Name eingetragen. Trag ein, wer die Geräte mitnimmt."],
  [
    { grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "ON_LOAN", entleiher: ENTLEIHER } },
    "41/12 ist inzwischen an Anna Beispiel ausgeliehen. Es wurde nichts gebucht.",
  ],
  [
    { grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "DEFECT" } },
    "41/12 steht auf Defekt und kann nicht ausgeliehen werden.",
  ],
  [
    { grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "MAINTENANCE" } },
    "41/12 steht auf Wartung und kann nicht ausgeliehen werden.",
  ],
  [
    { grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "NICHT_FREIGEGEBEN" } },
    "41/12 ist zurzeit nicht zum Ausleihen freigegeben.",
  ],
  [
    { grund: "verschwunden", rufname: RUFNAME },
    "41/12 steht nicht mehr in der Liste. Die Liste wurde aktualisiert.",
  ],
  [
    { grund: "unbekannt" },
    "Gerade ist zu viel gleichzeitig los. Es wurde nichts gebucht. Bitte in einem Moment erneut versuchen.",
  ],
  [
    { grund: "sitzung" },
    "Dein Zugang ist abgelaufen. Gib den Code erneut ein — deine Eingaben bleiben stehen.",
  ],
  [{ grund: "gesperrt" }, "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung."],
];

const ERWARTET_RUECKGABE: [RueckgabeMeldung, string][] = [
  [
    { grund: "schon-zurueck", rufname: RUFNAME },
    "41/12 wurde zwischenzeitlich von jemand anderem zurückgegeben.",
  ],
  [{ grund: "unbekannt-geworden" }, "Diese Ausleihe gibt es nicht mehr. Die Liste wurde aktualisiert."],
  [{ grund: "notiz-zu-lang" }, "Die Zustandsnotiz ist zu lang. Höchstens 500 Zeichen."],
  [
    { grund: "unbekannt" },
    "Gerade ist zu viel gleichzeitig los. Die Rückgabe ist nicht gespeichert. Bitte in einem Moment erneut versuchen.",
  ],
  [
    { grund: "sitzung" },
    "Dein Zugang ist abgelaufen. Gib den Code erneut ein — deine Eingaben bleiben stehen.",
  ],
  [{ grund: "gesperrt" }, "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung."],
];

describe("radio-Konfliktsprache: ein Satz je Ausgang", () => {
  it("der Quelltextscan liest eine nicht-leere Datei", () => {
    /*
     * ⛔ OHNE DIESEN FALL WAEREN ALLE NEGATIVEN SCANS DIESER DATEI LEER-GRUEN. Kaeme
     * `QUELLE` leer zurueck — ein anderes `process.cwd()`, eine umbenannte Datei —, bestuende
     * jedes `not.toContain`/`not.toMatch` darauf, ohne etwas zu bewachen; die zaehlenden
     * Zusicherungen fielen dagegen von selbst. Hausform des Moduls: `riegel.test.ts:934`
     * („leere Dateiliste — der Scan waere leer-gruen").
     */
    expect(QUELLE.length, "meldungen.ts ist leer gelesen worden").toBeGreaterThan(2000);
    expect(QUELLE, "gelesen wurde nicht meldungen.ts").toContain("export function ausleihText");
  });

  it("jeder grund hat genau einen Satz, und keiner nennt einen Schluessel", () => {
    /*
     * Spec:3537-3545 und Spec:5229-5232 („die Union ist die Rueckgabeform beider
     * Schreib-Actions, und JEDER `grund` braucht dort einen Text").
     *
     * ⛔ DIE ZWEI ZAHLEN STEHEN AUSSERHALB JEDER SCHLEIFE, und sie sind durch Entscheidung
     * E13 gesetzt: SIEBEN Ausleihgruende, SECHS Rueckgabegruende
     * (`.superpowers/sdd/planteil3/briefs/KOPF.md:775-778`). Eine Schleife ueber eine
     * geschrumpfte Menge ist leer-gruen — wer einen Grund loescht, verliert seinen Prueffall
     * LAUTLOS, und die Fallzahl liest niemand.
     */
    expect(AUSLEIH_GRUENDE.length, "geschrumpfte Ausleih-Union — die Schleife waere leer-gruen").toBe(7);
    expect(RUECKGABE_GRUENDE.length, "geschrumpfte Rueckgabe-Union — dieselbe Falle").toBe(6);

    /*
     * ⛔ UND JEDER SATZ WOERTLICH. Der Vergleich gegen die Tabelle ist die Durchsetzung von
     * „keiner nennt einen Schluessel" (Spec:3549-3550: `grund` ist interner Schluessel, nie
     * Bildschirmtext) — ein Text „Fehler: unbekannt" ist eine Abweichung wie jede andere.
     */
    for (const [m, erwartet] of ERWARTET_AUSLEIHE) {
      expect(ausleihText(m), `Ausleih-Satz zu ${m.grund}`).toBe(erwartet);
    }
    for (const [m, erwartet] of ERWARTET_RUECKGABE) {
      expect(rueckgabeText(m), `Rueckgabe-Satz zu ${m.grund}`).toBe(erwartet);
    }
  });

  it("die Erwartungstabellen sind vollzaehlig", () => {
    /*
     * ⛔ ZWEI GETRENNTE ZUSICHERUNGEN JE TABELLE, UND DAS IST ABSICHT — dieselbe Lehre wie
     * in `_lib/gateTexte.test.ts:139-153`:
     *
     *   — die ZEILENZAHL faengt den Verlust einer Zeile, deren `grund` noch ein zweites Mal
     *     vorkommt. Nur sie sieht, wenn die `MAINTENANCE`-Zeile verschwindet;
     *   — die SCHLUESSELMENGE faengt das Auseinanderlaufen von Tabelle und Union.
     *
     * Keine faengt, was die andere faengt. Eine Sonde, die beide traefe, bewiese ueber keine
     * von beiden etwas.
     */
    expect(ERWARTET_AUSLEIHE.length, "Zeile aus der Ausleih-Tabelle verloren").toBe(10);
    expect(ERWARTET_RUECKGABE.length, "Zeile aus der Rueckgabe-Tabelle verloren").toBe(6);

    expect(
      [...new Set(ERWARTET_AUSLEIHE.map(([m]) => m.grund))].sort(),
      "Ausleih-Tabelle und AUSLEIH_GRUENDE laufen auseinander",
    ).toEqual([...AUSLEIH_GRUENDE].sort());
    expect(
      [...new Set(ERWARTET_RUECKGABE.map(([m]) => m.grund))].sort(),
      "Rueckgabe-Tabelle und RUECKGABE_GRUENDE laufen auseinander",
    ).toEqual([...RUECKGABE_GRUENDE].sort());
  });

  it("der Satz zum vergebenen Geraet enthaelt den Rufnamen", () => {
    /*
     * Regel 1 aus Spec:3547-3548, woertlich: „der Rufname steht im Satz (bei vier gewaehlten
     * Geraeten ist ein Satz ohne Rufnamen unbrauchbar)".
     *
     * ⛔ MIT EINEM ANDEREN RUFNAMEN ALS DEM DER TABELLE. Stuende hier `RUFNAME`, prueefte
     * dieser Fall dieselbe Zeichenkette wie die Tabelle und waere gegen ein fest
     * eingebautes „41/12" blind — der Rufname muss DURCHGEREICHT sein, nicht bloss
     * vorhanden.
     */
    const satz = ausleihText({
      grund: "nicht-verfuegbar",
      rufname: "77/03",
      konflikt: { zustand: "ON_LOAN", entleiher: "Bea Muster" },
    });
    expect(satz, "der Rufname fehlt im Satz").toContain("77/03");
    expect(satz, "der Entleiher fehlt im Satz").toContain("Bea Muster");

    /* Dieselbe Regel an den drei uebrigen geraetebezogenen Saetzen. */
    expect(ausleihText({ grund: "verschwunden", rufname: "77/03" })).toContain("77/03");
    expect(
      ausleihText({ grund: "nicht-verfuegbar", rufname: "77/03", konflikt: { zustand: "DEFECT" } }),
    ).toContain("77/03");
    expect(rueckgabeText({ grund: "schon-zurueck", rufname: "77/03" })).toContain("77/03");
  });

  it("die vier Zustaende des Konflikts tragen vier verschiedene Saetze", () => {
    /*
     * ⛔ DER BEFUND, GEGEN DEN DIESER FALL STEHT, IST DER BESTAND SELBST: der Alt-Kiosk
     * faltet jeden 409 auf EINEN Satz („Dieses Geraet ist bereits ausgeliehen oder nicht
     * verfuegbar.", `lib/error-messages.ts:24-26`) — ohne Rufname, ohne Unterscheidung
     * (Spec:3527-3533). Drei Alt-Codes fallen auf `grund: "nicht-verfuegbar"`
     * (Spec:5205-5207); was sie auseinanderhaelt, ist der `Konflikt`
     * (`VORABSCAN-A.md:192-201`, Fund F4).
     *
     * ⚠️ VIER, NICHT DREI. `Konflikt` (`_lib/meldungen.ts`) hat vier Zweige:
     * `NICHT_FREIGEGEBEN` ist die benannte Neuerung dieser Aufgabe (`loanable = false`,
     * Spec:5205, ist ein eigenes Feld und kein Wert von `devices.status`). Der Fallname
     * sagte bis zur Fix-Runde 1 „drei" und die Zusicherung `toBe(4)` — wer den Namen las
     * und die Zahl nicht, hielt den vierten Zweig fuer unbewacht. ⛔ DIE ZAHL WURDE NICHT
     * GESENKT, DER NAME WURDE GEHOBEN.
     */
    const saetze = [
      ausleihText({ grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "ON_LOAN", entleiher: ENTLEIHER } }),
      ausleihText({ grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "DEFECT" } }),
      ausleihText({ grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "MAINTENANCE" } }),
      ausleihText({ grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "NICHT_FREIGEGEBEN" } }),
    ];
    expect(new Set(saetze).size, "zwei Konfliktzustaende sagen dasselbe").toBe(4);
  });

  it("der Satz zum defekten Geraet nennt dasselbe Wort wie der Statuschip", () => {
    /*
     * ⚠️ DAS IST EIN DRIFTWAECHTER, KEIN INHALTSTEST. Das Wort steht in `_lib/status.ts:94-99`
     * (`ETIKETT`, woertlich aus dem Alt-Kiosk) und wird von `_lib/meldungen.ts` GEHOLT, nicht
     * abgeschrieben. Der Fall wird rot an dem Tag, an dem eine der beiden Seiten das Wort
     * aendert — und genau dann saehe der Mensch am Chip „Defekt" und im Satz darueber etwas
     * anderes.
     */
    expect(
      ausleihText({ grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "DEFECT" } }),
    ).toContain(statusEtikett("DEFECT"));
    expect(
      ausleihText({ grund: "nicht-verfuegbar", rufname: RUFNAME, konflikt: { zustand: "MAINTENANCE" } }),
    ).toContain(statusEtikett("MAINTENANCE"));

    /*
     * ⛔ UND DIE HAELFTE, DIE DEN DRIFTWAECHTER ERST TRAGEND MACHT. Die zwei Zusicherungen
     * darueber bleiben gruen, wenn jemand `statusEtikett(...)` durch die zeichengleichen
     * Woerter ersetzt — beide Seiten sagen dann dasselbe, und die Kopplung ist trotzdem weg.
     * Gemessen als Sonde P7 (erste Fassung dieses Falles): **0 rot**.
     *
     * ⛔ DER SCAN LIEST DEN ROHEN DATEITEXT, KOMMENTARE EINGESCHLOSSEN. Damit gilt fuer
     * `_lib/meldungen.ts` dieselbe Prosa-Sperre wie fuer `_lib/anzeige.ts`
     * (`.superpowers/sdd/planteil3/progress.md:291-295`): die zwei Woerter duerfen dort
     * auch im Kopf nicht ausgeschrieben stehen. Das ist Absicht und kein Kollateralschaden —
     * ein Scan ueber kommentarfreien Text ginge an der naechstliegenden Zweitfassung vorbei,
     * naemlich einem Wort, das jemand aus dem Kommentar in den Satz kopiert.
     */
    for (const wort of [statusEtikett("DEFECT"), statusEtikett("MAINTENANCE")]) {
      expect(QUELLE, `ein Statusetikett steht ausgeschrieben in meldungen.ts: ${wort}`)
        .not.toContain(wort);
    }
  });

  it("der Satz zu grund sitzung sagt, dass die Eingaben stehen bleiben", () => {
    /*
     * ⛔ DER HALBSATZ IST DER GRUND, WARUM DIE INLINE-ERNEUERUNG UEBERHAUPT HILFT. Er steht
     * neben dem Erneuerungsfeld (Entscheidung E12, `KOPF.md:675-728`; Spec:2563-2570), und
     * ohne ihn tippt der Mensch vorsichtshalber alles neu — dann waere die Erneuerung eine
     * Vorrichtung ohne Nutzen.
     */
    expect(ausleihText({ grund: "sitzung" })).toContain("deine Eingaben bleiben stehen");
    expect(rueckgabeText({ grund: "sitzung" })).toContain("deine Eingaben bleiben stehen");

    /*
     * ⛔ UND DIE GEGENSEITE: der Satz zu `gesperrt` bietet KEINE Erneuerung an (Zusage §3.10
     * Nr. 8, Spec:3235-3236) — derselbe Code scheitert genauso. Ein „erneut" in diesem Satz
     * waere die Aufforderung zu einem Versuch, der nicht gelingen kann.
     */
    expect(ausleihText({ grund: "gesperrt" }), "der gesperrt-Satz laedt zu einem Versuch ein")
      .not.toContain("erneut");
    expect(rueckgabeText({ grund: "gesperrt" })).not.toContain("erneut");
  });

  it("die zwei Sperr-Saetze stehen in beiden Unions zeichengleich", () => {
    /*
     * ⛔ `sitzung` und `gesperrt` gehoeren BEIDEN Unions an (Entscheidung E13,
     * `KOPF.md:732-778`). Zwei unabhaengige Zweige waeren zwei Orte fuer denselben Satz —
     * dieselbe Mechanik, die E13 an einem anderen Gegenstand verurteilt (`KOPF.md:768-770`:
     * „die beiden liefen beim ersten Umbau auseinander — ohne dass ein Test es saehe").
     */
    expect(ausleihText({ grund: "sitzung" })).toBe(rueckgabeText({ grund: "sitzung" }));
    expect(ausleihText({ grund: "gesperrt" })).toBe(rueckgabeText({ grund: "gesperrt" }));
  });

  it("der gesperrt-Satz kommt aus den Gate-Texten und kann nicht auseinanderlaufen", () => {
    /*
     * ⛔ FUND F25 (`.superpowers/sdd/planteil3/VORABSCAN-A.md:402-411`): derselbe Satz stand
     * im Plan zweimal — in `_lib/gateTexte.ts` und noch einmal in `_lib/meldungen.ts` —
     * ohne Kopplung und ohne Test. Gewaehlt ist Form (a): `_lib/meldungen.ts` HOLT ihn.
     * Dieser Fall ist der Waechter darueber, dass die Kopplung bleibt; schriebe jemand den
     * Satz hier wieder aus, faellt er beim ersten Umbau an `gateTexte.ts` um.
     */
    expect(ausleihText({ grund: "gesperrt" })).toBe(gateMeldung("gesperrt", null));

    /*
     * ⛔ UND DIE HAELFTE, DIE DIE KOPPLUNG WIRKLICH BEWACHT. Der Vergleich darueber bleibt
     * gruen, solange die beiden Saetze zeichengleich sind — auch dann, wenn hier ein
     * abgeschriebenes Literal steht statt des Aufrufs. Gemessen als Sonde P8a: mit dem
     * zeichengleichen Literal ist er **0 rot**. Erst dieser Scan macht den Fall tragend.
     *
     * ⚠️ DER ANKER TRAEGT KEINEN UMLAUT und ist bewusst kuerzer als der Satz: er soll auch
     * eine leicht abgewandelte Zweitfassung finden.
     */
    expect(QUELLE, "der gesperrt-Satz steht ein zweites Mal in meldungen.ts").not.toContain(
      "Zugangs-Code wurde gesperrt",
    );
  });

  it("der Leerzustandssatz nennt keinen Weg in die Verwaltung", () => {
    /*
     * §4.9.6, Spec:3919-3922: der Bestand hat hier einen Knopf „Geraete verwalten" auf
     * `/admin` (`DeviceList.tsx:89-98`) — auf einer ANONYMEN Flaeche. Er wird zu einem Satz
     * ohne Verweis, weil ein sichtbarer Weg dorthin, wo die aufrufende Person nicht hindarf,
     * die Gegenprobe `docs/design/README.md:420` verletzt.
     *
     * ⛔ DER ANKER LIEGT AUF DEM FEHLEN EINES PFADES, NICHT AUF DEM WORT „Verwaltung". Das
     * Wort STEHT im Satz — es ist die Auskunft, WER es erledigt, und kein Verweis. Ein Anker
     * darauf waere rot-by-construction, also genau die Fehlerform aus Fund F3.
     */
    expect(KEINE_GERAETE_ERFASST).toBe("Es sind noch keine Geräte erfasst. Das erledigt die Verwaltung.");
    expect(KEINE_GERAETE_ERFASST, "ein Pfad im Leerzustandssatz").not.toMatch(/\//);
    expect(KEINE_GERAETE_ERFASST.toLowerCase(), "ein Verweis auf die Verwaltungsflaeche").not.toContain("admin");
  });

  it("die zwei Stoerungssaetze aus Kapitel 4.7 stehen woertlich", () => {
    /*
     * Spec:3808 (offline) und Spec:3809 (Schreibsperre auf SQLite).
     *
     * ⚠️ DER OFFLINE-SATZ IST KEIN `grund` und steht deshalb als eigener Wert: in diesem
     * Fall erreicht die Server Action den Server gar nicht (Spec:3808), es gibt also keine
     * Union, die ihn tragen koennte.
     */
    expect(KEINE_VERBINDUNG).toBe(
      "Keine Verbindung. Die Ausleihe ist nicht gespeichert. Bitte erneut versuchen.",
    );
    expect(SCHREIBSPERRE).toBe("Gerade ist zu viel gleichzeitig los. Bitte in einem Moment erneut versuchen.");
  });

  it("der Satz zum unbekannten Fehler traegt beide Haelften des Schreibsperren-Satzes", () => {
    /*
     * Spec:3545, Zeile „Verbindung/Server": „woertlich uebernommen, ERGAENZT UM ‚Es wurde
     * nichts gebucht.'" Die Ergaenzung steht zwischen Befund und Aufforderung — deshalb
     * pruefen wir die zwei Haelften einzeln und nicht den Satz als Ganzes.
     */
    const [befund, aufforderung] = [
      "Gerade ist zu viel gleichzeitig los.",
      "Bitte in einem Moment erneut versuchen.",
    ];
    const ausleihe = ausleihText({ grund: "unbekannt" });
    expect(ausleihe).toContain(befund);
    expect(ausleihe).toContain(aufforderung);
    expect(ausleihe, "die Zusage, dass nichts gebucht wurde, fehlt").toContain("Es wurde nichts gebucht.");

    const rueckgabe = rueckgabeText({ grund: "unbekannt" });
    expect(rueckgabe).toContain(befund);
    expect(rueckgabe).toContain(aufforderung);
    expect(rueckgabe, "die Zusage zum Vorgang dieses Flusses fehlt").toContain(
      "Die Rückgabe ist nicht gespeichert.",
    );

    /*
     * ⛔ UND DIE HAELFTE, DIE DIE KOPPLUNG BEWACHT. Die sechs Zusicherungen darueber bleiben
     * gruen, wenn jemand die zwei zusammengesetzten Saetze in `_lib/meldungen.ts` durch die
     * zeichengleichen Literale ersetzt — die Kopplung an `SCHREIBSPERRE` ist dann weg, ohne
     * dass ein Fall es sieht. Gemessen als Sonde M-E: 0 rot.
     *
     * ⛔ GEZAEHLT WIRD IM ROHEN DATEITEXT, KOMMENTARE EINGESCHLOSSEN — dieselbe Prosa-Sperre
     * wie bei den zwei Statusetiketten. Der Kopf von `SPERRE_BEFUND` nennt deshalb nur
     * Spec:3809 und nicht den Wortlaut; bis zur Fix-Runde 1 zitierte er ihn und haette den
     * Zaehler von sich aus rot gemacht.
     */
    for (const haelfte of [befund, aufforderung]) {
      expect(
        QUELLE.split(haelfte).length - 1,
        `eine Haelfte des Schreibsperren-Satzes steht mehr als einmal in meldungen.ts: ${haelfte}`,
      ).toBe(1);
    }
  });

  it("die Zeichengrenze der Zustandsnotiz ist die abgelesene Zahl des Alt-Kiosk", () => {
    /*
     * ⬜ A-L11. Abgelesen, nicht geraten:
     * `/Users/rubeen/dev/personal/drk/radio-inventar/packages/shared/src/schemas/loan.schema.ts:30`
     * (`RETURN_NOTE_MAX: 500`). Die „500" im Zaehler „0 / 500" (Spec:3560) ist ein
     * Beispieltext und war keine Vorgabe.
     *
     * ⛔ DER SATZ ZU `notiz-zu-lang` NENNT DIE KONSTANTE UND NICHT EINE ZWEITE ZAHL. Waere
     * die „500" dort ausgeschrieben, gaebe es zwei Wahrheiten ueber dieselbe Grenze, und der
     * Tag, an dem der Betreiber sie aendert, machte den Satz zur Luege.
     */
    expect(ZUSTANDSNOTIZ_MAX, "die Grenze weicht vom Alt-Kiosk ab").toBe(500);
    expect(rueckgabeText({ grund: "notiz-zu-lang" })).toContain(String(ZUSTANDSNOTIZ_MAX));

    /*
     * ⛔ UND DIE HAELFTE, DIE DEN FALL ERST TRAGEND MACHT. Die zwei Zusicherungen darueber
     * bleiben gruen, wenn jemand die Interpolation im Satz durch die zeichengleiche
     * Ziffernfolge ersetzt: die Erwartungstabelle vergleicht den fertigen Text, `toBe(500)`
     * prueft die unveraenderte Konstante, und `toContain(String(ZUSTANDSNOTIZ_MAX))` ist
     * tautologisch, solange beide Zahlen uebereinstimmen. Gemessen als Sonde M-A: 0 rot.
     * Derselbe Mechanismus und dieselbe Abhilfe wie bei den Sonden P7 und P8.
     *
     * ⛔ VERBOTEN IST JEDE AUSGESCHRIEBENE ZAHL VOR DEM WORT, nicht bloss die heutige —
     * sonst ginge der Scan an dem Tag vorbei, an dem jemand die Konstante aendert und die
     * alte Zahl im Satz stehen laesst. ⚠️ Der Anker traegt keinen Umlaut (Hausregel).
     */
    expect(QUELLE, "die Grenze steht ein zweites Mal als ausgeschriebene Zahl im Satz")
      .not.toMatch(/\d+ Zeichen/);
  });
});

describe("AusleihErgebnis und RueckgabeErgebnis — die Form, nicht der Inhalt", () => {
  /*
   * ⛔ DER EINZIGE ⛔ DES AUFTRAGS HATTE BIS ZUR FIX-RUNDE 1 KEINEN EINZIGEN WAECHTER:
   * „`betroffen[].status` darf dabei nicht verloren gehen"
   * (`.superpowers/sdd/planteil3/briefs/A14.md:15`, Spec:5223-5228, Entscheidung E11).
   * Kein Fall baute je einen `AusleihErgebnis`, `RueckgabeErgebnis` oder `BetroffenesGeraet`
   * — die drei Typen waren exportiert und von niemandem gelesen, und A15/A17 gibt es noch
   * nicht. Gemessen als Sonde M-B (`status: string;` aus `BetroffenesGeraet` geloescht):
   * `pnpm typecheck` EXIT=0 UND `pnpm vitest run src/app/m/radio` 323 passed — 0 rot in
   * BEIDEN Toren. Der vom Auftrag namentlich verbotene Verlust war typkorrekt, lint-sauber
   * und testgruen. Vorbild dieses Blocks:
   * `src/app/m/lagerbuch/_lib/actionTypen.test.ts:126-141`.
   *
   * ⚠️ ZWEI TORE, ZWEI WAECHTER, UND BEIDE WERDEN GEBRAUCHT: die typisierten Fixturen unten
   * machen den Verlust im `typecheck` rot (eine Annotation lehnt das Ueberschussfeld ab,
   * TS2353), der Quelltext-Scan macht ihn im Vitest-Lauf rot. ⛔ VITEST STREIFT TYPEN AB —
   * ein Fixture allein haette in dem Tor, das hier laeuft, 0 rot ergeben. Derselbe Befund
   * steht in `BERICHT-A14.md` §4a fuer die Typseite von E13.
   */
  it("ein betroffenes Geraet traegt Rufname UND Status", () => {
    const zustand: KonfliktZustand = "ON_LOAN";
    const betroffenes: BetroffenesGeraet = { rufname: RUFNAME, status: zustand };

    /*
     * ⚠️ `Object.keys` LIEST DAS LITERAL, NICHT DEN TYP — es schreibt die Form aus und ist
     * kein Waechter ueber sie. Rot wird bei einem geloeschten Feld die Annotation darueber
     * und der Scan unten; das hier steht als Lesehilfe fuer A15 und wird im Bericht NICHT
     * als Deckung gezaehlt.
     */
    expect(Object.keys(betroffenes).sort()).toEqual(["rufname", "status"]);

    const ergebnis: AusleihErgebnis = {
      ok: false,
      grund: "nicht-verfuegbar",
      text: ausleihText({
        grund: "nicht-verfuegbar",
        rufname: RUFNAME,
        konflikt: { zustand: "ON_LOAN", entleiher: ENTLEIHER },
      }),
      betroffen: [betroffenes],
    };
    expect(
      !ergebnis.ok && ergebnis.betroffen[0].status,
      "der Grund, WARUM das Geraet nicht verfuegbar ist, ist verloren",
    ).toBe("ON_LOAN");

    /*
     * ⛔ DER SCAN, DEN DIESES TOR SIEHT. `[^}]*` statt einer festen Feldreihenfolge, und das
     * ist die tragende Wahl: er wird rot, wenn `status` verschwindet, und bleibt gruen, wenn
     * A15 dem Typ ein drittes Feld anfuegt. Ein Anker auf der heutigen Reihenfolge waere ein
     * Waechter, der beim naechsten legitimen Zuwachs umfaellt.
     */
    expect(QUELLE, "BetroffenesGeraet hat sein status-Feld verloren").toMatch(
      /export interface BetroffenesGeraet \{[^}]*status: string;[^}]*\}/,
    );
  });

  it("betroffen ist bei sitzung und gesperrt die leere Liste", () => {
    /*
     * `.superpowers/sdd/planteil3/briefs/KOPF.md:774-775`: es gibt kein betroffenes Geraet,
     * der Vorgang ist am Riegel gescheitert und hat kein Geraet erreicht. ⛔ AUFLAGE AN A15
     * UND A17 — die Fixture steht hier, damit die zwei sie nicht neu erfinden muessen.
     */
    for (const grund of ["sitzung", "gesperrt"] as const) {
      const ergebnis: AusleihErgebnis = {
        ok: false,
        grund,
        text: ausleihText({ grund }),
        betroffen: [],
      };
      expect(!ergebnis.ok && ergebnis.betroffen, `betroffen ist bei ${grund} nicht leer`).toEqual([]);
    }
  });

  it("der Erfolgsfall traegt weder Grund noch Text", () => {
    /*
     * Vorbild `src/app/m/lagerbuch/_lib/actionTypen.test.ts:127-131`. Ein `ok: true` mit
     * Text zwaenge jede Flaeche, zwei Quellen fuer dieselbe Auskunft zu lesen — und die
     * Rueckgabe traegt im Erfolgsfall den Rufnamen, nicht die Anzahl (Spec:3566-3568).
     */
    const ausleihe: AusleihErgebnis = { ok: true, anzahl: 2, entleiher: ENTLEIHER };
    expect("text" in ausleihe, "der Erfolgsfall der Ausleihe traegt einen Text").toBe(false);
    expect("grund" in ausleihe, "der Erfolgsfall der Ausleihe traegt einen Grund").toBe(false);
    expect(ausleihe.ok && ausleihe.anzahl).toBe(2);

    const rueckgabe: RueckgabeErgebnis = { ok: true, rufname: RUFNAME };
    expect("text" in rueckgabe, "der Erfolgsfall der Rueckgabe traegt einen Text").toBe(false);
    expect(rueckgabe.ok && rueckgabe.rufname).toBe(RUFNAME);
  });

  it("die zwei Sperr-Gruende kommen aus SperrGrund statt abgeschrieben zu sein", () => {
    /*
     * Entscheidung E13 (`.superpowers/sdd/planteil3/briefs/KOPF.md:732-778`). Vorbild und
     * dieselbe Fehlerklasse: `src/app/m/lagerbuch/_lib/actionTypen.test.ts:29-39`. Zwei
     * ausgeschriebene Literal-Unions liefen beim ersten Umbau auseinander, und TypeScript
     * faende es erst beim dritten Sperrgrund.
     *
     * ⚠️ GEZAEHLT STATT GESUCHT: `toMatch` allein bliebe gruen, wenn nur EINE der zwei
     * Unions ausgeschrieben wuerde — die andere truege den Treffer weiter.
     */
    expect(QUELLE, "der Typimport auf SperrGrund fehlt").toMatch(
      /import type \{ SperrGrund \} from "\.\/ausleihZugang";/,
    );
    expect(
      QUELLE.split("| { grund: SperrGrund };").length - 1,
      "eine der zwei Unions schreibt die Sperr-Gruende aus statt sie aus SperrGrund zu holen",
    ).toBe(2);
  });
});

describe("Bauform", () => {
  it("traegt weder use client noch use server als Direktive", () => {
    /*
     * ⛔ DIE HALBE ZUSAGE DES DATEIKOPFES, DIE BIS ZUR FIX-RUNDE 1 NIRGENDS BEWACHT WAR.
     * `riegel.test.ts:921-940` scannt modulweit — aber NUR auf `"use client"`. Fuer
     * `"use server"` gab es im ganzen Modul keine Abwesenheits-Zusicherung; die einzige
     * Durchsetzung (`_actions/guards.test.ts:699-716`) VERLANGT die Direktive, als erste
     * Zeile jeder Datei unter `_actions/` — die Gegenrichtung, auf einem anderen Ordner.
     * Vorbild dieses Falles: `src/app/m/lagerbuch/_lib/actionTypen.test.ts:144-145`.
     *
     * ⚠️ WAS EIN `"use server"` HIER ANRICHTETE: jeder Export wuerde zu einer Server Action
     * — auch `ZUSTANDSNOTIZ_MAX` und die zwei Satzfunktionen, die die Flaechen A18-A20
     * SYNCHRON rufen. Eine `"use server"`-Datei darf ausschliesslich asynchrone Funktionen
     * exportieren (`src/app/m/radio/_ui/GateFormular.tsx:60`).
     *
     * ⬜ A-L16 BLEIBT OFFEN: modulweit ist die Abwesenheit weiterhin unbewacht. Der Kopf von
     * `_lib/meldungen.ts` nennt die Leerstelle und den Preis ihrer Schliessung.
     */
    expect(QUELLE, 'diese Datei traegt eine "use server"-Direktive').not.toMatch(
      /^\s*["']use server["']/m,
    );
    expect(QUELLE, 'diese Datei traegt eine "use client"-Direktive').not.toMatch(
      /^\s*["']use client["']/m,
    );
  });
});
