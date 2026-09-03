import { describe, it, expect } from "vitest";
import { VALIDATION_RULE_IDS } from "@einsatzzeichen/core";
import { REGELTEXTE, TEXTLAUF_REGELN, regelAchse, regeltext } from "./regeltexte";

/*
 * DER TEST GEHT IN DIE GEGENRICHTUNG, und das ist der ganze Punkt.
 *
 * Die 835-Zeilen-Erklaerungstabelle aus `packages/website` ist MIT-lizenziert und
 * duerfte kopiert werden — es waeren 78 Texte, die niemand gegen ein Upgrade
 * prueft und die still veralten. Dieses Modul fuehrt stattdessen 15: die
 * Wertesperrung faengt fast alle Kombinationsregeln vorher ab, uebrig bleiben die,
 * die sie strukturell nicht abfangen kann, weil der Text frei ist.
 *
 * Geprueft wird deshalb NICHT „jede Paketregel hat einen Text" (das waere die
 * 78er-Tabelle), sondern „jede EIGENE ID existiert im Paket". Ein Tippfehler in
 * einem Schluessel oder eine in einem Upgrade entfallene Regel wird damit laut.
 */
describe("Regeltexte", () => {
  it("fuehrt die fuenfzehn Regeln aus Spec §6.3", () => {
    expect(Object.keys(REGELTEXTE).length).toBe(15);
  });

  /*
   * `compose()` kann gemessen 78 Kennungen werfen, `VALIDATION_RULE_IDS` zaehlt 72:
   * die sechs Textlauf-Regeln entstehen erst in `assertTextRunsFit` aus den
   * Praefixen `label`, `designation`, `function-role-run` mal `-too-wide`/
   * `-unknown-glyph` und stehen deshalb in keiner Liste des Pakets. Ohne die
   * zweite Menge waeren genau die sechs Texte falsch-verdaechtig, die ein Anwender
   * am haeufigsten sieht — eine zu lange Beschriftung ist der Normalfall.
   */
  it("kennt jede eigene ID entweder im Paket oder als Textlauf-Regel", () => {
    for (const id of Object.keys(REGELTEXTE)) {
      const bekannt = VALIDATION_RULE_IDS.includes(id) || TEXTLAUF_REGELN.includes(id);
      expect(bekannt, `unbekannte Regel-ID: ${id}`).toBe(true);
    }
  });

  it("belegt, dass die sechs Textlauf-Regeln dem Paket fehlen", () => {
    for (const id of TEXTLAUF_REGELN) expect(VALIDATION_RULE_IDS, id).not.toContain(id);
    expect(TEXTLAUF_REGELN.length).toBe(6);
  });

  /*
   * BESTANDSZUSICHERUNG, beim Upgrade ANHEBEN statt loeschen: eine gewachsene Zahl
   * heisst, das Paket hat Regeln ergaenzt — dann ist zu pruefen, ob eine davon
   * einen eigenen Text braucht, weil die Wertesperrung sie nicht abfaengt.
   */
  it("misst 72 Paketregeln", () => {
    expect(VALIDATION_RULE_IDS.length).toBe(72);
  });

  /*
   * Der Rueckfall ist Pflicht: die Paketmeldungen sind teils englisch und nennen
   * Katalogkennungen („Die Verwaltungsstufe ‚kreis‘ besitzt keinen aufgeloesten
   * gemessenen Kopf aus D.3/D.4"). Ohne Rueckfall stuende bei einer neuen Regel
   * gar nichts am Feld.
   */
  it("gibt einer unbekannten Regel-ID einen Rueckfalltext mit der rohen ID", () => {
    const text = regeltext("voellig-neue-regel");
    expect(text.titel.length).toBeGreaterThan(0);
    expect(text.erklaerung).toContain("voellig-neue-regel");
  });

  it("nennt bei head-zone-conflict die drei Quellen der Kopfzone", () => {
    expect(regeltext("head-zone-conflict").erklaerung).toMatch(/Stärke/);
  });

  /*
   * KORREKTUR 4 DES AUFTRAGS: die Erklaerung gehoert an das Feld, an dem geklickt
   * wurde. Eine Sammelablage unter „beschriftung" schickt den Anwender an die
   * falsche Stelle — er sucht sie dort, wo er gerade etwas geaendert hat.
   * `regelAchse` bildet die Regel-ID auf ihre Achse ab; dass die genannte Achse
   * auch wirklich existiert, prueft `_ui/baukasten/vokabular.test.ts` (nur dort
   * liegen beide Listen nebeneinander).
   */
  it("haengt jede Regel an die Achse, an der sie entsteht", () => {
    expect(regelAchse("strength-requires-unit")).toBe("kopfzone");
    expect(regelAchse("technical-fill-organization-conflict")).toBe("zugehoerigkeit");
    expect(regelAchse("chassis-foot-conflict")).toBe("fussstreifen");
    expect(regelAchse("label-too-wide")).toBe("beschriftung");
    expect(regelAchse("plain-wheel-pair-chassis-conflict")).toBe("koerperform");
    expect(regelAchse("function-role-run-too-wide")).toBe("funktion");
  });

  /*
   * Der Rueckfall zeigt auf die Beschriftung — die einzige Achse, die IMMER
   * gerendert wird und deren Feld keinen eigenen Wertevorrat hat. Eine unbekannte
   * Regel darf ihren Text nicht verlieren, nur weil niemand sie zugeordnet hat.
   */
  it("faellt fuer eine unbekannte Regel auf die Beschriftung zurueck", () => {
    expect(regelAchse("voellig-neue-regel")).toBe("beschriftung");
  });
});
