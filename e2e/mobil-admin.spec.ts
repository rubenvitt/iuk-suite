import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { TAP_XL } from "@/core/theme/tokens";

/**
 * DER MOBILE DURCHGANG DURCH DIE ADMIN-ARBEITSSEITEN (Teilprojekt C).
 *
 * Der einzige Ort, der Media Queries und Kaskade wirklich auswertet. Was die
 * Quelltext-Scans festhalten (`tabellen.test.ts`, `feedback-css.test.ts`,
 * `groessen.test.ts`), ist die REGEL; hier steht das ERGEBNIS.
 *
 * DREI VIEWPORTS, UND JEDER BESITZT ETWAS, DAS DIE ANDEREN NICHT SEHEN:
 *
 *   390x844  — das Telefon. Hier sitzen die fuenf gemessenen Seitwaerts-Scrolls.
 *   700x900  — das Tablet zwischen den alten 600px des Moduls und den 768px der
 *              Suite. Bei 390px sind Vorher und Nachher identisch; nur dieser
 *              Lauf kann die Vereinheitlichung ueberhaupt beweisen.
 *   1280x800 — „man sieht es auf dem Desktop NICHT". Keine Zugabe: ein Test,
 *              der nur bei 390px misst, kann eine display-Regel gar nicht
 *              widerlegen, und ein `scroll.x` koennte auf dem Desktop die
 *              Spaltenverteilung aendern, ohne dass irgendwo etwas ueberlaeuft.
 *
 * KEIN LAUF BEI 768 ODER 900, und das ist eine Entscheidung, kein Versehen —
 * aber NICHT aus dem Grund, den der Plan dafuer nennt. Der Plan (Spec §5.4)
 * begruendet die Luecke mit einem Kopfzeilendefekt in diesem Band (Modultitel
 * 0px breit, Modulnavigation auszerhalb des Sichtfelds, Mindestbreite 904px)
 * und haelt einen Test dort fuer „von Anfang an rot". Das stimmt nicht mehr:
 * der Befund ist mit `d980631` („Modulnavigation in die zweite Zeile, Titel
 * zurueck in den Kopf") behoben und wird seither von
 * `e2e/shell-mobil.spec.ts:142` bei 768, 820 UND 900 gehalten — im selben Lauf
 * wie diese Datei gemessen: `scrollWidth == innerWidth` und sichtbare
 * Titelbreite 68px an allen drei Breiten.
 *
 * Der Grund, der bleibt, ist ein anderer und gehoert zur Aufteilung: das Band
 * 768–903 ist eine Zusage der SHELL, und die besitzt `shell-mobil.spec.ts`.
 * Fuer die Zusagen, die DIESE Datei traegt, deckt 1280 das Band mit ab —
 * nachgemessen bei 768x900 und nicht geschlossen: die Knopfbreiten auf
 * /groups/1 sind zeichengleich mit den 1280er-Werten (170/187 · 88/61/144 ·
 * 68/146/251), und alle sieben Seiten stehen auf `doc == vw` (bis auf die
 * Auswertung, siehe den benannten Befund weiter unten).
 *
 * WAS DIESE DATEI DAMIT NICHT SIEHT, und das ist eine bekannte Luecke, keine
 * Zusage: `feedback.css` hat neben `max-width: 767.98px` auch
 * `min-width: 768px` (Zeile 204) UND `min-width: 992px` (Zeile 284,
 * `.fb-sticky`). Zwischen 768 und 991 faehrt die rechte Spalte NICHT mit, bei
 * 1280 schon — ein Defekt an `.fb-sticky` in diesem Band waere fuer jeden
 * Viewport dieser Datei unsichtbar. Er gehoert zu §2.1/§2.4 und nicht zum
 * mobilen Durchgang; hier steht er, damit ihn niemand fuer geprueft haelt.
 *
 * KEIN TEST HAENGT AN SEINER POSITION IN DER SUITE. Das ist gemessen und nicht
 * vorsichtshalber: `e2e/feedback.spec.ts:336` BEENDET die Umfrage der Gruppe 2
 * („Demo Jugend") und traegt ihr einen Abend nach, und die Dateien laufen
 * alphabetisch — `feedback` vor `keystone` vor `mobil-admin`. Dieselbe Seite
 * `/groups/2` zeigt deshalb je nach Aufruf zwei verschiedene Belegungen:
 *
 *   `playwright test e2e/mobil-admin.spec.ts`  -> Belegung D (Umfrage laeuft)
 *   `playwright test` (ganze Suite)            -> Belegung B (beendet, Verlauf voll)
 *
 * Ein Test, der „auf /groups/2 laeuft eine Umfrage" voraussetzt, ist damit nur
 * allein gruen und in der Suite rot (oder umgekehrt). Deshalb:
 *
 *   - Gruppe 1 („Demo") ist die Lesebuehne. Sie laeuft in BEIDEN Faellen —
 *     `feedback.spec.ts:340` laesst sie ausdruecklich offen, damit die
 *     oeffentlichen Szenarien ihren Zettel behalten.
 *   - Wer eine Belegung braucht, die es nirgends fertig gibt (Belegung B fuer
 *     den Kartentitel), LEGT SICH EINE EIGENE GRUPPE AN und faehrt sie dorthin.
 *   - Wer einen Verlaufseintrag braucht, traegt ihn nach — idempotent, also
 *     auch dann richtig, wenn ein vorheriger Test ihn schon angelegt hat.
 *
 * DAS HEISZT NICHT „haengt an gar nichts". Drei Zusagen lesen Tatsachen aus dem
 * Seed: `SEITEN` verdrahtet `/groups/1/evenings/1/auswertung` (Abend 1 gehoert
 * Gruppe 1), der Entfernen-Test braucht die `insertUserGroup`-Zuordnung auf
 * Gruppe 2, und `toBe(5)` ist der Spaltensatz beider Tabellen. Diese drei sind
 * ueber den ganzen Lauf stabil — kein Test der Suite legt sie um. Die
 * Eigenschaft, die hier zugesagt wird, ist Reihenfolge-Unabhaengigkeit, nicht
 * Seed-Unabhaengigkeit.
 *
 * ANMELDUNG JE TEST, nicht je Block: Playwright gibt jedem Test einen eigenen
 * Browser-Kontext, eine Anmeldung im `describe` traegt also nur ueber eine von
 * Hand geteilte Seite — und eine geteilte Seite waere genau die
 * Reihenfolge-Abhaengigkeit, die dieser Docblock oben ausschlieszt. Der Preis
 * ist klein und gemessen: kalt kostet `devLogin` 13,7 s (siehe
 * `playwright.config.ts`), warm 0,3–1,2 s; der komplette Durchgang aus sieben
 * Seiten plus Anmeldung lief hier in 9,4 s. `AUTH_COOKIE_DOMAIN=.localtest.me`
 * traegt die Sitzung ueber alle Modul-Hosts, deshalb reicht EINE Anmeldung je
 * Test fuer alle drei Module.
 */

