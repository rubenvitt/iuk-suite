import { test, expect, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, warteAufSpaltenaufteilung } from "./fixtures";

/*
 * KEINE TABELLE RAGT BEI 1280PX ÜBER IHREN RAHMEN (IDA-393).
 *
 * Anlass: der UX-Durchgang vom 10.11.2026 maß bei 1280px auf 29 Seiten Tabellen, deren rechte
 * Seite — fast immer Status und Aktionen — nur über waagerechtes Scrollen erreichbar war, ohne
 * dass irgendetwas darauf hinwies. Waagerechtes Scrollen ist für schmale Geräte gedacht, nicht
 * für einen Laptop (`docs/design/README.md`, „Mobil — ein Breakpoint").
 *
 * Gemessen wird je sichtbarer Tabelle ihr Scrollcontainer: `scrollWidth` gegen `clientWidth`.
 * Das Vorbild ist die Überlaufprüfung fürs Telefon (`ueberlauf-mobil.spec.ts`); ein Fehlschlag
 * nennt Seite, Tabelle, Überstand und die Spaltenbreiten.
 *
 * ⚠️ DIE DATEN SIND DIE DER E2E-DATENBANK, nicht die von `pnpm seed:lokal`. Wo sie leer ist,
 * zeigt die Seite eine Leerkarte statt einer Tabelle; solche Seiten stehen in `OHNE_TABELLE`, jede
 * andere Seite ohne sichtbare Tabelle schlägt fehl. Die volle Messung mit Demodaten steht in den
 * Notizen von IDA-393.
 */

const GRUPPEN = [
  "admin", "lagerbuch-admin", "files-admin", "feedback-admin", "kommplan-admin", "helfer-admin",
  "fahrzeuge-admin", "schichtplan-admin", "gemeinschaft-admin", "uav-admin", "einsatzbuch-nutzer",
  "aufgaben-nutzer", "radio-admin", "wartung-admin", "verpflegung-admin", "qr-admin", "helfer-nutzer",
  "kommplan-nutzer", "feedback-nutzer", "wartung-nutzer", "verpflegung-nutzer",
].join(",");

/** Die Verwaltungsseiten mit Tabellen, je Modul. `klick` öffnet eine Detailseite aus der ersten Zeile. */
const SEITEN: Record<string, readonly (string | { pfad: string; klick: string })[]> = {
  lagerbuch: [
    "/verwaltung/artikel", "/verwaltung/bz", { pfad: "/verwaltung/bz", klick: "[data-row-key] a" },
    "/verwaltung/checks", "/verwaltung/fahrzeuge", { pfad: "/verwaltung/fahrzeuge", klick: "[data-row-key] a" },
    "/verwaltung/inventur", "/verwaltung/lagerorte", "/verwaltung/sauerstoff", "/verwaltung/tokens",
    "/verwaltung/geraete", "/verwaltung/maengel", "/verwaltung/journal", "/verwaltung/verfall",
    "/verwaltung/vorlagen", "/verwaltung/checklisten", "/verwaltung/entnahmebox",
  ],
  gemeinschaft: ["/mitglieder", "/vermietung/anfragen", "/projekte"],
  files: ["/", "/posteingang", "/zugangslinks"],
  fahrzeuge: ["/", "/erstimport"],
  helfer: ["/abgleich"],
  wartung: ["/geraete", "/pruefungen", "/maengel", "/gruppen", "/pruefarten", "/arten"],
  verpflegung: ["/artikel", "/bestand", "/mhd", "/buchungen", "/orte", "/links"],
  radio: ["/admin/zugaenge", "/admin/geraete", "/admin/ausleihen", "/admin/versionen"],
  portal: ["/admin", "/admin/audit"],
  uav: ["/admin", "/admin/katalog"],
  // `/routinen` braucht eine koordinierende Person aus der Modul-Datenbank, keine Gruppe.
  aufgaben: ["/personen", "/archiv"],
  kommplan: ["/", "/archiv", "/bibliothek"],
  einsatzbuch: ["/stammdaten", "/rechner"],
};

