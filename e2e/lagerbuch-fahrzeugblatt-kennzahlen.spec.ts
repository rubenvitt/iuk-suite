import { test, expect, type Page } from "@playwright/test";
import { devLogin, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DIE KENNZAHLZEILE DES FAHRZEUGBLATTS TRENNT ABGELAUFEN VON BALD ABLAUFEND
 * (DRK-340) — UND SIE PASST AUF JEDEN SCHIRM.
 *
 * Zwei Zusagen, zwei Gründe für einen echten Abruf:
 *
 * 1. DIE AUSSAGE. Vitest prüft die Kachel-Props, aber nicht, dass beide Kacheln
 *    auch tatsächlich auf der Seite ankommen — `Kachel` ist eine Server
 *    Component über `core/kennzahl`, und zwischen Props und Bildschirm liegt die ganze
 *    RSC-Grenze. Ein `WERT` aus einem Client-Modul (Falle 6) oder ein
 *    Compound-Zugriff (Falle 1) zeigt sich erst hier als HTTP 500.
 *
 * 2. DIE BREITE. Aus drei Kacheln sind vier geworden; seit der Haarlinie
 *    bricht die Reihe selbst um (`core/kennzahl`, Mindestbreite je Zahl), und
 *    190px bleibt die Untergrenze, die hier gemessen wird. ⚠️ KEIN TOR
 *    SIEHT DAS: `typecheck` prüft gültige Zahlen, `build` serialisiert sie
 *    klaglos, und Vitest kann es STRUKTURELL nicht sehen — jsdom rechnet keine
 *    Layoutboxen (Fallen 8/13/16, `CLAUDE.md`). Nur ein echter Browser kennt die
 *    Zahl.
 */

type Kachelstand = {
  zahl: string;
  text: string;
  /** Der Ampelpunkt, aus `data-kennzahl` gelesen — `null` heißt ohne Befund. */
  kante: "rot" | "gelb" | "ok" | null;
  breite: number;
};

/**
 * Zahl, Beschriftung, Ton und Breite jeder Kennzahl, in der Reihenfolge der
 * Zeile.
 *
 * ⚠️ DER TON WIRD ÜBER `data-kennzahl` GELESEN, NICHT ÜBER DIE FARBE: die
 * Palette liegt in `core/status`, und ein Hexwert hier entschiede sie mit.
 * Damit das Ablesen nicht STILL ins Leere läuft, prüft der erste Test unten
 * eine Zeile MIT rotem und MIT grünem Ton. Fände das Attribut nichts, wäre er
 * rot; erst dadurch bedeutet die leere Erwartung im zweiten Test etwas.
 */
async function kacheln(page: Page): Promise<Kachelstand[]> {
  return page.locator("[data-kennzahl-wert]").evaluateAll((zahlen) =>
    zahlen.map((zahl) => {
      const rahmen = zahl.closest("[data-kennzahl]") as HTMLElement;
      const ton = rahmen.dataset.kennzahl;
      const kante = ton === "fehler" ? "rot" : ton === "warnung" ? "gelb" : ton === "ok" ? "ok" : null;
      return {
        zahl: (zahl.textContent ?? "").trim(),
        // Die Beschriftung ist das Geschwister DER Zahl, nicht der ganze
        // Kennzahltext — sonst stünde die Zahl mit darin.
        text: (zahl.nextElementSibling?.textContent ?? "").trim(),
        kante: kante as "rot" | "gelb" | "ok" | null,
        breite: Math.round(rahmen.getBoundingClientRect().width),
      };
    }));
}

/** Die beiden Fahrzeuge, die dieser Spec liest — zugleich die Warmlaufliste. */
const BLAETTER = ["e2e-verfall-fahrzeug", "e2e-ungepflegt-fahrzeug"]
  .map((id) => lagerbuchUrl(`/verwaltung/fahrzeuge/${id}`));

/** Ob dieser Worker die beiden Routen schon übersetzt hat. */
let gewaermt = false;

test.describe("Kennzahlen auf dem Fahrzeugblatt", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    /*
     * ⚠️ WARMLAUF — CLAUDE.md FALLE 10, HIER GEMESSEN UND NICHT VERMUTET.
     *
     * `next dev` übersetzt eine Route beim ERSTEN Treffer. Fällt die eigentliche
     * Navigation in genau dieses Fenster, löst der HMR-Kanal einen vollen
     * Reload aus und der Browser bricht sie mit ab. Gemessen im ersten Lauf
     * dieser Datei: `page.goto` lief 90 s in sein Zeitbudget und meldete
     * `net::ERR_ABORTED; maybe frame was detached?` — WÄHREND die drei
     * Breitentests auf DERSELBEN Adresse grün durchliefen, weil die Route da
     * längst übersetzt war. Genau das irreführende Symptombild, das die Falle
     * beschreibt: nicht die erste Zusicherung schlägt fehl, sondern der Weg
     * dorthin, und der Testname klingt nach etwas ganz anderem.
     *
     * ⛔ ÜBER `page.request` NACH `devLogin`, nicht über den `request`-Fixture:
     * nur dieser trägt die Sitzungscookies. Dieselbe Begründung wie bei
     * `warmeZeichenRouten`; ein anonymer GET beantwortet der Proxy mit einer
     * Umleitung und übersetzt die Modulroute gerade NICHT.
     *
     * Der Statuscode ist bedeutungslos — tragend ist allein die einmalige
     * Kompilation. ⚠️ EINMAL JE WORKER, nicht vor jedem Test: übersetzt ist
     * übersetzt, und zwei zusätzliche Anfragen vor jedem Test kosten auf einer
     * ausgelasteten Maschine nur Zeit, die dem Anmeldeschritt fehlt.
     */
    if (!gewaermt) {
      for (const url of BLAETTER) {
        await page.request.get(url).catch(() => {});
      }
      gewaermt = true;
    }
  });

  /**
   * Das Seed-Fahrzeug trägt EINEN Soll-Artikel mit EINER Meldung auf "2020-01" —
   * abgelaufen, mit festem Datum weit in der Vergangenheit, damit der Zustand
   * nicht mit dem Kalendertag kippt.
   *
   * ⚠️ DIE ZAHL MUSS LINKS STEHEN, NICHT RECHTS. Genau das war der Fund: die
   * Fahrzeugliste eine Ebene darüber sagt seit DRK-298 „1 abgelaufen", das Blatt
   * sagte „1 auffällige Verfallsmeldung" und warf beide Zustände zusammen.
   *
   * Der Soll-Artikel trägt eine Angabe, die Erfassung ist also vollständig —
   * deshalb darf die leere Kennzahl daneben einen grünen Punkt zeigen.
   */
  test("nennt abgelaufen und bald ablaufend als zwei Zahlen", async ({ page }) => {
    const antwort = await page.goto(BLAETTER[0]);
    expect(antwort!.status()).toBe(200);
    await warteAufGestreamteInhalte(page); await page.locator("[data-rolle='bestandsliste']").waitFor();

    const gesehen = await kacheln(page);
    expect(gesehen.map((k) => ({ zahl: k.zahl, text: k.text, kante: k.kante }))).toEqual([
      { zahl: "1", text: "Soll-Positionen", kante: null },
      { zahl: "1", text: "Fächer", kante: null },
      { zahl: "1", text: "abgelaufen", kante: "rot" },
      { zahl: "0", text: "läuft ab", kante: "ok" },
    ]);
  });

  /**
   * ⚠️ ZWEI NULLEN SIND KEINE ENTWARNUNG, solange nicht jeder Soll-Artikel
   * angesehen wurde — dieselbe Zurückhaltung, mit der die Fahrzeugliste ihr „im
   * grünen Bereich" gatet. `e2e-ungepflegt-fahrzeug` hat einen Soll-Artikel und
   * keine Meldung: beide Kennzahlen zeigen 0, und KEINE trägt einen Punkt.
   */
  test("gibt ohne vollständige Erfassung keine grüne Kante", async ({ page }) => {
    const antwort = await page.goto(BLAETTER[1]);
    expect(antwort!.status()).toBe(200);
    await warteAufGestreamteInhalte(page); await page.locator("[data-rolle='bestandsliste']").waitFor();

    const gesehen = await kacheln(page);
    expect(gesehen.slice(2).map((k) => ({ zahl: k.zahl, text: k.text, kante: k.kante })))
      .toEqual([
        { zahl: "0", text: "abgelaufen", kante: null },
        { zahl: "0", text: "läuft ab", kante: null },
      ]);
  });

  /**
   * ⚠️ 190px IST DIE ALTE UNTERGRENZE AUS `Kachel`, nicht eine hier erfundene
   * Zahl. Gemessen bei 768px und 1280px; am Telefon (390px) stehen zwei je
   * Zeile, und 150px reichen für eine Zahl mit kurzer Beschriftung.
   */
  for (const breite of [390, 768, 1280]) {
    test(`hält bei ${breite}px alle vier Kennzahlen über ${breite < 400 ? 150 : 190}px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      const antwort = await page.goto(BLAETTER[0]);
      expect(antwort!.status()).toBe(200);
      await warteAufGestreamteInhalte(page); await page.locator("[data-rolle='bestandsliste']").waitFor(); await warteAufSpaltenaufteilung(page);

      const gesehen = await kacheln(page);
      expect(gesehen).toHaveLength(4);
      for (const kachel of gesehen) {
        expect(
          kachel.breite,
          `„${kachel.text}" ist bei ${breite}px nur ${kachel.breite}px breit`,
        ).toBeGreaterThanOrEqual(breite < 400 ? 150 : 190);
      }
    });
  }
});