/*
 * KOMMAGETRENNT, NICHT MIT LEERZEICHEN. `parseDevGroups` (core/auth) trennt an
 * Kommas; mit Leerzeichen entsteht EINE Gruppe namens
 * „da-feedback-admin dashboard-admins drk-qr-admin", `isAdmin` bleibt false,
 * und `moduleAdminPageOrNotFound("portal")` antwortet mit 404 — die
 * portal- und qr-Verwaltungsseiten faenden sich dann nicht.
 */
const GRUPPEN = "da-feedback-admin,dashboard-admins,drk-qr-admin";

/** Alles, was rechts aus dem Sichtfeld ragt — mit Namen, damit ein Fehlschlag den Verursacher nennt. */
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
        // Klasse UND `rechts=` gehoeren dazu: ohne sie sagt ein Fehlschlag zwar,
        // WAS ueberlaeuft, aber nicht, um wie viel und in welchem Baustein —
        // genau die zwei Angaben, die den Befund auf der Auswertungsseite
        // ueberhaupt erst einordbar gemacht haben.
        return `${el.tagName}.${klasse.slice(0, 40)} „${(el.textContent ?? "")
          .trim()
          .slice(0, 20)}" rechts=${Math.round(b.right)}`;
      })
      .slice(0, 5),
  }));
}

/** Jedes sichtbare `.ant-btn` unter 44px — Beschriftung und Masz, damit der Fehlschlag den Knopf nennt. */
async function zuKleineKnoepfe(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".ant-btn")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && (b.width < 44 || b.height < 44);
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const t = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24);
        return `${t} ${Math.round(b.width)}x${Math.round(b.height)}`;
      }),
  );
}

/** Die Seiten des Durchgangs. Host und Pfad getrennt, weil die Sitzung ueber alle Hosts traegt. */
const SEITEN = [
  { name: "feedback — Gruppenliste", host: "feedback.localtest.me", pfad: "/" },
  { name: "feedback — Gruppenvergleich", host: "feedback.localtest.me", pfad: "/vergleich" },
  { name: "feedback — Gruppe", host: "feedback.localtest.me", pfad: "/groups/1" },
  { name: "feedback — Trend", host: "feedback.localtest.me", pfad: "/groups/1/trend" },
  {
    name: "feedback — Auswertung",
    host: "feedback.localtest.me",
    pfad: "/groups/1/evenings/1/auswertung",
  },
  { name: "portal — Dienste verwalten", host: "portal.localtest.me", pfad: "/admin" },
  { name: "qr — Presets verwalten", host: "qr.localtest.me", pfad: "/admin" },
];

/**
 * Ein Verlaufseintrag auf der offenen Gruppen-Seite — IDEMPOTENT.
 *
 * Der Verlauf ist die Historie OHNE den laufenden Abend (§2.2). Frisch geseedet
 * hat jede Gruppe genau einen laufenden Abend, der Verlauf ist also leer und das
 * „…"-Menue gar nicht im DOM. Ohne diesen Handgriff pruefte der 44px-Test an der
 * schwersten Stelle des ganzen Specs ein leeres Array.
 *
 * Datum bewusst in der Vergangenheit: ein spaeterer Abend wuerde zum „naechsten"
 * und damit die Belegung der Lagekarte verschieben.
 */
