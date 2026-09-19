import { describe, expect, it } from "vitest";

import { blameZeilen, kuerzen, spanne } from "./anker-drift";

/**
 * DIE NORMALISIERUNG IST DAS GANZE WERKZEUG (DRK-204).
 *
 * Der Melder vergleicht zwei Textspannen und nennt jeden Unterschied einen
 * Verdacht. Was er dabei als „Unterschied" gelten laesst, entscheidet allein,
 * ob ihn jemand benutzt: meldet er Einrueckung, stehen nach dem ersten
 * `prettier`-Lauf tausende Befunde da, die alle nichts bedeuten — und dann wird
 * er abgeschaltet statt gelesen, dieselbe Lehre, die `core/kommentaranker.ts`
 * in seinem Kopf ausschreibt.
 *
 * ⚠️ GEPRUEFT WIRD HIER DIE REINE RECHNUNG, NICHT DER SCAN. Der Lauf ueber das
 * Repo braucht `git blame` je Datei und dauert Minuten; ihn in ein Tor zu
 * haengen waere derselbe Fehler wie den Melder zu einem zu machen. Die
 * Wirkung des Werkzeugs belegt ein Lauf von Hand, seine Rechnung dieser Test.
 */
describe("spanne normalisiert, was keine Aussage ist", () => {
  it("liest die Spanne einschliesslich beider Enden", () => {
    const zeilen = ["eins", "zwei", "drei", "vier"];
    // 1-basiert und INKLUSIV — so zitiert die Suite, und so muss es rechnen.
    expect(spanne(zeilen, 2, 3)).toBe("zwei\ndrei");
    expect(spanne(zeilen, 1, 1)).toBe("eins");
  });

  /**
   * ⚠️ DER FALL, DER DEN MELDER BENUTZBAR MACHT: ein Block, der eine Ebene
   * tiefer rutscht, aendert JEDE Zeile der Spanne, ohne dass die Aussage sich
   * bewegt haette. Ohne diese Zusicherung meldete das Werkzeug jede Umformatie-
   * rung als Verrottung.
   */
  it("uebergeht Einrueckung — eine tiefere Ebene ist keine Drift", () => {
    const vorher = ["const a = 1;", "return a;"];
    const nachher = ["    const a = 1;", "\treturn a;"];
    expect(spanne(nachher, 1, 2)).toBe(spanne(vorher, 1, 2));
  });

  /**
   * Eine eingefuegte Leerzeile verschiebt den Inhalt innerhalb der Spanne,
   * traegt aber selbst nichts. Sie faellt heraus, damit nicht jeder Absatz
   * einen Befund erzeugt.
   */
  it("uebergeht Leerzeilen, auch solche aus reinem Leerraum", () => {
    expect(spanne(["a", "", "   ", "b"], 1, 4)).toBe("a\nb");
  });

  /**
   * ⚠️ UND DIE GEGENPROBE, ohne die die drei Faelle darueber nichts wert waeren:
   * eine echte inhaltliche Aenderung muss durchkommen. Eine Normalisierung, die
   * alles gleichmacht, ist ein gruener Melder ohne Aussage — genau die
   * Vakuitaet, gegen die `kommentaranker.test.ts` seinen eigenen Scan absichert.
   */
  it("meldet eine echte Aenderung weiterhin", () => {
    expect(spanne(["return a;"], 1, 1)).not.toBe(spanne(["return b;"], 1, 1));
  });

  /** Eine Spanne hinter dem Dateiende ist leer — der EOF-Fall gehoert dem Riegel. */
  it("gibt hinter dem Dateiende nichts zurueck", () => {
    expect(spanne(["a", "b"], 5, 7)).toBe("");
  });
});

describe("kuerzen haelt den Bericht lesbar", () => {
  it("laesst kurze Ausschnitte unangetastet", () => {
    expect(kuerzen("a\nb")).toBe("a\nb");
  });

  it("schneidet ab und sagt, wie viel fehlt", () => {
    expect(kuerzen("a\nb\nc\nd\ne")).toBe("a\nb\nc\n  … (2 weitere)");
  });

  /**
   * Eine einzelne sehr lange Zeile — etwa eine minifizierte Zusicherung —
   * zerstoerte sonst die Ausrichtung des ganzen Berichts.
   */
  it("kappt eine ueberlange Zeile mit Auslassungszeichen", () => {
    const lang = "x".repeat(200);
    const gekuerzt = kuerzen(lang);
    expect(gekuerzt).toHaveLength(96);
    expect(gekuerzt.endsWith("…")).toBe(true);
  });
});

describe("blameZeilen trennt Commits von Nicht-Commits", () => {
  const KOPF = (sha: string, zeile: number) => `${sha} ${zeile} ${zeile} 1\nauthor Wer\n`;
  const ECHT = "a".repeat(40);
  const NULLEN = "0".repeat(40);

  it("liest die Zeilennummer und ihren Commit", () => {
    expect(blameZeilen(KOPF(ECHT, 7)).get(7)).toBe(ECHT);
  });

  /**
   * ⛔ DER FALL, DER DEN MELDER BLIND MACHTE (Codex-Review zu PR #210).
   * `git blame` setzt vierzig Nullen fuer jede Zeile, die im Arbeitsbaum steht
   * und noch nirgends festgeschrieben ist — also fuer GENAU die Zeilen, die
   * jemand gerade aufgeraeumt hat. Galten sie als Commit, scheiterte `git show`
   * darauf, und der Anker fiel STILL heraus statt als „ohne blame" gezaehlt zu
   * werden. Ein Werkzeug, das im Regelfall seiner Benutzung schweigt, ist
   * schlimmer als keines.
   */
  it("uebergeht die Nullen — eine ungespeicherte Zeile hat keinen Commit", () => {
    expect(blameZeilen(KOPF(NULLEN, 7)).has(7)).toBe(false);
  });

  it("und nimmt aus derselben Ausgabe die echten Zeilen trotzdem mit", () => {
    const beides = blameZeilen(KOPF(NULLEN, 7) + KOPF(ECHT, 8));
    expect(beides.has(7)).toBe(false);
    expect(beides.get(8)).toBe(ECHT);
  });
});
