import { expect, test } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * Browserverträge der Modulnavigation, die jsdom nicht beobachten kann.
 *
 * FIX-RUNDE 1 (2026-08-13): von `modulnav` auf `modulleiste` umgezogen. Seit
 * Task 3 dieses Plans (`496de16`) vergibt `LAGERBUCH_NAV` `abschnitt`-Felder,
 * `SuiteHeader.tsx` rendert die zweite Kopfzeile (`modulnav`) deshalb für
 * dieses Modul nicht mehr — die Navigation steht seitdem als Seitenleiste
 * (`modulleiste`) im `Sider` von `FullShell`. Die Zusagen selbst gelten
 * unverändert weiter, nur ihre Gestalt hat gewechselt: von einer waagerechten
 * Zeile zu einer senkrechten Leiste. Zwei Tests wechseln deshalb die Achse
 * (Breiten- zu Höhenüberlauf), einer bekommt zusätzlich eine
 * Nicht-Vakuitäts-Reparatur.
 */
test.describe("lagerbuch — Modulnavigation", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("markiert genau einen Eintrag auf /verwaltung/artikel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const markiert = page.getByTestId("modulleiste").locator("a[aria-current]");
    await expect(markiert).toHaveCount(1);
    await expect(markiert).toHaveText("Artikel");
  });

  test("markiert die Übersicht auf /verwaltung", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung"));
    const markiert = page.getByTestId("modulleiste").locator("a[aria-current]");
    await expect(markiert).toHaveCount(1);
    await expect(markiert).toHaveText("Übersicht");
  });

  test("markiert auf einer Detailseite gar nichts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/geraete"));
    const leiste = page.getByTestId("modulleiste");
    // Gegenprobe vor der Null (Fix-Runde 1): die Leiste trägt hier
    // tatsächlich einen Link — sonst bewiese die Null unten (kein
    // aria-current) auch bei einem verunglückten data-testid nichts.
    await expect(leiste.getByRole("link", { name: "Geräte" })).toBeVisible();

    await page.getByRole("link", { name: "E2E Spineboard" }).click();
    /*
     * EIGENES ZEITBUDGET, und der Grund steht in `playwright.config.ts` an
     * `retries`: `next dev` übersetzt die Zielroute beim ERSTEN Aufruf. Der
     * Test hat dafür 90 s, diese Zusicherung aber nur Playwrights Vorgabe von
     * 5 s — unter Last läuft sie ab, während die Navigation noch arbeitet, und
     * pollt so lange die alte Adresse. Genau dieser Fall wurde am 12.08.2026
     * gemessen (13 Pollversuche, unveränderter Rerun grün).
     *
     * Die Zahl deckt die Übersetzung ab und bleibt deutlich unter dem
     * Test-Timeout: ein echter Navigationsfehler fällt weiterhin auf, nur eben
     * nach 30 s statt nach 5.
     */
    await expect(page).toHaveURL(/\/verwaltung\/geraete\/[^/]+$/, { timeout: 30_000 });
    await expect(leiste.locator("a[aria-current]")).toHaveCount(0);
    /*
     * DAS LANDMARK HEISST „Zurück", NICHT MEHR „Brotkrume" (Fix-Runde 2,
     * 2026-08-14) — und das ist die einzige Änderung an dieser Zusicherung.
     *
     * GEMESSEN, nicht erschlossen: Playwrights `ariaSnapshot` dieser Seite
     * (`test-results/…/error-context.md` des roten Laufs) zeigt unter `main`
     * genau einen Rückweg, und zwar
     *   `navigation "Zurück"` → `link "Geräte"` → `/url: /verwaltung/geraete`.
     * Das Landmark ist also weder verschwunden noch namenlos geworden; es
     * heißt anders.
     *
     * Der Grund steht ausgeschrieben in `core/shell/Seitenkopf.tsx`: die
     * Detailseiten sind vom modul-eigenen `lagerbuch/_ui/Brotkrume.tsx` auf den
     * gemeinsamen `Seitenkopf` umgestellt, und der benennt sein Landmark
     * bewusst „Zurück" — beide Fassungen rendern genau EINEN Link, „Brotkrume"
     * wäre für eine einstufige Rückkehr der falsche Name. Die Zusage dieser
     * Zeile („die Detailseite ist keine Sackgasse, der Weg zurück ist ein
     * benanntes Sprungziel") gilt unverändert.
     *
     * ZWEITE ZEILE STATT NUR UMBENENNUNG: `toBeVisible()` allein beweist nur,
     * dass IRGENDEIN so benanntes Landmark da ist. Erst das Ziel darin macht
     * daraus die Aussage, die der Test führen will — zurück zur Liste, von der
     * dieser Test hergekommen ist.
     */
    const rueckweg = page.getByRole("navigation", { name: "Zurück" });
    await expect(rueckweg).toBeVisible();
    await expect(rueckweg.getByRole("link", { name: "Geräte" })).toHaveAttribute(
      "href",
      "/verwaltung/geraete",
    );
  });

  test("fünfzehn Einträge in der Leiste schieben die Seite nicht seitwärts — sie fängt ihren Überlauf senkrecht ab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const leiste = page.getByTestId("modulleiste");
    await expect(leiste).toBeVisible();
    await expect(leiste.locator("a")).toHaveCount(15);

    const masse = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(masse.scroll).toBe(masse.client);

    /*
     * ACHSENWECHSEL (Fix-Runde 1). Die fünfzehn Einträge standen bis Task 3
     * als waagerechte Zeile (`modulnav`) und brachen die Seite seitwärts um,
     * wenn sie nicht in sich selbst überliefen — der alte Test maß das bei
     * 1280px (passt) und 900px (überläuft) auf der Breitenachse. Als
     * Seitenleiste ist die Zusage dieselbe — die Navigation bringt die Seite
     * nicht zum Scrollen —, nur der Container fängt seinen Überlauf jetzt
     * senkrecht ab (`.sider` in `shell.module.css`: `block-size:
     * calc(100vh - 64px)`, `overflow-y: auto`).
     *
     * GEMESSEN, nicht angenommen: zwanzig Zeilen (fünfzehn 56px-Links plus
     * fünf Überschriften, siehe `nav.ts`) ergeben eine Inhaltshöhe von
     * 1116px (`aside.scrollHeight`, in einem Wegwerf-Testlauf gemessen).
     * Das überschreitet `100vh - 64px` schon bei 800px Viewporthöhe
     * (736px Innenraum) — der Überlauf steht bei jeder realistischen
     * Desktop-Höhe, nicht erst ab einer knappen Grenze. 900px Breite bleibt
     * trotzdem der richtige zweite Messpunkt: dieselbe Breite wie im alten
     * Test, als Gegenprobe gegen eine breitenabhängige Regression.
     */
    await page.setViewportSize({ width: 900, height: 720 });
    await expect(leiste).toBeVisible();
    const ueberlaeuft = await leiste.evaluate((element) => {
      const aside = element.closest("aside")!;
      return aside.scrollHeight > aside.clientHeight;
    });
    expect(ueberlaeuft).toBe(true);
    const lastMasse = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(lastMasse.scroll).toBe(lastMasse.client);
  });

  test("der Container scrollt beim Fokussieren zum letzten Link", async ({ page }) => {
    /*
     * ACHSENWECHSEL (Fix-Runde 1). Dieselbe Breite wie im alten Test
     * (900x720, Desktop, die Leiste ist sichtbar), aber tragend ist jetzt die
     * Höhe: bei 720px Viewporthöhe überläuft die Leiste senkrecht (gemessen
     * im vorigen Test: 1116px Inhalt gegen 656px Innenraum bei dieser
     * Fenstergröße), nicht mehr waagerecht.
     */
    await page.setViewportSize({ width: 900, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung"));
    const nav = page.getByTestId("modulleiste");
    const ueberlaeuft = await nav.evaluate((element) => {
      const aside = element.closest("aside")!;
      return aside.scrollHeight > aside.clientHeight;
    });
    expect(ueberlaeuft).toBe(true);
    const letzter = nav.getByRole("link", { name: "Import" });
    await letzter.focus();
    await expect(letzter).toBeFocused();
    const scrollTop = await nav.evaluate((element) => element.closest("aside")!.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
  });

  test("bei 390px ist die Leiste unsichtbar und die Ziele stehen im Drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const leiste = page.getByTestId("modulleiste");
    /*
     * NICHT-VAKUÄRE GEGENPROBE (Fix-Runde 1). `toBeHidden()` ist in
     * Playwright auch dann wahr, wenn der Knoten gar nicht existiert. Im
     * Code nachgesehen (`SuiteRahmen.tsx`, `shell.module.css`): der `Sider`
     * wird unabhängig von der Fensterbreite gerendert (er steht immer da,
     * wenn `nav.length > 0` ist — nicht erst ab einer bestimmten Größe) —
     * nur `.sider` trägt `display: none` unterhalb von 768px. Die Leiste
     * steht also im DOM und wird ausschließlich per CSS unsichtbar gemacht.
     * `toHaveCount(1)` davor beweist das, bevor `toBeHidden()` etwas über die
     * Sichtbarkeit sagt.
     */
    await expect(leiste).toHaveCount(1);
    await expect(leiste).toBeHidden();
    await page.getByTestId("menue-knopf").click();
    await expect(
      page.getByTestId("suite-drawer").getByRole("link", { name: "Journal" }),
    ).toBeVisible();
  });
});

