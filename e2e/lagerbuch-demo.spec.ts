import { test, expect, type Browser, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";
import {
  E2E_DEMO_VORLAGE_NAME,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * IDA-224 — DER DEMO-CHECK AUF EINEM ANONYMEN TELEFON (voruebergehend,
 * Rueckbau IDA-225).
 *
 * Was nur ein echter Browser gegen den echten Proxy zeigt: dass `/demo` auf dem
 * Lagerbuch-Host OHNE Anmeldung und ohne Kaertchen durch `decideRoute` kommt
 * (kein Umweg in den Login, kein Gate), dass ein ausgeschalteter Demo-Check ein
 * echtes HTTP 404 ist (Falle 23) — auf der Seite UND am Abschluss —, und dass
 * die Kette Art waehlen → zaehlen → abschliessen → Bestaetigung am Stueck traegt.
 *
 * Eingeschaltet wird ueber die Verwaltung (Vorlagen → „Demo-Check"), wie ein
 * Admin es tut. Am Ende steht der Schalter wieder auf „aus"; die Vorlage gehoert
 * nur dieser Datei (`demoFixtures` im Seed).
 */
test.describe.configure({ mode: "serial" });

const DEMO = lagerbuchUrl("/demo");
const ABSCHLUSS = lagerbuchUrl("/demo/abschluss");

/** Der Schalter in der Verwaltung; wartet auf die Antwort der Server Action und den neuen Stand. */
async function demoSchalten(page: Page, an: boolean): Promise<void> {
  await page.goto(lagerbuchUrl("/verwaltung/vorlagen"));
  await warteAufGestreamteInhalte(page);
  const karte = page.locator("[data-rolle='demo-check']");
  await expect(karte).toBeVisible();
  if (an) {
    await karte.getByRole("combobox", { name: "Vorlage für den Demo-Check" }).click();
    const [wahl] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/verwaltung/vorlagen")),
      // Die sichtbare Zeile, nicht die versteckte a11y-Option der virtuellen Liste.
      klickeWennRuhig(page.locator(".ant-select-item-option", { hasText: E2E_DEMO_VORLAGE_NAME })),
    ]);
    expect(wahl.status()).toBeLessThan(400);
  }
  const schalter = karte.getByRole("switch", { name: "Demo-Check eingeschaltet" });
  if ((await schalter.getAttribute("aria-checked")) !== String(an)) {
    const [antwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/verwaltung/vorlagen")),
      schalter.click(),
    ]);
    expect(antwort.status()).toBeLessThan(400);
  }
  await expect(karte.locator("[data-rolle='demo-check-stand']"))
    .toHaveText(an ? "Eingeschaltet" : "Ausgeschaltet");
}

/** Ein frischer Kontext ohne Anmeldung und ohne Cookie, im Telefonformat. */
async function telefon(browser: Browser) {
  return browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
}

