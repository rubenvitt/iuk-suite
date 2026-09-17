import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";
import {
  E2E_FAHRZEUG_ANDERES_ID, E2E_FAHRZEUG_ANDERES_NAME,
  E2E_FAHRZEUG_ID, E2E_FAHRZEUG_NAME, E2E_TOKEN_FAHRZEUG,
  LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl,
} from "./helpers/lagerbuch";
import {
  A4_BREITE_MM, A4_HOEHE_MM, ORT_JE_BLATT, nameStufe,
} from "@/app/m/lagerbuch/_lib/ortEtikettMasse";
import { HANDLAGER_ID } from "@/app/m/lagerbuch/_lib/konstanten";

/**
 * DIE ORTSKARTEN — DRK-312, acht Karten je A4-Blatt seit DRK-388.
 *
 * ⚠️ DREI AUSSAGEN DIESER DATEI KANN SONST NICHTS IM REPO PRUEFEN, und alle
 * drei sind genau die Akzeptanzkriterien des Tickets:
 *
 *   1. DAS FORMAT. `@page`-Groessen sind fuer `pnpm build` unsichtbar, und
 *      jsdom hat gar keine Seitenaufteilung — die Zahl kennt nur ein echter
 *      Browser. Sie kommt hier aus der MediaBox eines wirklich erzeugten PDF.
 *   2. „ACHT KARTEN JE BLATT". Dieselbe Messung zaehlt die Seiten — und das
 *      ist die einzige Stelle im Repo, die den Unterschied zwischen einem
 *      Raster, das aufgeht, und einem, das eine Zeile auf die naechste Seite
 *      schiebt, ueberhaupt sehen kann.
 *   3. „EIN TESTDRUCK LAESST SICH SCANNEN UND FUEHRT ZUM RICHTIGEN KONTEXT."
 *      Eine Zusicherung auf ein vorhandenes `<svg>` bliebe gruen, wenn der Code
 *      den falschen Inhalt truege. Hier wird der QR aus den PIXELN
 *      zurueckdekodiert und die dekodierte Adresse danach WIRKLICH AUFGERUFEN —
 *      der Test folgt also demselben Weg wie ein Telefon am Fahrzeug.
 *
 * ⚠️ KEIN WARMLAUF-GET NOETIG (Falle 10): diese Datei loest keinen POST aus.
 * Kein `klickeWennRuhig` (Falle 12): sie navigiert mit `goto` statt zu klicken.
 *
 * ⚠️ SEIT DRK-406 SCHREIBT SIE — und zwar schon beim ERSTEN `goto` auf
 * `/verwaltung/ortsetiketten`. Die Seite zieht jeden fehlenden Ortscode nach
 * (`_lib/schreibpfade/ortCodes.ts`); Playwright faehrt alle Specs in EINEM
 * Worker gegen EINE SQLite-Datei, die Zeilen bleiben also fuer die folgenden
 * Specs stehen.
 *
 * ⚠️ DAS IST UNSCHAEDLICH, UND ZWAR AUS EINEM NACHPRUEFBAREN GRUND: der Vorgang
 * ist REIN ADDITIV. Er legt Zeilen in `tokens` an, die es vorher nicht gab, und
 * fasst keine bestehende an — kein Code wird gesperrt, kein `ziel_typ`
 * geaendert, keiner der vier E2E-Codes beruehrt. Eine Spec, die auf
 * `E2E_TOKEN_*` zaehlt, sieht davon nichts.
 *
 * ⚠️ WER HIER EINE ZUSICHERUNG AUF DIE ZAHL DER TOKEN-ZEILEN SCHREIBT, schreibt
 * sie auf einen Wert, der von der REIHENFOLGE der Spec-Dateien abhaengt. Die
 * Codes dieser Karten werden deshalb GELESEN, nie erwartet.
 *
 * Die zweite Schreibspur ist dieselbe wie vorher: der Kaertchen-Test loest
 * einen Code wirklich ein und setzt dessen `tokens.last_used_at`. Das Schema
 * fuehrt das Feld als „reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit"
 * (`_db/schema.ts`).
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

/**
 * MISST JE NAME, OB DIE KARTE IHN GANZ ZEIGT — im Browser, an der echten Karte.
 *
 * ⚠️ DIE KLAMMER WIRD KURZ AUFGEHOBEN, und das ist der Kern der Messung: mit
 * ihr laeuft NIE etwas ueber (sie kuerzt ja gerade), ohne sie steht die volle
 * Hoehe da, die der Name braeuchte. Erst der Vergleich beider beantwortet
 * „passt der ganze Name?".
 *
 * ⚠️ SIE LAEUFT IM BROWSER (`page.evaluate`) und darf deshalb nichts aus diesem
 * Modul schliessen — die Stufenklasse kommt fertig von aussen herein, aus
 * derselben Funktion, die auch die Insel benutzt.
 */
function misstNamen(faelle: { name: string; klasse: string }[]) {
  const karte = document.querySelector(".lb-ortkarte") as HTMLElement;
  const huelle = karte.querySelector(".lb-ortkarteName") as HTMLElement;
  const text = karte.querySelector(".lb-ortkarteNameText") as HTMLElement;
  return faelle.map(({ name, klasse }) => {
    huelle.className = `lb-ortkarteName ${klasse}`;
    text.textContent = name;

    const gekappteHoehe = text.getBoundingClientRect().height;
    const vorher = text.style.webkitLineClamp;
    text.style.webkitLineClamp = "none";
    const volleHoehe = text.scrollHeight;
    text.style.webkitLineClamp = vorher;

    return {
      name,
      klasse,
      /** Der ganze Name braucht mehr Platz, als die Karte hat. */
      gekappt: volleHoehe > huelle.clientHeight,
      /** Die Klammer greift wirklich — sonst waere der Schnitt still. */
      sichtbarGekuerzt: volleHoehe > gekappteHoehe + 1,
      karteUeberlauf: karte.scrollHeight > karte.clientHeight,
    };
  });
}

