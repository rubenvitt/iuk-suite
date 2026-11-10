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
  await page.goto(url("/einrichtung"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Einrichtung", level: 1 })).toBeVisible();

  const vorschau = page.getByTestId("monitor-vorschau");

  // Unwetter: ab „Unwetterwarnung“ kommt der Starkregen ins Band, ab „Extremes Unwetter“ in die Liste.
  // Über das sichtbare Etikett: das Radio selbst ist ein 0 × 0-Input (wie `kommplan-gliederung.spec.ts`).
  const lage = page.getByRole("radiogroup", { name: "Beispiellage" });
  const schwelle = page.getByRole("radiogroup", { name: "Warnschwelle" });
  await klickeWennRuhig(lage.getByText("Unwetter", { exact: true }));
  await klickeWennRuhig(schwelle.getByText("Unwetterwarnung", { exact: true }));
  await expect(vorschau).toContainText("1 WARNUNG · Unwetterwarnung");
  await klickeWennRuhig(schwelle.getByText("Extremes Unwetter", { exact: true }));
  await expect(vorschau).toContainText("RUHE · 2 Warnungen unter Schwelle");

  const radar = page.getByRole("switch", { name: "Regenradar" });
  // Auf „aus“ stellen, nicht blind umschalten: der Ausgangszustand kommt aus der Datenbank.
  if ((await radar.getAttribute("aria-checked")) === "true") await klickeWennRuhig(radar);
  await expect(radar).toHaveAttribute("aria-checked", "false");
  await expect(vorschau.locator('[data-rolle="vorschau-radar"]')).toHaveCount(0);
  await expect(page.getByText("Ungespeicherte Änderungen", { exact: false })).toBeVisible();

  // QR-Code fürs Ehrenamt: aus als Vorgabe; an steht er in ruhiger Lage unten rechts in der Vorschau.
  const qr = page.getByRole("switch", { name: "QR-Code fürs Ehrenamt zeigen" });
  if ((await qr.getAttribute("aria-checked")) === "false") await klickeWennRuhig(qr);
  await page.getByLabel("Wohin der Code führt").fill("https://drk.example.org/mitmachen");
  await expect(page.getByTestId("vorschau-qr")).toContainText("Lust mitzuhelfen?");

  await klickeWennRuhig(page.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible();

  await page.getByLabel("Neuer Zugang").fill("FüKw e2e");
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const zeilen = await page.getByTestId("neuer-schluessel").textContent();
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec(zeilen ?? "")?.[1];
  expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await klickeWennRuhig(page.getByRole("button", { name: "Fertig" }));

  // Standort je Monitor (IDA-333): ein fester Ort mit eigenem Zeichen.
  await klickeWennRuhig(page.getByRole("button", { name: "Standort bearbeiten: FüKw e2e" }).first());
  const standort = page.getByRole("form", { name: "Standort von FüKw e2e" });
  await klickeWennRuhig(wahlKnopf(standort, "Fester Ort"));
  await standort.getByLabel("Name").fill(ort);
  await standort.getByLabel("Breitengrad").fill("52,97");
  await standort.getByLabel("Längengrad").fill("10,56");
  await standort.getByLabel("Taktisches Zeichen").click();
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option").first().click();
  await klickeWennRuhig(standort.getByRole("button", { name: "Standort speichern" }));
  await expect(standort).toHaveCount(0);
  await expect(vorschau).toContainText(`Lagemonitor · ${ort}`);

  // Warmlauf ohne Schlüssel (Falle 10), zugleich die Gegenprobe.
  const ohne = await page.request.get(url("/api/konfiguration"));
  expect(ohne.status()).toBe(401);
  const mit = await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } });
  expect(mit.status()).toBe(200);
  const vertrag = await mit.json();
  expect(vertrag).toMatchObject({ version: 1, warnThreshold: "Extreme", location: { lat: 52.97, lon: 10.56, label: ort } });
  expect(vertrag.vehicles).toContainEqual(expect.objectContaining({ callSign: ort, own: true, fixed: true, lat: 52.97, lon: 10.56 }));
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

  await klickeWennRuhig(neu.getByRole("button", { name: "Meldung anlegen" }));
  const laufend = page.getByRole("list", { name: "Laufende und geplante Meldungen" });
  await expect(laufend).toContainText(text);
  await expect(page.getByTestId("vorschau-meldung").filter({ hasText: text })).toHaveAttribute("data-entwurf", "false");
  await expect(vorschau).toContainText(/in \d+( h)?/);

  // Der Zugang entsteht in der Einrichtung, einen Schritt von den Meldungen entfernt (IDA-396).
  await klickeWennRuhig(page.getByTestId("zur-einrichtung"));
  await expect(page.getByRole("heading", { name: "Einrichtung", level: 1 })).toBeVisible();
  await warteAufGestreamteInhalte(page);
  await page.getByLabel("Neuer Zugang").fill("Meldungen e2e");
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec((await page.getByTestId("neuer-schluessel").textContent()) ?? "")?.[1];
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  const abholen = async () => (await (await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } })).json()).notices as { text: string; countdownTo: string | null; expiresAt: string; showFrom: string | null; category: { name: string; color: string; icon: { paths: string[] } | null; alertLeadMinutes: number | null } | null }[];
  const notices = await abholen();
  const n = notices.find((x) => x.text === text);
  expect(n?.countdownTo).toMatch(/T\d\d:\d\d:00\.000Z$/);
  expect(n?.category).toMatchObject({ name: "Besprechung", color: "purple", alertLeadMinutes: 10 });
  expect(n?.category?.icon?.paths.length).toBeGreaterThan(0);
  // „Besprechung“ verschwindet nach der Vorgabe 15 Minuten nach der Uhrzeit, lange vor dem Ende der Laufzeit (ein Tag).
  expect(Date.parse(n!.expiresAt) - Date.parse(n!.countdownTo!)).toBe(15 * 60_000);
  expect(n?.showFrom).toBeNull();

  // Eine geplante Meldung steht in der Liste, geht aber erst kurz vor ihrem Beginn an den Monitor.
  const geplant = `Geplant e2e ${Date.now() % 100_000}`;
  const inZweiStunden = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(Date.now() + 2 * 3_600_000);
  await neu.getByLabel("Text").fill(geplant);
  await neu.getByLabel("Anzeigen ab (freiwillig)").fill(inZweiStunden);
  await expect(neu.getByTestId("meldung-plan")).toContainText(`Erscheint`);
  await klickeWennRuhig(neu.getByRole("button", { name: "Meldung anlegen" }));
  await expect(laufend.getByRole("listitem").filter({ hasText: geplant })).toContainText("geplant ab");
  expect((await abholen()).some((x) => x.text === geplant)).toBe(false);
  await klickeWennRuhig(page.getByRole("button", { name: `Meldung beenden: ${geplant}` }));
  await expect(laufend).not.toContainText(geplant);

  await klickeWennRuhig(page.getByRole("button", { name: `Meldung beenden: ${text}` }));
  await expect(laufend).toHaveCount(0);
  expect((await abholen()).some((x) => x.text === text)).toBe(false);
});

