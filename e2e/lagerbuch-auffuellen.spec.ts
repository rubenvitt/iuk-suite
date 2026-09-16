import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  E2E_TOKEN_HELFER,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-313 — DIE AUFFUELLANSICHT DER GF, AM STUECK IM ECHTEN BROWSER.
 *
 * WAS KEIN ANDERES TOR SIEHT:
 *
 *  1. **Die RSC-Grenze.** `auffuellen/[artikelId]/page.tsx` ist eine Server
 *     Component und reicht Daten an eine Client-Insel; die Fallen 1, 6, 7 und 9
 *     antworten dort mit HTTP 500, und weder `build` noch Vitest sehen das
 *     (Vitest kennt keine RSC-Grenze — die Insel rendert dort immer schon als
 *     Client-Baum). Nur ein echter Abruf zeigt den 500.
 *  2. **Der Riegel gegen ein KAERTCHEN.** Das ist die fachliche Zusage des
 *     Tickets („nur fuer GF"), und sie ist serverseitig: der DOM-Test mockt den
 *     Riegel, der Action-Test kennt keine Seite. Erst hier laeuft eine ECHTE
 *     Kaertchen-Sitzung gegen die echte Adresse.
 *  3. **Der Server-Action-Rundlauf** von `bucheAuffuellung` samt der Zahl, die
 *     danach im Bestand steht.
 *
 * ⚠️ EIGENER ARTIKEL, UEBER DIE OBERFLAECHE ANGELEGT. `e2e/seed-lagerbuch.ts`
 * schreibt fuer jeden geseedeten Artikel eine Ausschliesslichkeits-Klausel
 * („GEHOERT AUSSCHLIESSLICH DIESEM FLOW"); ein fremder Artikel machte diesen
 * Test von der Buchungshistorie eines anderen Specs abhaengig. Und weil dieser
 * Test eine BESTANDSZAHL zusichert, waere das nicht bloss unsauber, sondern
 * rennabhaengig.
 *
 * ⚠️ `test.info().retry` STEHT IN JEDEM ERZEUGTEN NAMEN. CI faehrt `retries: 2`
 * gegen DIESELBE Datenbank (`workers: 1`); ohne die Versuchsnummer legte ein
 * zweiter Versuch einen zweiten gleichnamigen Artikel an, und der textbasierte
 * Greifer traefe zwei Zeilen (Playwright-Strict-Mode, dessen Meldung nicht auf
 * die Ursache zeigt).
 *
 * ⚠️ JEDE AUSLOESENDE AKTION PRUEFT IHRE ANTWORT (Falle 10, zweite Testregel):
 * jeder Server-Action-Klick haengt an `page.waitForResponse` mit dem
 * `next-action`-Kopf als Filter, NICHT nur an einer spaeteren
 * Zustandsaenderung — sonst liefe eine abgelehnte Antwort still ins Zeitbudget
 * und meldete sich als etwas anderes.
 *
 * ⚠️ KLICKS AUF ANKER UEBER `klickeWennRuhig` (Falle 12): der Weg von
 * `/auffuellen` zum Artikel ist ein echter `<a href>` (`ArtikelSuche.tsx`).
 */

/**
 * ⚠️ NICHT `await`-en, BEVOR der ausloesende Klick passiert ist:
 * `page.waitForResponse(...)` beginnt zu lauschen, sobald es aufgerufen wird.
 * Der Aufrufer haelt die Promise, klickt, und `await`-et sie danach.
 */
function serverActionAntwort(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 60_000 },
  );
}