test.describe("Ortsetiketten (Bogen)", () => {
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

    /*
     * ⚠️ SEIT DRK-406 TRAEGT DIE KARTE IHREN ZUGANGS-CODE, nicht mehr ihre
     * Ortsadresse — `/t/<code>` statt `/o/<id>`. Der Code wird HIER GELESEN und
     * nicht als Konstante erwartet: er entsteht beim Oeffnen dieser Seite und
     * ist in keiner Vorrichtung festgeschrieben. Ein erwarteter Literalwert
     * waere eine Zusage ueber eine Ziehung, die niemand gegeben hat.
     */
    expect(ziel).toMatch(new RegExp(`^${lagerbuchUrl("/t/")}\\d{3}-\\d{3}$`));
    /*
     * Der Fuss nennt denselben Zugang — abtippbar, fuer ein Telefon ohne Kamera.
     *
     * ⚠️ `toContainText` UND NICHT `toHaveText`, und das ist kein Geschmack:
     * `.lb-ortkarteUrl` traegt seit DRK-406 ZWEI Dinge — den verschachtelten
     * `Code NNN-NNN`-Span und danach die Adresse. Playwrights `toHaveText` mit
     * einer Zeichenkette verlangt Gleichheit des GESAMTEN normalisierten
     * Textes; die Zusicherung faellt damit an jeder korrekt gerenderten Karte.
     * Vor diesem Ticket ging sie durch, weil der Fuss nur die Adresse trug.
     *
     * ⚠️ DIE SCHAERFE HOLT DIE ZEILE DARUNTER ZURUECK: `toContainText` allein
     * bliebe auch dann gruen, wenn daneben noch die alte Ortsadresse stuende.
     */
    await expect(karte.locator(".lb-ortkarteUrl")).toContainText(ziel);
    await expect(karte.locator(".lb-ortkarteUrl"))
      .not.toContainText(`/o/${E2E_FAHRZEUG_ID}`);
    await expect(karte.locator(".lb-ortkarteCode"))
      .toHaveText(`Code ${ziel.slice(-7)}`);

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
   * DRK-406 — DER GANZE WEG: Karte drucken, abgemeldet scannen, am Regal stehen.
   *
   * ⚠️ NUR HIER TREFFEN SICH DIE BEIDEN HAELFTEN. Vitest haelt fest, WAS auf
   * der Karte steht, und `lagerbuch-helfer.spec.ts` haelt fest, dass ein Code
   * ohne Anmeldung einloest — aber keiner von beiden merkt, wenn die Karte den
   * FALSCHEN Code truege. Der QR wird deshalb aus den PIXELN zurueckdekodiert
   * und die dekodierte Adresse danach WIRKLICH aufgerufen, in einem frischen
   * Kontext OHNE die Cookies aus `beforeEach`.
   *
   * ⚠️ DIE ZWEITE HAELFTE IST DIE REICHWEITE, und sie kann sonst nichts
   * pruefen: mit dem Regal-Code gibt es Box und Check NICHT. Das ist die
   * sicherheitsrelevante Halbzeile des Tickets — wer die Karte am Regal
   * abfotografiert, bekommt den Bestand, aber keinen Check.
   *
   * ⚠️ BIS DRK-406 STAND HIER EINE AUSWAHL („QR auf der Handlager-Karte") und
   * die Gegenprobe, dass die FAHRZEUGkarte ihre Ortsadresse behaelt. Beides ist
   * mit der Betreiberentscheidung vom 17.09.2026 entfallen: jede Karte traegt
   * jetzt ihren eigenen Code. Der Ausgleich ist das Zuruecksetzen einzelner
   * Codes in der Verwaltung.
   */
  test("die Handlager-Karte fuehrt abgemeldet ans Regal — ohne Box und ohne Check", async ({ page, browser }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));

    /*
     * Die Karte wird ueber ihre BEIZEILE gefunden, nicht ueber ihren Namen:
     * „Handlager" kann auch in einem Einheitennamen stecken. `standortMeta`
     * gibt fuer den Handlager „Lager" und fuer jede Einheit „Fahrzeug …" oder
     * „Tasche" — die Beizeile trennt also genau die beiden Arten.
     */
    const metas = await page.locator(".lb-ortkarteMeta").allTextContents();
    const index = metas.findIndex((m) => m.trim() === "Lager");
    expect(index, "der Seed muss eine Handlager-Karte liefern").toBeGreaterThanOrEqual(0);
    const karte = page.locator(".lb-ortkarte").nth(index);

    const ziel = await decodeQr(await karte.locator(".lb-ortkarteQr").innerHTML());
    expect(ziel).toMatch(new RegExp(`^${lagerbuchUrl("/t/")}\\d{3}-\\d{3}$`));
    await expect(karte.locator(".lb-ortkarteUrl")).toContainText(ziel);
    await expect(karte.locator(".lb-ortkarteUrl")).not.toContainText(`/o/${HANDLAGER_ID}`);

    /*
     * ⚠️ JEDE Karte traegt einen Code — das ist die Zusage des Tickets, und sie
     * ist nur hier zu sehen. `toHaveCount(1)` stand an dieser Stelle bis
     * DRK-406 und sagte das Gegenteil.
     */
    const karten = await page.locator(".lb-ortkarte").count();
    await expect(page.locator(".lb-ortkarteCode")).toHaveCount(karten);

    // Und jetzt der Scan — abgemeldet, wie am Regal.
    const anonym = await browser.newContext();
    const seite = await anonym.newPage();
    await seite.goto(ziel);
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer"));
    await expect(seite.getByText("Artikel wählen")).toBeVisible();

    /*
     * DIE REICHWEITE. Die Reiterleiste fuehrt fuer diesen Zugang nur die
     * Entnahme; Box und Check stehen nicht darin. Das ist Anzeige — der Riegel
     * liegt in den Actions —, aber es ist die Haelfte, die jemand am Regal
     * ueberhaupt zu sehen bekommt.
     */
    const reiter = seite.getByTestId("lb-tableiste");
    await expect(reiter.getByText("Entnahme")).toBeVisible();
    await expect(reiter.getByText("Box")).toHaveCount(0);
    await expect(reiter.getByText("Check")).toHaveCount(0);

    /*
     * ⚠️ UND DIE GETIPPTE ADRESSE KOMMT AUCH NICHT DURCH. Eine ausgeblendete
     * Navigation ist kein Riegel; ohne diese Zeile bewiese der Test nur, dass
     * aufgeraeumt wurde.
     */
    await seite.goto(lagerbuchUrl("/helfer/check"));
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer"));
    await seite.goto(lagerbuchUrl("/helfer/box"));
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer"));

    await anonym.close();
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

  /**
   * ⚠️ DER TEUERSTE STILLE AUSGANG DIESES TICKETS, UND ER WAR EINMAL DA
   * (Codex-Befund P1 zu PR #177). Die Check-Seite gibt der Bindung des
   * Kaertchens ausdruecklich den Vorrang vor `?fz=` (DRK-302: der Parameter ist
   * Nutzereingabe und als Beleg wertlos). Ein `/o/<B>`, das blind auf `?fz=B`
   * zeigte, ergab damit: Adresse sagt B, Bildschirm zeigt A — und der Inhalt
   * von B waere in das Buch von A gezaehlt worden.
   *
   * ⚠️ DER TEST BRAUCHT EINEN FRISCHEN KONTEXT. Mit den Admin-Cookies aus
   * `beforeEach` griffe `helferZugangOderNull` zwar trotzdem zuerst, aber die
   * Lage waere eine andere als die, die er beschreibt: eine Helferin am
   * Fahrzeug hat kein Konto.
   *
   * ⚠️ UND ER PRUEFT DIE ADRESSE, NICHT NUR DIE UEBERSCHRIFT. Die Ueberschrift
   * zeigte auch VOR der Reparatur schon das gebundene Fahrzeug — genau das war
   * das Problem: sie widersprach der Adresse. Gruen wird dieser Test erst,
   * wenn beide dasselbe sagen.
   */
  test("ein gebundenes Kaertchen schlaegt das gescannte Etikett", async ({ browser }) => {
    const helfer = await browser.newContext();
    const seite = await helfer.newPage();

    // Das Kaertchen ist an E2E_FAHRZEUG_ID gebunden.
    await seite.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await seite.waitForURL((url) =>
      url.searchParams.get("fz") === E2E_FAHRZEUG_ID);

    // Gescannt wird das Etikett der ANDEREN Einheit.
    await seite.goto(lagerbuchUrl(`/o/${E2E_FAHRZEUG_ANDERES_ID}`));
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer/check")
      && url.searchParams.get("fz") === E2E_FAHRZEUG_ID);
    /*
     * ⚠️ DIE ZUSAGE IST „GENAU EIN `fz`", NICHT MEHR „DIE GESCANNTE ID KOMMT
     * NICHT VOR" — DRK-373 hat die Grenze verschoben, nicht aufgegeben.
     *
     * Hier stand `expect(seite.url()).not.toContain(E2E_FAHRZEUG_ANDERES_ID)`.
     * Seit DRK-373 reist die gescannte Id als `gescannt=` mit: ohne sie kann die
     * Check-Seite der Person nicht sagen, dass ihr Scan eine andere Einheit
     * meinte, und genau das war der offene Rest dieses Befunds. Was NICHT
     * passieren darf, ist ein zweites `fz` — daran hing der teure Ausgang
     * (Adresse sagt B, Bildschirm zeigt A), und `getAll` ist die Form, die es
     * faengt: ein `searchParams.get("fz")` allein bliebe fuer `?fz=B&fz=A`
     * gruen.
     */
    const adresse = new URL(seite.url());
    expect(adresse.searchParams.getAll("fz")).toEqual([E2E_FAHRZEUG_ID]);
    expect(adresse.searchParams.get("gescannt")).toBe(E2E_FAHRZEUG_ANDERES_ID);
    /*
     * ⚠️ UEBER `data-rolle="check-einheit"`, NICHT UEBER `.first()`. Hier stand
     * `getByText(E2E_FAHRZEUG_NAME).first()`, und mit dem Hinweis aus DRK-373
     * traegt das nichts mehr: der Name der gebundenen Einheit steht jetzt auch
     * IM Hinweis, und der kommt in der Reihenfolge des Dokuments ZUERST.
     * `.first()` haette also den Hinweis gelesen und behauptet, der Check laufe
     * auf dieser Einheit — die Zusicherung waere still zu einer Tautologie
     * geworden.
     */
    await expect(seite.locator("[data-rolle='check-einheit']"))
      .toContainText(E2E_FAHRZEUG_NAME);

    await helfer.close();
  });

  /**
   * DRK-373 — DIE PERSON ERFAEHRT, DASS IHR SCAN NICHT GEGOLTEN HAT.
   *
   * ⚠️ WARUM DAS HIER UND NICHT IN VITEST STEHT. Die Unit-Halbzeit
   * (`helfer/check/page.test.tsx`) rendert die Seite mit einer ATTRAPPE fuer
   * `_ui/ScanHinweis` und pruefte damit nur, WELCHE ZWEI EINHEITEN sie ihm
   * reicht; `_ui/ScanHinweis.test.tsx` prueft den Satz, aber gegen von Hand
   * gesetzte Props. Dazwischen liegen die Weiche `/o/<id>`, ihr `gescannt=` und
   * das Lesen desselben Parameters auf der Check-Seite — drei Stationen, von
   * denen keine ein Tor hinter sich hat: benennt eine Seite den Parameter um,
   * bleibt alles gruen und der Hinweis verschwindet still. Nur ein echter
   * Abruf sieht die Kette.
   */
  test("der uebergangene Scan wird benannt — beide Einheiten", async ({ browser }) => {
    const helfer = await browser.newContext();
    const seite = await helfer.newPage();

    await seite.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await seite.waitForURL((url) => url.searchParams.get("fz") === E2E_FAHRZEUG_ID);

    await seite.goto(lagerbuchUrl(`/o/${E2E_FAHRZEUG_ANDERES_ID}`));
    await seite.waitForURL((url) => url.searchParams.get("gescannt") === E2E_FAHRZEUG_ANDERES_ID);

    const hinweis = seite.locator("[data-rolle='scan-hinweis']");
    await expect(hinweis).toBeVisible();
    // AK 2: beide Einheiten beim Namen — die gescannte UND die gezeigte.
    await expect(hinweis).toContainText(E2E_FAHRZEUG_ANDERES_NAME);
    await expect(hinweis).toContainText(E2E_FAHRZEUG_NAME);

    /*
     * ⚠️ UND DIE GESCANNTE EINHEIT STEHT NUR IM HINWEIS. Ohne diese Zeile waere
     * die Zusicherung oben auch dann gruen, wenn die Seite versehentlich den
     * Check der GESCANNTEN Einheit rendert — dann stuende ihr Name in der
     * Ueberschrift, und der Hinweis daneben laese sich als blosse Notiz. Genau
     * die Verwechslung, gegen die dieses Ticket geschrieben ist.
     *
     * Die zwei Seed-Namen enthalten einander bewusst NICHT („E2E RTW" gegen
     * „E2E Geräte RTW"), sonst waere die Zaehlung wertlos.
     */
    await expect(seite.getByText(E2E_FAHRZEUG_ANDERES_NAME)).toHaveCount(1);
    // Und die positive Haelfte: der Check laeuft auf der GEBUNDENEN Einheit.
    await expect(seite.locator("[data-rolle='check-einheit']"))
      .toContainText(E2E_FAHRZEUG_NAME);

    await helfer.close();
  });

  /**
   * ⚠️ DIE GEGENPROBE, OHNE DIE DER TEST DARUEBER ZU VIEL BEWIESE (AK 3): wer
   * das Etikett SEINER gebundenen Einheit scannt, sieht keinen Hinweis. Das ist
   * der Normalweg — Kaertchen an der Einheit, Etikett an derselben Einheit —,
   * und ein Hinweis darauf waere nicht bloss Ballast: weil er den Regelfall
   * traefe, lernte man ihn in einer Woche zu uebersehen.
   */
  test("das eigene Etikett erzeugt KEINEN Hinweis", async ({ browser }) => {
    const helfer = await browser.newContext();
    const seite = await helfer.newPage();

    await seite.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await seite.waitForURL((url) => url.searchParams.get("fz") === E2E_FAHRZEUG_ID);

    await seite.goto(lagerbuchUrl(`/o/${E2E_FAHRZEUG_ID}`));
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer/check")
      && url.searchParams.get("fz") === E2E_FAHRZEUG_ID);
    expect(new URL(seite.url()).searchParams.has("gescannt")).toBe(false);
    // Die Ueberschrift ist da — die Seite rendert also wirklich den Check und
    // haelt nicht bloss bei einer leeren Flaeche. Ohne diese Zeile waere
    // `toHaveCount(0)` auf den Hinweis darunter auch fuer eine kaputte oder
    // leere Seite gruen.
    await expect(seite.locator("[data-rolle='check-einheit']"))
      .toContainText(E2E_FAHRZEUG_NAME);
    await expect(seite.locator("[data-rolle='scan-hinweis']")).toHaveCount(0);

    await helfer.close();
  });

  /**
   * ⚠️ DIE GEGENPROBE, OHNE DIE DIE ZEILE DARUEBER ZU VIEL BEWIESE: fuer ein
   * LAGER gilt die Bindung nicht. `/helfer` ist die Artikelliste des Handlagers
   * und an keine Einheit gebunden — zoege man die Bindung durch, landete
   * jemand, der am REGAL steht und das Regal-Etikett scannt, im Fahrzeug-Check.
   */
  test("ein gebundenes Kaertchen landet am Handlager trotzdem in der Artikelliste", async ({ browser }) => {
    const helfer = await browser.newContext();
    const seite = await helfer.newPage();

    await seite.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await seite.waitForURL((url) => url.searchParams.get("fz") === E2E_FAHRZEUG_ID);

    await seite.goto(lagerbuchUrl(`/o/${HANDLAGER_ID}`));
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer"));
    await expect(seite.getByText("Artikel wählen")).toBeVisible();

    await helfer.close();
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
   * ⚠️ KEIN NAME WIRD STILL ABGESCHNITTEN — Codex-Befund P2 zu PR #177, und der
   * einzige Test im Repo, der die Aussage halten kann.
   *
   * Vorher schnitt die Karte ab rund 24 Zeichen ab, lautlos: `createFahrzeug`
   * kennt keine Obergrenze, die Karte hat eine feste Hoehe, und
   * `overflow-wrap: anywhere` schafft Trennstellen, aber keinen Platz. Auf
   * einem laminierten Kaertchen sieht niemand, dass da noch etwas stand.
   *
   * ⚠️ „LAEUFT NICHT UEBER" IST HIER DIE FALSCHE FRAGE, und der erste Anlauf
   * dieses Tests ist genau daran blind gewesen (gemessen: er blieb gruen, als
   * ALLE Namen auf die groesste Stufe gezwungen wurden). Die Zeilenklammer
   * verhindert den Ueberlauf ja gerade — sie macht aus einem stillen Schnitt
   * einen sichtbaren. Gefragt ist deshalb: braucht der GANZE Name mehr Platz,
   * als da ist? Gemessen wird das, indem die Klammer kurz aufgehoben und die
   * volle Hoehe des Textes gegen die verfuegbare gehalten wird.
   *
   * ⚠️ DIE NAMEN KOMMEN NICHT AUS DEM SEED, UND DAS IST ABSICHT. Eine AKTIVE
   * Fixture mit langem Namen stuende auf dem Checklisten- UND auf dem
   * Etikettenbogen; `e2e/seed-lagerbuch.ts` schreibt an `einheitenartFixtures`
   * ausdruecklich aus, dass ihre Einheiten deshalb inaktiv bleiben — „sonst
   * zaehlten zwei fremde Specs ploetzlich anders". Gemessen wird stattdessen
   * die ECHTE Karte auf der ECHTEN Seite: nur ihr Text und ihre Stufenklasse
   * werden ausgetauscht, und die Klasse kommt aus DERSELBEN Funktion, die die
   * Insel benutzt — die Regel wird also nicht zweitgeschrieben, nur angewandt.
   *
   * ⚠️ GEMESSEN WIRD IM DRUCKMEDIUM. Am Bildschirm steht dieselbe Karte, aber
   * die Zusage gilt dem Papier.
   */
  test("zeigt realistische Namen VOLLSTAENDIG, in jeder Laenge", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await page.emulateMedia({ media: "print" });

    const befunde = await page.evaluate(misstNamen, [
      "RTW 1",
      // Der Fall, der die Wortspalte erzwungen hat: kurz genug fuer die
      // groesste Stufe, aber „Sanitätstasche" allein ist dort zu breit.
      "Sanitätstasche 1",
      "Rucksack Betreuung Einsatzeinheit 3",
      "Mannschaftstransportwagen der Bereitschaft Nord Reserve 2",
      "Mannschaftstransportwagen der Bereitschaft Nord, Reservefahrzeug zwei",
    ].map((name) => ({ name, klasse: nameStufe(name) })));

    for (const b of befunde) {
      expect(b.gekappt, `${b.klasse}: „${b.name}" wird gekuerzt`).toBe(false);
      expect(b.karteUeberlauf, `${b.klasse}: „${b.name}" sprengt die Karte`).toBe(false);
    }
  });

  /**
   * ⚠️ DIE ANDERE HAELFTE DERSELBEN ZUSAGE: was NICHT mehr passt, hoert
   * SICHTBAR auf. Unter 9pt weiter zu verkleinern waere eine Scheinloesung —
   * ein unlesbarer Name ist kein besserer als ein gekuerzter. Die Karte darf
   * dabei trotzdem nicht ueberlaufen, sonst landete das „…" ausserhalb des
   * Blattes.
   */
  test("kuerzt einen unsinnig langen Namen sichtbar, statt ihn abzuschneiden", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await page.emulateMedia({ media: "print" });

    /*
     * ⚠️ DIE WIEDERHOLUNGSZAHL IST MIT DEM FORMAT GEWACHSEN (12 → 40), und das
     * ist kein Zurechtbiegen des Tests, sondern seine Vorbedingung: das
     * Namensfeld der Querkarte ist 181px hoch statt 89px und traegt bei 9pt
     * zwoelf Zeilen statt sechs. 204 Zeichen passen darin gemessen VOLLSTAENDIG
     * — der Test maesse dann nichts mehr und bliebe trotzdem gruen, wenn die
     * erste Zusicherung darunter nicht genau das abfinge.
     */
    const name = "Sehr langer Name ".repeat(40);
    const [b] = await page.evaluate(misstNamen, [{ name, klasse: nameStufe(name) }]);

    expect(b!.gekappt, "so ein Name MUSS gekuerzt werden — sonst misst der Test nichts").toBe(true);
    expect(b!.sichtbarGekuerzt, "gekuerzt, aber ohne sichtbares Zeichen dafuer").toBe(true);
    expect(b!.karteUeberlauf).toBe(false);
  });

  /**
   * ⚠️ NICHTS UNBEGRENZTES DARF DEN NAMEN SCHRUMPFEN — Codex P2, zweite und
   * dritte Runde. Zwei Angaben auf der Karte sind unbegrenzt: die Adresse im
   * Fuß (sie hängt an `SUITE_HOST_LAGERBUCH`) und die Kennung in der Beizeile
   * (`lagerorte.kennung` kennt keine Obergrenze). Beide standen zwischen dem
   * Namen und dem Kartenrand, beide nahmen ihm Höhe — und die Stufentabelle
   * des Namens ist gegen eine FESTE Höhe gemessen.
   *
   * Der zweite Befund saß dabei genau an einer Stelle, an der ein Kommentar von
   * mir das Gegenteil behauptete.
   *
   * Die Adresse im Fuß wächst mit `SUITE_HOST_LAGERBUCH`. Wuchs sie um eine
   * Zeile, schrumpfte der Namenskasten (gemessen 99px → 89px), während die
   * Zeilenklammer des Namens bei ihrer festen Zahl blieb — `overflow: hidden`
   * schnitt dann VOR der letzten Zeile und damit VOR den Auslassungspunkten.
   * Der stille Schnitt wäre zurück gewesen, abhängig von einer
   * Umgebungsvariablen.
   *
   * ⚠️ DER TEST ÄNDERT DEN HOST NICHT — er kann es nicht: `SUITE_HOST_LAGERBUCH`
   * steht im `webServer` und gilt für den ganzen Lauf. Er tauscht stattdessen
   * den TEXT der Fußzeile gegen Adressen verschiedener Länge und misst, ob der
   * Namensplatz konstant bleibt. Das ist genau die Größe, an der die gemessene
   * Stufentabelle hängt.
   */
  test("laesst den Namensplatz weder von der Adresse noch von der Kennung abhaengen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await page.emulateMedia({ media: "print" });

    const befunde = await page.evaluate((faelle) => {
      const karte = document.querySelector(".lb-ortkarte")!;
      const huelle = karte.querySelector(".lb-ortkarteName") as HTMLElement;
      const meta = karte.querySelector(".lb-ortkarteMeta") as HTMLElement;
      const fuss = karte.querySelector(".lb-ortkarteUrl") as HTMLElement;
      const kasten = karte.getBoundingClientRect();
      return faelle.map(({ was, beizeile, adresse }) => {
        meta.textContent = beizeile;
        fuss.textContent = adresse;
        const m = meta.getBoundingClientRect();
        return {
          was,
          platz: huelle.clientHeight,
          karteUeberlauf: karte.scrollHeight > karte.clientHeight,
          ragtSeitlich: m.left < kasten.left - 0.5 || m.right > kasten.right + 0.5,
        };
      });
    }, [
      { was: "kurz/kurz", beizeile: "Lager", adresse: "http://a.de/o/x" },
      { was: "Messgrundlage", beizeile: "Fahrzeug · HN-DRK-1101",
        adresse: "http://lagerbuch.iuk-ue.de/o/V1StGXR8_Z5jdHi6B-myT" },
      { was: "langer Host", beizeile: "Fahrzeug · HN-DRK-1101",
        adresse: "https://lagerbuch.drk-bereitschaft-musterstadt-nord.example.org/o/V1StGXR8_Z5jdHi6B-myT" },
      { was: "lange Kennung", beizeile: "Fahrzeug · HN-DRK-1101-RESERVE-NORD-STANDORT-FEUERWACHE-2026",
        adresse: "http://lagerbuch.iuk-ue.de/o/V1StGXR8_Z5jdHi6B-myT" },
      // Ohne Trennstellen — der Fall, der seitlich aus der Karte ragte.
      { was: "Kennung ohne Trennstellen", beizeile: `Fahrzeug · ${"K".repeat(120)}`,
        adresse: "http://lagerbuch.iuk-ue.de/o/V1StGXR8_Z5jdHi6B-myT" },
      { was: "beides lang", beizeile: `Fahrzeug · ${"K".repeat(60)}`,
        adresse: `https://${"x".repeat(140)}.example.org/o/V1StGXR8_Z5jdHi6B-myT` },
    ]);

    const werte = [...new Set(befunde.map((b) => b.platz))];
    expect(werte, `Namensplatz schwankt: ${JSON.stringify(befunde)}`).toHaveLength(1);
    for (const b of befunde) {
      expect(b.karteUeberlauf, `${b.was}: Karte laeuft ueber`).toBe(false);
      expect(b.ragtSeitlich, `${b.was}: Beizeile ragt aus der Karte`).toBe(false);
    }
  });

  /**
   * ⚠️ UND DIE KARTEN, DIE WIRKLICH AUF DEM BOGEN STEHEN, WERDEN AUCH NICHT
   * GEKUERZT. Die Tests darueber tauschen Text aus; dieser hier fasst nichts an
   * und misst, was der Seed tatsaechlich druckt — sonst bliebe die Zusage an
   * einem Fall haengen, den der Test selbst hergestellt hat.
   */
  test("zeigt die tatsaechlich gedruckten Karten vollstaendig", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await page.emulateMedia({ media: "print" });
    const gekuerzt = await page.$$eval(".lb-ortkarte", (karten) => karten
      .filter((k) => {
        const huelle = k.querySelector(".lb-ortkarteName") as HTMLElement;
        const text = k.querySelector(".lb-ortkarteNameText") as HTMLElement;
        const vorher = text.style.webkitLineClamp;
        text.style.webkitLineClamp = "none";
        const voll = text.scrollHeight;
        text.style.webkitLineClamp = vorher;
        return voll > huelle.clientHeight || k.scrollHeight > k.clientHeight;
      })
      .map((k) => k.querySelector(".lb-ortkarteName")?.textContent ?? ""));
    expect(gekuerzt).toEqual([]);
  });

  /**
   * ⚠️ DER UNTERSCHEIDER ZWEIER GLEICHNAMIGER EINHEITEN MUSS GANZ DASTEHEN —
   * Codex, sechste Runde, und der Befund war die Korrektur eines eigenen
   * Fehlgriffs: die Id an die Beizeile zu haengen legte sie in das eine Feld,
   * dessen Regel sie verbirgt (eine Zeile, `text-overflow`). Gemessen reichte
   * die Zeile fuer „Tasche · <id>" (30 Zeichen) gerade noch, fuer „nicht
   * zugeordnet · <id>" (40 Zeichen, 282 von 212px) nicht mehr — zwei Karten
   * laesen sich dann WIEDER gleich, und die Reparatur haette nur so
   * ausgesehen, als wirkte sie.
   *
   * ⚠️ GEPRUEFT WIRD DER PLATZ, NICHT DAS MARKUP. Ein `toBeVisible()` bliebe
   * gruen, waehrend `text-overflow` das Ende abschneidet oder die Klammer die
   * Zeile aus dem Fuss schiebt. Dass die INSEL den Unterscheider wirklich dort
   * hinsetzt, haelt `OrtsetikettenBogen.test.tsx` daneben; dieser Test haelt,
   * dass an dieser Stelle Platz IST.
   */
  test("gibt dem Unterscheider im Fuss Platz, der nicht gekuerzt wird", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await page.emulateMedia({ media: "print" });

    const befund = await page.evaluate((id) => {
      const karte = document.querySelector(".lb-ortkarte")!;
      const fuss = karte.querySelector(".lb-ortkarteUrl") as HTMLElement;
      const meta = karte.querySelector(".lb-ortkarteMeta") as HTMLElement;
      // Der Kollisionsfall, so wie `ortEtikettenDaten` ihn liefert — dazu die
      // laengste reale Beizeile, weil genau sie den alten Ort gesprengt hat.
      meta.textContent = "nicht zugeordnet";
      /*
       * ⚠️ MIT EINER LANGEN ADRESSE, und ohne die bewiese der Test nichts: bei
       * der kurzen Seed-Adresse bleiben im Fuss zwei der drei Zeilen frei, und
       * der Unterscheider passt dann an JEDER Stelle. Knapp wird es erst, wenn
       * die Adresse den Fuss fuellt — genau dort entscheidet sich, ob „vorn"
       * wirklich traegt.
       */
      fuss.textContent =
        `https://lagerbuch.drk-bereitschaft-musterstadt-nord.example.org/o/${id}`;
      /*
       * ⚠️ MIT DEM CODE DANEBEN — seit DRK-406, und ohne ihn misst der Test
       * eine Karte, die es nicht mehr gibt. Bis dahin trug nur die
       * Handlager-Karte einen Code, dieser Fuss hier also nie; jetzt hat JEDE
       * Karte einen, und der Kollisionsfall bringt beides mit. Die Kennzeile
       * ist die Stelle, an der sie sich EINE Zeile teilen — genau das ist der
       * Platz, den dieser Test nachmisst.
       */
      const kennzeile = document.createElement("span");
      kennzeile.className = "lb-ortkarteKennzeile";
      const marke = document.createElement("span");
      marke.className = "lb-ortkarteUnterscheidung";
      marke.textContent = id;
      const code = document.createElement("span");
      code.className = "lb-ortkarteCode";
      code.textContent = "Code 123-456";
      kennzeile.append(marke, document.createTextNode(" · "), code);
      fuss.prepend(kennzeile);

      const m = marke.getBoundingClientRect();
      const f = fuss.getBoundingClientRect();
      return {
        text: marke.textContent,
        seitlichGekuerzt: marke.scrollWidth > marke.clientWidth + 0.5,
        ausDemFussGefallen: m.bottom > f.bottom + 0.5 || m.top < f.top - 0.5,
        karteUeberlauf: karte.scrollHeight > karte.clientHeight,
        /*
         * ⚠️ UND DIE ADRESSE MUSS GANZ DABLEIBEN. Der Unterscheider allein
         * bewiese zu wenig: stuenden er und der Code in ZWEI Zeilen, bliebe der
         * Adresse nur eine — und bei diesem Host faellt ihr Ende weg, also
         * genau das, was jemand abtippt, wenn die Kamera streikt.
         */
        kennzeilen: fuss.querySelectorAll(".lb-ortkarteKennzeile").length,
        adresseGekuerzt: fuss.scrollHeight > fuss.clientHeight + 0.5,
      };
    }, "V1StGXR8_Z5jdHi6B-myT");

    expect(befund.text).toBe("V1StGXR8_Z5jdHi6B-myT");
    expect(befund.seitlichGekuerzt, "der Unterscheider wird seitlich gekuerzt").toBe(false);
    expect(befund.ausDemFussGefallen, "der Unterscheider liegt ausserhalb des Fusses").toBe(false);
    expect(befund.karteUeberlauf).toBe(false);
    expect(befund.kennzeilen, "Unterscheider und Code teilen sich EINE Zeile").toBe(1);
    expect(befund.adresseGekuerzt, "das Ende der Adresse faellt weg").toBe(false);
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
  test("druckt A4 mit acht Karten je Blatt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    const karten = await page.locator(".lb-ortkarte").count();
    expect(karten, "ohne Karten bewiese die Seitenzahl nichts").toBeGreaterThan(1);

    const seiten = await seitenInMm(page);
    expect(seiten, "der Seed passt auf ein Blatt")
      .toHaveLength(Math.ceil(karten / ORT_JE_BLATT));
    for (const s of seiten) {
      expect(s.breite).toBe(A4_BREITE_MM);
      expect(s.hoehe).toBe(A4_HOEHE_MM);
    }

    /*
     * ⚠️ DIE ZEILE DARUEBER IST DIE HAELFTE DES TESTS, UND ALLEIN WAERE SIE
     * WERTLOS (Codex-Befund P2 zu diesem PR). Der Seed liefert vier Karten — den
     * Handlager und drei aktive Einheiten. `Math.ceil(4 / 8)` ist 1, und EINE
     * Seite kommt bei vier Karten auch dann heraus, wenn je Blatt nur vier
     * stehen. Die Zusage „acht je Blatt" beruehrt der Seed also gar nicht.
     *
     * Gemessen wird sie deshalb an der GRENZE, und zwar an der PAGINIERUNG
     * selbst: acht Karten muessen EIN Blatt ergeben, neun ZWEI. Die
     * Rasterprobe daneben kann das nicht leisten — sie liest Kaesten im
     * Browser, und ob die neunte Karte auf die zweite Seite faellt, entscheidet
     * erst Chromiums Seitenaufteilung beim Erzeugen des PDF.
     *
     * ⚠️ AUFGEFUELLT WIRD MIT KOPIEN DER ERSTEN KARTE. Sie traegt denselben QR
     * und denselben Namen — fuer die Frage „wie viele Kaesten passen auf ein
     * Blatt?" ist das gleichgueltig, und eine Fixture im Seed waere teuer: eine
     * AKTIVE Einheit steht auch auf dem Checklisten- und auf dem
     * Etikettenbogen, und `e2e/seed-lagerbuch.ts` schreibt ausdruecklich aus,
     * dass deshalb zwei fremde Specs ploetzlich anders zaehlten.
     */
    const aufKarten = (n: number) => page.evaluate((ziel) => {
      const bogen = document.querySelector(".lb-ortbogen")!;
      const vorlage = bogen.querySelector(".lb-ortkarte")!;
      let da = bogen.querySelectorAll(".lb-ortkarte").length;
      while (da > ziel) { bogen.querySelector(".lb-ortkarte")!.remove(); da--; }
      while (da < ziel) { bogen.appendChild(vorlage.cloneNode(true)); da++; }
      return bogen.querySelectorAll(".lb-ortkarte").length;
    }, n);

    for (const [anzahl, blaetter] of [[8, 1], [9, 2], [16, 2], [17, 3]] as const) {
      expect(await aufKarten(anzahl), "auffuellen").toBe(anzahl);
      const gemessen = await seitenInMm(page);
      expect(gemessen, `${anzahl} Karten ergeben ${blaetter} Blatt`).toHaveLength(blaetter);
      for (const s of gemessen) {
        expect(s.breite).toBe(A4_BREITE_MM);
        expect(s.hoehe).toBe(A4_HOEHE_MM);
      }
    }
  });

  /**
   * ⚠️ DIE GEGENPROBE ZUR SEITENZAHL, UND OHNE SIE BEWIESE SIE WENIG: bei einem
   * Seed mit weniger als acht Karten kommt EINE Seite heraus, egal wie das
   * Raster steht — auch bei einer einzigen Spalte. Dieser Fall fuellt den Bogen
   * kuenstlich auf und misst, wo die Karten wirklich liegen: acht Kaesten, zwei
   * verschiedene linke Kanten, vier verschiedene obere. Ein einspaltiger Bogen
   * (`auto-fill` gegen einen zu grossen Rand) faellt hier auf, und zwar bevor
   * jemand acht halbleere Blaetter aus dem Drucker holt.
   */
  test("legt die Karten in zwei Spalten zu vier Zeilen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    await page.emulateMedia({ media: "print" });

    const raster = await page.evaluate((jeBlatt) => {
      const bogen = document.querySelector(".lb-ortbogen") as HTMLElement;
      const vorlage = bogen.querySelector(".lb-ortkarte") as HTMLElement;
      // Der Bogen bekommt genau die Breite, die er auf dem Papier hat
      // (A4 minus zweimal Seitenrand) — am Bildschirm ist er breiter, und
      // `auto-fill` legte dort mehr Spalten nebeneinander.
      bogen.style.width = "202mm";
      while (bogen.querySelectorAll(".lb-ortkarte").length < jeBlatt) {
        bogen.appendChild(vorlage.cloneNode(true));
      }
      const kaesten = [...bogen.querySelectorAll(".lb-ortkarte")]
        .slice(0, jeBlatt)
        .map((k) => k.getBoundingClientRect());
      const rund = (n: number) => Math.round(n);
      return {
        spalten: new Set(kaesten.map((r) => rund(r.left))).size,
        zeilen: new Set(kaesten.map((r) => rund(r.top))).size,
        hoeheGesamt: rund(kaesten[kaesten.length - 1]!.bottom - kaesten[0]!.top),
      };
    }, ORT_JE_BLATT);

    expect(raster.spalten, "zwei Spalten").toBe(2);
    expect(raster.zeilen, "vier Zeilen").toBe(4);
    // 289mm bedruckbare Hoehe bei 4mm Rand — in Pixeln: 289 / 25.4 * 96.
    expect(raster.hoeheGesamt).toBeLessThanOrEqual(Math.round((289 / 25.4) * 96));
  });

  /**
   * ⚠️ EINE ABGEWAEHLTE KARTE DARF KEINE LUECKE IM RASTER HINTERLASSEN. Sie ist
   * `display: none`, bleibt aber DOM-Geschwister; ob das Raster darueber
   * zusammenrueckt oder ein Platz leer stehen bleibt, entscheidet allein der
   * Browser, und kein Scan sieht es. Gemessen wird beides auf einmal: die
   * verbliebenen Karten fuellen den Bogen weiterhin von oben links, und die
   * Seitenzahl richtet sich nach den GEDRUCKTEN Karten, nicht nach allen.
   */
  test("laesst eine abgewaehlte Karte keine Luecke im Raster", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));
    const karten = await page.locator(".lb-ortkarte").count();
    expect(karten).toBeGreaterThan(1);

    // Die ERSTE abwaehlen: nur so zeigt sich, ob die zweite Karte wirklich
    // nach vorn rueckt statt auf ihrem Platz zu bleiben.
    await page.locator(".lb-ortkarteWahl").nth(0).uncheck();
    await page.emulateMedia({ media: "print" });

    const ersteLinks = await page.evaluate(() => {
      const bogen = document.querySelector(".lb-ortbogen")!.getBoundingClientRect();
      const sichtbar = [...document.querySelectorAll(".lb-ortkarte")]
        .filter((k) => (k as HTMLElement).offsetParent !== null
          || k.getBoundingClientRect().height > 0);
      const r = sichtbar[0]!.getBoundingClientRect();
      return { dx: Math.round(r.left - bogen.left), dy: Math.round(r.top - bogen.top) };
    });
    expect(ersteLinks, "die erste gedruckte Karte sitzt oben links").toEqual({ dx: 0, dy: 0 });

    const seiten = await seitenInMm(page);
    expect(seiten).toHaveLength(Math.ceil((karten - 1) / ORT_JE_BLATT));
    for (const s of seiten) expect(s.breite).toBe(A4_BREITE_MM);
  });

  /**
   * ⚠️ DER ETIKETTENBOGEN NEBENAN BEHAELT SEINEN EIGENEN RAND. Die benannte
   * `@page ortbogen` steht im SELBEN Stylesheet und setzt 4mm; die unbenannte
   * Regel setzt 8mm. Waere die benannte unbenannt — oder truege der
   * Etikettenbogen sie versehentlich —, ruecken die gekauften Klebeetiketten um
   * 4mm, und zwar still: die Stanzung liegt dann neben dem Aufdruck. Diese
   * Gegenprobe ist die einzige Stelle, an der das auffiele.
   */
  test("laesst den Etikettenbogen unberuehrt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    const oben = await page.evaluate(() => {
      const e = document.querySelector(".lb-etikett");
      return e ? Math.round(e.getBoundingClientRect().top) : null;
    });
    expect(oben, "ohne Etikett bewiese der Test nichts").not.toBeNull();

    /*
     * ⚠️ ER TRAEGT GAR KEINE CSS-SEITENGROESSE, UND DAS IST DER STAND, DEN
     * DIESER TEST HAELT — nicht „er ist A4". Die unbenannte `@page`-Regel setzt
     * nur einen Rand; ohne `size` nimmt Chromium das Vorgabeformat des
     * Druckers, hier Letter. Genau daran ist zu erkennen, dass die benannte
     * Regel der Karten ihn NICHT erreicht: truege er sie, kaemen 210 x 297 mm
     * heraus.
     */
    const seiten = await seitenInMm(page);
    expect(seiten.length).toBeGreaterThan(0);
    for (const s of seiten) {
      expect(
        s.breite === A4_BREITE_MM && s.hoehe === A4_HOEHE_MM,
        `der Etikettenbogen traegt die Seite der Ortskarten (${s.breite} x ${s.hoehe} mm)`,
      ).toBe(false);
    }
  });
});
