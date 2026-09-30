import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page, type Response } from "@playwright/test";
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

test("Tastatur ohne Maus: Enter → N → Titel → Esc, Pfeile, Entf, Strg/Cmd+Z (Entscheidung 17)", async ({ page }) => {
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

test("Schleife N → Titel → Enter → N in Tippgeschwindigkeit: keine Eingabe geht verloren (Review Phase 2)", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Schleife");
  await ersteStelle(page, "EL");
  // Bewusst OHNE toBeFocused zwischen den Schritten: N kam früher während der Schließanimation, der
  // Fokus landete erst rund 530 ms später im Titel, und was dazwischen getippt wurde, war weg.
  for (const name of ["Nord", "Sued", "West", "Ost"]) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await page.keyboard.press("n");
    await page.keyboard.type(name, { delay: 80 });
  }
  await speichertNach(page, () => page.keyboard.press("Enter"));
  await expect(karten(page)).toHaveCount(5);
  const titel = await karten(page).evaluateAll((ks) => ks.map((k) => k.textContent ?? ""));
  for (const name of ["EL", "Nord", "Sued", "West", "Ost"]) expect(titel.some((t) => t.startsWith(name)), `${name} in ${JSON.stringify(titel)}`).toBe(true);
});

test("Hinweise in der Fläche liegen im Bild — Desktop, Tablet, Telefon, auch bei offenem Flyin (Review Phase 2)", async ({ page, context }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Hinweise");
  await ersteStelle(page, "EL");
  await page.keyboard.press("Enter");
  await page.keyboard.press("n");
  await speichertNach(page, () => flyinTitel(page).fill("EA 1"));
  await page.keyboard.press("Escape");
  const hinweis = page.locator(".kp-betrachter [data-meldung]");
  /** Per Tastatur, von EL oder EA 1 aus: ein Klick auf die schon gewählte Karte öffnete das Flyin. */
  const waehleEa1 = async () => {
    await page.locator(".kp-betrachter").focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("toolbar", { name: "Auswahl: EA 1" })).toBeVisible();
  };
  for (const [breite, hoehe] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width: breite, height: hoehe });
    await page.evaluate(() => window.scrollTo(0, 0));
    await waehleEa1();
    await speichertNach(page, () => page.keyboard.press("Delete"));
    await expect(hinweis).toContainText("„EA 1“ gelöscht.");
    await expect(hinweis, `${breite}×${hoehe}`).toBeInViewport({ ratio: 1 });
    await speichertNach(page, () => klickeWennRuhig(hinweis.getByRole("button", { name: "Rückgängig" })));
    await expect(karten(page)).toHaveCount(2);
  }
  // Speicherfehler bei offenem Flyin: der Hinweis mit „Erneut versuchen“ steht im Bild, nicht unter dem Rand
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await waehleEa1();
  await page.keyboard.press("Enter");
  await expect(flyinTitel(page)).toBeFocused();
  await context.setOffline(true);
  await flyinTitel(page).fill("EA 1 offline");
  await expect(page.locator(".kp-speicherstatus")).toHaveText("Nicht gespeichert");
  await expect(hinweis).toContainText("Nicht gespeichert");
  await expect(hinweis).toBeInViewport({ ratio: 1 });
  const wieder = page.waitForResponse(istSpeichern);
  await context.setOffline(false); // „online“ sendet sofort erneut
  expect((await wieder).status()).toBe(200);
  await expect(page.locator(".kp-speicherstatus")).toHaveText(/^Gespeichert \d\d:\d\d$/);
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

