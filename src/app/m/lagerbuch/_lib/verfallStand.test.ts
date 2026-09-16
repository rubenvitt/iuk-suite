import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEERER_STAND,
  standNachAntwort,
  standVorweg,
  verfallVon,
  type VerfallStand,
} from "./verfallStand";

const ZEILE = { artikelId: "a1", verfall: "2027-03" };

describe("verfallVon — Spiegel vor Prop, aber nur wo es einen gibt", () => {
  it("nimmt die Prop, solange diese Sitzung nichts geschrieben hat", () => {
    expect(verfallVon(LEERER_STAND, ZEILE)).toBe("2027-03");
  });

  /**
   * ⚠️ DER STAND STARTET LEER, UND DAS IST DIE HALBE ENTSCHEIDUNG. Vorher war er
   * beim Einhaengen eine Kopie ALLER Zeilen — danach gewann er fuer jeden
   * Artikel, auch fuer die, die niemand angefasst hatte. Eine Auffrischung der
   * Server-Props (etwa nachdem ein Vorlagen-Sync eine Soll-Position entfernt und
   * die Verfallsangabe mitgenommen hat) kam damit gar nicht mehr an: die Insel
   * wird nicht neu eingehaengt, nur neu gerendert.
   */
  it("nimmt eine NEUERE Prop an, wo diese Sitzung nichts geschrieben hat", () => {
    expect(verfallVon(LEERER_STAND, { artikelId: "a1", verfall: null })).toBeNull();
  });

  it("nimmt den Spiegel, wo diese Sitzung geschrieben hat", () => {
    const stand = standVorweg(LEERER_STAND, "a1", "2027-09");
    expect(verfallVon(stand, ZEILE)).toBe("2027-09");
  });

  /**
   * ⚠️ `null` IM STAND IST EIN WERT, KEIN „NICHTS". „Die Angabe ist entfallen"
   * und „dazu weiss der Server mehr als ich" sehen mit `??` gleich aus — und die
   * Verwechslung liesse den geleerten Waehler beim naechsten Rendern wieder das
   * alte Datum zeigen.
   */
  it("haelt eine geleerte Angabe gegen eine noch gefuellte Prop", () => {
    const stand = standVorweg(LEERER_STAND, "a1", null);
    expect(verfallVon(stand, ZEILE)).toBeNull();
  });
});

describe("standNachAntwort — der einzige Weg in den Stand", () => {
  /**
   * ⚠️ DER FALL, DEN NUR DIE ANTWORT KENNT (der dritte Fehler aus dem Review von
   * DRK-303). Die Aussonderung entscheidet in ihrer eigenen Transaktion ueber
   * „alles raus": geschickt wird ein Datum, geschrieben wird `null`. Wer die
   * EINGABE spiegelt, zeigt danach ein Datum, das in der Datenbank nicht steht.
   */
  it("uebernimmt den Wert der Antwort, auch wenn er der Eingabe widerspricht", () => {
    const gesendet = standVorweg(LEERER_STAND, "a1", "2027-09");
    const danach = standNachAntwort(gesendet, "a1", { ok: true, wert: { verfall: null } });
    expect(verfallVon(danach, ZEILE)).toBeNull();
  });

  it("uebernimmt auch einen Wert, den diese Sitzung nie gesendet hat", () => {
    // Fremdschreibvorgang dazwischen: die Aktion meldet, was sie VORFINDET.
    const danach = standNachAntwort(LEERER_STAND, "a1", {
      ok: true,
      wert: { verfall: "2028-01" },
    });
    expect(verfallVon(danach, ZEILE)).toBe("2028-01");
  });

  /**
   * ⚠️ BEI `ok: false` BLEIBT DIE VORWEGNAHME STEHEN — absichtlich. Die Eingabe
   * einer Person zu verwerfen, weil das Speichern scheiterte, ist schlimmer als
   * eine Statusspalte, die bis zum naechsten Laden den alten Stand nennt; den
   * Widerspruch loest der Fehlersatz auf, nicht das Zuruecksetzen.
   */
  it("laesst die Vorwegnahme stehen, wenn die Aktion einen Fehler meldet", () => {
    const gesendet = standVorweg(LEERER_STAND, "a1", "2027-09");
    const danach = standNachAntwort(gesendet, "a1", {
      ok: false,
      fehler: "Artikel steht an diesem Lagerort nicht im Soll.",
    });
    expect(verfallVon(danach, ZEILE)).toBe("2027-09");
  });

  it("fasst die anderen Artikel nicht an", () => {
    const stand: VerfallStand = { a2: "2030-12" };
    const danach = standNachAntwort(stand, "a1", { ok: true, wert: { verfall: null } });
    expect(verfallVon(danach, { artikelId: "a2", verfall: "2027-03" })).toBe("2030-12");
  });
});

