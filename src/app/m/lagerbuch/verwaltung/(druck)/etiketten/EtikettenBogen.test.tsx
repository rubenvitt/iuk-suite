// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, query, queryAll, exists, clickElement } from "@/app/m/qr/_lib/test-dom";
import { EtikettenBogen } from "./EtikettenBogen";

/**
 * FUENFTE STELLE DERSELBEN FALLENKLASSE WIE A4/A5/A12 UND T161S VIERTER FUND
 * (`.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/entscheidungen.md`): ein
 * Brief-Testcode, der breiter prueft als die Regel, die er meint.
 *
 * Die beiden Quelltext-Scans unten ("importiert weder … noch …" / "laesst die
 * Seite ohne Icon-Import und ohne antd") lasen im Brief den ROHEN Dateitext.
 * Sowohl `EtikettenBogen.tsx` als auch `page.tsx` erklaeren in ihrem eigenen
 * Begruendungskommentar wortwoertlich, WARUM `lucide-react` und
 * `@ant-design/icons` nicht importiert werden (§6.5.1-Begruendung, Falle 7) —
 * ein roher Scan waere an der eigenen Begruendung ROT, genau wie A4
 * (`layout.tsx:8`, „KEINE Shell").
 *
 * Anders als A5/A12 gibt es hier KEINE bereits vorhandene engere Fassung, an
 * die sich der Fall ersatzlos abgeben liesse:
 *   - `src/core/shell/icons.test.ts` prueft NICHT „kein Import von
 *     `@ant-design/icons`" allgemein, sondern nur „jeder Importeur OHNE `use
 *     client` faellt auf" (`if (traegtClientDirektive(quelle)) continue;`).
 *     `EtikettenBogen.tsx` traegt `"use client"` in Zeile 1 — ein Icon-Import
 *     DORT liesse diesen Scan GRUEN durchlaufen. Er deckt diese Insel also
 *     NICHT ab.
 *   - `_lib/bauform.test.ts:761` schliesst `verwaltung/` ausdruecklich aus
 *     ("`verwaltung/` bleibt bewusst aussen vor: DAS ist der antd-Zweig") und
 *     deckt damit auch das antd-Verbot in DIESER `page.tsx` nicht.
 *   - Einzig `_lib/bauform.test.ts:820-834` (der modulweite `lucide-react`-
 *     Riegel ueber `trefferAuf()`/intern `ohneKommentare`) deckt beide Dateien
 *     tatsaechlich ab — `lucide-react` selbst ist in dieser Suite ohnehin
 *     keine Abhaengigkeit.
 *
 * DAMIT SIND DIE BEIDEN FAELLE UNTEN — anders als bei A5/A12 — NICHT verzichtbar:
 * fuer (a) keinen Icon-Import in dieser Insel und (b) kein antd in dieser
 * `page.tsx` sind sie HEUTE DER EINZIGE RIEGEL IM REPO. Der richtige Hebel ist
 * deshalb NICHT das Loeschen, sondern derselbe wie bei A4: der Scan liest ueber
 * `ohneKommentare(...)` (byte-identische Kopie aus `_lib/bauform.test.ts:98-118`
 * / `(druck)/etiketten/druck.test.ts:78-98`), NICHT ueber den Rohtext. Der
 * Begruendungskommentar in `EtikettenBogen.tsx`/`page.tsx` wird NICHT
 * umformuliert, um den Test gruen zu machen (A4-Prinzip).
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

const ARTIKEL = [
  { id: "V1StGXR8_Z5jdHi6B-myT", name: "Mullbinde 8cm", fach: "A2",
    qr: '<svg viewBox="0 0 45 45"><path d="M0 0h1v1H0z"/></svg>' },
  { id: "aaaaaaaaaaaaaaaaaaaaa", name: "Kompresse 10x10", fach: "B1",
    qr: '<svg viewBox="0 0 45 45"><path d="M1 1h1v1H1z"/></svg>' },
];
const TOKENS = [
  { code: "482-137", label: "RTW 1",
    qr: '<svg viewBox="0 0 45 45"><path d="M2 2h1v1H2z"/></svg>' },
];

afterEach(() => unmount());

describe("EtikettenBogen", () => {
  /**
   * §12.1, PUNKT 7 — DIE ALTE FASSUNG UND IHRE NACHFOLGERIN, namentlich
   * gegeneinander gehalten (§12.3, Regel 3):
   *
   *   ALT:  lagerbuch/e2e/etiketten.spec.ts:11-13
   *         page.locator(".etikett img") — n Zeilen ergeben n <img>, und
   *         `toHaveAttribute("src", /^data:image\/png/)`.
   *   NEU:  n Zeilen ergeben n `.lb-etikettQr > svg`.
   *
   * Der TRAEGER wechselt von <img src="data:…"> auf ein eingesetztes <svg>
   * (§8.4, 8-I). Die Aussage bleibt: „so viele Kacheln wie Datensaetze, jede mit
   * einem Code". Was die alte Fassung NIE geprueft hat — den INHALT des Codes —
   * besitzt jetzt _db/etiketten.test.ts, mit Dekodierung.
   */
  it("rendert je Datensatz genau einen QR-Knoten", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(queryAll(".lb-etikettQr > svg")).toHaveLength(3);
    expect(queryAll(".lb-etikett")).toHaveLength(3);
    // Kein <img> mehr — der alte Anker ist tot und soll es bleiben.
    expect(exists(".lb-etikett img")).toBe(false);
    /**
     * DIE QR↔DATENSATZ-BINDUNG, NICHT NUR DIE KNOTENZAHL (Review-Befund 1,
     * 10.08.2026). Ohne diese Zeile bliebe ein Fehlgriff wie
     * `etikett(k, ARTIKEL[0].qr, …)` fuer ALLE DREI Kacheln unbemerkt gruen —
     * die Knotenzahl stimmt, aber alle drei Etiketten zeigten auf dasselbe
     * Ziel. Auf Papier ist genau das der teure Fall. Ueber das `d`-Attribut
     * des `<path>`, NICHT ueber `innerHTML`: jsdom re-serialisiert
     * `<path .../>` zu `<path ...></path>` und ein Textvergleich daran
     * schiede falsch-rot.
     */
    expect(queryAll(".lb-etikettQr svg path").map((p) => p.getAttribute("d")))
      .toEqual(["M0 0h1v1H0z", "M1 1h1v1H1z", "M2 2h1v1H2z"]);
  });

  it("setzt das SVG unveraendert ein", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(query(".lb-etikettQr").innerHTML).toContain('viewBox="0 0 45 45"');
  });

  it("zeigt Name und Fach beim Artikel, Label und Code beim Token", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    const texte = queryAll(".lb-etikettTitel").map((e) => e.textContent);
    expect(texte).toEqual(["Mullbinde 8cm", "Kompresse 10x10", "RTW 1"]);
    const subs = queryAll(".lb-etikettSub").map((e) => e.textContent);
    expect(subs).toEqual(["A2", "B1", "482-137"]);
  });

  /**
   * DER KLARTEXT-CODE IST EIN EIGENER VERTRAG (§8.1, Form 3): der QR ist
   * host-gebunden, die Zeile darunter ist es NICHT. Ein Domainwechsel kostet
   * dort nur den Komfort — die Helferin tippt 482-137 am Gate ein und ist drin.
   * Deshalb steht der Code als TEXT auf dem Kaertchen und nicht nur im QR.
   */
  it("druckt den Zugangs-Code als Klartext unter den QR", async () => {
    await mount(<EtikettenBogen artikel={[]} tokens={TOKENS} />);
    expect(query(".lb-etikettSub").textContent).toBe("482-137");
  });

  it("waehlt zu Beginn alles aus", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(0);
    expect(query("[data-testid='lb-drucken']").textContent).toContain("(3)");
  });

  it("waehlt eine Kachel ab und wieder an", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    await clickElement(queryAll(".lb-etikettWahl")[0]);
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(1);
    expect(query("[data-testid='lb-drucken']").textContent).toContain("(2)");
    await clickElement(queryAll(".lb-etikettWahl")[0]);
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(0);
  });

  it("schaltet ueber Alle und Keine", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    await clickElement(query("[data-testid='lb-keine']"));
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(3);
    expect(query("[data-testid='lb-drucken']").textContent).toContain("(0)");
    await clickElement(query("[data-testid='lb-alle']"));
    expect(queryAll(".lb-etikettAbgewaehlt")).toHaveLength(0);
  });

  it("ruft window.print", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    await clickElement(query("[data-testid='lb-drucken']"));
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  /** 1:1 aus EtikettenBogen.tsx:27 — Wortlaut unveraendert. */
  it("nennt den leeren Zustand beim Namen", async () => {
    await mount(<EtikettenBogen artikel={[]} tokens={[]} />);
    expect(query(".lb-nichtDrucken").textContent).toBe("Keine aktiven Artikel oder Token.");
    expect(exists(".lb-etikettbogen")).toBe(false);
  });

  /**
   * FALLE 5, DIE KONKRETE BRUCHSTELLE: ein antd-Checkbox rendert hier KEIN
   * nacktes <input> auf der erwarteten Ebene, sondern eine
   * .ant-checkbox-wrapper-Struktur. Die Druckregel liefe ins Leere und die
   * Auswahlkaestchen stuenden MIT auf dem Papier — still, weil es erst am
   * Ausdruck auffaellt (§6.10.2, Punkt 1).
   */
  it("benutzt ein nacktes Kontrollkaestchen, keinen antd-Baustein", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    const kasten = queryAll(".lb-etikettWahl");
    expect(kasten).toHaveLength(3);
    for (const k of kasten) {
      expect(k.tagName).toBe("INPUT");
      expect(k.getAttribute("type")).toBe("checkbox");
      expect(k.className).toContain("lb-nichtDrucken");
      expect(k.closest(".ant-checkbox-wrapper")).toBeNull();
    }
  });

  /**
   * DIE KLASSE SITZT AUF DEM KAESTCHEN, NIE AUF DEM LABEL. Auf dem Label saesse
   * die Druckregel auf dem GANZEN Etikett und druckte ein leeres Blatt (§8.4).
   */
  it("haengt lb-nichtDrucken nicht an die Kachel", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    for (const kachel of queryAll(".lb-etikett")) {
      expect(kachel.className).not.toContain("lb-nichtDrucken");
    }
  });

  it("versteckt die Bedienleiste im Druck", async () => {
    await mount(<EtikettenBogen artikel={ARTIKEL} tokens={TOKENS} />);
    expect(query("[data-testid='lb-drucken']").closest(".lb-nichtDrucken")).not.toBeNull();
  });

  /** §6.5.1 gilt modulweit und ausdruecklich auch fuer Client-Inseln. Die
   *  Datei ERKLAERT im Kommentar, warum `lucide-react` nicht importiert wird —
   *  deshalb ueber `ohneKommentare()` lesen, sonst waere der Scan an seiner
   *  eigenen Begruendung rot (Kopfkommentar dieser Datei). */
  it("importiert weder @ant-design/icons noch lucide-react", () => {
    const quelle = ohneKommentare(readFileSync(join(__dirname, "EtikettenBogen.tsx"), "utf8"));
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });

  /** Falle 7: die Seite daneben ist eine Server Component und darf kein
   *  einziges Icon importieren — auch kein indirekt gezogenes. Dieselbe
   *  Begruendung wie oben: die Datei nennt beide Namen woertlich in ihrem
   *  eigenen Kommentar, deshalb ueber `ohneKommentare()`. */
  it("laesst die Seite ohne Icon-Import und ohne antd", () => {
    const seite = ohneKommentare(readFileSync(join(__dirname, "page.tsx"), "utf8"));
    expect(seite).not.toContain("@ant-design/icons");
    expect(seite).not.toMatch(/from\s+["']antd["']/);
    expect(seite).not.toContain("lucide-react");
  });

  /** Falle 6: die Millimeter stehen NICHT in der Insel. */
  it("haelt keine Millimeterwerte in der Insel", () => {
    const quelle = readFileSync(join(__dirname, "EtikettenBogen.tsx"), "utf8");
    expect(quelle).not.toMatch(/=\s*48\.5\b/);
    expect(quelle).not.toMatch(/=\s*25\.4\b/);
  });
});