test("gezoomt: Enter holt die Karte an den freien Rand neben dem Flyin — nicht weiter (U10, Entscheidung 18)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // Lagen messen ohne laufende Übergänge
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const speicherungen: string[] = [];
  page.on("response", (r) => { if (istSpeichern(r)) speicherungen.push(r.url()); });
  // Seed-Plan nur ansehen: Auswählen, Zoomen und Flyin öffnen schreibt nichts
  await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01")));
  const lagen = await karten(page).evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-karte")!, r: e.getBoundingClientRect().right })));
  const rechts = lagen.reduce((a, c) => (c.r > a.r ? c : a)).id;
  await klickeWennRuhig(page.locator(`.kp-betrachter [data-karte="${rechts}"]`));
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await expect(page.locator(".kp-betrachter")).toHaveAttribute("data-eingepasst", "false");
  await page.keyboard.press("Enter");
  await expect(flyinTitel(page)).toBeVisible();
  const rahmen = (await page.locator(".kp-betrachter").boundingBox())!;
  const flyin = (await page.locator("[data-flyin-stelle]").boundingBox())!;
  await expect.poll(async () => {
    const k = (await page.locator(`[data-griffe="${rechts}"] .kp-griffe-karte`).boundingBox())!;
    // rechte Kante der Karte genau GRIFF_RAND.seite (84 px) vor dem rechten Innenrand der Fläche
    return Math.round(rahmen.x + rahmen.width - 1 - 84 - (k.x + k.width));
  }).toBeGreaterThanOrEqual(-2);
  const k = (await page.locator(`[data-griffe="${rechts}"] .kp-griffe-karte`).boundingBox())!;
  expect(rahmen.x + rahmen.width - 1 - 84 - (k.x + k.width), "nicht weiter nach links als nötig").toBeLessThanOrEqual(2);
  expect(k.x + k.width, "neben dem Flyin").toBeLessThanOrEqual(flyin.x);
  await page.keyboard.press("Escape");
  expect(speicherungen, "am Seed-Plan wurde gespeichert").toEqual([]);
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

/**
 * SICHTPRÜFUNG (Umsetzungsplan Phase 2, Task 16): hell und dunkel über das Cookie `iuk-theme-pref`
 * (nie `emulateMedia({ colorScheme })` — die Suite löst das Thema über `<html data-theme>` auf).
 * Mit `KOMMPLAN_FOTOS=<ordner>` fährt er alle drei Breiten und legt 48 Fotos ab; OHNE (also in der
 * CI) fährt er nur die Telefonbreite in beiden Modi, schießt keine Fotos und sichert nur zu — so
 * bleibt der auf rund 170 s ausbalancierte Eimer (scripts/e2e-gruppen.test.ts) nicht hängen.
 * Zugesichert wird: kein waagerechtes Überlaufen; die Griffe der gewählten Karte GANZ im Bild und
 * ganz in der Fläche — auch an der äußersten linken und rechten Karte; und am Seed-Plan kein
 * einziger Speicheraufruf (Review Focus 6: Ansehen und Flyins öffnen schreibt nichts).
 */
const BREITEN = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "telefon", width: 390, height: 844 }] as const;
const FOTOS = process.env.KOMMPLAN_FOTOS;

async function ganzInDerFlaeche(page: Page, el: Locator, was: string): Promise<void> {
  await expect(el, was).toBeInViewport({ ratio: 1 });
  const rahmen = (await page.locator(".kp-betrachter").boundingBox())!;
  const b = (await el.boundingBox())!;
  expect(b.x, `${was}: links`).toBeGreaterThanOrEqual(rahmen.x);
  expect(b.x + b.width, `${was}: rechts`).toBeLessThanOrEqual(rahmen.x + rahmen.width);
  expect(b.y + b.height, `${was}: unten`).toBeLessThanOrEqual(rahmen.y + rahmen.height);
}

