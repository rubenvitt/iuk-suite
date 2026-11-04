import { test, expect, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, warteAufGestreamteInhalte } from "./fixtures";
import { MODULES } from "../src/core/registry";

/*
 * KEINE SEITE DARF AUF DEM TELEFON SEITWÄRTS SCROLLEN (IDA-339).
 *
 * Anlass: nach IDA-338 lief auf der Portal-Startseite die Namensliste einer eingeklappten
 * Dienstkategorie rechts aus dem Bild und machte die ganze Seite breiter als den Schirm. Die
 * bisherigen Überlaufmessungen (`shell-mobil`, `mobil-admin`) prüften feste Seiten mit wenigen
 * Rechten; die neue Ansicht erscheint aber erst ab 13 Einträgen und war nur am Desktop getestet.
 *
 * Deshalb hier: viele Rechte, jede Startseite eines Moduls mit Kopfzeile (aus der Registry
 * gelesen, nicht aufgezählt), zwei Telefonbreiten, im Portal zusätzlich alles aufgeklappt.
 * Ein Fehlschlag nennt die Elemente, die rechts herausragen.
 */
const BREITEN = [320, 390] as const;

const VIELE_GRUPPEN = [
  "admin", "lagerbuch-admin", "files-admin", "feedback-admin", "kommplan-admin", "helfer-admin",
  "fahrzeuge-admin", "schichtplan-admin", "gemeinschaft-admin", "lagemonitor-admin", "uav-admin",
  "einsatzbuch-nutzer", "aufgaben-nutzer", "radio-admin", "wartung-admin", "verpflegung-admin", "qr-admin",
  // Zugangsgruppen, die eine Admin-Gruppe nicht mitbringt (`requiredGroups` in `core/registry`).
  "helfer-nutzer", "kommplan-nutzer", "feedback-nutzer", "wartung-nutzer", "verpflegung-nutzer", "alpha-users",
  // Die Gruppen der lokalen Demodienste (`portal/_lib/seedLokal.ts`): ohne sie fehlen die langen Namenslisten.
  "da-einsatz", "da-ausbildung", "da-verwaltung",
].join(",");

const MIT_KOPFZEILE = MODULES.filter((m) => m.shell === "full" || m.shell === "minimal").map((m) => m.key);

async function ueberlauf(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const schuldige = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        if (b.right <= vw + 1 || b.width <= 1 || b.height <= 1) return false;
        // Was ein Vorfahr innerhalb des Schirms abschneidet, schiebt die Seite nicht breiter.
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible" && a.getBoundingClientRect().right <= vw + 1) return false;
        }
        return true;
      })
      // Nur die innersten Schuldigen: ein Vorfahr ragt mit seinem Kind zwangsläufig mit heraus.
      .filter((el, _i, alle) => !alle.some((andere) => andere !== el && el.contains(andere)))
      .map((el) => {
        const klasse = typeof el.className === "string" ? el.className.slice(0, 40) : "";
        return `${el.tagName}.${klasse} „${(el.textContent ?? "").trim().slice(0, 30)}" rechts=${Math.round(el.getBoundingClientRect().right)}`;
      })
      .slice(0, 5);
    return { vw, dokument: document.documentElement.scrollWidth, schuldige };
  });
}

async function pruefe(page: Page, wo: string) {
  const mass = await ueberlauf(page);
  expect(mass.dokument, `${wo} ist ${mass.dokument}px breit bei ${mass.vw}px: ${mass.schuldige.join(" | ")}`)
    .toBeLessThanOrEqual(mass.vw);
}

