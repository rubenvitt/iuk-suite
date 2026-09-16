import { expect, test } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-299 — Inventur je Charge und Verlauf, im echten Browser.
 *
 * WAS VITEST HIER NICHT SIEHT: die Tapflaeche (jsdom rechnet keine Kaesten,
 * Falle 4), den HTTP 500 einer Server Component (Fallen 1/7/9 — nur ein echter
 * Abruf), den Rundlauf der Server Action und die beiden Verlaufsseiten.
 *
 * DIE ARTIKEL GEHOEREN ALLEIN DIESEM SPEC (`seed-lagerbuch.ts`,
 * `inventurFixtures`), weil er bucht.
 *
 * ⚠️ JEDER VERSUCH ISOLIERT SICH SELBST. `retries` in der CI laufen gegen
 * DIESELBE Datenbank: nach einem gebuchten ersten Versuch hat Charge A einen
 * anderen Rest, und die ergaenzte Charge steht mit Rest > 0 in der Liste — ein
 * zweites Ergaenzen mit demselben Schluessel waere gesperrt. Deshalb (a) liest
 * der Test Summe und Rest VOR dem Zaehlen und sichert relativ zu, (b) traegt die
 * ergaenzte Charge die Versuchsnummer in ihrer Chargennummer, und (c) steht die
 * Versuchsnummer im Kommentar, damit die Liste DIESEN Lauf belegt.
 *
 * JEDE AUSLOESENDE AKTION PRUEFT IHRE ANTWORT (Falle 10, zweite Testregel), und
 * jeder Klick, nach dem die Huelle umbrechen kann, laeuft ueber `klickeWennRuhig`
 * (Falle 12).
 */
const ARTIKEL = "E2E Inventur Kompressen";
const ARTIKEL_ID = "e2e-inventur-artikel";
const ZWEITER = "E2E Inventur Binden";
const ZWEITER_ID = "e2e-inventur-zweit";
const CHARGE_A = "E2E-INV-A";
const CHARGE_A_MHD = "01/90"; // Seed: 2090-01
const CHARGE_B = "E2E-INV-B";
const NEU_MHD = "2093-02";
const NEU_MHD_TEXT = "02/93";
/** Nicht 1: mit der Vorgabe 1 bewiese die Summenpruefung nur „unveraendert". */
const NEU_MENGE = 2;

/** DRK-337 — eigener Schrank, eigener Artikel (`seed-lagerbuch.ts`, `ortsFixtures`). */
const SCHRANK = "E2E Inventurschrank";
const SCHRANK_ID = "e2e-inventur-schrank";
const ORT_ARTIKEL = "E2E Inventur Ortszählung";
/** Seedwert auf der Wurzel. Diese Zahl darf sich durch keinen Lauf aendern. */
const AUF_DER_WURZEL = 4;

