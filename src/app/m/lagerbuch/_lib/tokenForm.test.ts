import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CODEFELD_LAENGE,
  CODEFELD_MUSTER,
  TOKEN_ALPHABET,
  TOKEN_GRUPPE,
  TOKEN_LOESCHGRUND,
  TOKEN_ZEICHEN,
  TOKEN_ZIEHUNGEN,
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
   * DIESE ZAHLEN STEHEN AUF LAMINIERTEN KAERTCHEN IM FAHRZEUG. Sie zu aendern
   * macht gedruckte Gegenstaende wertlos — 1:1-Pflicht (seit DRK-442 die lange
   * Form).
   */
  it("benutzt Crockford-Base32 in sieben Vierergruppen", () => {
    expect(TOKEN_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    expect(TOKEN_ZEICHEN).toBe(28);
    expect(TOKEN_GRUPPE).toBe(4);
    expect(TOKEN_ZEICHEN % TOKEN_GRUPPE).toBe(0);
    // 32 Zeichen ohne Doppel, ohne I, L, O, U — sonst schrumpfte der Coderaum.
    expect(new Set(TOKEN_ALPHABET).size).toBe(32);
    expect(TOKEN_ALPHABET).not.toMatch(/[ILOU]/);
  });

  /**
   * DIE SCHRANKE LAESST DIESE FORM UNGEBREMST DURCH (DRK-442) — die Zahl ist
   * also die Abwehr. 128 bit ist die Schwelle aus
   * `docs/radio-portierung-analyse.md`.
   */
  it("traegt mindestens 128 bit", () => {
    expect(TOKEN_ZEICHEN * Math.log2(TOKEN_ALPHABET.length)).toBeGreaterThanOrEqual(128);
  });

  it("zieht hoechstens zwanzigmal", () => {
    expect(TOKEN_ZIEHUNGEN).toBe(20);
  });

  /**
   * DAS FELDMUSTER — DRK-442. Chromium uebersetzt `pattern` mit dem `v`-Flag
   * und IGNORIERT ein Muster, das dort nicht kompiliert; das Feld naehme dann
   * still jede Eingabe an. Deshalb wird es hier genau so gebaut.
   */
  describe("CODEFELD_MUSTER", () => {
    const muster = new RegExp(`^(?:${CODEFELD_MUSTER})$`, "v");

    it("nimmt beide Formen, mit und ohne Trenner, auch klein geschrieben", () => {
      for (const ok of [
        "123-456", "123456", "123 456",
        "7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J5AE",
        "7K3MQ9XD2RTP4W8NHV6BC1ZFJ5AE",
        "7k3m q9xd 2rtp 4w8n hv6b c1zf j5ae",
        "7K3O-Q9XD-2RTP-4W8N-HV6B-C1ZF-J5AE",   // O statt 0: normalisiereCode bildet zurueck
      ]) expect(muster.test(ok), ok).toBe(true);
    });

    it("weist offensichtlich Falsches ab", () => {
      for (const falsch of ["", "12345", "1234567", "abc-def", "7K3M-Q9XD", "7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J5A"]) {
        expect(muster.test(falsch), falsch).toBe(false);
      }
    });

    it("laesst die laengste gueltige Eingabe ganz ins Feld", () => {
      expect("7K3M-Q9XD-2RTP-4W8N-HV6B-C1ZF-J5AE").toHaveLength(CODEFELD_LAENGE);
      expect(TOKEN_ZEICHEN + TOKEN_ZEICHEN / TOKEN_GRUPPE - 1).toBe(CODEFELD_LAENGE);
    });
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
   *   async-Funktionen exportieren darf; der Bauform-Scan in
   *   `_actions/guards.test.ts` („kennt an einem Zeilenanfang mit `export` NUR
   *   die eine Action-Bauform und Typ-Exporte") meldet jedes `export const`
   *   dort als Fremdform, und das ist richtig.
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
   * Eine Datei ohne Importe. Sie haelt Werte und sonst nichts — jeder
   * Import waere ein Weg, auf dem Modulzustand in eine Konstante kaeme.
   */
  it("importiert nichts", () => {
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/^\s*import\s/m);
  });
});