test("TomTom-Schlüssel geht nur an den Monitor, die Vorschau zeigt die Verkehrsebenen", async ({ page }) => {
  const SCHLUESSEL = `E2e${Date.now()}`.padEnd(32, "x");
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/einrichtung"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  // Jede Server Action ist ein POST auf die Seite; die Antwort wird geprüft, nicht nur der Text danach (Falle 10).
  const speichern = async () => {
    const [antwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url() === url("/einrichtung")),
      klickeWennRuhig(page.getByRole("button", { name: "Speichern" })),
    ]);
    expect(antwort.status()).toBe(200);
    await expect(page.getByText("Gespeichert", { exact: true })).toBeVisible();
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

  await speichern();
  await expect(page.getByText("Ein TomTom-Schlüssel ist hinterlegt.")).toBeVisible();
  await page.reload();
  await warteAufGestreamteInhalte(page);
  expect(await page.content()).not.toContain(SCHLUESSEL);

  await page.getByLabel("Neuer Zugang").fill("Verkehr e2e");
  const [angelegt] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url() === url("/einrichtung")),
    klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" })),
  ]);
  expect(angelegt.status()).toBe(200);
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec((await page.getByTestId("neuer-schluessel").textContent()) ?? "")?.[1];
  const vertrag = await (await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } })).json();
  expect(vertrag.traffic).toMatchObject({ tomtomKey: SCHLUESSEL, flow: true });
});

