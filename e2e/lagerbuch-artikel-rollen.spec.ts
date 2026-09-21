import { expect, test, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  E2E_LAST_ANZAHL,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-336 — eine virtualisierte Tabelle IST wieder eine Tabelle.
 *
 * ⚠️ WARUM DIESE AUSSAGE NUR HIER ENTSTEHEN KANN. `typecheck` und `build`
 * prüfen Typen und Modulgrenzen, keine Rollen. Vitest kann es STRUKTURELL
 * nicht: eine virtualisierte Tabelle rendert in jsdom überhaupt keine Zeile,
 * weil rc-virtual-list ohne Layoutboxen auf null sichtbare Einträge kommt
 * (CLAUDE.md, Falle 14) — ein `mount()` misste nichts und risse dabei nicht.
 * Was `src/core/tabelle/rollen.test.ts` prüfen kann, ist die ENTSCHEIDUNG;
 * dass sie im Baum ankommt, steht allein hier.
 *
 * ⚠️ UND NOCH ETWAS KANN NUR EIN ECHTER BROWSER: der Barrierefreiheitsbaum.
 * Playwrights `getByRole` rechnet die Rolle JE ELEMENT aus und kennt keine
 * Besitzverhältnisse — eine Zeile mit `role="row"`, die unter gar keiner
 * Tabelle hängt, fände er genauso. Genau das ist die halbe Kette, vor der das
 * Ticket warnt, und sie wäre hier mühelos grün. Der zweite Fall unten liest
 * deshalb über CDP den Baum, den Chromium tatsächlich an Hilfstechnik gibt.
 */

/** Der Scrollcontainer, den rc-virtual-list anlegt — und der die Rolle trägt. */
const KOERPER = ".ant-table-tbody-virtual-holder";

const TABELLENNAME = "Artikel und Bestand";

async function artikelseite(page: Page): Promise<void> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  expect(antwort?.status(), "/verwaltung/artikel: HTTP").toBe(200);
  await expect(page.getByTestId("lb-excel")).toBeVisible();
  await page.waitForLoadState("networkidle");

  // ⚠️ DIE VORBEDINGUNG, OHNE DIE ALLES DARUNTER NICHTS AUSSAGT: unterhalb von
  // 150 Zeilen virtualisiert `core/tabelle` gar nicht, die Tabelle ist dann
  // eine gewöhnliche `<table>` — und JEDE Zusicherung dieses Tests wäre grün,
  // ohne je das Verhalten zu berühren, um das es geht.
  await expect(
    page.locator(KOERPER),
    `Die Tabelle virtualisiert nicht — dieser Test prüft dann nichts. `
    + `Seed: ${E2E_LAST_ANZAHL} Lastartikel.`,
  ).toHaveCount(1);
}

