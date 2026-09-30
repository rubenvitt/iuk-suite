import { expect, type Page, type Response } from "@playwright/test";
import { E2E_PORT, klickeWennRuhig, warteAufSpaltenaufteilung } from "./fixtures";

/**
 * Gemeinsame Helfer der kommplan-e2e (`kommplan-editor.spec.ts`, `kommplan-gliederung.spec.ts`).
 * Falle 10: jede ausgelöste Server Action per `waitForResponse` — Speichern trägt `"version"` im Rumpf,
 * die Standabfrage beim Montieren des Editors trägt weder `"version"` noch `"titel"`.
 */
export const HOST = "kommplan.localtest.me";
export const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;
export const ADMIN = "iuk-kommplan-bearbeiten";

export const istAktion = (r: Response) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined;
export const rumpf = (r: Response) => r.request().postData() ?? "";
export const istSpeichern = (r: Response) => istAktion(r) && rumpf(r).includes('"version"');
export const istStandAbfrage = (r: Response) => istAktion(r) && !rumpf(r).includes('"version"') && !rumpf(r).includes('"titel"') && !rumpf(r).includes(":");
export const flyinTitel = (page: Page) => page.locator(".kp-flyin").getByLabel("Titel", { exact: true });
export const karten = (page: Page) => page.locator(".kp-betrachter [data-karte]");

export async function speichertNach(page: Page, tu: () => Promise<unknown>): Promise<void> {
  const antwort = page.waitForResponse(istSpeichern);
  await tu();
  expect((await antwort).status()).toBe(200);
  await expect(page.locator(".kp-speicherstatus")).toHaveText(/^Gespeichert \d\d:\d\d$/);
}

/** Navigation in den Editor: die Standabfrage beim Montieren ist eine ausgelöste Anfrage (Falle 10). */
export async function oeffneEditor(page: Page, navigiere: () => Promise<unknown>): Promise<void> {
  const stand = page.waitForResponse(istStandAbfrage);
  await navigiere();
  expect((await stand).status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
}

export async function neuerPlan(page: Page, titel: string): Promise<string> {
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neu", exact: true }));
  const formular = page.getByRole("form", { name: "Neuer Plan" });
  await formular.getByLabel("Titel").fill(titel);
  await formular.getByLabel("Anlass").fill("e2e");
  const anlage = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"titel"'));
  await oeffneEditor(page, async () => {
    await klickeWennRuhig(formular.getByRole("button", { name: "Anlegen und bearbeiten" }));
    expect((await anlage).status()).toBe(200);
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/);
  });
  return new URL(page.url()).pathname.split("/").pop()!;
}

export async function ersteStelle(page: Page, titel: string): Promise<void> {
  await expect(page.locator(".kp-betrachter").getByText("Dieser Plan hat noch keine Stellen.")).toBeVisible();
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await expect(flyinTitel(page)).toBeFocused();
  await speichertNach(page, () => flyinTitel(page).fill(titel));
}
