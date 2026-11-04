import { test, expect, type Browser, type Page } from "@playwright/test";
import { devLogin, E2E_PORT } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DAS MENUE STEHT SCHON IM SERVER-HTML NEBEN DEM INHALT (DRK-363, seit
 * IDA-347 Etappe 2 gegen `MenueRahmen`).
 *
 * Bis zum Menue legte antds `Layout` Leiste und Inhalt nur mit der Klasse
 * `ant-layout-has-sider` nebeneinander, und ohne `hasSider` kam die erst mit
 * der Hydration (Falle 12). Gemessen damals, 834px, ohne JavaScript:
 *
 *     vorher   class="ant-layout iuk"                     Leiste x 0–240, y 69   Inhalt x 0,   y 309, 834px
 *     nachher  class="ant-layout ant-layout-has-sider …"  Leiste x 0–240, y 69   Inhalt x 240, y 69,  594px
 *
 * Seither sind die Spalten ein eigenes CSS-Raster (`menue.module.css`,
 * `.rahmen`: 264px und der Rest), ohne antds `Sider` und ohne Kopfzeile
 * darueber. Die Zusage bleibt dieselbe: das Raster steht im Server-HTML, nicht
 * erst nach der Hydration.
 *
 * ⚠️ WARUM OHNE JAVASCRIPT. Mit JavaScript ist der Zwischenzustand ein Fenster
 * von einigen hundert Millisekunden, und ob eine Messung hineinfaellt, haengt an
 * der Maschine — lokal meist nicht, in der CI mit kaltem `.next` schon. Ohne
 * JavaScript gibt es keine Hydration, die Seite BLEIBT im Zustand des
 * Server-HTML. Genau der ist die Zusage; die Probe ist damit nicht
 * rennabhaengig.
 *
 * ⚠️ KEIN TOR SIEHT DAS SONST: `typecheck` und `build` kennen keine Klassen im
 * Markup, und Vitest kann es strukturell nicht sehen — jsdom rechnet keine
 * Layoutboxen.
 */
const BREITE = { width: 834, height: 1112 } as const;
/** `.rahmen` ab 768px: `grid-template-columns: 264px minmax(0, 1fr)`. */
const LEISTE = 264;

async function ohneJavaScript(browser: Browser, angemeldet: Page, url: string) {
  const kontext = await browser.newContext({
    javaScriptEnabled: false,
    viewport: BREITE,
    storageState: await angemeldet.context().storageState(),
  });
  const seite = await kontext.newPage();
  const antwort = await seite.goto(url);
  expect(antwort!.status()).toBe(200);
  return { kontext, seite };
}

/** Beide Kaesten in EINEM Lesevorgang. */
function raster(seite: Page) {
  return seite.evaluate(() => {
    const inhalt = document.querySelector(".ant-layout-content")!.getBoundingClientRect();
    const leiste = document.querySelector('[data-rahmen="menue"]')?.getBoundingClientRect();
    return {
      antdSider: document.querySelectorAll(".ant-layout-sider").length,
      seitenliste: document.querySelectorAll('[data-testid="modulleiste"]').length,
      inhaltLinks: Math.round(inhalt.left),
      inhaltOben: Math.round(inhalt.top),
      inhaltBreite: Math.round(inhalt.width),
      leisteLinks: leiste ? Math.round(leiste.left) : null,
      leisteRechts: leiste ? Math.round(leiste.right) : null,
      leisteOben: leiste ? Math.round(leiste.top) : null,
      leisteHoehe: leiste ? Math.round(leiste.height) : null,
    };
  });
}

test("mit Navigation: Menue und Inhalt stehen schon ohne Hydration nebeneinander", async ({
  page,
  browser,
}) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });
  const { kontext, seite } = await ohneJavaScript(
    browser,
    page,
    lagerbuchUrl("/verwaltung/fahrzeuge/e2e-fahrzeug"),
  );
  try {
    const r = await raster(seite);
    expect(r.antdSider, JSON.stringify(r)).toBe(0);
    expect(r.seitenliste, JSON.stringify(r)).toBe(1);
    // Die Invariante des fertigen Rasters: der Inhalt beginnt, wo das Menue endet,
    // beide beginnen oben am Fenster, und das Menue fuellt die Hoehe.
    expect(r.leisteLinks, JSON.stringify(r)).toBe(0);
    expect(r.leisteRechts, JSON.stringify(r)).toBe(LEISTE);
    expect(r.inhaltLinks, JSON.stringify(r)).toBe(r.leisteRechts);
    expect(r.inhaltOben, JSON.stringify(r)).toBe(0);
    expect(r.leisteOben, JSON.stringify(r)).toBe(0);
    expect(r.leisteHoehe, JSON.stringify(r)).toBe(BREITE.height);
    expect(r.inhaltBreite, JSON.stringify(r)).toBe(BREITE.width - LEISTE);
  } finally {
    await kontext.close();
  }
});

test("ohne Navigation: das Menue steht trotzdem, nur ohne Seitenliste", async ({
  page,
  browser,
}) => {
  /*
   * Bis zum Menue hiess die Gegenprobe „ohne Navigation keine Leiste": ein
   * Modul ohne `nav` (`alpha`) bekam die volle Breite. Seit IDA-347 (Etappe 2)
   * wohnen App-Wechsel, Konto und Theme IM Menue — es haengt also immer da
   * (`MenueRahmen`, „DAS MENUE HAENGT IMMER DA"), nur die Seitenliste fehlt.
   * Die Zusage dreht damit: dieselbe Spalte wie mit Navigation, und keine
   * leere `modulleiste`.
   */
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users" });
  const { kontext, seite } = await ohneJavaScript(browser, page, `http://alpha.localtest.me:${E2E_PORT}/`);
  try {
    const r = await raster(seite);
    expect(r.seitenliste, JSON.stringify(r)).toBe(0);
    expect(r.leisteRechts, JSON.stringify(r)).toBe(LEISTE);
    expect(r.inhaltLinks, JSON.stringify(r)).toBe(LEISTE);
    expect(r.inhaltBreite, JSON.stringify(r)).toBe(BREITE.width - LEISTE);
  } finally {
    await kontext.close();
  }
});
