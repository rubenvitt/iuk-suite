import { expect, test, type Locator } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul lagemonitor (LGM-5): die Vorschau folgt dem Formular vor dem Speichern, ein Zugang holt die
 * gespeicherten Einstellungen und Meldungen ab, ohne Recht gibt es die Seite nicht. Der Zustand entsteht im Test
 * selbst; die Werte sind so gewählt, dass Wiederholungen gegen dieselbe Datenbank durchlaufen.
 */
const HOST = "lagemonitor.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;


/**
 * Ein Knopf eines antd-`Radio.Group` mit `optionType="button"`: das `input` ist 0×0 versteckt, bedienbar
 * ist das Label (wie `lagerbuch-einheitenart.spec.ts`, `artKnopf`).
 */
function wahlKnopf(bereich: Locator, beschriftung: string): Locator {
  return bereich.locator("label.ant-radio-button-wrapper").filter({ hasText: beschriftung });
}
test("Vorschau folgt dem Formular, Zugang holt das Gespeicherte ab", async ({ page }) => {
  const ort = `Teststadt ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Lagemonitor" })).toBeVisible();

  const vorschau = page.getByTestId("monitor-vorschau");
  const erklaerung = page.getByTestId("vorschau-erklaerung");
  await page.getByLabel("Standort", { exact: true }).fill(ort);
  await expect(vorschau).toContainText(`Lagemonitor · ${ort}`);

  // Unwetter: ab „Unwetterwarnung“ kommt der Starkregen ins Band, ab „Extremes Unwetter“ in die Liste.
  // Über das sichtbare Etikett: das Radio selbst ist ein 0 × 0-Input (wie `kommplan-gliederung.spec.ts`).
  const lage = page.getByRole("radiogroup", { name: "Beispiellage" });
  const schwelle = page.getByRole("radiogroup", { name: "Warnschwelle" });
  await klickeWennRuhig(lage.getByText("Unwetter", { exact: true }));
  await klickeWennRuhig(schwelle.getByText("Unwetterwarnung", { exact: true }));
  await expect(vorschau).toContainText("1 WARNUNG · Unwetterwarnung");
  await klickeWennRuhig(schwelle.getByText("Extremes Unwetter", { exact: true }));
  await expect(vorschau).toContainText("RUHE · 2 Warnungen unter Schwelle");
  await expect(erklaerung).toContainText("Kein Band");

  const radar = page.getByRole("switch", { name: "Regenradar" });
  // Auf „aus“ stellen, nicht blind umschalten: der Ausgangszustand kommt aus der Datenbank.
  if ((await radar.getAttribute("aria-checked")) === "true") await klickeWennRuhig(radar);
  await expect(radar).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/Ausgeschaltet:.*Regenradar/)).toBeVisible();
  await expect(page.getByText("Ungespeicherte Änderungen", { exact: false })).toBeVisible();

  // QR-Code fürs Ehrenamt: aus als Vorgabe; an steht er in ruhiger Lage unten rechts in der Vorschau.
  const qr = page.getByRole("switch", { name: "QR-Code fürs Ehrenamt zeigen" });
  if ((await qr.getAttribute("aria-checked")) === "false") await klickeWennRuhig(qr);
  await page.getByLabel("Wohin der Code führt").fill("https://drk.example.org/mitmachen");
  await expect(page.getByTestId("vorschau-qr")).toContainText("Lust mitzuhelfen?");

  await klickeWennRuhig(page.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Gespeichert. Der Monitor zeigt es spätestens in einer Minute.")).toBeVisible();

  await page.getByLabel("Neuer Zugang").fill("FüKw e2e");
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const zeilen = await page.getByTestId("neuer-schluessel").textContent();
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec(zeilen ?? "")?.[1];
  expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // Warmlauf ohne Schlüssel (Falle 10), zugleich die Gegenprobe.
  const ohne = await page.request.get(url("/api/konfiguration"));
  expect(ohne.status()).toBe(401);
  const mit = await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } });
  expect(mit.status()).toBe(200);
  const vertrag = await mit.json();
  expect(vertrag).toMatchObject({ version: 1, warnThreshold: "Extreme", location: { label: ort } });
  expect(vertrag.modules.radar).toBe(false);
  expect(vertrag.recruitment).toEqual({ url: "https://drk.example.org/mitmachen", text: "Lust mitzuhelfen? Werde Teil der Bereitschaft." });
});

test("Meldung steht in der Vorschau und im Drahtformat, Beenden nimmt sie weg", async ({ page }) => {
  const text = `Lagebesprechung e2e ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  // Reste eines abgebrochenen Laufs beenden: mehr als drei laufen nicht.
  const beenden = page.getByRole("button", { name: /^Meldung beenden:/ });
  while ((await beenden.count()) > 0) {
    const vorher = await beenden.count();
    await klickeWennRuhig(beenden.first());
    await expect(beenden).toHaveCount(vorher - 1);
  }

  const vorschau = page.getByTestId("monitor-vorschau");
  const neu = page.getByRole("form", { name: "Neue Meldung" });
  await neu.getByLabel("Text").fill(text);
  await neu.getByLabel("Herunterzählen bis (freiwillig)").fill("23:59");
  await klickeWennRuhig(wahlKnopf(neu, "Besprechung"));
  // Der Entwurf steht schon in der Vorschau, gestrichelt.
  await expect(page.getByTestId("vorschau-meldung").filter({ hasText: text })).toHaveAttribute("data-entwurf", "true");
  await expect(page.getByTestId("vorschau-erklaerung")).toContainText(`Meldungsband Besprechung (noch nicht angelegt): „${text}“`);

  // Eine ungespeicherte Änderung an der Anzeige überlebt das Anlegen (neuer Stand vom Server).
  await page.getByLabel("Standort", { exact: true }).fill("Ungespeichert");
  await klickeWennRuhig(neu.getByRole("button", { name: "Meldung anlegen" }));
  const laufend = page.getByRole("list", { name: "Laufende Meldungen" });
  await expect(laufend).toContainText(text);
  await expect(page.getByLabel("Standort", { exact: true })).toHaveValue("Ungespeichert");
  await expect(page.getByTestId("vorschau-meldung").filter({ hasText: text })).toHaveAttribute("data-entwurf", "false");
  await expect(vorschau).toContainText(/in \d+( h)?/);

  await page.getByLabel("Neuer Zugang").fill("Meldungen e2e");
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec((await page.getByTestId("neuer-schluessel").textContent()) ?? "")?.[1];
  const abholen = async () => (await (await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } })).json()).notices as { text: string; countdownTo: string | null; expiresAt: string; category: { name: string; color: string; icon: { paths: string[] } | null; alertLeadMinutes: number | null } | null }[];
  const notices = await abholen();
  const n = notices.find((x) => x.text === text);
  expect(n?.countdownTo).toMatch(/T\d\d:\d\d:00\.000Z$/);
  expect(n?.category).toMatchObject({ name: "Besprechung", color: "purple", alertLeadMinutes: 10 });
  expect(n?.category?.icon?.paths.length).toBeGreaterThan(0);
  // Ohne Angabe 24 Stunden.
  expect(Date.parse(n!.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3_600_000);

  await klickeWennRuhig(page.getByRole("button", { name: `Meldung beenden: ${text}` }));
  await expect(laufend).toHaveCount(0);
  expect((await abholen()).some((x) => x.text === text)).toBe(false);
});