for (const breite of BREITEN) {
  test.describe(`bei ${breite}px Breite`, () => {
    test.use({ viewport: { width: breite, height: 800 } });

    test("Portal mit vielen Rechten, alles aufgeklappt", async ({ page }, testInfo) => {
      // Eigene Person: noch nichts angeheftet, „Alle Apps & Dienste“ steht also offen.
      const email = `ueberlauf-${breite}-${testInfo.retry}-${Date.now()}@localtest.me`;
      await devLogin(page, { host: "portal.localtest.me", email, groups: VIELE_GRUPPEN });
      await warteAufGestreamteInhalte(page);
      await expect(page.getByTestId("portal-alle-liste")).toBeVisible();
      await pruefe(page, "Portal");

      /*
       * Die Demodaten tragen je Kategorie nur einen kurzen Dienst; der Befund aus dem Betrieb kam
       * von einer Kategorie mit vielen langen Namen. Deshalb bekommt jede Namensliste hier die
       * Länge aus dem Betrieb — geprüft wird, dass das Layout sie kürzt, nicht die Daten.
       */
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[data-testid="portal-kategorie-namen"]')) {
          el.textContent = "Flugmappe · Monitoring · Netzwerk-Infrastruktur Dokumentation · Suchlage · Wiki · Vaultwarden";
        }
      });
      await expect(page.getByTestId("portal-kategorie-namen").first()).toBeVisible();
      await pruefe(page, "Portal, lange Namenslisten");

      const zu = page.getByTestId("portal-alle-liste").locator('[aria-expanded="false"]');
      while ((await zu.count()) > 0) await zu.first().click();
      await pruefe(page, "Portal, Kategorien offen");
    });

    test("„Ehrlich gesagt“: Einwurf, auch mit Namen", async ({ page, browser }) => {
      /*
       * Der Einwurf ist eine Unterseite ohne Kopfzeile, die Startseiten-Schleife unten sieht ihn
       * nicht. Befund aus dem Betrieb: erst die Wahl „mit meinem Namen“ blendet die Felder ein, und
       * die machten die Seite breiter als den Schirm. Deshalb jede der drei Wahlen einzeln messen.
       */
      const leser = await browser.newContext();
      const aushang = await leser.newPage();
      await devLogin(aushang, { host: "feedback.localtest.me", groups: "kummerkasten-leser", callbackPath: "/ehrlich-gesagt/aushang" });
      await aushang.goto(`http://feedback.localtest.me:${E2E_PORT}/ehrlich-gesagt/aushang`);
      const adresse = (await aushang.getByTestId("einwurf-adresse").textContent())!.trim();
      await leser.close();

      await page.goto(`http://feedback.localtest.me:${E2E_PORT}${new URL(adresse).pathname}`);
      await expect(page.getByRole("heading", { name: "Was liegt dir auf dem Herzen?" })).toBeVisible();
      await pruefe(page, "Einwurf");
      for (const wahl of ["Ja, aber anonym.", "Ja, mit meinem Namen."]) {
        await page.getByText(wahl).click();
        await pruefe(page, `Einwurf, „${wahl}“`);
      }
      await expect(page.getByLabel("Dein Name")).toBeVisible();
      await page.getByLabel("Dein Name").fill("Erika Mustermann-Lüdenscheidt");
      await page.getByLabel("Wie erreicht man dich?").fill("erika.mustermann-luedenscheidt@beispiel.example");
      await pruefe(page, "Einwurf mit Namen, ausgefüllt");
    });

    test("Startseite jedes Moduls mit Kopfzeile", async ({ page }) => {
      await devLogin(page, { host: "portal.localtest.me", groups: VIELE_GRUPPEN });
      const fehler: string[] = [];
      for (const key of MIT_KOPFZEILE) {
        const antwort = await page.goto(`http://${key}.localtest.me:${E2E_PORT}/`);
        await warteAufGestreamteInhalte(page);
        // Gemessen wird nur, was wirklich die Modulseite ist — keine Fehler- oder Anmeldeseite.
        const url = new URL(page.url());
        expect(antwort?.status(), `${key}: HTTP-Status`).toBeLessThan(400);
        expect(url.hostname, `${key}: umgeleitet nach ${page.url()}`).toBe(`${key}.localtest.me`);
        expect(url.pathname, `${key}: umgeleitet nach ${page.url()}`).not.toMatch(/^\/(login|anmelden)/);
        const mass = await ueberlauf(page);
        if (mass.dokument > mass.vw) fehler.push(`${key}: ${mass.dokument}px — ${mass.schuldige.join(" | ")}`);
      }
      expect(fehler, fehler.join("\n")).toEqual([]);
    });
  });
}
