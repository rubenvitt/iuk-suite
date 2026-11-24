import { expect, test, type Locator } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul veranstaltungen (IDA-415) und der Verweis der Schichtplanung (IDA-416): Veranstaltung anlegen,
 * in der Schichtplanung eine Planung dazu anlegen (Name, Ort, Zeitraum kommen mit), den Einsatz in
 * Lifeline Hub eintragen und im Kopf der Planung wiederfinden. Zufallsteil im Namen für Wiederholungen.
 */
const VA = "veranstaltungen.localtest.me";
const SP = "schichtplan.localtest.me";
const url = (host: string, p: string) => `http://${host}:${E2E_PORT}${p}`;

/** Beginn und Ende je als Datum und Uhrzeit (`schichtplan/_ui/Zeitfelder.tsx`). */
async function zeitraum(feld: Locator, von: string, bis: string): Promise<void> {
  for (const [wer, wert] of [["Beginn", von], ["Ende", bis]] as const) {
    const [tag, uhr] = wert.split(" ");
    for (const [teil, text] of [["Datum", tag], ["Uhrzeit", uhr]] as const) {
      const eingabe = feld.getByLabel(`${wer} ${teil}`);
      await expect(eingabe).toBeEnabled();
      await eingabe.click();
      await eingabe.fill(text);
      await eingabe.press("Enter");
      await expect(eingabe).toHaveValue(text);
    }
  }
}

test("Veranstaltung anlegen und eine Planung mit Hub-Einsatz daran hängen", async ({ page }) => {
  test.setTimeout(90_000);
  const name = `Testlauf ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await devLogin(page, { host: VA, groups: "veranstaltungen-nutzer,schichtplan-nutzer", callbackPath: "/" });
  await page.goto(url(VA, "/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  await klickeWennRuhig(page.getByRole("button", { name: "Neue Veranstaltung" }));
  const neu = page.getByRole("dialog");
  await neu.getByLabel("Name").fill(name);
  await zeitraum(neu.getByRole("group", { name: "Zeitraum" }), "20.06.2031 09:00", "20.06.2031 18:00");
  await neu.getByLabel("Ort").fill("Festwiese");
  await neu.getByText("Zugesagt").click();
  await neu.getByRole("button", { name: "Anlegen" }).click();
  const karte = page.locator(".ant-card").filter({ hasText: name });
  await expect(karte).toBeVisible();
  await expect(karte).toContainText("Zugesagt");
  await expect(karte).toContainText("Festwiese");

  // Schichtplanung (dieselbe Sitzung): die Veranstaltung wählen, Name und Ort kommen mit.
  await page.goto(url(SP, "/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Planung" }));
  const plan = page.getByRole("dialog");
  await plan.getByRole("combobox", { name: /^Veranstaltung/ }).click();
  await page.locator(".ant-select-item-option").filter({ hasText: name }).click();
  await expect(plan.getByLabel("Name")).toHaveValue(name);
  await expect(plan.getByLabel("Ort", { exact: true })).toHaveValue("Festwiese");
  await expect(plan.getByLabel("Beginn Uhrzeit")).toHaveValue("09:00");

  // Ein Text, der kein Einsatz ist, steht am Feld; der Link aus der Adresszeile geht.
  const einsatz = plan.getByLabel("Einsatz in Lifeline Hub");
  await einsatz.fill("https://hub.example.org/lagekarte");
  await plan.getByRole("button", { name: "Planung anlegen" }).click();
  await expect(plan.getByRole("alert")).toContainText("kein Einsatz aus Lifeline Hub");
  await einsatz.fill("https://hub.example.org/einsaetze/42/etb");
  await plan.getByRole("button", { name: "Planung anlegen" }).click();
  await page.waitForURL(/\/p\/[^/?]+$/);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(`Veranstaltung: ${name}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Einsatz öffnen" })).toHaveAttribute("href", "https://hub.example.org/einsaetze/42");
});
