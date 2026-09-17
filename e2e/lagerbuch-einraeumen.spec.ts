import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  E2E_TOKEN_HELFER,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DER WEG ZURUECK AUS DER ENTNAHMEBOX — DRK-381, am Stueck im echten Browser.
 *
 * WAS KEIN ANDERES TOR SIEHT, und das ist der Grund fuer diese Datei, obwohl
 * Action, Lesepfad, Insel und Seite je eigene Tests haben:
 *
 *  1. **DASS DIE SEITE UEBERHAUPT ANTWORTET.** `auffuellen/box/page.tsx` ist
 *     eine Server Component, die Daten an eine Client-Insel reicht; die Fallen
 *     1, 6, 7 und 9 antworten dort mit HTTP 500, und weder `build` noch Vitest
 *     sehen das — in Vitest ist `"use client"` eine wirkungslose Zeichenkette,
 *     und es gibt dort gar keine RSC-Grenze.
 *  2. **DER RIEGEL GEGEN EIN KAERTCHEN.** Das ist Akzeptanzkriterium 5 („der
 *     Zugriff ist dieselbe eine Stufe wie bei DRK-313"), und sie ist
 *     serverseitig: der DOM-Test mockt den Riegel, der Action-Test kennt keine
 *     Seite. Erst hier laeuft eine ECHTE Kaertchen-Sitzung gegen die echte
 *     Adresse.
 *  3. **DER VORGANG ALS GANZES** — das Teil verschwindet aus der Kiste UND
 *     erscheint im Schrank, netto null ueber beide Orte (AK1 und AK2). Das
 *     haengt an drei Schichten zugleich (Schreibpfad, Lesepfad, Anzeige) und
 *     ist genau die Zusage, die der naheliegende Fehlgriff — der Zugangspfad
 *     statt der Umlagerung — still verletzt haette: dort bliebe die Zahl in der
 *     Kiste stehen.
 *
 * ⚠️ EIGENE ZEILEN, ALLES AUS `einraeumenFixtures()`: alle Specs teilen EINE
 * Datenbank, und diese hier SCHREIBT. Die Begruendung, warum sie sich die
 * Zeilen NICHT mit `lagerbuch-entnahmebox.spec.ts` teilt, steht dort im Seed —
 * kurz: die eine fuellt die Kiste, die andere leert sie.
 *
 * ⚠️ RELATIVE ZUSICHERUNGEN, KEINE ABSOLUTEN. CI faehrt `retries: 2` gegen
 * dieselbe Datenbank; jeder Versuch bucht erneut, und eine feste Zahl waere ab
 * dem zweiten falsch. Gemessen wird die DIFFERENZ.
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

const ARTIKEL_NAME = "E2E Einräum Rettungsdecke";
const SCHRANK_NAME = "E2E Einräum-Schrank";
const CHARGE_NEU = "E2E-EIN-NEU";

function serverActionAntwort(page: Page) {
  // ⚠️ NICHT an der Aufrufstelle `await`-en: das Lauschen beginnt sofort, der
  // ausloesende Klick kommt erst danach.
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 60_000 },
  );
}

/** Die Menge, die die Verwaltungsansicht der Kiste fuer den Artikel ausweist. */
async function mengeInBox(page: Page): Promise<number> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/entnahmebox"));
  expect(antwort?.status(), "/verwaltung/entnahmebox: HTTP").toBe(200);
  await page.waitForLoadState("networkidle");

  const zeile = page.locator("[data-row-key]").filter({ hasText: ARTIKEL_NAME });
  if (await zeile.count() === 0) return 0;
  return Number((await zeile.first().innerText()).match(/(\d+)\s+Stk\./)![1]);
}

/** Der Handlager-Bestand des Artikels, wie ihn die Verwaltung ausweist. */
async function bestandImHandlager(page: Page): Promise<number> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  expect(antwort?.status(), "/verwaltung/artikel: HTTP").toBe(200);
  await page.waitForLoadState("networkidle");

  // Ueber die Suche, NIE ueber Bildlauf: die Tabelle virtualisiert ab 150
  // Zeilen, und der Artikel landet alphabetisch irgendwo.
  await page.getByRole("searchbox").fill(ARTIKEL_NAME);
  const zeile = page.locator("[data-row-key]").filter({ hasText: ARTIKEL_NAME });
  await expect(zeile).toHaveCount(1);
  return Number((await zeile.innerText()).match(/(\d+)\s+Stk\./)![1]);
}

