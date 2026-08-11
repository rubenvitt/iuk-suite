import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  FEHLER_TITEL, FEHLER_ERNEUT, FEHLER_ZURUECK,
  BARCODE_TITEL, BARCODE_TEXT, BARCODE_NOCHMAL, BARCODE_LISTE,
  etikettenDomainFehlt,
} from "./zustandTexte";

const QUELLE = "src/app/m/lagerbuch/_lib/zustandTexte.ts";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4), Vorbild
 * `_lib/pwaIcons.test.ts:19-39`. Der Rohtext-Scan waere sonst rot am eigenen
 * Kopfkommentar dieser Datei: der zitiert `("use client", Pflicht)` woertlich,
 * um zu erklaeren, WARUM error.tsx die Grenze ist. `bauform.test.ts` exportiert
 * die Funktion nicht, deshalb die lokale Kopie statt eines Re-Exports.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

describe("zustandTexte", () => {
  /** §11.5, Zustaende 22 und 23. Ein Satz OHNE Technik. */
  it("traegt den Text der Modul-Fehlergrenze", () => {
    expect(FEHLER_TITEL).toBe("Diese Ansicht konnte nicht geladen werden.");
    expect(FEHLER_ERNEUT).toBe("Erneut versuchen");
    expect(FEHLER_ZURUECK).toBe("Zurück zum Anfang");
  });

  /**
   * Kein Wort ueber „Fehler", „Exception", „500" oder einen Stack: die Person
   * vor dem Bildschirm kann damit nichts anfangen, und der englische Satz des
   * Produktions-Deserialisierers ist genau das, was §11.2 (d) verhindert.
   */
  it("nennt in der Fehlergrenze keine Technik", () => {
    expect(FEHLER_TITEL.toLowerCase()).not.toMatch(/exception|error|500|stack|server/);
  });

  /** §11.5, Zustand 15 / Entscheidung 8-C2. */
  it("traegt den Text des unbekannten Barcodes", () => {
    expect(BARCODE_TITEL).toBe("Kein Gerät zu diesem Barcode");
    expect(BARCODE_TEXT)
      .toBe("Zu diesem Barcode gibt es weder ein Gerät noch eine Sauerstoff-Flasche.");
    expect(BARCODE_NOCHMAL).toBe("Noch einmal scannen");
    expect(BARCODE_LISTE).toBe("Geräteliste");
  });

  /**
   * §11.5, Zustand 38 / Entscheidung 8-B. Der Satz muss den ENV-NAMEN nennen —
   * er ist die einzige Auskunft, die den Fehlstart in eine Handlung uebersetzt.
   */
  it("nennt in der Domain-Meldung den Variablennamen und die Folge", () => {
    const text = etikettenDomainFehlt();
    expect(text).toContain("SUITE_HOST_LAGERBUCH");
    expect(text).toContain("Etiketten können nicht gedruckt werden");
    expect(text).toContain("toten Link");
  });

  /**
   * FALLE 6: error.tsx traegt "use client" in Zeile 1 (Next verlangt das fuer
   * jede Fehlergrenze), g/[code]/page.tsx und die Etikettenseite sind Server
   * Components. Ein Text, den error.tsx selbst hielte, kaeme bei den beiden
   * anderen als Client-Referenz an — HTTP 500, build gruen, Vitest blind.
   *
   * FALLE 7: kein Icon-Import. Die Zustaende tragen Inline-SVG.
   *
   * K-4: Der Scan laeuft ueber `ohneKommentare(...)`, nicht ueber den
   * Rohtext — der Kopfkommentar dieser Datei zitiert `"use client"` woertlich,
   * um die Client-Grenze zu erklaeren, und ein Rohtext-Scan waere daran
   * garantiert rot.
   */
  it("traegt kein use client und keinen Icon-Import", () => {
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toContain("@ant-design/icons");
  });
});
