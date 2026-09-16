import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";
import {
  E2E_FAHRZEUG_ID, E2E_FAHRZEUG_NAME,
  LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl,
} from "./helpers/lagerbuch";
import { A7_BREITE_MM, A7_HOEHE_MM } from "@/app/m/lagerbuch/_lib/ortEtikettMasse";
import { HANDLAGER_ID } from "@/app/m/lagerbuch/_lib/konstanten";

/**
 * DIE A7-ORTSETIKETTEN — DRK-312.
 *
 * ⚠️ DREI AUSSAGEN DIESER DATEI KANN SONST NICHTS IM REPO PRUEFEN, und alle
 * drei sind genau die Akzeptanzkriterien des Tickets:
 *
 *   1. DAS FORMAT. `@page`-Groessen sind fuer `pnpm build` unsichtbar, und
 *      jsdom hat gar keine Seitenaufteilung — die Zahl kennt nur ein echter
 *      Browser. Sie kommt hier aus der MediaBox eines wirklich erzeugten PDF.
 *   2. „EIN ETIKETT JE BLATT". Dieselbe Messung zaehlt die Seiten.
 *   3. „EIN TESTDRUCK LAESST SICH SCANNEN UND FUEHRT ZUM RICHTIGEN KONTEXT."
 *      Eine Zusicherung auf ein vorhandenes `<svg>` bliebe gruen, wenn der Code
 *      den falschen Inhalt truege. Hier wird der QR aus den PIXELN
 *      zurueckdekodiert und die dekodierte Adresse danach WIRKLICH AUFGERUFEN —
 *      der Test folgt also demselben Weg wie ein Telefon am Fahrzeug.
 *
 * ⚠️ KEIN WARMLAUF-GET NOETIG (Falle 10): diese Datei loest keinen POST aus.
 * Kein `klickeWennRuhig` (Falle 12): sie navigiert mit `goto` statt zu klicken.
 *
 * ⚠️ SIE HINTERLAESST NICHTS. Playwright faehrt alle Specs in EINEM Worker
 * gegen EINE SQLite-Datei; hier wird ausschliesslich gelesen.
 */

const PT_JE_MM = 2.83465;

/**
 * Die Seitengroessen eines erzeugten PDF, in Millimetern.
 *
 * ⚠️ `preferCSSPageSize: true` IST DIE GANZE MESSUNG. Ohne das Flag nimmt
 * Chromium sein Vorgabeformat und das Ergebnis waere Letter — unabhaengig
 * davon, ob `@page` richtig oder falsch ist. Der Test bewiese dann nichts und
 * saehe trotzdem aus, als tue er es.
 *
 * ⚠️ UND ES IST NICHT BLOSS EINE TESTVORRICHTUNG: derselbe Schalter ist im
 * Druckdialog die Zeile „Seitengröße aus dem Dokument". Das Chrome der Seite
 * sagt genau das (`lb-ort-format`) — was hier gemessen wird, ist also das, was
 * eine Person bekommt, die dem Hinweis folgt.
 */
