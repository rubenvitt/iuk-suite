import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DIE ENTNAHMEBOX, AM STUECK, IM ECHTEN BROWSER — DRK-314.
 *
 * WAS KEIN ANDERES TOR SIEHT, und das ist der Grund, warum es diese Datei gibt,
 * obwohl Action, Lesepfad und beide Inseln je eigene Tests haben:
 *
 *  1. DASS DIE BEIDEN SEITEN UEBERHAUPT ANTWORTEN. `verwaltung/entnahmebox` ist
 *     eine Server Component mit einer Tabelleninsel, `helfer/box` eine ohne
 *     antd — die Fallen 1, 6, 7, 9 und 17 zeigen sich AUSSCHLIESSLICH in einem
 *     echten Abruf. In Vitest ist `"use client"` eine wirkungslose Zeichenkette,
 *     und es gibt dort keine RSC-Grenze.
 *  2. DER ECHTE SERVER-ACTION-RUNDLAUF von `bucheInEntnahmebox`. Der Unit-Test
 *     ruft die Funktion direkt; hier geht sie durch Serialisierung, Riegel und
 *     Transaktion — UND ueber BEIDE Flaechen, die sich dieselbe Action teilen.
 *     Dass der Konto-Zweig von `requireHelferSchreibend` eine
 *     Verwaltungsbuchung traegt, ist eine Aussage ueber die Laufzeit.
 *  3. DER VORGANG ALS GANZES: es verschwindet aus der Einheit UND es erscheint
 *     in der Box, mit der Einheit als Herkunft. Das ist Akzeptanzkriterium 3 und
 *     haengt an drei Schichten zugleich (Schreibpfad, Lesepfad, Anzeige).
 *
 * ⚠️ EIGENE ZEILEN, ALLES AUS `entnahmeboxFixtures()`: alle Specs teilen EINE
 * Datenbank, und diese hier SCHREIBT. Ein geteiltes Fahrzeug oder ein geteilter
 * Artikel waere genau die Reihenfolgeabhaengigkeit, die isoliert gruen ist und
 * im Verbund rot.
 *
 * ⚠️ RELATIVE ZUSICHERUNGEN, KEINE ABSOLUTEN. CI faehrt `retries: 2` gegen
 * DIESELBE Datenbank; jeder Versuch bucht erneut, und eine feste Zahl waere ab
 * dem zweiten falsch. Gemessen wird deshalb die DIFFERENZ.
 *
 * ⚠️ ZEILENGREIFER IST `[data-row-key]` (Falle 14), nie `tbody tr`:
 * `core/tabelle` virtualisiert ab 150 Zeilen, und dort rendert rc-table die
 * Zeilen als `div` ohne `role="row"`.
 *
 * ⚠️ KLICKS UEBER `klickeWennRuhig` (Falle 12): die Huelle bricht nach einem
 * frischen `page.goto` noch um, wenn `SessionProvider` seine Sitzung nachholt.
 *
 * ⚠️ JEDE AUSLOESENDE AKTION PRUEFT IHRE ANTWORT (Falle 10, zweite Testregel).
 * Eine abgewiesene Server Action liefe sonst still ins Zeitbudget und meldete
 * sich als „die Zahl hat sich nicht geaendert".
 */

const FAHRZEUG_ID = "e2e-box-fahrzeug";
const FAHRZEUG_NAME = "E2E Box-RTW";
const ARTIKEL_NAME = "E2E Box Rettungsdecke";
const CHARGE_NEU = "E2E-BOX-NEU";

function serverActionAntwort(page: Page) {
  // ⚠️ NICHT an der Aufrufstelle `await`-en: das Lauschen beginnt sofort, der
  // ausloesende Klick kommt erst danach.
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 60_000 },
  );
}

/** Die Menge, die die Boxseite fuer den E2E-Artikel ausweist — 0, wenn er fehlt. */
async function mengeInBox(page: Page): Promise<number> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/entnahmebox"));
  expect(antwort?.status(), "/verwaltung/entnahmebox: HTTP").toBe(200);
  await page.waitForLoadState("networkidle");

  const zeile = page.locator("[data-row-key]").filter({ hasText: ARTIKEL_NAME });
  if (await zeile.count() === 0) return 0;
  const text = await zeile.first().innerText();
  return Number(text.match(/(\d+)\s+Stk\./)![1]);
}

