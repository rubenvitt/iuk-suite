import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DER EXCEL-EXPORT (Spec §9.4, §9.6, §12.5).
 *
 * Diese Spec wird als EINZIGE der 13 Alt-Specs uebernommen statt umgeschrieben:
 * Rolle und Name des Knopfs sind antd-neutral
 * (lagerbuch/e2e/bestand-export.spec.ts:16-24).
 *
 * WARUM SIE UEBERHAUPT NOETIG IST: die Bibliothek wird beim Klick nachgeladen
 * (`await import("write-excel-file/browser")` in ArtikelTable.tsx, T165). Ein
 * Unit-Test kann das nicht sehen — er kann nur pruefen, mit WELCHEN Argumenten
 * sie gerufen wuerde (_lib/bestandExport.test.ts, T156; ArtikelTable.test.tsx,
 * T165). Nur ein echter Browser zeigt, dass tatsaechlich eine `.xlsx` ankommt.
 *
 * DIE BENANNTE LUECKE, die 1:1 mitwandert: geprueft wird die FORM des
 * Dateinamens, nie sein WERT. Der Wert entsteht aus BROWSERzeit (§9.4) und ist
 * damit von der Zone des Arbeitsplatzes abhaengig; `_lib/bestandExport.test.ts`
 * nagelt ihn gegen ein festes Datum fest. Mehr geht nicht, und das steht hier,
 * damit niemand die Luecke fuer ein Versehen haelt.
 *
 * Host, Gruppe, Port und URLs kommen ausschliesslich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — kein Literal wie
 * "http://lagerbuch.localtest.me:3100" oder `["lagerbuch_nutzer"]`.
 */
test.describe("Excel-Export des Bestands", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("liefert eine echte .xlsx mit datiertem Namen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));

    const knopf = page.getByRole("button", { name: /Excel-Liste/ });
    await expect(knopf).toBeEnabled(); // Teil 5s Vorgriff ist eingeloest (T165)

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      knopf.click(),
    ]);

    // 1:1 aus lagerbuch/e2e/bestand-export.spec.ts:18.
    expect(download.suggestedFilename()).toMatch(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/);

    // 1:1 aus :20-24 — ZIP-Magic "PK", also eine echte xlsx und kein
    // umbenanntes CSV. Ohne diese zwei Bytes belegte der Test nur, DASS eine
    // Datei ankommt, nicht dass es eine xlsx ist.
    const pfad = await download.path();
    const kopf = readFileSync(pfad!).subarray(0, 2);
    expect(kopf.toString("latin1")).toBe("PK");
  });

  /**
   * §6.15, Auflage 9 / §12.1 Punkt 2, an der Oberflaeche: der Export liest
   * DIESELBE abgeleitete Liste wie die Tabelle. Die reine Fassung steht in
   * `_lib/bestandExport.test.ts`, die Insel-Fassung in `ArtikelTable.test.tsx`
   * — hier wird nur belegt, dass die Kette im echten Browser haelt.
   *
   * Suchbegriff "Pflaster" statt des Brief-Vorschlags "Mullbinde": im heutigen
   * Seed (e2e/seed-lagerbuch.ts:207, "E2E Geraete Pflaster") gibt es keinen
   * Artikel "Mullbinde" — der Zustand wird hier aus dem tatsaechlichen Seed
   * hergestellt, nicht aus der Alt-Spec kopiert (Global Constraint: keine
   * geborgte Vorbedingung).
   *
   * ⚠️ Review-Fix: `expect.poll(rowCount).toBeLessThan(vorher)` allein besteht
   * AUCH im trefferlosen Fall (Testfall 3) — sinkende Zeilenzahl unterscheidet
   * nicht "weniger" von "keine". Die tragende Zusicherung ist deshalb die
   * exakte Exportmenge ueber `data-export-zeilen` (ArtikelTable.tsx:249,
   * `gefiltert.map((z) => z.id).join(",")`), nicht die Zeilenzahl.
   */
  test("exportiert nach einer Suche weniger Zeilen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));

    const vorher = await page.getByRole("row").count();
    expect(vorher, "der Seed muss mehrere Artikel liefern").toBeGreaterThan(2);
    await page.getByRole("searchbox").fill("Pflaster");
    await expect.poll(() => page.getByRole("row").count()).toBeLessThan(vorher);

    const knopf = page.getByRole("button", { name: /Excel-Liste/ });
    // Die tragende Zusicherung: "Pflaster" trifft ueber Name/Fach/Chargennummer
    // GENAU den einen Artikel "E2E Geraete Pflaster" (e2e-geraete-artikel) —
    // nicht bloss irgendeine kleinere Menge.
    await expect(knopf).toHaveAttribute("data-export-zeilen", "e2e-geraete-artikel");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      knopf.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/);
    // Die ZEILENZAHL IN DER DATEI zu pruefen hiesse, hier eine xlsx zu parsen
    // — das besitzt `_lib/bestandExport.test.ts`. Hier zaehlt: der Knopf
    // bleibt nach dem Filtern bedienbar, exportiert die exakt richtige Menge
    // (oben) und liefert tatsaechlich einen Download.
  });

  /**
   * ⚠️ WEICHT VOM BRIEF AB: der Brief schlaegt hier "ist ohne Zeilen
   * abgestellt" vor (`toBeDisabled()`), aber `disabled` haengt laut T165s
   * Bericht an der VOLLEN Artikelliste (`zeilen.length`), nicht an der
   * gefilterten (ArtikelTable.tsx:236-247, Kommentar an der `disabled`-Zeile).
   * Ein Suchfilter ohne Treffer sperrt den Knopf also NICHT — er bliebe
   * bedienbar und erzeugte eine Datei mit nur der Kopfzeile. Die
   * Brief-Zusicherung waere hier schlicht rot; diese Fassung prueft das
   * tatsaechliche, bewusste Verhalten (T165-Bericht, Minor 1).
   *
   * FUNDORT der Brief-Zusicherung (A5/A12-Muster: nicht fallengelassen,
   * sondern woanders geprueft): `ArtikelTable.test.tsx`, Testfall "bleibt bei
   * leerer Liste abgestellt" — dort wird die WIRKLICHE Sperre (Modul ganz ohne
   * Artikel, `zeilen.length === 0`) unit-getestet. Diese E2E-Spec prueft
   * stattdessen den fuer den Browser einzig beobachtbaren Fall: eine
   * TREFFERleere Suche, bei der der Knopf laut Code bewusst aktiv bleibt.
   *
   * ⚠️ Review-Fix: der Testname behauptete "liefert nur die Kopfzeile", ohne
   * das je zu pruefen — `_lib/bestandExport.test.ts` hat KEINEN Fall mit
   * leerer Eingabe (nur ein bis drei Zeilen), der Fundort-Verweis ging also
   * ins Leere. Behoben durch dieselbe `data-export-zeilen`-Zusicherung wie im
   * vorigen Testfall: eine trefferlose Suche exportiert eine LEERE Menge,
   * nicht irgendeine kleinere. Das IST jetzt die Kopfzeilen-Aussage.
   */
  test("bleibt bei einem Suchtreffer von null bedienbar und exportiert eine leere Menge", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));

    await page.getByRole("searchbox").fill("gibtesnicht-zzz");
    await expect(page.getByText(/Kein Artikel passt zu Suche und Filter\./)).toBeVisible();

    const knopf = page.getByRole("button", { name: /Excel-Liste/ });
    await expect(knopf).toBeEnabled();
    await expect(knopf).toHaveAttribute("data-export-zeilen", "");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      knopf.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^bestand-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
