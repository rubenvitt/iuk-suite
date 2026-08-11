import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  TOKEN_ALPHABET,
  TOKEN_LOESCHGRUND,
  TOKEN_ZIEHUNGEN,
  TOKEN_ZIFFERN,
} from "./tokenForm";

const QUELLE = "src/app/m/lagerbuch/_lib/tokenForm.ts";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4), Vorbild
 * `_lib/pwaIcons.test.ts:19-39` und `_lib/zustandTexte.test.ts:18-38`. Der
 * Rohtext-Scan waere sonst rot am eigenen Kopfkommentar dieser Datei: der
 * zitiert `"use server"` und `"use client"` woertlich, um zu erklaeren, WARUM
 * die vier Werte hier stehen und nicht in `_actions/`. `bauform.test.ts`
 * exportiert die Funktion nicht, deshalb die lokale Kopie statt eines
 * Re-Exports.
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

describe("tokenForm — §8.3, der Token-Vertrag", () => {
  /**
   * DIE DREI ZAHLEN STEHEN AUF LAMINIERTEN KAERTCHEN IM FAHRZEUG. Sie zu
   * aendern macht gedruckte Gegenstaende wertlos — 1:1-Pflicht.
   */
  it("benutzt genau die zehn Ziffern und sechs Stellen", () => {
    expect(TOKEN_ALPHABET).toBe("0123456789");
    expect(TOKEN_ZIFFERN).toBe(6);
    // Coderaum 10^6 — die Zahl, gegen die die Gate-Schranke rechnet (§3.5.3).
    expect(TOKEN_ALPHABET.length ** TOKEN_ZIFFERN).toBe(1_000_000);
  });

  it("zieht hoechstens zwanzigmal", () => {
    expect(TOKEN_ZIEHUNGEN).toBe(20);
  });

  /**
   * ENTSCHEIDUNG 8-F, §11.7: der Dialog zeigt `grund` woertlich an. Ein Grund
   * ohne benannte Alternative liesse die Person vor einer Sackgasse stehen —
   * deshalb muss das Wort „sperren" im Text vorkommen, nicht nur auf dem
   * zweiten Knopf.
   */
  it("nennt das Sperren als Weg — im Text, nicht nur als Schalter", () => {
    expect(TOKEN_LOESCHGRUND).toContain("sperren");
  });

  /** Der Text nennt auch den GRUND, sonst liest er sich wie Willkuer. */
  it("begruendet, warum der Code belegt bleibt", () => {
    expect(TOKEN_LOESCHGRUND).toContain("belegt");
    expect(TOKEN_LOESCHGRUND).toContain("Journalzeilen");
  });

  /** Ein Satz ohne Technik (§11.2 d): kein SQL, kein Delete, kein Stack. */
  it("nennt keine Technik", () => {
    expect(TOKEN_LOESCHGRUND.toLowerCase())
      .not.toMatch(/sql|delete|exception|error|500|stack|constraint/);
  });

  /**
   * A1 / FALLE 6 UND DER GUARD-SCAN: Diese Datei traegt weder "use client"
   * noch "use server".
   *
   * — "use server" ist verboten, weil ein `"use server"`-Modul ausschliesslich
   *   async-Funktionen exportieren darf; `_actions/guards.test.ts:265-267`
   *   meldet jedes `export const` dort als Fremdform, und das ist richtig.
   * — "use client" ist verboten, weil `_actions/tokens.ts` und
   *   `_actions/loeschen.ts` diese Werte SERVERSEITIG lesen. Aus einem
   *   Client-Modul kaeme dort eine Client-Referenz statt des Wertes an —
   *   HTTP 500 fuer die ganze Seite, waehrend typecheck und build gruen
   *   bleiben (Falle 6, CLAUDE.md).
   *
   * K-4: Der Scan laeuft ueber `ohneKommentare(...)`, nicht ueber den Rohtext.
   */
  it("traegt weder use client noch use server und keinen Icon-Import", () => {
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toMatch(/["']use server["']/);
    expect(quelle).not.toContain("@ant-design/icons");
  });

  /**
   * Eine Datei ohne Importe. Sie haelt vier Werte und sonst nichts — jeder
   * Import waere ein Weg, auf dem Modulzustand in eine Konstante kaeme.
   */
  it("importiert nichts", () => {
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/^\s*import\s/m);
  });
});
