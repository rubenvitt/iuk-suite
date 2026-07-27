import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * Der einzige Ort, der Media Queries wirklich auswertet. Was `shell-css.test.ts`
 * als Regel festhaelt ("die Klasse traegt die richtige Media Query"), belegt
 * dieser Lauf als Ergebnis ("man sieht es nicht").
 *
 * 390x844 ist das Mass, mit dem die feedback-Specs schon arbeiten.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("mobil: Modulknoepfe stehen nicht im Kopf, das Menue oeffnet sie", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await expect(page.getByTestId("suite-header")).toBeVisible();
  // Die Knopfreihe ist im DOM, aber per CSS ausgeblendet — genau das ist der
  // Unterschied, den jsdom nicht sehen kann.
  await expect(page.getByTestId("modulzeile")).toBeHidden();

  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("suite-drawer").getByRole("link", { name: /Alpha/ })).toBeVisible();
});

test("mobil: die Kopfzeile bleibt einzeilig", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  const kopf = page.getByTestId("suite-header");
  const hoehe = await kopf.evaluate((el) => el.getBoundingClientRect().height);
  console.log(`Kopfzeilenhoehe bei 390x844: ${hoehe}px`);
  // 64px ist `Layout.headerHeight`. Bricht die Leiste um, wird sie hoeher —
  // genau der Defekt, den der alte `overflow: hidden` kaschierte.
  expect(hoehe).toBeLessThanOrEqual(72);
});

test("mobil: der Drawer fuehrt in ein anderes Modul", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await page.getByTestId("menue-knopf").click();
  await page.getByTestId("suite-drawer").getByRole("link", { name: /Alpha/ }).click();
  await expect(page.getByTestId("alpha-content")).toBeVisible();
});

test("mobil: abmelden ist erreichbar", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("abmelden")).toBeVisible();
});

test.describe("Modulnavigation am laufenden Server", () => {
  // Desktop-Viewport (Standard), weil `.modulnav` dort sichtbar ist.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("markiert genau einen Eintrag als aktuelle Seite", async ({ page }) => {
    // DER EINZIGE ORT, DER DAS BEWEISEN KANN. Der Unit-Test mockt
    // `usePathname()`; was die Funktion unter dem Proxy-Rewrite (`/vergleich`
    // -> `/m/feedback/vergleich`) tatsaechlich liefert, haengt an der
    // Next-Version. Waere die Aufloesung falsch, wuerde schlicht nie etwas
    // markiert — ein stiller Fehlschlag, den kein Unit-Test sieht.
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/vergleich",
    });
    const aktiv = page.locator('[data-testid="modulnav"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Vergleich");
  });

  test("markiert die Uebersicht auf der Modulwurzel", async ({ page }) => {
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/",
    });
    const aktiv = page.locator('[data-testid="modulnav"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Übersicht");
  });
});
