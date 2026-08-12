import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("portal und Kopfumschalter blenden Apps ohne passende Pocket-ID-Gruppe aus", async ({
  page,
}) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.getByTestId("portal-grid")).toBeVisible();
  await expect(page.getByText("BookStack")).toBeVisible();
  // group-gated service hidden without admin group
  await expect(page.getByText("Vaultwarden")).toHaveCount(0);

  // Die alte Modulknopfreihe (`modulzeile`) ist entfallen — der Modul-Wechsel
  // hängt jetzt am Umschalter der Kopfzeile, erst öffnen, dann prüfen
  // (dieselbe Vertragsänderung wie in `keystone.spec.ts`).
  await page.getByTestId("app-umschalter").click();
  const panel = page.getByTestId("app-panel");
  await expect(panel.getByRole("link", { name: "QR-Codes" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Feedback" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Dateien" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Lagerbuch" })).toHaveCount(0);
});

test("portal zeigt eine geschuetzte App bei passender Pocket-ID-Gruppe", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins" });
  await expect(page.getByText("Vaultwarden")).toBeVisible();
});

test("admin can create a service", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins", callbackPath: "/admin" });
  await page.getByLabel("slug").fill("neu");
  await page.getByLabel("name").fill("Neuer Dienst");
  await page.getByLabel("url").fill("https://neu.iuk-ue.de");
  await page.getByRole("button", { name: /anlegen|create/i }).click();
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page.getByText("Neuer Dienst")).toBeVisible();
});

test("admin can delete a service", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins", callbackPath: "/admin" });
  // Eigener, eindeutiger Dienst: die Seed-Daten bleiben unangetastet (der erste
  // Test prueft BookStack sichtbar), und ein eigener Name entkoppelt den Test
  // vom Anlege-Test — beide teilen bei `workers:1` dieselbe, einmal gewischte DB.
  await page.getByLabel("slug").fill("weg");
  await page.getByLabel("name").fill("Zu loeschender Dienst");
  await page.getByLabel("url").fill("https://weg.iuk-ue.de");
  await page.getByRole("button", { name: /anlegen|create/i }).click();

  const row = page.getByTestId("service-row").filter({ hasText: "Zu loeschender Dienst" });
  await expect(row).toHaveCount(1);
  // Auf die Zielzeile gescopt: "Loeschen" gibt es pro Zeile einmal. Der Knopf ist
  // seit dem antd-Umbau `<Button danger htmlType="submit">` in einem nativen
  // <form action={deleteServiceAction}> — ohne htmlType waere er ein stiller
  // No-op (antd-Default type="button"), und kein anderer Test faehrt diesen Pfad.
  await row.getByRole("button", { name: "Löschen" }).click();
  // Zusicherung: die Zeile ist wirklich weg, nicht nur der Knopf vorhanden.
  await expect(row).toHaveCount(0);
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
    { name: "iuk-theme", value: "light", url: "http://portal.localtest.me:3100" },
  ]);
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const link = page.getByTestId("service-tile").filter({ hasText: "BookStack" });
  await expect(link).toHaveCount(1);
  const kachel = link.locator(".portal-kachel");

  // Ruhezustand: `--iuk-linie` = #d9dde1. Gewaenne antds `.ant-card-bordered`
  // (Shorthand auf allen vier Seiten), stuende hier dessen neutraler Rahmen.
  await expect(kachel).toHaveCSS("border-left-color", "rgb(217, 221, 225)");

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
