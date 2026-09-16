import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { teilbaum, type Lagerbereich, type OrtZeile } from "./orte";

const ORTE: OrtZeile[] = [
  { id: "handlager", parentId: null, sortierung: 0 },
  { id: "schrank-gf", parentId: "handlager", sortierung: 90 },
  { id: "schrank-1", parentId: "handlager", sortierung: 10 },
  { id: "schrank-2", parentId: "handlager", sortierung: 20 },
  { id: "rtw-1", parentId: null, sortierung: 0 },
];

describe("teilbaum", () => {
  it("liefert die Wurzel zuerst, dann die Kinder nach Reihenfolge", () => {
    expect(teilbaum(ORTE, "handlager"))
      .toEqual(["handlager", "schrank-1", "schrank-2", "schrank-gf"]);
  });

  it("ein Ort ohne Kinder ist sein eigener Teilbaum", () => {
    expect(teilbaum(ORTE, "rtw-1")).toEqual(["rtw-1"]);
  });

  /** Die Wurzel MUSS immer dabei sein: eine leere Liste wuerde in `inArray`
   *  zu `WHERE false` und liesse jeden Bestand still auf 0 fallen. */
  it("eine unbekannte Wurzel liefert trotzdem sich selbst", () => {
    expect(teilbaum(ORTE, "gibt-es-nicht")).toEqual(["gibt-es-nicht"]);
  });

  it("bei gleicher Reihenfolge entscheidet die ID, nicht die Eingabereihenfolge", () => {
    const gleich: OrtZeile[] = [
      { id: "wurzel", parentId: null, sortierung: 0 },
      { id: "b", parentId: "wurzel", sortierung: 5 },
      { id: "a", parentId: "wurzel", sortierung: 5 },
    ];
    expect(teilbaum(gleich, "wurzel")).toEqual(["wurzel", "a", "b"]);
  });

  /** Ein Schrank ist heute nie Elternteil — wenn es doch einmal so kommt,
   *  soll die Funktion nicht in eine Endlosschleife laufen. */
  it("ein Zyklus laeuft nicht endlos", () => {
    const zyklus: OrtZeile[] = [
      { id: "a", parentId: "b", sortierung: 0 },
      { id: "b", parentId: "a", sortierung: 0 },
    ];
    expect(teilbaum(zyklus, "a")).toEqual(["a", "b"]);
  });
});

describe("teilbaum — ohneKinder", () => {
  /** DRK-337 braucht „nur die Wurzel" als eigenen Bereich: „im Handlager,
   *  Schrank noch nicht zugeordnet". Das ist keine Teilmenge, die man nebenbei
   *  miterledigt (`zaehlBereich`). */
  it("liefert die Wurzel ALLEIN, ohne ihre Kinder", () => {
    expect(teilbaum(ORTE, "handlager", { ohneKinder: true })).toEqual(["handlager"]);
  });

  it("aendert an einem kinderlosen Ort nichts", () => {
    expect(teilbaum(ORTE, "rtw-1", { ohneKinder: true })).toEqual(["rtw-1"]);
  });
});

/**
 * DRK-354 — DIE MARKE IST NUR SO VIEL WERT WIE DIE ZAHL IHRER ERZEUGER.
 *
 * `Lagerbereich` ist zur Laufzeit ein gewoehnliches Array; wer die Marke per
 * Typzusicherung selbst vergibt, erklaert eine beliebige Ortsmenge zum Bereich
 * und hebelt den ganzen Umbau aus. Kein Tor sieht das: `typecheck` ist mit
 * jeder Zusicherung zufrieden, `lint` kennt die Regel nicht, und zur Laufzeit
 * gibt es nichts zu beobachten — der Fehler zeigte sich erst als
 * Phantombestand oder als still gebuchte 0.
 *
 * ⚠️ DIE PRUEFUNG LAEUFT UEBER DEN QUELLTEXT, weil es keine andere Stelle gibt,
 * an der sie laufen koennte. Sie faengt die naheliegende Umgehung, nicht jede
 * denkbare (eine ueber zwei Zeilen verteilte Zusicherung kaeme durch) —
 * dasselbe Mass wie der Scan in `scripts/seed-lokal.test.ts`.
 *
 * ⚠️ DIE DATEI SCANNT SICH SELBST MIT. Deshalb steht das gesuchte Wortpaar in
 * diesem Kommentar bewusst NICHT ausgeschrieben; wer es hier hinschreibt,
 * faerbt den Test rot, ohne dass irgendwo eine Marke vergeben wurde.
 */
describe("DRK-354 — die Marke entsteht an genau einer Stelle", () => {
  it("keine Typzusicherung auf die Marke ausserhalb von domain/orte.ts", () => {
    const wurzel = "src/app/m/lagerbuch";
    const treffer: string[] = [];
    const laufe = (verzeichnis: string): void => {
      for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
        const pfad = join(verzeichnis, eintrag.name);
        if (eintrag.isDirectory()) { laufe(pfad); continue; }
        if (!/\.tsx?$/.test(eintrag.name)) continue;
        if (pfad.endsWith(join("_lib", "domain", "orte.ts"))) continue;
        if (/\bas\s+(unknown\s+as\s+)?Lagerbereich\b/.test(readFileSync(pfad, "utf8"))) {
          treffer.push(pfad);
        }
      }
    };
    laufe(wurzel);
    expect(treffer).toEqual([]);
  });

  /**
   * Die Gegenprobe zur Regel oben: `teilbaum` steht wirklich im Modul und
   * liefert die Marke. Ohne sie waere der Scan gruen, auch wenn der Typ
   * gar nicht mehr existierte.
   */
  it("teilbaum liefert einen Wert, der als Lagerbereich durchgeht", () => {
    const bereich: Lagerbereich = teilbaum(ORTE, "handlager");
    expect(bereich).toHaveLength(4);
  });
});