/**
 * NACHFOLGER von `lagerbuch/e2e/suche-filter.spec.ts:20-33` (§12.1 Punkt 3).
 * jsdom kann diese Zusicherung strukturell nicht halten: `JournalFilter.test.tsx`
 * (Teil 5, T147) mockt `next/navigation` und prueft nur den Aufruf von
 * `router.replace` — dass der ECHTE Browser die Adresszeile danach tatsaechlich
 * traegt, beweist ausschliesslich ein Playwright-Lauf (§12.5-Tabelle: „Die
 * literale URL-Zusicherung `?q=Verband` bleibt — sie ist der einzige Beleg fuer
 * den URL-Vertrag"). T174-Befund: dieser Nachfolger fehlte bislang komplett.
 */
test.describe("lagerbuch — Journalsuche schreibt die literale URL (§12.1 Punkt 3)", () => {
  test("Debounce schreibt den Suchbegriff als ?q=… in die Adresse", async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/journal",
    });
    await page.getByRole("searchbox", { name: "Suche" }).fill("Verband");
    // Debounced (300ms, JournalFilter.tsx:44-52) → die URL bekommt den q-Parameter.
    await expect(page).toHaveURL(/[?&]q=Verband/);
  });
});

/**
 * §11.5 Zustand 27, ECHT gerendert (T176a1).
 *
 * ⚠️ WARUM DAS HIER STEHEN MUSS UND NICHT IN VITEST GENUEGT. Die Check-
 * Detailseite ist eine **Server Component ohne Insel**. `pnpm build`,
 * `typecheck` und Vitest sehen genau die Fehler dort strukturell NICHT, die die
 * Seite umbringen: ein Compound-Zugriff auf antd oder ein Import aus dem
 * antd-Icon-Paket ergibt HTTP 500, und zwar schon beim Import, nicht beim
 * Rendern. Ein gruener Vitest-Lauf ueber `checkDetailInhalt()` beweist die
 * Auswahl des Zustands, nicht die Auslieferung der Seite.
 *
 * ⚠️ BEIDE Faelle stehen hier mit Absicht: der lesbare Check ist die Gegenprobe.
 * Ohne ihn belegte der Lauf nur „irgendetwas warnt", nicht „es warnt GENAU
 * dann". Ein Check mit 0 Positionen darf keine Warnung bekommen — das ist die
 * Unterscheidung, an der der ganze Zustand haengt.
 *
 * Die Datensaetze kommen aus `seed-lagerbuch.ts` (`checkFixtures`).
 */
