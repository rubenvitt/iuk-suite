import { expect, test, type Locator, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";
import {
  E2E_FAHRZEUG_ID,
  E2E_FAHRZEUG_NAME,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DER VERWALTUNGSCHECK — Fahrzeugblatt → „Zählen" → Abschluss → Check.
 *
 * WAS KEIN ANDERES TOR SIEHT:
 *
 *  1. **Die RSC-Grenze der Zählseite.** `zaehlen/page.tsx` ist eine Server
 *     Component und reicht `VerwaltungscheckDaten` an die Insel; die Fallen 1,
 *     6, 7 und 9 antworten dort mit HTTP 500, und weder `build` noch Vitest
 *     sehen das.
 *  2. **Der Rundlauf am Stück.** Zählen, Ausgleich (mit dem Server-Action-Abruf
 *     `getDetail` im Auffüll-Dialog), Rückfrage, Buchung, Ergebnis — und dass
 *     der gebuchte Check danach als „Verwaltungscheck" mit Chip „Verwaltung"
 *     dasteht. Jede Seite für sich antwortete auch dann mit 200, wenn die Kette
 *     dazwischen risse.
 *  3. **Die Media Query** zwischen Karten und Tabelle — jsdom wertet keine aus.
 *
 * ⚠️ WAS DIESE DATEI AN DATEN HINTERLÄSST — ein Worker, eine SQLite-Datei, jede
 * Spec danach erbt es: je Lauf ein Check an `E2E_FAHRZEUG_ID`, die Korrektur
 * von `e2e-check-artikel` an der Einheit auf 2 und eine Umlagerung von 1 Stück
 * aus dem Handlager (Seed: 20). Danach liegen dort 3 = Soll. Andere Specs, die
 * diesen Artikel oder diese Einheit lesen, vergleichen differenziell
 * (`lagerbuch-helfer.spec.ts`, `letzterCheck`: eine NEUE Zeile, nicht die
 * jüngste). Der Lauf selbst hängt nicht am Buchstand der Einheit: gezählt wird
 * gegen das Soll, und eine Mehrmenge gegenüber dem Lagerbuch sperrt nichts.
 *
 * ⚠️ JEDE AUSLÖSENDE AKTION PRÜFT IHRE ANTWORT (Falle 10, zweite Testregel).
 */

/** Der Artikel der einzigen Soll-Position von `E2E_FAHRZEUG_ID` (`checkFixtures` im Seed). */
const ARTIKEL_ID = "e2e-check-artikel";
const ARTIKEL_NAME = "E2E Check Kompressen steril 10x10cm";

const KARTEN = '[data-rolle="schmalkarten"]';
const BREIT = '[data-rolle="breitansicht"]';

/**
 * ⚠️ NICHT `await`-en, BEVOR der auslösende Klick passiert ist: das Lauschen
 * beginnt mit dem Aufruf. Gefiltert wird über den `next-action`-Kopf — eine
 * Server Action ist ein POST auf die Seitenadresse.
 */
function serverActionAntwort(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 60_000 },
  );
}

/** Der Knopf im Seitenkopf — die Seitenleiste trägt gleichnamige Einträge. */
const kopfKnopf = (page: Page, name: string): Locator =>
  page.getByTestId("seitenkopf-aktionen").getByRole("link", { name, exact: true });

async function zaehlseite(page: Page): Promise<void> {
  const antwort = await page.goto(lagerbuchUrl(`/verwaltung/fahrzeuge/${E2E_FAHRZEUG_ID}/zaehlen`));
  expect(antwort?.status(), "Zählseite: HTTP 500 = Fehler an der RSC-Grenze").toBe(200);
  await expect(page.getByRole("heading", { name: "Zählen und einrichten" })).toBeVisible();
  await warteAufGestreamteInhalte(page);
  // Die Umschaltung Karten/Tabelle ist CSS; bedienbar ist die Insel erst nach der Hydration.
  await page.waitForLoadState("networkidle");
}

