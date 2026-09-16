import { test, expect, type Locator } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  E2E_FAHRZEUG_NAME, LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * FAHRZEUG ODER TASCHE — DIE ART DER VERWALTETEN EINHEIT (DRK-309).
 *
 * ⚠️ WARUM DIESER TEST NEBEN `FahrzeugeListe.test.tsx` UND
 * `EinheitenartWahl.test.tsx` STEHT. Beide bestaetigen `textContent` in jsdom,
 * und beide koennen die zwei teuersten Ausfaelle dieser Aenderung STRUKTURELL
 * nicht sehen:
 *
 *  1. Das Einheitenblatt ist eine Server Component und liest jetzt
 *     `einheitenartLabel` aus `_lib/konstanten.ts`. Waere dieses Modul je mit
 *     `"use client"` versehen, bekaeme die Seite eine Client-Referenz statt des
 *     Wertes — HTTP 500 fuer die ganze Seite, waehrend `typecheck`, `build` und
 *     Vitest gruen bleiben (Falle 6, `CLAUDE.md`). Nur ein echter Abruf zeigt
 *     das, und deshalb steht unten ueberall `expect(antwort!.status()).toBe(200)`.
 *  2. Die Liste bekam eine SIEBTE Spalte mit einer eigenen `render`-Funktion.
 *     Entstuende die in der Server Component statt in der Client-Insel, lehnte
 *     React die Serialisierung ab (Falle 9) — auch das sieht nur ein Abruf.
 *
 * Der Seed liefert zwei eigene, INAKTIVE Einheiten (`einheitenartFixtures`):
 * „E2E Sanitätstasche" ist eine Tasche, „E2E Rucksack ohne Art" traegt den
 * Zwischenstand aus Migration 0009. Der Nachtrag unten ist EINSEITIG — es gibt
 * bewusst keinen Weg zurueck nach „nicht zugeordnet" —, deshalb setzt die Spec
 * ihn am Ende auf „Fahrzeug" und laesst ihn dort: der zweite Lauf findet dann
 * eine zugeordnete Einheit vor und prueft denselben WECHSEL statt des
 * Erstnachtrags.
 */
/**
 * ⚠️ DIE ART WIRD UEBER DAS LABEL GEWAEHLT, NICHT UEBER DAS `input` — und das
 * ist kein Stilfrage, sondern der Grund, aus dem der erste CI-Lauf rot war.
 *
 * antds `Radio.Group` mit `optionType="button"` rendert das eigentliche
 * `input[type=radio]` VISUELL VERSTECKT (`.ant-radio-button-input`, Fläche
 * 0×0 unter dem Label). `getByRole("radio").check()` loest es zwar auf,
 * wartet dann aber 90 Sekunden darauf, dass es sichtbar wird:
 *
 *     locator resolved to <input type="radio" value="tasche" …/>
 *     165 × waiting for element to be visible, enabled and stable
 *
 * Die Meldung nennt das Element, das sie GEFUNDEN hat, und klingt damit nach
 * einem Zeitproblem — sie ist aber ein Bauformproblem und durch kein groesseres
 * Zeitbudget zu heilen. Bedienbar ist das umschliessende
 * `label.ant-radio-button-wrapper`; dort klickt ein Mensch auch hin.
 *
 * ⚠️ UND GEPRUEFT WIRD AM LABEL, nicht am `input`: `ant-radio-button-wrapper-checked`
 * ist der Zustand, den man SIEHT. Dieselbe Bauform wie im jsdom-Test
 * (`EinheitenartWahl.test.tsx`), damit beide Ebenen dasselbe meinen.
 */
function artKnopf(bereich: Locator, beschriftung: string): Locator {
  return bereich.locator("label.ant-radio-button-wrapper")
    .filter({ hasText: new RegExp(`^${beschriftung}$`) });
}

/**
 * ⚠️ `klickeWennRuhig` UND NICHT `.click()` — Falle 12, und sie ist hier
 * GEMESSEN eingetreten, nicht vorsorglich behandelt: im CI-Lauf auf `9e55645`
 * lief der erste Klick einmal in das volle Zeitbudget und kam beim
 * Wiederholungslauf durch („1 flaky"). Das Muster ist das der Falle: es fliegt
 * KEINE Anfrage, die Antwort bleibt also nicht aus, sondern wird nie
 * angestossen. Der Ausloeser sitzt in der Huelle — `SessionProvider` holt
 * `/api/auth/session` nach, und mit der Sitzung wechselt die Navigation von
 * der schmalen Platzhalter- auf die volle Spalte; der Inhalt rutscht hoch,
 * waehrend Playwright zwischen `mousedown` und `mouseup` auf den vorher
 * berechneten Punkt zielt. Das `click`-Ereignis feuert dann am gemeinsamen
 * Vorfahren, und ein `<div>` waehlt nichts aus.
 *
 * ⚠️ EIN GROESSERES ZEITBUDGET HAETTE NICHTS GEHOLFEN, und eine Wiederholung
 * heilt es nur zufaellig: gewartet wird auf einen Rundlauf, den niemand
 * begonnen hat. `klickeWennRuhig` klickt erst, wenn der Kasten dreimal in
 * Folge stillsteht.
 */
