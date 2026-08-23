// src/app/m/radio/_lib/anzeige.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uhrzeit, datumMitUhrzeit } from "./anzeige";

/**
 * DIE ZONENRECHNUNG DER AUSLEIHFLAECHE (Spec 1 §4.1 Punkt 1,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3338-3342`).
 *
 * ⛔ WAS DIESE DATEI ZU HALTEN HAT, IN EINEM SATZ: eine Zeichenkette, die an einer Uhr
 * haengt, entsteht auf dem SERVER und in der Zone `Europe/Berlin` — nicht in der Zone des
 * Endgeraets und nicht in der des Prozesses.
 *
 * ⛔ UND DESHALB TRAEGT DIESE DATEI EINEN FALL, DEN DIE SPEC NICHT NENNT
 * („die Zone haengt nicht an der Zone des Prozesses"). Der Grund ist gemessen: auf einer
 * Maschine, deren Systemzone ohnehin Europe/Berlin ist, ist ein
 * `Intl.DateTimeFormat("de-DE", { ... })` OHNE `timeZone`-Angabe von der richtigen Fassung
 * NICHT zu unterscheiden — alle Erwartungswerte unten stimmen dann trotzdem. Rot wuerde
 * das erst in der CI, deren Zone UTC ist. Der Fall unten dreht die Prozesszone waehrend
 * des Laufs und schliesst die Luecke.
 *
 * ⛔ NICHT UEBER `TZ`: die Voraussetzungstabelle des Leitplans
 * (`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:122`) fuehrt
 * `TZ=Europe/Berlin` ausdruecklich als NICHT gesetzt.
 *
 * ⚠️ DIE ERWARTUNGSWERTE SIND GEMESSEN, NICHT GERECHNET. Alle sieben stammen aus einem
 * `node -e`-Lauf gegen Node v26.7.0 am 2026-08-23; sie stehen unten je am Fall. (Sechs waren
 * es bis zur Fix-Runde 1 zu A12; der siebte ist der Tagesgrenzenwert mit einstelligem Tag.)
 */

/** Der Anker fuer den Quelltext-Fall am Ende dieser Datei. */
const ANZEIGE = join(process.cwd(), "src/app/m/radio/_lib/anzeige.ts");

describe("radio-anzeige: was an einer Uhr haengt, entsteht in Europe/Berlin", () => {
  it("formatiert 23:30 UTC als Berliner Datum des Folgetags", () => {
    /*
     * SOMMERZEIT: 23:30 UTC am 15.07. ist in Berlin bereits der 16.07., 01:30 (UTC+2).
     * Gemessen: `16.07.2026, 01:30`. Wer die Zone auf `UTC` festnagelt, bekommt
     * `15.07.2026, 23:30` — falscher TAG, und genau das ist der Schaden aus Spec:3341-3342
     * („Sonst entscheiden Server und Client an der Tagesgrenze verschieden").
     */
    expect(datumMitUhrzeit(new Date("2026-07-15T23:30:00Z"))).toBe("16.07.2026, 01:30");
  });

  it("rechnet auch im Winter richtig", () => {
    /*
     * WINTERZEIT: derselbe Abstand zur Tagesgrenze, aber UTC+1. Gemessen:
     * `16.01.2026, 00:30`. Ein FESTER Offset von +2 — der naheliegende Kurzschluss, wenn
     * man die Sommermessung oben als „Berlin ist UTC+2" liest — ergaebe hier
     * `16.01.2026, 01:30` und waere um eine Stunde falsch (gemessen gegen `Etc/GMT-2`).
     */
    expect(datumMitUhrzeit(new Date("2026-01-15T23:30:00Z"))).toBe("16.01.2026, 00:30");
  });

  it("gibt die Berliner Stunde als reine Uhrzeit", () => {
    /*
     * Der Wert, den Spec:3338 als Beispiel fuehrt („Seit 14:20 Uhr"): 12:20 UTC im Sommer.
     * ⛔ DAS WORT „Uhr" GEHOERT NICHT IN DIESE FUNKTION — der Alt-Kiosk haengt es am
     * Aufrufort an (`radio-inventar/apps/frontend/src/components/features/DeviceRow.tsx:23`,
     * woertlich `` ` · ${...} Uhr` ``), und A15 baut daraus die fertige Zeichenkette `seit`.
     */
    expect(uhrzeit(new Date("2026-07-15T12:20:00Z"))).toBe("14:20");
  });

  it("gibt die Berliner Stunde auch im Winter", () => {
    // Gemessen: 12:20 UTC am 15.01. ist in Berlin 13:20 (UTC+1), nicht 14:20.
    expect(uhrzeit(new Date("2026-01-15T12:20:00Z"))).toBe("13:20");
  });

  it("schreibt Stunde und Minute zweistellig", () => {
    /*
     * Ohne `2-digit` liefert de-DE bei einstelliger Stunde `7:05` statt `07:05`, und die
     * Zeilen der Geraeteliste stuenden unterschiedlich breit untereinander. Gemessen:
     * 06:05 UTC am 15.01. ist in Berlin `07:05`.
     */
    expect(uhrzeit(new Date("2026-01-15T06:05:00Z"))).toBe("07:05");
    expect(datumMitUhrzeit(new Date("2026-01-15T06:05:00Z"))).toBe("15.01.2026, 07:05");
  });

  it("schreibt auch den Tag zweistellig, ueber die Tagesgrenze hinweg", () => {
    /*
     * ⛔ DER FALL, DEN DIE FUENF DARUEBER NICHT HABEN — nachgetragen in Fix-Runde 1 zu A12
     * (`REVIEW-A12.md`, Fund F2). Alle vier Datumswerte der uebrigen Faelle tragen einen
     * ZWEISTELLIGEN Tag (15., 16.); dort faellt `day: "numeric"` mit `day: "2-digit"`
     * zusammen. GEMESSEN: mit `day: "numeric"` in `anzeige.ts` blieben vor diesem Fall alle
     * sieben Faelle gruen — die Option war unbewacht, und die Zusicherung „zeichengleich
     * `dd.MM.yyyy, HH:mm`" (`anzeige.ts`, Kopf von `datumMitUhrzeit`) ohne Durchsetzung.
     * Betroffen sind die Tage 1 bis 9, also rund ein Drittel des Kalenders — und es ist
     * dasselbe Argument, mit dem der Fall darueber die zweistellige Stunde begruendet
     * (Spaltenbuendigkeit der Geraeteliste).
     *
     * Der Wert traegt beides auf einmal, einstelliger Tag UND Tagesgrenze: 22:30 UTC am
     * 04.07. ist in Berlin bereits der 05.07., 00:30 (UTC+2). Gemessen an Node v26.7.0 am
     * 2026-08-23: `05.07.2026, 00:30`; mit `day: "numeric"` stuende dort `5.07.2026, 00:30`.
     */
    expect(datumMitUhrzeit(new Date("2026-07-04T22:30:00Z"))).toBe("05.07.2026, 00:30");
  });
});

