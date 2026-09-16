import { expect, test, type Locator, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  E2E_ZELLENTEXT_ARTIKEL,
  E2E_ZELLENTEXT_KOMMENTAR,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-372 — die Freitextspalte ist auf eine Lesebreite gedeckelt.
 *
 * WARUM NUR EIN ECHTER BROWSER DAS SEHEN KANN: die Zahl entsteht aus Layout,
 * und Vitest hat keins. jsdom rechnet keine Layoutboxen
 * (`getBoundingClientRect()` liefert überall Nullen) und wertet weder `ch` noch
 * `max-width` noch `-webkit-line-clamp` aus — ein Unit-Test dagegen wäre
 * lautlos blind (CLAUDE.md, Fallen 13 und 14). `typecheck` kennt keine
 * Spaltenbreiten, `build` serialisiert die Komponente klaglos. Was Vitest
 * prüfen KANN, prüft `core/tabelle/Zellentext.test.tsx`: was im Baum steht.
 * Was hier steht, ist die Wirkung.
 *
 * ⚠️ GEGRIFFEN WIRD ÜBER `[data-row-key]`, NICHT ÜBER `tbody tr` (Falle 14):
 * `core/tabelle` virtualisiert ab 150 Zeilen, und dann rendert rc-table die
 * Zeilen als `div`. Das Journal lädt in 100er-Portionen nach — die Schwelle ist
 * im gewachsenen Bestand erreichbar, im Seed nicht, und ein Greifer, der erst
 * dort umkippt, bliebe hier grün.
 */

/** Die Vorgangsspalte trägt den Kommentar der Buchung (`typText · …`). */
function zelle(page: Page): Locator {
  return page.locator("[data-row-key='e2e-zellentext-buchung'] [data-zellentext]");
}

async function journal(page: Page): Promise<void> {
  const antwort = await page.goto(
    lagerbuchUrl(`/verwaltung/journal?q=${encodeURIComponent(E2E_ZELLENTEXT_ARTIKEL)}`),
  );
  // ⚠️ DIE ANTWORT WIRD GEPRÜFT, NICHT NUR DIE SPÄTERE ANZEIGE (zweite
  // Testregel aus Falle 10). Ein HTTP 500 aus einer verrutschten Direktive
  // liefert eine Seite OHNE Tabelle, und die Messung unten meldete das als
  // „Element nicht gefunden" — also als Anzeigefehler.
  expect(antwort?.status(), "Journal: HTTP").toBe(200);
  await page.waitForLoadState("networkidle");
}

test.describe("lagerbuch — Freitext in der Tabelle ist gedeckelt (DRK-372)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("die Zelle ist schmaler als ihr Satz — und der Satz steht trotzdem ganz da", async ({ page }) => {
    await journal(page);

    const freitext = zelle(page);
    await expect(freitext).toHaveCount(1);

    /*
     * ⚠️ DER NACHWEIS ZUERST. Gedeckelt wird die ANZEIGE, nie der Nachweis —
     * fiele diese Zusicherung weg, könnte jede spätere Verschärfung des Deckels
     * still Text wegnehmen, und genau das verbietet das Ticket.
     */
    await expect(freitext).toHaveText(new RegExp(`${E2E_ZELLENTEXT_KOMMENTAR}$`));

    /*
     * DIE MESSUNG. Verglichen wird gegen die Breite, die DERSELBE Satz in
     * DERSELBEN Schrift ohne Umbruch bräuchte — nicht gegen eine Pixelzahl aus
     * dem Kopf. Eine feste Zahl hier hinge an Schriftgröße, Zellpolsterung und
     * Zoomstufe und wäre bei der nächsten Themeänderung falsch, ohne dass
     * jemand den Zusammenhang sieht.
     */
    const gemessen = await freitext.evaluate((knoten) => {
      const stil = getComputedStyle(knoten);
      const probe = document.createElement("span");
      probe.style.font = stil.font;
      probe.style.letterSpacing = stil.letterSpacing;
      probe.style.whiteSpace = "nowrap";
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.textContent = knoten.textContent;
      document.body.appendChild(probe);
      const ohneUmbruch = probe.getBoundingClientRect().width;
      probe.remove();
      return {
        breite: knoten.getBoundingClientRect().width,
        hoehe: knoten.getBoundingClientRect().height,
        ohneUmbruch,
        zeilenhoehe: parseFloat(stil.lineHeight),
      };
    });

    // Der ungebrochene Satz ist ein Vielfaches der Zelle — sonst misst der Test
    // nichts, weil er ohne Deckel genauso ausginge.
    expect(gemessen.ohneUmbruch, "der Satz ohne Umbruch").toBeGreaterThan(gemessen.breite * 2);
    /*
     * Die zweite Schranke ist ein Geländer, keine Zusage über die genaue Zahl:
     * `40ch` sind gemessene 356px bei 14px, und eine breitere Schrift schiebt
     * das nach oben. 480px trennt trotzdem sicher zwischen „gedeckelt" und „so
     * breit wie der Satz" — derselbe Satz ohne Umbruch maß 1482px.
     */
    expect(gemessen.breite, "die Breite der Freitextzelle").toBeLessThan(480);

    /*
     * ⚠️ GEDECKELT WIRD DIE BREITE, NICHT DIE HÖHE — auf einer Nachweisfläche
     * wie dem Journal gibt es keine Detailseite je Buchung, auf die man den
     * Rest verweisen könnte. Mehr als eine Zeile heißt: der Satz ist umgebrochen
     * und vollständig zu LESEN, nicht abgeschnitten.
     */
    expect(gemessen.hoehe, "die Höhe der Freitextzelle").toBeGreaterThan(gemessen.zeilenhoehe * 1.5);
    await expect(freitext).not.toHaveAttribute("data-gekuerzt", "");
  });

  test("`max-width` allein täte an einem Inline-Element nichts — deshalb bringt `Zellentext` sein `display` mit", async ({ page }) => {
    await journal(page);

    /*
     * ⚠️ DIESE PROBE PRÜFT DEN BROWSER, NICHT DIE SUITE, und sie steht hier mit
     * Absicht: auf ihr beruht die halbe Änderung. `files` deckelte seinen
     * Hinweis jahrelang mit `max-width: 32ch` an einem nackten `<span>` — die
     * Deklaration stand richtig da, und der Browser verwarf sie, weil
     * `max-width` nicht für nicht-ersetzte Inline-Elemente gilt (CSS 2.1
     * §10.4). In der Karte, wo dieselbe Klasse an einem `<p>` hängt, wirkte
     * sie; in der Tabelle nie. Ein stiller Fehlschlag dieser Art kommt wieder,
     * sobald jemand `display` aus `zellentext.module.css` für überflüssig hält.
     */
    const probe = await page.evaluate(() => {
      const bauen = (anzeige: string) => {
        const knoten = document.createElement("span");
        knoten.style.display = anzeige;
        knoten.style.maxWidth = "40ch";
        knoten.style.position = "absolute";
        knoten.style.visibility = "hidden";
        knoten.textContent = "x ".repeat(400);
        document.body.appendChild(knoten);
        const breite = knoten.getBoundingClientRect().width;
        knoten.remove();
        return breite;
      };
      return { inline: bauen("inline"), kasten: bauen("inline-block") };
    });

    expect(probe.kasten, "inline-block gehorcht max-width").toBeLessThan(480);
    expect(probe.inline, "inline ignoriert max-width").toBeGreaterThan(probe.kasten * 1.5);
  });
});