async function artWaehlen(bereich: Locator, beschriftung: string): Promise<void> {
  await klickeWennRuhig(artKnopf(bereich, beschriftung));
}

test.describe("Art der Einheit: Fahrzeug oder Tasche", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("zeigt Fahrzeug, Tasche und den Zwischenstand in der Liste — und filtert danach", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    expect(antwort!.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "Fahrzeuge und Taschen" }))
      .toBeVisible();

    /*
     * ⚠️ UEBER `[data-row-key]`, NICHT ueber `tbody tr` oder `getByRole("row")`
     * — eine virtualisierte Tabelle hat ab `VIRTUELL_AB_ZEILEN` weder das eine
     * noch das andere (Falle 14). Hier bleibt sie zwar unter der Schwelle, aber
     * ein Greifer, der erst spaeter blind wird, ist der schlechtere.
     */
    const zeile = (id: string) => page.locator(`[data-row-key='${id}']`);
    await expect(zeile("e2e-tasche")).toContainText("Tasche");
    await expect(zeile("e2e-fahrzeug")).toContainText("Fahrzeug");
    await expect(zeile("e2e-ohne-art")).toContainText("nicht zugeordnet");

    // Der Filter, dessen eigentlicher Zweck der Zwischenstand ist: die nicht
    // zugeordneten Einheiten stehen sonst verstreut und tragen kein
    // gemeinsames Wort im Namen.
    await klickeWennRuhig(page.locator("th", { hasText: "Art" }).locator(".ant-table-filter-trigger"));
    const menue = page.locator(".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown");
    await menue.getByText("nicht zugeordnet", { exact: true }).click();
    await menue.getByRole("button", { name: "OK" }).click();

    await expect(zeile("e2e-ohne-art")).toBeVisible();
    await expect(zeile("e2e-tasche")).toHaveCount(0);
    await expect(zeile("e2e-fahrzeug")).toHaveCount(0);
  });

  test("verlangt die Art beim Anlegen und legt eine Tasche an", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    expect(antwort!.status()).toBe(200);

    await klickeWennRuhig(page.getByRole("button", { name: "Neue Einheit" }));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // ⚠️ ERST OHNE ART ABSENDEN. „Pflichtfeld" ist sonst eine Aussage ueber
    // eine Fehlermeldung, nicht ueber ein Formular: der Dialog muss offen
    // bleiben, BEVOR irgendetwas an den Server geht.
    await dialog.getByLabel("Name").fill("E2E Tasche neu");
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(dialog.locator(".ant-form-item-explain-error"))
      .toContainText("Fahrzeug oder Tasche wählen");
    await expect(dialog).toBeVisible();

    /*
     * ⚠️ AUF DIE ANTWORT WARTEN, nicht auf eine spaetere Zustandsaenderung
     * (zweite Testregel aus Falle 10): sonst laeuft eine abgelehnte oder
     * abgebrochene Anfrage still ins Zeitbudget und meldet sich als „Zeile
     * nicht gefunden".
     */
    await artWaehlen(dialog, "Tasche");
    // ⚠️ AUF DIE ADRESSE EINGESCHRAENKT: eine Server Action POSTet auf die
    // aktuelle Seite. Ein blosses `method() === "POST"` faenge auch jede
    // andere Anfrage, die zufaellig daneben laeuft — und der Fall haenge dann
    // an etwas, das er gar nicht ausgeloest hat.
    const gespeichert = page.waitForResponse((r) =>
      r.request().method() === "POST" && r.url().includes("/verwaltung/fahrzeuge"));
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    expect((await gespeichert).status()).toBe(200);

    /*
     * ⚠️ `.first()` IST HIER PFLICHT, NICHT BEQUEMLICHKEIT. Dieser Fall LEGT
     * eine Einheit AN; ein Wiederholungslauf (Playwright faehrt bis zu zwei)
     * legt gegen denselben laufenden Server eine zweite mit demselben Namen an,
     * und ein Greifer ueber beide risse im strict mode — mit einer Meldung
     * ueber zwei Treffer, die wie ein Seedfehler aussieht statt wie ein
     * zweiter Durchgang.
     */
    const neue = page.locator("[data-row-key]", { hasText: "E2E Tasche neu" }).first();
    await expect(neue).toContainText("Tasche");
  });

  /**
   * ⚠️ DAS GEDRUCKTE BLATT IST DIE FLAECHE, AUF DER DIE ART AM MEISTEN ZAEHLT
   * (Reviewbefund zu DRK-309). Es liegt auf dem Tisch und laesst sich nicht
   * nachschlagen: wer eine Sanitaetstasche vor sich hat und „Fahrzeug-
   * Checkliste" liest, greift zum falschen Blatt oder zweifelt an seinem.
   *
   * ⚠️ UND NUR EIN ECHTER ABRUF ZEIGT ES. Die Druckseite liegt in der
   * Routengruppe `(druck)` ohne `FullShell`; dass sie mit einer Tasche in der
   * Auswahl ueberhaupt HTTP 200 liefert, ist keine Aussage, die Vitest treffen
   * kann (Fallen 1/6/7 aus `CLAUDE.md`).
   */
  test("ueberschreibt das Checklistenblatt einer Tasche nach ihrer Art", async ({ page }) => {
    const antwort = await page.goto(
      lagerbuchUrl("/verwaltung/checklisten?fz=e2e-tasche"));
    expect(antwort!.status()).toBe(200);

    const blatt = page.locator("[data-testid='lb-cl-blatt']");
    await expect(blatt).toHaveCount(1);
    await expect(blatt.locator(".lb-cl-meta")).toContainText("Taschen-Checkliste");
    await expect(blatt.locator(".lb-cl-meta")).not.toContainText("Fahrzeug-Checkliste");
    // Die Seite zaehlt neutral — ein Bogen mischt Fahrzeuge und Taschen.
    await expect(page.getByTestId("lb-cl-zahl")).toContainText("1 Einheit, ein Blatt");
  });

  test("nennt die Art im Kopf der Check-Detailseite", async ({ page }) => {
    /*
     * ⚠️ DIESER KOPF IST DER EINZIGE ORT, AN DEM EIN LINK VON AUSSEN LANDET
     * (DRK-309, Reviewrunde 11). In der Historie daneben steht die Zeile in
     * der Form „Name · Art · Kennung"; wer von dort hierher tippt — oder aus
     * einer Mail —, bekam bis hierher einen blossen Namen, den sich ein
     * Fahrzeug und eine gleichnamige Tasche teilen duerfen.
     *
     * ⚠️ UND ER GEHOERT IN EINEN ECHTEN ABRUF, nicht nur in `page.test.tsx`:
     * die Detailseite ist eine Server Component und liest `einheitMeta` aus
     * `_lib/konstanten.ts`. Traege dieses Modul je ein `"use client"`, bekaeme
     * sie eine Client-Referenz statt des Wertes — HTTP 500 fuer die ganze
     * Seite, waehrend `typecheck`, `build` und Vitest gruen bleiben (Falle 6,
     * `CLAUDE.md`). Deshalb steht der Status hier vor dem Text.
     */
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/checks/e2e-check-lesbar"));
    expect(antwort!.status()).toBe(200);
    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);

    await expect(page.getByRole("heading", { level: 1 }))
      .toHaveText(`${E2E_FAHRZEUG_NAME} · Fahrzeug · MS-E2E-1`);
  });

  test("traegt die Art am Einheitenblatt nach und zeigt sie danach im Kopf", async ({ page }) => {
    const pfad = "/verwaltung/fahrzeuge/e2e-ohne-art";
    const antwort = await page.goto(lagerbuchUrl(pfad));
    expect(antwort!.status()).toBe(200);

    const abschnitt = page.locator("h2", { hasText: "Art" })
      .locator("xpath=following-sibling::*[1]");
    const kopf = page.getByRole("heading", { name: "E2E Rucksack ohne Art" })
      .locator("xpath=..");

    const vorher = await artKnopf(abschnitt, "Fahrzeug")
      .evaluate((el) => el.classList.contains("ant-radio-button-wrapper-checked"));

    /*
     * ⚠️ BEIDE KLICKS MUESSEN DIE ART WIRKLICH AENDERN — und der zweite tat
     * das lange nicht. `EinheitenartWahl.waehlen` steigt bei
     * `naechste === wert` sofort aus, ohne zu senden; ein Klick auf den schon
     * gesetzten Wert loest also KEINEN Rundlauf aus, und ein
     * `waitForResponse` daneben wartet auf eine Antwort, die es nie geben
     * wird. Vorher stand hier fest „danach wieder Fahrzeug", damit der
     * naechste Lauf denselben Weg findet: auf einer frischen Datenbank traegt
     * `e2e-ohne-art` gar keine Art, der erste Klick setzte damit „Fahrzeug",
     * und der zweite klickte genau darauf — ins Zeitbudget.
     *
     * Die Gegenprobe ist deshalb immer die ANDERE Art als das erste Ziel.
     * Damit ist der Fall unabhaengig vom Ausgangszustand: er laeuft auf einer
     * frischen Datenbank (keine Art) genauso wie auf einer, die schon eine
     * traegt — und beide Klicks sind in jedem Fall echte Wechsel.
     * Zurueck nach „nicht zugeordnet" fuehrt kein Weg, das ist Absicht.
     */
    const ziel = vorher ? "Tasche" : "Fahrzeug";
    const gegenprobe = ziel === "Fahrzeug" ? "Tasche" : "Fahrzeug";
    /*
     * ⚠️ DER GREIFER AUF DIE ANTWORT IST BREIT, UND DAS IST GEMESSEN, NICHT
     * BEQUEM. `r.url().includes("e2e-ohne-art")` lief dreimal in das volle
     * Zeitbudget, während derselbe Vorgang eine Zusicherung weiter oben mit
     * `includes("/verwaltung/fahrzeuge")` durchlief — die Adresse, auf die
     * eine Server Action POSTet, ist also nicht verlässlich die des
     * Einheitenblatts. Ein zu enger Greifer wartet dann auf eine Antwort, die
     * es gibt, und meldet sich als Zeitüberschreitung (dieselbe Klasse wie
     * Falle 10: der Test misst etwas anderes, als sein Name sagt).
     */
    const gespeichert = page.waitForResponse((r) =>
      r.request().method() === "POST" && r.url().includes("/verwaltung/fahrzeuge"));
    await artWaehlen(abschnitt, ziel);
    expect((await gespeichert).status()).toBe(200);
    /*
     * ⚠️ UND DIE SICHTBARE WIRKUNG DANEBEN. Die Insel übernimmt den Wert ERST
     * nach einer erfolgreichen Antwort (`EinheitenartWahl`); dass der Knopf
     * angehakt ist, belegt damit den Rundlauf und nicht nur den Klick — und
     * eine abgelehnte Antwort fällt hier auf, statt still stehenzubleiben.
     */
    await expect(artKnopf(abschnitt, ziel)).toHaveClass(/ant-radio-button-wrapper-checked/);
    await expect(abschnitt).not.toContainText("Noch nicht zugeordnet");
    /*
     * ⚠️ UND DAS GANZE BLATT ZIEHT MIT — OHNE NEULADEN (Reviewrunde 7).
     *
     * Bis hierher prüfte dieser Fall den Kopf erst nach einem `goto`, und
     * genau das VERDECKTE den Fehler: die Insel setzte nur ihren eigenen
     * Zustand, während Kopfchip, Löschknopf, Vorlagenfläche und
     * Verfallsüberschrift die alte Art als Prop behielten. Dieselbe Seite
     * beschrieb die gerade gespeicherte Tasche weiter als Fahrzeug — und der
     * folgenreichste dieser Texte steht am Löschknopf. Ein Neuladen im Test
     * beweist nur, dass die Datenbank stimmt; niemand lädt im Betrieb neu,
     * weil er gerade etwas gespeichert hat.
     */
    await expect(kopf).toContainText(ziel);

    // Der Kopf liest den Wert aus der Datenbank — hier als Beleg, dass die
    // Angabe den Seitenwechsel ueberlebt und nicht nur im Speicher stand.
    const zurueck = page.waitForResponse((r) =>
      r.request().method() === "POST" && r.url().includes("/verwaltung/fahrzeuge"));
    await artWaehlen(abschnitt, gegenprobe);
    expect((await zurueck).status()).toBe(200);
    await expect(artKnopf(abschnitt, gegenprobe))
      .toHaveClass(/ant-radio-button-wrapper-checked/);

    const erneut = await page.goto(lagerbuchUrl(pfad));
    expect(erneut!.status()).toBe(200);
    await expect(kopf).toContainText(gegenprobe);
    await expect(page.locator("body")).not.toContainText("Noch nicht zugeordnet");
  });
});
