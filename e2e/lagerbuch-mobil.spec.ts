import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DREI BREITEN, NICHT ZWEI (Spec §12.2, docs/design/README.md:199-212).
 *
 * „Wer nur die Enden misst, prueft die Mitte nicht; die Mitte ist jedes Tablet
 * im Hochformat. Der Desktop-Lauf ist keine Zugabe: ein Test, der nur bei
 * 390px misst, kann eine display:none-Regel gar nicht widerlegen."
 *
 * jsdom kann Media Queries STRUKTURELL nicht auswerten — ein Vitest, der „auf
 * 390px ist X unsichtbar" behauptet, geht IMMER durch, weil es im DOM sucht
 * statt einen Browser zu befragen. Diese Datei ist die einzige Stelle, an der
 * die Aussage ueberhaupt entsteht.
 *
 * KEINE UEBERSCHNEIDUNG mit lagerbuch-verwaltung.spec.ts (Teil 5, T150): dort
 * stehen die aria-current-Zusage und die scrollWidth-Zusage DER MODULNAV bei
 * 1280x720 gegen die .modulnav-Reparatur. Hier steht nur, was an MEHREREN
 * Breiten gemessen wird — das DOKUMENT, Tapflaechen/Feldschrift und der
 * Etikettenbogen.
 *
 * Host, Admin-Gruppe und URLs kommen ausschliesslich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — kein Literal wie
 * "http://lagerbuch.localtest.me:3100" oder `["lagerbuch_nutzer"]`.
 *
 * JEDER Test traegt ein POSITIVES Merkmal, das beweist, dass er die RICHTIGE
 * Seite misst und nicht eine 404: Status 200 UND ein Anker, der nur auf der
 * echten Seite existiert. Ohne (oder mit falschem) `groups` bezeugt der Lauf
 * sonst den 404 aus §11.5 Zustand 19 — und eine 404-Seite hat weder Ueberlauf
 * noch zu kleine Tapziele, besteht also jede Zusicherung hier stillschweigend
 * (Ruling A9, `e2e/helpers/lagerbuch.ts` Kopfkommentar). `/verwaltung/etiketten`
 * liegt in der (druck)-Routegruppe und traegt DESHALB KEIN `suite-header`
 * (`lagerbuch-etiketten.spec.ts:115-120`) — der Anker ist dort `lb-basis`.
 */

const BREITEN = [
  { name: "Telefon", width: 390, height: 844 },
  /*
   * DIE MITTE. 834x1112 ist das iPad im Hochformat — der einzige der drei
   * Viewports zwischen dem Suite-Breakpoint (768) und dem Desktop.
   */
  { name: "Tablet hoch", width: 834, height: 1112 },
  /*
   * KEINE ZUGABE. Ein Test, der nur bei 390px misst, kann eine
   * `display:none`-Regel gar nicht widerlegen: dort sagen die richtige und
   * die kaputte Fassung beide „sichtbar".
   */
  { name: "Desktop", width: 1280, height: 720 },
] as const;

/**
 * Die drei Seiten mit dem groessten Ueberlaufrisiko: die breiteste Tabelle
 * (Artikel), die Kachelreihe der Uebersicht und der Etikettenbogen mit seinem
 * festen Millimeterraster. Je Seite ein eigener, echter Anker — antds interne
 * Klassen sind kein Ersatz dafuer (Global Constraints).
 */
const SEITEN: { pfad: string; anker: (page: Page) => Promise<void> }[] = [
  {
    pfad: "/verwaltung/artikel",
    anker: async (page) => {
      await expect(page.getByTestId("suite-header")).toHaveCount(1);
    },
  },
  {
    pfad: "/verwaltung",
    anker: async (page) => {
      await expect(page.getByTestId("suite-header")).toHaveCount(1);
    },
  },
  {
    pfad: "/verwaltung/etiketten",
    anker: async (page) => {
      // (druck)-Routegruppe: KEIN suite-header (lagerbuch-etiketten.spec.ts:119).
      await expect(page.getByTestId("lb-basis")).toBeVisible();
    },
  },
];

/**
 * Alles, was rechts aus dem Sichtfeld ragt — MIT Namen, damit ein Fehlschlag
 * den Verursacher nennt und nicht nur eine Zahl. Lokal in dieser Datei, NICHT
 * in `e2e/helpers/lagerbuch.ts`: A9 legt fest, was diese Datei traegt (Host,
 * Gruppe, Port, URLs, Token-Codes), und ein Layout-Helfer gehoert nicht dazu
 * (Vorbild: `e2e/files-mobil.spec.ts:346-366` haelt ihn ebenfalls lokal).
 */