async function verlaufseintragSichern(page: Page) {
  const menues = page.locator('.ant-btn[aria-label^="Aktionen für den"]');
  if ((await menues.count()) > 0) return;

  await page.getByRole("button", { name: "Abend ohne Feedback nachtragen" }).click();
  const dialog = page.locator('[data-testid="verlauf-nachtragen"]');
  await dialog.locator('input[name="date"]').fill("2020-01-15");
  await dialog.locator('input[name="topic"]').fill("Mobiler Durchgang");
  await dialog.getByRole("button", { name: "Abend eintragen" }).click();
  /*
   * ERST WENN DER DIALOG WEG IST messen, und das ist kein vorsorgliches Warten:
   * direkt nach dem Absenden wurde „Abend eintragen" mit 97x17 gemessen — der
   * Knopf schrumpft waehrend der Schlieszanimation und stuende sonst als
   * falscher Befund in der 44px-Liste.
   */
  await expect(dialog).toHaveCount(0);
}

/** Eine eigene Gruppe anlegen und ihr Cockpit oeffnen (Bauform aus `feedback.spec.ts:196`). */
async function eigeneGruppe(page: Page, name: string, slug: string) {
  await page.goto("http://feedback.localtest.me:3100/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "+ Neue Gruppe" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByPlaceholder("Name", { exact: true }).fill(name);
  await modal.getByPlaceholder("slug", { exact: true }).fill(slug);
  await modal.getByRole("button", { name: "Gruppe anlegen" }).click();
  const karte = page
    .getByTestId("group-row")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(karte).toBeVisible();
  // Das Modal schlieszt sich nicht von selbst und liegt mit seiner Maske ueber
  // den Karten — ohne Escape traefe der naechste Klick die Maske.
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await karte.click();
  await page.waitForURL(/\/groups\/\d+$/);
}

/** Alle Kartenkopf-Titel der Seite mit ihrem Kuerzungsmasz. */
async function kartentitel(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".ant-card-head-title")].map((el) => ({
      text: (el.textContent ?? "").trim(),
      scrollW: (el as HTMLElement).scrollWidth,
      clientW: (el as HTMLElement).clientWidth,
    })),
  );
}

/**
 * `.fb-block-mobil`-Knoepfe, gruppiert nach ihrer echten Geschwisterschaft.
 *
 * NICHT nach `el.parentElement`: `Teilnahme.tsx:155` ist ein antd-`Space`
 * (`<Space wrap className="fb-knopfzeile">`), und `Space` huellt JEDES Kind in
 * ein eigenes `.ant-space-item`. Nach Elternteil gruppiert waeren „Kopieren",
 * „PNG" und „Aushang drucken" drei EINERGRUPPEN — und ein
 * `filter(l => l.length > 1)` wuerfe genau die Reihe weg, die der Spec als
 * Befund nennt. Gemessen auf /groups/1 bei 700x900: naiv
 * `[[634,634],[634],[634],[634],[668,668,668]]` (drei Einergruppen), ueber den
 * naechsten Nicht-`ant-space-item`-Vorfahren `[2, 3, 3]`.
 */
async function knopfgruppen(page: Page) {
  return page.evaluate(() => {
    const nachVorfahr = new Map<Element, { breite: number; text: string }[]>();
    for (const el of document.querySelectorAll(".fb-block-mobil")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      let auf: Element | null = el.parentElement;
      while (auf && auf.classList.contains("ant-space-item")) auf = auf.parentElement;
      const schluessel = auf as Element;
      nachVorfahr.set(schluessel, [
        ...(nachVorfahr.get(schluessel) ?? []),
        { breite: Math.round(b.width), text: (el.textContent ?? "").trim().slice(0, 30) },
      ]);
    }
    return [...nachVorfahr.values()];
  });
}