test.describe("Tabellen-Semantik der virtualisierten Artikeltabelle (DRK-336)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/artikel",
    });
  });

  test("Zeilen und Zellen tragen wieder ihre Rolle", async ({ page }) => {
    await artikelseite(page);

    const koerper = page.locator(KOERPER);
    await expect(koerper).toHaveAttribute("role", "table");

    // ⚠️ DER NAME STEHT AM KÖRPER, NICHT AM KOPF. antd hängt `aria-*` an die
    // Tabelle der KOPFZEILE (`InternalTable.js`, `HeaderTable`) — bei fixem
    // Kopf also an ein Element ohne eine einzige Datenzeile. `Datentabelle`
    // nimmt ihn dort weg und setzt ihn hierher; stünde er an beiden, träfe
    // eine Vorleseanwendung zwei gleich benannte Tabellen nebeneinander.
    await expect(koerper).toHaveAttribute("aria-label", TABELLENNAME);
    /*
     * ⚠️ ÜBER DIE ROLLE, NICHT ÜBER DIE BESCHRIFTUNG (DRK-451). Die Aussage ist
     * unverändert — „eine Vorleseanwendung trifft GENAU EINE so benannte
     * Tabelle" —, aber der Greifer musste wechseln: seit die Artikelliste eine
     * `Kartentabelle` ist, trägt auch die Kartenliste daneben denselben Namen.
     * Das ist richtig so (ohne ihn hätte die schmale Darstellung gar keinen),
     * und es ist ungefährlich, weil immer nur eine der beiden im
     * Zugänglichkeitsbaum steht — die andere ist `display: none`.
     *
     * ⚠️ NUR SIEHT `getByLabel` DAS NICHT. Gemessen im echten Chromium an einer
     * Seite mit einem verborgenen und einem sichtbaren Knoten desselben Namens:
     *
     *     getByLabel("…")                  2 Treffer   ← zählt Verborgenes mit
     *     getByRole("table", { name })     1 Treffer   ← löst über den Baum auf
     *
     * `getByLabel` hätte hier also ab sofort 2 gemeldet und damit die Umstellung
     * als Regression ausgewiesen, obwohl kein Mensch je zwei Tabellen hört.
     */
    await expect(page.getByRole("table", { name: TABELLENNAME })).toHaveCount(1);

    // Die Gesamtzahl der Liste — nicht die Zahl der Knoten im Baum. Das ist der
    // ganze Zweck von `aria-rowcount`.
    const gesamt = Number(await koerper.getAttribute("aria-rowcount"));
    const imBaum = await page.locator(`${KOERPER} [data-row-key]`).count();
    expect(gesamt).toBeGreaterThanOrEqual(E2E_LAST_ANZAHL);
    expect(
      imBaum,
      "Es stehen so viele Zeilen im Baum wie in der Liste — dann virtualisiert "
      + "die Tabelle nicht, und `aria-rowcount` wäre eine Selbstverständlichkeit.",
    ).toBeLessThan(gesamt);

    // Jede Zeile im Baum ist eine Zeile — und sagt, die WIEVIELTE sie ist.
    const zeilen = page.locator(`${KOERPER} [data-row-key]`);
    for (const zeile of await zeilen.all()) {
      await expect(zeile).toHaveAttribute("role", "row");
      const index = Number(await zeile.getAttribute("aria-rowindex"));
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(gesamt);
    }

    // Die erste sichtbare Zeile ist die erste der Liste, nicht „irgendeine".
    await expect(zeilen.first()).toHaveAttribute("aria-rowindex", "1");

    const zellen = zeilen.first().locator('[role="cell"]');
    expect(await zellen.count(), "Die erste Zeile hat keine Zellen.").toBeGreaterThan(1);

    // Die Gegenprobe zum gemeldeten Befund: `getByRole("row")` lieferte 1 (nur
    // die Kopfzeile in ihrer eigenen `<table>`).
    expect(
      await page.getByRole("row").count(),
      "Nur die Kopfzeile trägt eine Rolle — der Körper ist wieder ein Haufen Kästen.",
    ).toBeGreaterThan(1);
  });

  test("der Barrierefreiheitsbaum führt die Zeilen unter der Tabelle", async ({ page }) => {
    await artikelseite(page);

    /**
     * ⚠️ EINE HALBE KETTE IST FÜR EINE VORLESEANWENDUNG NICHT BESSER ALS GAR
     * KEINE, und genau sie wäre im Test oben unsichtbar: zwischen dem Körper
     * und den Zeilen liegen zwei reine Layoutkästen von rc-virtual-list
     * (`Filler.js` — ein äußerer mit der Gesamthöhe, ein innerer mit dem
     * Versatz). Ob Chromium die Zeilen TROTZDEM als Zeilen DIESER Tabelle
     * führt, sagt kein Attribut — das sagt nur der Baum selbst.
     */
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree") as {
      nodes: Array<{
        nodeId: string;
        parentId?: string;
        ignored?: boolean;
        role?: { value?: string };
        name?: { value?: string };
        properties?: Array<{ name: string; value: { value?: unknown } }>;
      }>;
    };
    await cdp.detach();

    const nachId = new Map(nodes.map((k) => [k.nodeId, k]));
    const rolle = (k?: { role?: { value?: string } }) => k?.role?.value;

    const tabelle = nodes.find(
      (k) => !k.ignored && rolle(k) === "table" && k.name?.value === TABELLENNAME,
    );
    expect(
      tabelle,
      `Chromium führt kein Element mit der Rolle „table" und dem Namen `
      + `„${TABELLENNAME}" — der Körper kommt im Baum nicht als Tabelle an.`,
    ).toBeDefined();

    const stehtUnterDerTabelle = (k: typeof nodes[number]) => {
      let lauf = k.parentId ? nachId.get(k.parentId) : undefined;
      while (lauf) {
        if (lauf.nodeId === tabelle!.nodeId) return true;
        lauf = lauf.parentId ? nachId.get(lauf.parentId) : undefined;
      }
      return false;
    };

    const zeilen = nodes.filter((k) => !k.ignored && rolle(k) === "row");
    const eigene = zeilen.filter(stehtUnterDerTabelle);
    expect(
      eigene.length,
      "Im Baum hängt keine einzige Zeile unter dieser Tabelle — die Kette ist "
      + "durch die Layoutkästen von rc-virtual-list unterbrochen.",
    ).toBeGreaterThan(1);

    // Und die Zellen hängen unter den Zeilen, nicht daneben.
    const zellen = nodes.filter((k) => !k.ignored && rolle(k) === "cell");
    expect(
      zellen.filter(stehtUnterDerTabelle).length,
      "Im Baum steht keine Zelle unter dieser Tabelle.",
    ).toBeGreaterThan(1);

    /**
     * ⚠️ WAS DIESER FALL NICHT BEWEIST, GEHÖRT DAZU. Gemessen steht zwischen
     * dem Tabellenknoten und den Zeilen noch ein `generic` — die beiden
     * Layoutkästen aus `Filler.js` verschwinden also NICHT aus dem Baum,
     * Chromium führt die Zeilen trotzdem darunter. Ob es daraus auch Zeilen-
     * und Spaltennummern für die Betriebssystem-Schnittstelle rechnet, ist von
     * hier aus nicht zu sehen: `Accessibility.getFullAXTree` kennt dafür keine
     * Eigenschaft — der Tabellenknoten kommt mit `properties: []` heraus. Die
     * letzte Meile bleibt eine Prüfung mit einer echten Vorleseanwendung.
     */

    // ⚠️ DIE ZAHL, DIE DIE VIRTUALISIERUNG ÜBERHAUPT ERST ERTRÄGLICH MACHT,
    // steht im Baum NEBEN den Zeilen, nicht in ihnen: im Baum liegt nur das
    // Sichtfenster, die Gesamtzahl trägt `aria-rowcount`. Genau dieses
    // Verhältnis wird hier festgehalten.
    const gesamt = Number(
      await page.locator(KOERPER).getAttribute("aria-rowcount"),
    );
    expect(gesamt).toBeGreaterThanOrEqual(E2E_LAST_ANZAHL);
    expect(
      eigene.length,
      "Im Baum stehen so viele Zeilen wie in der Liste — dann virtualisiert die "
      + "Tabelle nicht, und dieser Fall prüft nicht, was er behauptet.",
    ).toBeLessThan(gesamt);
  });
});