async function ueberlauf(page: Page) {
  return page.evaluate(() => ({
    vw: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    schuldige: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.right > window.innerWidth + 1 && b.width > 1 && b.height > 1;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const klasse = typeof el.className === "string" ? el.className : "";
        return `${el.tagName}.${klasse.slice(0, 40)} rechts=${Math.round(b.right)}`;
      })
      .slice(0, 5),
  }));
}

for (const b of BREITEN) {
  test.describe(`${b.name} (${b.width}x${b.height})`, () => {
    test.use({ viewport: { width: b.width, height: b.height } });

    test.describe("Waagerechter Ueberlauf", () => {
      for (const seite of SEITEN) {
        test(`${seite.pfad} laeuft nicht ueber`, async ({ page }) => {
          await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

          const antwort = await page.goto(lagerbuchUrl(seite.pfad));
          expect(antwort?.status(), `${seite.pfad}: HTTP`).toBe(200);
          // ERST NACHWEISEN, DASS ES DIE RICHTIGE SEITE IST — sonst misst der
          // Rest hier eine 404, die konstruktionsbedingt nicht ueberlaeuft.
          await seite.anker(page);
          await page.waitForLoadState("networkidle");

          /*
           * Das DOKUMENT darf nicht waagerecht scrollen. Breite Inhalte
           * (Tabellen) duerfen es sehr wohl in ihrem eigenen Container —
           * deshalb wird documentElement gemessen und nicht der Tabellenrumpf.
           * `Table` traegt dafuer scroll={{ x: "max-content" }} (Teil 5, §2).
           */
          const mass = await ueberlauf(page);
          expect(
            mass.doc,
            `${seite.pfad} bei ${b.width}px: ${mass.schuldige.join(" | ")}`,
          ).toBeLessThanOrEqual(mass.vw);
        });
      }
    });

    test.describe("Der Etikettenbogen", () => {
      /**
       * Das Raster ist `repeat(auto-fill, 48.5mm)` — es bricht von selbst um.
       * Der Test belegt, dass die KACHEL ihre Millimeter behaelt: waere sie
       * prozentual, passte der Bogen zwar auf jeden Bildschirm und auf kein
       * Etikettenblatt (`druck.css:49-63`).
       */
      test(`Kachelbreite bleibt bei ${b.width}px in Millimetern`, async ({ page }) => {
        await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

        const antwort = await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
        expect(antwort?.status(), "/verwaltung/etiketten: HTTP").toBe(200);
        await page.waitForLoadState("networkidle");

        // Kein .first() (Global Constraints): .nth(0) greift auf ein Element,
        // dessen Anwesenheit die Zeile darueber im selben Test bereits
        // erzwungen hat (Seed liefert immer mindestens einen Artikel/Token).
        const kachel = page.locator(".lb-etikett").nth(0);
        await expect(kachel).toBeVisible();
        const box = await kachel.boundingBox();
        expect(box, "Kachel hat keinen Kasten").not.toBeNull();
        // 48.5mm bei 96dpi ≈ 183.3px. Toleranz 2px fuer Rundung und Rahmen.
        expect(box!.width, `Kachel bei ${b.width}px`).toBeGreaterThan(181);
        expect(box!.width, `Kachel bei ${b.width}px`).toBeLessThan(186);
      });
    });
  });
}

/**
 * §6.7.3 / §7.7.2: KEIN Eingabeelement unter 16px, und §7.7.2: 44px Tapmass.
 * Gemessen wird NUR bei 390px, weil dort die Finger sind — anders als der
 * Ueberlauf und die Etikettenkachel oben ist das keine Aussage ueber eine
 * verschobene Media Query, sondern ueber Touch-Ergonomie, die es bei 834px
 * und 1280px so nicht gibt.
 */
