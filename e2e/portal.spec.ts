import { test, expect, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, oeffneAlleApps, warteAufGestreamteInhalte } from "./fixtures";

test("portal und App-Umschalter blenden Apps ohne passende Pocket-ID-Gruppe aus", async ({
  page,
}) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.getByTestId("portal-grid")).toBeVisible();
  await expect(page.getByRole("main").getByText("BookStack")).toBeVisible();
  // group-gated service hidden without admin group
  await expect(page.getByText("Vaultwarden")).toHaveCount(0);

  // Die alte Modulknopfreihe (`modulzeile`) ist entfallen — der Modul-Wechsel
  // hängt seit dem Menue (IDA-347, Etappe 2) an der Ebene „Alle Apps", erst
  // öffnen, dann prüfen (dieselbe Vertragsänderung wie in `keystone.spec.ts`).
  // Die Kacheln oben greifen über `main`: dieselben Namen stehen auch in der
  // verdeckten App-Ebene des Menüs.
  const panel = await oeffneAlleApps(page);
  await expect(panel.getByRole("link", { name: "QR-Codes" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Feedback" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Dateien" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Lagerbuch" })).toHaveCount(0);
});

test("portal zeigt eine geschuetzte App bei passender Pocket-ID-Gruppe", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin" });
  await expect(page.getByRole("main").getByText("Vaultwarden")).toBeVisible();
});

test("admin can create a service", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin", callbackPath: "/admin" });
  await legeDienstAn(page, "Neuer Dienst", "https://neu.iuk-ue.de");
  await page.goto(`http://portal.localtest.me:${E2E_PORT}/`);
  await expect(page.getByRole("main").getByText("Neuer Dienst")).toBeVisible();
});

/*
 * IDA-227: ein nicht oeffentlicher Dienst mit Gruppe ist genau fuer deren
 * Mitglieder sichtbar. Die Gruppe wird EINGETIPPT, nicht aus der Liste gewaehlt:
 * ohne Pocket-ID-Key (e2e) stehen dort nur die Gruppen der Suite, und eingetippt
 * ist der Weg, den ein Ausfall des Verzeichnisses uebrig laesst.
 */
test("admin legt einen Dienst nur fuer eine Gruppe an", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin", callbackPath: "/admin" });
  const formular = await oeffneAnlegen(page);
  await formular.getByLabel("Name", { exact: true }).fill("Funk intern");
  await formular.getByLabel("Adresse", { exact: true }).fill("https://funk.iuk-ue.de");
  await formular.getByText("Öffentlich sichtbar").click();

  const anlegen = formular.getByRole("button", { name: "Anlegen" });
  await expect(anlegen).toBeDisabled();
  const auswahl = formular.getByLabel("Sichtbar für Gruppen");
  await auswahl.fill("e2e-funk");
  await auswahl.press("Enter");
  await auswahl.press("Escape");
  await expect(anlegen).toBeEnabled();
  await anlegen.click();

  const zeile = page.getByTestId("service-row").filter({ hasText: "Funk intern" });
  await expect(zeile).toContainText("e2e-funk");

  await page.context().clearCookies();
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.getByTestId("portal-grid")).toBeVisible();
  await expect(page.getByText("Funk intern")).toHaveCount(0);

  await page.context().clearCookies();
  await devLogin(page, { host: "portal.localtest.me", groups: "e2e-funk" });
  await expect(page.getByRole("main").getByText("Funk intern")).toBeVisible();
});

test("admin can delete a service — nur nach Rückfrage", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin", callbackPath: "/admin" });
  // Eigener, eindeutiger Dienst: die Seed-Daten bleiben unangetastet (der erste
  // Test prueft BookStack sichtbar), und ein eigener Name entkoppelt den Test
  // vom Anlege-Test — beide teilen bei `workers:1` dieselbe, einmal gewischte DB.
  await legeDienstAn(page, "Zu loeschender Dienst", "https://weg.iuk-ue.de");

  const row = page.getByTestId("service-row").filter({ hasText: "Zu loeschender Dienst" });
  await expect(row).toHaveCount(1);
  // IDA-391: „Löschen" steht im Zeilenmenü und fragt nach. Erst Abbrechen — die
  // Zeile bleibt; dann bestätigen — sie ist wirklich weg.
  await zeilenaktion(page, "Zu loeschender Dienst", "Löschen");
  const rueckfrage = page.getByRole("dialog").filter({ hasText: "„Zu loeschender Dienst“ löschen?" });
  await expect(rueckfrage).toBeVisible();
  await rueckfrage.getByRole("button", { name: "Abbrechen" }).click();
  await expect(rueckfrage).toBeHidden();
  await expect(row).toHaveCount(1);

  await zeilenaktion(page, "Zu loeschender Dienst", "Löschen");
  await rueckfrage.getByRole("button", { name: "Löschen" }).click();
  await expect(row).toHaveCount(0);
});

