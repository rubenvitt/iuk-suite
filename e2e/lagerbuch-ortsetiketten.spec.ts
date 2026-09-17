import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";
import {
  E2E_FAHRZEUG_ANDERES_ID, E2E_FAHRZEUG_ANDERES_NAME,
  E2E_FAHRZEUG_ID, E2E_FAHRZEUG_NAME, E2E_TOKEN_FAHRZEUG, E2E_TOKEN_HELFER,
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
 * ⚠️ SIE HINTERLAESST FAST NICHTS. Playwright faehrt alle Specs in EINEM Worker
 * gegen EINE SQLite-Datei; gelesen wird ausschliesslich — mit EINER Ausnahme:
 * der Kaertchen-Test (DRK-395) loest `E2E_TOKEN_HELFER` wirklich ein und setzt
 * damit dessen `tokens.last_used_at`. Das ist folgenlos und ausdruecklich
 * vorgesehen: das Schema fuehrt das Feld als „reines Anzeigefeld, OHNE Einfluss
 * auf Gueltigkeit" (`_db/schema.ts`), und Ruling A9 reserviert genau diesen
 * Code fuer echte Einloese-Laeufe — die Codes, an deren `last_used_at` eine
 * andere Spec haengt, sind andere (`lagerbuch-hosts.spec.ts`).
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
   * DRK-395 — DER GANZE WEG, DEN DER BETREIBER GEMELDET HAT: Karte drucken,
   * abgemeldet scannen, am Regal stehen.
   *
   * ⚠️ NUR HIER TREFFEN SICH DIE BEIDEN HAELFTEN. Vitest haelt fest, WAS auf
   * der Karte steht, und `lagerbuch-helfer.spec.ts` haelt fest, dass ein Code
   * ohne Anmeldung einloest — aber keiner von beiden merkt, wenn die Karte den
   * FALSCHEN Code truege. Der QR wird deshalb aus den PIXELN zurueckdekodiert
   * und die dekodierte Adresse danach WIRKLICH aufgerufen, in einem frischen
   * Kontext OHNE die Cookies aus `beforeEach`.
   *
   * ⚠️ DIE GEGENPROBE AN DER FAHRZEUGKARTE GEHOERT DAZU. Die
   * Betreiberentscheidung gilt dem Regal, nicht den Einheiten; ein Kaertchen
   * auf der Fahrzeugkarte oeffnete den Check dieses Fahrzeugs fuer jeden, der
   * die Karte abfotografiert. Ohne diese Zeile wuechse die Entscheidung still
   * mit.
   */
  test("mit Zugangs-Code fuehrt die Handlager-Karte abgemeldet ans Regal", async ({ page, browser }) => {
    await page.goto(lagerbuchUrl("/verwaltung/ortsetiketten"));

    /*
     * Die Karte wird ueber IHRE ADRESSE gefunden, nicht ueber ihren Namen:
     * „Handlager" kann auch in einem Einheitennamen stecken, `/o/handlager`
     * nicht. Der Index wird VOR der Wahl genommen — danach traegt der Fuss
     * die Kaertchen-Adresse und die Suche liefe ins Leere.
     */
    const fuesse = await page.locator(".lb-ortkarteUrl").allTextContents();
    const index = fuesse.findIndex((u) => u.includes(`/o/${HANDLAGER_ID}`));
    expect(index, "der Seed muss eine Handlager-Karte liefern").toBeGreaterThanOrEqual(0);
    const karte = page.locator(".lb-ortkarte").nth(index);

    await page.getByLabel("QR auf der Handlager-Karte").click();
    await page.locator(".ant-select-item-option", { hasText: E2E_TOKEN_HELFER }).click();

    const ziel = await decodeQr(await karte.locator(".lb-ortkarteQr").innerHTML());
    expect(ziel).toBe(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    // Der Fuss nennt denselben Zugang — abtippbar, fuer ein Telefon ohne Kamera.
    await expect(karte.locator(".lb-ortkarteCode")).toHaveText(`Code ${E2E_TOKEN_HELFER}`);
    await expect(karte.locator(".lb-ortkarteUrl")).toContainText(ziel);
    await expect(karte.locator(".lb-ortkarteUrl")).not.toContainText(`/o/${HANDLAGER_ID}`);

    // Die Gegenprobe: die Einheit behaelt ihre Ortsadresse.
    const fahrzeugKarte = page.locator(".lb-ortkarte", { hasText: E2E_FAHRZEUG_NAME }).first();
    await expect(fahrzeugKarte.locator(".lb-ortkarteUrl"))
      .toHaveText(lagerbuchUrl(`/o/${E2E_FAHRZEUG_ID}`));
    await expect(page.locator(".lb-ortkarteCode")).toHaveCount(1);

    // Und jetzt der Scan — abgemeldet, wie am Regal.
    const anonym = await browser.newContext();
    const seite = await anonym.newPage();
    await seite.goto(ziel);
    await seite.waitForURL((url) => url.pathname.endsWith("/helfer"));
    await expect(seite.getByText("Artikel wählen")).toBeVisible();
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
    expect(seite.url()).not.toContain(E2E_FAHRZEUG_ANDERES_ID);
    await expect(seite.getByText(E2E_FAHRZEUG_NAME).first()).toBeVisible();
    await expect(seite.getByText(E2E_FAHRZEUG_ANDERES_NAME)).toHaveCount(0);

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
      const marke = document.createElement("span");
      marke.className = "lb-ortkarteUnterscheidung";
      marke.textContent = id;
      fuss.prepend(marke);

      const m = marke.getBoundingClientRect();
      const f = fuss.getBoundingClientRect();
      return {
        text: marke.textContent,
        seitlichGekuerzt: marke.scrollWidth > marke.clientWidth + 0.5,
        ausDemFussGefallen: m.bottom > f.bottom + 0.5 || m.top < f.top - 0.5,
        karteUeberlauf: karte.scrollHeight > karte.clientHeight,
      };
    }, "V1StGXR8_Z5jdHi6B-myT");

    expect(befund.text).toBe("V1StGXR8_Z5jdHi6B-myT");
    expect(befund.seitlichGekuerzt, "der Unterscheider wird seitlich gekuerzt").toBe(false);
    expect(befund.ausDemFussGefallen, "der Unterscheider liegt ausserhalb des Fusses").toBe(false);
    expect(befund.karteUeberlauf).toBe(false);
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
