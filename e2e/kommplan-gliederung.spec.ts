import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { ADMIN, HOST, istSpeichern, neuerPlan, oeffneEditor, speichertNach, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 3: die Gliederung (Spec §6.5) und das Umschalten der Ansicht. Jeder bearbeitende
 * Test legt seinen eigenen Plan an; der Seed-Plan OpenR wird nur angesehen (null Speicheraufrufe).
 */
const liste = (page: Page) => page.getByRole("list", { name: "Gliederung" });
async function baum(page: Page): Promise<string[]> {
  return page.locator(".kp-gliederung [data-zeile]").evaluateAll((els) =>
    els.map((e) => `${"·".repeat(Number((e as HTMLElement).style.getPropertyValue("--ebene")))}${(e.querySelector("input[name='titel']") as HTMLInputElement).value}`));
}
async function fuegeEin(feld: Locator, text: string): Promise<void> {
  await feld.evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}
/**
 * Umschalten über das sichtbare ETIKETT des Segmented, nie `getByRole("radio").check()` (0 × 0-Input, wartet
 * endlos — `lagerbuch-verfall-fahrzeug.spec.ts`, Kopfkommentar zum Umschalter). `getByRole("radiogroup")` sieht
 * im Automodus nur den sichtbaren der zwei Umschalter. Nur für einen Wert aufrufen, der NICHT schon gewählt ist
 * — sonst kein `onChange` (Global Constraints).
 */
async function schalteAuf(page: Page, name: "Diagramm" | "Gliederung"): Promise<void> {
  await klickeWennRuhig(page.getByRole("radiogroup", { name: "Ansicht" }).locator("label", { hasText: name }));
  await expect(page).toHaveURL(new RegExp(`\\?ansicht=${name.toLowerCase()}$`));
}
async function zurGliederung(page: Page): Promise<void> {
  await schalteAuf(page, "Gliederung");
  await expect(liste(page).or(page.getByRole("button", { name: "Erste Stelle anlegen" }))).toBeVisible();
}

test("Gliederung per Tastatur: Enter, Tab, Umschalt+Tab, Alt+↑, Rücktaste — gespeichert und im Diagramm derselbe Baum", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gliederung Tastatur");
  await zurGliederung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  const k = page.keyboard;
  await k.type("EL"); await k.press("Enter");
  await k.type("EA 1"); await k.press("Tab"); await k.press("Enter");
  await k.type("EA 2"); await k.press("Enter");
  await k.type("EA 3"); await k.press("Alt+ArrowUp");
  await k.press("Enter"); await k.press("Backspace"); // leere, unberührte Zeile verschwindet wieder
  await k.press("Enter"); await k.type("RTW"); await k.press("Tab");
  await speichertNach(page, () => k.press("Shift+Tab"));
  expect(await baum(page)).toEqual(["EL", "·EA 1", "·EA 3", "·RTW", "·EA 2"]);
  await oeffneEditor(page, () => page.reload());
  await expect(liste(page)).toBeVisible(); // die Adresse trägt ?ansicht=gliederung
  expect(await baum(page)).toEqual(["EL", "·EA 1", "·EA 3", "·RTW", "·EA 2"]);
  await schalteAuf(page, "Diagramm"); // ausdrücklich „gliederung" gewählt: nur ein Umschalter, „Diagramm" nicht gewählt
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(5);
});

test("Tab auf der ersten Unterstelle: Hinweis in der Gliederung, der Fokus bleibt im Titel (Review Focus 3)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gliederung Tab");
  await zurGliederung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await page.keyboard.type("EL");
  await page.keyboard.press("Enter");
  await speichertNach(page, async () => { await page.keyboard.type("EA 1"); await page.keyboard.press("Tab"); });
  const feld = page.locator(".kp-gliederung [data-zeile] input[name='titel']").nth(1);
  await page.keyboard.press("Tab");
  await expect(page.locator(".kp-gliederung [data-meldung]")).toContainText("Die erste Stelle einer Ebene lässt sich nicht einrücken.");
  await expect(page.locator(".kp-gliederung [data-meldung]")).toBeInViewport({ ratio: 1 });
  await expect(feld).toBeFocused();
});