/* IDA-391: alles, was die Kachel zeigt, laesst sich nachtraeglich aendern. */
test("admin bearbeitet Name, Beschreibung und Kategorie eines Dienstes", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin", callbackPath: "/admin" });
  await legeDienstAn(page, "Zu bearbeitender Dienst", "https://bearbeiten.iuk-ue.de");

  await zeilenaktion(page, "Zu bearbeitender Dienst", "Bearbeiten");
  const formular = page.getByRole("form", { name: "Dienst bearbeiten" });
  await expect(formular.getByLabel("Name", { exact: true })).toHaveValue("Zu bearbeitender Dienst");
  await formular.getByLabel("Name", { exact: true }).fill("Bearbeiteter Dienst");
  await formular.getByLabel("Beschreibung", { exact: true }).fill("Kurzbeschreibung der Kachel");
  await formular.getByLabel("Kategorie", { exact: true }).fill("Werkzeuge");
  await formular.getByRole("button", { name: "Speichern" }).click();
  await expect(formular).toHaveCount(0);
  await expect(page.getByTestId("service-row").filter({ hasText: "Bearbeiteter Dienst" })).toContainText("Werkzeuge");

  await page.goto(`http://portal.localtest.me:${E2E_PORT}/`);
  await warteAufGestreamteInhalte(page);
  const kachel = page.getByTestId("service-tile").filter({ hasText: "Bearbeiteter Dienst" });
  await expect(kachel).toContainText("Kurzbeschreibung der Kachel");
});

/*
 * DER EINZIGE BEWUSST GEFUEHRTE SPEZIFITAETSSTREIT DES MODULS — hier gemessen.
 *
 * `portal.css` setzt `.ant-card.portal-kachel` (0,2,0) gegen antds
 * `.ant-card-hoverable:hover` (0,2,0) und begruendet die zusaetzliche Klasse
 * ausfuehrlich. Diese Begruendung ist eine Behauptung ueber die KASKADE, und die
 * besitzt kein Quelltext-Scan: welche von zwei gleich spezifischen Regeln
 * gewinnt, entscheidet die Einbindungsreihenfolge im Browser. Bis 2026-08-12 gab
 * es dafuer keine Zeile — `portal-kachel` kam in `e2e/` nirgends vor, obwohl der
 * Kommentar dort auf eine Pruefung verwies, die nicht existierte.
 *
 * Gemessen wird die PHYSISCHE Aufloesung `border-left-color` (LTR) und mit
 * `toHaveCSS`, nicht mit einem einmaligen `evaluate`: die Regel traegt
 * `transition: border-color 120ms`, eine einzelne Messung direkt nach `hover()`
 * laese einen Zwischenwert. `toHaveCSS` wiederholt, bis der Wert steht.
 *
 * Das Cookie wird ausdruecklich auf `light` gesetzt (`core/theme/mode.ts`, der
 * Umschalter der Suite): die beiden erwarteten Hex-Codes sind die HELLEN Werte
 * aus `globals.css`. Ohne das Cookie haenge der Test an der OS-Praeferenz des
 * Laufs — im Dunkeln waeren es `#2a2f34`/`#e45a66`, und der Test wuerde einen
 * intakten Kaskadenstreit als Bruch melden.
 *
 * Eigener Zustand: die Kachel ist der Seed-Dienst BookStack, denselben nutzt der
 * erste Test dieser Datei. Kein Rueckgriff auf etwas, das ein anderer Test
 * anlegt — Anlege- und Loeschtest teilen sich bei `workers: 1` dieselbe, einmal
 * gewischte Datenbank.
 */
