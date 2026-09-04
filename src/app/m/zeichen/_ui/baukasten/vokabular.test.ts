import { describe, it, expect } from "vitest";
import { BODY_VARIANT_IDS, PALETTE } from "@einsatzzeichen/schema";
import { ACHSEN, FARBWORTE, bezeichnung, kandidaten } from "./vokabular";
import { BODY_VARIANT_NAMEN } from "../../_lib/bezeichnungen";
import { REGELTEXTE, regelAchse } from "../../_lib/regeltexte";

/*
 * Eine Testdatei darf @einsatzzeichen direkt importieren: `naht.test.ts` schliesst
 * `*.test.ts`/`*.test.tsx` aus dem Scan aus, und Vitest laeuft in Node — die
 * Modulebenen-Aufrufe aus `fonts.js`, die `pnpm build` brechen (M1), sind hier
 * unbedenklich. Nur Produktivcode geht durch `paket.ts`.
 */

describe("Vokabular des Baukastens", () => {
  /*
   * DIE REIHENFOLGE IST VON DEN DATEN ERZWUNGEN, nicht Geschmack (Spec §6.1):
   * `kind` entscheidet, welche Achsen ueberhaupt existieren; die Kopfzone ist EIN
   * Feld aus drei Quellen, weil drei getrennte Felder gemessen bei jedem zweiten
   * Klick `head-zone-conflict` erzeugten. Wer die Reihenfolge aendert, aendert die
   * Bedienbarkeit — dieser Test macht das zu einer bewussten Entscheidung.
   */
  it("fuehrt genau neun Achsen in der erzwungenen Reihenfolge", () => {
    expect(ACHSEN.map((a) => a.key)).toEqual([
      "grundzeichenart",
      "zugehoerigkeit",
      "kopfzone",
      "funktion",
      "fussstreifen",
      "koerperform",
      "faehigkeit",
      "koerpermarken",
      "beschriftung",
    ]);
  });

  /*
   * Zahlen aus Spec §6.1, gemessen gegen 1.1.0. Sie werden beim Paketupgrade
   * ANGEHOBEN, nicht geloescht — dieselbe Regel wie bootstrap.test.ts:718. Eine
   * neue Achse, die niemand bemerkt, waere ein Feld, das der Baukasten nie zeigt.
   *
   * ⚠️ `bodyMarks` MISST 64, NICHT DIE 132 AUS DEM AUFGABENTEXT. Gemessen gegen
   * 1.1.0 fuehrt `BODY_MARK_IDS` 64 Kennungen — 44 technische Marken aus
   * `TECHNICAL_BODY_MARK_LABELS` plus 20 Faehigkeitspiktogramme in ihrer
   * randbuendigen Fassung. Die 132 entstuenden aus 44 + ALLEN 88
   * Faehigkeitspiktogrammen; das waeren 68 Werte, die das Paket gar nicht als
   * Koerpermarke fuehrt. Die zweite Messung des Aufgabentexts stuetzt die 64:
   * „247 Kandidaten ueber elf Felder" ist genau 19+9+13+4+6+1+25+8+10+88+64.
   * Angeboten wird deshalb die Liste des Pakets.
   */
  it("kennt die gemessenen Wertemengen je Achse", () => {
    expect(kandidaten("kind").length).toBe(19);
    expect(kandidaten("organization").length).toBe(9);
    expect(kandidaten("strength").length).toBe(4);
    expect(kandidaten("administrativeLevel").length).toBe(6);
    expect(kandidaten("technicalHeadMark").length).toBe(1);
    expect(kandidaten("functionRole").length).toBe(25);
    expect(kandidaten("vehicleCategory").length).toBe(8);
    expect(kandidaten("bodyVariant").length).toBe(10);
    expect(kandidaten("capabilities").length).toBe(88);
    expect(kandidaten("bodyMarks").length).toBe(64);
  });

  /*
   * ⛔ DER WAECHTER GEGEN EINE ENGLISCHE ID AUF DEM BILDSCHIRM. `koerperformName`
   * faellt auf die rohe ID zurueck — richtig, damit nie eine leere Stelle steht,
   * aber still. Dieser Test macht die Luecke laut: fuer JEDE vom Paket gefuehrte
   * Koerperform muss ein deutscher Name in `_lib/bezeichnungen.ts` stehen.
   *
   * GEHT ER ROT, IST `BODY_VARIANT_NAMEN` ZU KORRIGIEREN, NICHT DIESER TEST.
   */
  it("hat fuer jede Koerperform des Pakets einen deutschen Namen", () => {
    for (const id of BODY_VARIANT_IDS) {
      expect(Object.keys(BODY_VARIANT_NAMEN), id).toContain(id);
      expect(bezeichnung("bodyVariant", id), id).not.toBe(id);
    }
  });

  /** Dieselbe Luecke fuer die Farbtoken der technischen Fuellung. */
  it("hat fuer jeden Farbtoken ein deutsches Wort", () => {
    for (const token of Object.keys(PALETTE)) {
      expect(Object.keys(FARBWORTE), token).toContain(token);
    }
  });

  /*
   * M9: `symbolKindLabel('quatsch')` liefert STILL `undefined`, und
   * `describeSymbolSpec({kind:'quatsch'})` schreibt das Wort „undefined" in einen
   * deutschen Satz. Die Naht faengt das ab, statt es durchzureichen.
   */
  it("schreibt nie das Wort undefined auf den Bildschirm", () => {
    for (const achse of ACHSEN) {
      for (const feld of achse.felder) {
        for (const id of kandidaten(feld)) {
          expect(bezeichnung(feld, id), `${feld}/${id}`).not.toMatch(/undefined/);
          expect(bezeichnung(feld, id).trim(), `${feld}/${id}`).not.toBe("");
        }
      }
    }
    expect(bezeichnung("kind", "gibtsnicht")).toBe("gibtsnicht");
  });

  /*
   * ⛔ DIE ZUORDNUNG REGEL → ACHSE ZEIGT AUF EINE ACHSE, DIE ES GIBT (Korrektur 4
   * des Auftrags, Spec §6.3). `regelAchse` liegt in `_lib/regeltexte.ts` und kennt
   * die Achsenliste nicht — ein Tippfehler dort haenge den Erklaertext an eine
   * Achse, die nie gerendert wird, und der Anwender saehe GAR KEINE Erklaerung.
   * Diese Naht ist die einzige Stelle, an der beide Listen nebeneinanderliegen.
   */
  it("haengt jeden Regeltext an eine Achse, die es wirklich gibt", () => {
    const schluessel = ACHSEN.map((a) => a.key);
    for (const id of Object.keys(REGELTEXTE)) {
      expect(schluessel, `${id} -> ${regelAchse(id)}`).toContain(regelAchse(id));
    }
    expect(schluessel).toContain(regelAchse("voellig-neue-regel"));
  });
});