describe("radio-anzeige: die Zone haengt nicht an der Zone des Prozesses", () => {
  const VORHER = process.env.TZ;

  afterEach(() => {
    /*
     * ⛔ ZURUECKLEGEN IST PFLICHT, NICHT HOEFLICHKEIT: eine ausgelaufene Zonenaenderung
     * sieht in einer fremden Testdatei wie ein NEUER Fehlschlag aus, und die Suche danach
     * beginnt garantiert an der falschen Stelle.
     */
    if (VORHER === undefined) delete process.env.TZ;
    else process.env.TZ = VORHER;
  });

  it("liefert Berliner Werte, waehrend der Prozess in New York steht", () => {
    /*
     * ⛔ DER FALL, DER DIE LUECKE DER FUENF FAELLE OBEN SCHLIESST. Node wertet eine
     * Zuweisung an `process.env.TZ` zur Laufzeit aus (gemessen an Node v26.7.0:
     * `Intl.DateTimeFormat().resolvedOptions().timeZone` liest danach `America/New_York`).
     * OHNE `timeZone: "Europe/Berlin"` in der Formatiererzeile stuende hier
     * `15.07.2026, 19:30` statt `16.07.2026, 01:30`.
     *
     * ⚠️ ER TRAEGT NUR, WENN DER FORMATIERER JE AUFRUF ENTSTEHT. Ein auf Modulebene
     * gebauter `Intl.DateTimeFormat` haette seine Zone aufgeloest, BEVOR diese Zeile
     * laeuft — der Fall waere gruen, ohne etwas zu pruefen. Der Kopf von `anzeige.ts`
     * schreibt diese Bindung aus.
     */
    process.env.TZ = "America/New_York";
    expect(datumMitUhrzeit(new Date("2026-07-15T23:30:00Z"))).toBe("16.07.2026, 01:30");
    expect(uhrzeit(new Date("2026-07-15T12:20:00Z"))).toBe("14:20");
  });
});