test.describe("lagerbuch — Check-Detail benennt ein unlesbares Ergebnis (§11.5, 27)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("ein unlesbares ergebnis wird benannt — als Warnung, nie als Fehler", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/checks/e2e-check-unlesbar"));

    // Erst der Status: ein 500 aus einer RSC-Falle wuerde sonst als „Text nicht
    // gefunden" durchgehen und wie ein Textfehler aussehen.
    expect(antwort?.status(), "die Seite muss ausliefern, nicht in eine RSC-Falle laufen").toBe(200);
    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);

    const meldung = page.locator(".ant-alert").filter({ hasText: "Ergebnis unlesbar" });
    await expect(meldung).toHaveCount(1);
    // ⚠️ `colorError === colorPrimary === #c8000f` (§6.6.5): ein roter Alert saehe
    // aus wie eine Primaeraktion. Die Klasse ist der einzige Beleg, der die
    // GERENDERTE Fassung prueft und nicht das Prop.
    await expect(meldung).toHaveClass(/ant-alert-warning/);
    await expect(meldung).not.toHaveClass(/ant-alert-error/);
  });

  test("ein legitim LEERER Check bekommt KEINE solche Warnung", async ({ page }) => {
    /**
     * ⚠️ DIE HAELFTE, DIE ZAEHLT. `e2e-check-leer` trägt ein gültiges, aber
     * leeres V2-Ergebnis — der Check hatte wirklich 0 Positionen. Genau dieser
     * Fall war vorher von „kaputt" nicht unterscheidbar; eine Warnung hier wäre
     * schlimmer als gar keine, weil sie dann auf jedem leeren Check stünde.
     */
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/checks/e2e-check-leer"));

    expect(antwort?.status()).toBe(200);
    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);
    await expect(page.getByText("Ergebnis unlesbar")).toHaveCount(0);
    // Die leeren Tabellen sagen weiter, was sie sagen dürfen — hier stimmt es ja.
    await expect(page.getByText("Keine Geräte in diesem Check.")).toBeVisible();
  });

  test("ein gefüllter lesbarer Check bekommt KEINE solche Warnung", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/checks/e2e-check-lesbar"));

    expect(antwort?.status()).toBe(200);
    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);
    // Die Seite ist da (der Abgleich des geseedeten Artikels steht drin) …
    await expect(page.getByText("E2E Check Kompressen steril 10x10cm").first()).toBeVisible();
    // … und sagt nichts von unlesbar.
    await expect(page.getByText("Ergebnis unlesbar")).toHaveCount(0);
  });

  test("die Übersicht kennzeichnet die Zeile, statt eine ruhige 0 zu zeigen", async ({ page }) => {
    // §11.5:10332 spricht von der ZEILE. `/verwaltung/checks` ist die Fläche, auf
    // der jemand nach Auffälligkeiten sucht — dort ist die 0 das Irreführende.
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/checks"));

    expect(antwort?.status()).toBe(200);
    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);

    // GENAU EINE Zeile trägt das Wort — der kaputte Datensatz. Die Zahl ist
    // bewusst nicht an die Gesamtzahl der Zeilen gekoppelt: läuft der
    // Helfer-Spec vorher, steht hier eine weitere (gültige) Check-Zeile.
    await expect(page.getByRole("row").filter({ hasText: "unlesbar" })).toHaveCount(1);

    /*
     * DIE GEGENPROBE AUF DERSELBEN FLÄCHE — an einer BENANNTEN lesbaren Zeile,
     * nicht am Wort „vollständig".
     *
     * ⚠️ Warum nicht „vollständig": die KAPUTTE Zeile trägt es mit. Bei
     * zerstörtem `ergebnis` sind alle Zähler 0, `ergebnisChips` pusht deshalb
     * keinen einzigen Chip und schiebt am Ende den Vollständig-Chip nach
     * (`checks/page.tsx`). Dieselbe Zeile sagt also „unlesbar" in der
     * Positionen-Spalte und grün „vollständig" in der Ergebnis-Spalte. Die
     * frühere Fassung wäre damit auch dann grün gewesen, wenn
     * `e2e-check-unlesbar` die EINZIGE Zeile der Tabelle wäre — genau das, was
     * ihr eigener Kommentar ausschließen wollte. Sie war vakuös.
     *
     * Der Link trägt `detailHref = /verwaltung/checks/<id>` und ist damit der
     * einzige Anker, der eine BESTIMMTE Zeile trifft: der Fahrzeugname taugt
     * nicht (alle drei Seed-Checks hängen an `e2e-fahrzeug`), die Zeitspalte
     * ebenso wenig.
     *
     * ⚠️ Der grüne Chip auf der kaputten Zeile ist ein VORBESTEHENDER Befund und
     * wird hier bewusst nicht mitrepariert — Chip und offener Check gehören
     * zusammen geplant (DRK-196, Runbook §14).
     */
    const lesbar = page
      .getByRole("row")
      .filter({ has: page.locator('a[href$="/verwaltung/checks/e2e-check-lesbar"]') });
    await expect(lesbar).toHaveCount(1);
    await expect(lesbar).not.toContainText("unlesbar");
  });
});