test.describe("Lagerbuch Auffuellen — der Weg der GF (DRK-313)", () => {
  test("Artikel anlegen, ueber „Auffuellen“ in einen Schrank buchen — Bestand steigt", async ({
    page,
  }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });

    const versuch = test.info().retry;
    const artikelName = `E2E Auffuell-Artikel Versuch ${versuch}`;
    const chargenNr = `E2E-AUFF-${versuch}`;
    const menge = 7;
    // Weit ausserhalb jeder Warn-/Ablaufschwelle, aber NICHT der Sentinel
    // `PSEUDO_VERFALL` ("2099-12") — der meint „kein Verfall" und naehme einen
    // anderen Zweig.
    const verfallsmonat = "2090-06";

    // ── 1) Eigenen Artikel anlegen ────────────────────────────────────────
    const artikelSeite = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(artikelSeite?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    // Ohne Hydration traefe der Klick ein Element ohne Handler.
    await page.waitForLoadState("networkidle");

    await klickeWennRuhig(page.getByRole("button", { name: "Neuer Artikel" }));
    const artikelDialog = page.getByRole("dialog");
    await artikelDialog.getByLabel("Name").fill(artikelName);
    await artikelDialog.getByLabel("Fach").fill("E2E-F");
    await artikelDialog.getByLabel("Einheit").fill("Stk.");

    const artikelAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
    expect((await artikelAntwort).ok(), "Artikel anlegen: Server Action").toBe(true);

    // ── 2) Der Nav-Eintrag fuehrt auf die Auffuellansicht ─────────────────
    // Der EINZIGE Weg dorthin (`_lib/nav.ts`); ohne ihn waere die Flaeche
    // gebaut und unerreichbar.
    const auffuellenSeite = await page.goto(lagerbuchUrl("/auffuellen"));
    expect(auffuellenSeite?.status(), "/auffuellen als angemeldete GF: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    // Der Satz, der die RICHTUNG nennt — die Flaeche sieht der Entnahme
    // absichtlich aehnlich, und genau deshalb steht er da.
    await expect(page.locator('[data-rolle="auffuellen-hinweis"]')).toContainText(
      "Hier kommt Material ins Handlager",
    );

    // ── 3) Artikel ueber die Suche oeffnen ────────────────────────────────
    // Ueber die Suche, NIE ueber Bildlauf: die Liste ist lang (200
    // Lastartikel), und ein frisch angelegter Artikel landet alphabetisch
    // irgendwo.
    await page.locator('[data-rolle="artikel-suche"]').fill(artikelName);
    const zeile = page.locator('[data-rolle="artikel-zeile"]').filter({ hasText: artikelName });
    await expect(zeile, "der neue Artikel muss in der Auffuellliste stehen").toHaveCount(1);
    await klickeWennRuhig(zeile);

    // ── 4) Charge, Menge und Schrank waehlen ──────────────────────────────
    await expect(page.locator('[data-rolle="bestand"]'), "Ausgangsbestand").toContainText("0");

    // Der Artikel ist fabrikneu: „Neue Charge" ist vorbelegt, die Felder stehen.
    await page.locator('[data-rolle="chargennummer"]').fill(chargenNr);
    await page.locator('[data-rolle="verfallsmonat"]').fill(verfallsmonat);

    const buchenKnopf = page.locator('[data-rolle="auffuellen-buchen"]');
    // ⚠️ DIE OFFENE ENTSCHEIDUNG BUCHT NICHT. Es gibt mehr als einen Zielort
    // (die Wurzel plus mindestens einen geseedeten Schrank), also ist NICHTS
    // vorbelegt — und der Knopf ist gesperrt, bis gewaehlt wurde.
    await expect(buchenKnopf, "ohne Schrankwahl gesperrt").toBeDisabled();

    // Die Wurzel ist die erste Zeile der Wahl und heisst „Handlager (ohne
    // Schrank)" — sie ist ein Ziel wie jedes andere, kein Rueckfall.
    await page
      .locator('[data-rolle="ziel-zeile"]')
      .filter({ hasText: "Handlager (ohne Schrank)" })
      .locator("input")
      .check();

    // Menge hochzaehlen: der Stepper ist das Bedienelement dieser Flaeche.
    for (let i = 1; i < menge; i++) {
      await page.getByRole("button", { name: "Menge erhöhen" }).click();
    }

    // AK3 — Ziel, Artikel und Menge stehen VOR der Buchung beieinander.
    await expect(page.locator('[data-rolle="auffuellen-zusammenfassung"]')).toContainText(
      `${menge} Stk. ${artikelName} → Handlager (ohne Schrank)`,
    );

    // ── 5) Buchen ─────────────────────────────────────────────────────────
    await expect(buchenKnopf).toBeEnabled();
    const buchungsAntwort = serverActionAntwort(page);
    await klickeWennRuhig(buchenKnopf);
    expect((await buchungsAntwort).ok(), "Auffuellen: Server Action").toBe(true);

    await expect(page.locator('[data-rolle="auffuellen-ergebnis"]')).toHaveText(
      `Aufgefüllt: ${menge} × ${artikelName} → Handlager (ohne Schrank)`,
    );

    // ── 6) Der Bestand steht danach wirklich da ───────────────────────────
    // Auf DIESER Seite (sie revalidiert sich selbst) und in der Verwaltung —
    // eine Buchung, die nur die eine Flaeche kennt, waere keine.
    await expect(page.locator('[data-rolle="bestand"]')).toContainText(String(menge));

    const verwaltungSeite = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(verwaltungSeite?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");
    // Ueber die Suche, NIE ueber Bildlauf — die Tabelle virtualisiert ab 150
    // Zeilen (Falle 14), und ein frisch angelegter Artikel landet alphabetisch
    // moeglicherweise ausserhalb des zuerst gerenderten Fensters.
    await page.getByRole("searchbox").fill(artikelName);
    // ⚠️ ZEILENGREIFER IST `[data-row-key]` (Falle 14) — nie `tbody tr` und nie
    // `getByRole("row")`: eine virtualisierte Tabelle rendert Zeilen als `div`.
    await expect(
      page.locator("[data-row-key]").filter({ hasText: artikelName }),
      "der Artikel steht mit seinem neuen Bestand in der Verwaltung",
    ).toContainText(String(menge));
  });

  /**
   * ⚠️ DER TRAGENDE TEST DES TICKETS (AK2). Ein Menueeintrag, den jemand nicht
   * sieht, ist keine Beschraenkung — die Adresse bleibt abrufbar. Geprueft wird
   * deshalb der DIREKTE Aufruf mit einer echten, gueltigen Kaertchen-Sitzung:
   * sie darf entnehmen (`/helfer` antwortet 200) und darf NICHT auffuellen.
   *
   * ⚠️ `request.get` STATT `page.goto` UND OHNE UMLEITUNGEN: der Riegel
   * antwortet ohne Konto mit einer Umleitung nach `/login`. Folgte der Test ihr,
   * stuende am Ende ein 200 der Anmeldeseite da, und die Zusicherung waere
   * still gruen. Gemessen wird die Antwort der Auffuell-Adresse selbst.
   */
  test("eine Kaertchen-Sitzung erreicht /auffuellen nicht — auch nicht direkt", async ({ page }) => {
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    const helfer = await page.goto(lagerbuchUrl("/helfer"));
    expect(helfer?.status(), "mit Kaertchen ist die Entnahme offen").toBe(200);

    const listeAntwort = await page.request.get(lagerbuchUrl("/auffuellen"), {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(
      listeAntwort.status(),
      "mit Kaertchen darf /auffuellen nicht mit 200 antworten",
    ).not.toBe(200);

    const seitenAntwort = await page.request.get(lagerbuchUrl("/auffuellen/e2e-artikel"), {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(
      seitenAntwort.status(),
      "auch der direkte Artikelaufruf darf nicht mit 200 antworten",
    ).not.toBe(200);
  });
});
