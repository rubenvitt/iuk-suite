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
 */
const ERWARTET: Record<GateGrund, string> = {
  code: "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
  gesperrt: "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.",
  abgelaufen:
    "Dein Zugang ist abgelaufen. Scanne den QR-Code erneut oder melde dich über die Suite an.",
  zuviele: "Zu viele Fehlversuche. Bitte in 30 Sekunden erneut versuchen.",
};

describe("radio-Gate-Texte: der geschlossene Satz", () => {
  it("vier Gruende, vier Texte, kein Rueckfalltext", () => {
    /*
     * Spec:2378-2398, Testauftrag Spec:3099.
     *
     * ⛔ DIE VOLLZAEHLIGKEIT STEHT ALS EIGENE ZUSICHERUNG AUSSERHALB DER SCHLEIFE. Eine
     * Schleife ueber `GATE_GRUENDE` bewacht nur, was in der Liste steht: wer einen Eintrag
     * loescht, verliert seinen Prueffall LAUTLOS — die Datei bleibt gruen, nur die Fallzahl
     * sinkt, und die liest niemand (dieselbe Form wie `_lib/routen.test.ts:87`, wo
     * `expect(AUSLEIHE.length, ...).toBe(6)` ausserhalb jeder Schleife steht; die
     * Begruendung dazu bei `:56-62`).
     */
    expect(GATE_GRUENDE.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(4);
    expect([...GATE_GRUENDE].sort()).toEqual(["abgelaufen", "code", "gesperrt", "zuviele"]);

    for (const g of GATE_GRUENDE) {
      expect(gateMeldung(g, 30), `kein Text fuer ${g}`).toBeTruthy();
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
     * „in 1 Sekunden" ist der Fehler, gegen den dieser Fall steht (Spec:2390-2392,
     * Testauftrag Spec:3099). Er ist klein und sichtbar — und genau deshalb faellt er auf
     * einem Aufsteller im Funkraum jedem auf.
     */
    expect(gateMeldung("zuviele", 1)).toContain("in einer Sekunde");
    expect(gateMeldung("zuviele", 1)).not.toContain("1 Sekunden");
    expect(gateMeldung("zuviele", 30)).toContain("30 Sekunden");
  });

  it("ohne Zahl faellt zuviele auf die Minutenformulierung", () => {
    /*
     * Spec:2390-2392: „ohne Zahl ‚Bitte in einer Minute erneut versuchen.'" Der Fall
     * tritt ein, wenn der Grund ueber die URL kommt (er wandert), die Zahl aber nicht
     * (sie wandert nicht) und die Gate-Seite die Schranke gerade offen findet — etwa,
     * weil die Sperre zwischen Weiterleitung und Abruf ablief.
     */
    expect(gateMeldung("zuviele", null)).toContain("einer Minute");
  });

  it("die Erwartungstabelle ist vollzaehlig", () => {
    // Ausserhalb der Schleife, wie oben — sonst schrumpft die Menge lautlos mit.
    expect(Object.keys(ERWARTET).length, "ERWARTET und GATE_GRUENDE laufen auseinander")
      .toBe(GATE_GRUENDE.length);
  });

  it.each(GATE_GRUENDE)("der Text zu %s steht woertlich so, wie die Spec ihn setzt", (g: GateGrund) => {
    /*
     * ⚠️ DIE `grund`-WERTE SIND INTERNE SCHLUESSEL, NIE BILDSCHIRMTEXT (Spec:3532-3534,
     * dieselbe Regel wie in Kapitel 4 §4.3.5). Ein Text „Fehler: zuviele" waere
     * typkorrekt, lint-sauber und auf dem Bildschirm unbrauchbar — und genau das faengt
     * der Vergleich gegen ERWARTET, ohne die Vokabelkollision aus dem Kopfkommentar.
     */
    expect(gateMeldung(g, 30)).toBe(ERWARTET[g]);
  });
});
