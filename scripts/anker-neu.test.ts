import { describe, expect, it } from "vitest";

import { alsNeueDatei, ankerOhneMeldungen, neueAnker, zaehltAlsQuelle } from "./anker-neu";

/**
 * DIE RECHNUNG DES TORS FUER REGEL 1 (DRK-474).
 *
 * ⚠️ GEPRUEFT WIRD DIE REINE RECHNUNG, NICHT DER LAUF — derselbe Schnitt wie bei
 * `anker-drift.test.ts`. Der Lauf braucht eine Merge-Basis, und die hat der
 * Tiefe-1-Klon der Vitest-Shards nicht; deshalb laeuft er im `lint`-Job.
 *
 * ⚠️ JEDES BEISPIEL NENNT EINEN ERFUNDENEN PFAD (`probe…`), aus demselben Grund
 * wie in `core/kommentaranker.test.ts`: Riegel und Tor lesen auch diese Datei.
 * Die Attrappe `insRepo` entscheidet hier, was „eigenes Repo" heisst.
 */
const alles = () => true;

function diff(...bloecke: string[]): string {
  return bloecke.join("\n");
}

function datei(pfad: string, ...hunks: string[]): string {
  return diff(`diff --git a/${pfad} b/${pfad}`, `--- a/${pfad}`, `+++ b/${pfad}`, ...hunks);
}