test("ohne Admin-Gruppe gibt es die Seiten nicht", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  expect((await page.goto(url("/")))?.status()).toBe(404);
  expect((await page.goto(url("/einrichtung")))?.status()).toBe(404);
});

test.describe("am Telefon (IDA-396)", () => {
  // Kein Gerät mit 320 px Breite ist so hoch wie ein heutiges Telefon; dort zählt nur, dass nichts seitlich überläuft.
  for (const [breite, hoehe, ohneScrollen] of [[320, 568, false], [375, 667, true], [390, 844, true]] as const) {
    test(`${breite} px: „Meldung anlegen“ ohne Scrollen, Einrichtung einen Schritt entfernt`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: hoehe });
      await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
      await page.goto(url("/"));
      await page.waitForLoadState("networkidle");
      await warteAufGestreamteInhalte(page);
      await expect(page.getByRole("heading", { name: "Meldungen", level: 1 })).toBeVisible();
      const anlegen = page.getByRole("form", { name: "Neue Meldung" }).getByRole("button", { name: "Meldung anlegen" });
      if (ohneScrollen) await expect(anlegen).toBeInViewport({ ratio: 1 });
      else await expect(anlegen).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(breite);

      await klickeWennRuhig(page.getByTestId("zur-einrichtung"));
      await expect(page.getByRole("heading", { name: "Einrichtung", level: 1 })).toBeVisible();
      await warteAufGestreamteInhalte(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(breite);
    });
  }
});