test.describe("Lagerbuch Inventur je Charge (DRK-299)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
  });

  test("filtert, zählt je Charge, ergänzt eine Charge und zeigt den Lauf im Verlauf", async ({ page }) => {
    const versuch = test.info().retry;
    const neueNr = `E2E-INV-N${versuch}`;
    const kommentar = `E2E Chargeninventur Versuch ${versuch + 1}`;

    const seite = await page.goto(lagerbuchUrl("/verwaltung/inventur"));
    expect(seite?.status()).toBe(200);
    // Ohne Hydration traefen Knoepfe und Felder ein Element ohne Handler
    // (Begruendung in `lagerbuch-ux.spec.ts`).
    await page.waitForLoadState("networkidle");

    // 1) Die zweite Zeile zaehlen, ohne ihren Wert zu aendern: sie steht danach
    //    im Zaehlstand, bucht aber keine Korrektur.
    const zweiteZeile = page.locator(`tbody tr[data-row-key='${ZWEITER_ID}']`);
    const zweitesFeld = zweiteZeile.getByLabel(`Ist-Bestand ${ZWEITER}`, { exact: true });
    const zweitVorher = Number(await zweitesFeld.inputValue());
    await klickeWennRuhig(zweiteZeile.getByRole("button", { name: `Ist-Bestand ${ZWEITER} erhöhen`, exact: true }));
    await expect(zweitesFeld).toHaveValue(String(zweitVorher + 1));
    await klickeWennRuhig(zweiteZeile.getByRole("button", { name: `Ist-Bestand ${ZWEITER} verringern`, exact: true }));
    await expect(zweitesFeld).toHaveValue(String(zweitVorher));

    // 2) Filter „Fach INV-1" — seit DRK-333 im SPALTENKOPF statt in einer Leiste
    //    darueber. Die gezaehlte INV-2-Zeile verschwindet, der Hinweis sagt, dass
    //    sie trotzdem mitgebucht wird.
    //    ⚠️ Das Menue wird auf das OFFENE Dropdown eingegrenzt: antd laesst zuvor
    //    geoeffnete Filtermenues als `.ant-dropdown-hidden` im Portal stehen, und
    //    ein ungeschuetzter Greifer trifft dann deren „OK" (gemessen in
    //    `InventurForm.test.tsx`, wo genau das den ersten Filter zuruecksetzte).
    const fachKopf = page.getByRole("columnheader", { name: "Fach" });
    await klickeWennRuhig(fachKopf.locator(".ant-table-filter-trigger"));
    const menue = page.locator(".ant-table-filter-dropdown").locator("visible=true");
    await menue.locator(".ant-dropdown-menu-item", { hasText: "INV-1" }).click();
    await menue.getByRole("button", { name: "OK", exact: true }).click();
    await expect(menue).toBeHidden();

    const zeilen = page.locator("tbody tr[data-row-key]");
    await expect(zeilen).toHaveCount(1);
    await expect(zeilen).toHaveAttribute("data-row-key", ARTIKEL_ID);
    const hinweis = page.locator("[data-rolle='ausgeblendet-hinweis']");
    await expect(hinweis).toContainText("1 gezählte Position ist ausgeblendet");

    // 3) Aufklappen. Der Aufklappknopf ist ein eigener `Button` — antds
    //    Standardknopf misst ~17px (Falle 4).
    const artikelFeld = page.getByLabel(`Ist-Bestand ${ARTIKEL}`, { exact: true });
    const summeVorher = Number(await artikelFeld.inputValue());
    const aufklappen = page.getByRole("button", { name: `Chargen ${ARTIKEL} anzeigen`, exact: true });
    await expect(aufklappen).toBeVisible();
    const kasten = await aufklappen.boundingBox();
    console.log(`DRK-299 Aufklappknopf ${JSON.stringify(kasten)}`);
    expect(kasten!.height).toBeGreaterThanOrEqual(44);
    expect(kasten!.width).toBeGreaterThanOrEqual(44);
    await klickeWennRuhig(aufklappen);
    await expect(page.getByRole("button", { name: `Chargen ${ARTIKEL} ausblenden`, exact: true })).toBeVisible();

    // Mindesttapflaeche auch in den Unterzeilen (Spec §Tests). Erst die Menge
    // nachweisen, sonst bestuende „nichts zu klein" auch ohne Unterzeilen.
    const unterzeilen = await page.evaluate(() => {
      const ziele = [
        ...document.querySelectorAll<HTMLElement>(
          "[data-rolle='charge'] button, [data-rolle='charge'] .ant-input-number, "
          + "[data-rolle='charge-ergaenzen'] button, [data-rolle='charge-ergaenzen'] input[type='month'], "
          + "[data-rolle='charge-ergaenzen'] .ant-input-number, [data-rolle='charge-ergaenzen'] input.ant-input",
        ),
      ];
      return ziele.map((el) => {
        const box = el.getBoundingClientRect();
        return {
          ziel: (el.getAttribute("aria-label") ?? el.querySelector("input")?.getAttribute("aria-label") ?? el.tagName).slice(0, 40),
          knopf: el.tagName === "BUTTON",
          w: Math.round(box.width),
          h: Math.round(box.height),
        };
      });
    });
    console.log(`DRK-299 Unterzeilen ${JSON.stringify(unterzeilen)}`);
    expect(unterzeilen.length, "die Unterzeilen muessen Bedienelemente tragen").toBeGreaterThanOrEqual(8);
    expect(unterzeilen.filter((z) => z.h < 44 || (z.knopf && z.w < 44))).toEqual([]);

    // 4) Eine Charge zaehlen — relativ zum angezeigten Rest.
    const chargeA = page.getByLabel(`Ist Charge ${CHARGE_A}`, { exact: true });
    const restA = Number(await chargeA.inputValue());
    expect(restA, "Charge A braucht Rest, sonst gibt es nichts zu zaehlen").toBeGreaterThan(0);
    await chargeA.fill(String(restA - 1));
    await expect(artikelFeld).toHaveValue(String(summeVorher - 1));
    await expect(artikelFeld).toBeDisabled();
    await expect(page.locator(`tbody tr[data-row-key='${ARTIKEL_ID}']`)).toContainText("je Charge");

    // 5) Eine im Regal gefundene Charge ergaenzen.
    const menge = page.getByLabel("Menge der neuen Charge", { exact: true });
    await page.getByLabel("MHD der neuen Charge", { exact: true }).fill(NEU_MHD);
    await page.getByLabel("Chargennummer der neuen Charge", { exact: true }).fill(neueNr);
    await menge.fill(String(NEU_MENGE));
    const ergaenzen = page.getByRole("button", { name: "Charge ergänzen", exact: true });
    await expect(ergaenzen).toBeEnabled();
    await klickeWennRuhig(ergaenzen);
    await expect(page.locator("[data-rolle='neue-charge']")).toContainText(neueNr);
    await expect(artikelFeld).toHaveValue(String(summeVorher - 1 + NEU_MENGE));
    // Die Ergaenzen-Zeile springt auf ihre Vorgabe zurueck, nicht auf leer.
    await expect(menge).toHaveValue("1");

    // 6) Abschliessen — die Antwort der Action wird geprueft (Falle 10).
    await page.getByLabel("Kommentar", { exact: true }).fill(kommentar);
    const abschluss = page.locator("button[data-rolle='abschluss']");
    await expect(abschluss).toBeEnabled();
    const antwort = page.waitForResponse((r) => (
      r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    ));
    await klickeWennRuhig(abschluss);
    expect((await antwort).ok()).toBe(true);
    const erfolg = page.locator(".ant-alert-success");
    await expect(erfolg).toContainText("Inventur gebucht");
    // Der Zaehlstand ist geleert — auch die ausgeblendete Zeile ist mitgebucht.
    await expect(hinweis).toHaveCount(0);

    // 7) Den Lauf oeffnen: Client-Navigation ueber den Link (Falle 12) …
    const link = erfolg.getByRole("link", { name: "Im Verlauf ansehen" });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/verwaltung\/inventur\/verlauf\/[A-Za-z0-9_-]+$/);
    await klickeWennRuhig(link);
    // Grosszuegig: die Detailroute wird unter `next dev` beim ersten Treffer
    // uebersetzt — gewartet wird auf eine angestossene Navigation.
    await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 30_000 });

    // … und ein echter Abruf derselben Adresse (HTTP 200, Fallen 1/7/9).
    const detail = await page.goto(lagerbuchUrl(href!));
    expect(detail?.status()).toBe(200);
    // DRK-328: der Kopf nennt den Zeitpunkt MIT Jahr. Geprüft wird die Form,
    // nicht der Tag — der Lauf entsteht gerade eben.
    await expect(page.getByRole("heading", { level: 1 }))
      .toHaveText(/^Inventur vom \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
    const positionen = page.getByLabel("Gezählte Positionen", { exact: true });
    await expect(positionen).toContainText(`${CHARGE_A} · ${CHARGE_A_MHD}`);
    await expect(positionen).toContainText(`${neueNr} · ${NEU_MHD_TEXT}`);
    await expect(positionen).toContainText(ZWEITER);
    await expect(positionen).toContainText("je Artikel");
    // Nicht angefasst → keine Position (Spec §B: nie implizit 0).
    await expect(positionen).not.toContainText(CHARGE_B);

    // 8) Die Liste der Laeufe (HTTP 200) traegt den Kommentar DIESES Versuchs.
    const liste = await page.goto(lagerbuchUrl("/verwaltung/inventur/verlauf"));
    expect(liste?.status()).toBe(200);
    const tabelle = page.getByLabel("Inventur-Verlauf", { exact: true });
    await expect(tabelle).toContainText(kommentar);
    // DRK-328: auch in der Liste steht das Jahr.
    await expect(tabelle).toContainText(/\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);
  });

  /**
   * DRK-337 — DIE ZAEHLUNG JE SCHRANK, im echten Browser.
   *
   * ⚠️ WAS VITEST STRUKTURELL NICHT SIEHT und deshalb HIER steht: dass der
   * Ortswechsel den SERVER neu rechnen laesst (die Erwartungszahl kommt aus der
   * Datenbank, nicht aus der Insel) und dass die Korrektur danach im Schrank
   * liegt statt auf der Wurzel — die Buchung entsteht in einer Server Action,
   * jsdom hat keine.
   *
   * ⚠️ JEDER VERSUCH ISOLIERT SICH SELBST, wie im Fall darueber: `retries`
   * laufen gegen DIESELBE Datenbank, der Schrankbestand ist nach dem ersten
   * Versuch also ein anderer. Deshalb wird relativ zugesichert — und die
   * WURZELZAHL ist die eigentliche Zusicherung: sie bleibt 4, egal wie oft
   * gebucht wird. Genau das ist Akzeptanzkriterium 3.
   */
  test("zählt einen einzelnen Schrank und bucht die Korrektur dorthin", async ({ page }) => {
    const kommentar = `E2E Schrankinventur Versuch ${test.info().retry + 1}`;
    const feld = page.getByLabel(`Ist-Bestand ${ORT_ARTIKEL}`, { exact: true });

    /*
     * 1) Der Ort steht in der URL — der Server rechnet die Zeilen dafuer.
     *
     * ⚠️ MIT DEM PRAEFIX `ort:` (DRK-371), und das ist die EINZIGE Form, die
     * einen Ort waehlt. Die rohe Kennung laege im Wertebereich des Waechters
     * `alle`; sie faellt deshalb auf den ganzen Handlager zurueck — wie ein
     * unbekannter Ort. Ohne das Praefix pruefte dieser Fall also den Rueckfall
     * und nicht den Schrank, und zwar mit einer Zusicherung, die nach etwas
     * anderem klingt.
     */
    const seite = await page.goto(lagerbuchUrl(`/verwaltung/inventur?ort=ort:${SCHRANK_ID}`));
    expect(seite?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("seitenkopf-beschreibung")).toContainText(SCHRANK);
    await expect(page.locator("[aria-label='Zählort']").locator("xpath=ancestor::div[contains(@class,'ant-select')][1]"))
      .toContainText(SCHRANK);

    // 2) Die Wurzelzahl VOR dem Buchen — sie ist die Konstante dieses Falls.
    const imSchrank = Number(await feld.inputValue());
    expect(imSchrank, "der Schrank braucht Bestand, sonst gibt es nichts zu zaehlen")
      .toBeGreaterThan(0);

    // 3) Einen mehr zaehlen und buchen. Die Antwort wird geprueft (Falle 10).
    await klickeWennRuhig(page.getByRole("button", { name: `Ist-Bestand ${ORT_ARTIKEL} erhöhen`, exact: true }));
    await expect(feld).toHaveValue(String(imSchrank + 1));
    // Der Zaehlort ist ab der ersten Zaehlung festgelegt: ein Wechsel verwuerfe
    // den Stand, und das darf nicht unter der Hand passieren.
    await expect(page.locator("[data-rolle='ort-gesperrt']")).toContainText("gezählt");
    await page.getByLabel("Kommentar", { exact: true }).fill(kommentar);
    const antwort = page.waitForResponse((r) => (
      r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    ));
    await klickeWennRuhig(page.locator("button[data-rolle='abschluss']"));
    expect((await antwort).ok()).toBe(true);
    await expect(page.locator(".ant-alert-success")).toContainText("1 Position korrigiert");

    // 4) Der Schrank traegt den neuen Stand …
    const nachher = await page.goto(lagerbuchUrl(`/verwaltung/inventur?ort=ort:${SCHRANK_ID}`));
    expect(nachher?.status()).toBe(200);
    await expect(feld).toHaveValue(String(imSchrank + 1));

    // 5) … und die Wurzel ist unberuehrt. Vor DRK-337 waere der Ueberhang genau
    //    hier gelandet, weil die Charge im Schrank noch keinen Kandidaten hatte.
    const wurzel = await page.goto(lagerbuchUrl("/verwaltung/inventur?ort=ort:handlager"));
    expect(wurzel?.status()).toBe(200);
    await expect(page.getByTestId("seitenkopf-beschreibung")).toContainText("noch keinem Schrank zugeordnet");
    await expect(feld).toHaveValue(String(AUF_DER_WURZEL));

    // 6) Der Verlauf nennt den Ort — sonst waere ein Lauf spaeter nicht mehr
    //    einzuordnen, und der Verlauf ist append-only.
    const liste = await page.goto(lagerbuchUrl("/verwaltung/inventur/verlauf"));
    expect(liste?.status()).toBe(200);
    const zeile = page.getByLabel("Inventur-Verlauf", { exact: true })
      .locator("tbody tr", { hasText: kommentar });
    await expect(zeile).toContainText(`Ort ${SCHRANK}`);
  });
});