test("TomTom-Schlüssel geht nur an den Monitor, die Vorschau zeigt die Verkehrsebenen", async ({ page }) => {
  const SCHLUESSEL = `E2e${Date.now()}`.padEnd(32, "x");
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  // Jede Server Action ist ein POST auf die Seite; die Antwort wird geprüft, nicht nur der Text danach (Falle 10).
  const speichern = async () => {
    const [antwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url() === url("/")),
      klickeWennRuhig(page.getByRole("button", { name: "Speichern" })),
    ]);
    expect(antwort.status()).toBe(200);
    await expect(page.getByText("Gespeichert. Der Monitor zeigt es spätestens in einer Minute.")).toBeVisible();
  };
  // Ein Schlüssel aus einem früheren Lauf gegen dieselbe Datenbank: erst entfernen, sonst gilt er weiter.
  if (await page.getByText("Ein TomTom-Schlüssel ist hinterlegt.").isVisible()) {
    await klickeWennRuhig(page.getByRole("button", { name: "Schlüssel entfernen" }));
    await speichern();
  }

  const fluss = page.getByRole("switch", { name: "Verkehrsfluss" });
  if ((await fluss.getAttribute("aria-checked")) === "false") await klickeWennRuhig(fluss);
  const feld = page.getByLabel("API-Schlüssel von TomTom");
  await expect(page.getByText("Ohne TomTom-Schlüssel zeigt der Monitor weder Verkehrsfluss noch Baustellen.")).toBeVisible();
  await expect(page.getByTestId("vorschau-verkehr")).toHaveCount(0);
  await feld.fill(SCHLUESSEL);
  await expect(page.getByTestId("vorschau-verkehr")).toBeVisible();
  await expect(page.getByTestId("vorschau-erklaerung")).toContainText("Verkehrsfluss");

  await speichern();
  await expect(page.getByText("Ein TomTom-Schlüssel ist hinterlegt.")).toBeVisible();
  await page.reload();
  await warteAufGestreamteInhalte(page);
  expect(await page.content()).not.toContain(SCHLUESSEL);

  await page.getByLabel("Neuer Zugang").fill("Verkehr e2e");
  const [angelegt] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url() === url("/")),
    klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" })),
  ]);
  expect(angelegt.status()).toBe(200);
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec((await page.getByTestId("neuer-schluessel").textContent()) ?? "")?.[1];
  const vertrag = await (await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } })).json();
  expect(vertrag.traffic).toMatchObject({ tomtomKey: SCHLUESSEL, flow: true });
});

