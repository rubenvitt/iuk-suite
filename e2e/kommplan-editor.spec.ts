import { expect, test, type Page, type Response } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";

/**
 * Kommunikationspläne, Phase 2: der Diagramm-Editor (Spec §6.1–6.4, §6.6). Jeder bearbeitende Test
 * legt seinen eigenen Plan an — die Seed-Pläne gehören `e2e/kommplan.spec.ts`. Jeder ausgelöste
 * Aufruf einer Server Action wird per `waitForResponse` geprüft (Falle 10): Speichern trägt
 * `"version"` im Rumpf, die Standabfrage beim Montieren des Editors (Entscheidung 21) trägt weder
 * `"version"` noch `"titel"`, die Zeichen-Nachladung trägt Zeichenschlüssel.
 */
const HOST = "kommplan.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;
const ADMIN = "iuk-kommplan-bearbeiten";
const EINSATZ = "beispiel-einsatz-2026-02-22";

const istAktion = (r: Response) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined;
const rumpf = (r: Response) => r.request().postData() ?? "";
const istSpeichern = (r: Response) => istAktion(r) && rumpf(r).includes('"version"');
const istStandAbfrage = (r: Response) => istAktion(r) && !rumpf(r).includes('"version"') && !rumpf(r).includes('"titel"') && !rumpf(r).includes(":");
const flyinTitel = (page: Page) => page.locator(".kp-flyin").getByLabel("Titel", { exact: true });
const karten = (page: Page) => page.locator(".kp-betrachter [data-karte]");

async function speichertNach(page: Page, tu: () => Promise<unknown>): Promise<void> {
  const antwort = page.waitForResponse(istSpeichern);
  await tu();
  expect((await antwort).status()).toBe(200);
  await expect(page.locator(".kp-speicherstatus")).toHaveText(/^Gespeichert \d\d:\d\d$/);
}

/** Navigation in den Editor: die Standabfrage beim Montieren ist eine ausgelöste Anfrage (Falle 10). */
async function oeffneEditor(page: Page, navigiere: () => Promise<unknown>): Promise<void> {
  const stand = page.waitForResponse(istStandAbfrage);
  await navigiere();
  expect((await stand).status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
}

async function neuerPlan(page: Page, titel: string): Promise<string> {
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

async function ersteStelle(page: Page, titel: string): Promise<void> {
  await expect(page.getByText("Dieser Plan hat noch keine Stellen.")).toBeVisible();
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await expect(flyinTitel(page)).toBeFocused();
  await speichertNach(page, () => flyinTitel(page).fill(titel));
}

test("Zugangsgruppe: kein „Neu“, der Plan bleibt Betrachter ohne Griffe", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("heading", { level: 1, name: "Kommunikationspläne" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Neu", exact: true })).toHaveCount(0);
  await page.goto(url(`/p/${EINSATZ}`));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0);
  await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="el"]'));
  await expect(page.locator("[data-griff]")).toHaveCount(0);
});

test("anlegen → erste Stelle → Unter- und Seitenstelle per Griff → gespeichert → nach Neuladen noch da", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Anlegen");
  await expect(page.getByRole("heading", { level: 1, name: "e2e Anlegen" })).toBeVisible();
  await ersteStelle(page, "Einsatzleitung");

  await klickeWennRuhig(page.locator('[data-griff="unter"]'));
  await expect(karten(page)).toHaveCount(2);
  await expect(flyinTitel(page)).toBeFocused();
  await expect(flyinTitel(page)).toHaveValue("");
  await speichertNach(page, () => flyinTitel(page).fill("EA Nord"));

  await klickeWennRuhig(karten(page).filter({ hasText: "Einsatzleitung" }));
  await klickeWennRuhig(page.getByRole("button", { name: "Seitenstelle links von Einsatzleitung anlegen" }));
  await expect(karten(page)).toHaveCount(3);
  await speichertNach(page, () => flyinTitel(page).fill("KatSL"));
  await expect(page.getByRole("toolbar", { name: "Auswahl: KatSL" })).toBeVisible();
  await expect(page.locator('[data-griff="unter"], [data-griff="links"], [data-griff="rechts"]')).toHaveCount(0);

  await oeffneEditor(page, () => page.reload());
  await expect(karten(page)).toHaveCount(3);
  await expect(page.locator(".kp-betrachter")).toContainText("EA Nord");
  await expect(page.locator(".kp-speicherstatus")).toHaveText("Gespeichert");
});

