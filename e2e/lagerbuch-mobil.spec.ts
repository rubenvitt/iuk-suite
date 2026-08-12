import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  E2E_TOKEN_HELFER,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

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
 *
 * ⚠️ REVIEW-FIX (Befund 1, 11.08.2026): `suite-header` sitzt auf SHELL-Ebene
 * und existiert auf JEDER Arbeitsseite des Moduls — er unterscheidet nicht
 * zwischen `/verwaltung/artikel` und `/verwaltung`. Ein stiller Redirect
 * (Route-Kollaps auf `/verwaltung`) bestand die alte Fassung dieses Tests
 * unbemerkt: HTTP 200, `suite-header` da, Dashboard laeuft nicht ueber — genau
 * der Fehlerzustand, den der Anker ausschliessen soll (Falle 3: „in welchem
 * falschen Zustand waere die Zusicherung auch gruen?"). Jetzt seitenspezifisch:
 * `lb-excel` (nur auf der Artikeltabelle, `ArtikelTable.tsx:235`) und ein
 * Textanker fuer `/verwaltung` (dort existiert kein Testid — keins in einer
 * Produktionsdatei ergaenzt, das waere ausserhalb des Testumfangs).
 */
const SEITEN: { pfad: string; anker: (page: Page) => Promise<void> }[] = [
  {
    pfad: "/verwaltung/artikel",
    anker: async (page) => {
      await expect(page.getByTestId("lb-excel")).toBeVisible();
    },
  },
  {
    pfad: "/verwaltung",
    anker: async (page) => {
      // Kein Testid auf dieser Seite (page.tsx:127) — Textanker statt neuem
      // data-testid in Produktionscode.
      await expect(page.getByText("Kritische Artikel", { exact: true })).toBeVisible();
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
   * `getComputedStyle(...).fontSize` 14px. Ein Tap auf die Auswahl fokussiert
   * dieses Feld tatsaechlich (`document.activeElement` danach:
   * `INPUT.ant-select-input`), aber `value` bleibt IMMER `""` — es zeigt nie
   * sichtbaren Text.
   *
   * ⚠️ REVIEW-FIX (Befund 3, 11.08.2026): der urspruengliche Kommentar zitierte
   * `globals.css:59-69` (die Ausnahme fuer `.ant-select-selector`) als
   * Erklaerung. Diese Klasse wird von antd 6.5.3 / `@rc-component/select@1.8.2`
   * gar nicht mehr gerendert — die Regel bewacht seit dem antd-Upgrade nichts
   * mehr (eigener ClickUp-Fund, s. u.). Die tatsaechliche Quelle der 14px ist
   * `antd/es/select/style/select-input.js:206-225`:
   * `[${componentCls}-input]: { ...fontSize: 'inherit'... }` — das Feld erbt
   * die Schriftgroesse von seinem antd-Vorfahren, der sie auf `token.fontSize`
   * (= 14) setzt. Kein `.ant-select-selector` im Spiel, und ein
   * `div`/`span`-Container laege ohnehin nie in der Menge `input, textarea,
   * select`, die dieser Test misst.
   *
   * NICHT BEHOBEN in diesem Task: eine Aenderung an `globals.css` wirkte
   * suiteweit (portal, qr, feedback, files) — eine stille Suite-Entscheidung
   * als Nebenwirkung einer lagerbuch-Spec, die der Plan ausdruecklich
   * ausschliesst („Keine `core`-Datei wird in diesem Plan angefasst"). Der
   * Fund steht als eigener Posten ausserhalb dieses Plans.
   *
   * DER AUSSCHLUSS BLEIBT ENG: nur die Klasse `ant-select-input`, nicht „alle
   * antd-Inputs" — sonst deckte dieser Test die 16px-Zusage fuer die Felder
   * nicht mehr ab, fuer die sie gilt. `Suchfeld` (`_ui/Suchfeld.tsx`, ein
   * echtes antd `Input type="search"` mit sichtbarem Text) bleibt Teil der
   * gemessenen Menge — genau dieser Fall belegt unten, dass die Kandidatenzahl
   * nicht nur aus dem ausgeschlossenen Select-Proxy besteht.
   */
  test("kein Eingabefeld unter 16px", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

    const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(antwort?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    // Seitenspezifisches Merkmal (Review-Fix Befund 2): Status 200 + „hat
    // Eingabefelder" gilt auch auf der Login-Seite und praktisch jeder
    // Suite-Seite. `lb-excel` existiert nur auf der Artikeltabelle.
    await expect(page.getByTestId("lb-excel")).toBeVisible();
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
   * Bedienelemente per `if (!isVisible()) continue` zu ignorieren, werden alle
   * Kaesten in EINEM `page.evaluate` gemessen und Nulldimensionen (nicht
   * gerendert, z. B. eine geschlossene Modal-Aktion) als Datenfilter
   * ausgeschlossen — dieselbe Bauform wie `zuKleineZiele` in
   * `e2e/files-mobil.spec.ts`. Die Kandidatenzahl wird VORHER separat
   * bestaetigt, damit eine leere Fundmenge nicht unbemerkt als „bestanden"
   * durchgeht — ueber DENSELBEN Elementselektor wie die Messung selbst
   * (Review-Fix Minor: `getByRole("button")` und `querySelectorAll("button")`
   * sind keine deckungsgleichen Mengen, `a role="button"` zaehlte sonst mit,
   * ohne je gemessen zu werden).
   *
   * ⚠️ DIE MESSUNG WAR ENGER ALS DIE ZUSAGE, DIE SIE TRAGEN SOLL. Sie las nur
   * `button` und nur die HOEHE; das im Docstring genannte Vorbild liest
   * `a[href], button, input, textarea, select` und BEIDE Kanten. Durch fielen
   * damit (a) jeder Knopf, der 44 px hoch, aber schmaler ist — also genau die
   * Icon-only-Zeilenaktion, fuer die §7.7.2 existiert (`BestellListe.tsx`
   * rendert eine als `<Button shape="circle">`) — und (b) jede `<a>`-Aktion und
   * jeder Modulnav-Link, die auf `/verwaltung/bestellung` mitrendern. §7.7.2
   * spricht vom Tapmass, also von der FLAECHE. Die Luecke war still: sie sah aus
   * wie Deckung.
   *
   * ⚠️ Der Radio-/Checkbox-Sonderfall des Vorbilds wird MITUEBERNOMMEN, nicht
   * weggelassen: dort wird bewusst das umschliessende `<label>` gemessen und
   * nicht der 22px-UA-Knopf („das ganze Label ist das Ziel"). Wer stur den
   * `<input>` misst, meldet Fehlschlaege, die keine sind, und repariert am Ende
   * eine richtige Entscheidung weg.
   */
  test("jede Zeilenaktion ist mindestens 44 x 44 px", async ({ page }) => {
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });

    const antwort = await page.goto(lagerbuchUrl("/verwaltung/bestellung"));
    expect(antwort?.status(), "/verwaltung/bestellung: HTTP").toBe(200);
    // Seitenspezifisches Merkmal (Review-Fix Befund 2): Status 200 + „hat
    // Knoepfe" gilt auf praktisch jeder Suite-Seite. `lb-kopieren` existiert
    // nur auf der Bestellliste (`BestellListe.tsx:213`).
    await expect(page.getByTestId("lb-kopieren")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // ⚠️ Vorbedingung und Messung lesen DIESELBE Menge — sonst bestaetigt die
    // Vorbedingung Kandidaten, die nie gemessen werden (und umgekehrt).
    const ZIELE = "a[href], button, input, textarea, select";
    const kandidaten = page.locator(ZIELE);
    const n = await kandidaten.count();
    expect(n, "die Seite muss Bedienelemente tragen, sonst misst der Test nichts").toBeGreaterThan(
      0,
    );

    const zuKlein = await page.evaluate((ziele) =>
      [...document.querySelectorAll(ziele)]
        .map((el) => {
          // Bei Radio/Checkbox ist das umschliessende `<label>` das Tapziel,
          // nicht der 22px-UA-Knopf — 1:1 aus `files-mobil.spec.ts`.
          const typ = el.getAttribute("type");
          const ziel = typ === "radio" || typ === "checkbox" ? (el.closest("label") ?? el) : el;
          const box = ziel.getBoundingClientRect();
          const text = (
            el.getAttribute("aria-label") ||
            el.textContent ||
            ziel.textContent ||
            el.id ||
            el.tagName
          )
            .trim()
            .slice(0, 30);
          return { text, w: Math.round(box.width), h: Math.round(box.height) };
        })
        // Nulldimensionen sind nicht gerendert (display:none, geschlossenes
        // Modal) — ein „0x0"-Befund waere ein Phantom, kein echter Fund.
        .filter((z) => (z.w > 0 || z.h > 0) && (z.w < 44 || z.h < 44))
        .map((z) => `${z.text} ${z.w}x${z.h}`),
      ZIELE,
    );
    expect(zuKlein, "Bedienelemente unter 44 x 44 px").toEqual([]);
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

/**
 * DER HELFER-ZWEIG BEI DREI BREITEN (12.08.2026, Betreiberentscheidung 14).
 *
 * ⚠️ WARUM ER BISHER FEHLTE UND WARUM DAS JETZT NICHT MEHR TRAGBAR IST: der
 * Ueberlauftest oben deckt drei VERWALTUNGSseiten ab. Solange der Helfer-Weg
 * auf 560px gekappt war, konnte er konstruktionsbedingt nicht ueberlaufen —
 * die Luecke war ungefaehrlich. Mit der zweiten Fassung ab 768px ist sie es
 * nicht mehr: `.fachraster` und `.karteRaster` erzeugen echte Rasterbreiten.
 *
 * KEIN devLogin. Der Helfer-Zweig kennt keine Anmeldung, sondern eine
 * Token-Sitzung: `/t/<code>` loest den Code ein und setzt das Sitzungscookie.
 * Ein `devLogin` hier fuehrte auf die Verwaltung und bezeugte die falsche
 * Seite — derselbe Fehlerzustand, gegen den Ruling A9 die Anker oben verlangt.
 *
 * ⚠️ ABWEICHUNG VON DER PLANVORLAGE (Task 7): der Brief-Entwurf zitierte Token
 * `100-100` und Fahrzeug `fz-rtw-1` aus `_lib/seedLokal.ts` — das ist der
 * LOKALE Dev-Seed (`pnpm seed:lokal`), nicht die Daten, die
 * `e2e/seed-lagerbuch.ts` fuer den Playwright-`webServer` anlegt. Dort heisst
 * der Helfer-Code `E2E_TOKEN_HELFER` ("111-111", `e2e/helpers/lagerbuch.ts`)
 * und das einzige Check-Fahrzeug `e2e-fahrzeug` ("E2E RTW",
 * `e2e/seed-lagerbuch.ts:170`) — 1:1 aus dem bestehenden
 * `lagerbuch-helfer.spec.ts:418-420`. Mit den Brief-Literalen liefe dieser
 * Block gegen einen 404/leeren Zugang, nicht gegen den Helfer-Zweig.
 */
test.describe("Der Helfer-Zweig laeuft bei keiner Breite ueber", () => {
  const HELFER_SEITEN: { pfad: string; anker: (page: Page) => Promise<void> }[] = [
    {
      pfad: "/helfer",
      anker: async (page) => {
        await expect(page.getByTestId("lb-tableiste")).toBeVisible();
        await expect(page.getByText("Artikel wählen", { exact: true })).toBeVisible();
      },
    },
    {
      pfad: "/helfer/check?fz=e2e-fahrzeug",
      anker: async (page) => {
        await expect(page.getByTestId("lb-tableiste")).toBeVisible();
        // Der Zaehlbildschirm, nicht die Fahrzeugwahl — nur er traegt das Raster.
        await expect(page.locator("[data-rolle='zaehlliste']")).toBeVisible();
      },
    },
  ];

  for (const b of BREITEN) {
    test.describe(`${b.name} (${b.width}x${b.height})`, () => {
      test.use({ viewport: { width: b.width, height: b.height } });

      for (const seite of HELFER_SEITEN) {
        test(`${seite.pfad} laeuft nicht ueber`, async ({ page }) => {
          // E2E_TOKEN_HELFER = "111-111" (`e2e/helpers/lagerbuch.ts`), die
          // EINE Quelle fuer die Token-Codes in dieser Suite (Ruling A9).
          const einloesen = await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
          expect(einloesen?.status(), `/t/${E2E_TOKEN_HELFER}: HTTP`).toBe(200);

          const antwort = await page.goto(lagerbuchUrl(seite.pfad));
          expect(antwort?.status(), `${seite.pfad}: HTTP`).toBe(200);
          await seite.anker(page);
          await page.waitForLoadState("networkidle");

          const mass = await ueberlauf(page);
          expect(
            mass.doc,
            `${seite.pfad} bei ${b.width}px: ${mass.schuldige.join(" | ")}`,
          ).toBeLessThanOrEqual(mass.vw);
        });
      }
    });
  }

  /**
   * DIE REITERLEISTE WECHSELT DIE SEITE — die eine Zusage, die ein
   * Quelltext-Scan nicht besitzen kann. `bauform.test.ts` sieht `order: -1`
   * als Deklaration; ob die Leiste dadurch tatsaechlich ueber dem Inhalt
   * landet, sieht nur ein Browser (Falle 5: die Regel steht richtig da und
   * greift nur nicht).
   */
  test("Reiterleiste steht bei 390px unten und bei 1280px oben", async ({ page }) => {
    const kante = async () => {
      const leiste = await page.getByTestId("lb-tableiste").boundingBox();
      const inhalt = await page.locator("main").boundingBox();
      expect(leiste, "Reiterleiste hat keinen Kasten").not.toBeNull();
      expect(inhalt, "Inhaltsbereich hat keinen Kasten").not.toBeNull();
      return { leiste: leiste!, inhalt: inhalt! };
    };

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.goto(lagerbuchUrl("/helfer"));
    await expect(page.getByTestId("lb-tableiste")).toBeVisible();
    const schmal = await kante();
    expect(schmal.leiste.y, "bei 390px gehoert die Leiste unter den Inhalt")
      .toBeGreaterThan(schmal.inhalt.y);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByTestId("lb-tableiste")).toBeVisible();
    const breit = await kante();
    expect(breit.leiste.y, "bei 1280px gehoert die Leiste ueber den Inhalt")
      .toBeLessThan(breit.inhalt.y);
  });
});