test("Mehrzeiliges Einfügen legt einen Teilbaum an; ein Rückgängig nimmt ihn ganz zurück", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gliederung Einfügen");
  await zurGliederung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  const erste = page.locator(".kp-gliederung [data-zeile] input[name='titel']").first();
  await speichertNach(page, () => fuegeEin(erste, "- Einsatzleitung\r\n\t- EA Nord\r\n\t\tRTW RK UE 40-83-5\r\n  - EA Süd\r\n"));
  expect(await baum(page)).toEqual(["Einsatzleitung", "·EA Nord", "··RTW RK UE 40-83-5", "·EA Süd"]);
  await expect(page.locator(".kp-gliederung [data-zeile] input[name='titel']").last()).toBeFocused();
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+z"));
  expect(await baum(page)).toEqual([""]);
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  expect(await baum(page)).toHaveLength(4);
});

test("Telefon: öffnet in der Gliederung; „⋯“ legt an, rückt ein und öffnet Details — ohne Tastatur für die Struktur; nach dem Flyin keine Bildschirmtastatur", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, "e2e Gliederung Telefon");
  await expect(page).toHaveURL(new RegExp(`/p/${id}$`)); // ohne Parameter …
  await expect(page.getByRole("button", { name: "Erste Stelle anlegen" })).toBeVisible();
  await expect(page.locator(".kp-betrachter")).toBeHidden(); // … zeigt das Telefon die Gliederung
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await page.keyboard.type("EL");
  await page.keyboard.press("Enter");
  await speichertNach(page, () => page.keyboard.type("EA 1"));
  await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für EA 1" }));
  await speichertNach(page, () => klickeWennRuhig(page.getByRole("menuitem", { name: /^Einrücken/ })));
  expect(await baum(page)).toEqual(["EL", "·EA 1"]);
  await expect(page.getByRole("button", { name: "Aktionen für EA 1" })).toBeFocused(); // Tipp → Fokus bleibt auf „⋯“
  // Anlegen über „⋯“ (Entscheidung 11): eine Seitenstelle und eine Stelle darunter, Titel per Bildschirmtastatur
  await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für EL" }));
  await speichertNach(page, async () => {
    await klickeWennRuhig(page.getByRole("menuitem", { name: "Seitenstelle links" }));
    await page.keyboard.type("KatSL");
  });
  await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für EA 1" }));
  await speichertNach(page, async () => {
    await klickeWennRuhig(page.getByRole("menuitem", { name: /^Neue Stelle darunter/ }));
    await page.keyboard.type("EA 2");
  });
  expect(await baum(page)).toEqual(["EL", "·KatSL", "·EA 1", "·EA 2"]);
  await expect(page.locator(".kp-gliederung [data-zeile] [data-seite='links']")).toHaveText("Seitenstelle links");
  await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für EA 1" }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: /^Details/ }));
  await expect(page.locator(".kp-flyin").getByLabel("Titel", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  // schmal: der Fokus kehrt auf „⋯“ der Zeile zurück, nicht in ein Titelfeld (sonst öffnete die Bildschirmtastatur, Entscheidung 16)
  await expect(page.getByRole("button", { name: "Aktionen für EA 1" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("Umschalten am Seed-Plan: Auswahl bleibt, kein Neuladen, kein einziger Speicheraufruf (Review Focus 5)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const speicherungen: string[] = [];
  const zaehle = (r: Response) => { if (istSpeichern(r)) speicherungen.push(r.url()); };
  page.on("response", zaehle);
  await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01")));
  await page.evaluate(() => { (window as unknown as { marke: number }).marke = 42; });
  await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
  await zurGliederung(page);
  await expect(page.locator('[data-zeile="ea2"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[data-zeile="ea2"]')).toBeInViewport();
  await schalteAuf(page, "Diagramm");
  await expect(page.locator('[data-griffe="ea2"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { marke?: number }).marke)).toBe(42);
  page.off("response", zaehle);
  expect(speicherungen).toEqual([]);
});
