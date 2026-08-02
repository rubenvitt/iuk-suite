// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// Ueber den Alias und nicht relativ — 14 der 15 Harness-Nutzer im Repo tun das,
// und eine Ausnahme kostet beim naechsten Verschieben der Datei eine Suche.
import { mount, query, queryAll, rerender, unmount } from "@/app/m/qr/_lib/test-dom";
import { OeffentlicherRahmen } from "./OeffentlicherRahmen";

/**
 * WAS DIESER TEST BESITZT: der RAHMEN traegt keine Shell, kein antd und keinen
 * App-Switcher (Spec §2.7, letzter Satz). Er behauptet NICHT „die oeffentlichen
 * Routen haben keine Shell" — das ist die Zusage seiner drei Aufrufer
 * (`(oeffentlich-share)/layout.tsx`, `(oeffentlich-inbox)/layout.tsx` und des
 * Rollen-Verteilers `page.tsx` im Zweig `inbox`, alle andere Tasks) und wird
 * end-to-end belegt.
 *
 * Der antd-Teil ist absichtlich ein QUELLTEXT-Scan und keine DOM-Suche nach
 * `.ant-`: ein Compound-Zugriff wie `Typography.Title` in einer Server
 * Component ergibt HTTP 500 (Falle 1) — unter Vitest laeuft er dagegen
 * anstandslos durch, weil dort jedes Modul ein normales ES-Modul ist. Die
 * DOM-Suche kommt dazu, nicht statt.
 */

/*
 * OHNE Kommentare gescannt, und der Grund ist ein selbst gestellter Fallstrick:
 * die Datei ERKLAERT im Kopf, was sie nicht tut („keine `cookies()`, kein
 * `auth()`") — ein Scan ueber den Rohtext faende genau diese Erklaerung und
 * meldete das Gegenteil.
 */
const QUELLE = readFileSync("src/app/m/files/_ui/OeffentlicherRahmen.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

afterEach(async () => {
  await unmount();
});

describe("OeffentlicherRahmen — Quelltext", () => {
  it("importiert nichts aus antd", () => {
    expect(QUELLE).not.toMatch(/from\s+"antd/);
    expect(QUELLE).not.toMatch(/from\s+"@ant-design/);
  });

  it("importiert kein Shell-Element und keinen App-Switcher", () => {
    expect(QUELLE).not.toMatch(/core\/shell/);
    expect(QUELLE).not.toMatch(/\b(Shell|FullShell|MinimalShell|KioskShell|SuiteHeader|Modulnav)\b/);
  });

  /**
   * `files-public.css` ist ein GLOBALES Stylesheet — es kommt nur an, wo es
   * importiert wird. Der Import steht hier und nicht bei den drei Aufrufern,
   * weil sonst jeder von ihnen ihn einzeln mitbringen muesste und der erste, der
   * ihn vergisst, eine unformatierte oeffentliche Seite ausliefert. Ein
   * gestrichener Import ist ein stiller Verlust, den kein anderer Test sieht.
   */
  it("bringt sein Stylesheet selbst mit", () => {
    expect(QUELLE).toMatch(/import "\.\/files-public\.css"/);
  });

  /**
   * Kein `next/headers`, kein `cookies()`, kein `await` — der Rahmen ist ein
   * synchroner Baustein. Nur so ist er ueberhaupt aus einem Test heraus
   * montierbar, und die Rollen-/Cookie-Fragen gehoeren in die Layouts, die ihn
   * benutzen.
   */
  it("liest keinen Request-Zustand", () => {
    expect(QUELLE).not.toMatch(/next\/headers|cookies\(|auth\(/);
  });
});

describe("OeffentlicherRahmen — Baum", () => {
  it("stellt die Kinder in das Blatt", async () => {
    await mount(
      <OeffentlicherRahmen kicker="Dateiabgabe">
        <p data-testid="inhalt">Vier Dateien</p>
      </OeffentlicherRahmen>,
    );
    const inhalt = query('[data-testid="inhalt"]');
    expect(inhalt.closest(".fp-blatt"), "der Inhalt liegt nicht im Blatt").not.toBeNull();
    expect(inhalt.textContent).toBe("Vier Dateien");
  });

  /**
   * ZWEI Werte im selben Test, und der Grund ist gemessen: mit nur einer
   * Zusicherung blieb dieser Test gruen, als `{kicker}` im Rahmen durch das fest
   * verdrahtete Wort „Dateifreigabe" ersetzt wurde — dann traegt die Abgabeseite
   * die Beschriftung der Freigabeseite, und kein Test sagt etwas.
   */
  it("traegt den uebergebenen Kicker und das Wortzeichen DRK", async () => {
    await mount(
      <OeffentlicherRahmen kicker="Dateifreigabe">
        <p>x</p>
      </OeffentlicherRahmen>,
    );
    expect(query(".fp-kicker").textContent).toContain("Dateifreigabe");
    expect(query(".fp-wortzeichen").textContent).toBe("DRK");

    await rerender(
      <OeffentlicherRahmen kicker="Dateiabgabe">
        <p>x</p>
      </OeffentlicherRahmen>,
    );
    expect(query(".fp-kicker").textContent).toContain("Dateiabgabe");
    expect(query(".fp-kicker").textContent).not.toContain("Dateifreigabe");
  });

  /**
   * Die 3px-Fahne ist reine Marke, kein Inhalt — ohne `aria-hidden` liest ein
   * Screenreader einen leeren Bereich vor.
   */
  it("blendet die Fahne fuer Screenreader aus", async () => {
    await mount(
      <OeffentlicherRahmen kicker="Dateiabgabe">
        <p>x</p>
      </OeffentlicherRahmen>,
    );
    expect(query(".fp-fahne").getAttribute("aria-hidden")).toBe("true");
  });

  it("rendert keine antd-Klasse, keine Navigation und keinen Modulwechsel", async () => {
    await mount(
      <OeffentlicherRahmen kicker="Dateiabgabe">
        <p>x</p>
      </OeffentlicherRahmen>,
    );
    const alle = queryAll("*");
    expect(alle.filter((el) => /(^|\s)ant-/.test(el.className || ""))).toEqual([]);
    expect(queryAll("nav")).toEqual([]);
    // Ein App-Switcher waere ein Link auf ein anderes Modul — auf einer
    // anonymen oeffentlichen Seite eine Sackgasse hinter dem Login.
    expect(queryAll('a[href^="/m/"]')).toEqual([]);
  });
});
