import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";

/**
 * Kommunikationspläne, Phase 1: Zugang, Liste, Betrachter, Druck. Gemessen wird am echten Abruf,
 * weil die Fallen 1, 6, 7, 18 und 23 nur dort sichtbar werden. Die Pläne legt der Seed an
 * (`playwright.config.ts`, `scripts/seed-lokal.ts kommplan`). Pläne liegen unter `/p/<id>`
 * (Abweichung 11 im Umsetzungsplan).
 */
const HOST = "kommplan.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;
const EINSATZ = "beispiel-einsatz-2026-02-22";
const STABSLAGE = "beispiel-grosse-stabslage";
const SCHRITT = 1.25; // `_ui/betrachter/ansicht.ts`, SCHRITT

const massstab = (transform: string | null) => Number(/scale\(([-\d.e]+)\)/.exec(transform ?? "")?.[1] ?? Number.NaN);

/**
 * Die Ausgangslage des Betrachters, sobald sie steht: zwei gleiche Werte hintereinander. Vorher
 * ändert sich das transform schon durch Hydration, Einpassung und den Umbruch der Hülle.
 */
async function ruhigeAnsicht(page: Page): Promise<string> {
  let letzte = "";
  await expect.poll(async () => {
    const jetzt = (await page.locator("[data-ansicht]").getAttribute("transform")) ?? "";
    const ruhig = jetzt !== "" && jetzt === letzte;
    letzte = jetzt;
    return ruhig;
  }, { intervals: [150], message: "Die Ansicht des Betrachters kommt nicht zur Ruhe" }).toBe(true);
  return letzte;
}

/** Am echten Menü bestimmt: per Enter geöffnet steht „A4 quer“ schon aktiv, EIN Pfeil wählt „A3 quer“ (zwei liefen herum). */
const PFEIL_RUNTER_BIS_A3 = 1;

test("mit der Zugangsgruppe: Liste, Plan, Einklappen und Zoom", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  const liste = await page.goto(url("/"));
  expect(liste?.status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("heading", { level: 1, name: "Kommunikationspläne" })).toBeVisible();
  // getByRole sieht nur die sichtbare Darstellung (Tabelle ODER Karten, docs/design/README.md „Mobil").
  await expect(page.getByRole("link", { name: "Kommunikationsplan Einsatz 22.02.2026" })).toBeVisible();

  const plan = await page.goto(url(`/p/${EINSATZ}`));
  expect(plan?.status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(6);
  // Die Legende steht auch am Bildschirm, mit den Reservekanälen (Spec §5.6, A3)
  await expect(page.getByRole("list", { name: "Legende" })).toContainText("Reserve K_UE_2");
  // Drucken als geteilter Knopf, die Zugangsgruppe teilt nicht (Umsetzungsplan Phase 5, Entscheidungen 12, 17)
  await expect(page.getByRole("button", { name: "Drucken", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Teilen" })).toHaveCount(0);
  // Der echte Tastaturweg: Pfeil fokussieren, Enter öffnet das Menü, Pfeiltasten wählen, Enter druckt.
  await page.context().addInitScript(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Weitere Druckformate" }).focus();
  await page.keyboard.press("Enter");
  // Erst wenn der Fokus im Menü steht (autoFocus setzt ihn nach dem Öffnen), führen die Pfeile durch die Punkte.
  await expect(page.getByRole("menuitem", { name: "A4 quer", exact: true })).toBeFocused();
  const popup = page.waitForEvent("popup");
  for (let i = 0; i < PFEIL_RUNTER_BIS_A3; i++) await page.keyboard.press("ArrowDown");
  // rc-menu liest den aktiven Punkt beim Enter aus seinem Zustand: erst drücken, wenn er angekommen ist.
  await expect(page.getByRole("menuitem", { name: "A3 quer", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const druck = await popup;
  await druck.waitForURL(/\/druck\/a3$/);
  await druck.close();

  // Einklappen zuerst — vor dem Zoomen liegt der Umschalter sicher in der eingepassten Fläche.
  await klickeWennRuhig(page.locator('[data-umschalter="el"]'));
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(2);
  await expect(page.locator("[data-abzeichen]")).toHaveText("+4 Stellen");
  await klickeWennRuhig(page.getByRole("button", { name: "Alle ausklappen" }));
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(6);

  const vorher = massstab(await ruhigeAnsicht(page));
  expect(vorher).toBeGreaterThan(0);
  await klickeWennRuhig(page.getByRole("button", { name: "Vergrößern" }));
  await expect.poll(async () => massstab(await page.locator("[data-ansicht]").getAttribute("transform")))
    .toBeCloseTo(vorher * SCHRITT, 6);
});

test("Druck A4: ein Blatt für den Einsatz, mehrere für die Stab-Lage, keines leer, Druck nach der Schrift", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __gedruckt: number };
    w.__gedruckt = 0;
    window.print = () => { w.__gedruckt += 1; };
  });
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });

  const einsatz = await page.goto(url(`/p/${EINSATZ}/druck/a4`));
  expect(einsatz?.status()).toBe(200);
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("svg.kp-blatt")).toHaveCount(1);
  await expect(page.locator("svg.kp-blatt [data-karte]")).toHaveCount(6);
  await expect(page.locator("svg.kp-blatt").first()).toContainText("Blatt 1 von 1");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gedruckt: number }).__gedruckt)).toBe(1);
  const pdfEinsatz = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(pdfEinsatz.getPageCount()).toBe(1);
  expect(pdfEinsatz.getPage(0).getSize().width).toBeGreaterThan(pdfEinsatz.getPage(0).getSize().height); // quer

  const gross = await page.goto(url(`/p/${STABSLAGE}/druck/a4`));
  expect(gross?.status()).toBe(200);
  await warteAufGestreamteInhalte(page);
  const blaetter = page.locator("svg.kp-blatt");
  const anzahl = await blaetter.count();
  expect(anzahl).toBeGreaterThanOrEqual(2);
  for (const blatt of await blaetter.all()) expect(await blatt.locator("[data-karte]").count()).toBeGreaterThan(0);
  const pdfGross = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(pdfGross.getPageCount()).toBe(anzahl);
  for (const seite of pdfGross.getPages()) expect(seite.getSize().width).toBeGreaterThan(seite.getSize().height);

  // A3 quer: eigene Route mit eigenem benannten @page (Falle 18; Umsetzungsplan Phase 5, Entscheidung 13)
  const a3 = await page.goto(url(`/p/${EINSATZ}/druck/a3`));
  expect(a3?.status()).toBe(200);
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("main.kp-druck")).toHaveAttribute("data-format", "a3-quer");
  const pdfA3 = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  const groesse = pdfA3.getPage(0).getSize();
  // 420 × 297 mm in pt; Chromium rundet die Seite auf ganze CSS-Pixel (gemessen 1191,12 × 841,92)
  expect(Math.abs(groesse.width - 1190.55)).toBeLessThan(1);
  expect(Math.abs(groesse.height - 841.89)).toBeLessThan(1);
});