test.describe("390x844 — das Telefon", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keine Admin-Seite scrollt seitwaerts", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    for (const seite of SEITEN) {
      const antwort = await page.goto(`http://${seite.host}:3100${seite.pfad}`);
      // OHNE DIESE ZEILE misst der Test eine 404- oder 500-Seite als „scrollt
      // nicht" und ist gruen, ohne dass die Seite existiert.
      expect(antwort?.status(), `${seite.name}: HTTP`).toBe(200);
      await page.waitForLoadState("networkidle");
      const mass = await ueberlauf(page);
      expect(mass.doc, `${seite.name}: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);
    }
  });

  test("die Trendseite antwortet mit 200", async ({ page }) => {
    // DER EINZIGE TEST, DER DIE RSC-GRENZE PRUEFEN KANN. `MONATS_FENSTER` kam
    // aus einem "use client"-Modul und war serverseitig kein Array — die Seite
    // antwortete mit 500. Unter Vitest sind beide Module normale ES-Module,
    // dort ist der Fehler unsichtbar.
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    const antwort = await page.goto("http://feedback.localtest.me:3100/groups/1/trend");
    expect(antwort?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Trend");
  });

  test("die ueberlaufenden Tabellen scrollen in ihrem eigenen Kasten", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    for (const ziel of [
      "http://feedback.localtest.me:3100/vergleich",
      "http://portal.localtest.me:3100/admin",
    ]) {
      await page.goto(ziel);
      await page.waitForLoadState("networkidle");
      const mass = await page.evaluate(() => {
        const kasten = document.querySelector(".ant-table-content") as HTMLElement;
        const tabelle = document.querySelector(".ant-table table") as HTMLElement;
        return {
          kasten: kasten.clientWidth,
          tabelle: tabelle.scrollWidth,
          ueberlaufX: getComputedStyle(kasten).overflowX,
        };
      });
      // Die Tabelle ist BREITER als ihr Kasten — genau das ist der Beweis, dass
      // der Ueberlauf ueberhaupt existiert.
      expect(mass.tabelle, `${ziel}: ${JSON.stringify(mass)}`).toBeGreaterThan(mass.kasten);
      /*
       * UND DER KASTEN SCROLLT. Ohne diese zweite Zusage prueft der Test nichts:
       * nimmt man `scroll={{ x: "max-content" }}` heraus, ist die Tabelle
       * IMMER NOCH breiter als ihr Kasten (gemessen: `{"kasten":358,
       * "tabelle":427,"ueberlaufX":"visible"}`) — nur laeuft
       * der Ueberlauf dann ins Dokument statt in den Kasten. Erst
       * `overflow-x: auto` macht aus „ragt heraus" ein „scrollt in sich".
       */
      expect(["auto", "scroll"], `${ziel}: ${JSON.stringify(mass)}`).toContain(mass.ueberlaufX);
    }
  });

  test("kein Bedienelement ist schmaler oder niedriger als 44px — auszer der einen benannten Ausnahme", async ({
    page,
  }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/1");
    await page.waitForLoadState("networkidle");

    /*
     * DAS „…"-MENUE MUSS ERST DA SEIN. Es ist der schwerste Befund des Specs
     * (24px breit, und das EINZIGE Bedienelement der Verlaufszeile fuer
     * „Bearbeiten" und „Loeschen") — und es steht nur im DOM, wenn der Verlauf
     * nicht leer ist. Ohne den Nachtrag prueft die Groeszenzusage unten ein
     * leeres Array und ist gruen, ohne den Knopf je gesehen zu haben.
     */
    await verlaufseintragSichern(page);
    /*
     * ERST AUF DIE ZEILE WARTEN, DANN MESSEN. `verlaufseintragSichern` kehrt
     * zurueck, sobald der Dialog aus dem DOM ist — die Verlaufszeile erscheint
     * aber erst mit dem RSC-Refresh danach. Ein `page.evaluate` wiederholt
     * NICHT: ein langsamer Refresh gaebe `[]` und machte die tragendste Zusage
     * dieser Datei grundlos rot. `toBeVisible` wiederholt bis zum Zeitlimit.
     *
     * `:visible` ist noetig und nicht Zierde: der Verlauf liegt zweimal im HTML,
     * und die BREITE Tabelle steht im DOM VOR der schmalen Liste. Ein blankes
     * `.first()` traefe bei 390px den per CSS ausgeblendeten Knopf, und
     * `toBeVisible()` liefe in sein Zeitlimit.
     */
    await expect(
      page.locator('.ant-btn[aria-label^="Aktionen für den"]:visible').first(),
    ).toBeVisible();
    const menues = await page.evaluate(() =>
      [...document.querySelectorAll('.ant-btn[aria-label^="Aktionen für den"]')]
        .map((el) => {
          const b = el.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height) };
        })
        // Der Verlauf liegt ZWEIMAL im HTML (breite Tabelle + schmale Liste),
        // CSS blendet bei 768px eine aus — die ausgeblendete misst 0x0.
        .filter((m) => m.w > 0),
    );
    expect(menues.length, "kein sichtbares „…“-Menue im Verlauf").toBeGreaterThan(0);
    for (const m of menues) {
      expect(m.w, `„…" zu schmal: ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(44);
      expect(m.h, `„…" zu niedrig: ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(44);
    }

    // Der Einstellungen-Block ist eingeklappt; Speichern, „Neues Secret
    // erzeugen" und „Gruppe löschen" werden erst dadurch sichtbar.
    await page.getByText("Einstellungen", { exact: false }).first().click();
    /*
     * UND DER BELEG, DASS ER WIRKLICH OFFEN IST. `getByText` ohne `exact` loest
     * auf den innersten passenden Knoten auf; wandert der Text in den Kopf des
     * Ausklappers oder wird der umgebaut, klickt `.first()` auf etwas
     * Unbedienbares, Playwright meldet Erfolg — und die Zusage unten ginge
     * durch, ohne „Speichern", „Neues Secret erzeugen" oder „Gruppe löschen"
     * je gesehen zu haben.
     */
    await expect(page.getByRole("button", { name: "Gruppe löschen" })).toBeVisible();

    /*
     * NICHT `toEqual([])`, UND DAS IST DER PUNKT DIESES TESTS.
     *
     * `Aktualisierer.tsx:80` behaelt sein `size="small"` — die eine begruendete
     * Ausnahme von der `size`-Regel (Begruendung ab Zeile 66: ein 56px-Knopf
     * neben einer 12px-Metazeile waere der lauteste Punkt der Fuszzeile). Sie
     * erscheint, sobald eine Umfrage laeuft, und auf Gruppe 1 laeuft immer eine.
     * Gemessen bei 390px, wortgleich vor und nach Aufgabe 5:
     * `{"w":99,"h":42,"t":"Aktualisieren"}`.
     *
     * Sie hier still wegzufiltern waere die falsche Loesung: eine ZWEITE
     * Ausnahme rutschte dann unbemerkt mit durch. Erwartet wird deshalb genau
     * diese eine — kommt eine zweite dazu, wird der Test rot und nennt sie.
     *
     * Erwartet wird die BESCHRIFTUNG, nicht `99x42`: die 42 sind
     * `controlHeightSM` (56 x 0,75) und damit fest, die 99 haengen an der
     * Textbreite. Die Zahl steht als Messwert im Kommentar, nicht in der Zusage.
     */
    const zuKlein = await zuKleineKnoepfe(page);
    expect(zuKlein.map((z) => z.replace(/ \d+x\d+$/, "")), `gemessen: ${zuKlein.join(" | ")}`).toEqual([
      "Aktualisieren",
    ]);

    /*
     * DIE ZWEI ANDEREN VON AUFGABE 5 BEHOBENEN FLAECHEN, und sie kosten nichts:
     * beide Seiten brauchen keinen hergestellten Zustand.
     *
     * `/groups/1/trend` traegt die acht Fragen-Schalter aus `TrendDiagramm.tsx`
     * (gemessen VOR Aufgabe 5: acht Knoepfe mit `h:42`, von 207 bis 279px breit),
     * `portal/admin` die „Löschen"-Knoepfe aus `service-table.tsx` (gemessen
     * VORHER: zweimal 70x42, aus dem Seed zwei Dienste). Hier ist `[]` die
     * richtige Erwartung — auf beiden Seiten laeuft keine Umfrage, die
     * Aktualisierer-Ausnahme kommt also gar nicht ins Spiel.
     */
    for (const ziel of [
      "http://feedback.localtest.me:3100/groups/1/trend",
      "http://portal.localtest.me:3100/admin",
    ]) {
      await page.goto(ziel);
      await page.waitForLoadState("networkidle");
      // ERST ZAEHLEN, DANN MESSEN: `zuKleineKnoepfe` liefert auch auf einer
      // leeren oder gescheiterten Seite `[]` — ohne diese Zeile waere `toEqual([])`
      // gruen, ohne je einen Knopf gesehen zu haben.
      const alle = await page.locator(".ant-btn").count();
      expect(alle, `${ziel}: gar keine Bedienelemente gefunden`).toBeGreaterThan(0);
      const rest = await zuKleineKnoepfe(page);
      expect(rest, ziel).toEqual([]);
    }
  });

  test("die „Entfernen“-Flaeche der Zuordnung ist mindestens 44px", async ({ page }) => {
    /*
     * EIGENER TEST, weil die Zuordnungstabelle nur dort Zeilen hat, wo jemand
     * EINZELN zugeordnet ist: `seed.ts` legt das ausschlieszlich fuer Gruppe 2
     * („Demo Jugend", `insertUserGroup`) an. Auf Gruppe 1 gibt es keinen
     * „Entfernen"-Knopf, gemessen 0 Stueck — ein Test, der ihn dort suchte,
     * pruefte wieder ein leeres Array.
     *
     * Gruppe 2 ist hier trotzdem unbedenklich: die Zuordnung haengt an
     * `user_groups` und nicht am Umfragezustand, sie ueberlebt also beide
     * Belegungen, in denen `/groups/2` je nach Suite-Position steht.
     */
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/2");
    await page.waitForLoadState("networkidle");
    await page.getByText("Einstellungen", { exact: false }).first().click();

    const knoepfe = page.locator('[data-testid^="entfernen-"]');
    await expect(knoepfe.first()).toBeVisible();
    const masze = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="entfernen-"]')]
        .map((el) => {
          const b = el.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height) };
        })
        .filter((m) => m.w > 0),
    );
    expect(masze.length, "keine Zuordnungszeile mit „Entfernen“").toBeGreaterThan(0);
    for (const m of masze) {
      expect(m.h, `„Entfernen" zu niedrig: ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(44);
    }
  });

  test("der Kartentitel wird nicht gekuerzt", async ({ page }) => {
    /*
     * DIE KARTE GIBT ES NUR IN BELEGUNG B, und keine der beiden Seed-Gruppen
     * steht verlaesslich darin: frisch geseedet laufen BEIDE Umfragen
     * (Belegung D, `.ant-card-head-title` liefert dann nur „DAUERHAFTER
     * ZUGANG"), in der vollen Suite hat `feedback.spec.ts` Gruppe 2 nach B
     * geschoben. Also eine eigene Gruppe: anlegen (Belegung A, „ERSTER
     * SCHRITT"), Feedback starten, Feedback beenden — danach steht sie in B und
     * die Karte heiszt „NÄCHSTER SCHRITT".
     *
     * Gemessen bei 390px: VOR Aufgabe 6 brauchte der Titel 140px und bekam 94
     * (`white-space: nowrap; text-overflow: ellipsis` an `.ant-card-head-title`,
     * das `extra` „Gerade läuft kein Feedback." nahm den Rest der Zeile),
     * NACHHER 94 gegen 94. `textContent` traegt in beiden Faellen den vollen
     * Text — die Kuerzung ist rein visuell, nur `scrollWidth`/`clientWidth`
     * zeigt sie.
     */
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await eigeneGruppe(page, "Mobil Kartentitel", "mobil-kartentitel");

    await page.getByRole("button", { name: "Feedback starten", exact: true }).click();
    await expect(page.getByRole("button", { name: "Feedback jetzt beenden" })).toBeVisible();
    await page.getByRole("button", { name: "Feedback jetzt beenden" }).click();
    await page.getByRole("button", { name: "Beenden", exact: true }).click();
    await expect(page.getByRole("button", { name: "Feedback starten", exact: true })).toBeVisible();

    /*
     * `querySelector(".ant-card-head-title")` waere der falsche Griff: die Seite
     * traegt mehrere Karten mit Kopf, und der erste Treffer ist je nach Belegung
     * „LETZTER ABEND" (316/316) — gruen aus dem falschen Grund. Gesucht wird die
     * Karte beim Namen.
     */
    const titel = await kartentitel(page);
    const naechster = titel.find((t) => t.text === "NÄCHSTER SCHRITT");
    expect(
      naechster,
      `Karte „NÄCHSTER SCHRITT" nicht gefunden, gesehen: ${titel.map((t) => t.text).join(" | ")}`,
    ).toBeDefined();
    expect(
      naechster!.scrollW,
      `gekuerzt: „${naechster!.text}" ${naechster!.scrollW} in ${naechster!.clientW}`,
    ).toBeLessThanOrEqual(naechster!.clientW);
  });

  test("eine lange Adresse spannt weder Verlauf noch QR-Ansicht auf, und jeder Verlaufseintrag bleibt mindestens TAP_XL hoch", async ({
    page,
  }) => {
    const lang =
      "https://wiki.iuk-ue.de/books/einsatzhandbuch/chapter/funk-und-fernmeldedienst/page/kanaltrennung";
    // Das qr-Modul ist oeffentlich (`requiresAuth: false`) — kein `devLogin`.
    await page.goto("http://qr.localtest.me:3100/");
    await page.getByLabel("Link oder Text").fill(lang);
    await page.getByRole("button", { name: "QR-Code erzeugen" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("wiki.iuk-ue.de");
    let mass = await ueberlauf(page);
    expect(mass.doc, `QR-Ansicht: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);

    // Zurueck auf den Generator — der Verlaufseintrag traegt jetzt dieselbe URL
    // als Beschriftung. Das war der zweite Seitwaerts-Scroll des Moduls.
    await page.goto("http://qr.localtest.me:3100/");
    await expect(page.getByTestId("history-entry").first()).toBeVisible();
    mass = await ueberlauf(page);
    expect(mass.doc, `Verlauf: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);

    /*
     * TAP_XL-BODEN (Schlussreview-Nachzug zu Befund 1, `HistoryList.tsx`).
     * `height: "auto"` allein liess einen EINZEILIGEN Verlaufseintrag auf
     * 39px schrumpfen — gemessen mit Playwright bei 390x844, Beschriftung
     * "kurz" —, weit unter der 44px-Schwelle dieses Branches. Ursache:
     * antds `.ant-btn-lg` setzt `padding-block: 0`, mit `height: "auto"`
     * trug seither nur noch der Zeilenkasten die Hoehe. `minHeight: TAP_XL`
     * in `HistoryList.tsx` haelt seither 72px; der MEHRZEILIGE Eintrag oben
     * blieb dabei unveraendert bei 81px (vorher wie nachher).
     *
     * Der lange Eintrag allein pruefte diese Zusage nicht scharf: er liegt
     * mit 81px ohnehin ueber TAP_XL, auch OHNE die Mindesthoehe. Erst ein
     * zusaetzlicher, einzeiliger Eintrag macht sie aussagekraeftig — deshalb
     * hier ein zweiter, kurzer Eintrag vor der Messung.
     */
    await page.getByLabel("Link oder Text").fill("kurz");
    await page.getByRole("button", { name: "QR-Code erzeugen" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("kurz");
    await page.goto("http://qr.localtest.me:3100/");

    const eintraege = page.getByTestId("history-entry");
    await expect(eintraege).toHaveCount(2);
    const hoehen = await eintraege.evaluateAll((els) =>
      els.map((el) => ({
        text: el.textContent,
        hoehe: Math.round(el.getBoundingClientRect().height),
      })),
    );
    for (const { text, hoehe } of hoehen) {
      expect(hoehe, `Verlaufseintrag "${text}": ${hoehe}px, erwartet mindestens TAP_XL`).toBeGreaterThanOrEqual(
        TAP_XL,
      );
    }
  });
});

test.describe("700x900 — das Tablet zwischen den alten 600 und den 768 der Suite", () => {
  test.use({ viewport: { width: 700, height: 900 } });

  test("Handlungsknoepfe stehen untereinander und in voller Breite", async ({ page }) => {
    /*
     * DER EINZIGE LAUF, DER DIE VEREINHEITLICHUNG BEWEISEN KANN. Bei 390px
     * sehen Vorher und Nachher identisch aus (600 und 768 greifen dort beide),
     * bei 1280px ebenso (keins von beiden greift). Nur hier lag der Riss:
     * gemessen vorher „Kopieren" 88px und „PNG" 61px, waehrend der Menue-Knopf
     * der Shell sichtbar war und der Verlauf die Schmalliste zeigte.
     *
     * NICHT gegen die Elternbreite messen, auch wenn das naeher laege:
     * `width: 100%` loest gegen die INHALTSBOX des Elternteils auf,
     * `getBoundingClientRect()` liefert die Rahmenbox samt Polsterung. Die
     * tragfaehige Formulierung ist relativ: Knoepfe, die sich einen Elternteil
     * teilen, sind unterhalb von 768px GLEICH breit — polsterungsunabhaengig,
     * und die Gegenprobe bei 1280px (ungleich breit) macht daraus ein Paar.
     */
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/1");
    await page.waitForLoadState("networkidle");

    const gruppen = await knopfgruppen(page);
    // Protokoll statt blossem Schwellwert: eine Schwelle, die von genau zwei
    // Gruppen erfuellt wird, ist eine Umbenennung davon entfernt, still zur
    // Nullaussage zu werden. Was gefunden wurde, steht damit im Lauf.
    console.log(
      `Knopfgruppen @700: ${JSON.stringify(
        gruppen.map((g) => g.map((k) => `${k.text}=${k.breite}`)),
      )}`,
    );

    expect(gruppen.length, "keine Knopfgruppe mit `fb-block-mobil` gefunden").toBeGreaterThan(1);

    /*
     * DIE SPACE-REIHE NAMENTLICH. „Kopieren"/„PNG"/„Aushang drucken"
     * (`Teilnahme.tsx:155`) ist die Reihe, die eine Gruppierung nach
     * `parentElement` in drei Einergruppen zerlegt und ein
     * `filter(l => l.length > 1)` anschlieszend wegwirft. Wird sie hier nicht
     * gefunden, traegt der Test die Space-Huelle nicht mehr — und genau das
     * soll auffallen.
     */
    const spaceReihe = gruppen.find((g) => g.some((k) => k.text === "Kopieren"));
    expect(
      spaceReihe,
      "Reihe „Kopieren“/„PNG“/„Aushang drucken“ nicht gefunden — Gruppierung ueber `ant-space-item` gebrochen?",
    ).toBeDefined();
    expect(spaceReihe!.length, "die Space-Reihe hat nicht mehr drei Knoepfe").toBeGreaterThanOrEqual(
      3,
    );

    for (const gruppe of gruppen) {
      const breiten = gruppe.map((k) => k.breite);
      expect(
        Math.max(...breiten) - Math.min(...breiten),
        `ungleich breit: ${gruppe.map((k) => `${k.text}=${k.breite}`).join(", ")}`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("1280x800 — man sieht es auf dem Desktop NICHT", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("die Tabellen bleiben auf `table-layout: auto` und verteilen ungleich", async ({ page }) => {
    /*
     * `scroll.x` KANN das Desktop-Bild aendern: rc-table schaltet auf
     * `table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` traegt
     * oder `scroll.y` gesetzt ist (lib/Table.js:426-442) — und verteilt die
     * Spalten dann GLEICHMAESZIG. `documentElement.scrollWidth` waere hier die
     * falsche Behauptung: eine veraenderte Spaltenverteilung laesst nichts
     * ueberlaufen.
     *
     * WARUM NICHT DIE ABSOLUTEN PIXELWERTE: sie haengen am Seed —
     * `feedback.spec.ts` legt vor diesem Lauf mehrere Gruppen an, die
     * Vergleichstabelle ist danach eine andere. Und Aufgabe 2 hat gemessen,
     * dass `scroll.x` eine unsichtbare Messzeile (`MeasureRow`) erzeugt, die
     * die Spalten um 1–4px verschiebt. Hier steht deshalb der MECHANISMUS, und
     * der ist breitenunabhaengig.
     *
     * (Die Scrollbalkenbreite stand hier einmal als dritter Grund und ist
     * gestrichen: Playwright startet headless mit `--hide-scrollbars`, die
     * Balken sind auch auf einem Linux-Runner 0px breit. Ein Kommentar, der
     * seiner eigenen Messung widerspricht, ist auf diesem Projekt schon zweimal
     * zum Blocker geworden.)
     */
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });

    for (const ziel of [
      "http://feedback.localtest.me:3100/vergleich",
      "http://portal.localtest.me:3100/admin",
    ]) {
      await page.goto(ziel);
      await page.waitForLoadState("networkidle");
      const layout = await page.evaluate(
        () => getComputedStyle(document.querySelector(".ant-table table")!).tableLayout,
      );
      expect(layout, `${ziel}: table-layout`).toBe("auto");

      // Verhaltens-Gegenprobe: `fixed` verteilte gleichmaeszig, `auto` nicht.
      // Gemessen am 2026-07-28: /vergleich 394/129/187/269/142,
      // portal/admin 225/221/367/198/238 — beide Male ueber 50px zwischen
      // breitester und schmalster Spalte.
      const breiten = await page.evaluate(() =>
        [...document.querySelectorAll(".ant-table thead th")].map((th) =>
          Math.round(th.getBoundingClientRect().width),
        ),
      );
      expect(breiten.length, `${ziel}: Spaltenzahl`).toBe(5);
      expect(
        Math.max(...breiten) - Math.min(...breiten),
        `${ziel}: gleichmaeszig verteilt (${breiten.join(", ")}) — table-layout gekippt?`,
      ).toBeGreaterThan(50);
    }
  });

  test("Handlungsknoepfe sind wieder inhaltsbreit, nicht alle gleich", async ({ page }) => {
    // Die andere Haelfte von „volle Breite unter 768px". Ohne sie kann der Test
    // eine wirkungslose Medienabfrage nicht widerlegen — dort saehen richtige
    // und kaputte Fassung beide „volle Breite".
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    await page.goto("http://feedback.localtest.me:3100/groups/1");
    await page.waitForLoadState("networkidle");

    const gruppen = await knopfgruppen(page);
    console.log(
      `Knopfgruppen @1280: ${JSON.stringify(
        gruppen.map((g) => g.map((k) => `${k.text}=${k.breite}`)),
      )}`,
    );
    const alle = gruppen.flat();
    expect(alle.length, "zu wenige `fb-block-mobil`-Knoepfe fuer eine Aussage").toBeGreaterThan(4);
    expect(
      new Set(alle.map((k) => k.breite)).size,
      `alle gleich breit: ${alle.map((k) => `${k.text}=${k.breite}`).join(", ")}`,
    ).toBeGreaterThan(1);

    // Dieselbe Space-Reihe wie bei 700px, hier als Gegenprobe: gemessen
    // „Kopieren" 88, „PNG" 61, „Aushang drucken" 144 — inhaltsbreit, nicht
    // gestreckt.
    const spaceReihe = gruppen.find((g) => g.some((k) => k.text === "Kopieren"));
    expect(spaceReihe, "Reihe „Kopieren“ nicht gefunden").toBeDefined();
    expect(
      new Set(spaceReihe!.map((k) => k.breite)).size,
      `die Space-Reihe ist am Laptop gleich breit: ${spaceReihe!
        .map((k) => `${k.text}=${k.breite}`)
        .join(", ")} — greift die 767.98px-Abfrage auch oberhalb?`,
    ).toBeGreaterThan(1);
  });

  test("keine Admin-Seite scrollt seitwaerts", async ({ page }) => {
    await devLogin(page, { host: "feedback.localtest.me", groups: GRUPPEN });
    for (const seite of SEITEN) {
      const antwort = await page.goto(`http://${seite.host}:3100${seite.pfad}`);
      expect(antwort?.status(), `${seite.name}: HTTP`).toBe(200);
      await page.waitForLoadState("networkidle");
      const mass = await ueberlauf(page);

      /*
       * /auswertung STAND HIER EINMAL UNTER QUARANTAENE — sie steht es nicht
       * mehr, und der Weg dahin gehoert festgehalten.
       *
       * Die Notenlegende (`.fb-legende-woerter`, sechs Woerter) liess ihr
       * letztes Wort „ungenügend" nach rechts aus der Karte stehen: @768 lief
       * das Dokument auf 834px, @1280 auf 1282px. Die Quarantaene liess das mit
       * einer 5px-Schranke durchgehen — auf dem CI-Runner mit seinen breiteren
       * Schriftmetriken wurden aus den 2px bei 1280 dann 20, und der Test fiel.
       *
       * Der Befund war nicht „ein Wort ist zu breit", sondern eine Regel an der
       * falschen Achse: die Legendenspalte ist bei JEDER Viewportbreite 336px
       * breit, die Wortzeile braucht 466px — sie passte dort nie, auch bei 1440
       * nicht (der alte Messwert „Seite mittig, der Ueberstand hat Platz" hat
       * bloss ausserhalb des Fensters gemessen). Das Umschalten hing aber an
       * `@media (max-width: 767.98px)`, also am Fenster. Seit 2026-07-28
       * schaltet `feedback.css` per `@container (min-width: 560px)` am Container
       * und mit `minmax(0, 1fr)` gegen die auto-Untergrenze der Spalten;
       * gemessen ueber 390/768/900/1100/1280/1440 ist `doc === vw`.
       *
       * Deshalb steht hier keine Sonderbehandlung mehr, sondern dieselbe Zeile
       * wie fuer jede andere Seite. Faellt sie, ist es ein Rueckschritt und kein
       * bekannter Befund.
       */
      expect(mass.doc, `${seite.name}: ${mass.schuldige.join(" | ")}`).toBe(mass.vw);
    }
  });
});
