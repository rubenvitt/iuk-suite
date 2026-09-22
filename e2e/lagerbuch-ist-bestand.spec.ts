import { test, expect } from "@playwright/test";
import { devLogin, sichtbareZeilen, warteAufDarstellung, warteAufSpaltenaufteilung } from "./fixtures";
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
/*
 * ⚠️ `darstellung` IST KEINE VERZIERUNG, SONDERN DIE ZUSICHERUNG, OHNE DIE
 * DIESER TEST AUF DEM TELEFON NICHTS MEHR MISST (DRK-451). Seit die
 * Soll-Bestueckung unterhalb von 768px als Karten rendert, steht die Tabelle
 * dort auf `display: none` — sie bleibt aber IM BAUM, und ein `evaluate` auf
 * ihre Zeile rechnet klaglos weiter. Der Test war damit nicht rot, sondern
 * BLIND: er mass die verborgene Tabelle, waehrend auf dem Schirm eine Karte
 * stand. Die erwartete Darstellung steht deshalb hier als Datum und wird unten
 * gegen den Baum geprueft; ein `sichtbareZeilen` allein waere bequemer und
 * wuerde eine bei 1280px faelschlich erscheinende Karte still mitnehmen.
 */
const BREITEN = [
  { name: "Telefon", width: 390, height: 844, darstellung: "karte" },
  { name: "Tablet hoch", width: 834, height: 1112, darstellung: "tabelle" },
  { name: "Desktop", width: 1280, height: 720, darstellung: "tabelle" },
] as const;

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

      // Erst wenn genau EINE Darstellung im Bild steht, greift der Greifer die
      // gemeinte — sonst entscheidet das Zeitverhalten (Begruendung bei
      // `warteAufDarstellung`). Dieser Test war ohne sie gruen, aber nur so.
      await warteAufDarstellung(page);
      const zeile = sichtbareZeilen(page, "e2e-soll");
      await expect(zeile).toContainText("E2E Check Kompressen");
      await warteAufSpaltenaufteilung(page);

      // Und sie ist die Darstellung, die hier stehen SOLL — sonst misst alles
      // Folgende die andere (Begruendung bei `BREITEN`).
      expect(
        await zeile.evaluate((el) => (el.hasAttribute("data-karte-key") ? "karte" : "tabelle")),
        `Darstellung bei ${breite.width}px`,
      ).toBe(breite.darstellung);

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
        const eigen = { scrollWidth: tr.scrollWidth, clientWidth: tr.clientWidth };
        const stil = getComputedStyle(zahl);
        const kasten = (el: Element) => {
          const r = el.getBoundingClientRect();
          return {
            links: Math.round(r.left),
            rechts: Math.round(r.right),
            oben: Math.round(r.top),
            unten: Math.round(r.bottom),
          };
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
            // ⚠️ AB DER TABELLE, WENN ES EINE GIBT — die Karte hat keine, und
            // `closest("table")!` warf dort `null.parentElement`.
            let el: HTMLElement | null = (tr.closest("table") ?? tr).parentElement;
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
          eigen,
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
      /*
       * GETRENNT VOM SOLL — und die Trennung sieht je Darstellung anders aus.
       *
       * ⚠️ DIESE ZUSICHERUNG DARF NICHT AUF „ueberlappt nicht" ABGESCHWAECHT
       * WERDEN, nur damit eine Formel beide Faelle traegt: in der Tabelle steht
       * das Soll-Feld RECHTS neben der Zahl, in der Karte in der Zeile DARUNTER
       * (`.merkmale` ist ein einspaltiges Raster). Eine Zusicherung, die beides
       * durchlaesst, liesse auch die Vertauschung durch — und genau die
       * Verwechselbarkeit von Ist und Soll ist der Anlass von DRK-315.
       */
      if (breite.darstellung === "tabelle") {
        expect(mass.ist.rechts, "Ist steht links vom Soll").toBeLessThanOrEqual(mass.soll.links);
      } else {
        expect(mass.ist.unten, "Ist steht ueber dem Soll").toBeLessThanOrEqual(mass.soll.oben);
      }

      if (breite.darstellung === "tabelle") {
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
      } else {
        /*
         * ⚠️ AUF DEM TELEFON IST DER EIGENSCROLL KEIN ERFOLG MEHR, SONDERN EIN
         * FEHLER — und das ist die Umkehrung der Zeile darueber, nicht ihr
         * Wegfall. Die Tabelle durfte in sich scrollen, weil sechs Spalten
         * nebeneinander auf 390px nicht anders unterzubringen waren; die Karte
         * bricht dieselben Felder untereinander um und hat damit keinen Grund,
         * waagerecht ueberzulaufen. Tut sie es doch, ist ein Feld zu breit —
         * und auf einer Karte gibt es keine Bildlaufleiste, die das verriete.
         */
        expect(
          mass.eigen.scrollWidth,
          `Die Soll-Karte laeuft bei ${breite.width}px waagerecht ueber `
          + `(${mass.eigen.scrollWidth} auf ${mass.eigen.clientWidth}px)`,
        ).toBeLessThanOrEqual(mass.eigen.clientWidth);
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