test("Kategorie anlegen, ändern und löschen", async ({ page }) => {
  const name = `Funk ${Date.now() % 10_000}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/einrichtung"));
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
  await page.goto(url("/"));
  await warteAufGestreamteInhalte(page);
  await expect(wahlKnopf(page.getByRole("form", { name: "Neue Meldung" }), name)).toBeVisible();
  await page.goto(url("/einrichtung"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  await klickeWennRuhig(page.getByRole("button", { name: `Kategorie ändern: ${name}` }));
  const aendern = page.getByRole("form", { name: `Kategorie „${name}“ ändern` });
  await aendern.getByLabel("Name").fill(`${name} neu`);
  await klickeWennRuhig(aendern.getByRole("button", { name: "Speichern" }));
  await expect(liste).toContainText(`${name} neu`);

  await klickeWennRuhig(page.getByRole("button", { name: `Kategorie löschen: ${name} neu` }));
  await klickeWennRuhig(page.getByRole("button", { name: "Löschen", exact: true }).last());
  await expect(liste).not.toContainText(`${name} neu`);
});

test("Lagekarte: Fläche zeichnen, Punkt setzen, beides geht an die Monitore, ausgeschaltet nicht", async ({ page }) => {
  const nr = Date.now() % 100_000;
  const flaeche = `Raum e2e ${nr}`;
  const punkt = `Wache e2e ${nr}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/einrichtung"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  // Fläche: drei Klicks auf die Karte, letzten wieder weg und neu, dann anlegen.
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Fläche" }));
  const neu = page.getByRole("form", { name: "Neue Fläche" });
  await neu.getByLabel("Name").fill(flaeche);
  await klickeWennRuhig(wahlKnopf(neu, "Türkis"));
  const karte = neu.getByTestId("lagekarte-karte");
  await expect(karte).toHaveAttribute("data-bereit", "true", { timeout: 30_000 });
  const box = (await karte.boundingBox())!;
  for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3], [0.6, 0.7], [0.2, 0.8]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
  const ecken = neu.getByTestId("lagekarte-ecken");
  await expect(ecken).toHaveText("4 von 200 Eckpunkten");
  await klickeWennRuhig(neu.getByRole("button", { name: "Letzten Punkt entfernen" }));
  await expect(ecken).toHaveText("3 von 200 Eckpunkten");
  await klickeWennRuhig(neu.getByRole("button", { name: "Fläche schließen" }));
  // Geschlossen: ein weiterer Klick setzt keine Ecke mehr.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(ecken).toHaveText("3 von 200 Eckpunkten");
  await klickeWennRuhig(neu.getByRole("button", { name: "Fläche anlegen" }));
  const liste = page.getByRole("list", { name: "Objekte der Lagekarte" });
  await expect(liste).toContainText(flaeche);

  // Punkt über die Zahlenfelder.
  await klickeWennRuhig(page.getByRole("button", { name: "Neuer Punkt" }));
  const p = page.getByRole("form", { name: "Neuer Punkt" });
  await p.getByLabel("Name").fill(punkt);
  await p.getByLabel("Taktisches Zeichen").click();
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option").first().click();
  await p.getByLabel("Breitengrad").fill("52,9711");
  await p.getByLabel("Längengrad").fill("10,5622");
  await klickeWennRuhig(p.getByRole("button", { name: "Punkt anlegen" }));
  await expect(liste).toContainText(punkt);

  await page.getByLabel("Neuer Zugang").fill(`Lagekarte e2e ${nr}`);
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec((await page.getByTestId("neuer-schluessel").textContent()) ?? "")?.[1];
  await klickeWennRuhig(page.getByRole("button", { name: "Fertig" }));
  type MapObject = { id: string; kind: string; name: string; color?: string; ring?: [number, number][]; symbol?: string | null; lat: number; lon: number };
  const abholen = async () => (await (await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } })).json()).mapObjects as MapObject[];
  const objekte = await abholen();
  const f = objekte.find((o) => o.name === flaeche);
  const q = objekte.find((o) => o.name === punkt);
  expect(f).toMatchObject({ kind: "area", color: "teal", id: expect.stringMatching(/^lk-/) });
  expect(f!.ring).toHaveLength(4);
  expect(f!.ring![0]).toEqual(f!.ring![3]);
  expect(q).toMatchObject({ kind: "point", lat: 52.9711, lon: 10.5622 });
  expect(q!.symbol).toContain("<svg");
  // Flächen vor Punkten.
  expect(objekte.findIndex((o) => o.kind === "point")).toBeGreaterThan(objekte.findLastIndex((o) => o.kind === "area"));

  // Ausgeschaltet geht der Punkt nicht mehr hinaus; danach aufräumen.
  const schalter = page.getByRole("switch", { name: `Auf der Karte: ${punkt}` });
  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url() === url("/einrichtung")),
    klickeWennRuhig(schalter),
  ]);
  expect(antwort.status()).toBe(200);
  await expect(schalter).toHaveAttribute("aria-checked", "false");
  expect((await abholen()).some((o) => o.name === punkt)).toBe(false);
  for (const name of [punkt, flaeche]) {
    await klickeWennRuhig(page.getByRole("button", { name: `Löschen: ${name}` }));
    await klickeWennRuhig(page.getByRole("button", { name: "Löschen", exact: true }).last());
    await expect(page.getByRole("button", { name: `Löschen: ${name}` })).toHaveCount(0);
  }
});
