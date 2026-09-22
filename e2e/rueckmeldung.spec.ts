import { test, expect } from "@playwright/test";

import { E2E_PORTS, devLogin, klickeWennRuhig, messeWennRuhig } from "./fixtures";

/**
 * DIE RÜCKMELDE-EINBINDUNG IM ECHTEN BROWSER (DRK-453).
 *
 * Die normale E2E-Suite fährt mit leerem `SUITE_RUECKMELDUNG_URL` (siehe die
 * Begründung in `playwright.config.ts`); dieses Profil schaltet die Einbindung
 * ein. `playwright.rueckmeldung.config.ts`, Port 3102.
 *
 * ⚠️ WAS HIER STEHT UND WARUM ES NICHT IN VITEST STEHEN KANN — das ist der
 * Maßstab für jeden Fall in dieser Datei:
 *
 * * **HTTP 200 auf einer Arbeitsfläche.** Die Fallen 6 und 7 (`CLAUDE.md`)
 *   ergeben HTTP 500 schon beim IMPORT, und `typecheck`, `build` und Vitest
 *   bleiben dabei grün. Nur ein echter Abruf zeigt das.
 * * **Die Lage des Knopfes.** jsdom rechnet keine Layoutboxen
 *   (`getBoundingClientRect()` liefert überall Nullen). „Unten rechts, im
 *   Bild" ist dort strukturell nicht prüfbar.
 * * **Die Druckregel.** jsdom wertet keine Media Queries aus. Dass
 *   `@media print` den `position: fixed`-Kasten wirklich wegnimmt, kennt nur
 *   ein Browser — und ohne die Regel steht laut Falle 18 ein leeres Blatt im
 *   Vorgabeformat des Druckers hinter jeder gedruckten Arbeitsseite.
 *
 * Was dagegen ohne Browser geprüft wird, steht in
 * `src/core/rueckmeldung/` (Konfiguration, Speicher, Knopf im DOM, und die
 * Quelltext-Wächter in `einbindung.test.ts`) — nicht hier noch einmal.
 */

const PORT = E2E_PORTS.rueckmeldung;
/** Dieselbe erfundene Adresse wie in `webServer.env` der Config. */
const FORMULAR = "https://formular.invalid/f/e2e";

const portal = (pfad = "/") => `http://portal.localtest.me:${PORT}${pfad}`;

test("Arbeitsfläche: der schwebende Knopf steht unten rechts im Bild", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });

  // ⚠️ Zuerst der Status: ein HTTP 500 aus Falle 6/7 wäre sonst nur ein
  // fehlender Knopf, und die Meldung zeigte auf die falsche Ursache.
  const antwort = await page.goto(portal());
  expect(antwort?.status(), "Arbeitsfläche antwortet").toBe(200);

  const knopf = page.getByTestId("rueckmeldung-knopf");
  await expect(knopf).toBeVisible();
  await expect(knopf).toHaveAttribute("href", FORMULAR);
  await expect(knopf).toHaveAttribute("target", "_blank");
  await expect(knopf).toHaveAttribute("rel", "noopener noreferrer");

  /*
   * ⚠️ DIE LAGE IST DIE ZUSAGE, NICHT DIE EXISTENZ. „Soll nicht stören" heißt
   * messbar: der Kasten liegt vollständig im Sichtfeld (sonst wäre der
   * Ausblenden-Knopf daneben nicht erreichbar — dieselbe Klasse wie Falle 13)
   * und in dessen unterer rechter Ecke.
   *
   * `messeWennRuhig` statt eines einfachen `boundingBox()`: die Hülle bricht
   * nach `load` noch einmal um, wenn die Sitzung nachgeladen ist (Falle 12).
   * Wer einmal misst und danach rechnet, hat genau einen Versuch.
   */
  const kasten = await messeWennRuhig(page.getByTestId("rueckmeldung-schweber"));
  const sicht = page.viewportSize();
  if (!sicht) throw new Error("kein Viewport");
  expect(kasten.x, "linke Kante im Bild").toBeGreaterThanOrEqual(0);
  expect(kasten.y, "obere Kante im Bild").toBeGreaterThanOrEqual(0);
  expect(kasten.x + kasten.width, "rechte Kante im Bild").toBeLessThanOrEqual(sicht.width);
  expect(kasten.y + kasten.height, "untere Kante im Bild").toBeLessThanOrEqual(sicht.height);
  // Untere rechte Ecke: der Kasten beginnt jenseits der Mitte, in beiden Achsen.
  expect(kasten.x, "rechte Hälfte").toBeGreaterThan(sicht.width / 2);
  expect(kasten.y, "untere Hälfte").toBeGreaterThan(sicht.height / 2);
});

