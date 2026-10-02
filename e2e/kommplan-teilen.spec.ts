import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { E2E_VORGEBAUT } from "./helpers/server";
import { ADMIN, ersteStelle, istAktion, istSpeichern, neuerPlan, rumpf, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 5: Token-Links (Spec §8.2), Druck A3, QR, Schwarzweiß, SVG-Datei. Die anonymen
 * Kontexte tragen je eine eigene `cf-connecting-ip` — der Entpreller der Abrufzählung lebt im Prozessspeicher des
 * einen Servers dieser Gruppe, und ohne Kopf teilten sich alle den Eimer "unknown" (Umsetzungsplan Phase 5,
 * Entscheidung 5; die Fehlversuchs-Sperre fiel in der Abnahme weg).
 */
const neu = () => Math.random().toString(36).slice(2, 7);
/**
 * Absenderadressen der anonymen Kontexte: IPv6-Dokumentationsnetz (RFC 3849), `LAUF` je Laden dieser Datei neu —
 * ein CI-Wiederholungslauf (neuer Worker) und ein zweiter lokaler Lauf gegen einen wiederverwendeten Server treffen
 * so nie die gezählten Abrufe eines früheren Versuchs (Kritik).
 */
const LAUF = randomBytes(2).toString("hex");
const ip = (n: number) => `2001:db8:${LAUF}::${n}`;
const TOKEN_URL = new RegExp(`^${url("/t/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[A-Za-z0-9_-]{43}$`);

async function anonym(browser: Browser, ip: string): Promise<Page> {
  const kontext = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": ip } });
  await kontext.addInitScript(() => { window.print = () => {}; });
  return kontext.newPage();
}
async function oeffneTeilen(page: Page) {
  await klickeWennRuhig(page.getByRole("button", { name: "Teilen", exact: true }));
  const flyin = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await expect(flyin).toBeVisible();
  await expect(flyin.getByLabel("Notiz (wofür, für wen)")).toBeFocused(); // Anfangsfokus (Entscheidung 17)
  return flyin;
}
/** „Teilen“ → „In der Organisation teilen“ → Rückfrage bestätigen; wartet auf die Action (Falle 10). */
async function teileInOrganisation(page: Page) {
  const flyin = await oeffneTeilen(page);
  await klickeWennRuhig(flyin.getByRole("button", { name: "In der Organisation teilen" }));
  const antwort = page.waitForResponse(istAktion);
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Teilen", exact: true }));
  expect((await antwort).status()).toBe(200);
  await expect(flyin.locator('[data-sichtbarkeit="organisation"]')).toBeVisible();
  return flyin;
}
async function stelleAus(page: Page, dauer: "24 Stunden" | "7 Tage" | "30 Tage" | "Unbegrenzt", notiz: string): Promise<string> {
  const flyin = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await klickeWennRuhig(flyin.getByText(dauer, { exact: true }));
  await flyin.getByLabel("Notiz (wofür, für wen)").fill(notiz);
  const aus = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(`"notiz":"${notiz}"`));
  await klickeWennRuhig(flyin.getByRole("button", { name: "Link ausstellen" }));
  expect((await aus).status()).toBe(200);
  const eintrag = flyin.locator("[data-freigabe][data-neu]");
  await expect(eintrag).toContainText(notiz);
  const link = (await eintrag.locator("[data-link]").textContent())!;
  expect(link).toMatch(TOKEN_URL);
  return link;
}
async function archiviereUeberListe(page: Page, titel: string) {
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const weg = page.waitForResponse((r) => istAktion(r));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Archivieren" }));
  expect((await weg).status()).toBe(200);
}
async function setzeOption(page: Page, option: "qrAufDruck" | "schwarzweiss") {
  await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
  const gespeichert = page.waitForResponse(istSpeichern);
  await klickeWennRuhig(page.locator(`.kp-flyin [data-option="${option}"]`));
  expect((await gespeichert).status()).toBe(200);
}

