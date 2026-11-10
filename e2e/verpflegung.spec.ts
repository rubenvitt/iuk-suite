import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul verpflegung (IDA-316): der Admin legt einen Lagerort, einen Artikel mit EAN und einen Helfer-Link an.
 * Ein Helfer ohne Konto öffnet den Link am Telefon, bucht ein, gibt nach FEFO aus, sondert aus und legt eine
 * unbekannte Packung vorläufig an; die Verwaltung sieht die Buchungen unter dem Namen des Links. Ohne Link
 * bleibt das Telefon zu, ein gesperrter Link wirkt sofort, und wer nur Zugang hat, kommt nicht an die Links.
 * Namen und EANs tragen eine Zufallszahl, damit Wiederholungen durchlaufen.
 */
const HOST = "verpflegung.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const tagIn = (tage: number) => new Date(Date.now() + tage * 86_400_000).toISOString().slice(0, 10);

async function breitOk(page: Page, wo: string) {
  const m = await page.evaluate(() => ({ vw: document.documentElement.clientWidth, dok: document.documentElement.scrollWidth }));
  expect(m.dok, `${wo}: ${m.dok}px bei ${m.vw}px`).toBeLessThanOrEqual(m.vw);
}

async function scanneEan(handy: Page, ean: string) {
  await handy.locator('[data-rolle="artikel-suche"]').fill(ean);
  await klickeWennRuhig(handy.getByRole("button", { name: `Weiter mit ${ean}` }));
}