test("Bildschirmfotos: Liste, Editor mit Auswahl, Flyins — hell und dunkel, drei Breiten", async ({ page, context }, testInfo) => {
  test.setTimeout(FOTOS ? 240_000 : 90_000);
  const ordner = FOTOS ?? testInfo.outputPath("fotos");
  if (FOTOS) mkdirSync(ordner, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" }); // Lagen ohne laufende Übergänge messen
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const leerId = await neuerPlan(page, "e2e Fotos leer");
  const foto = async (name: string) => { if (FOTOS) await page.screenshot({ path: `${ordner}/${name}.png`, animations: "disabled" }); };
  const ohneUeberlauf = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const breiten = FOTOS ? BREITEN : [BREITEN[2]];

  for (const modus of ["light", "dark"] as const) {
    await context.addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    for (const b of breiten) {
      await page.setViewportSize({ width: b.width, height: b.height });
      const n = `${b.name}-${modus}`;

      await page.goto(url("/"));
      await warteAufSpaltenaufteilung(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", modus);
      await ohneUeberlauf();
      await foto(`liste-${n}`);
      await klickeWennRuhig(page.getByRole("button", { name: "Neu", exact: true }));
      // ganz eingeschoben, sonst fotografiert der Test die Schublade mitten in der Einblendung
      await expect(page.getByRole("form", { name: "Neuer Plan" })).toBeInViewport({ ratio: 1 });
      await foto(`neu-${n}`);

      await oeffneEditor(page, () => page.goto(url(`/p/${leerId}`)));
      await foto(`leer-${n}`);
      // Hinweis nach Entf IN der Fläche (Entscheidung 19) — am eigenen Plan, der danach wieder leer ist
      await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
      await expect(flyinTitel(page)).toBeFocused();
      await page.keyboard.press("Enter"); // „fertig“ behält die leere Stelle; Esc verwürfe sie (unberührt)
      await expect(page.locator(".kp-betrachter")).toBeFocused();
      await speichertNach(page, () => page.keyboard.press("Delete"));
      await expect(page.locator(".kp-betrachter [data-meldung]")).toContainText("gelöscht");
      await foto(`hinweis-${n}`);

      // Seed-Plan nur ANSEHEN und auswählen, nie ändern (Task 15, Kopf) — jeder Speicheraufruf wäre ein Befund
      const speicherungen: string[] = [];
      const zaehle = (r: Response) => { if (istSpeichern(r)) speicherungen.push(r.url()); };
      page.on("response", zaehle);
      await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01")));
      await ohneUeberlauf();
      await foto(`editor-${n}`);
      // ea2: Unterstelle mit Geschwistern und Einheiten — zeigt alle Griffe (el wäre eine Seitenstelle)
      await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
      await expect(page.locator('[data-griffe="ea2"]')).toBeVisible();
      await ganzInDerFlaeche(page, page.getByRole("toolbar", { name: /^Auswahl:/ }), "Griffleiste ea2");
      await foto(`auswahl-${n}`);
      // die äußerste linke und rechte Karte: ihre Griffe (Leiste und seitliche „+") ganz im Bild (Kritik)
      const lagen = await page.locator(".kp-betrachter [data-karte]").evaluateAll((els) =>
        els.map((e) => ({ id: e.getAttribute("data-karte")!, x: e.getBoundingClientRect().x })));
      const aussen = [lagen.reduce((a, c) => (c.x < a.x ? c : a)).id, lagen.reduce((a, c) => (c.x > a.x ? c : a)).id];
      for (const id of aussen) {
        // Die Griffe der gewählten Karte decken am Telefon Nachbarkarten ab: erst abwählen (Esc), dann
        // eingepasst (0) — so sind auch die äußeren Karten im Bild und klickbar.
        await page.keyboard.press("Escape");
        await page.keyboard.press("0");
        await klickeWennRuhig(page.locator(`.kp-betrachter [data-karte="${id}"]`));
        for (const g of await page.locator(`[data-griffe="${id}"] [data-griff]`).all()) {
          await ganzInDerFlaeche(page, g, `Griff ${await g.getAttribute("data-griff")} an ${id}`);
        }
      }
      await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
      await klickeWennRuhig(page.locator('[data-griff="bearbeiten"]'));
      await expect(flyinTitel(page)).toBeVisible();
      await ohneUeberlauf();
      await foto(`flyin-stelle-${n}`);
      await page.keyboard.press("Escape");
      await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
      await expect(page.locator('fieldset[aria-label="Planangaben"]')).toBeVisible();
      await foto(`flyin-plan-${n}`);
      await page.keyboard.press("Escape");
      page.off("response", zaehle);
      expect(speicherungen, "am Seed-Plan wurde gespeichert").toEqual([]);
    }
  }
});
