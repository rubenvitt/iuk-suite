import { test, expect, type Browser } from "@playwright/test";
import { devLogin, E2E_PORT, warteAufGestreamteInhalte } from "./fixtures";

/**
 * „EHRLICH GESAGT" (IDA-314) im Browser: anonym einwerfen, als Vertrauensperson antworten und Rückfrage
 * erlauben, unter dem Abholcode lesen und zurückschreiben. Dazu der Riegel: `feedback-admin` sieht den
 * Kasten nicht.
 */
const FEEDBACK = `http://feedback.localtest.me:${E2E_PORT}`;
const LESER = "kummerkasten-leser";

async function einwurfAdresse(browser: Browser): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await devLogin(page, { host: "feedback.localtest.me", groups: LESER, callbackPath: "/ehrlich-gesagt/aushang" });
  await page.goto(`${FEEDBACK}/ehrlich-gesagt/aushang`);
  const adresse = (await page.getByTestId("einwurf-adresse").textContent())!.trim();
  await ctx.close();
  return new URL(adresse).pathname;
}

test("anonym einwerfen, antworten, unter dem Code lesen und zurückschreiben", async ({ browser }) => {
  const pfad = await einwurfAdresse(browser);
  const text = `Mitteilung aus dem e2e ${Date.now()}`;

  // 1. Anonym, ohne Sitzung.
  const anonym = await browser.newContext();
  const ein = await anonym.newPage();
  await ein.goto(`${FEEDBACK}${pfad}`);
  await expect(ein.getByRole("heading", { name: "Was liegt dir auf dem Herzen?" })).toBeVisible();
  await ein.getByText("Miteinander", { exact: true }).click();
  await ein.getByLabel("Deine Mitteilung").fill(text);
  await ein.getByText("Ja, aber anonym.").click();
  await ein.getByRole("button", { name: "Mitteilung absenden" }).click();
  await expect(ein.getByRole("heading", { name: "Danke." })).toBeVisible();
  const code = (await ein.getByTestId("abholcode").locator("span").nth(1).textContent())!.trim();
  expect(code).toMatch(/^[A-Z]+-\d{4}-[A-Z]+$/);

  // 2. Die Vertrauensperson antwortet und erlaubt die Rückfrage.
  const vpCtx = await browser.newContext();
  const vp = await vpCtx.newPage();
  await devLogin(vp, { host: "feedback.localtest.me", groups: LESER, callbackPath: "/ehrlich-gesagt" });
  await vp.goto(`${FEEDBACK}/ehrlich-gesagt`);
  await warteAufGestreamteInhalte(vp);
  await vp.getByTestId("eingang").getByText(text).click();
  await expect(vp.getByTestId("volltext")).toHaveText(text);
  await vp.getByLabel("Antwort").fill("Danke, wir sprechen das an.");
  await vp.getByRole("button", { name: "Antwort freigeben" }).click();
  await expect(vp.getByText("Danke, wir sprechen das an.")).toBeVisible();
  await vp.getByRole("switch").click();
  await expect(vp.getByRole("switch")).toBeChecked();

  // 3. Unter dem Code lesen und zurückschreiben.
  const ab = await anonym.newPage();
  await ab.goto(`${FEEDBACK}/k/abholen`);
  await ab.getByLabel("Abholcode").fill(code.toLowerCase());
  await ab.getByRole("button", { name: "Antwort ansehen" }).click();
  await expect(ab.getByTestId("abholung")).toContainText("Danke, wir sprechen das an.");
  await ab.getByLabel("Möchtest du darauf antworten?").fill("Gern zwei Wochen vorher.");
  await ab.getByRole("button", { name: "Antwort senden" }).click();
  await expect(ab.getByTestId("abholung")).toContainText("Gern zwei Wochen vorher.");

  // 4. Die Rückfrage steht in der Verwaltung.
  await vp.reload();
  await expect(vp.getByText("Gern zwei Wochen vorher.")).toBeVisible();
  await anonym.close();
  await vpCtx.close();
});

test("feedback-admin sieht „Ehrlich gesagt“ nicht", async ({ page }) => {
  await devLogin(page, { host: "feedback.localtest.me", groups: "feedback-admin", callbackPath: "/" });
  const antwort = await page.goto(`${FEEDBACK}/ehrlich-gesagt`);
  expect(antwort?.status()).toBe(404);
});

test("ein falscher Link zeigt nur, dass er nicht gilt", async ({ page }) => {
  await page.goto(`${FEEDBACK}/k/gibt-es-nicht`);
  await expect(page.getByRole("heading", { name: "Dieser Link gilt nicht mehr." })).toBeVisible();
});
