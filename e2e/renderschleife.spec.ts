import { test, expect } from "@playwright/test";
import { devLogin, warteAufGestreamteInhalte } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * KEINE RENDER-SCHLEIFE NACH DEM LADEN (IDA-406).
 *
 * Das Fahrzeugblatt geriet im gebauten Stand bei etwa jedem vierten Aufruf im
 * selben Tab in eine Schleife leerer Commits (über 2000 pro Sekunde, kein
 * einziger DOM-Wechsel). Zu sehen war davon nichts — bis zur ersten Server
 * Action: deren Antwort kam nie auf den Schirm, weil jede Transition
 * verhungerte (`lagerbuch-ruecklauf.spec.ts` zeigte dann den alten Bestand).
 * Ursache war `TabellenVollhoehe`, die nach jedem Render ein Update mit
 * gleichen Werten einreihte; Begründung dort an `messen`.
 *
 * Gezählt wird über den Haken, den React für die DevTools anbietet: React
 * meldet ihm jeden Commit. Ein ruhiges Laden kommt mit gut einem Dutzend aus;
 * die Grenze liegt weit darüber und weit unter der Schleife.
 *
 * ⚠️ IM SELBEN TAB, NACH EINER ANDEREN SEITE. Eine frische Seite je Aufruf
 * traf die Schleife in 30 Versuchen kein einziges Mal, derselbe Tab nach
 * `/verwaltung` in jedem zweiten bis vierten. Gegen den alten Stand war dieser
 * Test in drei von drei Läufen rot — ein Netz mit kleinen Maschen, kein Beweis.
 */
const BLATT = "/verwaltung/fahrzeuge/e2e-ruecklauf-fahrzeug";
const AUFRUFE = 8;
const HOECHSTENS = 100;

test("das Fahrzeugblatt kommt nach dem Laden zur Ruhe", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
    w.__commits = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      isDisabled: false,
      inject: () => 1,
      onCommitFiberRoot: () => { w.__commits += 1; },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
  });

  const commits: number[] = [];
  for (let i = 0; i < AUFRUFE; i++) {
    await page.goto(lagerbuchUrl("/verwaltung"));
    await page.waitForLoadState("load");
    await page.goto(lagerbuchUrl(BLATT));
    await warteAufGestreamteInhalte(page);
    await page.waitForTimeout(1_000);
    commits.push(await page.evaluate(() => (window as unknown as { __commits: number }).__commits));
  }
  expect(Math.max(...commits), `Commits je Aufruf: ${commits.join(", ")}`).toBeLessThan(HOECHSTENS);
});
