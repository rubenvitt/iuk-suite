import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";
import {
  E2E_FAHRZEUG_ANDERES_ID, E2E_FAHRZEUG_ANDERES_NAME,
  E2E_FAHRZEUG_ID, E2E_FAHRZEUG_NAME, E2E_TOKEN_FAHRZEUG,
  LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl,
} from "./helpers/lagerbuch";
import { A7_BREITE_MM, A7_HOEHE_MM, nameStufe } from "@/app/m/lagerbuch/_lib/ortEtikettMasse";
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

    const [b] = await page.evaluate(misstNamen, [
      { name: "Sehr langer Name ".repeat(12), klasse: nameStufe("Sehr langer Name ".repeat(12)) },
    ]);

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
