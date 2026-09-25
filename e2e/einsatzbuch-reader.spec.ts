import { readFileSync } from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, E2E_PORT, klickeWennRuhig } from "./fixtures";
import { entschluesseleExport, verschluesseleExport } from "../src/app/m/einsatzbuch/_lib/kern/export";
import { versiegele } from "../src/app/m/einsatzbuch/_lib/kern/block";
import { erzeugeSchluesselpaar, schluesselIdVon } from "../src/app/m/einsatzbuch/_lib/kern/umschlag";
import { zuBase64, zufall } from "../src/app/m/einsatzbuch/_lib/kern/bytes";
import { beispielEinsatz, GENESIS, kopf } from "../src/app/m/einsatzbuch/_lib/kern/testhilfe";
import type { Exportdatei } from "../src/app/m/einsatzbuch/_lib/kern/format";

/**
 * Stufe 3 des Einsatzbuchs: der Reader im echten Browser.
 *
 * Die Kern-Module kommen relativ herein (der Kern selbst importiert nur relativ, also braucht
 * Playwrights Loader keine Pfad-Aliase). Die Vektordatei ist die feste aus
 * `kern/testvektoren/erwartet.json`; die Testdatei mit `umgebung: "test"` entsteht hier per
 * `versiegele` — keine neue Vektordatei.
 *
 * Greifer:
 * - Das Kennwortfeld über die Region „Kennwort“: die Karte trägt denselben Namen wie das
 *   Label, ein bloßes `getByLabel("Kennwort")` träfe beide.
 * - Der Kettenbefund über `[data-kettenpruefung]`: der Chip ist die Aussage, Liste und Satz
 *   daneben nicht.
 * - Audit über `waitForResponse` (Falle 10): ein 403 der Gruppenprüfung bliebe mit
 *   `waitForRequest` grün.
 * - Nach „Entschlüsseln“ großzügige Frist: PBKDF2 mit 600 000 Runden im Browser.
 *
 * Sicherer Kontext: Der Reader entschlüsselt mit WebCrypto, und `crypto.subtle` gibt es nur in
 * einem sicheren Kontext. `http://*.localtest.me` ist keiner (nur `localhost` selbst) — ohne
 * den Startschalter unten fehlt `crypto.subtle`, und jede Datei endet als „beschädigt“, auch
 * mit falschem Kennwort. Im Betrieb läuft die Suite über HTTPS; der Schalter stellt genau das
 * für diesen Host nach, und `beforeEach` sichert es zu, statt es stillschweigend vorauszusetzen.
 * `channel: "chromium"`, weil die Headless-Shell (Playwrights Vorgabe) den Schalter still
 * übergeht — gemessen: Shell `isSecureContext === false`, volles Chromium `true`. Das volle
 * Chromium bringt `playwright install chromium` in der CI mit.
 */
const HOST = "einsatzbuch.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const KW = "testvektor-kennwort";
const ENTSCHLUESSELT = { timeout: 30_000 };
test.use({ channel: "chromium", launchOptions: { args: [`--unsafely-treat-insecure-origin-as-secure=${url("")}`] } });

const vektor = (JSON.parse(readFileSync("src/app/m/einsatzbuch/_lib/kern/testvektoren/erwartet.json", "utf8")) as { export: Exportdatei }).export;

async function oeffne(page: Page, datei: Exportdatei, kennwort = KW): Promise<void> {
  await page.getByLabel("Einsatzbuch-Datei").setInputFiles({
    name: "probe.einsatzbuch", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(datei)),
  });
  await page.getByRole("region", { name: "Kennwort" }).locator("input").fill(kennwort);
  await klickeWennRuhig(page.getByRole("button", { name: "Entschlüsseln" }));
}

function auditPost(page: Page, format: string): Promise<Response> {
  return page.waitForResponse((r) => r.url() === url("/api/audit/browser") && r.request().method() === "POST"
    && r.request().postData()?.includes(`"${format}"`) === true, ENTSCHLUESSELT);
}

function kettenbefund(page: Page, text: string) {
  return page.locator("[data-kettenpruefung]").getByText(text, { exact: true });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __drucke: number };
    w.__drucke = 0;
    window.print = () => { w.__drucke++; };
  });
  await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
  // Falle 10: Route Handler vor dem ersten POST aufwärmen.
  expect((await page.request.get(url("/api/audit/browser"))).status()).toBe(204);
  expect((await page.goto(url("/reader")))?.status()).toBe(200);
  // Erst nach der Hydrierung wählen — sonst geht das change-Ereignis am React-Handler vorbei.
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => window.isSecureContext && typeof crypto.subtle === "object")).toBe(true);
});