test("Teilen: ausstellen, kopieren, anonym ansehen und drucken, Abrufe zählen, widerrufen → 404", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Teilen ${neu()}`;
  const id = await neuerPlan(page, titel);
  await ersteStelle(page, "EL Teilen");
  await page.keyboard.press("Escape");
  const flyin = await oeffneTeilen(page);
  await expect(flyin.locator('input[type="radio"][value="7d"]')).toBeChecked(); // Vorgabe
  const link = await stelleAus(page, "7 Tage", "Leitstelle");
  await expect(flyin.locator("[data-freigabe][data-neu]")).toContainText("gültig bis");
  await expect(flyin.locator("[data-freigabe][data-neu]").getByRole("button", { name: "Link kopieren" })).toBeFocused();
  await page.keyboard.press("Enter"); // Tastaturweg (Review Focus 8): der Fokus steht schon am Knopf
  // http ist kein sicherer Kontext: der Rückfall kopiert oder zeigt den Link markiert — nie ein stiller Fehlschlag (Review Focus 3)
  await expect(flyin.getByRole("status")).toHaveText(/^(Link kopiert\.|Kopieren ging hier nicht von selbst.*)$/);
  // die sichtbare Antwort steht am Eintrag: „Kopiert“ oder das markierte Lesefeld
  await expect(flyin.locator("[data-freigabe][data-neu]").locator('input[data-manuell], button:has-text("Kopiert")')).toHaveCount(1);

  const seite = await anonym(browser, ip(11));
  const antwort = (await seite.goto(link))!;
  expect(antwort.status()).toBe(200);
  const koepfe = antwort.headers();
  expect(koepfe["x-robots-tag"]).toContain("noindex");
  expect(koepfe["referrer-policy"]).toBe("no-referrer");
  // `next dev` setzt `cache-control` selbst („no-cache, must-revalidate“) und überschreibt den Proxy; der gebaute Stand
  // (CI, `pnpm e2e:gebaut`) liefert `private, no-cache, no-store, …` — zugesichert wird dort (Falle 21).
  if (E2E_VORGEBAUT) expect(koepfe["cache-control"]).toContain("no-store");
  expect(await antwort.text(), "keine Plan-ID in HTML oder Flight-Daten (Review Focus 4)").not.toContain(id);
  await warteAufGestreamteInhalte(seite);
  await expect(seite.getByRole("heading", { level: 1 })).toHaveText(titel);
  await expect(seite.locator("[data-token-stand]")).toHaveText(/^Stand \d\d\.\d\d\.\d{4}, \d\d:\d\d · Bearbeitung: /);
  await expect(seite.locator("[data-vermerk]")).toHaveText("VS – nur für den Dienstgebrauch");
  await expect(seite.locator(".kp-betrachter [data-karte]")).toHaveCount(1);
  await expect(seite.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(seite.getByRole("button", { name: "Teilen" })).toHaveCount(0);
  await expect(seite.getByRole("link", { name: /Alle Pläne/ })).toHaveCount(0); // keine Wege ins Innere
  await expect(seite.locator(".kp-token-kicker")).toContainText("KOMMUNIKATIONSPLÄNE");
  await expect(seite).toHaveTitle("Kommunikationspläne"); // typneutral, kein Plantitel

  // immer der aktuelle Stand (Spec §8.2): eine Änderung im Editor steht nach dem Neuladen in der Token-Ansicht
  await page.keyboard.press("Escape"); // Teilen-Flyin zu
  await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
  const titelFeld = page.locator(".kp-flyin").getByLabel("Titel", { exact: true });
  const angaben = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(`${titel} neu`));
  await titelFeld.fill(`${titel} neu`);
  await titelFeld.press("Enter");
  expect((await angaben).status()).toBe(200);
  await page.keyboard.press("Escape");
  expect((await seite.goto(link))?.status()).toBe(200);
  await warteAufGestreamteInhalte(seite);
  await expect(seite.getByRole("heading", { level: 1 })).toHaveText(`${titel} neu`);

  // Druck aus der Token-Ansicht: A3 quer, eigene Seitengröße
  const druck = (await seite.goto(`${link}/druck/a3`))!;
  expect(druck.status()).toBe(200);
  expect(druck.headers()["x-robots-tag"]).toContain("noindex");
  expect(await druck.text()).not.toContain(id);
  await warteAufGestreamteInhalte(seite);
  await expect(seite.locator("main.kp-druck")).toHaveAttribute("data-format", "a3-quer");
  await expect(seite.getByRole("button", { name: /SVG herunterladen/ })).toHaveCount(0); // nur intern (Entscheidung 15)
  const pdf = await PDFDocument.load(await seite.pdf({ preferCSSPageSize: true }));
  expect(Math.abs(pdf.getPage(0).getSize().width - 1190.55)).toBeLessThan(1); // Chromium rundet auf ganze CSS-Pixel

  // Abrufe: im Flyin nach Neuladen sichtbar (≥ 1 — dieselbe Adresse zählt binnen einer Minute einmal)
  await page.reload();
  await warteAufSpaltenaufteilung(page);
  const wieder = await oeffneTeilen(page);
  await expect(wieder.locator("[data-freigabe]").first()).toContainText(/\d+ Abrufe?, zuletzt/);

  // Widerrufen → die nächste Anfrage ist 404 (Review Focus 7)
  await klickeWennRuhig(wieder.locator("[data-freigabe]").first().getByRole("button", { name: "Widerrufen" }));
  const weg = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"freigabeId"'));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Widerrufen" }));
  expect((await weg).status()).toBe(200);
  await expect(wieder.getByRole("status")).toHaveText("Link widerrufen. Wer ihn hat, sieht den Plan nicht mehr.");
  await expect(wieder.locator("[data-gueltige] legend")).toBeFocused(); // der letzte gültige Link ist weg (Entscheidung 17)
  expect((await seite.goto(link))?.status()).toBe(404);
  expect((await seite.goto(`${link}/druck/a4`))?.status()).toBe(404);
  await seite.context().close();
});

/**
 * PERSÖNLICHE PLÄNE (`_lib/rechte.ts`): drei Personen mit festen Adressen — fest, damit die Einladungs-Suche über
 * wiederholte Läufe gegen denselben Server nicht immer mehr gleichnamige „Dev User“ sammelt.
 */
const ANNA = "anna@localtest.me";
const BODO = "bodo@localtest.me";
async function alsPerson(browser: Browser, email: string, groups: string): Promise<Page> {
  const seite = await (await browser.newContext()).newPage();
  await devLogin(seite, { host: "kommplan.localtest.me", email, groups, callbackPath: "/" });
  return seite;
}

test("privat ist Vorgabe: nur die Eigentümerin sieht ihn — geteilt sehen ihn alle, eingeladen bearbeitet Bodo", async ({ browser }) => {
  test.setTimeout(120_000);
  const anna = await alsPerson(browser, ANNA, "iuk-kommplan");
  const bodo = await alsPerson(browser, BODO, "iuk-kommplan");
  const admin = await alsPerson(browser, "admin@localtest.me", ADMIN);
  const titel = `e2e privat ${neu()}`;
  const id = await neuerPlan(anna, titel);
  await ersteStelle(anna, "EL privat");
  await anna.keyboard.press("Escape");
  await anna.goto(url("/"));
  await warteAufSpaltenaufteilung(anna);
  await expect(anna.getByRole("table", { name: "Pläne" }).getByRole("row", { name: new RegExp(titel) })).toContainText("Privat");

  // Weder Bodo noch der Modul-Admin: kein Eintrag in der Liste, die Adresse ist ein 404 wie ein Plan, den es nicht gibt.
  for (const fremd of [bodo, admin]) {
    await fremd.goto(url("/"));
    await warteAufSpaltenaufteilung(fremd);
    await expect(fremd.getByRole("link", { name: titel })).toHaveCount(0);
    for (const pfad of [`/p/${id}`, `/p/${id}/druck/a4`]) expect((await fremd.goto(url(pfad)))?.status(), pfad).toBe(404);
  }

  await anna.goto(url(`/p/${id}`));
  await warteAufSpaltenaufteilung(anna);
  const flyin = await teileInOrganisation(anna);
  expect((await bodo.goto(url(`/p/${id}`)))?.status()).toBe(200);
  await warteAufSpaltenaufteilung(bodo);
  await expect(bodo.getByRole("button", { name: "Plan und Verbindungen" })).toHaveCount(0); // Betrachter

  // Einladen: Bodo hat das Modul geöffnet, also schlägt die Suche ihn vor.
  const suche = flyin.locator('[data-sichtbarkeit="organisation"] input');
  await suche.fill("Dev");
  await klickeWennRuhig(anna.locator(`[data-vorschlag="dev:${BODO}"]`));
  await expect(flyin.locator(`[data-mitglied="dev:${BODO}"]`)).toBeVisible();
  await bodo.reload();
  await warteAufSpaltenaufteilung(bodo);
  await expect(bodo.getByRole("button", { name: "Plan und Verbindungen" })).toBeVisible(); // Editor
  await expect(bodo.getByRole("button", { name: "Teilen", exact: true })).toHaveCount(0); // verwalten nur Anna und die Admins
  for (const s of [anna, bodo, admin]) await s.context().close();
});

test("Exportieren und Importieren: die Datei wird ein neuer privater Plan mit demselben Inhalt", async ({ page }) => {
  await devLogin(page, { host: "kommplan.localtest.me", groups: "iuk-kommplan", callbackPath: "/" });
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: "Aktionen für Kommunikationsplan Einsatz 22.02.2026", exact: true }));
  const download = page.waitForEvent("download");
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Exportieren" }));
  const datei = await download;
  expect(datei.suggestedFilename()).toMatch(/^Kommunikationsplan-Einsatz-22-02-2026_2026-02-22\.kommplan\.json$/);
  const pfad = test.info().outputPath(datei.suggestedFilename());
  await datei.saveAs(pfad);
  expect(JSON.parse(readFileSync(pfad, "utf8"))).toMatchObject({ format: "iuk-kommplan-plan", version: 1, plan: { titel: "Kommunikationsplan Einsatz 22.02.2026" } });

  const anlage = page.waitForResponse(istAktion);
  await page.locator("input[data-import]").setInputFiles(pfad);
  expect((await anlage).status()).toBe(200);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}$/);
  await warteAufSpaltenaufteilung(page);
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Plan und Verbindungen" })).toBeVisible(); // die eigene Kopie bearbeitet sie
});

test("404 ist ununterscheidbar: unbekannt, falsch geformt, widerrufen, archiviert (Review Focus 2)", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const titelW = `e2e Widerruf ${neu()}`;
  await neuerPlan(page, titelW);
  await oeffneTeilen(page);
  const widerrufen = await stelleAus(page, "24 Stunden", "weg");
  const flyin = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await klickeWennRuhig(flyin.locator("[data-freigabe]").first().getByRole("button", { name: "Widerrufen" }));
  const w = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"freigabeId"'));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Widerrufen" }));
  expect((await w).status()).toBe(200);
  const titelA = `e2e Archiv-Link ${neu()}`;
  const idA = await neuerPlan(page, titelA);
  await oeffneTeilen(page);
  const archiviert = await stelleAus(page, "Unbegrenzt", "archiv");
  await archiviereUeberListe(page, titelA);

  const seite = await anonym(browser, ip(22));
  const faelle = { unbekannt: url(`/t/${"Q".repeat(43)}`), falsch: url("/t/kurz"), widerrufen, archiviert };
  const texte: string[] = [];
  const htmls: string[] = [];
  for (const [fall, ziel] of Object.entries(faelle)) {
    const r = (await seite.goto(ziel))!;
    expect(r.status(), fall).toBe(404);
    expect(r.headers()["x-robots-tag"], fall).toContain("noindex");
    expect(r.headers()["referrer-policy"], fall).toBe("no-referrer");
    const html = await r.text();
    for (const geheim of [titelW, titelA, idA, "Musterorganisation"]) expect(html, `${fall}: ${geheim}`).not.toContain(geheim);
    await expect(seite.getByRole("heading", { level: 1 }), fall).toHaveText("Dieser Link gilt nicht (mehr)."); // t/not-found.tsx, nicht die Suite-404
    expect(await seite.locator('a[href="/"], a[href$="/login"]').count(), `${fall}: kein Weg zur Anmeldung`).toBe(0);
    const token = new URL(ziel).pathname.split("/").pop()!;
    texte.push((await seite.locator("body").innerText()).replaceAll(token, "<T>"));
    htmls.push(html.replaceAll(token, "<T>"));
  }
  expect(new Set(texte).size, "alle vier 404 sehen gleich aus").toBe(1);
  // Auch der Quelltext unterscheidet die Fälle nicht: nach dem Ersetzen des Tokens gleich lang (eine Längendifferenz
  // wäre ein Orakel). Setzt Next je Antwort eigene IDs oder Nonces und bricht DAS die Gleichheit, ist das ein Befund
  // in „Abweichungen" — dann den Vergleich auf die Differenz dieser Stellen beschränken, nie ganz streichen.
  expect(new Set(htmls.map((h) => h.length)).size, "404-Antworten gleich lang nach Ersetzen des Tokens").toBe(1);
  await seite.context().close();
});

test("keine Fehlversuchs-Sperre (Abnahme): vierzig Fehlversuche derselben Adresse — der gültige Link bleibt offen", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, `e2e Schranke ${neu()}`);
  await oeffneTeilen(page);
  const link = await stelleAus(page, "7 Tage", "schranke");
  const rater = await anonym(browser, ip(33));
  // `request.get` statt `goto`: rendert Layout UND Seite ebenso, ist aber schnell genug, dass alle Fehlversuche unter
  // Last in eine Minute fallen — so prüft der Test eine Sperre, wie sie früher griff (dreißig je Minute).
  const kopf = { headers: { "cf-connecting-ip": ip(33) } };
  for (let i = 0; i < 40; i++) expect((await rater.request.get(url(`/t/${"R".repeat(41)}${String(i).padStart(2, "0")}`), kopf)).status()).toBe(404);
  expect((await rater.goto(link))?.status(), "nach vierzig Fehlversuchen derselben Adresse").toBe(200);
  await rater.context().close();
});

test("QR „Aktuelle Fassung“: ohne Link Hinweis und kein QR; intern der unbegrenzte Link; im Token-Druck der benutzte (Review Focus 1)", async ({ page, browser, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => { window.print = () => {}; });
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, `e2e QR ${neu()}`);
  await ersteStelle(page, "EL QR");
  await page.keyboard.press("Escape");
  await setzeOption(page, "qrAufDruck");
  await expect(page.locator(".kp-flyin [data-qr-hinweis]")).toContainText("Ohne gültigen Link druckt der Plan keinen QR-Code.");
  await page.keyboard.press("Escape");
  await page.goto(url(`/p/${id}/druck/a4`));
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("svg.kp-blatt")).not.toHaveCount(0);
  await expect(page.locator("[data-qr]")).toHaveCount(0);
  await expect(page.locator("[data-qr-satz]")).toHaveCount(0);

  // „Link ausstellen“ im Hinweis führt direkt ins Flyin „Teilen“ (Entscheidung 10)
  await page.goto(url(`/p/${id}`));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
  await klickeWennRuhig(page.locator(".kp-flyin [data-qr-hinweis]").getByRole("button", { name: "Link ausstellen" }));
  const teilen = page.locator(".kp-flyin").filter({ has: page.getByText("Neuen Link ausstellen") });
  await expect(teilen).toBeVisible();
  const kurz = await stelleAus(page, "24 Stunden", "kurz");
  await expect(teilen.locator("[data-qr-ziel-satz]")).toContainText("„kurz“ – gültig bis"); // befristet: mit Warnung
  await expect(teilen.locator("[data-qr-ziel-satz]")).toContainText("danach führt der Ausdruck ins Leere");
  const lang = await stelleAus(page, "Unbegrenzt", "lang");
  await expect(teilen.locator("[data-qr-ziel-satz]")).toHaveText("Der QR-Code führt auf „lang“ – unbegrenzt gültig.");
  await page.goto(url(`/p/${id}/druck/a4`));
  await warteAufGestreamteInhalte(page);
  const blaetter = await page.locator("svg.kp-blatt").count();
  expect(blaetter).toBeGreaterThan(0);
  await expect(page.locator("[data-qr]")).toHaveCount(blaetter);
  for (const z of await page.locator("[data-qr]").all()) expect(await z.getAttribute("data-qr-ziel")).toBe(lang);
  await expect(page.locator("[data-qr-satz]")).toHaveText("Der QR-Code führt auf „lang“ – unbegrenzt gültig.");

  const seite = await anonym(browser, ip(44));
  expect((await seite.goto(`${kurz}/druck/a4`))?.status()).toBe(200);
  await warteAufGestreamteInhalte(seite);
  // Erst die Zahl: ohne einen einzigen QR liefe die Schleife nie und bewiese nichts (Review Phase 5).
  const tokenBlaetter = await seite.locator("svg.kp-blatt").count();
  expect(tokenBlaetter).toBeGreaterThan(0);
  await expect(seite.locator("[data-qr]")).toHaveCount(tokenBlaetter);
  for (const z of await seite.locator("[data-qr]").all()) expect(await z.getAttribute("data-qr-ziel"), "nie der bessere Link").toBe(kurz);
  await seite.context().close();

  // Nur Zugangsgruppe: der interne Druck trägt keinen QR — der Code wäre der Link, und er überdauerte den Entzug der Gruppe.
  // Eine ANDERE Person an einem GETEILTEN Plan: der neue Plan ist privat, und unter derselben Adresse wäre sie seine Eigentümerin.
  await page.goto(url(`/p/${id}`));
  await warteAufSpaltenaufteilung(page);
  await teileInOrganisation(page);
  const leseKontext = await browser.newContext();
  await leseKontext.addInitScript(() => { window.print = () => {}; });
  const leser = await leseKontext.newPage();
  await devLogin(leser, { host: "kommplan.localtest.me", email: "leser@localtest.me", groups: "iuk-kommplan", callbackPath: "/" });
  expect((await leser.goto(url(`/p/${id}/druck/a4`)))?.status()).toBe(200);
  await warteAufGestreamteInhalte(leser);
  await expect(leser.locator("svg.kp-blatt")).not.toHaveCount(0);
  await expect(leser.locator("[data-qr]")).toHaveCount(0);
  await expect(leser.locator("[data-qr-satz]")).toHaveCount(0);
  expect(await leser.content()).not.toContain(lang.slice(-43));
  await leseKontext.close();
});

test("Schwarzweiß und SVG herunterladen: graue Symbole im Druck, eigenständige Datei mit ASCII-Namen, SVG-Weg ohne Druckdialog (Review Focus 6, 8)", async ({ page, context }) => {
  test.setTimeout(150_000);
  await context.addInitScript(() => {
    (window as unknown as { gedruckt: number }).gedruckt = 0;
    window.print = () => { (window as unknown as { gedruckt: number }).gedruckt++; };
  });
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  // ein Duplikat der Seed-Vorlage OpenR (Zeichen in Farbe) — nie den Seed-Plan selbst umstellen
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: "Aktionen für Kommunikationsplan OpenR 01.07.2022", exact: true })); // exakt: Duplikate anderer Läufe tragen ein neues Datum
  const kopie = page.waitForResponse((r) => istAktion(r) && rumpf(r) === JSON.stringify(["beispiel-openr-2022-07-01"]));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Duplizieren" }));
  expect((await kopie).status()).toBe(200);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}\?kopie=/);
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await warteAufSpaltenaufteilung(page);
  await setzeOption(page, "schwarzweiss");
  await page.keyboard.press("Escape");
  // der SVG-Weg aus dem Druckmenü: neues Fenster mit ?export=svg, KEIN Druckdialog (Entscheidung 15)
  const fenster = page.waitForEvent("popup");
  await klickeWennRuhig(page.getByRole("button", { name: "Weitere Druckformate" }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "SVG – A4 quer" }));
  const druck = await fenster;
  await druck.waitForURL(/\/druck\/a4\?export=svg$/);
  await warteAufGestreamteInhalte(druck);
  await druck.evaluate(() => document.fonts.ready);
  expect(await druck.evaluate(() => (window as unknown as { gedruckt: number }).gedruckt), "kein window.print() auf dem SVG-Weg").toBe(0);
  await expect(druck.locator("svg.kp-blatt").first()).toHaveAttribute("data-sw", "");
  const bunt = await druck.locator("svg.kp-symbole").evaluate((s) => [...s.innerHTML.matchAll(/#([0-9a-f]{6})\b/gi)]
    .map((m) => m[1].toLowerCase()).filter((h) => !(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6))));
  expect(bunt).toEqual([]);

  const runter = druck.waitForEvent("download");
  await klickeWennRuhig(druck.getByRole("button", { name: /^SVG herunterladen \(Blatt 1 von \d+\)$/ }));
  const datei = await runter;
  expect(datei.suggestedFilename()).toMatch(/^[A-Za-z0-9-]+_\d{4}-\d{2}-\d{2}_blatt-1-von-\d+_a4\.svg$/);
  const text = readFileSync((await datei.path())!, "utf8");
  expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(text).toContain("@font-face");
  expect(text).toContain("<symbol");
  const ids = new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const verweise = [...text.matchAll(/(?:\bhref|xlink:href)="#([^"]+)"|url\(#([^)"']+)\)/g)].map((m) => m[1] ?? m[2]);
  expect(verweise.length).toBeGreaterThan(0);
  for (const v of verweise) expect(ids.has(v), `#${v} löst in der Datei auf`).toBe(true);
  // wohlgeformt — sonst öffnet die Datei nirgends, und alle Prüfungen darüber wären trotzdem grün
  expect(await druck.evaluate((t) => new DOMParser().parseFromString(t, "image/svg+xml").querySelector("parsererror") === null, text)).toBe(true);
  // der normale Druck ruft den Dialog weiter von selbst
  await page.goto(url(`/p/${id}/druck/a4`));
  await warteAufGestreamteInhalte(page);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => (window as unknown as { gedruckt: number }).gedruckt)).toBe(1);
  await druck.close();
});

