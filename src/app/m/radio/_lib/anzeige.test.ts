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
 * ⚠️ DIE ERWARTUNGSWERTE SIND GEMESSEN, NICHT GERECHNET. Alle sechs stammen aus einem
 * `node -e`-Lauf gegen Node v26.7.0 am 2026-08-23; sie stehen unten je am Fall.
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
    expect(quelle, "die Zone darf nicht aus der Umgebung kommen (Leitplan:122)")
      .not.toMatch(/process\s*\.\s*env\s*\.\s*TZ|process\s*\.\s*env\s*\[/);
  });
});
