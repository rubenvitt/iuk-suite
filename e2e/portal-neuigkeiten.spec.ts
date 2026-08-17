import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE } from "./helpers/lagerbuch";

/**
 * WARUM DIESE SEITE EINEN ECHTEN ABRUF BRAUCHT und nicht mit den Vitest-Fällen
 * daneben abgegolten ist: `neuigkeiten/page.tsx` ist eine Server Component, die
 * eine Client-Insel mit Daten füttert. Genau an dieser Naht liegen vier Fallen
 * aus `docs/design/README.md`, die KEIN Tor im Repo sieht — Compound-Zugriff auf
 * antd (1), ein Wert aus einem `"use client"`-Modul (6), `@ant-design/icons` in
 * RSC (7) und eine Funktion über die RSC-Grenze (9). Alle vier sind HTTP 500 beim
 * Abruf, während `typecheck`, `lint`, `build` und jsdom grün bleiben. Ein
 * Statuscode aus einem echten Browser ist die einzige Zusicherung, die das deckt.
 *
 * Der zweite Prüfgegenstand ist die Rechteprüfung, und die ist hier NICHT
 * doppelt zu `auswahl.test.ts`: dort steht sie als reine Funktion, hier steht
 * sie auf dem Weg, den eine Person geht — samt Sitzung, Middleware und Gruppen
 * aus dem echten JWT.
 */

const OHNE_GRUPPE = "";

test("Neuigkeiten zeigt nur die Notizen zu freigeschalteten Apps", async ({ page }) => {
  await devLogin(page, {
    host: "portal.localtest.me",
    groups: OHNE_GRUPPE,
    callbackPath: "/neuigkeiten",
  });

  // Die Seite steht überhaupt — der Riegel gegen die vier RSC-Fallen oben.
  await expect(page.getByTestId("neuigkeiten")).toBeVisible();
  await expect(page.locator('[data-testid="notiz"][data-modul="portal"]').first()).toBeVisible();

  // Ohne Gruppe keine Notiz zu einer App, die diese Person nicht öffnen kann.
  // `lagerbuch` ist der schärfere Fall von zweien: das Modul trägt
  // `requiresAuth: false` (anonyme Helferpfade), `canAccess` allein liesse es
  // also durch — gatet wird über `switcherGroupSources`, genau wie die Kachel.
  await expect(page.locator('[data-testid="notiz"][data-modul="lagerbuch"]')).toHaveCount(0);
});

test("mit der Gruppe steht die Notiz der App da — samt Filter", async ({ page }) => {
  await devLogin(page, {
    host: "portal.localtest.me",
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/neuigkeiten",
  });

  await expect(page.locator('[data-testid="notiz"][data-modul="lagerbuch"]').first()).toBeVisible();
  // Zwei Apps in der Liste, also eine Filterzeile: bei einer einzigen wäre sie
  // eine Beschriftung und bleibt weg (`NeuigkeitenListe.test.tsx`).
  await expect(page.getByTestId("neuigkeiten-filter")).toBeVisible();

  await page.getByTestId("neuigkeiten-filter").getByText("Lagerbuch").click();
  await expect(page.locator('[data-testid="notiz"][data-modul="portal"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="notiz"][data-modul="lagerbuch"]').first()).toBeVisible();
});

test("die Modulnavigation des Portals führt ohne Adresszeile hin", async ({ page }) => {
  /*
   * Bis zu dieser Seite bekam eine Person OHNE Verwaltungsrecht im Portal gar
   * keine Modulnavigation (`layout.tsx`, alte Fassung) — der Weg hierher wäre
   * sonst die Adresszeile, auf dem Telefon das schlechteste Eingabegerät, das
   * es gibt. Dieser Fall ist der Beweis, dass es den Weg gibt.
   *
   * `klickeWennRuhig` und nicht `click()`: die Portal-Startseite ist genau die
   * Hülle, in der Falle 12 gemessen wurde — `SessionProvider` holt die Sitzung
   * nach, die Navigation wechselt von der Platzhalter- auf die volle Spalte,
   * und ein Klick zwischen `mousedown` und `mouseup` landet auf dem Vorfahren
   * statt auf dem Anker. Der Test wartete dann auf eine Navigation, die nie
   * angestoßen wurde.
   */
  await devLogin(page, { host: "portal.localtest.me", groups: OHNE_GRUPPE });

  await klickeWennRuhig(page.getByTestId("modulleiste").getByRole("link", { name: "Neuigkeiten" }));
  await page.waitForURL(/\/neuigkeiten$/);
  await expect(page.getByTestId("neuigkeiten")).toBeVisible();
});
