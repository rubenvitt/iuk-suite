import { expect, test } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufSpaltenaufteilung } from "./fixtures";
import { setzeAvModus } from "./helpers/avModus";
import { ADMIN, HOST, istAktion, istStandAbfrage, neuerPlan, oeffneEditor, rumpf, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 4: Duplizieren, Vorlagen, Archiv (Spec §6.7, §8.3) und Briefkopf (Spec §4.4).
 * Eigene Pläne je Test; der Briefkopf ist eine Zeile für alle — der Test stellt seinen Stand selbst her und
 * am Ende den Seed-Stand („Musterorganisation", kein Logo) wieder her.
 */
const neu = () => Math.random().toString(36).slice(2, 7);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 1" onload="alert(1)"><rect width="4" height="1" fill="#123456"/><script>alert(1)</script></svg>');

test("Duplizieren: Kopie mit heutigem Datum im Titel, direkt im Editor, mit Hinweis", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Tag 01.07.2022 ${neu()}`;
  const id = await neuerPlan(page, titel);
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const kopie = page.waitForResponse((r) => istAktion(r) && rumpf(r) === JSON.stringify([id]));
  // NICHT `oeffneEditor`: dessen `istStandAbfrage` (Action ohne „version", „titel" und „:") passt auch auf den Rumpf
  // der Duplizieren-Action (`["<id>"]`) und löste an IHR aus statt an der Standabfrage des Editors der Kopie
  // (Familie der Fallen 10–12). Gezielt: eine Standabfrage, die NICHT die ID des Originals trägt.
  const stand = page.waitForResponse((r) => istStandAbfrage(r) && !rumpf(r).includes(id));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Duplizieren" }));
  expect((await kopie).status()).toBe(200);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}\?kopie=1$/);
  expect((await stand).status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
  // Der Hinweis steht in Diagramm UND Gliederung (eine davon per CSS verborgen): die sichtbare zählt.
  await expect(page.getByText(/Kopie angelegt — Titel und Datum stehen auf/).filter({ visible: true })).toBeVisible();
  const heute = await page.evaluate(() => new Intl.DateTimeFormat("de-DE", { timeZone: document.documentElement.dataset.zeitzone || "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titel.replace("01.07.2022", heute));
});

test("Vorlage: als Vorlage speichern, Neu aus Vorlage übernimmt den Inhalt, Keine Vorlage mehr", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Vorlage ${neu()}`;
  await neuerPlan(page, titel);
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  const v = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"vorlage":true'));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Als Vorlage speichern" }));
  expect((await v).status()).toBe(200);
  await expect(page.getByRole("table", { name: "Vorlagen" }).getByRole("link", { name: titel })).toBeVisible();
  await expect(page.getByRole("table", { name: "Pläne" }).getByRole("link", { name: titel })).toHaveCount(0);
  await klickeWennRuhig(page.getByRole("table", { name: "Vorlagen" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Neu aus Vorlage" }));
  const formular = page.getByRole("form", { name: "Neuer Plan" });
  await expect(formular.getByLabel("Titel")).toHaveValue(titel);
  await formular.getByLabel("Titel").fill(`${titel} Einsatz`);
  const anlage = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"vorlage":"'));
  await oeffneEditor(page, async () => {
    await klickeWennRuhig(formular.getByRole("button", { name: "Anlegen und bearbeiten" }));
    expect((await anlage).status()).toBe(200);
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/);
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${titel} Einsatz`);
});

test("Archiv: archivieren, Rückgängig, nur lesbar unter /p/<id>, wiederherstellen", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const titel = `e2e Archiv ${neu()}`;
  const id = await neuerPlan(page, titel);
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  const archiv = () => page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(id));
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  let a = archiv();
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Archivieren" }));
  expect((await a).status()).toBe(200);
  await expect(page.locator(".kp-listenhinweis")).toContainText(`„${titel}“ archiviert.`);
  a = archiv();
  await klickeWennRuhig(page.locator(".kp-listenhinweis").getByRole("button", { name: "Rückgängig" }));
  expect((await a).status()).toBe(200);
  await expect(page.getByRole("table", { name: "Pläne" }).getByRole("link", { name: titel })).toBeVisible();
  // endgültig archivieren und ansehen
  await klickeWennRuhig(page.getByRole("table", { name: "Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  a = archiv();
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Archivieren" }));
  expect((await a).status()).toBe(200);
  const r = await page.goto(url(`/p/${id}`));
  expect(r?.status()).toBe(200);
  await expect(page.locator(".kp-archivhinweis")).toContainText("nur lesbar");
  await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0); // kein Editor
  expect((await page.goto(url(`/p/${id}/druck/a4`)))?.status()).toBe(200);
  await page.goto(url("/archiv"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("table", { name: "Archivierte Pläne" }).getByRole("button", { name: `Aktionen für ${titel}` }));
  a = archiv();
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Wiederherstellen" }));
  expect((await a).status()).toBe(200);
});

test("Briefkopf: ohne Eintrag leer; SVG hochladen wird bereinigt und gedruckt; Befund abgelehnt; Logo entfernen", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, `e2e Kopf ${neu()}`);
  await page.goto(url("/einstellungen"));
  await warteAufSpaltenaufteilung(page);
  const speichereName = async (name: string) => {
    await page.getByRole("form", { name: "Organisation" }).getByLabel("Organisation").fill(name);
    const s = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"organisation"'));
    await klickeWennRuhig(page.getByRole("form", { name: "Organisation" }).getByRole("button", { name: "Speichern" }));
    expect((await s).status()).toBe(200);
  };
  const entferneLogo = async () => {
    if (await page.getByRole("button", { name: "Logo entfernen" }).count() === 0) return;
    await klickeWennRuhig(page.getByRole("button", { name: "Logo entfernen" }));
    const e = page.waitForResponse((r) => istAktion(r) && r.request().method() === "POST");
    await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Entfernen" }));
    expect((await e).status()).toBe(200);
  };
  // leer
  await entferneLogo();
  await speichereName("");
  await expect(page.getByRole("img", { name: "Vorschau des Kopfs: ohne Organisation, ohne Logo" })).toBeVisible();
  await page.goto(url(`/p/${id}/druck/a4`));
  await expect(page.locator(".kp-blatt [data-organisation], .kp-blatt [data-logo]")).toHaveCount(0);
  // SVG
  await page.goto(url("/einstellungen"));
  await speichereName("Musterorganisation e2e");
  setzeAvModus("ok");
  // Falle 10: ein POST in die Erstkompilierung eines Route Handlers wird unter `next dev` abgebrochen. Der Warmlauf-GET
  // übersetzt den Handler; 405 ist die Antwort eines übersetzten POST-Handlers (Vorbild: Import-Test der Funkverwaltung).
  const warmlauf = await page.request.get(url("/logo"));
  expect(warmlauf.status(), "der Logo-Handler antwortet nicht — der erste echte POST liefe in Falle 10").toBe(405);
  const hoch = page.waitForResponse((r) => r.url().endsWith("/logo") && r.request().method() === "POST");
  await page.locator('input[type="file"][name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: SVG }); // Name und Typ lügen
  expect((await hoch).status()).toBe(200);
  await expect(page.locator('.kp-einstellungen [role="status"]')).toHaveText("Logo übernommen (SVG).");
  await expect(page.getByRole("img", { name: "Vorschau des Kopfs: Musterorganisation e2e, mit Logo" })).toBeVisible();
  await page.goto(url(`/p/${id}/druck/a4`));
  await expect(page.locator(".kp-blatt [data-organisation]").first()).toHaveText("Musterorganisation e2e");
  await expect(page.locator(".kp-blatt [data-logo]")).toHaveCount(await page.locator(".kp-blatt").count());
  const href = await page.locator("#kp-logo").getAttribute("href");
  expect(Buffer.from(href!.split(",")[1], "base64").toString("utf8")).not.toMatch(/script|onload/);
  // Befund
  await page.goto(url("/einstellungen"));
  setzeAvModus("found");
  try {
    const abgelehnt = page.waitForResponse((r) => r.url().endsWith("/logo") && r.request().method() === "POST");
    await page.locator('input[type="file"][name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    expect((await abgelehnt).status()).toBe(422);
    await expect(page.locator('.kp-einstellungen [role="status"]')).toContainText("Virenscanner");
  } finally { setzeAvModus("ok"); }
  // Seed-Stand wiederherstellen
  await entferneLogo();
  await speichereName("Musterorganisation");
});
