import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-338 — DAS UMLAGERN ZWISCHEN ZWEI SCHRAENKEN, AM STUECK, IM ECHTEN BROWSER.
 *
 * WAS KEIN ANDERES TOR SIEHT — und das ist der Grund, warum es diese Datei
 * gibt, obwohl Action und Insel je eigene Tests haben:
 *
 *  1. Der tatsaechliche Server-Action-Rundlauf von `bucheUmlagerung`. Der
 *     Unit-Test ruft die Funktion direkt; hier geht sie durch Serialisierung,
 *     Riegel und Transaktion.
 *  2. Die RSC-Grenze der JOURNALSEITE mit ihrer neuen Ortsspalte. `page.tsx`
 *     ist eine Server Component, `JournalTable` eine Client-Insel — und die
 *     Fallen 1/6/7/9 zeigen sich ausschliesslich in einem echten Abruf. In
 *     Vitest ist `"use client"` eine wirkungslose Zeichenkette.
 *  3. Dass BEIDE Legs mit dem RICHTIGEN Ort im Journal ankommen. Das ist die
 *     eigentliche Zusage von AK 3 und haengt an drei Schichten zugleich
 *     (Schreibpfad, Lesepfad, Spalte).
 *
 * ⚠️ EIGENE SCHRAENKE **UND** EIGENER ARTIKEL, alles selbst angelegt — dieselbe
 * Regel wie in `lagerbuch-schraenke.spec.ts`: alle Specs teilen EINE Datenbank,
 * und jeder seedbare Artikel traegt die Ausschliesslichkeits-Klausel eines
 * anderen Flows.
 *
 * ⚠️ DER VERSUCHSZAEHLER STEHT IN JEDEM NAMEN. CI faehrt `retries: 2` gegen
 * DIESELBE Datenbank (`workers: 1`); ohne ihn legte der zweite Versuch einen
 * zweiten Schrank desselben Namens an, und der textbasierte Greifer traefe zwei
 * Zeilen — ein Strict-Mode-Fehler, dessen Meldung nicht auf die Ursache zeigt.
 *
 * ⚠️ ZEILENGREIFER IST `[data-row-key]` (Falle 14), nie `tbody tr` und nie
 * `getByRole("row")`: `core/tabelle` virtualisiert ab 150 Zeilen, und dort
 * rendert rc-table die Zeilen als `div` ohne `role="row"`.
 *
 * ⚠️ KLICKS UEBER `klickeWennRuhig` (Falle 12): die Huelle bricht nach einem
 * frischen `page.goto` noch um, wenn `SessionProvider` seine Sitzung nachholt.
 *
 * ⚠️ JEDE AUSLOESENDE AKTION PRUEFT IHRE ANTWORT (Falle 10, zweite Testregel).
 * Eine abgewiesene Server Action liefe sonst still ins Zeitbudget und meldete
 * sich als „Zeile erscheint nicht".
 */

function serverActionAntwort(page: Page) {
  // ⚠️ NICHT an der Aufrufstelle `await`-en: das Lauschen beginnt sofort, der
  // ausloesende Klick kommt erst danach.
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 60_000 },
  );
}

/** Ein Auswahlfeld im offenen Drawer setzen. */
async function waehle(page: Page, feld: string, eintrag: string): Promise<void> {
  await klickeWennRuhig(page.getByRole("combobox", { name: feld, exact: true }));
  await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
    .locator(".ant-select-item-option", { hasText: eintrag })
    .first()
    .click();
}