test("ohne Admin-Gruppe gibt es die Seite nicht", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(404);
});

test("Kategorie anlegen, ändern und löschen", async ({ page }) => {
  const name = `Funk ${Date.now() % 10_000}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  const liste = page.getByRole("list", { name: "Kategorien" });
  await expect(liste).toContainText("Lagemeldung");

  await klickeWennRuhig(page.getByRole("button", { name: "Neue Kategorie" }));
  const neu = page.getByRole("form", { name: "Neue Kategorie" });
  await neu.getByLabel("Name").fill(name);
  await klickeWennRuhig(wahlKnopf(neu, "Funkgerät"));
  await klickeWennRuhig(wahlKnopf(neu, "Türkis"));
  await klickeWennRuhig(wahlKnopf(neu, "Nie"));
  await klickeWennRuhig(neu.getByRole("button", { name: "Kategorie anlegen" }));
  await expect(liste).toContainText(name);
  // Sofort beim Anlegen einer Meldung wählbar.
  await expect(wahlKnopf(page.getByRole("form", { name: "Neue Meldung" }), name)).toBeVisible();

  await klickeWennRuhig(page.getByRole("button", { name: `Kategorie ändern: ${name}` }));
  const aendern = page.getByRole("form", { name: `Kategorie „${name}“ ändern` });
  await aendern.getByLabel("Name").fill(`${name} neu`);
  await klickeWennRuhig(aendern.getByRole("button", { name: "Speichern" }));
  await expect(liste).toContainText(`${name} neu`);

  await klickeWennRuhig(page.getByRole("button", { name: `Kategorie löschen: ${name} neu` }));
  await klickeWennRuhig(page.getByRole("button", { name: "Löschen", exact: true }).last());
  await expect(liste).not.toContainText(`${name} neu`);
});
