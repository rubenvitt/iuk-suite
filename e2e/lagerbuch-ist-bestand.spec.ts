import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DER IST IM FAHRZEUGBLATT STEHT GROSS NEBEN DEM SOLL (DRK-315).
 *
 * ⚠️ WARUM DIESER TEST NEBEN `SollEditor.test.tsx` STEHT. Vitest bestaetigt,
 * dass die Zelle die Zahlrolle TRAEGT — jsdom rechnet aber weder Schriftgroesse
 * noch Layoutbox, und die Zusage „bei kleinen Bildschirmen nutzbar" ist ohne
 * einen echten Browser gar nicht zu pruefen.
 *
 * Drei Breiten wie `lagerbuch-mobil.spec.ts`. Der Anker ist die Zeile
 * `e2e-soll` mit ihrem Artikelnamen — eine 404-Seite hat keinen Ueberlauf und
 * bestuende jede Zusicherung hier still.
 *
 * ⚠️ DER IST-WERT SELBST WIRD HIER NICHT ZUGESICHERT, nur seine Form. Der Seed
 * legt den Bestand zwar ausschliesslich ins Handlager (lokal, frische Datei:
 * „0 Stk."), aber alle Specs laufen mit `workers: 1` gegen EINE SQLite-Datei,
 * und ein abgeschlossener Check im selben Lauf fuellt `e2e-fahrzeug` auf sein
 * Soll auf — in CI stand dort „3 Stk.", reproduzierbar in allen drei Versuchen.
 * Genau diese Reihenfolgeabhaengigkeit beschreibt der Kopf von
 * `artikelMitBestand` in `seed-lagerbuch.ts`. Dass der RICHTIGE Bestand ankommt,
 * halten `SollEditor.test.tsx` und `page.test.tsx` fest; hier geht es um Groesse
 * und Erreichbarkeit.
 *
 * ⚠️ DIE REIHENFOLGEABHÄNGIGKEIT BEWEGT DIE MESSUNG NICHT (DRK-360). Die Ziffer
 * steht in `tabular-nums`; „0 Stk." gegen „3 Stk." macht an der Tabellenbreite
 * gemessen 1px (753 gegen 754) — bei 191px Reserve zur Kante, s. `BREITEN`.
 */
/**
 * ⚠️ 834PX IST NICHT BELIEBIG: es ist die einzige der drei Breiten, an der die
 * Seitenleiste STEHT (ab 768px) und die Tabelle trotzdem in sich scrollen muss.
 * Die Reserve ist groß — gemessen in 38 Läufen auf `main` (2026-09-15 bis
 * 2026-09-21), ausnahmslos: 753/754px Inhalt in 562px Kasten.
 *
 * DRK-360 hielt die Breite für „exakt auf der Kante" (802 auf 802). Das war die
 * Messung VOR der Hydration, als der Inhalt noch unter der Leiste lag — heute
 * fängt `warteAufSpaltenaufteilung` genau diesen Zustand ab. Wer hier wieder
 * 802/802 sieht, sucht dort, nicht an der Breite und nicht im Seed.
 */
const BREITEN = [
  { name: "Telefon", width: 390, height: 844 },
  { name: "Tablet hoch", width: 834, height: 1112 },
  { name: "Desktop", width: 1280, height: 720 },
] as const;

/**
 * WARTET, BIS DIE HUELLE IHRE SPALTEN AUFGETEILT HAT — und das ist kein
 * vorsorgliches Warten, sondern die Abhilfe zu einem GEMESSENEN Ausfall.
 *
 * ⚠️ DAS SYMPTOM SIEHT AUS WIE „die Tabelle scrollt nicht in sich".
 * Gemessen am 2026-09-15 bei 834px, dreimal in Folge gleich:
 *
 *     sofort nach `toContainText`   main 834px — Scroll-Container 802/802
 *     nach der Hydration            main 594px — Scroll-Container 562/746
 *
 * Die Seitenleiste steht in BEIDEN Zustaenden mit 240px da (`display: block`) —
 * sie ist nicht die Ursache. Der Inhalt liegt anfangs bloss noch UNTER ihr statt
 * neben ihr, und zwar weil `Layout` seine Kinder nur mit der Klasse
 * `ant-layout-has-sider` nebeneinander legt. Die steht NICHT im Server-HTML:
 * dort kommt `class="ant-layout iuk"` an, und `.ant-layout` ist
 * `flex-direction: column`. Erst bei der Hydration meldet sich `Sider` per
 * `useEffect` bei `Layout` an (`antd/es/layout/Sider.js:122-125`):
 *
 *     t=0ms     class="ant-layout iuk"                       column   Inhalt 834px
 *     t=500ms   class="ant-layout ant-layout-has-sider iuk"  row      Inhalt 594px
 *
 * ⚠️ ES IST DIE KLASSE, DIE FEHLT, NICHT DIE REGEL — der Unterschied schickt
 * die Fehlersuche sonst ins falsche Stilsystem. Die cssinjs-Regel
 * `.ant-layout-has-sider { flex-direction: row }` steht im selben Server-HTML
 * bereits drin (nachgemessen), und `shell.module.css` deckelt nur die Leiste
 * selbst, nie `Layout` oder `Content`. `useHasSider` hat zwar einen synchronen
 * Rueckfall ueber die Kinder — der greift nicht, weil `SuiteRahmen` eine Server
 * Component ist und `<Sider>` die RSC-Grenze als Client-Referenz ueberquert.
 *
 * Mit 802px Platz fuer 746px Tabelle ist bis dahin nichts zu eng, der Eigenscroll
 * entfaellt — und eine Zusicherung darauf faellt, obwohl die Seite richtig ist.
 *
 * ⚠️ NICHT MIT EINEM GROESSEREN ZEITBUDGET ZU HEILEN: `expect`s eigene
 * Wiederholung greift nur an EINER Zusicherung, gemessen wird hier aber EINMAL
 * in einem `evaluate` und danach nur noch gerechnet. Die erste Messung ist die
 * einzige, und sie faellt in das Fenster.
 *
 * ⚠️ SEIT DRK-363 IST DIE PROBE SOFORT WAHR: `SuiteRahmen` setzt `hasSider`,
 * die Klasse steht im Server-HTML (`e2e/shell-spaltenaufteilung.spec.ts`).
 * Sie bleibt trotzdem stehen — sie kostet nichts und faengt es, falls die
 * Klasse je wieder erst mit der Hydration kommt.
 *
 * Die Probe ist die Invariante des fertigen Rasters: der Inhalt beginnt dort,
 * wo die Leiste endet. Unterhalb von 768px steht die Leiste auf `display: none`
 * (`core/shell/shell.module.css`), ihr Kasten ist dann durchweg 0 — die Probe
 * ist dort wahr, ohne etwas zu behaupten, und das ist richtig so: ohne Leiste
 * gibt es nichts, worauf der Inhalt warten muesste.
 */
async function warteAufSpaltenaufteilung(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const inhalt = document.querySelector(".ant-layout-content");
    const leiste = document.querySelector(".ant-layout-sider");
    if (!inhalt) return false;
    const links = inhalt.getBoundingClientRect().left;
    const rechts = leiste ? leiste.getBoundingClientRect().right : 0;
    return links >= rechts - 1;
  }), {
    message: "Der Inhalt liegt noch unter der Seitenleiste statt neben ihr",
  }).toBe(true);
}