test("Lager einrichten, mit Zugangscode am Telefon buchen, Buchungen in der Verwaltung sehen", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const n = Date.now() % 100_000;
  const ort = `Regal E2E ${n}`;
  const artikel = `Erbsensuppe E2E ${n}`;
  const ean = `40${String(n).padStart(5, "0")}000001`;
  const fremd = `40${String(n).padStart(5, "0")}000002`;
  const anlass = `Dienstabend E2E ${n}`;

  await devLogin(page, { host: HOST, email: "leitung@localtest.me", groups: "verpflegung-admin", callbackPath: "/orte" });
  await page.goto(url("/orte"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Lagerort anlegen" }));
  const ortDialog = page.getByRole("dialog", { name: "Lagerort anlegen" });
  await ortDialog.getByLabel("Name").fill(ort);
  await ortDialog.getByLabel("Kürzel").fill(`E2E ${n}`);
  await klickeWennRuhig(ortDialog.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Lagerort angelegt.")).toBeVisible();

  await page.goto(url("/artikel"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Artikel anlegen" }));
  const artDialog = page.getByRole("dialog", { name: "Artikel anlegen" });
  await artDialog.locator("input#ean").fill(ean);
  await artDialog.getByLabel("Name").fill(artikel);
  await klickeWennRuhig(artDialog.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Artikel angelegt.")).toBeVisible();

  await page.goto(url("/links"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Zugangscode anlegen" }));
  const linkDialog = page.getByRole("dialog", { name: "Zugangscode anlegen" });
  await linkDialog.getByLabel("Bezeichnung").fill(anlass);
  await klickeWennRuhig(linkDialog.getByRole("button", { name: "Anlegen" }));
  const adresse = (await page.locator('[data-rolle="helfer-adresse"]').textContent())!.trim();
  expect(adresse.startsWith(url("/t/"))).toBe(true);
  expect(adresse.slice(url("/t/").length)).toMatch(/^[0-9A-Z-]{34}$/);

  // Am Telefon, ohne Konto.
  const handyKontext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const handy = await handyKontext.newPage();
  await handy.goto(url("/h"));
  await expect(handy.locator('[data-rolle="kein-zugang"]')).toHaveText("Kein Zugang.");
  await handy.goto(adresse);
  await handy.waitForURL(/\/h$/);
  await expect(handy.locator('[data-rolle="wer"]')).toContainText(`Zugangscode · ${anlass}`);
  await klickeWennRuhig(handy.getByRole("button", { name: "Ort wechseln" }));
  const ortWahl = handy.getByRole("dialog", { name: "Ort wechseln" });
  await klickeWennRuhig(ortWahl.getByRole("button", { name: new RegExp(ort) }));
  await expect(handy.locator('[data-rolle="ort"]')).toContainText(ort);

  // Einbuchen: zwei Chargen, die spätere zuerst; jede über die Liste, gescannt.
  await klickeWennRuhig(handy.getByRole("button", { name: "Einbuchen", exact: true }));
  for (const [tage, menge] of [[90, 3], [40, 2]] as const) {
    await scanneEan(handy, ean);
    await handy.getByLabel("Mindestens haltbar bis").fill(tagIn(tage));
    for (let i = 1; i < menge; i++) await klickeWennRuhig(handy.getByRole("button", { name: "mehr" }));
    await klickeWennRuhig(handy.getByRole("button", { name: `${menge} Stück einbuchen` }));
    await expect(handy.getByRole("status")).toContainText(`${menge} Stück ${artikel} eingebucht`);
    await klickeWennRuhig(handy.getByRole("button", { name: "Zurück" }));
  }

  // Unbekannte Packung: vorläufig anlegen und gleich einbuchen.
  await scanneEan(handy, fremd);
  await klickeWennRuhig(handy.getByRole("button", { name: "Artikel vorläufig anlegen" }));
  await handy.getByLabel("Bezeichnung").fill(`Linseneintopf E2E ${n}`);
  await klickeWennRuhig(handy.getByRole("button", { name: "Anlegen und weiter" }));
  await handy.getByLabel("Mindestens haltbar bis").fill(tagIn(200));
  await klickeWennRuhig(handy.getByRole("button", { name: "1 Stück einbuchen" }));
  await expect(handy.getByRole("status")).toContainText("eingebucht");
  await breitOk(handy, "Telefon nach dem Einbuchen");

  // Ausgeben: „Zuerst ablaufende“ ist vorgewählt und nimmt die Charge mit dem früheren MHD.
  await klickeWennRuhig(handy.getByRole("button", { name: "Ausgeben", exact: true }));
  await scanneEan(handy, ean);
  const chargen = handy.getByRole("radiogroup", { name: "Charge" });
  await expect(chargen.getByRole("radio", { name: "Zuerst ablaufende" })).toBeChecked();
  await expect(chargen.locator("label").nth(1)).toContainText(tagIn(40).split("-").reverse().join("."));
  await klickeWennRuhig(handy.getByRole("button", { name: "1 Stück ausgeben" }));
  await expect(handy.getByRole("status")).toContainText(`1 Stück ${artikel} ausgegeben`);
  await expect(chargen.locator("label").nth(1)).toContainText("1Stück");

  // Aussondern über die Suche nach dem Namen, Charge von Hand gewählt.
  await klickeWennRuhig(handy.getByRole("button", { name: "Aussondern", exact: true }));
  await handy.locator('[data-rolle="artikel-suche"]').fill(artikel);
  await klickeWennRuhig(handy.locator('[data-rolle="artikel-zeile"]', { hasText: artikel }));
  await klickeWennRuhig(handy.getByRole("radiogroup", { name: "Charge" }).locator("label", { hasText: tagIn(90).split("-").reverse().join(".") }));
  await klickeWennRuhig(handy.getByRole("button", { name: "beschädigt", exact: true }));
  await klickeWennRuhig(handy.getByRole("button", { name: "3 Stück aussondern" }));
  await expect(handy.getByRole("status")).toContainText(`3 Stück ${artikel} ausgesondert (beschädigt)`);

  await klickeWennRuhig(handy.getByRole("button", { name: "Bestand", exact: true }));
  await klickeWennRuhig(handy.locator('[data-rolle="artikel-zeile"]', { hasText: artikel }));
  await expect(handy.getByLabel("Chargen")).toContainText(tagIn(40).split("-").reverse().join("."));
  for (const breite of [390, 320]) {
    await handy.setViewportSize({ width: breite, height: 760 });
    await breitOk(handy, `Telefon bei ${breite}px`);
  }
  // Tablet und Schreibtisch: Reiter oben, Inhalt nicht auf Telefonbreite.
  for (const breite of [820, 1366]) {
    await handy.setViewportSize({ width: breite, height: 900 });
    await breitOk(handy, `Telefon bei ${breite}px`);
    const leiste = (await handy.getByRole("navigation", { name: "Bereiche" }).boundingBox())!;
    const inhalt = (await handy.locator("main").boundingBox())!;
    expect(leiste.y, `Reiter bei ${breite}px oben`).toBeLessThan(inhalt.y);
    expect(inhalt.width, `Inhalt bei ${breite}px`).toBeGreaterThan(breite - 40);
  }

  // Am Schreibtisch (IDA-382): Bestand je Artikel, einbuchen in der Zeile, Chargen aufklappen und ausgeben.
  const tag40 = tagIn(40).split("-").reverse().join(".");
  await page.goto(url("/bestand"));
  await warteAufGestreamteInhalte(page);
  // Die Artikelzeile, nicht die aufgeklappte Chargenzeile darunter: nur sie trägt „Einbuchen“.
  const zeile = page.getByRole("row").filter({ hasText: artikel }).filter({ has: page.getByRole("button", { name: "Einbuchen" }) });
  await expect(zeile).toContainText("1 Stück");
  await klickeWennRuhig(zeile.getByRole("button", { name: "Einbuchen" }));
  const einDialog = page.getByRole("dialog", { name: "Einbuchen" });
  await expect(einDialog.getByRole("button", { name: /wählen$/ })).toBeDisabled();
  await einDialog.getByLabel("Mindestens haltbar bis").fill(tagIn(60));
  await einDialog.getByLabel("Menge").fill("2");
  await klickeWennRuhig(einDialog.getByLabel("Lagerort"));
  await klickeWennRuhig(page.locator(".ant-select-item-option", { hasText: ort }));
  await klickeWennRuhig(einDialog.getByRole("button", { name: "Einbuchen" }));
  await expect(page.getByText(/^Eingebucht \(MHD/)).toBeVisible();
  await expect(zeile).toContainText("3 Stück");
  await klickeWennRuhig(page.getByRole("button", { name: `Chargen ${artikel} anzeigen` }));
  const charge40 = page.getByRole("list", { name: `Chargen ${artikel}` }).getByRole("listitem").filter({ hasText: tag40 });
  await klickeWennRuhig(charge40.getByRole("button", { name: "Ausgeben" }));
  await klickeWennRuhig(page.getByRole("dialog", { name: "Ausgeben" }).getByRole("button", { name: "Ausgeben" }));
  await expect(page.getByText(`1 Stück ${artikel} ausgegeben.`)).toBeVisible();
  await expect(zeile).toContainText("2 Stück");
  // Die frühere MHD-Kontrolle ist eine Stufe des Bestands.
  await page.goto(url("/mhd"));
  await expect(page).toHaveURL(/\/bestand\?stufe=kritisch$/);
  await expect(page.getByRole("radio", { name: "Kritisch" })).toHaveAttribute("aria-checked", "true");

  // Die Verwaltung sieht die Buchungen unter dem Namen des Links und den vorläufigen Artikel.
  await page.goto(url("/buchungen"));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("row", { name: new RegExp(`Aussonderung.*${artikel}`) })).toContainText(`Zugangscode · ${anlass}`);
  // Zwei Ausgaben: die vom Telefon unter dem Link, die vom Schreibtisch unter der Person (IDA-382).
  await expect(page.getByRole("row", { name: new RegExp(`Ausgabe.*${artikel}.*Zugangscode · ${anlass}`) })).toContainText("Dienstabend");
  await expect(page.getByRole("row", { name: new RegExp(`Ausgabe.*${artikel}`) })).toHaveCount(2);
  await page.goto(url("/artikel"));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("row", { name: new RegExp(`Linseneintopf E2E ${n}`) })).toContainText("vorläufig");

  // Sperren wirkt sofort auf das Telefon.
  await page.goto(url("/links"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("row", { name: new RegExp(anlass) }).getByRole("button", { name: "Sperren" }));
  await klickeWennRuhig(page.locator(".ant-popover").getByRole("button", { name: "Sperren" }));
  await expect(page.getByRole("row", { name: new RegExp(anlass) })).toContainText("gesperrt");
  await handy.goto(url("/h"));
  await expect(handy.locator('[data-rolle="kein-zugang"]')).toHaveText("Kein Zugang.");
  await handy.goto(adresse);
  await expect(handy.locator('[data-rolle="kein-zugang"]')).toHaveText("Dieser Zugangscode gilt nicht mehr.");
  await handyKontext.close();
});

test("ohne Admin keine Lagerorte und Links, auf fremdem Host kein Modul", async ({ page }) => {
  await devLogin(page, { host: HOST, email: "helfer@localtest.me", groups: "verpflegung-nutzer", callbackPath: "/" });
  await page.goto(url("/"));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zugangscodes" })).toHaveCount(0);
  expect((await page.goto(url("/links")))?.status()).toBe(404);
  expect((await page.goto(url("/orte")))?.status()).toBe(404);
  expect((await page.request.get(`http://portal.localtest.me:${E2E_PORT}/m/verpflegung/h`)).status()).toBe(404);
});
