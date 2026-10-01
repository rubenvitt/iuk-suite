import { expect, test, type Page, type Response } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { ADMIN, HOST, ersteStelle, flyinTitel, istAktion, neuerPlan, oeffneEditor, rumpf, speichertNach, url } from "./kommplan-hilfen";

/**
 * Kommunikationspläne, Phase 4: Bibliothek pflegen und im Editor nutzen (Spec §4.3, §6.4, §6.5). Jeder Test
 * legt eigene, eindeutig benannte Einträge an (Zustand nie vom Seed erben). Jede Action per waitForResponse.
 */
const neu = () => Math.random().toString(36).slice(2, 7);
const istBib = (teil: string) => (r: Response) => istAktion(r) && rumpf(r).includes(teil);
const stellenStatus = (page: Page) => page.locator('section[aria-label="Stellen der Bibliothek"] [role="status"]');

/** Eine eigene Bibliotheksstelle anlegen — der Test erbt nie die Seed-Bibliothek. */
async function legeBibStelleAn(page: Page, titel: string, leiter: string, telefon: string) {
  await page.goto(url("/bibliothek"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Stelle" }));
  const formular = page.locator(".kp-flyin").getByRole("form", { name: "Stelle der Bibliothek" });
  await formular.getByLabel("Titel", { exact: true }).fill(titel);
  await formular.getByLabel("Leiter", { exact: true }).fill(leiter);
  await formular.getByLabel("Telefon", { exact: true }).fill(telefon);
  const anlage = page.waitForResponse(istBib(titel));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await anlage).status()).toBe(200);
  await expect(stellenStatus(page)).toContainText(`„${titel}“ gespeichert.`);
}

test("Zugangsgruppe: kein Weg zur Bibliothek, /bibliothek ist 404", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("link", { name: "Bibliothek" })).toHaveCount(0);
  const r = await page.goto(url("/bibliothek"));
  expect(r?.status()).toBe(404);
});

test("Stelle anlegen, suchen, Dublette abgewiesen, löschen", async ({ page }) => {
  const titel = `EAL e2e ${neu()}`;
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await page.goto(url("/bibliothek"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Stelle" }));
  const formular = page.locator(".kp-flyin").getByRole("form", { name: "Stelle der Bibliothek" });
  await formular.getByLabel("Titel", { exact: true }).fill(titel);
  await formular.getByLabel("Leiter", { exact: true }).fill("Jana");
  const anlage = page.waitForResponse(istBib(titel));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await anlage).status()).toBe(200);
  await expect(stellenStatus(page)).toContainText(`„${titel}“ gespeichert.`);
  await warteAufGestreamteInhalte(page);
  await page.getByLabel("Stellen suchen").fill(titel.slice(-5));
  await expect(page.getByRole("table", { name: "Stellen" }).getByRole("row")).toHaveCount(2); // Kopf + Treffer
  // Dublette
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Stelle" }));
  await formular.getByLabel("Titel", { exact: true }).fill(titel.toUpperCase());
  const doppelt = page.waitForResponse(istBib(titel.toUpperCase()));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await doppelt).status()).toBe(200);
  await expect(page.locator(".kp-flyin")).toContainText("steht schon in der Bibliothek");
  await klickeWennRuhig(formular.getByRole("button", { name: "Abbrechen" }));
  // löschen
  await klickeWennRuhig(page.getByRole("table", { name: "Stellen" }).getByRole("button", { name: titel }));
  await klickeWennRuhig(formular.getByRole("button", { name: "Löschen" }));
  const weg = page.waitForResponse(istBib('"stelle"'));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Löschen" }));
  expect((await weg).status()).toBe(200);
  await expect(stellenStatus(page)).toContainText("gelöscht");
});

test("CSV importieren: Vorschau mit Umlauten aus Windows-1252, Dublette übersprungen", async ({ page }) => {
  const ruf = `RK e2e ${neu()}`;
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await page.goto(url("/bibliothek"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("tab", { name: /^Einheiten/ }));
  // Zustand selbst herstellen: die Einheit, gegen die die CSV eine Dublette trägt (nie eine Seed-Einheit).
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Einheit" }));
  const formular = page.locator(".kp-flyin").getByRole("form", { name: "Einheit der Bibliothek" });
  await formular.getByLabel("Typ", { exact: true }).fill("RTW");
  await formular.getByLabel("Rufname", { exact: true }).fill(`${ruf} Basis`);
  const anlage = page.waitForResponse(istBib(`${ruf} Basis`));
  await klickeWennRuhig(formular.getByRole("button", { name: "Speichern", exact: true }));
  expect((await anlage).status()).toBe(200);
  // Die Vorschau vergleicht gegen die Einheiten aus den Server-Props — erst nach dem `router.refresh()` steht die neue
  // Einheit darin. Ohne dieses Warten liefe die Vorschau gelegentlich gegen den alten Stand („2 übernehmen").
  await expect(page.getByRole("table", { name: "Einheiten" })).toContainText(`${ruf} Basis`);
  await warteAufGestreamteInhalte(page);
  const csv = `Typ;Rufname;Notiz\r\nKTW;${ruf} Großenkneten;Übung\r\nKTW;${ruf.toLowerCase()} großenkneten;\r\nRTW;${ruf.toLowerCase()}  basis ;\r\n`;
  const bytes = Buffer.from([...csv].map((c) => c.charCodeAt(0))); // Latin-1 = Windows-1252 für diese Zeichen
  await page.locator('input[type="file"][name="csv"]').setInputFiles({ name: "einheiten.csv", mimeType: "text/csv", buffer: bytes });
  const vorschau = page.locator(".kp-flyin").filter({ has: page.getByRole("table", { name: "Vorschau" }) });
  await expect(vorschau).toContainText(`${ruf} Großenkneten`);
  await expect(vorschau).toContainText("doppelt in der Liste");
  await expect(vorschau).toContainText("schon in der Bibliothek");
  const imp = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes(`${ruf} Großenkneten`));
  await klickeWennRuhig(vorschau.getByRole("button", { name: "1 übernehmen" }));
  expect((await imp).status()).toBe(200);
  await expect(page.locator('section[aria-label="Einheiten der Bibliothek"] [role="status"]')).toContainText("1 angelegt, 0 übersprungen.");
});

