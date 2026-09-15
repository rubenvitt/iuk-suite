import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  E2E_FAHRZEUG_ANDERES_NAME,
  E2E_FAHRZEUG_ID,
  E2E_FAHRZEUG_NAME,
  E2E_TOKEN_FAHRZEUG,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-305 — DER ANGEMELDETE EINSTIEG IN DEN FAHRZEUG-CHECK.
 *
 * ⚠️ WARUM DIESE DATEI DER EINZIGE ECHTE NACHWEIS IST. Drei Aussagen kann kein
 * anderes Tor dieses Repos halten:
 *
 *  1. DASS DIE SEITE FÜR EIN KONTO ÜBERHAUPT ANTWORTET. `helfer/check/page.tsx`
 *     ist eine Server Component und liest seit DRK-305 `sitzungsEtikett` als
 *     WERT aus `_lib/zugangHerkunft.ts`. Trüge diese Datei je ein
 *     `"use client"`, käme dort eine Client-Referenz statt des Wertes an —
 *     HTTP 500 für die ganze Seite, und `typecheck`, `build` und Vitest bleiben
 *     alle drei grün (Falle 6; in Vitest ist die Direktive ein wirkungsloser
 *     String). Dasselbe gilt für `CheckDurchfuehrenKnopf` in der Verwaltung:
 *     antd-Compound oder ein `@ant-design/icons`-Import ergäbe 500, bei Falle 7
 *     schon beim Import.
 *  2. DASS DER KNOPF WIRKLICH NAVIGIERT. `<Button href>` gegen
 *     `<Link><Button/></Link>` — ein `<button>` in einem `<a>` sieht am
 *     Bildschirm identisch aus, wird von `getByRole("link")` gefunden und
 *     navigiert NIE. Der DOM-Test daneben prüft die Struktur; dass ein Klick
 *     ankommt, sagt nur ein echter Browser.
 *  3. DASS DIE BEIDEN WEGE GETRENNT BLEIBEN (Akzeptanzkriterium 4). Der
 *     Kärtchen-Weg und der Konto-Weg laufen durch DIESELBE Seite; ob die
 *     Reihenfolge der beiden Riegel hält, zeigt erst ein Lauf, in dem beides
 *     gleichzeitig vorliegt — ein Kärtchen im Cookie UND eine Anmeldung.
 *
 * Host, Gruppe, Codes und Fahrzeugnamen kommen ausschließlich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — kein Literal.
 *
 * ⚠️ DIESE DATEI SCHLIESST KEINEN CHECK AB und schreibt deshalb weder eine
 * `checks`- noch eine `buchungen`-Zeile. Sie prüft den EINSTIEG; was der
 * Abschluss in die append-only-Tabellen schreibt, hält `_actions/check.test.ts`
 * ohne Browser fest.
 *
 * ⚠️ `E2E_TOKEN_FAHRZEUG` ist der gebundene Code aus
 * `lagerbuch-fahrzeug-kaertchen.spec.ts`; er wird hier nur eingelöst, nicht
 * verändert. `tokens.last_used_at` wandert dabei — keine Spec prüft ihn gegen
 * NULL (beide vergleichen differenziell).
 */