test("Tastatur ohne Maus: N → Titel → Enter → N, Pfeile, Entf, Strg/Cmd+Z (Entscheidung 17)", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Tastatur");
  await ersteStelle(page, "EL");
  const flaeche = page.locator(".kp-betrachter");
  await page.keyboard.press("Enter"); // „fertig“ im Titelfeld
  await expect(flyinTitel(page)).toHaveCount(0);
  await expect(flaeche).toBeFocused();
  await page.keyboard.press("n");
  await expect(karten(page)).toHaveCount(2);
  await expect(flyinTitel(page)).toBeFocused();
  await speichertNach(page, () => flyinTitel(page).fill("EA 1"));
  await page.keyboard.press("Escape");
  await expect(flaeche).toBeFocused(); // kein flaeche.focus() von Hand: das Schließen gibt ihn zurück
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("toolbar", { name: "Auswahl: EL" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("toolbar", { name: "Auswahl: EA 1" })).toBeVisible();
  await speichertNach(page, () => page.keyboard.press("Delete"));
  await expect(karten(page)).toHaveCount(1);
  await expect(page.locator(".kp-betrachter [data-meldung]")).toContainText("„EA 1“ gelöscht.");
  await expect(flaeche).toBeFocused();
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+z"));
  await expect(karten(page)).toHaveCount(2);
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  await expect(karten(page)).toHaveCount(1);
});

test("Flyin: Zeichen suchen, Verbindung eintippen, Einheiten als Liste — alles steht im Diagramm", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Flyin");
  await ersteStelle(page, "EL");
  await klickeWennRuhig(page.locator('[data-griff="unter"]'));
  await speichertNach(page, () => flyinTitel(page).fill("EA 1"));
  const flyin = page.locator(".kp-flyin");

  // Falle 10: die Suche lädt Symbole nach (eigener POST), die Wahl speichert (noch einer) — beide einzeln prüfen
  const symbole = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes("rezept:D.1.4") && !rumpf(r).includes('"version"'));
  await flyin.getByLabel("Zeichen suchen").fill("d.1.4");
  expect((await symbole).status()).toBe(200);
  await speichertNach(page, () => klickeWennRuhig(flyin.locator('[data-zeichen="rezept:D.1.4"]')));
  await expect(karten(page).filter({ hasText: "EA 1" }).locator('use[href="#kp-rezept-D-1-4"]')).toHaveCount(1);

  await klickeWennRuhig(flyin.getByRole("button", { name: "Neue Verbindung" }));
  await expect(flyin.getByLabel("Bezeichnung der neuen Verbindung")).toBeFocused();
  await flyin.getByLabel("Bezeichnung der neuen Verbindung").fill("R_UE_2");
  await speichertNach(page, () => page.keyboard.press("Enter"));
  await expect(page.locator(".kp-betrachter [data-sechseck]")).toHaveCount(1);

  await klickeWennRuhig(flyin.getByRole("button", { name: "Liste einfügen" }));
  await expect(flyin.getByLabel("Einheiten, je Zeile eine")).toBeFocused();
  await flyin.getByLabel("Einheiten, je Zeile eine").fill("RTW RK UE 40-83-5\nKTW RK UE 40-92-1");
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+Enter"));
  await expect(page.locator(".kp-betrachter [data-einheit]")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Legende" })).toContainText("Digitalfunk TMO");
});

