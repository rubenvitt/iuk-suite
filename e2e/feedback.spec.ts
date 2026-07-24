import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * E2E fuer das Modul `feedback`. Deckt die drei Szenarien aus dem Task-16-
 * Brief ab: anonyme Teilnahme + Dedup-Redirect, den vollen Admin-Lebenszyklus
 * (Gruppe -> Dienstabend -> Umfrage erstellen/aktivieren/schliessen ->
 * Auswertung) und die IDOR-Guard fuer fremde Gruppen-Seiten.
 *
 * Server Actions (actions.ts) haben laut Brief bewusst keine isolierten Unit-
 * Tests — diese Datei ist die einzige Stelle, die den kompletten Draht von
 * Formular -> Server Action -> DB -> Re-Render tatsaechlich durchspielt.
 */

const FEEDBACK = "http://feedback.localtest.me:3100";
// Aus dem Seed (Task 14, seedFeedback): Gruppe "Demo", slug "demo", secret
// "demo1", eine bereits AKTIVE Umfrage mit den 14 STANDARD_QUESTIONS.
const DEMO_TOKEN = "demo-demo1";

test("anonym: Ratings + Freitext absenden, danach Dedup-Redirect auf /thanks", async ({ page }) => {
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);

  // Acht Bewertungsfragen (schulnote, Skala 1-6). Jede rendert einen eigenen
  // rc-rate-Satz aus role="radio"-Elementen (aria-setsize = Skala, aria-
  // posinset = Position). Der 5. Stern jeder 6er-Skala trifft GENAU einen
  // Radio pro Bewertungsfrage — robuster als eine Kopplung an Kartentitel
  // oder DOM-Reihenfolge, und beweist nebenbei, dass alle acht Rating-Felder
  // ueberhaupt rendern und klickbar sind.
  const fifthStars = page.locator('[role="radio"][aria-setsize="6"][aria-posinset="5"]');
  await expect(fifthStars).toHaveCount(8);
  const starCount = await fifthStars.count();
  for (let i = 0; i < starCount; i++) {
    await fifthStars.nth(i).click();
  }

  // Ein Freitext (q9 = erste Textfrage) reicht laut Brief.
  await page.locator('textarea[name="q9"]').fill("Die praktischen Übungen waren super.");

  await page.getByRole("button", { name: "Absenden" }).click();
  await page.waitForURL(`${FEEDBACK}/f/${DEMO_TOKEN}/thanks`);
  await expect(page.getByText(/Vielen Dank für deine Rückmeldung/)).toBeVisible();

  // Erneuter Aufruf: das Dedup-Cookie `feedback-{surveyId}` (submitResponse-
  // Action, 24h) steht bereits — ParticipatePage muss auf /thanks
  // redirecten statt das Formular ein zweites Mal zu zeigen.
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await expect(page).toHaveURL(`${FEEDBACK}/f/${DEMO_TOKEN}/thanks`);
  await expect(page.getByText(/Vielen Dank für deine Rückmeldung/)).toBeVisible();
});

test("Admin: Gruppe -> Dienstabend -> Umfrage erstellen/aktivieren/schliessen -> Auswertung", async ({
  page,
}) => {
  await devLogin(page, { host: "feedback.localtest.me", groups: "da-feedback-admin", callbackPath: "/" });

  // Nur Voll-Admin darf Gruppen anlegen (createGroupAction wirft sonst) — die
  // Rolle "da-feedback-admin" ist hier bewusst gesetzt, nicht "da-feedback-gl".
  await page.getByPlaceholder("Name").fill("E2E Gruppe");
  await page.getByPlaceholder("slug").fill("e2e-gruppe");
  await page.getByRole("button", { name: "Gruppe anlegen" }).click();

  const groupRow = page.getByTestId("group-row").filter({ hasText: "E2E Gruppe" });
  await expect(groupRow).toHaveCount(1);
  await groupRow.getByRole("link", { name: "E2E Gruppe" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Gruppe" })).toBeVisible();

  // Dienstabend anlegen. Das Datumsfeld traegt kein Label (nur `name="date"`
  // in EveningForm.tsx), deshalb ueber den name-Attribut-Selektor statt
  // getByLabel.
  const today = new Date().toISOString().slice(0, 10);
  await page.locator('input[name="date"]').fill(today);
  await page.getByPlaceholder("Thema (optional)").fill("E2E Dienstabend");
  await page.getByRole("button", { name: "Dienstabend anlegen" }).click();

  await page.getByRole("link", { name: /E2E Dienstabend/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Dienstabend" })).toBeVisible();

  // Umfrage erstellen (draft) -> aktivieren -> schliessen. Genau ein Aktions-
  // Button pro Status (SurveyControls.tsx), die Tag-Beschriftung ist der
  // sichtbare Statuswechsel.
  await page.getByRole("button", { name: "Umfrage erstellen" }).click();
  await expect(page.getByText("Entwurf", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Aktivieren" }).click();
  await expect(page.getByText("Aktiv", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Schließen" }).click();
  await expect(page.getByText("Geschlossen", { exact: true })).toBeVisible();

  // Erst nach dem Schliessen zeigt EveningDetail den Link zur Auswertung.
  await page.getByRole("link", { name: "Auswertung ansehen" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Auswertung" })).toBeVisible();
  // Ø sichtbar — auch ohne Rückmeldungen zeigt die Seite die Zeile ("–" statt
  // Zahl), der Brief verlangt nur, dass die Auswertungsseite laedt und die
  // Durchschnittszeile da ist, nicht einen bestimmten Wert.
  await expect(page.getByText(/Gesamt-Ø:/)).toBeVisible();
});

test("IDOR-Guard: groupleader ohne Zuordnung bekommt auf einer fremden Gruppen-Seite 404", async ({
  page,
}) => {
  // Demo-Gruppen-ID bewusst NICHT hart kodiert: als Admin einloggen, die ID
  // aus dem Listen-Link lesen (verlässlich, unabhängig von Insert-Reihenfolge
  // über mehrere Testdateien/-läufe hinweg), dann ausloggen.
  await devLogin(page, { host: "feedback.localtest.me", groups: "da-feedback-admin", callbackPath: "/" });
  // Exakter Name statt hasText:"Demo" — der Seed (Task 17) legt inzwischen
  // auch "Demo Jugend" an, dessen Name "Demo" als Teilstring enthält und
  // sonst zwei group-rows träfe (Playwright-Strict-Mode-Fehler).
  const demoLink = page.getByTestId("group-row").getByRole("link", { name: "Demo", exact: true });
  const href = await demoLink.getAttribute("href");
  const groupId = href?.match(/\/groups\/(\d+)$/)?.[1];
  expect(groupId, `Demo-Gruppen-Link ohne numerische ID: ${href}`).toBeTruthy();

  await page.context().clearCookies();

  // "da-feedback-gl" reicht für den (ungegateten) Modul-Zugang, aber ohne
  // Zeile in user_groups bleibt memberGroupIdsFor leer — genau der Fall, den
  // assertGroupAccess/guardPage abfangen muss (die Alt-IDOR). Der Dev-Login
  // kennt keine Gruppen-Zuordnung feiner als die OIDC-Gruppen-Claims, daher
  // dieser Ansatz statt eines echten "eingeloggt aber nicht zugeordnet"-
  // Setups über user_groups (das nur der Import-Pfad befüllt).
  await devLogin(page, { host: "feedback.localtest.me", groups: "da-feedback-gl" });
  const res = await page.goto(`${FEEDBACK}/groups/${groupId}`);
  expect(res?.status()).toBe(404);
});