describe("radio-anzeige: die Bauform", () => {
  it("nennt die Zone woertlich und liest NICHT die Umgebungsvariable TZ", () => {
    /*
     * Der Quelltext-Riegel zur Verhaltensprobe darueber. Er faengt den Fall, in dem jemand
     * die Zone aus `process.env.TZ` zieht: das waere auf jeder Maschine dieses Repos gruen
     * (dort ist die Variable ungesetzt und Node faellt auf die Systemzone zurueck) und im
     * Container falsch. Der Leitplan fuehrt `TZ=Europe/Berlin` ausdruecklich als NICHT
     * gesetzt (`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:122`).
     */
    const quelle = readFileSync(ANZEIGE, "utf8");
    // ⛔ AUF DIE DEKLARATION VERANKERT, nicht auf den blossen Namen: ein `Europe/Berlin`
    // in einem Kommentar erfuellte den Fall sonst, ohne dass eine Zeile es benutzt.
    expect(quelle, 'keine Deklaration const ZONE = "Europe/Berlin"')
      .toMatch(/const ZONE = "Europe\/Berlin"/);
    // ⛔ UND BEIDE FORMATIERER MUESSEN SIE FUEHREN. Ohne die Zahl bliebe der Fall gruen,
    // wenn genau eine der beiden Funktionen die Zone verloere — und das ist der
    // wahrscheinlichere Fehler als der Verlust beider.
    expect(
      quelle.match(/timeZone:\s*ZONE/g)?.length,
      "nicht beide Formatierer nageln die Zone fest",
    ).toBe(2);
    // ⛔ DER AUSSCHLUSS IST ABSICHTLICH BREIT: `process.env` UEBERHAUPT, nicht nur
    // `process.env.TZ` und `process.env[...]`. Die enge Fassung hatte eine Luecke, und sie
    // ist gemessen (Fix-Runde 1 zu A12, Fund F5): `const { TZ } = process.env;` laeuft an
    // beiden alten Alternativen vorbei — dieser Fall blieb GRUEN, rot wurde nur der
    // Verhaltensfall darueber. Diese Datei liest die Umgebung an keiner Stelle (gemessen:
    // `grep -n "process" src/app/m/radio/_lib/anzeige.ts` → kein Treffer), der breite
    // Ausschluss kostet also nichts.
    expect(
      quelle,
      "zwei Ursachen: die Zone kommt aus der Umgebung (Leitplan:122), ODER `process.env` " +
        "steht bloss in einem Kommentar von anzeige.ts — der Ausschluss liest den ganzen " +
        "Dateitext, Kommentare eingeschlossen",
    ).not.toMatch(/process\s*\.\s*env/);
  });

  it("baut beide Formatierer je Aufruf und keinen auf Modulebene", () => {
    /*
     * ⛔ DIE AUFLAGE AUS DEM KOPF VON `anzeige.ts` HATTE BIS ZUR FIX-RUNDE 1 KEINEN RIEGEL
     * (`REVIEW-A12.md`, Fund F1). Der Schaden ist nicht die Formatiererinstanz — es ist der
     * entwaffnete Waechter darueber. ZWEISTUFIG GEMESSEN, im echten Quellbaum, 2026-08-23:
     *   1. beide Formatierer auf Modulebene hochgezogen (Zone und `timeZone: ZONE` bleiben
     *      woertlich stehen) → 7 von 7 Faellen GRUEN. Kein Fall dieser Datei sah es.
     *   2. hochgezogen UND die Zeile `timeZone: ZONE` aus beiden entfernt → nur noch 1 rot,
     *      naemlich der Quelltext-Fall darueber. Der Fall aus dem Block „die Zone haengt
     *      nicht an der Zone des Prozesses" (heute `:114-130`; ⚠️ AUF DEN BLOCKNAMEN LESEN,
     *      nicht auf die Zahl — jeder neue Fall darueber verschiebt sie) blieb GRUEN, weil
     *      ein auf Modulebene gebauter Formatierer seine Zone aufloest, BEVOR jener Fall die
     *      Prozesszone dreht. Unverschoben ergibt dieselbe Sonde 2 rot.
     *
     * ⛔ DER ANKER IST `return new ...` UND NICHT DIE BLOSSE ZAHL: ein `return` kann auf
     * Modulebene nicht stehen, die erste Zusicherung bindet die zwei Formatierer also
     * konstruktiv in einen Funktionsrumpf. Die zweite schliesst die Zange — sie laesst
     * keinen dritten daneben zu, auch keinen hochgezogenen.
     */
    const quelle = readFileSync(ANZEIGE, "utf8");
    expect(
      quelle.match(/return new Intl\.DateTimeFormat/g)?.length,
      "nicht beide Formatierer entstehen im return, also je Aufruf",
    ).toBe(2);
    expect(
      quelle.match(/new Intl\.DateTimeFormat/g)?.length,
      "ein Vorkommen zu viel: entweder steht ein Formatierer auf Modulebene, oder der " +
        "Konstruktoraufruf ist im Kopf von anzeige.ts in Prosa ausgeschrieben",
    ).toBe(2);
    // ⛔ UND DIE RESTFORM, DIE DIE ZWEI ZAEHLUNGEN OFFENLIESSEN (`REVIEW-A12.md`, K1): ein
    // Formatierer, den eine BAUFUNKTION herstellt und den eine Modulebenen-Bindung einmal
    // beim Laden festhaelt. Beide Zaehlungen bleiben dabei bei 2 (gemessen am 2026-08-23 im
    // echten Quellbaum: 9 von 9 Faellen gruen), der Formatierer entstuende aber genau einmal
    // — der Schaden aus dem Kopf von `anzeige.ts`. Dieser Ausschluss trifft eine Bindung auf
    // MODULEBENE (Zeilenanfang, also uneingerueckt), deren Wert aus einem AUFRUF kommt;
    // `const ZONE = "Europe/Berlin"` ist ein Literal und faellt nicht darunter.
    expect(
      quelle,
      "ein Modulebenen-Memo ueber einen Funktionsaufruf haelt den Formatierer fest, statt " +
        "ihn je Aufruf zu bauen (K1 aus REVIEW-A12.md)",
    ).not.toMatch(/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*[\w.]+\s*\(/m);
  });
});
