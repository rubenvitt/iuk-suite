import { expect, type Page } from "@playwright/test";

/** Das gerade offene Fenster eines antd-Wählers (Tag, Monat, Uhrzeit) — es hängt als Portal am `body`. */
const OFFEN = ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden) .ant-picker-panel-container";

/**
 * DAS OFFENE WAEHLERFENSTER LIEGT GANZ IN DER SICHTFLAECHE (IDA-242, IDA-264).
 *
 * Geprüft wird beides: der Überlauf des Dokuments UND die Kanten des Fensters. Ein Fenster, das
 * links hinausragt, verbreitert das Dokument nicht, es ist nur abgeschnitten.
 *
 * ⚠️ NUR EIN ECHTER BROWSER SIEHT DAS: jsdom rechnet keine Layoutboxen.
 */
export async function pruefeOffenesFenster(page: Page, panel = ".ant-picker-panel"): Promise<void> {
  await expect(page.locator(`${OFFEN} ${panel}`).first()).toBeVisible();

  const messe = () => page.evaluate((selektor) => {
    const box = document.querySelector(selektor)!.getBoundingClientRect();
    return {
      ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      links: Math.round(box.left),
      rechts: Math.round(box.right),
      sicht: document.documentElement.clientWidth,
    };
  }, OFFEN);
  // Erst nach seiner Ausrichtung steht das Fenster an seinem Platz: zwei gleiche Messungen
  // hintereinander, statt einer festen Wartezeit.
  let vorher = "";
  await expect.poll(async () => {
    const jetzt = JSON.stringify(await messe());
    const ruhig = jetzt === vorher;
    vorher = jetzt;
    return ruhig;
  }, { intervals: [100] }).toBe(true);
  const masse = await messe();

  expect(masse.ueberlauf, `Das Dokument ragt um ${masse.ueberlauf}px über die Sichtfläche`)
    .toBeLessThanOrEqual(0);
  expect(masse.links, "Das Fenster beginnt links außerhalb der Sichtfläche").toBeGreaterThanOrEqual(0);
  expect(masse.rechts, "Das Fenster endet rechts außerhalb der Sichtfläche").toBeLessThanOrEqual(masse.sicht);
}

/** Schließt das offene Wählerfenster, ohne etwas zu wählen. */
export async function schliesseFenster(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator(OFFEN)).toHaveCount(0);
}