test.describe("Aus der Entnahmebox einräumen (DRK-381)", () => {
  test("eine gewaehlte Charge wandert aus der Kiste in einen Schrank — netto null", async ({
    page,
  }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });

    const menge = 3;
    const boxVorher = await mengeInBox(page);
    const handlagerVorher = await bestandImHandlager(page);

    // ── 1) Der Einstieg steht auf der Auffuellansicht ──────────────────────
    const auffuellen = await page.goto(lagerbuchUrl("/auffuellen"));
    expect(auffuellen?.status(), "/auffuellen: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    const einstieg = page.locator('[data-rolle="kisten-einstieg"]');
    await expect(einstieg, "der Weg in die Kiste muss von hier abgehen").toHaveCount(1);
    // ⚠️ DER WORTLAUT IST DIE ABGRENZUNG, nicht Dekoration: von dieser Seite
    // gehen ZWEI Wege ab, und wer den Rueckweg fuer einen Wareneingang haelt,
    // bucht dieselben Teile ein zweites Mal ins append-only-Journal.
    await expect(einstieg).toContainText("einräumen");
    await klickeWennRuhig(einstieg);

    // ── 2) Die Flaeche antwortet und sagt die Richtung ────────────────────
    await expect(page).toHaveURL(/\/auffuellen\/box$/);
    await expect(page.locator('[data-rolle="einraeumen-hinweis"]')).toContainText(
      "umgeräumt, nicht neu angenommen",
    );

    const zeile = page.locator('[data-rolle="einraeum-posten"]').filter({ hasText: ARTIKEL_NAME });
    await expect(zeile).toHaveCount(1);
    // Das Fach steht in der zugeklappten Zeile — es beantwortet „wohin?".
    await expect(zeile.locator('[data-rolle="einraeum-posten-knopf"]')).toContainText("EIN-1");

    await klickeWennRuhig(zeile.locator('[data-rolle="einraeum-posten-knopf"]'));
    await expect(zeile.locator('[data-rolle="einraeum-eingabe"]')).toBeVisible();

    // ── 3) Charge und Ziel sind PFLICHT ───────────────────────────────────
    const buchenKnopf = zeile.locator('[data-rolle="einraeumen-buchen"]');
    await expect(buchenKnopf, "ohne Charge und Ziel gesperrt").toBeDisabled();

    /*
     * ⚠️ DIE CHARGE WIRD AUSDRUECKLICH GEWAEHLT, und es gibt hier keine
     * Vorgabe. Beim Einraeumen gilt FEFO NICHT — wer die Packung in der Hand
     * haelt, traegt DIESE in den Schrank. Der Fehler waere STILL: netto bliebe
     * null, der Handlager-Bestand stimmte, nur die Ortsangabe je Charge waere
     * falsch, und das Journal ist append-only.
     */
    const chargenwahl = zeile.locator('[data-rolle="einraeum-chargenwahl"]');
    await expect(chargenwahl, "zwei Chargen ⇒ die Wahl muss erscheinen").toBeVisible();
    await chargenwahl.locator("label").filter({ hasText: CHARGE_NEU }).locator("input").check();
    await expect(buchenKnopf, "nur die Charge reicht nicht").toBeDisabled();

    await zeile
      .locator('[data-rolle="einraeum-ziel-zeile"]')
      .filter({ hasText: SCHRANK_NAME })
      .locator("input")
      .check();

    for (let i = 1; i < menge; i++) {
      await zeile.getByRole("button", { name: `Menge ${ARTIKEL_NAME} erhöhen` }).click();
    }

    // Menge, Artikel und Ziel stehen VOR der Buchung beieinander.
    await expect(zeile.locator('[data-rolle="einraeum-zusammenfassung"]')).toContainText(
      `${menge} Stk. ${ARTIKEL_NAME} → ${SCHRANK_NAME}`,
    );

    // ── 4) Buchen ─────────────────────────────────────────────────────────
    await expect(buchenKnopf).toBeEnabled();
    const antwort = serverActionAntwort(page);
    await klickeWennRuhig(buchenKnopf);
    expect((await antwort).ok(), "Einräumen: Server Action").toBe(true);

    await expect(page.locator('[data-rolle="einraeumen-ergebnis"]')).toHaveText(
      `Eingeräumt: ${menge} × ${ARTIKEL_NAME} → ${SCHRANK_NAME}`,
    );

    /*
     * ── 5) NETTO NULL UEBER BEIDE ORTE (AK1 und AK2) ──────────────────────
     *
     * ⚠️ DAS IST DIE ZUSICHERUNG, DIE DEN FEHLGRIFF DES TICKETS FAENGT. Haette
     * die Flaeche den ZUGANGSPFAD benutzt („auffuellen"), stiege der
     * Handlager-Bestand genauso — die Kiste bliebe aber voll, und dieselben
     * Teile stuenden zweimal im Buch. Erst BEIDE Zahlen zusammen sagen, dass
     * umgeraeumt und nicht angenommen wurde.
     */
    expect(await mengeInBox(page), "die Kiste hat genau so viel weniger").toBe(boxVorher - menge);
    expect(await bestandImHandlager(page), "und das Handlager genau so viel mehr")
      .toBe(handlagerVorher + menge);
  });

  /**
   * ⚠️ AK5, UND SIE IST DER TRAGENDE TEST. Ein Menueeintrag, den jemand nicht
   * sieht, ist keine Beschraenkung — die Adresse bleibt abrufbar.
   *
   * ⚠️ `request.get` STATT `page.goto` UND OHNE UMLEITUNGEN: der Riegel
   * antwortet ohne Konto mit einer Umleitung nach `/login`. Folgte der Test
   * ihr, stuende am Ende ein 200 der Anmeldeseite da, und die Zusicherung waere
   * still gruen. Gemessen wird die Antwort der Einraeum-Adresse selbst.
   */
  test("eine Kaertchen-Sitzung erreicht /auffuellen/box nicht — auch nicht direkt", async ({
    page,
  }) => {
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    const helfer = await page.goto(lagerbuchUrl("/helfer"));
    expect(helfer?.status(), "mit Kaertchen ist die Entnahme offen").toBe(200);

    const antwort = await page.request.get(lagerbuchUrl("/auffuellen/box"), {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(
      antwort.status(),
      "mit Kaertchen darf /auffuellen/box nicht mit 200 antworten",
    ).not.toBe(200);
  });
});