test("Vektordatei: Kette intakt, Detail, Bericht, Audit beim Öffnen und Drucken (im Dunkelmodus)", async ({ page, context }) => {
  // Gedruckt wird im Dunkelmodus mit sichtbarer Seitenleiste: das Blatt muss trotzdem hell sein und
  // die Hülle verschwinden. Die Wahl ist das Theme-Cookie der Suite, serverseitig gelesen.
  await context.addCookies([{ name: "iuk-theme-pref", value: "dark", url: url("/") }]);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const geoeffnet = auditPost(page, "reader_oeffnen");
  await oeffne(page, vektor);
  await expect(kettenbefund(page, "Kette intakt")).toBeVisible(ENTSCHLUESSELT);
  const oeffnen = await geoeffnet;
  expect(oeffnen.status()).toBe(204);
  expect(oeffnen.request().postDataJSON()).toEqual({ module: "einsatzbuch", format: "reader_oeffnen", von: 1, bis: 3, anzahl: 3 });
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();
  await expect(page.getByText(/laut Datei/)).toBeVisible();
  await expect(page.getByText("Testdaten — kein echter Einsatz")).toHaveCount(0);

  await klickeWennRuhig(page.getByRole("button", { name: "PDF erzeugen" }));
  await expect(page.getByText("Vertraulich — nur für den Dienstgebrauch")).toBeVisible();
  const gedruckt = auditPost(page, "reader_druck");
  await klickeWennRuhig(page.getByRole("button", { name: "Als PDF speichern" }));
  const druck = await gedruckt;
  expect(druck.status()).toBe(204);
  expect(druck.request().postDataJSON()).toEqual({ module: "einsatzbuch", format: "reader_druck", von: 3, bis: 3, anzahl: 1 });
  expect(await page.evaluate(() => (window as unknown as { __drucke: number }).__drucke)).toBe(1);

  // Vorher sichtbar, sonst bewiese „im Druck verborgen“ nichts.
  await expect(page.locator(".ant-layout-sider")).toBeVisible();
  await expect(page.getByTestId("suite-header")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("suite-header")).toBeHidden();
  await expect(page.locator(".ant-layout-sider")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // Papier bleibt hell (bericht.module.css: #fff auf #1a1d20).
  const blatt = page.locator("[data-bericht]");
  expect(await blatt.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]))
    .toEqual(["rgb(255, 255, 255)", "rgb(26, 29, 32)"]);
  await expect(page.getByRole("button", { name: "Als PDF speichern" })).toBeHidden();
  await expect(page.getByText("Vertraulich — nur für den Dienstgebrauch")).toBeVisible();
  const doc = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  const seiten = doc.getPages().map((s) => {
    const { width, height } = s.getSize();
    return [Math.round(width / 72 * 25.4), Math.round(height / 72 * 25.4)];
  });
  expect(seiten).toEqual([[210, 297]]);
});

test("manipulierte Datei → Gebrochen bei Block 2", async ({ page }) => {
  const inhalt = await entschluesseleExport(vektor, KW);
  const zwei = inhalt.bloecke[1];
  inhalt.bloecke[1] = { ...zwei, kopf: { ...zwei.kopf, versiegelt: "2026-08-29T19:34:00+02:00" } };
  await oeffne(page, await verschluesseleExport(inhalt, KW, vektor.kopf));
  await expect(kettenbefund(page, "Gebrochen bei Block 2")).toBeVisible(ENTSCHLUESSELT);
});

test("falsches Kennwort → Meldung der Vorlage", async ({ page }) => {
  await oeffne(page, vektor, "falsch-falsch");
  await expect(page.getByRole("alert").getByText("Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.", { exact: true }))
    .toBeVisible(ENTSCHLUESSELT);
});

test("Testdatei → Band, und der Bericht trägt TESTDATEN", async ({ page }) => {
  const paar = await erzeugeSchluesselpaar();
  const cek = zufall(32);
  const block = await versiegele(
    beispielEinsatz("T-2026-001"),
    kopf(1, GENESIS, await schluesselIdVon(paar.publicKey), "test"),
    paar.publicKey,
    { cek, iv: zufall(12), umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: zufall(12) } },
  );
  const datei = await verschluesseleExport(
    { bloecke: [block], schluessel: { "1": zuBase64(cek) }, exportiertVon: "E2E", quelle: "Testrechner", anker: null },
    KW,
    { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln", von: 1, bis: 1, anzahl: 1, quelle: "Testrechner" },
  );
  await oeffne(page, datei);
  await expect(page.getByText("Testdaten — kein echter Einsatz")).toBeVisible(ENTSCHLUESSELT);
  await klickeWennRuhig(page.getByRole("button", { name: "PDF erzeugen" }));
  await expect(page.getByText("TESTDATEN", { exact: true })).toBeVisible();
});