test.describe("Verwaltungscheck — eine Einheit in der Verwaltung zählen", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("Zählen, auffüllen, abschließen — der Check steht als Verwaltungscheck in der Liste", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // ── 1) Vom Fahrzeugblatt über „Zählen" ────────────────────────────────
    const blatt = await page.goto(lagerbuchUrl(`/verwaltung/fahrzeuge/${E2E_FAHRZEUG_ID}`));
    expect(blatt?.status(), "Fahrzeugblatt: HTTP").toBe(200);
    await klickeWennRuhig(kopfKnopf(page, "Zählen"));
    await page.waitForURL((u) => u.pathname.endsWith(`/verwaltung/fahrzeuge/${E2E_FAHRZEUG_ID}/zaehlen`));
    await expect(page.getByRole("heading", { name: "Zählen und einrichten" })).toBeVisible();
    await expect(page.getByText(E2E_FAHRZEUG_NAME).first()).toBeVisible();
    await warteAufGestreamteInhalte(page);
    await page.waitForLoadState("networkidle");

    const leiste = page.locator('[data-rolle="abschlussleiste"]');
    const fortschritt = leiste.locator('[data-rolle="fortschritt"]');
    const abschluss = leiste.locator('button[data-rolle="abschluss"]');
    // Ungezählt ist nichts erfasst — der Grund steht sichtbar über dem Knopf.
    await expect(abschluss).toBeDisabled();
    await expect(leiste.locator('[data-rolle="sperrgruende"]')).toContainText("Es ist noch nichts erfasst.");

    // ── 2) Alle Positionen mit „Stimmt" zählen ────────────────────────────
    const tabelle = page.locator(BREIT);
    await expect(tabelle).toBeVisible();
    const stimmt = tabelle.locator('button[data-rolle="stimmt"]');
    const anzahl = await stimmt.count();
    expect(anzahl, "die Einheit hat Soll-Positionen").toBeGreaterThan(0);
    for (let i = 0; i < anzahl; i += 1) {
      await stimmt.nth(i).click();
      await expect(stimmt.nth(i)).toHaveAttribute("aria-pressed", "true");
    }
    await expect(fortschritt).toContainText(`${anzahl} von ${anzahl} Positionen gezählt · 0 Abweichungen`);

    // ── 3) Eine Position eins niedriger ───────────────────────────────────
    const ist = tabelle.getByRole("spinbutton", { name: new RegExp(`^Ist ${ARTIKEL_NAME}, `) });
    await expect(ist).toHaveValue("3");
    await tabelle.getByRole("button", { name: new RegExp(`^${ARTIKEL_NAME}, .* verringern$`) }).click();
    await expect(ist).toHaveValue("2");
    await expect(fortschritt).toContainText("1 Abweichung");

    // ── 4) Ausgleichen → Auffüllen aus dem Handlager ──────────────────────
    await page.getByRole("tab", { name: /^Ausgleichen 1$/ }).click();
    const zeile = page.locator(`[data-rolle="ausgleich-zeile"][data-artikel="${ARTIKEL_ID}"]`);
    await expect(zeile).toContainText("1 fehlen");

    // Der Dialog lädt die Verteilung des Artikels per Server Action (`getDetail`).
    const detailAntwort = serverActionAntwort(page);
    await zeile.locator('button[data-rolle="auffuellen"]').click();
    expect((await detailAntwort).ok(), "Auffüll-Dialog: getDetail").toBe(true);

    const dialog = page.getByRole("dialog", { name: `Auffüllen: ${ARTIKEL_NAME}` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "Menge" })).toHaveValue("1");
    // Die Vorgabe der Herkunft ist das Handlager, zuerst ablaufende (Spec 6.4).
    await expect(dialog.locator(".ant-select").filter({ hasText: "Aus dem Handlager (zuerst ablaufende)" }))
      .toBeVisible();
    await dialog.getByRole("button", { name: "Übernehmen" }).click();
    await expect(dialog).toBeHidden();
    await expect(zeile.locator('[data-rolle="absicht-auffuellen"]')).toContainText("Auffüllen 1 aus dem Handlager");
    await expect(zeile.locator('[data-rolle="nach-ausgleich"]')).toContainText("Nach dem Ausgleich: 3");

    // ── 5) Abschließen — erst fragen, dann buchen ─────────────────────────
    await expect(leiste.locator('[data-rolle="sperrgruende"]')).toHaveCount(0);
    await expect(abschluss).toBeEnabled();
    await abschluss.click();
    const frage = page.getByRole("tooltip").filter({ hasText: "Abschließen und buchen?" });
    await expect(frage).toBeVisible();
    const abschlussAntwort = serverActionAntwort(page);
    await frage.getByRole("button", { name: "Buchen" }).click();
    expect((await abschlussAntwort).ok(), "Abschluss: Server Action").toBe(true);

    // ── 6) Ergebnis → „Zum Check" ─────────────────────────────────────────
    const ergebnis = page.locator('[data-rolle="ergebnis"]');
    await expect(ergebnis.getByText("Check gespeichert")).toBeVisible();
    await expect(ergebnis.locator('[data-rolle="kennzahlen"]')).toContainText("1 aufgefüllt");
    await expect(ergebnis.getByRole("link", { name: "Zurück zur Einheit" })).toBeVisible();

    await klickeWennRuhig(ergebnis.getByRole("link", { name: "Zum Check" }));
    await page.waitForURL(/\/verwaltung\/checks\/[^/]+$/);
    const checkId = decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
    await warteAufGestreamteInhalte(page);
    await expect(page.getByTestId("seitenkopf-beschreibung")).toContainText("Verwaltungscheck");

    // ── 7) Die Check-Liste nennt die Art ──────────────────────────────────
    const liste = await page.goto(lagerbuchUrl(`/verwaltung/checks?fz=${E2E_FAHRZEUG_ID}`));
    expect(liste?.status(), "Check-Liste: HTTP").toBe(200);
    await warteAufGestreamteInhalte(page);
    const listenZeile = page.locator(`[data-row-key="${checkId}"]`);
    await expect(listenZeile).toBeVisible();
    await expect(listenZeile).toContainText("Verwaltung");
    // Spec 6.12.4: Auffüllen AUS DEM HANDLAGER zählt in `nachfuellGebucht` — der Chip dafür bleibt.
    await expect(listenZeile).toContainText("1 aus Handlager nachgefüllt");
  });

  test("bei 390px zählt man in Karten, und der Fach-Filter steht da", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await zaehlseite(page);

    const karten = page.locator(KARTEN);
    await expect(karten).toBeVisible();
    await expect(page.locator(BREIT)).toBeHidden();
    // Ohne Spaltenköpfe gäbe es sonst keinen Fach-Filter (Schmalfilter ohne Kategorien).
    await expect(page.locator('[data-rolle="schmalfilter"]')).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Fach filtern" })).toBeVisible();

    // Die Karte zählt in denselben Stand wie die Tabelle.
    const karte = karten.locator("article").filter({ hasText: ARTIKEL_NAME });
    await expect(karte).toBeVisible();
    await karte.getByRole("button", { name: new RegExp(`^${ARTIKEL_NAME}, .* stimmt$`) }).click();
    await expect(page.locator('[data-rolle="fortschritt"]')).toContainText(/^1 von \d+ Positionen gezählt/);
  });
});