test("ohne Anmeldung geht es zum Login; Pfade außerhalb von p/ laufen nicht in den Riegel", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page).toHaveURL(/\/login/);
  // Abweichung 11: /robots.txt u. ä. werden auf /m/kommplan/robots.txt umgeschrieben. Ohne
  // dynamisches Segment unter der Modulwurzel ist das ein schlichter 404 — kein Login-Umweg,
  // keine login_required-Auditzeile je Crawler-Abruf.
  const robots = await page.goto(url("/robots.txt"));
  expect(robots?.status()).toBe(404);
  expect(page.url()).not.toMatch(/\/login/);
});

test("ohne Gruppe: 404 auf Liste, Plan und Druck", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "andere", callbackPath: "/login" });
  for (const pfad of ["/", `/p/${EINSATZ}`, `/p/${EINSATZ}/druck/a4`, `/p/${EINSATZ}/druck/a3`]) {
    expect((await page.goto(url(pfad)))?.status(), pfad).toBe(404);
  }
});

test("unbekannter Plan: 404 auf Betrachter und Druck", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  for (const pfad of ["/p/gibt-es-nicht", "/p/gibt-es-nicht/druck/a4", "/p/gibt-es-nicht/druck/a3"]) {
    expect((await page.goto(url(pfad)))?.status(), pfad).toBe(404);
  }
});

/**
 * Eigener Test mit frischer Sitzung (Vorbild `einsatzbuch.spec.ts`): ein zweiter `devLogin` auf dem
 * fremden Host, während die Sitzung von oben noch gilt, landet auf dessen 404 statt auf dem Formular.
 */
test("fremder Suite-Host liefert das Modul nicht aus", async ({ page }) => {
  await devLogin(page, { host: "feedback.localtest.me", groups: "iuk-kommplan", callbackPath: "/login" });
  expect((await page.goto(`http://feedback.localtest.me:${E2E_PORT}/m/kommplan`))?.status()).toBe(404);
});
