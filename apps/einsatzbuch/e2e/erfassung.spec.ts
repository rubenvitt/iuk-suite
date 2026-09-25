/**
 * Erfassung im echten Browser gegen den Vite-Dev-Server, mit gestubbtem `invoke`
 * (`./stub.ts`). Deckt den Ablauf Erfassen → Frist → Versiegeln aus `App.tsx` ab, dazu die
 * Fälle, in denen die Frist während einer Bearbeitung abläuft, ein nur halb angegebenes Ende
 * und den nicht eingerichteten Rechner.
 */
import { expect, test, type Page } from "@playwright/test";

import { installiereStub } from "./stub";

interface Aufruf {
  cmd: string;
  args: { entwurf?: { vorOrt: number } };
}

/**
 * Öffnet das Formular, füllt die kleinste vollständige Erfassung aus (Stichwort, Ort, ein
 * Fahrzeug, eine Person) und sendet ab. Gemeinsamer Anfang aller Tests mit abgesendetem Einsatz.
 */
async function erfasseUndSendeAb(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("TESTBETRIEB — nichts hiervon ist ein echter Einsatz")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Neuer Einsatz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einsatz absenden" })).toBeDisabled();
  await page.getByRole("button", { name: "RD 2" }).click();
  await page.getByLabel("PLZ, Ort").fill("29525 Uelzen");
  await page.getByLabel("Fahrzeug suchen").fill("83-1");
  await page.getByLabel("Fahrzeug suchen").press("Enter");
  await page.getByLabel("Person suchen").fill("Dierks");
  await page.getByLabel("Person suchen").press("Enter");
  await page.getByRole("button", { name: "Einsatz absenden" }).click();
  await expect(page.getByText("Abgesendet · noch änderbar")).toBeVisible();
}

test("erfassen → Frist → Angaben ändern → Jetzt versiegeln", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 60 });
  await erfasseUndSendeAb(page);

  await page.getByRole("button", { name: "Angaben ändern" }).click();
  // `getByLabel` allein ist hier zweideutig: Die Zähler-Knöpfe tragen `aria-label="Vor Ort
  // behandelt: weniger/mehr"`, ein Teiltreffer auf denselben Namen. Die Rolle grenzt auf das
  // Eingabefeld ein.
  await page.getByRole("textbox", { name: "Vor Ort behandelt" }).fill("2");
  await page.getByRole("button", { name: "Änderungen übernehmen" }).click();
  await page.getByRole("button", { name: "Jetzt versiegeln" }).click();

  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible();
  await expect(page.getByText("Block 1 · neu")).toBeVisible();
  await expect(page.getByText(/Deine letzten Änderungen/)).toHaveCount(0);

  const absendungen = await page.evaluate(
    () => (window as unknown as { __aufrufe: Aufruf[] }).__aufrufe.filter((a) => a.cmd === "absenden"),
  );
  expect(absendungen.map((a) => a.args.entwurf?.vorOrt)).toEqual([0, 2]);
});

test("Frist läuft ab, während ungespeichert bearbeitet wird → abgesendeter Stand, Hinweis", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 4 });
  await erfasseUndSendeAb(page);

  await page.getByRole("button", { name: "Angaben ändern" }).click();
  await page.getByLabel("Notizen").fill("Notiz, die nicht übernommen wird");
  // Kein Klick auf „Änderungen übernehmen“ — die Frist läuft ab, während der Entwurf nur noch
  // (verzögert) gespeichert, aber nie abgesendet wird.

  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand."),
  ).toBeVisible();
});

test("ein Ende nur mit Datum sperrt das Absenden, mit Uhrzeit geht es", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 60 });
  await page.goto("/");
  await expect(page.getByText("TESTBETRIEB — nichts hiervon ist ein echter Einsatz")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "RD 2" }).click();
  await page.getByLabel("PLZ, Ort").fill("29525 Uelzen");
  await page.getByLabel("Ende · Datum").fill("2026-09-24");

  await expect(page.getByText("Ende nur mit Datum und Uhrzeit angeben.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Einsatz absenden" })).toBeDisabled();

  await page.getByLabel("Ende · Uhrzeit").fill("11:30");
  await page.getByRole("button", { name: "Einsatz absenden" }).click();
  await expect(page.getByText("Abgesendet · noch änderbar")).toBeVisible();
});

test("nicht eingerichtet: Einrichtungsfrage, Entwicklerweg nur im Debug-Build", async ({ page }) => {
  await installiereStub(page, { betrieb: null, entwicklung: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Diesen Rechner einrichten" })).toBeVisible();
  await expect(page.getByText("Entwickler-Einrichtung (nur Debug-Build)")).toHaveCount(0);
});

test("eine Bearbeitung, die während des Ablaufs offen bleibt, legt keinen zweiten Einsatz an", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 4 });
  await erfasseUndSendeAb(page);

  await page.getByRole("button", { name: "Angaben ändern" }).click();
  await page.getByRole("textbox", { name: "Vor Ort behandelt" }).fill("5");
  // Kein Klick auf „Änderungen übernehmen“: Die Frist-Uhr der Oberfläche (`useFristUhr` in
  // `App.tsx`) fragt bei Restzeit 0 selbst `frist_pruefen` ab und schaltet die Seite um, sobald
  // eine Versiegelung zurückkommt — ein „Änderungen übernehmen“ nach Fristende kommt dadurch gar
  // nicht mehr zum Zug, der Knopf ist zu dem Zeitpunkt schon verschwunden. Genau das prüft dieser
  // Test: Es entsteht kein zweiter Einsatz aus der offen gebliebenen Bearbeitung.
  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand."),
  ).toBeVisible();

  // Genau eine Versiegelung in der Kette und genau ein `absenden`-Aufruf — kein zweiter Einsatz.
  const s = await page.evaluate(
    () =>
      (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<{ kette: { anzahl: number } }> } }).__TAURI_INTERNALS__.invoke(
        "status",
      ),
  );
  expect(s.kette.anzahl).toBe(1);
  const absendungen = await page.evaluate(() => (window as unknown as { __aufrufe: Aufruf[] }).__aufrufe.filter((a) => a.cmd === "absenden"));
  expect(absendungen).toHaveLength(1);
});

test("„Testbetrieb beenden“ mit Bestätigung führt zur Einrichtungsfrage", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 60 });
  await page.goto("/");
  await expect(page.getByText("TESTBETRIEB — nichts hiervon ist ein echter Einsatz")).toBeVisible();

  await page.getByRole("button", { name: "Testbetrieb beenden" }).click();
  // Titel per `getByRole("button", ...)`-Nachbarschaft nicht per Text: „Testbetrieb beenden?“ ist
  // der Dialogtitel, „Testbetrieb beenden“ (ohne Fragezeichen) der auslösende Knopf.
  await expect(page.getByRole("heading", { name: "Testbetrieb beenden?" })).toBeVisible();
  await page.getByRole("button", { name: "Testdatenbank löschen" }).click();

  await expect(page.getByRole("heading", { name: "Diesen Rechner einrichten" })).toBeVisible();
});