/** Ein Fahrzeugname als Suchmuster — dieselbe Hilfe wie im Kärtchen-Lauf. */
const alsText = (name: string) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test.describe("DRK-305 — angemeldet prüfen, ohne Code", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("ohne Kärtchen führt /helfer/check auf die VOLLE Fahrzeugwahl", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/helfer/check"));
    // Die eine Zeile, die Falle 6 und Falle 7 überhaupt sichtbar macht.
    expect(antwort!.status(), "HTTP 500 = Client-Wert oder Zeichen in der Server Component")
      .toBe(200);

    await expect(page.getByText("Fahrzeug wählen")).toBeVisible();
    // Beide Fahrzeuge des Seeds: „nicht auf ein einzelnes beschränkt“ ist die
    // User Story, und zwei Einträge sind ihr kleinstmöglicher Beleg.
    await expect(page.getByRole("link", { name: alsText(E2E_FAHRZEUG_NAME) })).toBeVisible();
    await expect(
      page.getByRole("link", { name: alsText(E2E_FAHRZEUG_ANDERES_NAME) }),
    ).toBeVisible();
  });

  test("der Kopf nennt die angemeldete Person — und keinen Token-Code", async ({ page }) => {
    await page.goto(lagerbuchUrl("/helfer/check"));
    await expect(page.getByText(/^Angemeldet: /)).toBeVisible();
    // Gegenprobe: das Kärtchen-Etikett beginnt mit „Zugang: Token“. Ohne sie
    // wäre die Zeile darüber auch dann grün, wenn beide Sätze gleichzeitig
    // dastünden.
    await expect(page.getByText(/^Zugang: Token/)).toHaveCount(0);
  });

  test("statt „Beenden“ steht der Weg zurück in die Verwaltung", async ({ page }) => {
    /*
     * `beenden` löscht das Kärtchen-Cookie, und hier gibt es keins. Der Knopf
     * liefe ins Leere und setzte die angemeldete Person wortlos aufs Gate — wo
     * sie einen Code eingeben soll, den sie nicht hat. Ohne diesen Weg wäre der
     * Einstieg überdies eine Sackgasse: der Helfer-Rahmen trägt keine
     * Suite-Navigation.
     */
    await page.goto(lagerbuchUrl("/helfer/check"));
    const zurueck = page.getByRole("link", { name: "Zur Verwaltung" });
    await expect(zurueck).toBeVisible();
    await klickeWennRuhig(zurueck);
    await page.waitForURL((u) => u.pathname.endsWith("/verwaltung"));
  });

  test("„Check durchführen“ auf der Fahrzeugliste navigiert wirklich", async ({ page }) => {
    /*
     * ⚠️ DIE ZUSAGE IST DIE NAVIGATION, NICHT DER KNOPF. `<Link><Button/></Link>`
     * wäre am Bildschirm nicht zu unterscheiden, und die Adresse bliebe nach dem
     * Klick stehen — genau der Fehler, den `ChecklisteKnopf` schon einmal hatte
     * und den vier Tore durchgelassen haben.
     */
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    expect(antwort!.status()).toBe(200);

    await klickeWennRuhig(page.getByRole("link", { name: "Check durchführen" }));
    await page.waitForURL((u) => u.pathname.endsWith("/helfer/check"));
    await expect(page.getByText("Fahrzeug wählen")).toBeVisible();
  });

  test("„Check durchführen“ am Fahrzeugblatt wählt DIESES Fahrzeug vor", async ({ page }) => {
    await page.goto(lagerbuchUrl(`/verwaltung/fahrzeuge/${E2E_FAHRZEUG_ID}`));
    await klickeWennRuhig(page.getByRole("link", { name: "Check durchführen" }));
    await page.waitForURL(
      (u) => u.pathname.endsWith("/helfer/check") && u.searchParams.get("fz") === E2E_FAHRZEUG_ID,
    );
    // Vorausgewählt — aber NICHT gebunden: der Weg zu einem anderen Fahrzeug
    // bleibt offen. Das ist der Unterschied zum gescannten Kärtchen (DRK-302).
    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();
  });

  test("ein gescanntes Kärtchen gewinnt gegen die Anmeldung (DRK-302 bleibt)", async ({ page }) => {
    /*
     * AKZEPTANZKRITERIUM 4, schärfste Form: beide Herkünfte liegen gleichzeitig
     * vor. Käme das Konto zuerst, verschwände die Bindung aus DRK-302 für jede
     * angemeldete Person — still, und nur für die, die beides haben.
     */
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await page.goto(lagerbuchUrl("/helfer/check"));

    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();
    await expect(page.getByText("Fahrzeug wählen")).toHaveCount(0);
    // Und der Kopf zeigt wieder das Kärtchen, nicht das Konto.
    await expect(page.getByText(/^Zugang: Token/)).toBeVisible();
  });
});