test.describe("Lagerbuch Umlagern — Schrank zu Schrank (DRK-338)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("eine Charge wandert von Schrank zu Schrank — Verteilung und Journal folgen", async ({
    page,
  }) => {
    const versuch = test.info().retry;
    const quelle = `E2E Umlager-Quelle Versuch ${versuch}`;
    const ziel = `E2E Umlager-Ziel Versuch ${versuch}`;
    const artikelName = `E2E Umlager-Artikel Versuch ${versuch}`;
    const einheit = "Stk.";
    const chargenNr = `E2E-UMLAGER-${versuch}`;
    const zugang = 9;
    const umlagert = 4;
    // Weit ausserhalb jeder Warnschwelle, aber NICHT der Sentinel „2099-12"
    // (der meint „kein Verfall" und naehme einen anderen Zweig).
    const verfallsmonat = "2090-06";

    // ── 1) Zwei Schraenke anlegen ─────────────────────────────────────────
    const lagerorteSeite = await page.goto(lagerbuchUrl("/verwaltung/lagerorte"));
    expect(lagerorteSeite?.status(), "/verwaltung/lagerorte: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    for (const name of [quelle, ziel]) {
      await klickeWennRuhig(page.getByRole("button", { name: "Neuer Schrank" }));
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(name);
      const antwort = serverActionAntwort(page);
      await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
      expect((await antwort).ok(), `Schrank „${name}" anlegen: Server Action`).toBe(true);
      await expect(
        page.locator("[data-row-key]").filter({ hasText: name }),
        `„${name}" muss in der Lagerorte-Liste stehen`,
      ).toHaveCount(1);
    }

    // ── 2) Eigenen Artikel anlegen ────────────────────────────────────────
    const artikelSeite = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(artikelSeite?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    await klickeWennRuhig(page.getByRole("button", { name: "Neuer Artikel" }));
    const artikelDialog = page.getByRole("dialog");
    await artikelDialog.getByLabel("Name").fill(artikelName);
    await artikelDialog.getByLabel("Fach").fill("E2E-U");
    await artikelDialog.getByLabel("Einheit").fill(einheit);
    const artikelAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
    expect((await artikelAntwort).ok(), "Artikel anlegen: Server Action").toBe(true);

    // Ueber die Suche finden, NIE ueber Bildlauf: die Artikeltabelle
    // virtualisiert (Falle 14), ein frischer Artikel landet alphabetisch
    // moeglicherweise ausserhalb des zuerst gerenderten Fensters.
    await page.getByRole("searchbox").fill(artikelName);
    const artikelKnopf = page.getByRole("button", { name: artikelName, exact: true });
    await expect(artikelKnopf).toBeVisible();
    await klickeWennRuhig(artikelKnopf);

    // ── 3) Zugang in den QUELL-Schrank ────────────────────────────────────
    const zugangForm = page.locator('form[data-rolle="zugang-form"]');
    await expect(zugangForm).toBeVisible();
    await zugangForm.getByLabel("Zugangsmenge").fill(String(zugang));
    await zugangForm.getByLabel("Chargennummer").fill(chargenNr);
    await waehle(page, "Wohin", quelle);

    const verfallFeld = zugangForm.getByLabel("Verfallsmonat");
    await verfallFeld.click();
    await verfallFeld.fill(verfallsmonat);
    // ⛔ KEIN `Enter`: es schickt das Formular ab (DRK-415, Begruendung in
    // `lagerbuch-schraenke.spec.ts`). Panel per Klick auf eine inerte Ueberschrift
    // schliessen, NICHT per `Escape` (bei antds Picker ein ABBRUCH).
    await page.getByRole("heading", { name: "Zugang buchen" }).click();
    await expect(verfallFeld).toHaveValue(verfallsmonat);

    const zugangAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Zugang buchen" }));
    expect((await zugangAntwort).ok(), "Zugang buchen: Server Action").toBe(true);

    const chargenTabelle = page.getByRole("table", { name: "Chargen" });
    const chargeZeile = chargenTabelle.locator("[data-row-key]").filter({ hasText: chargenNr });
    await expect(chargeZeile).toContainText(`${quelle}: ${zugang} ${einheit}`);

    // ── 4) Umlagern ───────────────────────────────────────────────────────
    const umlagerForm = page.locator('form[data-rolle="umlager-form"]');
    await expect(umlagerForm).toBeVisible();
    await waehle(page, "Umlagerung Charge", chargenNr);
    // ⚠️ ERST NACH DER CHARGE: „Von" ist bis dahin gesperrt, und es fuehrt
    // ausschliesslich die Orte, an denen DIESE Charge liegt.
    await waehle(page, "Von", quelle);
    await waehle(page, "Nach", ziel);
    await umlagerForm.getByLabel("Umlagerungsmenge").fill(String(umlagert));

    const umlagerAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Umlagern", exact: true }));
    expect((await umlagerAntwort).ok(), "Umlagern: Server Action").toBe(true);

    // ── 5) Die Verteilung zeigt BEIDE Orte, die Summe ist unveraendert ────
    // ⚠️ DIE SUMME IST DIE ZUSAGE AUS AK 2, nicht nur das Auftauchen des
    // zweiten Orts: 5 + 4 = 9, und `Rest gesamt` steht daneben.
    await expect(chargeZeile).toContainText(`${quelle}: ${zugang - umlagert} ${einheit}`);
    await expect(chargeZeile).toContainText(`${ziel}: ${umlagert} ${einheit}`);
    await expect(chargeZeile).toContainText(`${zugang} ${einheit}`);

    // ── 6) Das Journal nennt Quell- und Zielort ───────────────────────────
    const journalSeite = await page.goto(
      lagerbuchUrl(`/verwaltung/journal?q=${encodeURIComponent(artikelName)}&typ=umlagerung`),
    );
    expect(journalSeite?.status(), "/verwaltung/journal: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    // Dass „Ort" die VIERTE Spalte ist, wird hier eigens zugesichert — sonst
    // verschoebe ein Spaltentausch den Index unten still.
    await expect(page.getByRole("table", { name: "Buchungsjournal" })
      .locator("thead th").nth(3)).toHaveText("Ort");

    const zeilen = page.locator("[data-row-key]");
    await expect(zeilen, "genau die beiden Legs der Umlagerung").toHaveCount(2);
    const orte = await zeilen.locator("td:nth-child(4)").allInnerTexts();
    expect(orte.sort()).toEqual([quelle, ziel].sort());

    // Und die beiden Legs tragen entgegengesetzte Vorzeichen — ohne das waere
    // „zwei Zeilen mit zwei Orten" auch bei zwei Zugaengen wahr.
    const mengen = await zeilen.locator("td:nth-child(5)").allInnerTexts();
    expect(mengen.map((text) => text.trim()).sort())
      .toEqual([`+${umlagert}`, `-${umlagert}`].sort());
  });
});
