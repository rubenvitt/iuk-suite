import { test, expect, type Browser, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DIE SEITENLEISTE STEHT SCHON IM SERVER-HTML NEBEN DEM INHALT (DRK-363).
 *
 * `Layout` legt seine Kinder nur mit der Klasse `ant-layout-has-sider`
 * nebeneinander. Ohne `hasSider` kam sie erst mit der Hydration dazu — `Sider`
 * meldet sich per `useEffect` bei `Layout` an, und der synchrone Rueckfall in
 * `useHasSider` (Typvergleich der Kinder) greift nicht, weil `SuiteRahmen` eine
 * Server Component ist und `<Sider>` die RSC-Grenze als Client-Referenz
 * ueberquert. Bis dahin stand die Leiste UEBER dem Inhalt, und der Inhalt nahm
 * die volle Fensterbreite. Gemessen vor dem Umbau, 834px, ohne JavaScript:
 *
 *     vorher   class="ant-layout iuk"                     Leiste x 0–240, y 69   Inhalt x 0,   y 309, 834px
 *     nachher  class="ant-layout ant-layout-has-sider …"  Leiste x 0–240, y 69   Inhalt x 240, y 69,  594px
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
 * Layoutboxen, und ohne RSC-Grenze greift dort der Rueckfall ueber die Kinder,
 * die Klasse stuende also auch ohne `hasSider` da.
 */
const BREITE = { width: 834, height: 1112 } as const;

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

/** Beide Kaesten und die Klasse in EINEM Lesevorgang. */
function raster(seite: Page) {
  return seite.evaluate(() => {
    const inhalt = document.querySelector(".ant-layout-content")!.getBoundingClientRect();
    const leiste = document.querySelector(".ant-layout-sider")?.getBoundingClientRect();
    return {
      klasse: document.querySelector(".ant-layout-content")!.parentElement!.className,
      inhaltLinks: Math.round(inhalt.left),
      inhaltOben: Math.round(inhalt.top),
      inhaltBreite: Math.round(inhalt.width),
      leisteRechts: leiste ? Math.round(leiste.right) : null,
      leisteOben: leiste ? Math.round(leiste.top) : null,
    };
  });
}

test("mit Navigation: Leiste und Inhalt stehen schon ohne Hydration nebeneinander", async ({
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
    expect(r.klasse, JSON.stringify(r)).toContain("ant-layout-has-sider");
    // Die Invariante des fertigen Rasters: der Inhalt beginnt, wo die Leiste endet,
    // und beide beginnen auf derselben Hoehe.
    expect(r.leisteRechts, JSON.stringify(r)).toBe(240);
    expect(r.inhaltLinks, JSON.stringify(r)).toBe(r.leisteRechts);
    expect(r.inhaltOben, JSON.stringify(r)).toBe(r.leisteOben);
    expect(r.inhaltBreite, JSON.stringify(r)).toBe(BREITE.width - 240);
  } finally {
    await kontext.close();
  }
});

test("ohne Navigation: keine Leiste, und der Inhalt behaelt die volle Breite", async ({
  page,
  browser,
}) => {
  /*
   * DIE GEGENPROBE ZU `hasSider={nav.length > 0}`. Ein fest gesetztes `true`
   * legte auch ein Modul ohne Navigation (`alpha`) auf `flex-direction: row` —
   * mit einem einzigen Kind sieht das gleich aus, ist aber eine Behauptung, die
   * nicht stimmt, und der naechste zweite Knoten im Rahmen stuende daneben
   * statt darunter.
   */
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users" });
  const { kontext, seite } = await ohneJavaScript(browser, page, "http://alpha.localtest.me:3100/");
  try {
    const r = await raster(seite);
    expect(r.leisteRechts, JSON.stringify(r)).toBeNull();
    expect(r.klasse, JSON.stringify(r)).not.toContain("ant-layout-has-sider");
    expect(r.inhaltLinks, JSON.stringify(r)).toBe(0);
    expect(r.inhaltBreite, JSON.stringify(r)).toBe(BREITE.width);
  } finally {
    await kontext.close();
  }
});