test.describe("Tapflaechen und Feldschrift bei 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * Der Suite-Riegel `core/theme/feldschrift.test.ts` hat dafuer bekannte
   * Luecken, und ein Quelltext-Scan sieht ohnehin nur Deklarationen, nicht
   * die aufgeloeste Kaskade (Falle 5) — nur ein echter Browser sieht das.
   *
   * ⚠️ EIN BEGRUENDETER AUSSCHLUSS, KEIN STILLER (Betreiberentscheidung,
   * 11.08.2026, zu diesem Task): `.ant-select-input` ist ausgeschlossen, weil
   * es GEMESSEN — nicht angenommen — die Rueckseite einer bereits
   * dokumentierten Entscheidung ist, keine vergessene Stelle.
   *
   * GEMESSEN auf `/verwaltung/artikel` (Sortierungs-Select,
   * `ArtikelTable.tsx:215-225`): das Feld traegt
   * `<input class="ant-select-input" role="combobox" readonly value="">`,
   * `getComputedStyle(...).fontSize` 14px. `e.closest(".ant-select-selector")`
   * ist NULL — es liegt ausserhalb der bestehenden Ausnahme-Regel. Ein Tap auf
   * die Auswahl fokussiert dieses Feld tatsaechlich
   * (`document.activeElement` danach: `INPUT.ant-select-input`), aber `value`
   * bleibt IMMER `""` — es zeigt nie sichtbaren Text.
   *
   * `globals.css:59-69` beantwortet genau das bereits: „antd baut die
   * geschlossene Auswahl aus einem `<div class="ant-select-selector">` — das
   * `input` darin ist unsichtbar und traegt die Schriftgroesse nicht." Die
   * bestehende `:root .ant-select-selector`-Ausnahme zielt bewusst auf den
   * SICHTBAREN Container, nicht auf dieses interne, textlose Proxy-Feld.
   *
   * NICHT BEHOBEN in diesem Task: eine Aenderung an `globals.css` wirkte
   * suiteweit (portal, qr, feedback, files) — eine stille Suite-Entscheidung
   * als Nebenwirkung einer lagerbuch-Spec, die der Plan ausdruecklich
   * ausschliesst („Keine `core`-Datei wird in diesem Plan angefasst"). Der
   * Fund steht als eigener Posten ausserhalb dieses Plans.
   *
   * DER AUSSCHLUSS BLEIBT ENG: nur die Klasse `ant-select-input`, nicht „alle
   * antd-Inputs" — sonst deckte dieser Test die 16px-Zusage fuer die Felder
   * nicht mehr ab, fuer die sie gilt (z. B. das Sortierungs-Select traegt
   * seinen SICHTBAREN Text ueber `.ant-select-selector`, weiterhin gemessen).
   */
  test("kein Eingabefeld unter 16px", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

    const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(antwort?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    // ERST NACHWEISEN, DASS ES ETWAS ZU MESSEN GIBT — sonst erfuellt eine
    // leere Menge „kein Feld unter 16px" muehelos, ohne je etwas zu pruefen
    // (Lehre 3 aus T167/T168: in welchem falschen Zustand waere das gruen?).
    // Die Sortierauswahl (antd Select) traegt ein Eingabefeld ausserhalb
    // jedes Modals — kein Formular oeffnen noetig.
    const felder = page.locator(
      "input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not(.ant-select-input), textarea, select",
    );
    expect(
      await felder.count(),
      "die Seite muss Eingabefelder tragen, sonst misst der Test nichts",
    ).toBeGreaterThan(0);

    const zuKlein = await page.evaluate(() =>
      [...document.querySelectorAll("input, textarea, select")]
        .map((e) => ({
          tag: e.tagName,
          groesse: parseFloat(getComputedStyle(e).fontSize),
          typ: (e as HTMLInputElement).type ?? "",
          cls: typeof e.className === "string" ? e.className : "",
        }))
        // Kontrollkaestchen und Schalter tragen keine Textgroesse.
        .filter((e) => !["checkbox", "radio", "hidden"].includes(e.typ))
        // Begruendeter Ausschluss s. o. — eng auf die eine Klasse, kein
        // pauschaler antd-Ausschluss.
        .filter((e) => !e.cls.split(/\s+/).includes("ant-select-input"))
        .filter((e) => e.groesse < 16),
    );
    expect(zuKlein).toEqual([]);
  });

  /**
   * §7.7.2: 44px Tapmass, gemessen auf einer Verwaltungsseite mit echten
   * Zeilenaktionen. Der Helfer-Zweig traegt seine eigene Zusage in
   * `lagerbuch-helfer.spec.ts`, deshalb steht sie hier nicht ein zweites Mal.
   *
   * KEIN defensiver Uebersprung (Global Constraints): statt unsichtbare
   * Knoepfe per `if (!isVisible()) continue` zu ignorieren, werden alle
   * Knopf-Kaesten in EINEM `page.evaluate` gemessen und Nulldimensionen (nicht
   * gerendert, z. B. eine geschlossene Modal-Aktion) als Datenfilter
   * ausgeschlossen — dieselbe Bauform wie `zuKleineZiele` in
   * `e2e/files-mobil.spec.ts:377-401`. Die Kandidatenzahl wird VORHER separat
   * ueber die Rollen-Locator-API bestaetigt, damit eine leere Fundmenge nicht
   * unbemerkt als „bestanden" durchgeht.
   */
  test("jede Zeilenaktion ist mindestens 44px hoch", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

    const antwort = await page.goto(lagerbuchUrl("/verwaltung/bestellung"));
    expect(antwort?.status(), "/verwaltung/bestellung: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    const knoepfe = page.getByRole("button");
    const n = await knoepfe.count();
    expect(n, "die Seite muss Bedienelemente tragen, sonst misst der Test nichts").toBeGreaterThan(
      0,
    );

    const zuKlein = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((el) => {
          const box = el.getBoundingClientRect();
          const text = (el.getAttribute("aria-label") || el.textContent || el.tagName)
            .trim()
            .slice(0, 30);
          return { text, w: Math.round(box.width), h: Math.round(box.height) };
        })
        // Nulldimensionen sind nicht gerendert (display:none, geschlossenes
        // Modal) — ein „0x0"-Befund waere ein Phantom, kein echter Fund.
        .filter((z) => z.w > 0 && z.h > 0)
        .filter((z) => z.h < 44)
        .map((z) => `${z.text} ${z.w}x${z.h}`),
    );
    expect(zuKlein, "Knoepfe unter 44px Hoehe").toEqual([]);
  });
});

