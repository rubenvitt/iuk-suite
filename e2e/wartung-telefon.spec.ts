import { expect, test, type Browser, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, oeffneMenue, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul wartung am Telefon (IDA-381), bei 320 px (und, wo billig, 390 px) jeweils ohne Querscrollen:
 * Betriebsstunden mit Komma, Sprung- und Korrektur-Rückfrage; Mangel ohne Anmeldung ohne Vorauswahl der
 * Einsatzfrage, danach am Steckbrief für jeden sichtbar; die Kennzahl „nicht einsatzbereit“ führt auf genau
 * diese Liste, und in der Akte steht die Markierung auf „Geräte“; Entnehmen aus der Kiste mit Zähler und
 * Meldung bei zu viel. Die Namen tragen eine Zufallszahl, damit Wiederholungen durchlaufen.
 */
const HOST = "wartung.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

async function ohneUeberlauf(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** Der Admin legt ein Gerät an (Gruppe Technik bzw. I&K) und landet in der Akte; zurück kommt die ID. */
async function legeAn(page: Page, w: { name: string; art?: string; gruppe?: "Technik" | "I&K"; stunden?: string }): Promise<string> {
  await page.goto(url("/geraete"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Gerät anlegen" }));
  const dialog = page.getByRole("dialog", { name: "Gerät anlegen" });
  await dialog.getByLabel(w.gruppe ?? "Technik", { exact: true }).check();
  if (w.art) {
    await dialog.getByLabel("Geräteart").click();
    await klickeWennRuhig(page.locator(".ant-select-item-option", { hasText: w.art }));
  }
  await dialog.getByLabel("Bezeichnung").fill(w.name);
  await dialog.getByLabel("Standort").fill("Lager E2E");
  if (w.stunden) await dialog.getByLabel("Betriebsstunden").fill(w.stunden);
  await klickeWennRuhig(dialog.getByRole("button", { name: "Speichern" }));
  await page.waitForURL(/\/geraete\/[0-9a-f-]{36}$/);
  await warteAufGestreamteInhalte(page);
  return page.url().split("/").pop()!;
}

async function telefon(browser: Browser, breite: number, von?: Page) {
  const kontext = await browser.newContext({
    viewport: { width: breite, height: 720 },
    ...(von ? { storageState: await von.context().storageState() } : {}),
  });
  return { kontext, seite: await kontext.newPage() };
}

async function admin(page: Page) {
  await devLogin(page, { host: HOST, email: "admin@localtest.me", groups: "wartung-admin", callbackPath: "/geraete" });
}

test("Betriebsstunden: Komma rundet, großer Sprung fragt nach, nur Verwaltende korrigieren nach unten", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const name = `Stromerzeuger Stunden ${Date.now() % 100_000}`;
  await admin(page);
  const id = await legeAn(page, { name, art: "Stromerzeuger", stunden: "200" });

  // Wer nur Zugang hat, liest am Telefon ab.
  const nutzerKontext = await browser.newContext({ viewport: { width: 320, height: 720 } });
  const nutzer = await nutzerKontext.newPage();
  await devLogin(nutzer, { host: HOST, email: `stunden-${Date.now() % 100_000}@localtest.me`, groups: "wartung-nutzer", callbackPath: `/g/${id}/stunden` });
  await nutzer.goto(url(`/g/${id}/stunden`));
  await warteAufGestreamteInhalte(nutzer);
  const feld = nutzer.getByLabel("Stand am Zähler");
  const zeile = nutzer.locator('[data-rolle="stunden-zeile"]');
  await expect(zeile).toHaveText("Zuletzt 200 h");
  await feld.fill("231,5");
  await expect(zeile).toHaveText("Gerundet auf 232 h");
  await expect(nutzer.locator('[data-rolle="stunden-rueckfrage"]')).toHaveCount(0);
  await ohneUeberlauf(nutzer);
  await klickeWennRuhig(nutzer.getByRole("button", { name: "Speichern" }));
  await nutzer.waitForURL(new RegExp(`/g/${id}$`));
  await warteAufGestreamteInhalte(nutzer);
  await expect(nutzer.getByText("232 h", { exact: true })).toBeVisible();
  await expect(nutzer.getByText("2.315 h")).toHaveCount(0);
  await ohneUeberlauf(nutzer);

  // Ein großer Sprung geht erst nach Rückfrage.
  await klickeWennRuhig(nutzer.getByRole("link", { name: "Betriebsstunden eintragen" }));
  await nutzer.waitForURL(/\/stunden$/);
  await warteAufGestreamteInhalte(nutzer);
  await feld.fill("5000");
  await klickeWennRuhig(nutzer.getByRole("button", { name: "Speichern" }));
  const rueckfrage = nutzer.locator('[data-rolle="stunden-rueckfrage"]');
  await expect(rueckfrage).toHaveText("+4.768 h seit dem letzten Stand?");
  await ohneUeberlauf(nutzer);
  await klickeWennRuhig(nutzer.getByRole("button", { name: "Ja, speichern" }));
  await nutzer.waitForURL(new RegExp(`/g/${id}$`));
  await warteAufGestreamteInhalte(nutzer);
  await expect(nutzer.getByText("5.000 h", { exact: true })).toBeVisible();

  // Kleiner als der letzte Stand: ohne Verwaltung gesperrt.
  await nutzer.goto(url(`/g/${id}/stunden`));
  await warteAufGestreamteInhalte(nutzer);
  await feld.fill("300");
  await expect(zeile).toHaveText("Kleiner als der letzte Stand (5.000 h).");
  await expect(nutzer.getByRole("button", { name: "Speichern" })).toBeDisabled();
  await expect(nutzer.getByRole("button", { name: "Korrigieren" })).toHaveCount(0);
  await nutzerKontext.close();

  // Der Admin verwaltet die Gruppe und korrigiert nach Rückfrage (390 px).
  const { kontext, seite: handy } = await telefon(browser, 390, page);
  await handy.goto(url(`/g/${id}/stunden`));
  await warteAufGestreamteInhalte(handy);
  await handy.getByLabel("Stand am Zähler").fill("300");
  await klickeWennRuhig(handy.getByRole("button", { name: "Korrigieren", exact: true }));
  await expect(handy.locator('[data-rolle="stunden-rueckfrage"]')).toHaveText("Stand von 5.000 h auf 300 h korrigieren?");
  await ohneUeberlauf(handy);
  await klickeWennRuhig(handy.getByRole("button", { name: "Ja, korrigieren" }));
  await handy.waitForURL(new RegExp(`/g/${id}$`));
  await warteAufGestreamteInhalte(handy);
  await expect(handy.getByText("300 h", { exact: true })).toBeVisible();
  await ohneUeberlauf(handy);
  await kontext.close();
});

test("Mangel ohne Anmeldung: Einsatzfrage ohne Vorauswahl, danach am Steckbrief und in der Übersicht", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const nr = Date.now() % 100_000;
  const name = `Zeltheizung Mangel ${nr}`;
  const text = `Brenner zündet nicht ${nr}`;
  await admin(page);
  const id = await legeAn(page, { name });

  const { kontext: gastKontext, seite: gast } = await telefon(browser, 320);
  // Falle 10: die Route einmal anfragen, bevor der POST kommt.
  await gast.request.get(url(`/g/${id}/mangel/senden`));
  await gast.goto(url(`/g/${id}/mangel`));
  await warteAufGestreamteInhalte(gast);
  await expect(gast.getByRole("heading", { name: "Mangel melden" })).toBeVisible();
  const wahl = gast.getByRole("radiogroup", { name: "Kann das Gerät noch raus?" });
  await expect(wahl.locator('input[type="radio"]')).toHaveCount(2);
  await expect(wahl.locator('input[type="radio"]:checked')).toHaveCount(0);
  await gast.getByLabel("Was ist los?").fill(text);
  await gast.getByLabel("Dein Name").fill("Gast E2E");
  await ohneUeberlauf(gast);

  // Ohne Wahl geht nichts raus.
  let gesendet = 0;
  gast.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith(`/g/${id}/mangel/senden`)) gesendet++;
  });
  await klickeWennRuhig(gast.getByRole("button", { name: "Mangel melden" }));
  await expect(gast.locator('[data-rolle="wahl-fehlt"]')).toHaveText("Bitte wählen, ob das Gerät noch raus kann.");
  expect(gesendet).toBe(0);
  await ohneUeberlauf(gast);

  // Das Radio ist unsichtbar, getippt wird die Beschriftung.
  await gast.getByText("Nein, nicht einsatzbereit").click();
  await expect(gast.getByLabel("Nein, nicht einsatzbereit")).toBeChecked();
  await expect(gast.locator('[data-rolle="wahl-fehlt"]')).toHaveCount(0);
  const meldung = gast.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/g/${id}/mangel/senden`));
  await klickeWennRuhig(gast.getByRole("button", { name: "Mangel melden" }));
  expect((await meldung).status()).toBe(200);
  await expect(gast.locator('[data-rolle="mangel-fertig"]')).toContainText("Mangel gemeldet");
  await expect(gast.locator('[data-rolle="mangel-folge"]')).toHaveText(
    "Das Gerät steht jetzt auf „Nicht einsatzbereit“, und die Verwaltung der Gruppe sieht den Mangel in ihrer Mängelliste.",
  );
  await ohneUeberlauf(gast);

  // Der Nächste am Gerät sieht, dass es schon gemeldet ist (320 und 390 px).
  for (const breite of [320, 390]) {
    await gast.setViewportSize({ width: breite, height: 720 });
    await gast.goto(url(`/g/${id}`));
    await warteAufGestreamteInhalte(gast);
    const offen = gast.locator('[data-rolle="offene-maengel"]');
    await expect(offen).toContainText("1 offener Mangel");
    await expect(offen.locator('[data-rolle="offener-mangel"]')).toHaveCount(1);
    await expect(offen).toContainText(text);
    await expect(offen).not.toContainText("Gast E2E");
    await ohneUeberlauf(gast);
  }
  await gastKontext.close();

  // Übersicht am Telefon: die Kennzahl führt auf die gefilterte Liste, und die zeigt das Gerät.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(url("/"));
  await warteAufGestreamteInhalte(page);
  const kennzahl = page.getByRole("group", { name: "Lage" }).getByRole("link", { name: /nicht einsatzbereit/ });
  await expect(kennzahl).toHaveAttribute("href", "/geraete?zustand=defekt");
  await ohneUeberlauf(page);
  await klickeWennRuhig(kennzahl);
  await page.waitForURL(/\/geraete\?zustand=defekt$/);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await ohneUeberlauf(page);

  // In der Akte steht die Markierung auf „Geräte“, nicht auf „Übersicht“.
  await page.goto(url(`/geraete/${id}`));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await ohneUeberlauf(page);
  const menue = await oeffneMenue(page);
  await expect(menue.getByRole("link", { name: "Geräte", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(menue.getByRole("link", { name: "Übersicht", exact: true })).not.toHaveAttribute("aria-current", /.*/);
});

test("Kiste am Telefon: Zähler mit Plus und Minus, zu viel wird beanstandet, der Steckbrief zeigt den Rest", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const name = `Funkkiste E2E ${Date.now() % 100_000}`;
  await admin(page);
  const id = await legeAn(page, { name, gruppe: "I&K", art: "Materialkiste" });

  const { kontext, seite: handy } = await telefon(browser, 320, page);
  await handy.goto(url(`/g/${id}/inhalt`));
  await warteAufGestreamteInhalte(handy);
  await klickeWennRuhig(handy.getByRole("button", { name: "Position hinzufügen" }));
  const zeile = handy.locator('[data-rolle="inhalt-zeile"]').last();
  await zeile.getByPlaceholder("Position").fill("Handfunkgerät");
  await zeile.getByLabel(/Soll-Menge/).fill("6");
  await klickeWennRuhig(handy.getByRole("button", { name: "Speichern" }));
  await handy.waitForURL(new RegExp(`/g/${id}$`));
  await warteAufGestreamteInhalte(handy);
  await expect(handy.getByRole("region", { name: "Inhalt" })).toContainText("6 ×Handfunkgerät");

  await klickeWennRuhig(handy.getByRole("link", { name: "Entnehmen" }));
  await handy.waitForURL(/\/entnehmen$/);
  await warteAufGestreamteInhalte(handy);
  const menge = handy.getByLabel("Menge Handfunkgerät", { exact: true });
  const plus = handy.getByRole("button", { name: "Menge Handfunkgerät erhöhen" });
  const minus = handy.getByRole("button", { name: "Menge Handfunkgerät verringern" });
  const mitnehmen = handy.getByRole("button", { name: "Mitnehmen", exact: true });
  await expect(menge).toHaveValue("0");
  await expect(minus).toBeDisabled();
  await expect(mitnehmen).toBeDisabled();
  await plus.click();
  await plus.click();
  await expect(menge).toHaveValue("2");
  await minus.click();
  await expect(menge).toHaveValue("1");
  await ohneUeberlauf(handy);

  // Mehr getippt, als da ist: Meldung am Feld, Knopf gesperrt.
  await menge.fill("9");
  await expect(handy.locator('[data-rolle="zu-viel"]')).toHaveText("Nur 6 da.");
  await expect(mitnehmen).toBeDisabled();
  await expect(plus).toBeDisabled();
  await ohneUeberlauf(handy);

  await menge.fill("2");
  await expect(handy.locator('[data-rolle="zu-viel"]')).toHaveCount(0);
  await expect(mitnehmen).toBeEnabled();
  await klickeWennRuhig(mitnehmen);
  await handy.waitForURL(new RegExp(`/g/${id}$`));
  await warteAufGestreamteInhalte(handy);
  await expect(handy.locator('[data-rolle="inhalt-da"]')).toHaveText("4 von 6 da");
  await ohneUeberlauf(handy);
  await handy.setViewportSize({ width: 390, height: 720 });
  await ohneUeberlauf(handy);
  await kontext.close();
});