test.describe("Entnahmebox (DRK-314)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("am Telefon: eine gewaehlte Charge wandert aus der Einheit in die Box", async ({ page }) => {
    const vorher = await mengeInBox(page);

    const antwort = await page.goto(lagerbuchUrl(`/helfer/box?fz=${FAHRZEUG_ID}`));
    // ⛔ NICHT nur `toBeVisible()` weiter unten: eine 500er Seite waere hier
    // schon entschieden, und die Sichtbarkeitsprobe liefe stattdessen in ihr
    // Zeitbudget und meldete sich als etwas ganz anderes (Falle 10).
    expect(antwort?.status(), "/helfer/box: HTTP").toBe(200);

    // Die Strecke spricht art-bewusst — hier steht die Art FEST (DRK-309).
    await expect(page.locator("[data-rolle='box-liste-titel']")).toHaveText("Liegt im Fahrzeug");

    const zeile = page.locator("[data-rolle='box-posten']").filter({ hasText: ARTIKEL_NAME });
    await expect(zeile).toHaveCount(1);
    const bestandVorher = Number(
      (await zeile.locator("[data-rolle='box-posten-knopf']").innerText()).match(/(\d+)\s*Stk\./)![1],
    );

    await klickeWennRuhig(zeile.locator("[data-rolle='box-posten-knopf']"));
    await expect(zeile.locator("[data-rolle='box-eingabe']")).toBeVisible();

    /*
     * ⚠️ DIE CHARGE WIRD AUSDRUECKLICH GEWAEHLT, und zwar die JUENGERE. Nur so
     * misst dieser Lauf die Zusage aus `umlagerung.ts`: beim Umraeumen gilt
     * FEFO NICHT — wer die Packung in der Hand haelt, traegt DIESE in die
     * Kiste. Mit der Vorgabe („zuerst ablaufende") waere der Fall nicht von
     * einer FEFO-Buchung zu unterscheiden, und der Fehler waere STILL: netto
     * bleibt null, der Fahrzeugbestand stimmt.
     */
    const chargenwahl = zeile.locator("[data-rolle='box-chargenwahl']");
    await expect(chargenwahl, "zwei Chargen ⇒ die Wahl muss erscheinen").toBeVisible();
    await chargenwahl.locator("label").filter({ hasText: CHARGE_NEU }).locator("input").check();

    const aktion = serverActionAntwort(page);
    await klickeWennRuhig(zeile.locator("[data-rolle='box-buchen']"));
    expect((await aktion).ok(), "In die Entnahmebox legen: Server Action").toBe(true);

    await expect(page.locator("[data-rolle='box-ergebnis']"))
      .toHaveText(`In die Entnahmebox gelegt: 1 × ${ARTIKEL_NAME}`);

    // Der Bestand der Einheit sinkt um genau diese eine — die Seite laedt dafuer
    // neu, weil sie serverseitig rechnet.
    await page.goto(lagerbuchUrl(`/helfer/box?fz=${FAHRZEUG_ID}`));
    await expect(
      page.locator("[data-rolle='box-posten']").filter({ hasText: ARTIKEL_NAME })
        .locator("[data-rolle='box-posten-knopf']"),
    ).toContainText(`${bestandVorher - 1}`);

    // Und die Box hat genau eines mehr. RELATIV, nicht absolut: CI wiederholt
    // gegen dieselbe Datenbank.
    expect(await mengeInBox(page)).toBe(vorher + 1);
  });

  test("in der Verwaltung: die Box zeigt Inhalt und Herkunft", async ({ page }) => {
    const vorher = await mengeInBox(page);

    const antwort = await page.goto(
      lagerbuchUrl(`/verwaltung/entnahmebox?von=${FAHRZEUG_ID}`),
    );
    expect(antwort?.status(), "/verwaltung/entnahmebox?von=: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    // ── Artikel waehlen — die Liste fuehrt NUR, was die Einheit traegt ──────
    await klickeWennRuhig(page.getByRole("combobox", { name: "Artikel", exact: true }));
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .locator(".ant-select-item-option", { hasText: ARTIKEL_NAME })
      .first()
      .click();

    await page.getByLabel("Menge", { exact: true }).fill("2");

    const aktion = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "In die Entnahmebox buchen" }));
    expect((await aktion).ok(), "In die Entnahmebox buchen: Server Action").toBe(true);

    await expect(page.locator("[data-rolle='box-meldung']"))
      .toContainText(`2 × ${ARTIKEL_NAME} in die Entnahmebox gebucht.`);

    // ── Der Inhalt ist um zwei gewachsen ──────────────────────────────────
    expect(await mengeInBox(page)).toBe(vorher + 2);

    /*
     * ── Und die Herkunft steht daneben ────────────────────────────────────
     *
     * ⚠️ DAS IST DIE ZUSAGE, DIE DIE SEITE ERST BRAUCHBAR MACHT: wer die Kiste
     * einraeumt, muss wissen, woher das Teil kam. Sie haengt an der Referenz
     * (`entnahmebox:<id>`), die BEIDE Legs teilen — und an der Aufloesung dieser
     * Id in eine Zeile, die die Einheit BENENNT („Name · Art · Kennung").
     */
    const zugaenge = page.getByRole("table", { name: "Zuletzt abgegeben" });
    await expect(zugaenge.locator("[data-row-key]").first())
      .toContainText(`${FAHRZEUG_NAME} · Fahrzeug · MS-E2E-9`);
  });
});
