import { expect, test } from "@playwright/test";
import {
  LAGERBUCH_ORGANISATION_E2E,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DER ORGANISATIONSNAME KOMMT AUS `LAGERBUCH_ORGANISATION` — und dass er an
 * BEIDEN Flaechen tatsaechlich ankommt, sieht nur ein echter Abruf: am Gate
 * ueberquert er die RSC-Grenze als Prop (`page.tsx` → `Gate.tsx`, das
 * `"use client"` ist), im PWA-Manifest kommt er aus einem host-geriegelten
 * Route Handler. Vitest prueft beide Wege einzeln; hier laufen sie zusammen.
 *
 * ⚠️ WAS DIESE DATEI NICHT KANN, UND ZWAR GEMESSEN: die Client-Falle fangen.
 * Mit einem direkten `process.env.LAGERBUCH_ORGANISATION` im Gate waren BEIDE
 * Tests unten GRUEN — unter `next dev` kommt der erste Anstrich per SSR, wo die
 * Prozessumgebung da ist, und es kippt auch nach der Hydration nichts. Erst der
 * Produktionsbuild zeigt es: dort traegt das SSR-HTML den Laufzeitwert und der
 * Textknoten kippt NACH DER HYDRATION auf die Vorgabe. Das Tor dagegen ist
 * deshalb der Quelltext-Scan in `_lib/marke.test.ts`, nicht dieser Lauf.
 *
 * Dasselbe gilt fuer das Manifest: ein `const MANIFEST = …` auf Modulebene
 * (statt des Baus je Anfrage) laese die Variable unter `next dev` beim ersten
 * Laden des Moduls — mit gesetzter Variable also richtig. Was hier belegt wird,
 * ist die Verdrahtung, nicht ihre Unverlierbarkeit.
 *
 * ⚠️ DER ERWARTETE WERT IST NICHT DIE VORGABE. `LAGERBUCH_ORGANISATION_E2E`
 * weicht absichtlich ab (`helpers/lagerbuch.ts`); mit der Vorgabe als Erwartung
 * belegte dieser Lauf gar nichts — die Vorgabe steht auch ohne jede Variable da.
 */
test.describe("Lagerbuch — LAGERBUCH_ORGANISATION", () => {
  test("das Gate zeigt den Namen aus der Umgebung, nicht die Vorgabe", async ({ page }) => {
    await page.goto(lagerbuchUrl("/"));

    // Die Unterzeile des Gates: „<Organisation> · <Unterzeile>".
    await expect(page.getByText(`${LAGERBUCH_ORGANISATION_E2E} · Bestand, Fahrzeuge, Geräte`))
      .toBeVisible();
    await expect(page.getByText("DRK Bereitschaft Musterstadt")).toHaveCount(0);
  });

  test("das PWA-Manifest traegt ihn im `name`", async ({ page }) => {
    /**
     * ⚠️ `request.get` UND NICHT `page.goto`: die Antwort traegt
     * `application/manifest+json`, und ein Abruf per Navigation faellt in
     * Chromium auf einen Download zurueck. Der Route Handler ist ausserdem
     * host-geriegelt — die absolute URL aus dem Helfer ist Pflicht.
     */
    const antwort = await page.request.get(lagerbuchUrl("/manifest.webmanifest"));
    expect(antwort.status()).toBe(200);
    expect(antwort.headers()["content-type"]).toContain("application/manifest+json");

    const manifest = (await antwort.json()) as { name: string; short_name: string };
    expect(manifest.name).toBe(`Lagerbuch · ${LAGERBUCH_ORGANISATION_E2E}`);
    // Marke und Unterzeile bleiben Konstanten — nur EINE Zeile ist ein Regler.
    expect(manifest.short_name).toBe("Lagerbuch");
  });
});