test("Konflikt zwischen zwei Fenstern: Hinweis, „Neu laden“ zeigt die andere Fassung", async ({ page, context }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, "e2e Konflikt");
  await ersteStelle(page, "Fassung A");
  const zweite = await context.newPage();
  await oeffneEditor(zweite, () => zweite.goto(url(`/p/${id}`)));
  await speichertNach(page, () => flyinTitel(page).fill("Fassung A2"));

  await klickeWennRuhig(karten(zweite).first());
  await klickeWennRuhig(zweite.locator('[data-griff="bearbeiten"]'));
  const antwort = zweite.waitForResponse(istSpeichern);
  await flyinTitel(zweite).fill("Fassung B");
  expect((await antwort).status()).toBe(200);
  await expect(zweite.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toBeVisible();
  await expect(zweite.locator(".kp-speicherstatus")).toHaveText("Konflikt");
  await klickeWennRuhig(zweite.getByRole("button", { name: "Neu laden" }));
  await expect(zweite.locator(".kp-betrachter")).toContainText("Fassung A2");
  await expect(zweite.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toHaveCount(0);
  await zweite.close();
});

test("Browser-Zurück: der Editor zeigt den gespeicherten Stand, die nächste Änderung speichert ohne Konflikt (Entscheidung 21)", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Zurück");
  await ersteStelle(page, "Vorher");
  await speichertNach(page, () => flyinTitel(page).fill("Nachher"));
  await page.keyboard.press("Escape");
  await klickeWennRuhig(page.getByRole("link", { name: /Alle Pläne/ }));
  await page.waitForURL(url("/"));
  await oeffneEditor(page, () => page.goBack());
  await expect(page.locator(".kp-betrachter")).toContainText("Nachher");
  await klickeWennRuhig(karten(page).first());
  await klickeWennRuhig(page.locator('[data-griff="bearbeiten"]'));
  await speichertNach(page, () => flyinTitel(page).fill("Danach"));
  await expect(page.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toHaveCount(0);
});

test("Karten gleiten — ohne Bewegung bei prefers-reduced-motion", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gleiten");
  await ersteStelle(page, "EL");
  const karte = karten(page).first();
  await expect.poll(() => karte.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0.22s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => karte.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("Tablet: neue Karten liegen nie unter dem Flyin, fünf Stellen passen eingepasst ins Bild (Entscheidung 18)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // Lagen messen ohne laufende Übergänge
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Flyinlage");
  await ersteStelle(page, "EL");
  for (const titel of ["EA 1", "EA 2", "EA 3", "EA 4"]) {
    await page.keyboard.press("Enter"); // fertig → Fläche
    if (titel !== "EA 1") await page.keyboard.press("ArrowUp"); // zurück zur EL
    await page.keyboard.press("n");
    await speichertNach(page, () => flyinTitel(page).fill(titel));
    // die neue Karte steht rechts außen am Bus — und trotzdem links vom Flyin
    const karte = (await page.locator("[data-griffe] .kp-griffe-karte").boundingBox())!;
    const flyin = (await page.locator("[data-flyin-stelle]").boundingBox())!;
    expect(karte.x + karte.width, `${titel} unter dem Flyin`).toBeLessThanOrEqual(flyin.x);
    // und die Ansicht ist dabei eingepasst geblieben (Kritik: kein Einfrieren beim ersten Anlegen)
    await expect(page.locator(".kp-betrachter")).toHaveAttribute("data-eingepasst", "true");
  }
  await page.keyboard.press("Escape");
  const rahmen = (await page.locator(".kp-betrachter").boundingBox())!;
  for (const k of await karten(page).all()) {
    const b = (await k.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(rahmen.x);
    expect(b.x + b.width).toBeLessThanOrEqual(rahmen.x + rahmen.width);
    expect(b.y + b.height).toBeLessThanOrEqual(rahmen.y + rahmen.height);
  }
});

test("Drucken aus dem Editor zeigt den gerade getippten Stand", async ({ page, context }) => {
  await context.addInitScript(() => { window.print = () => {}; });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Drucken");
  await ersteStelle(page, "EL");
  await flyinTitel(page).fill("Druckprobe"); // bewusst ohne auf das Autosave zu warten
  const gespeichert = page.waitForResponse(istSpeichern); // Drucken speichert vorher (Entscheidung 12)
  const neueSeite = context.waitForEvent("page");
  await klickeWennRuhig(page.getByRole("button", { name: "Drucken (A4 quer)" }));
  expect((await gespeichert).status()).toBe(200);
  const druck = await neueSeite;
  await druck.waitForURL(/\/druck\/a4$/);
  await warteAufGestreamteInhalte(druck);
  await expect(druck.locator("svg.kp-blatt")).toContainText("Druckprobe");
  await druck.close();
});