/** Seiten, die mit der E2E-Datenbank eine Leerkarte statt einer Tabelle zeigen (Stand 10.11.2026). */
const OHNE_TABELLE = new Set<string>([
  "aufgaben/archiv", "einsatzbuch/rechner", "einsatzbuch/stammdaten", "fahrzeuge/", "files/",
  "files/posteingang", "files/zugangslinks", "gemeinschaft/mitglieder", "gemeinschaft/projekte",
  "helfer/abgleich", "kommplan/archiv", "lagerbuch/verwaltung/bz",
  "lagerbuch/verwaltung/checklisten", "lagerbuch/verwaltung/fahrzeuge/e2e-box-fahrzeug",
  "lagerbuch/verwaltung/maengel", "verpflegung/artikel", "verpflegung/bestand",
  "verpflegung/buchungen", "verpflegung/links", "verpflegung/mhd", "verpflegung/orte",
  "wartung/arten", "wartung/geraete", "wartung/maengel", "wartung/pruefungen",
]);

async function tabellenUeberstand(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".ant-table-wrapper")]
      .filter((w) => w.getClientRects().length > 0 && w.getBoundingClientRect().width > 0)
      .map((w) => {
        const scroller = w.querySelector(".ant-table-content, .ant-table-body") ?? w.querySelector(".ant-table-container");
        const ueber = scroller ? scroller.scrollWidth - scroller.clientWidth : 0;
        const rechts = w.getBoundingClientRect().right - document.documentElement.clientWidth;
        const spalten = [...w.querySelectorAll("thead th")]
          .filter((th) => th.getBoundingClientRect().width > 0)
          .map((th) => `${(th.textContent ?? "").trim().slice(0, 16) || "·"} ${Math.round(th.getBoundingClientRect().width)}`);
        return { name: w.querySelector("table")?.getAttribute("aria-label") ?? "", ueber, rechts, spalten };
      }));
}

test.describe("Tabellen bei 1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const [modul, seiten] of Object.entries(SEITEN)) {
    test(`${modul}: keine Tabelle ragt über ihren Rahmen`, async ({ page }) => {
      test.setTimeout(180_000);
      await devLogin(page, { host: `${modul}.localtest.me`, groups: GRUPPEN });
      const fehler: string[] = [];
      for (const seite of seiten) {
        const { pfad, klick } = typeof seite === "string" ? { pfad: seite, klick: undefined } : seite;
        const antwort = await page.goto(`http://${modul}.localtest.me:${E2E_PORT}${pfad}`);
        expect(antwort?.status(), `${modul}${pfad}: HTTP-Status`).toBeLessThan(400);
        await warteAufSpaltenaufteilung(page);
        let wo = `${modul}${pfad}`;
        if (klick) {
          const ziel = page.locator(klick).first();
          if ((await ziel.count()) === 0) continue;
          await ziel.click();
          await page.waitForURL((u) => u.pathname !== pfad);
          await warteAufSpaltenaufteilung(page);
          wo = `${modul}${new URL(page.url()).pathname}`;
        }
        const tabellen = await tabellenUeberstand(page);
        // Eine Seite ohne Tabelle bestünde die Prüfung still — sie muss in OHNE_TABELLE stehen.
        if (tabellen.length === 0 && !OHNE_TABELLE.has(wo)) fehler.push(`${wo}: keine Tabelle sichtbar`);
        for (const t of tabellen) {
          if (t.ueber > 1 || t.rechts > 1) {
            fehler.push(`${wo} [${t.name}] ${Math.max(t.ueber, t.rechts)}px zu breit — ${t.spalten.join(" · ")}`);
          }
        }
      }
      expect(fehler, fehler.join("\n")).toEqual([]);
    });
  }
});