test.describe("Ist-Bestand im Fahrzeugblatt", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  for (const breite of BREITEN) {
    test(`steht gross, getrennt vom Soll, und bleibt erreichbar — ${breite.name}`, async ({ page }) => {
      await page.setViewportSize({ width: breite.width, height: breite.height });
      const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge/e2e-fahrzeug"));
      expect(antwort!.status()).toBe(200);

      const zeile = page
        .getByRole("table", { name: "Soll-Bestückung" })
        .locator("tbody tr[data-row-key='e2e-soll']");
      await expect(zeile).toContainText("E2E Check Kompressen");
      await warteAufSpaltenaufteilung(page);

      const ist = zeile.locator("[data-rolle='ist']");
      const soll = zeile.getByRole("spinbutton", { name: /^Soll für / });
      // Form, nicht Wert — s. Kopfkommentar.
      await expect(ist).toHaveText(/^\d+ Stk\.$/);

      await ist.scrollIntoViewIfNeeded();
      await expect(ist).toBeInViewport();

      const mass = await zeile.evaluate((tr) => {
        const zahl = tr.querySelector<HTMLElement>("[data-rolle='ist'] span span")!;
        const handlager = Array.from(tr.querySelectorAll<HTMLElement>("span"))
          .find((el) => (el.textContent ?? "").startsWith("Handlager "))!;
        const sollFeld = tr.querySelector<HTMLInputElement>("input[aria-label^='Soll für']")!;
        const stil = getComputedStyle(zahl);
        const kasten = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { links: Math.round(r.left), rechts: Math.round(r.right) };
        };
        return {
          istPx: parseFloat(stil.fontSize),
          istZiffern: stil.fontVariantNumeric,
          handlagerPx: parseFloat(getComputedStyle(handlager).fontSize),
          sollPx: parseFloat(getComputedStyle(sollFeld).fontSize),
          ist: kasten(zahl),
          soll: kasten(sollFeld),
          scroller: (() => {
            // Der erste Vorfahr der Tabelle, der waagerecht scrollt — nicht der
            // Rahmen: der kann schmal sein, waehrend die Tabelle darin
            // unerreichbar abgeschnitten ist.
            let el: HTMLElement | null = tr.closest("table")!.parentElement;
            while (el && !["auto", "scroll"].includes(getComputedStyle(el).overflowX)) {
              el = el.parentElement;
            }
            if (!el || el === document.documentElement || el === document.body) return null;
            return {
              rechts: Math.round(el.getBoundingClientRect().right),
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
            };
          })(),
          fenster: window.innerWidth,
          dokument: {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          },
        };
      });
      console.log(`DRK-315 ${breite.name} ${breite.width}px`, JSON.stringify(mass));

      // Groesser als der Nebentext, in dem er vorher stand, und groesser als
      // die Ziffer im Soll-Feld daneben.
      expect(mass.istPx).toBe(24);
      expect(mass.istPx).toBeGreaterThan(mass.handlagerPx);
      expect(mass.istPx).toBeGreaterThan(mass.sollPx);
      expect(mass.istZiffern).toContain("tabular-nums");
      // Ist links vom Soll, ohne Ueberlappung.
      expect(mass.ist.rechts).toBeLessThanOrEqual(mass.soll.links);
      // Die Tabelle scrollt in sich (docs/design/README.md), statt die Seite
      // zu verbreitern.
      expect(mass.scroller).not.toBeNull();
      expect(mass.scroller!.rechts).toBeLessThanOrEqual(mass.fenster);
      if (breite.width < 1280) {
        // Schmal: die Tabelle ist breiter als ihr Kasten und scrollt IN SICH.
        expect(
          mass.scroller!.scrollWidth,
          `Die Soll-Tabelle scrollt bei ${breite.width}px nicht in sich `
          + `(${mass.scroller!.scrollWidth} auf ${mass.scroller!.clientWidth}px) — `
          + "steht der Kasten bei 802px, lag der Inhalt noch unter der Leiste",
        ).toBeGreaterThan(mass.scroller!.clientWidth);
      }

      // UND DIE SEITE SELBST LAEUFT NICHT WAAGERECHT UEBER (DRK-322).
      //
      // ⚠️ DIESE ZEILE STAND HIER SCHON EINMAL UND MUSSTE WIEDER RAUS. Als
      // DRK-315 gebaut wurde, lief das Blatt auch ohne die Soll-Tabelle ueber:
      // die Verfallstabelle weiter unten hing in einer impliziten `auto`-Spalte
      // und verbreiterte die Seite um 357px bei 390px Fensterbreite. Die
      // Zusicherung war damit nicht zu halten, ohne einen fremden Fehler
      // mitzubeheben — also wurde sie als DRK-322 herausgetrennt und die Spec
      // mass nur noch ihren eigenen Scroll-Container. DRK-343 hat die
      // Verfallstabelle auf `minmax(0, 1fr)` gestellt; seither ist der
      // Seitenueberlauf weg, und die Zusicherung gehoert zurueck.
      //
      // ⚠️ WARUM SIE HIER GEBRAUCHT WIRD UND NICHT NUR IN
      // `lagerbuch-fahrzeugblatt-mobil.spec.ts`: jene Spec deckt die
      // Verfallstabelle an ihrem eigenen Fahrzeug ab. Diese hier ist die
      // einzige, die das Blatt mit einer BESTUECKTEN Soll-Tabelle daneben
      // misst — und die Soll-Tabelle ist die breitere von beiden. Faellt eine
      // der beiden Abhilfen wieder heraus, ist es diese Zeile, die es merkt.
      //
      // Gemessen am 2026-09-15 in echtem Chromium auf `e2e-fahrzeug`, alle drei
      // Breiten mit 0px Ueberlauf; die Tabellen tragen dabei 746px (Soll) und
      // 891px (Verfall) Inhalt in 358px bzw. 308px breiten Kaesten.
      expect(
        mass.dokument.scrollWidth - mass.dokument.clientWidth,
        `Das Fahrzeugblatt ragt bei ${breite.width}px um `
        + `${mass.dokument.scrollWidth - mass.dokument.clientWidth}px über die Sichtfläche`,
      ).toBeLessThanOrEqual(0);

      // Das Soll-Feld ist ueber den Tabellen-Scroll erreichbar, ohne dass die
      // SEITE waagerecht mitscrollt — sonst bewiese `toBeInViewport` nur einen
      // Seitenueberlauf.
      await page.evaluate(() => window.scrollTo(0, window.scrollY));
      await soll.scrollIntoViewIfNeeded();
      await expect(soll).toBeInViewport();
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
    });
  }
});