test("die Kachelkante steht in Ruhe auf --iuk-linie und im Hover auf --iuk-marke", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "iuk-theme", value: "light", url: `http://portal.localtest.me:${E2E_PORT}` },
  ]);
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const link = page.getByTestId("service-tile").filter({ hasText: "BookStack" });
  await expect(link).toHaveCount(1);
  const kachel = link.locator(".portal-kachel");

  // Ruhezustand: `--iuk-linie` = #e7e7e4. Gewaenne antds `.ant-card-bordered`
  // (Shorthand auf allen vier Seiten), stuende hier dessen neutraler Rahmen.
  await expect(kachel).toHaveCSS("border-left-color", "rgb(231, 231, 228)");

  await link.hover();
  // Hover: `--iuk-marke` = #c8000f. Gewaenne `.ant-card-hoverable:hover`,
  // stuende hier `rgba(0, 0, 0, 0)` — antd setzt dort `transparent`, und genau
  // dieser stille Ausfall ist der Grund fuer die zusaetzliche `.ant-card`.
  await expect(kachel).toHaveCSS("border-left-color", "rgb(200, 0, 15)");

  // Die drei ANDEREN Kanten bleiben im Hover antds `transparent` — der
  // Kommentar in `portal.css` sagt ausdruecklich, das Hover-Bild zeige NUR die
  // rote Innenkante und keinen rundum roten Rahmen. Ohne diese Zeile ginge ein
  // versehentliches `border-color` auf allen vier Seiten durch.
  await expect(kachel).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
});

/*
 * IDA-240: ein langes Einzelwort im Kacheltitel lief auf dem Telefon über den
 * rechten Kachelrand („Kommunikationspläne“ neben dem App-Icon). Ein Flex-Kind
 * schrumpft nie unter sein längstes Wort; gemessen wird deshalb die Kante des
 * Titels gegen die Kante der Kachel, bei der Breite, an der es auffiel.
 * Eigener Dienst mit absichtlich überlangem Namen: welche Seed-App ein Login
 * ohne Gruppen sieht, soll hier nicht entscheiden, ob der Test etwas beweist.
 */
test("ein langer Kacheltitel bricht auf dem Telefon innerhalb der Kachel um", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin", callbackPath: "/admin" });
  await legeDienstAn(page, "Einsatzkommunikationsplanverwaltung", "https://lang.iuk-ue.de");
  await expect(page.getByTestId("service-row").filter({ hasText: "Einsatzkommunikationsplanverwaltung" })).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://portal.localtest.me:${E2E_PORT}/`);
  await warteAufGestreamteInhalte(page);

  const link = page.getByTestId("service-tile").filter({ hasText: "Einsatzkommunikationsplanverwaltung" });
  await expect(link).toHaveCount(1);
  const kachel = await link.locator(".portal-kachel").boundingBox();
  const titel = await link.getByTestId("kachel-titel").boundingBox();
  expect(kachel).not.toBeNull();
  expect(titel).not.toBeNull();
  expect(titel!.x + titel!.width).toBeLessThanOrEqual(kachel!.x + kachel!.width);
});

/**
 * „Dienst anlegen" steht seit IDA-391 im Seitenkopf und öffnet eine Schublade; ein Feld für die
 * Kennung gibt es nicht mehr (sie kommt aus dem Namen). Gescopt aufs Formular: „Name" steht auch
 * als Spaltenkopf in der Tabelle.
 */
async function oeffneAnlegen(page: Page) {
  await klickeWennRuhig(page.getByRole("button", { name: "Dienst anlegen" }));
  const formular = page.getByRole("form", { name: "Dienst anlegen" });
  await expect(formular).toBeVisible();
  return formular;
}

async function legeDienstAn(page: Page, name: string, adresse: string) {
  const formular = await oeffneAnlegen(page);
  await formular.getByLabel("Name", { exact: true }).fill(name);
  await formular.getByLabel("Adresse", { exact: true }).fill(adresse);
  await formular.getByRole("button", { name: "Anlegen" }).click();
  await expect(formular).toHaveCount(0);
}

/** Das Zeilenmenü eines Dienstes (IDA-391), dann den Eintrag. */
async function zeilenaktion(page: Page, name: string, eintrag: "Bearbeiten" | "Sichtbarkeit" | "Löschen") {
  await page.getByTestId("service-row").filter({ hasText: name }).getByRole("button", { name: `Aktionen für ${name}` }).click();
  await page.getByRole("menuitem", { name: eintrag }).click();
}
