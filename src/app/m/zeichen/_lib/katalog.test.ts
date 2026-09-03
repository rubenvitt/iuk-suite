import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BODY_VARIANT_NAMEN } from "./bezeichnungen";
import { KATALOG_STAND, alleZeichen, findeZeichen, kapitelListe, sucheZeichen } from "./katalog";

const GENERAT = "src/app/m/zeichen/_lib/katalog.generiert.json";

/** Das Generat ohne den einzigen nichtdeterministischen Wert. */
const ohneDatum = (roh: string) => {
  const o = JSON.parse(roh) as { stand: Record<string, unknown> };
  delete o.stand.erzeugtAm;
  return JSON.stringify(o);
};

describe("Katalog-Generat", () => {
  /*
   * DER WAECHTER. Er baut das Generat bei JEDEM Lauf neu und vergleicht byteweise.
   * Damit ist Drift zwischen eingechecktem Stand und installiertem Paket
   * strukturell ausgeschlossen, nicht nur geregelt.
   *
   * ⚠️ ER BAUT IN EINEN WEGWERFPFAD UND FASST DIE EINGECHECKTE DATEI NICHT AN. Schriebe
   * er dorthin, heilte er sich selbst: ein veraltetes Generat waere genau EINMAL rot —
   * derselbe Lauf, der die Abweichung meldet, haette sie schon weggeschrieben —, und der
   * zweite Lauf gruen, ohne dass jemand etwas repariert hat. Die Zusicherung „Drift ist
   * strukturell ausgeschlossen" haette dann nur der frische CI-Checkout eingeloest, nicht
   * dieser Test. Nebenbei bleibt so der Arbeitsbaum nach `pnpm vitest run` sauber
   * (`erzeugtAm` wechselt taeglich) und kein paralleler Worker liest eine halb
   * geschriebene 541-KB-Datei.
   */
  it("entspricht dem installierten Paket", () => {
    const ordner = mkdtempSync(join(tmpdir(), "zeichen-generat-"));
    try {
      const probe = join(ordner, "katalog.probe.json");
      execFileSync("pnpm", ["exec", "tsx", "scripts/zeichen-generat.ts", probe], {
        stdio: "pipe",
      });
      expect(ohneDatum(readFileSync(probe, "utf8"))).toBe(
        ohneDatum(readFileSync(GENERAT, "utf8")),
      );
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  /*
   * Die Gegenprobe zum Waechter: er darf die Quelle NICHT veraendern. Waere das anders,
   * hinterliesse jeder Testlauf einen schmutzigen Arbeitsbaum — und der Waechter oben
   * pruefte am Ende nur noch sich selbst.
   */
  it("laesst das eingecheckte Generat unangetastet", () => {
    const vorher = readFileSync(GENERAT, "utf8");
    const ordner = mkdtempSync(join(tmpdir(), "zeichen-generat-"));
    try {
      execFileSync(
        "pnpm",
        ["exec", "tsx", "scripts/zeichen-generat.ts", join(ordner, "wegwerf.json")],
        { stdio: "pipe" },
      );
      expect(readFileSync(GENERAT, "utf8")).toBe(vorher);
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  /*
   * BESTANDSZUSICHERUNG. Diese Zahl wird beim Paketupgrade ANGEHOBEN, nicht geloescht
   * — dieselbe Regel wie bootstrap.test.ts:718. Sie ist die einzige Stelle, an der ein
   * verschwundenes Zeichen ueberhaupt auffaellt, bevor jemand danebensteht.
   */
  it("fuehrt 246 Zeichen: 232 Hauptrezepte und 14 Grundzeichen", () => {
    expect(KATALOG_STAND.anzahl).toBe(246);
    expect(alleZeichen().length).toBe(246);
    expect(alleZeichen().filter((z) => z.id.startsWith("grund:")).length).toBe(14);
  });

  it("traegt Paket-, Datenversion und Erzeugungstag", () => {
    expect(KATALOG_STAND.paket).toBe("1.1.0");
    expect(KATALOG_STAND.daten).toBe("0.2.0");
    expect(KATALOG_STAND.erzeugtAm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /*
   * ANKER — die namentliche Liste aller IDs, die `_lib/seedLokal.ts` benutzt. Ohne
   * diesen Test liefen Seed und Katalog nach einem Upgrade auseinander, und der Seed
   * schriebe Merkzeilen auf IDs, die es nicht mehr gibt.
   */
  const ANKER = ["rezept:C.1.1", "rezept:E.1.1", "rezept:I.3.5", "grund:base.formation"];
  it.each(ANKER)("loest die Anker-ID %s auf", (id) => {
    expect(findeZeichen(id)).not.toBeNull();
  });

  /*
   * `findeZeichen` gibt null zurueck und wirft NIE — anders als RECIPES[k]
   * (liefert still undefined) und anders als composeFromCatalog (wirft). Eine
   * unbekannte ID ist hier ein ZUSTAND, kein Fehler: gespeicherte Merkzeilen und
   * Lernstaende zeigen auf IDs, die ein Upgrade entfernt haben kann.
   */
  it("liefert null statt zu werfen", () => {
    expect(findeZeichen("rezept:GIBTSNICHT")).toBeNull();
    expect(() => findeZeichen("")).not.toThrow();
  });

  it("schreibt nirgends das Wort undefined in einen Anwendertext", () => {
    for (const z of alleZeichen()) {
      expect(z.bedeutung, z.id).not.toContain("undefined");
      expect(z.antwort, z.id).not.toContain("undefined");
    }
  });

  /*
   * GEMESSEN drei echte Titelkollisionen ueber sechs IDs (Mehrzweckboot,
   * Mehrzweckarbeitsboot, Mehrzweckponton — je Hilfsorganisation gegen THW). Die
   * zehn #alternative sind KEINE Kollision: sie tragen denselben Titel wie ihr
   * Hauptschluessel, weil es dasselbe Zeichen ist.
   */
  it("markiert genau sechs IDs als mehrdeutig und macht ihre Antworten eindeutig", () => {
    expect(alleZeichen().filter((z) => z.mehrdeutigerTitel).length).toBe(6);
    expect(new Set(alleZeichen().map((z) => z.antwort)).size).toBe(246);
  });

  /*
   * M11: renderSvg ohne idPrefix erzeugt auf jeder Kachelflaeche dieselbe DOM-ID
   * (`ez-title`/`ez-desc`). Auf einer Seite mit 24 Zeichen sind das 24 Kollisionen —
   * optisch faellt nichts auf, und kein Gate sieht es. Reine Stringarbeit, deshalb hier
   * pruefbar.
   */
  it("vergibt eindeutige SVG-IDs ueber den ganzen Katalog", () => {
    /*
     * „Ueber den ganzen Katalog" schliesst die zehn zweiten Darstellungen ein — sie
     * stehen auf der Detailflaeche NEBEN der ersten, also genau dort, wo doppelte
     * DOM-IDs zusammentreffen. Wer hier nur `z.svg` liest, prueft die eine Naht nicht,
     * an der die Kollision am wahrscheinlichsten ist (getrennt gehalten allein durch
     * den Praefix `tz-alt-`). Gemessen: 512 IDs aus 256 SVGs, keine doppelt.
     */
    const ids = alleZeichen()
      .flatMap((z) => [z.svg, z.zweiteDarstellung?.svg])
      .filter((s): s is string => typeof s === "string")
      .flatMap((s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    expect(ids.length).toBe(512);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("kennt fuer jede vorkommende Koerperform einen deutschen Namen", () => {
    const varianten = new Set(
      alleZeichen()
        .map((z) => (z.spec as { bodyVariant?: string } | null)?.bodyVariant)
        .filter((v): v is string => typeof v === "string"),
    );
    const ohne = [...varianten].filter((v) => !(v in BODY_VARIANT_NAMEN));
    expect(ohne).toEqual([]);
  });
});

describe("sucheZeichen", () => {
  it("findet ueber die Umlautfaltung", () => {
    expect(sucheZeichen({ text: "loeschgruppe" }).treffer.length).toBeGreaterThan(0);
    expect(sucheZeichen({ text: "sanitaet" }).treffer.length).toBeGreaterThan(0);
  });

  it("schraenkt auf eine ID-Liste ein, wenn `nur` gesetzt ist", () => {
    const zwei = ["rezept:C.1.1", "rezept:E.1.1"];
    expect(
      sucheZeichen({ nur: zwei })
        .treffer.map((z) => z.id)
        .sort(),
    ).toEqual(zwei);
  });

  it("liefert Kapitel mit Zaehlung", () => {
    const k = kapitelListe();
    expect(k.length).toBeGreaterThan(20);
    expect(k.reduce((s, e) => s + e.anzahl, 0)).toBe(246);
  });
});