async function seitenInMm(page: Page): Promise<{ breite: number; hoehe: number }[]> {
  const pdf = await page.pdf({ preferCSSPageSize: true });
  return [...pdf.toString("latin1").matchAll(
    /MediaBox\s*\[\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/g,
  )].map((m) => ({
    breite: Math.round(Number(m[1]) / PT_JE_MM),
    hoehe: Math.round(Number(m[2]) / PT_JE_MM),
  }));
}

test.describe("Ortsetiketten (A7)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("zeigt je Handlager und Einheit eine Karte mit eingesetztem SVG", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    const qr = page.locator(".lb-ortkarteQr > svg");
    const n = await qr.count();
    // Der Seed liefert den Handlager UND mehrere Fahrzeuge; mit nur einer Karte
    // waere jede Aussage ueber Auswahl und Seitenzahl unten trivial.
    expect(n, "der Seed muss mindestens zwei Ortsetiketten liefern").toBeGreaterThan(1);
    await expect(qr.nth(0)).toBeVisible();
    // Kein <img>: das SVG steht im Markup, wie am Etikettenbogen.
    await expect(page.locator(".lb-ortkarte img")).toHaveCount(0);
  });

  /**
   * §8.1, 8-B: die Zeile ueber dem Bogen ist der EINZIGE Weg, eine Umsortierung
   * von SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken — und bei einem
   * laminierten Kaertchen am Fahrzeug ist „danach" teuer.
   */
  test("schreibt den verwendeten Host ueber den Bogen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await expect(page.getByTestId("lb-ort-basis")).toContainText(
      `Alle QR-Codes zeigen auf http://${LAGERBUCH_HOST}`,
    );
  });

  /**
   * AKZEPTANZKRITERIUM 3 — UND DER EINZIGE TEST DES REPOS, DER IHN GANZ LAEUFT.
   *
   * Der QR wird aus den Pixeln zurueckdekodiert (nicht aus dem Markup gelesen),
   * und die dekodierte Adresse wird danach aufgerufen. Was dazwischen liegt —
   * die Weiche `/o/<id>`, ihre Aufloesung gegen die Datenbank und die
   * Umleitung — ist genau die Kette, die ein Telefon am Fahrzeug durchlaeuft.
   */
  test("der gedruckte Code fuehrt in den Kontext SEINER Einheit", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));

    const karte = page.locator(".lb-ortkarte", { hasText: E2E_FAHRZEUG_NAME }).first();
    await expect(karte).toBeVisible();
    /*
     * Der UMSCHLAG wird gelesen, nicht das SVG — `innerHTML` des Umschlags ist
     * das vollstaendige `<svg …>` samt seiner viewBox. Die von Hand
     * zusammengebaute Variante waere still falsch: das Raster waechst mit der
     * Nutzlast (die viewBox ist NICHT konstant), und jsQR faende dann kein
     * Modulraster mehr.
     */
    const svg = await karte.locator(".lb-ortkarteQr").innerHTML();
    const ziel = await decodeQr(svg);

    // Erst die Adresse — sie steht so auch im Fuss der Karte, damit sie
    // abtippbar ist.
    expect(ziel).toBe(lagerbuchUrl(`/o/${E2E_FAHRZEUG_ID}`));
    await expect(karte.locator(".lb-ortkarteUrl")).toHaveText(ziel);

    // Dann der Abruf. Als Praedikat und NICHT als Regex: ein `?` im Muster ist
    // der klassische stille Fehlgriff — unescaped macht es das vorige Zeichen
    // optional, und die Zusicherung passte auch auf eine URL ohne jeden
    // Suchparameter.
    await page.goto(ziel);
    await page.waitForURL((url) => url.pathname.endsWith("/helfer/check")
      && url.searchParams.get("fz") === E2E_FAHRZEUG_ID);
    await expect(page.getByText(E2E_FAHRZEUG_NAME).first()).toBeVisible();
  });

  /** Der Handlager fuehrt auf die Artikelliste — nicht in eine Fahrzeugwahl. */
  test("der Code des Handlagers fuehrt auf die Artikelliste", async ({ page }) => {
    await page.goto(lagerbuchUrl(`/o/${HANDLAGER_ID}`));
    await page.waitForURL((url) => url.pathname.endsWith("/helfer"));
    await expect(page.getByText("Artikel wählen")).toBeVisible();
  });

  /**
   * ⚠️ OHNE SITZUNG AUFS GATE, NIE NACH /login — und MIT `returnTo`. Das ist
   * der dritte Ausgang der Weiche und der, den ein Quelltext-Scan nicht
   * beweisen kann: ein werfender Riegel schickte jede Helferin ohne Konto nach
   * /login (§11.5, Zustand 18), also genau die Person, fuer die der Einstieg
   * gebaut ist. Der Abruf laeuft deshalb in einem FRISCHEN Kontext ohne die
   * Cookies aus `beforeEach`.
   */
  test("ein Scan ohne Sitzung landet auf dem Gate, mit Rueckkehrziel", async ({ browser }) => {
    const anonym = await browser.newContext();
    const seite = await anonym.newPage();
    await seite.goto(lagerbuchUrl(`/o/${E2E_FAHRZEUG_ID}`));
    await seite.waitForURL((url) =>
      url.searchParams.get("returnTo") === `/o/${E2E_FAHRZEUG_ID}`);
    expect(seite.url()).not.toContain("/login");
    await anonym.close();
  });

  test("waehlt zu Beginn alles aus und schaltet ueber Keine ab", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    const karten = page.locator(".lb-ortkarte");
    const n = await karten.count();
    await expect(page.getByTestId("lb-ort-drucken")).toContainText(`(${n})`);
    await page.getByTestId("lb-ort-keine").click();
    await expect(page.getByTestId("lb-ort-drucken")).toContainText("(0)");
  });

  /**
   * DIE DRUCKZUSAGEN. `emulateMedia` ist der einzige Weg, an dem der
   * `@media print`-Block ueberhaupt sichtbar wird.
   */
  test("blendet im Druck Kaestchen, abgewaehlte Karte und das Chrome aus", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));

    // Eigene Vorbedingung, nicht von einem anderen Test geborgt: der
    // Kaestchen-Nachweis braucht eine ZWEITE, weiterhin gewaehlte Karte.
    const n = await page.locator(".lb-ortkarte").count();
    expect(n, "der Drucktest braucht mindestens zwei Karten").toBeGreaterThan(1);

    await page.locator(".lb-ortkarteWahl").nth(0).uncheck();
    const abgewaehlt = page.locator(".lb-ortkarteAbgewaehlt").nth(0);
    await expect(abgewaehlt).toBeVisible();   // am Bildschirm blass, aber da

    await page.emulateMedia({ media: "print" });

    await expect(abgewaehlt).toBeHidden();                      // display:none
    await expect(page.getByTestId("lb-ort-chrome")).toBeHidden();
    await expect(page.locator(".lb-ortkarteWahl").nth(1)).toBeHidden();
  });

  /**
   * ⚠️ DER TEST, UM DESSENTWILLEN DIESE DATEI EXISTIERT. `@page { size: A7 }`
   * waere gueltiges CSS, bestuende `typecheck`, `lint`, `build` und jeden
   * Quelltext-Scan — und kaeme im Vorgabeformat des Druckers heraus, weil
   * Chromiums Schluesselwortliste bei A5 endet. Erst diese Messung
   * unterscheidet die beiden Faelle.
   *
   * ⚠️ UND SIE PRUEFT ZUGLEICH DIE ZWEITE HAELFTE: Chromium verwirft die
   * CSS-Groesse VOLLSTAENDIG, sobald ein Dokument gemischte Seitengroessen
   * ergibt. Bliebe das Chrome im Druck stehen, kaeme ALLES im Vorgabeformat
   * heraus — dieser Test wuerde dann rot, und zwar an jeder Seite.
   */
  test("druckt A7, ein Etikett je Blatt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    const karten = await page.locator(".lb-ortkarte").count();
    expect(karten, "ohne Karten bewiese die Seitenzahl nichts").toBeGreaterThan(1);

    const seiten = await seitenInMm(page);
    expect(seiten, "ein Blatt je Etikett").toHaveLength(karten);
    for (const s of seiten) {
      expect(s.breite).toBe(A7_BREITE_MM);
      expect(s.hoehe).toBe(A7_HOEHE_MM);
    }
  });

  /**
   * ⚠️ EINE ABGEWAEHLTE KARTE DARF KEIN LEERES BLATT HINTERLASSEN. Sie ist
   * `display: none`, bleibt aber DOM-Geschwister — und der Umbruchselektor
   * `.lb-ortkarte + .lb-ortkarte` trifft die FOLGENDE trotzdem. Ob daraus eine
   * leere Seite wird, entscheidet allein der Browser; kein Scan sieht es.
   */
  test("laesst eine abgewaehlte Karte kein leeres Blatt zuruecklassen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    const karten = await page.locator(".lb-ortkarte").count();
    expect(karten).toBeGreaterThan(1);

    // Die ERSTE abwaehlen: das ist der Fall, in dem ein vorangestellter
    // Zwangsumbruch ein leeres Deckblatt erzeugen wuerde.
    await page.locator(".lb-ortkarteWahl").nth(0).uncheck();

    const seiten = await seitenInMm(page);
    expect(seiten).toHaveLength(karten - 1);
    for (const s of seiten) expect(s.breite).toBe(A7_BREITE_MM);
  });

  /**
   * ⚠️ DER ETIKETTENBOGEN NEBENAN BLEIBT A4. Die benannte `@page a7` steht im
   * SELBEN Stylesheet; waere sie unbenannt — oder truege der A4-Bogen sie
   * versehentlich —, kaemen die gekauften Klebeetiketten ab dann auf 74 x 105 mm
   * heraus, und zwar still. Diese Gegenprobe ist die einzige Stelle, an der das
   * auffiele.
   */
  test("laesst den A4-Etikettenbogen unberuehrt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    const seiten = await seitenInMm(page);
    expect(seiten.length).toBeGreaterThan(0);
    for (const s of seiten) {
      expect(s.breite).not.toBe(A7_BREITE_MM);
      expect(s.hoehe).not.toBe(A7_HOEHE_MM);
    }
  });
});
