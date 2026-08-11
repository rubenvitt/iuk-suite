// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mount, unmount, query, exists, clickElement } from "@/app/m/qr/_lib/test-dom";
import Fehlergrenze from "./error";
import { FEHLER_TITEL, FEHLER_ERNEUT, FEHLER_ZURUECK } from "./_lib/zustandTexte";

afterEach(() => unmount());

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts`, byte-identisch mit
 * dem Vorbild in `_lib/pwaIcons.test.ts:19-39`. Noetig, weil `error.tsx` in
 * ihrem eigenen Kopfkommentar woertlich erklaert, warum sie KEIN
 * `@ant-design/icons` importiert — ein Rohtext-Scan waere sonst auf seiner
 * eigenen Begruendung rot. `bauform.test.ts` exportiert die Funktion nicht,
 * und diese Datei ist ein anderer Testkoerper, deshalb die lokale Kopie statt
 * eines Re-Exports.
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

describe("error.tsx — die Modul-Fehlergrenze (§11.2, §12.2)", () => {
  it("rendert den Text ohne Technik", async () => {
    await mount(<Fehlergrenze error={new Error("boom")} reset={() => {}} />);
    expect(document.body.textContent).toContain(FEHLER_TITEL);
    // Der geworfene Text erscheint NIRGENDS: in Produktion waere er ohnehin der
    // englische Satz des Deserialisierers ueber eine „server-side exception"
    // (Falle 66) — die 22 sorgfaeltig formulierten deutschen Meldungen sind
    // fachlich richtig und betrieblich wirkungslos (§11.2 d).
    expect(document.body.textContent).not.toContain("boom");
  });

  it("bietet Erneut versuchen und ruft reset", async () => {
    const reset = vi.fn();
    await mount(<Fehlergrenze error={new Error("boom")} reset={reset} />);
    await clickElement(query("[data-testid='lb-fehler-erneut']"));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(query("[data-testid='lb-fehler-erneut']").textContent).toBe(FEHLER_ERNEUT);
  });

  /**
   * §11.7: JEDER gestaltete Zustand traegt einen benannten Weg zurueck. `/` und
   * NICHT der Suite-Host: unter dem Host-Rewrite fuehrt der relative Pfad an den
   * Anfang GENAU DES Moduls, auf dem man gerade steht — und der ist das Gate
   * (Entscheidung 15, §3.6.6). Ein absoluter Link koennte das nicht zugleich.
   */
  it("fuehrt relativ zurueck an den Modulanfang", async () => {
    await mount(<Fehlergrenze error={new Error("boom")} reset={() => {}} />);
    const weg = query("[data-testid='lb-fehler-zurueck']");
    expect(weg.getAttribute("href")).toBe("/");
    expect(weg.textContent).toBe(FEHLER_ZURUECK);
  });

  it("zeigt keinen Stack und keine digest-Kennung", async () => {
    const e = Object.assign(new Error("boom"), { digest: "1234567890" });
    await mount(<Fehlergrenze error={e} reset={() => {}} />);
    expect(document.body.textContent).not.toContain("1234567890");
    expect(exists("pre")).toBe(false);
  });

  /**
   * FALLE 7 — und sie ist hier besonders naheliegend: ein Warndreieck in einer
   * Fehlergrenze ist genau die Stelle, an der man reflexhaft ein Icon
   * importiert. Der Fehler entstuende BEIM IMPORT, nicht beim Rendern, und
   * "use client" behebt ihn nicht, es macht ihn still (HTTP 200 mit leerer Map
   * und still falschem Icon). `next/dynamic` mit `ssr:false` ist keine Abhilfe.
   */
  it("importiert kein Icon-Paket", () => {
    // ohneKommentare(): die Datei erklaert in ihrem eigenen Kopfkommentar
    // woertlich, warum sie das NICHT tut — ein Rohtext-Scan traefe genau
    // diesen Satz.
    const quelle = ohneKommentare(readFileSync(join(__dirname, "error.tsx"), "utf8"));
    expect(quelle).not.toContain("@ant-design/icons");
    expect(quelle).not.toContain("lucide-react");
  });

  /**
   * DIE ANMUTUNGSENTSCHEIDUNG (J7): kein antd. Die Grenze faengt BEIDE Aeste des
   * Moduls — den bewusst antd-freien Helfer-Weg (Entscheidung 28, §7.1) und die
   * antd-Verwaltung (§6). antd hier zoege die Verwaltungsanmutung in den
   * Helfer-Zweig; verwaltung.module.css zoege zusaetzlich --lb-* dorthin.
   * Vorbild ist src/app/not-found.tsx: eigenes Markup, eigene Modul-CSS-Datei,
   * eigene --xx-*-Variablen (dort --nf-*).
   */
  it("benutzt kein antd", () => {
    const quelle = ohneKommentare(readFileSync(join(__dirname, "error.tsx"), "utf8"));
    expect(quelle).not.toMatch(/from\s+["']antd["']/);
  });

  /** Next verlangt "use client" fuer jede Fehlergrenze, und `reset` ist eine
   *  Prop, die nur ein Client-Modul annehmen kann. */
  it("traegt use client in Zeile 1", () => {
    const erste = readFileSync(join(__dirname, "error.tsx"), "utf8").split("\n")[0].trim();
    expect(erste).toMatch(/^["']use client["'];?$/);
  });

  /**
   * ENTSCHEIDUNG 36 (b) IST VERWORFEN: es gibt KEINE m/lagerbuch/not-found.tsx.
   * Die verbleibenden notFound()-Wuerfe sind Riegel, und fuer die ist die
   * Suite-404 die richtige und bereits gehaertete Form — ihr zweiter Absatz ist
   * woertlich fuer den Fall „darfst du nicht sehen" geschrieben.
   */
  it("legt weder not-found.tsx noch loading.tsx noch global-error.tsx an", () => {
    const eintraege = readdirSync(__dirname);
    expect(eintraege).not.toContain("not-found.tsx");
    expect(eintraege).not.toContain("loading.tsx");
    expect(eintraege).not.toContain("global-error.tsx");
  });
});