const BREITEN = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "telefon", width: 390, height: 844 }] as const;
const FOTOS = process.env.KOMMPLAN_FOTOS;

test("Bildschirmfotos Phase 5: Teilen, Plan-Optionen, Druckmenü, Token-Ansicht und 404 — hell und dunkel, drei Breiten", async ({ page, browser, context }, testInfo) => {
  test.setTimeout(FOTOS ? 300_000 : 120_000);
  const ordner = FOTOS ?? testInfo.outputPath("fotos");
  if (FOTOS) mkdirSync(ordner, { recursive: true });
  await context.addInitScript(() => { window.print = () => {}; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await devLogin(page, { host: "kommplan.localtest.me", groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, `e2e Fotos Teilen ${neu()}`);
  await ersteStelle(page, "Einsatzleitung");
  await page.keyboard.press("Escape");
  await setzeOption(page, "qrAufDruck"); // QR an: Plan- und Teilen-Flyin zeigen den Satz, der Druck den Code (Prüfliste 2, 6)
  await page.keyboard.press("Escape");
  await oeffneTeilen(page);
  const link = await stelleAus(page, "7 Tage", "Leitstelle Nord — Lagekarte im Führungsraum");
  await stelleAus(page, "Unbegrenzt", "Aushang");
  await page.keyboard.press("Escape");
  const anon = await anonym(browser, ip(55));
  const foto = async (p: Page, name: string) => { if (FOTOS) await p.screenshot({ path: `${ordner}/${name}.png`, animations: "disabled" }); };
  const ohneUeberlauf = async (p: Page) =>
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // Token-Ansicht: keine senkrechte Seitenrolle — sonst schiebt jedes Wischen auf dem Betrachter das Diagramm statt der Seite (Entscheidung 8)
  const ohneSeitenrolle = async (p: Page) =>
    expect(await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
  const breiten = FOTOS ? BREITEN : [BREITEN[2]];

  for (const modus of ["light", "dark"] as const) {
    await context.addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    await anon.context().addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    for (const b of breiten) {
      await page.setViewportSize({ width: b.width, height: b.height });
      await anon.setViewportSize({ width: b.width, height: b.height });
      const n = `${b.name}-${modus}`;
      await page.goto(url(`/p/${id}?ansicht=diagramm`));
      await warteAufSpaltenaufteilung(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", modus);
      if (b.name === "telefon") {
        // README „Mobil“: jeder sichtbare Handlungsknopf eine eigene Zeile in voller Breite — auch „Teilen“ und „Drucken“
        // (Review Phase 5 nimmt die zwei Spalten aus Kritik 21 zurück; „Teilen“ kostet eine Zeile).
        const zeilen = await page.locator(".kp-kopfwerkzeuge").evaluate((leiste) => {
          const breite = leiste.getBoundingClientRect().width;
          return [...leiste.children].map((k) => k.getBoundingClientRect()).filter((r) => r.height > 0)
            .map((r) => ({ top: Math.round(r.top), voll: Math.abs(r.width - breite) < 1 }));
        });
        expect(zeilen.length).toBeGreaterThanOrEqual(5);
        expect(zeilen.every((z) => z.voll), "volle Breite").toBe(true);
        expect(new Set(zeilen.map((z) => z.top)).size, "untereinander, nie nebeneinander").toBe(zeilen.length);
      }
      await oeffneTeilen(page);
      await ohneUeberlauf(page);
      await foto(page, `teilen-${n}`);
      await page.keyboard.press("Escape");
      await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
      await page.locator('.kp-flyin [data-option="qrAufDruck"]').scrollIntoViewIfNeeded();
      await foto(page, `plan-optionen-${n}`);
      await page.keyboard.press("Escape");
      // der Pfeil, nicht „Drucken“: der Hauptknopf druckt sofort A4 quer (Entscheidung 12)
      await klickeWennRuhig(page.getByRole("button", { name: "Weitere Druckformate" }));
      await expect(page.getByRole("menuitem", { name: "A3 quer", exact: true })).toBeVisible();
      await foto(page, `druckmenue-${n}`);
      await page.keyboard.press("Escape");

      expect((await anon.goto(link))?.status()).toBe(200);
      await warteAufGestreamteInhalte(anon);
      await expect(anon.locator("html")).toHaveAttribute("data-theme", modus);
      await ohneUeberlauf(anon);
      await ohneSeitenrolle(anon);
      // ohne Hülle gilt 56/72 (README, Falle 4) — auch für die antd-Inseln der Token-Ansicht (Entscheidung 8)
      expect(await anon.getByRole("button", { name: "Drucken", exact: true }).evaluate((e) => e.getBoundingClientRect().height)).toBeCloseTo(56, 0);
      await foto(anon, `token-${n}`);
      if (b.name === "desktop") {
        await anon.getByRole("button", { name: "Drucken", exact: true }).hover();
        await foto(anon, `token-hover-${n}`); // Rot nur als Hover-Rahmen/Text, keine Fläche (Entscheidung 8)
      }
      expect((await anon.goto(url(`/t/${"Z".repeat(43)}`)))?.status()).toBe(404);
      await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Dieser Link gilt nicht (mehr).");
      await foto(anon, `token-404-${n}`);
      if (FOTOS && b.name === "desktop" && modus === "light") {
        await anon.goto(`${link}/druck/a3`);
        await warteAufGestreamteInhalte(anon);
        await foto(anon, "druck-token-a3-desktop-light");
        await page.goto(url(`/p/${id}/druck/a4`));
        await warteAufGestreamteInhalte(page);
        await foto(page, "druck-qr-desktop-light");
      }
    }
  }
  await anon.context().close();
});