test("weggeklickt bleibt weggeklickt — auch nach dem Neuladen", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());

  await klickeWennRuhig(page.getByTestId("rueckmeldung-ausblenden"));
  await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);

  /*
   * ⚠️ DER NEULADEN-TEIL IST DER EIGENTLICHE FALL. Dass der Knopf nach dem
   * Klick verschwindet, prüft schon `RueckmeldungKnopf.test.tsx` in jsdom. Was
   * dort NICHT prüfbar ist: dass der Server ihn danach nicht wieder ins HTML
   * schreibt und dass er beim Hydrieren nicht kurz aufblitzt. Beides hängt am
   * Server-Schnappschuss `ERLEDIGT` (`zustand.ts`) und damit an einer
   * Server-Hydration, die es in jsdom nicht gibt.
   */
  await page.reload();
  await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);

  // Und die beiden dauerhaften Wege stehen weiterhin: der Knopf schafft sich
  // ab, der Zugang zur Rückmeldung nicht.
  await expect(page.getByTestId("portal-feedback")).toBeVisible();
});

test("der Weg steht auch im Nutzermenü und auf der Portal-Kachel", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());

  await expect(page.getByTestId("portal-feedback")).toHaveAttribute("href", FORMULAR);

  await klickeWennRuhig(page.getByTestId("nutzermenue"));
  const eintrag = page.getByTestId("feedback-link");
  await expect(eintrag).toBeVisible();
  await expect(eintrag).toHaveAttribute("href", FORMULAR);
});

/**
 * ⚠️ OHNE DIESEN FALL STEHT HINTER JEDER GEDRUCKTEN ARBEITSSEITE EIN LEERES
 * BLATT (Falle 18). Im Druckkontext wird aus `position: fixed` ein Kasten in
 * Fenstergröße; er liegt ausserhalb jeder benannten `@page` und damit auf der
 * unbenannten ohne `size`. Gemessen ist dieses Muster am geschlossenen
 * Navigationsschub (`core/shell/shell.module.css`), und **kein anderes Tor
 * sieht es**: der Quelltext-Wächter in `einbindung.test.ts` prüft, dass die
 * Regel DASTEHT, nicht dass sie greift — dafür braucht es eine Engine, die
 * Media Queries auswertet.
 */
test("im Druck ist der Knopf weg", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());
  await expect(page.getByTestId("rueckmeldung-schweber")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("rueckmeldung-schweber")).toBeHidden();

  // Positivkontrolle: zurück auf `screen` steht er wieder da. Ohne sie wäre der
  // Fall auch dann grün, wenn der Knopf aus einem ganz anderen Grund
  // verschwunden wäre.
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByTestId("rueckmeldung-schweber")).toBeVisible();
});

test.describe("Flächen, die frei bleiben", () => {
  test("Kiosk trägt keinen Rückmeldeknopf", async ({ page }) => {
    const antwort = await page.goto(`http://kioskdemo.localtest.me:${PORT}/`);
    expect(antwort?.status()).toBe(200);
    await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);
  });

  test("die schmale, anonyme Ansicht (QR-Codes) trägt weder Knopf noch Menüeintrag", async ({
    page,
  }) => {
    const antwort = await page.goto(`http://qr.localtest.me:${PORT}/`);
    expect(antwort?.status()).toBe(200);
    // Der Knopf hängt an `FullShell`, der Menüeintrag zusätzlich an `angemeldet`
    // — anonym auf einer schmalen Ansicht fällt beides weg.
    await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);
    await expect(page.getByTestId("nutzermenue")).toHaveCount(0);
  });
});
