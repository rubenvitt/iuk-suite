import { expect, test, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-344 — die Vorgangsart im Journal.
 *
 * WARUM EIN ECHTER BROWSER, obwohl die Ableitung eine reine Funktion ist und in
 * `_lib/vorgang.test.ts` geprueft wird: die Kette geht ueber DREI Grenzen, die
 * Vitest strukturell nicht kennt.
 *
 *  1. `_lib/vorgang.ts` wird von einer Server Component UND einer Client-Insel
 *     gelesen. Eine Direktive darauf machte aus dem Wert eine Client-Referenz —
 *     HTTP 500 fuer die ganze Seite, und `build` sieht das nicht (Falle 6). In
 *     Vitest ist `"use client"` eine wirkungslose Zeichenkette; der Quelltext-
 *     Scan dort faengt die naheliegende Verdrahtung, nicht den echten Abruf.
 *  2. Der Filter ist SERVERSEITIGES SQL. Die `LIKE`-Bedingung laeuft gegen
 *     echtes SQLite — eine jsdom-Tabelle kann sie gar nicht ausfuehren.
 *  3. Der Weg geht durch die ADRESSZEILE (`?typ=…`) und damit durch die
 *     Normalisierung, die Seite und Nachschlag gemeinsam fahren.
 *
 * ⚠️ GEGRIFFEN WIRD UEBER `[data-row-key]`, NICHT UEBER `tbody tr` ODER
 * `getByRole("row")` (CLAUDE.md, Falle 14). `core/tabelle` virtualisiert ab 150
 * Zeilen, und dann rendert rc-table Zeilen als `div` ohne `role="row"` und
 * haengt das `aria-label` an gar nichts mehr. Das Journal laedt 100 Zeilen je
 * Portion und nach — im gewachsenen Bestand ist die Schwelle also erreichbar,
 * im E2E-Seed nicht. Ein Greifer, der erst dort umkippt, bliebe hier gruen.
 *
 * Die vier Buchungen gehoeren allein diesem Spec (`seed-lagerbuch.ts`,
 * `vorgangFixtures`).
 */
/**
 * ⚠️ DER NAME TRAEGT KEIN WORT, NACH DEM EIN ANDERER SPEC SUCHT — die
 * Begruendung steht am Seed (`vorgangFixtures`). Kurz: alle Specs teilen EINE
 * Datenbank.
 */
const ARTIKEL = "E2E Vorgang Wundauflage";

/**
 * Die Vorgangstexte der Zeilen dieses Artikels, in der Reihenfolge der Tabelle.
 *
 * ⚠️ `td:nth-child(3)` UND NICHT `.locator("td").nth(2)`. Der zweite Griff
 * sammelt erst ALLE Zellen ALLER Zeilen zu einer flachen Liste ein und nimmt
 * daraus die dritte — also die dritte Zelle der ERSTEN Zeile, ein einziges
 * Element. `allInnerTexts()` läge dann einen Eintrag lang richtig und der Test
 * prüfte eine Zeile statt vier. `:nth-child` greift dagegen INNERHALB jeder
 * Zeile.
 *
 * Dass die dritte Spalte „Vorgang" ist, sichert der Test unten eigens zu —
 * sonst verschöbe ein Spaltentausch diesen Index still.
 */
async function vorgaenge(page: Page): Promise<string[]> {
  const zeilen = page.locator("[data-row-key^='e2e-vorgang-']");
  await expect(zeilen).toHaveCount(4);
  return zeilen.locator("td:nth-child(3)").allInnerTexts();
}

async function journal(page: Page, suche: string): Promise<void> {
  await page.goto(lagerbuchUrl(`/verwaltung/journal?${suche}`));
  await page.waitForLoadState("networkidle");
}

test.describe("lagerbuch — Vorgangsart im Journal (DRK-344)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("Aussonderung und Inventur stehen als eigener Vorgang in der Spalte", async ({ page }) => {
    await journal(page, `q=${encodeURIComponent(ARTIKEL)}`);

    // Der Spaltenindex oben ist nur so gut wie diese Zusicherung.
    await expect(page.locator("thead th").nth(2)).toHaveText("Vorgang");

    /*
     * ⚠️ ALLE VIER ZEILEN AUF EINMAL, nicht je eine Zusicherung: der Fund war,
     * dass die drei Korrekturen UNUNTERSCHEIDBAR aussahen. Ein Test, der nur
     * „Aussonderung kommt vor" prueft, bliebe gruen, wenn ploetzlich JEDE
     * Korrektur so hiesse.
     *
     * ⚠️ DIE REIHENFOLGE KOMMT AUS DEN ZEITSTEMPELN, nicht aus den Namen. Der
     * Seed gibt jeder Zeile eine eigene Minute; traegen sie denselben
     * Zeitstempel, ordnet allein der id-Tiebreaker (`ts DESC, id DESC`), und der
     * dreht sich beim naechsten Umbenennen lautlos.
     */
    expect(await vorgaenge(page)).toEqual([
      "Aussonderung · E2E abgelaufen entsorgt",
      "Inventur · E2E Jahresinventur",
      "Korrektur · E2E verzählt",
      "Wareneingang",
    ]);
  });

  test("der Filter „Aussonderung“ trifft genau die eine Zeile", async ({ page }) => {
    // ⚠️ DER SCHLUESSEL HEISST WEITER `typ`: gespeicherte Journal-Links tragen
    // ihn. Der WERT ist die neue Vorgangsart.
    await journal(page, `q=${encodeURIComponent(ARTIKEL)}&typ=aussondern`);

    await expect(page.locator("[data-row-key^='e2e-vorgang-']")).toHaveCount(1);
    await expect(page.locator("[data-row-key='e2e-vorgang-aussonderung']"))
      .toContainText("Aussonderung");
  });

  test("„Korrektur“ zeigt die Handkorrektur und NICHT die verfeinerten Arten", async ({ page }) => {
    /**
     * ⚠️ DIE ZEILE OHNE REFERENZ IST DER EIGENTLICHE FALL. `referenz NOT LIKE
     * '…'` ist fuer `referenz IS NULL` nicht wahr, sondern NULL — und NULL ist
     * in einem WHERE falsch. Ohne den ausgeschriebenen `IS NULL`-Zweig
     * verschwaende ausgerechnet die haeufigste Zeile, und zwar still: die
     * Tabelle zeigte nur weniger.
     */
    await journal(page, `q=${encodeURIComponent(ARTIKEL)}&typ=korrektur`);

    await expect(page.locator("[data-row-key='e2e-vorgang-handkorrektur']")).toBeVisible();
    await expect(page.locator("[data-row-key='e2e-vorgang-aussonderung']")).toHaveCount(0);
    await expect(page.locator("[data-row-key='e2e-vorgang-inventur']")).toHaveCount(0);
  });

  test("das Auswahlfeld bietet die Vorgangsart an und schreibt sie in die Adresse", async ({ page }) => {
    await journal(page, `q=${encodeURIComponent(ARTIKEL)}`);

    // ⚠️ `klickeWennRuhig` statt `.click()` (CLAUDE.md, Falle 12): die Huelle
    // holt `/api/auth/session` nach und rutscht dabei um ~240 px; ein Klick
    // zwischen `mousedown` und `mouseup` traefe dann den gemeinsamen Vorfahren.
    await klickeWennRuhig(page.getByRole("combobox", { name: "Vorgang" }));
    await page.locator(".ant-select-item-option", { hasText: "Aussonderung" }).click();

    await expect(page).toHaveURL(/[?&]typ=aussondern(&|$)/);
    await expect(page.locator("[data-row-key^='e2e-vorgang-']")).toHaveCount(1);
  });
});