/**
 * DER RIEGEL AUS DRK-345 — Akzeptanzkriterium „der Wert kann nicht mehr
 * auseinanderlaufen, ohne dass ein Test rot wird".
 *
 * ⚠️ DIE DREI FEHLER AUS DEM REVIEW VON DRK-303 WAREN ALLE DERSELBE FEHLER:
 * ein zweiter Ort setzte den Spiegel, und zwar mit etwas anderem als dem, was
 * die Datenbank fuehrt. Ein Verhaltenstest faengt immer nur den gerade
 * gebauten Fall; was diese Klasse schliesst, ist die Bauform — EIN Ort, an dem
 * ein Wert in den Stand faellt, und er nimmt ihn aus der Antwort.
 *
 * ⚠️ WAS DIESER SCAN NICHT KANN: er faengt die naheliegende Verdrahtung, nicht
 * jede denkbare. Ein zweiter `useState` mit einem anderen Namen, der denselben
 * Wert haelt, kaeme durch — derselbe Zuschnitt wie bei `vorgang.test.ts` und
 * `scripts/seed-lokal.test.ts`.
 */
describe("Ein Schreibweg, ein Stand", () => {
  const WURZEL = "src/app/m/lagerbuch";
  const TRICHTER = "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/useVerfallStand.ts";

  function quellen(verzeichnis: string, treffer: string[] = []): string[] {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) quellen(pfad, treffer);
      else if (/\.tsx?$/.test(eintrag.name) && !/\.test\.tsx?$/.test(eintrag.name)) {
        treffer.push(pfad);
      }
    }
    return treffer;
  }

  /**
   * Kommentare und Zeichenketten zuerst weg, sonst ist der Test nur laut: die
   * Namen stehen ueberall in der Prosa dieses Moduls. Die Form ist die aus
   * `vorgang.test.ts` — Literale VOR den Kommentaren, damit ein `//` INNERHALB
   * einer Zeichenkette nicht den Rest der Zeile verschluckt.
   */
  const STRING_ODER_KOMMENTAR =
    /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

  function nackt(pfad: string): string {
    return readFileSync(pfad, "utf8")
      .replace(STRING_ODER_KOMMENTAR, (treffer) => (treffer.startsWith("/") ? " " : treffer));
  }

  it.each([
    ["standNachAntwort", /\bstandNachAntwort\s*\(/],
    ["standVorweg", /\bstandVorweg\s*\(/],
  ])("%s wird an GENAU EINER Stelle im Modul gerufen", (_name, ruf) => {
    const rufer = quellen(WURZEL)
      .filter((pfad) => !pfad.endsWith("_lib/verfallStand.ts"))
      .filter((pfad) => ruf.test(nackt(pfad)));

    expect(rufer).toEqual([TRICHTER]);
  });

  /**
   * ⚠️ DER SETZER DARF DEN TRICHTER NICHT VERLASSEN. Gaebe `useVerfallStand`
   * ihn heraus, waere die ganze Bauform wieder eine Bitte statt einer Sperre —
   * jede Aufrufstelle koennte den Stand mit einem selbst ausgedachten Wert
   * belegen, und genau das ist dreimal passiert.
   */
  it("gibt den Setzer des Standes nicht heraus", () => {
    const quelle = nackt(TRICHTER);
    const rueckgabe = quelle.slice(quelle.lastIndexOf("return {"));

    expect(rueckgabe).not.toMatch(/\bsetStand\b/);
    // Genau EIN Stand in dieser Datei — ein zweiter waere der naechste Spiegel.
    expect(quelle.match(/\buseState\s*[<(]/g) ?? []).toHaveLength(1);
  });

  /**
   * ⚠️ WER DIE ANTWORT SELBST ABWARTET, KANN SIE AUCH FALSCH WEITERREICHEN. Die
   * beiden Schreibwege auf `lagerort_verfall` werden deshalb als Funktion in den
   * Trichter gereicht, nicht an der Aufrufstelle abgewartet.
   */
  it("keine Aufrufstelle wartet einen Schreibweg selbst ab", () => {
    const SELBST_ABGEWARTET = /\bawait\s+(verfallSetzen|aussondernVomLagerort)\s*\(/;
    const suender = quellen(WURZEL)
      .filter((pfad) => !pfad.startsWith(join(WURZEL, "_actions")))
      .filter((pfad) => SELBST_ABGEWARTET.test(nackt(pfad)));

    expect(
      suender,
      "Diese Dateien warten einen Verfalls-Schreibweg selbst ab, statt ihn in "
        + `den Trichter zu reichen:\n${suender.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * Die Gegenprobe zu den Scans oben: sie pruefen ABWESENHEIT und blieben
   * gruen, wenn die beiden Aufrufstellen den Trichter gar nicht mehr nutzten.
   */
  it.each([
    "verwaltung/(arbeit)/fahrzeuge/[id]/VerfallEditor.tsx",
    "verwaltung/(arbeit)/fahrzeuge/[id]/AussondernDialog.tsx",
  ])("%s schreibt ueber den Trichter", (datei) => {
    expect(nackt(join(WURZEL, datei))).toMatch(/\bschreibe\s*\(/);
  });
});