test.describe("Der lange Artikelname bei 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * DIE ZEILE, DIE DEN SCHRUMPFENDEN QR FAENGT (§8.4, 8-I Punkt 2).
   *
   * `.lb-etikett` ist ein Flex-Container. Saesse `flex: none` am SVG statt am
   * Umschlag `.lb-etikettQr`, koennte der Umschlag schrumpfen — und ein
   * LANGER Artikelname draengte den Code unter 20mm. Genauso, wenn
   * `text-overflow: ellipsis` wirkungslos ist, weil die Textknoten inline
   * geblieben sind: dann gibt es nichts zu kuerzen, und der Text nimmt sich
   * den Platz.
   *
   * Beides ist am Bildschirm nur an EINER Zahl zu sehen, und §8.4 sagt es
   * woertlich: „wird winzig, OHNE dass ein Test anschlaegt". Dieser Test ist
   * der Anschlag.
   *
   * ⚠️ DER SEED MUSS EINEN BEWUSST LANGEN ARTIKELNAMEN LIEFERN (Ruling A10):
   * `e2e/seed-lagerbuch.ts` traegt seit diesem Task „E2E Check Kompressen
   * steril 10x10cm" (35 Zeichen) statt der frueheren 20. Die Grenze unten
   * bleibt bei 28 — sie wird NICHT abgesenkt, das machte die Zeile zum No-op.
   *
   * Der lange Name wird ueber EIGENE ITERATION der Kacheln gefunden statt
   * ueber parallele Index-Listen (drei getrennte `.allTextContents()`-Arrays
   * koennten bei einer strukturellen Aenderung der Kachel auseinanderlaufen):
   * die Kachel mit dem laengsten Titel wird direkt aus `.lb-etikett` selbst
   * bestimmt, und QR/Titel/Unterzeile werden INNERHALB dieser einen Kachel
   * gemessen.
   */
  test("der QR behaelt 20mm auch bei einem langen Artikelnamen", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

    const antwort = await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    expect(antwort?.status(), "/verwaltung/etiketten: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    const kacheln = page.locator(".lb-etikett");
    const n = await kacheln.count();
    expect(n, "der Seed muss mindestens ein Etikett liefern").toBeGreaterThan(0);

    let langIndex = -1;
    let laengster = "";
    for (let i = 0; i < n; i += 1) {
      const titel = (await kacheln.nth(i).locator(".lb-etikettTitel").textContent()) ?? "";
      if (titel.length > laengster.length) {
        laengster = titel;
        langIndex = i;
      }
    }
    expect(laengster.length, "der Seed braucht einen Artikelnamen ueber 28 Zeichen").toBeGreaterThan(
      28,
    );
    const kachel = kacheln.nth(langIndex);

    const qr = kachel.locator(".lb-etikettQr > svg");
    const qrBox = await qr.boundingBox();
    expect(qrBox, "QR-SVG hat keinen Kasten").not.toBeNull();
    // 20mm bei 96dpi ≈ 75.6px. Toleranz nach unten 2px.
    expect(qrBox!.width, "QR-Breite").toBeGreaterThan(74);
    expect(qrBox!.height, "QR-Hoehe").toBeGreaterThan(74);

    /**
     * Und die zweite Haelfte derselben Ursache: Titel und Unterzeile stehen
     * UNTEREINANDER. Blieben sie inline, saessen sie nebeneinander — und
     * text-overflow:ellipsis waere wirkungslos.
     */
    const titelBox = await kachel.locator(".lb-etikettTitel").boundingBox();
    const subBox = await kachel.locator(".lb-etikettSub").boundingBox();
    expect(titelBox, "Titel hat keinen Kasten").not.toBeNull();
    expect(subBox, "Unterzeile hat keinen Kasten").not.toBeNull();
    expect(subBox!.y, "Unterzeile steht unter dem Titel").toBeGreaterThanOrEqual(
      titelBox!.y + titelBox!.height - 1,
    );
  });
});
