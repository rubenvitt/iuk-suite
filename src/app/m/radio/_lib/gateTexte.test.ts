import { describe, it, expect } from "vitest";
import { GATE_GRUENDE, istGateGrund, gateMeldung, type GateGrund } from "./gateTexte";

/**
 * ⛔ DIE FESTE ERWARTUNGSTABELLE. Sie ist die Doppelfuehrung der vier von der Spec
 * gesetzten Saetze (Spec:2382-2385) — der Test zieht sie NICHT aus der Implementierung.
 *
 * ⛔ UND SIE ERSETZT DEN NAHELIEGENDEN SUBSTRING-SCAN („kein Text enthaelt einen der vier
 * `grund`-Schluessel"). Der waere gegen genau diese Saetze ROT-BY-CONSTRUCTION: drei von
 * vier tragen `code`, `gesperrt` bzw. `abgelaufen` als gewoehnliches deutsches
 * BILDSCHIRMWORT. Der billige Gruen-Fix waere, den Bildschirmtext zu verstuemmeln — die
 * stille Naeherung, gegen die dieser ganze Bauweg steht.
 *
 * ⛔ DIE TABELLE FAENGT BEIDES IN EINEM ZUG: eine Verstuemmelung des Satzes UND einen
 * eingeschmuggelten technischen Schluessel („Fehler: zuviele"), weil JEDE Abweichung vom
 * Wortlaut rot ist. ⛔ KEINEN ZWEITEN, SCHWAECHEREN SCAN DANEBEN STELLEN — er faengt
 * nichts, was die Tabelle nicht schon faengt, und laedt den naechsten Leser ein, den
 * kaputten Scan zu rekonstruieren.
 *
 * ⛔ DIE DRITTE SPALTE `sperrSekunden` IST DAS ERGEBNIS DER FIX-RUNDE 1, UND SIE IST
 * TRAGEND. Bis dahin war die Tabelle ein `Record<GateGrund, string>` und pinnte damit nur
 * EINEN der drei `zuviele`-Zweige (`gateTexte.ts:89-93`) — den mit `sek = 30`. Die beiden
 * anderen hingen allein an `toContain`, und das laesst den Rest des Satzes fallen. Gemessen
 * als Sonden P3 und P4 (Fix-Runde 1): der `sek === 1`-Satz auf „Bitte in einer Sekunde."
 * verstuemmelt → **0 rot**; der `sek === null`-Satz auf den technischen Schluessel
 * „Fehler: zuviele (einer Minute)" gesetzt → **0 rot**. Genau der Satz aus dem Absatz
 * darueber stand also auf dem Bildschirm, und kein Test merkte es. Mit den Zeilen
 * `["zuviele", 1, …]` und `["zuviele", null, …]` sind beide Sonden rot.
 */
const ERWARTET: [GateGrund, number | null, string][] = [
  ["code", 30, "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung."],
  ["gesperrt", 30, "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung."],
  [
    "abgelaufen",
    30,
    "Dein Zugang ist abgelaufen. Scanne den QR-Code erneut oder melde dich über die Suite an.",
  ],
  ["zuviele", 30, "Zu viele Fehlversuche. Bitte in 30 Sekunden erneut versuchen."],
  ["zuviele", 1, "Zu viele Fehlversuche. Bitte in einer Sekunde erneut versuchen."],
  ["zuviele", null, "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen."],
];