test("Editor: Aus Bibliothek füllt die Stelle, ein Schritt zurück; Gliederung schlägt beim Tippen vor", async ({ page }) => {
  const leit = `Leitstelle e2e ${neu()}`;
  const telefon = `0581 ${10_000 + Math.floor(Math.random() * 89_999)}`;
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await legeBibStelleAn(page, leit, "Disponent", telefon); // eigener Eintrag, nie der Seed
  await neuerPlan(page, `e2e Bibliothek ${neu()}`);
  await ersteStelle(page, "EL");
  const auswahl = page.locator(".kp-flyin").getByLabel("Aus Bibliothek", { exact: true });
  await klickeWennRuhig(auswahl);
  await auswahl.fill(leit.slice(-5)); // gezielt suchen: andere Läufe legen ähnliche Einträge an
  await speichertNach(page, () => klickeWennRuhig(page.locator(".ant-select-item-option", { hasText: leit })));
  await expect(flyinTitel(page)).toHaveValue(leit);
  await expect(flyinTitel(page)).toBeFocused(); // die Wahl lässt den Fokus nicht auf body fallen
  await expect(page.locator(".kp-betrachter")).toContainText(telefon);
  await page.keyboard.press("Escape");
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+z"));
  await expect(page.locator(".kp-betrachter")).toContainText("EL");
  // Gliederung: Vorschlag beim Tippen (Taste für Taste), Alt+Enter übernimmt, der Fokus bleibt
  const pfad = new URL(page.url()).pathname;
  await oeffneEditor(page, () => page.goto(url(`${pfad}?ansicht=gliederung`)));
  const titelFeld = page.locator('.kp-gliederung [data-zeile] input[name="titel"]').first();
  await titelFeld.click();
  await titelFeld.fill("");
  // Bis auf das letzte Zeichen tippen: der eigene Eintrag ist dann der einzige (und erste) Vorschlag.
  await speichertNach(page, () => titelFeld.pressSequentially(leit.slice(0, -1)));
  await expect(page.getByRole("group", { name: "Vorschläge aus der Bibliothek" })).toContainText(leit);
  await speichertNach(page, () => titelFeld.press("Alt+Enter"));
  await expect(titelFeld).toHaveValue(leit);
  await expect(titelFeld).toBeFocused();
});

test.describe("Telefon mit Touch", () => {
  // `test.use` statt eines eigenen `browser.newContext`: so bleiben alle `use`-Vorgaben aus `playwright.config.ts`
  // (Basis, Sprache, Zeitzone, Cloud-Einstellungen) erhalten — nur Größe und Touch kommen dazu.
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("Gliederung am Telefon: Vorschlag per Tippen übernehmen — Titel gefüllt, Feld fokussiert, keine Zeile verloren", async ({ page }) => {
    const leit = `Leitstelle e2e ${neu()}`;
    await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
    await legeBibStelleAn(page, leit, "Disponent", "0581 1");
    await neuerPlan(page, `e2e Telefon ${neu()}`); // am Telefon öffnet der Editor in der Gliederung (Phase 3)
    // Ein neuer Plan ist leer: die erste Zeile entsteht über „Erste Stelle anlegen“ (wie in kommplan-gliederung.spec.ts).
    await page.getByRole("button", { name: "Erste Stelle anlegen" }).tap();
    const titelFeld = page.locator('.kp-gliederung [data-zeile] input[name="titel"]').first();
    await expect(titelFeld).toBeFocused();
    const zeilen = await page.locator(".kp-gliederung [data-zeile]").count();
    await speichertNach(page, () => titelFeld.pressSequentially(leit.slice(0, -1)));
    await expect(page.locator(".kp-vorschlag-hinweis")).toBeHidden(); // kein Alt-Hinweis ohne Alt-Taste
    await speichertNach(page, () => page.locator(`[data-vorschlag]`, { hasText: leit }).tap());
    await expect(titelFeld).toHaveValue(leit);
    await expect(titelFeld).toBeFocused();
    await expect(page.locator(".kp-gliederung [data-zeile]")).toHaveCount(zeilen);
  });
});
