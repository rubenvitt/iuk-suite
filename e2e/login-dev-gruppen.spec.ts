import { test, expect } from "@playwright/test";

/**
 * DIE GRUPPEN-HÄKCHEN DES ENTWICKLUNGS-LOGINS.
 *
 * Vitest kann das nicht: `devGroupChoices` prüft es dort gegen die Registry,
 * aber ob ein Häkchen auch im Token landet, entscheidet sich erst über
 * `signIn("dev-login")` → `parseDevGroups` → JWT → `session.user.groups`. Diese
 * Kette hat keinen anderen Beobachter als einen echten Abruf.
 *
 * DIE ZWEITE ZUSAGE STEHT IM DRITTEN TEST: ohne Häkchen ist das Ergebnis exakt
 * der Freitext. Daran hängt `e2e/fixtures.ts:18` und mit ihm jede anmeldende
 * Spec der Suite — die Häkchen sind eine Ergänzung des Formulars, keine
 * Umstellung seines Vertrags.
 */

const LOGIN = "http://portal.localtest.me:3100/login?callbackUrl=%2F";

/** Wie in `fixtures.ts`: erst hydriert klicken, sonst fällt das Formular auf ein natives GET durch. */
async function oeffneLogin(page: import("@playwright/test").Page) {
  await page.goto(LOGIN);
  await page.waitForLoadState("networkidle");
}

/**
 * ANHAKEN MIT WIEDERHOLUNG — und das ist keine Vorsicht auf Verdacht, sondern
 * ein gemessener Ausfall: isoliert lief `.check()` vier von vier Mal, im vollen
 * Suitenlauf starb der erste Test an
 * „Clicking the checkbox did not change its state".
 *
 * Der Grund ist die kontrollierte Checkbox. `networkidle` sagt „Skripte geladen",
 * nicht „React hat den Baum übernommen"; trifft der Klick in dieses Fenster,
 * setzt React den nativen `checked`-Wert beim ersten Rendern wieder auf den
 * State zurück — der Klick ist weg, und `.check()` wiederholt von sich aus
 * NICHT, es prüft den Zustand einmal und wirft. Unter dem vollen Lauf ist das
 * Fenster breiter, weil der Dev-Server nebenher noch übersetzt.
 *
 * `toPass` klickt deshalb erneut, bis das Häkchen steht. `fixtures.ts` fällt das
 * nicht auf: `fill()` prüft nicht nach, ob der Wert überlebt hat.
 */
async function hakeAn(page: import("@playwright/test").Page, name: string) {
  const kaestchen = page.getByLabel(name);
  await expect(async () => {
    await kaestchen.check();
    await expect(kaestchen).toBeChecked();
  }).toPass({ timeout: 30_000 });
}

async function abschickenUndGruppenLesen(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Dev-Login" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.waitForLoadState("networkidle");
  const session = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  return (session?.user?.groups ?? []) as string[];
}

test("ein Häkchen landet als Gruppe im Token", async ({ page }) => {
  await oeffneLogin(page);
  await hakeAn(page, "iuk-files-admin");
  expect(await abschickenUndGruppenLesen(page)).toEqual(["iuk-files-admin"]);
});

test("„Alle auswählen“ hakt jede angebotene Gruppe an", async ({ page }) => {
  await oeffneLogin(page);
  const angebotene = await page.getByRole("checkbox").count();
  // Eine mehr als die Gruppen: der Schalter selbst ist auch eine Checkbox.
  expect(angebotene).toBeGreaterThan(1);
  await hakeAn(page, "Alle auswählen");

  const gruppen = await abschickenUndGruppenLesen(page);
  expect(gruppen).toHaveLength(angebotene - 1);
  // Stichprobe statt Gesamtliste: die Registry wächst, der Test soll dabei
  // nicht jedes Mal nachgezogen werden müssen. Dass die Liste VOLLSTÄNDIG ist,
  // prüft `src/core/auth/devGroups.test.ts` gegen MODULES.
  //
  // BEIDE Namen stehen fest in der Registry. `dashboard-admins` wäre hier der
  // falsche Beleg: das ist nur die VORBELEGUNG von `ADMIN_GROUP`
  // (`core/groups.ts`), und der Test hinge damit an der Env der Maschine statt
  // am Code — grün hier, rot auf einem Server mit anders benannter
  // Betreibergruppe.
  expect(gruppen).toContain("alpha-users");
  expect(gruppen).toContain("lagerbuch_nutzer");
});

test("ohne Häkchen zählt allein der Freitext — der Vertrag von fixtures.ts", async ({ page }) => {
  await oeffneLogin(page);
  await page.getByLabel("groups").fill("erfundene-gruppe, alpha-users");
  expect(await abschickenUndGruppenLesen(page)).toEqual(["erfundene-gruppe", "alpha-users"]);
});

test("Häkchen und Freitext vereinigen sich, doppelt genannt zählt einmal", async ({ page }) => {
  await oeffneLogin(page);
  await hakeAn(page, "alpha-users");
  await page.getByLabel("groups").fill("alpha-users, erfundene-gruppe");
  expect(await abschickenUndGruppenLesen(page)).toEqual(["alpha-users", "erfundene-gruppe"]);
});