describe("neueAnker", () => {
  it("meldet einen hinzugefuegten Anker mit der Zeile im NEUEN Stand", () => {
    const d = datei(
      "src/probe/probeQuelle.ts",
      "@@ -10,0 +11,2 @@",
      "+// nichts",
      "+// siehe `probe/probeZiel.ts:40-42`",
    );
    expect(neueAnker(d, alles)).toEqual([
      { quelle: "src/probe/probeQuelle.ts", zeile: 12, anker: "probe/probeZiel.ts:40-42" },
    ]);
  });

  /**
   * ⚠️ DER FALL, DER DAS TOR BENUTZBAR MACHT: wer einen Kommentar umformuliert,
   * verschiebt oder in eine andere Datei traegt, bringt keinen neuen Anker in
   * die Welt. Ohne den Abgleich strafte das Tor das Anfassen des Bestands —
   * und dann wird es abgeschaltet statt gelesen.
   */
  it("zaehlt einen verschobenen oder umformulierten Anker nicht", () => {
    const umformuliert = datei(
      "src/probe/probeQuelle.ts",
      "@@ -5 +5 @@",
      "-// alt, siehe `probe/probeZiel.ts:12`",
      "+// neu formuliert, siehe `probe/probeZiel.ts:12`",
    );
    expect(neueAnker(umformuliert, alles)).toEqual([]);

    const verschoben = diff(
      datei("src/probe/probeA.ts", "@@ -5 +4,0 @@", "-// `probe/probeZiel.ts:12`"),
      datei("src/probe/probeB.ts", "@@ -0,0 +1 @@", "+// `probe/probeZiel.ts:12`"),
    );
    expect(neueAnker(verschoben, alles)).toEqual([]);
  });

  it("gleicht je entferntem Anker genau EINEN hinzugefuegten aus", () => {
    const d = datei(
      "src/probe/probeQuelle.ts",
      "@@ -3 +3,2 @@",
      "-// `probe/probeZiel.ts:12`",
      "+// `probe/probeZiel.ts:12`",
      "+// und nochmal `probe/probeZiel.ts:12`",
    );
    expect(neueAnker(d, alles).map((n) => n.zeile)).toEqual([4]);
  });

  /**
   * Die Zahl nachzuziehen ist ein NEUER Zeilenanker, kein alter: Regel 3 sagt
   * „zieh den Anker nach", und Regel 1 sagt, wohin — auf den Namen.
   */
  it("meldet eine nachgezogene Zahl als neu", () => {
    const d = datei(
      "src/probe/probeQuelle.ts",
      "@@ -3 +3 @@",
      "-// `probe/probeZiel.ts:12`",
      "+// `probe/probeZiel.ts:14`",
    );
    expect(neueAnker(d, alles).map((n) => n.anker)).toEqual(["probe/probeZiel.ts:14"]);
  });

  it("laesst durch, was nicht ins eigene Repo zeigt", () => {
    const d = datei("src/probe/probeQuelle.ts", "@@ -0,0 +1 @@", "+// `probeAltrepo/src/probeAlt.css:277`");
    expect(neueAnker(d, (_q, ziel) => !ziel.startsWith("probeAltrepo/"))).toEqual([]);
  });

  /**
   * ⚠️ `+++` IST NICHT IMMER EIN DATEIKOPF: eine Quelltextzeile, die selbst mit
   * `++` beginnt, steht im Diff genauso da. Wer am Praefix unterscheidet, liest
   * sie als neuen Dateinamen — und ordnet jeden folgenden Anker der falschen
   * Datei zu.
   */
  it("haelt eine `+++`-Zeile im Hunk fuer Inhalt, nicht fuer einen Dateikopf", () => {
    const d = datei(
      "src/probe/probeQuelle.ts",
      "@@ -0,0 +1,2 @@",
      "+++zaehler; // `probe/probeZiel.ts:3`",
      "+// `probe/probeZiel.ts:4`",
    );
    expect(neueAnker(d, alles)).toEqual([
      { quelle: "src/probe/probeQuelle.ts", zeile: 1, anker: "probe/probeZiel.ts:3" },
      { quelle: "src/probe/probeQuelle.ts", zeile: 2, anker: "probe/probeZiel.ts:4" },
    ]);
  });

  it("zaehlt Kontext- und Endmarken-Zeilen richtig mit", () => {
    const d = datei(
      "src/probe/probeQuelle.ts",
      "@@ -1,2 +1,3 @@",
      " // Kontext",
      "\\ No newline at end of file",
      "+// `probe/probeZiel.ts:9`",
    );
    expect(neueAnker(d, alles).map((n) => n.zeile)).toEqual([2]);
  });

  it("liest, was der Riegel liest — nicht `docs`, nicht Binaeres", () => {
    expect(zaehltAlsQuelle("src/probe/probeQuelle.ts")).toBe(true);
    expect(zaehltAlsQuelle("Dockerfile")).toBe(true);
    expect(zaehltAlsQuelle("docs/probeBericht.md")).toBe(false);
    expect(zaehltAlsQuelle("public/probeBild.png")).toBe(false);

    const d = datei("docs/probeBericht.md", "@@ -0,0 +1 @@", "+`probe/probeZiel.ts:9` hielt damals");
    expect(neueAnker(d, alles)).toEqual([]);
  });

  /** Eine geloeschte Datei gibt ihre Anker frei — ihr `+++` ist `/dev/null`. */
  it("rechnet die Anker einer geloeschten Datei gegen", () => {
    const d = diff(
      "diff --git a/src/probe/probeWeg.ts b/src/probe/probeWeg.ts",
      "--- a/src/probe/probeWeg.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-// `probe/probeZiel.ts:12`",
      datei("src/probe/probeNeu.ts", "@@ -0,0 +1 @@", "+// `probe/probeZiel.ts:12`"),
    );
    expect(neueAnker(d, alles)).toEqual([]);
  });

  it("nimmt eine ungetrackte Datei als ganz hinzugefuegt", () => {
    const d = alsNeueDatei("src/probe/probeNeu.ts", "// eins\n// `probe/probeZiel.ts:7`\n");
    expect(neueAnker(d, alles)).toEqual([
      { quelle: "src/probe/probeNeu.ts", zeile: 2, anker: "probe/probeZiel.ts:7" },
    ]);
  });
});

describe("ankerOhneMeldungen", () => {
  /**
   * STAPEL- UND COMPILERMELDUNGEN zitieren ein Werkzeug; eine Namensform gibt
   * es fuer sie nicht. Erkennbar sind sie an der Spalte direkt hinter der Zeile.
   */
  it("uebergeht `datei:zeile:spalte`, behaelt den Anker daneben", () => {
    const ziele = (t: string) => ankerOhneMeldungen(t).map((a) => `${a.ziel}:${a.von}`);

    expect(ziele("at module evaluation (probe/probeIcons.ts:1:1)")).toEqual([]);
    expect(ziele("probe/probeBoot.test.ts:60:9 meldet tsc")).toEqual([]);
    expect(ziele("tsc meldet probe/probeBoot.test.ts:60:9, siehe `probe/probeZiel.ts:12`"))
      .toEqual(["probe/probeZiel.ts:12"]);
    // Ein Doppelpunkt OHNE Ziffer dahinter ist Satzbau, keine Spalte.
    expect(ziele("probe/probeZiel.ts:12: dort steht es")).toEqual(["probe/probeZiel.ts:12"]);
  });
});