describe("radio-Gate-Texte: der geschlossene Satz", () => {
  it("vier Gruende, vier Texte, kein Rueckfalltext", () => {
    /*
     * Spec:2378-2398, Testauftrag Spec:3099.
     *
     * ⛔ DIE VOLLZAEHLIGKEIT STEHT ALS EIGENE ZUSICHERUNG AUSSERHALB DER SCHLEIFE. Eine
     * Schleife ueber `GATE_GRUENDE` bewacht nur, was in der Liste steht: wer einen Eintrag
     * loescht, verliert seinen Prueffall LAUTLOS — die Datei bleibt gruen, nur die Fallzahl
     * sinkt, und die liest niemand (dieselbe Form wie `_lib/routen.test.ts:79`, wo
     * `expect(AUSLEIHE.length, ...).toBe(6)` ausserhalb jeder Schleife steht; die
     * Begruendung dazu bei `:48-54`).
     */
    expect(GATE_GRUENDE.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(4);
    expect([...GATE_GRUENDE].sort()).toEqual(["abgelaufen", "code", "gesperrt", "zuviele"]);

    for (const g of GATE_GRUENDE) {
      expect(gateMeldung(g, 30), `kein Text fuer ${g}`).toBeTruthy();
    }

    /*
     * ⛔ DIE ZUSAGE AUS `gateTexte.ts:105` („`sperrSekunden` wirkt NUR auf `zuviele`; jeder
     * andere Text ignoriert die Zahl") HAT SEIT FIX-RUNDE 1 EINEN WAECHTER. Sie war
     * unbelegt: Sonde P7 liess `code` bei `sek === 5` einen anderen Satz liefern — **0 rot**.
     * Heute sind die drei anderen Eintraege nullstellige Pfeilfunktionen
     * (`gateTexte.ts:70-73`), die Zusage ist also strukturell wahr; bewacht wird die
     * SPAETERE Bearbeitung, die aus einer von ihnen eine zahlabhaengige macht.
     */
    for (const g of GATE_GRUENDE) {
      if (g === "zuviele") continue;
      expect(gateMeldung(g, 5), `${g} reagiert auf die Zahl`).toBe(gateMeldung(g, null));
    }
    /*
     * ⛔ KEIN RUECKFALLTEXT (Spec:2396-2398). Ein unbekannter Grund ergibt `null`. Ein
     * Rueckfalltext machte aus jedem Tippfehler in der URL eine Fehlermeldung, die nichts
     * bedeutet — und aus jedem kuenftigen, noch nicht implementierten Grund eine falsche.
     */
    expect(gateMeldung("erfunden", null)).toBeNull();
    expect(gateMeldung(null, null)).toBeNull();
    expect(gateMeldung(undefined, null)).toBeNull();
    expect(gateMeldung("", null)).toBeNull();
  });

  it("istGateGrund ist der Typwaechter vor der URL", () => {
    /*
     * ⛔ Spec:2394-2396: „`istGateGrund` als Typwaechter vor jeder Verwendung — der Wert
     * landet in einem `Location`-Kopf." Ohne ihn schriebe ein Route Handler einen fremden
     * Wert ungeprueft in eine Kopfzeile; das ist die Klasse Header-Injection, gegen die
     * ein geschlossener Satz die einfachste Abhilfe ist.
     */
    for (const g of GATE_GRUENDE) expect(istGateGrund(g)).toBe(true);
    expect(istGateGrund("erfunden")).toBe(false);
    expect(istGateGrund(null)).toBe(false);
    expect(istGateGrund(undefined)).toBe(false);
    expect(istGateGrund("code\r\nSet-Cookie: x=y")).toBe(false);
  });

  it("Singular bei genau einer Sekunde", () => {
    /*
     * „in 1 Sekunden" ist der Fehler, gegen den dieser Fall steht (Spec:2385, Testauftrag
     * Spec:3099). Er ist klein und sichtbar — und genau deshalb faellt er auf einem
     * Aufsteller im Funkraum jedem auf.
     *
     * ⚠️ BELEG KORRIGIERT (Fix-Runde 1): hier stand Spec:2390-2392. Dort steht der Satz
     * NICHT — 2390 ist leer, 2391-2392 tragen „Der Grund wandert ueber die URL, die Zahl
     * nicht." Der Wortlaut „in einer Sekunde" steht in Spec:2385, und genau so zitiert ihn
     * die Implementierung (`gateTexte.ts:84`).
     *
     * ⚠️ DIESE ZWEI ZUSICHERUNGEN TRAGEN SEIT FIX-RUNDE 1 NICHTS MEHR ALLEIN. Sie bleiben
     * als Lesehilfe stehen; die woertliche Zusage liegt in der Zeile `["zuviele", 1, …]`
     * der Erwartungstabelle. `toContain` liess die Verstuemmelung des RESTES durch —
     * gemessen als Sonde P3, **0 rot** (Kopfkommentar dieser Datei).
     */
    expect(gateMeldung("zuviele", 1)).toContain("in einer Sekunde");
    expect(gateMeldung("zuviele", 1)).not.toContain("1 Sekunden");
    expect(gateMeldung("zuviele", 30)).toContain("30 Sekunden");
  });

  it("ohne Zahl faellt zuviele auf die Minutenformulierung", () => {
    /*
     * Spec:2385: „ohne Zahl ‚Bitte in einer Minute erneut versuchen.'" Der Fall tritt
     * ein, wenn der Grund ueber die URL kommt (er wandert), die Zahl aber nicht (sie
     * wandert nicht) und die Gate-Seite die Schranke gerade offen findet — etwa, weil die
     * Sperre zwischen Weiterleitung und Abruf ablief. Dass der Grund wandert und die Zahl
     * nicht, steht in Spec:2391-2392.
     *
     * ⚠️ BELEG KORRIGIERT (Fix-Runde 1): hier stand Spec:2390-2392, und der Satz war dabei
     * in Anfuehrungszeichen gesetzt, als waere er ein Zitat DIESER Zeilen. Er steht in
     * Spec:2385.
     *
     * ⚠️ AUCH DIESE ZUSICHERUNG TRAEGT NICHTS MEHR ALLEIN — `toContain("einer Minute")`
     * liess „Fehler: zuviele (einer Minute)" durch (Sonde P4, **0 rot**). Die woertliche
     * Zusage liegt in der Zeile `["zuviele", null, …]` der Erwartungstabelle.
     */
    expect(gateMeldung("zuviele", null)).toContain("einer Minute");
  });

  it("die Erwartungstabelle ist vollzaehlig", () => {
    /*
     * ⛔ ZWEI GETRENNTE ZUSICHERUNGEN, UND DAS IST ABSICHT. Seit die Tabelle Zeilen statt
     * Schluessel fuehrt, faengt keine der beiden allein, was die alte
     * `Object.keys(ERWARTET).length`-Form fing:
     *
     *   — die ZEILENZAHL faengt den Verlust einer Zeile, deren `grund` noch ein zweites Mal
     *     vorkommt. Nur sie sieht, wenn `["zuviele", 1, …]` verschwindet (Sonde PV1);
     *   — die SCHLUESSELMENGE faengt das Auseinanderlaufen von ERWARTET und GATE_GRUENDE.
     *
     * ⚠️ Beide wurden EINZELN gesondet, nicht zusammen: eine Sonde, die beide Zeilen traefe,
     * waere rot und bewiese nichts ueber die einzelne Zusicherung. Das ist genau der Fehler,
     * der Fund 1 dieser Fix-Runde erzeugt hat (eine Sonde, zwei Bedingungen, eine davon trug
     * alles Rot) — siehe `returnTo.test.ts`, „DIE LEHRE, GESCHAERFT".
     */
    expect(ERWARTET.length, "Zeile aus der Erwartungstabelle verloren").toBe(6);
    expect(
      [...new Set(ERWARTET.map(([g]) => g))].sort(),
      "ERWARTET und GATE_GRUENDE laufen auseinander",
    ).toEqual([...GATE_GRUENDE].sort());
  });

  it.each(ERWARTET)(
    "der Text zu %s bei sperrSekunden=%s steht woertlich so, wie die Spec ihn setzt",
    (g: GateGrund, sek: number | null, erwartet: string) => {
      /*
       * ⚠️ DIE `grund`-WERTE SIND INTERNE SCHLUESSEL, NIE BILDSCHIRMTEXT (Spec:3532-3534,
       * dieselbe Regel wie in Kapitel 4 §4.3.5). Ein Text „Fehler: zuviele" waere
       * typkorrekt, lint-sauber und auf dem Bildschirm unbrauchbar — und genau das faengt
       * der Vergleich gegen ERWARTET, ohne die Vokabelkollision aus dem Kopfkommentar.
       */
      expect(gateMeldung(g, sek)).toBe(erwartet);
    },
  );
});