test.describe("IDA-224 — Demo-Check", () => {
  test("aus: Seite und Abschluss antworten anonym mit 404", async ({ browser }) => {
    const kontext = await telefon(browser);
    const page = await kontext.newPage();
    expect((await page.goto(DEMO))!.status()).toBe(404);
    // Falle 10: erst ein GET, damit der Route Handler kompiliert ist.
    await page.request.get(ABSCHLUSS);
    expect((await page.request.post(ABSCHLUSS, { data: { positionen: [], verfaelle: [] } })).status())
      .toBe(404);
    await kontext.close();
  });

  test("ohne Lagerbuch-Admin-Gruppe gibt es den Schalter nicht (404)", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: "andere-gruppe", callbackPath: "/" });
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/vorlagen"));
    expect(antwort!.status()).toBe(404);
    await expect(page.locator("[data-rolle='demo-check']")).toHaveCount(0);
  });

  test("ein Admin schaltet ein; ein anonymes Telefon prüft und sieht die Bestätigung", async ({ page, browser }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
    await demoSchalten(page, true);
    // Ausschalten im `finally`: in der CI (retries: 1) liefe die serielle Gruppe
    // sonst mit eingeschalteter Demo erneut an, und der 404-Test fiele.
    try {
      await expect(page.locator("[data-rolle='demo-check']").getByRole("img", { name: /QR-Code/ })).toBeVisible();

      // Das Demo-Fahrzeug steht in keiner Fahrzeugliste.
      await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
      await warteAufGestreamteInhalte(page);
      await expect(page.getByText(E2E_DEMO_VORLAGE_NAME)).toHaveCount(0);

      const kontext = await telefon(browser);
      const handy = await kontext.newPage();
      const antwort = await handy.goto(DEMO);
      expect(antwort!.status(), "anonym erreichbar, kein Login-Umweg").toBe(200);
      expect(new URL(handy.url()).pathname).toBe("/demo");
      await warteAufGestreamteInhalte(handy);
      await expect(handy.locator("[data-rolle='demo-hinweis']")).toBeVisible();
      await expect(handy.locator("[data-rolle='check-einheit']")).toContainText(E2E_DEMO_VORLAGE_NAME);
      await expect(handy.getByTestId("lb-tableiste")).toHaveCount(0);

      await handy.locator("[data-rolle='check-art-kurz']").click();
      await handy.waitForURL((u) => u.pathname === "/demo" && u.searchParams.get("art") === "kurz");
      await warteAufGestreamteInhalte(handy);
      await expect(handy.locator("[data-rolle='check-art']")).toHaveText("Kurzcheck");

      // IDA-248: zuerst die Plombe der Medikamententasche — die Nummer steht im Demo-Hinweis.
      const weiter = handy.getByRole("button", { name: "Weiter" });
      await expect(handy.locator("[data-rolle='demo-plombe']")).toContainText("004711");
      await handy.locator("[data-rolle='plombe-nummer']").fill("004711");
      await expect(handy.locator("[data-rolle='plombe']")).toContainText("passt");
      await weiter.click(); // Plomben → Zaehlen

      const plus = handy.locator("[data-rolle='zaehlliste']").getByRole("button", { name: /erhöhen$/ });
      await expect(plus.first()).toBeVisible();
      const n = await plus.count();
      for (let i = 0; i < n; i++) await plus.nth(i).click();

      await expect(weiter).toBeEnabled();
      await weiter.click(); // Zaehlen → Nachfuellen
      await weiter.click(); // Nachfuellen → Geraete
      await expect(handy.getByText("Defibrillator (AED)")).toBeVisible();
      await weiter.click(); // Geraete → Sauerstoff

      await handy.request.get(ABSCHLUSS); // Falle 10, Warmlauf (405, kompiliert den Handler)
      const [post] = await Promise.all([
        handy.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/demo/abschluss")),
        // Der Knopf heisst je nach letztem Schritt anders („Aufs Fahrzeug gelegt" beim Nachfuellen).
        handy.locator("[data-rolle='abschliessen']").click(),
      ]);
      expect(post.status()).toBe(200);
      await expect(handy.locator("[data-rolle='check-ergebnis']")).toContainText("Kurzcheck abgeschlossen");
      await expect(handy.locator("[data-rolle='demo-ergebnis']")).toContainText("nichts gespeichert");
      await expect(handy.locator("[data-rolle='nochmal']")).toHaveAttribute("href", "/demo");

      // Kein Helfer-Cookie, keine Sitzung. Theme- und CSRF-Cookies setzen Suite und
      // Auth.js auf jeder Seite; ein Zugang waere eines der Sitzungs-Cookies.
      const namen = (await kontext.cookies()).map((c) => c.name);
      expect(namen.filter((n) => /^(helfer_|lagerbuch_)|session-token/.test(n))).toEqual([]);
      await kontext.close();
    } finally {
      await demoSchalten(page, false);
    }
    const danach = await telefon(browser);
    expect((await (await danach.newPage()).goto(DEMO))!.status()).toBe(404);
    await danach.close();
  });
});
