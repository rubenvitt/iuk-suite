import { readFile } from "node:fs/promises";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig, wechsleAnmeldung } from "./fixtures";
import {
  ANKER_ID,
  MODULROUTEN,
  ZEICHEN_ADMIN_GRUPPE,
  ZEICHEN_HOST,
  detailUrl,
  fremdUrl,
  warmeZeichenRouten,
  zeichenUrl,
} from "./helpers/zeichen";

/**
 * DIE E2E-FAELLE DES MODULS `zeichen` (Spec §8.3).
 *
 * ⛔ SIE SIND PFLICHTBESTANDTEIL, NICHT NACHBESSERUNG. Fuenf Klassen von Fehlern
 * dieses Moduls sind AUSSCHLIESSLICH hier sichtbar (Spec §8.4):
 *   1. ein RSC-Bruch nach einem Paketupgrade (M1, Falle 6, Falle 7, Falle 9) —
 *      Vitest kann ihn strukturell nicht sehen, dort gibt es keine RSC-Grenze;
 *   2. dass die Detailseite ihr SVG wirklich SERVERSEITIG rendert — und dass sie
 *      die Naht `zeichenIdAusPfad()` auch BENUTZT (kein Vitest bewacht das, und
 *      ohne sie antworten alle 246 Ids mit 404);
 *   3. dass der 404-Riegel der Lernset-Verwaltung die RECHTESTUFE misst und nicht
 *      eine kaputte Route;
 *   4. dass die Offline-Flaeche keinen Klarnamen traegt — die Zusage, auf der der
 *      Inhaltsriegel des Service Workers ueberhaupt erst beruht (Spec §7.3);
 *   5. dass die Bestaetigung beim Speichern ueber `name`/`value` am Submit-Knopf
 *      im BROWSER ankommt. Serverseitig ist der Weg dicht getestet, browserseitig
 *      gar nicht: `src/app/m/qr/_lib/test-dom.tsx` verschickt ein nacktes
 *      `submit`-Ereignis OHNE Submitter und trifft den Pfad nie.
 *
 * ⛔ JEDER AUFRUF GEHT UEBER `zeichenUrl(...)`, NIE RELATIV: `playwright.config.ts`
 * fuehrt genau EINEN `baseURL`, und der zeigt auf `http://portal.localtest.me:3100`.
 * Ein relativer Aufruf landete dort — und `portal` traegt `requiresAuth: true`,
 * also im Login.
 *
 * ⛔ VIER REGELN DIESES REPOS GELTEN IN JEDEM FALL DIESER DATEI:
 *   * jeder NAVIGIERENDE Klick ueber `klickeWennRuhig` (Falle 12);
 *   * Warmlauf-GET vor dem ersten POST, und `page.waitForResponse` statt Warten
 *     auf eine spaetere Zustandsaenderung (Falle 10);
 *   * kein `locator.dragTo()` (Falle 11) — im ganzen Modul wird nichts gezogen;
 *   * Rollenwechsel ueber `wechsleAnmeldung`, nie blankes `clearCookies()`.
 */

/**
 * Wartet auf die ANTWORT einer Server Action und prueft sie (Falle 10, zweite
 * Testregel). Ohne das liefe jede abgelehnte Antwort (404, 405, 413,
 * abgebrochen) still ins Zeitbudget und meldete sich als etwas anderes — hier
 * etwa als „die Merkliste ist leer".
 *
 * Der Aufrufer uebergibt die AUSLOESENDE Handlung; die Wartung wird VORHER
 * aufgesetzt, sonst ist die Antwort bei einer schnellen Aktion schon durch.
 */
async function mitAntwort(
  page: Page,
  pfadteil: string,
  handlung: () => Promise<void>,
): Promise<void> {
  const antwort = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes(pfadteil),
    { timeout: 60_000 },
  );
  await handlung();
  const res = await antwort;
  expect(res.status(), (await res.text()).slice(0, 400)).toBe(200);
}

/**
 * ⚠️ WIEDERHOLUNGSFEST GESCHRIEBEN. `retries: 2` in der CI faehrt denselben Fall
 * gegen DENSELBEN Dev-Server und DIESELBE Datenbank — nach Versuch 1 steht die
 * Merkzeile schon, und der Knopf heisst dann „Aus der Merkliste nehmen". Erst
 * zuruecksetzen, dann messen; sonst ist Versuch 2 rot aus einem Grund, den der
 * Testname nicht nennt.
 *
 * ⛔ GEMERKT WIRD AUF `/katalog`, NICHT AUF `/katalog/<id>`: die Einzelseite ist
 * eine reine Server Component OHNE jeden Knopf (Aufgabe 6). Ein `getByRole`
 * darauf liefe in einen Timeout, dessen Meldung nach einer kaputten Detailseite
 * klingt und keine meint. `?z=<id>` waehlt das Zeichen schon SERVERSEITIG aus.
 */
async function merkeSicher(page: Page, id: string): Promise<void> {
  await page.goto(zeichenUrl(`/katalog?z=${encodeURIComponent(id)}`));

  const knopf = page.getByTestId("zeichen-merken");
  await expect(knopf).toBeVisible();

  if (((await knopf.textContent()) ?? "").includes("Aus der Merkliste nehmen")) {
    await mitAntwort(page, "/katalog", () => knopf.click());
    await expect(knopf).toHaveText("Merken");
  }

  await mitAntwort(page, "/katalog", () => knopf.click());
  await expect(knopf).toHaveText("Aus der Merkliste nehmen");
}

test("die Detailseite liefert das SVG aus dem Server — das einzige Tor gegen einen RSC-Bruch", async ({
  page,
}) => {
  /*
   * ⛔ DER WICHTIGSTE EINZELNE FALL DES GANZEN MODULS (Spec §8.3, §8.4 Punkt 1).
   *
   * `/m/zeichen/katalog/[id]` ist eine REINE Server Component: `svgFuer(id)` ->
   * String -> `dangerouslySetInnerHTML`. Bricht irgendwo im Modul die RSC-Grenze —
   * ein `@einsatzzeichen/*`-Import im Server-Graph (M1), ein `@ant-design/icons`
   * in der Kette (Falle 7), ein Wert aus einem `"use client"`-Modul (Falle 6),
   * eine Funktion ueber die Grenze (Falle 9) —, dann antwortet GENAU DIESE Route
   * mit 500 statt mit `<svg`.
   *
   * ⛔ KEIN ANDERES TOR SIEHT DAS: `typecheck` und `lint` pruefen Typen und Regeln;
   * `pnpm vitest run` kann es STRUKTURELL nicht sehen (dort ist `"use client"` ein
   * wirkungsloser String, es gibt keine RSC-Grenze, und `react` laedt ueber die
   * `default`-Bedingung statt ueber `exports["."].node.import`); `pnpm build`
   * prueft Modulgrenzen statisch, nicht die Serialisierung eines Requests. Nur ein
   * echter Abruf zeigt den 500.
   *
   * ⛔ GEPRUEFT WIRD DER STATUSCODE UND DER RUMPF. Der 404 aus dem
   * prozentkodierten `params.id` (Aufgabe 6, alle 246 Ids) liefert eine
   * Fehlerseite ohne `<svg` — aber KEIN Vitest bewacht, dass die Seite die Naht
   * `zeichenIdAusPfad()` benutzt. Streicht jemand ihren Aufruf, bleibt die Suite
   * gruen; dieser Fall ist das einzige Tor dagegen, und ein Blick nur in den
   * Rumpf reichte dafuer nicht.
   */
  await devLogin(page, { host: ZEICHEN_HOST });

  const antwort = await page.request.get(
    zeichenUrl(`/m/zeichen/katalog/${encodeURIComponent(ANKER_ID)}`),
  );
  const html = await antwort.text();
  expect(antwort.status(), html.slice(0, 400)).toBe(200);

  expect(html, "die Detailseite rendert kein SVG — RSC-Bruch oder leeres Generat").toContain(
    "<svg",
  );
  // Positiver Nachweis, dass hier wirklich die Detailseite steht: ohne ihn bliebe
  // die Zusicherung oben auch ueber einer beliebigen anderen Seite mit einem
  // Icon-SVG gruen (dieselbe Lehre wie `qr-login-hint` in `pwa-spike.spec.ts`).
  expect(html).toContain('data-testid="zeichen-detail"');
  // Und dass wir nicht im Login gelandet sind — der 307 auf /login antwortet mit
  // 200 (HTML), der Statusvergleich oben allein sagt darueber nichts.
  expect(html).not.toContain("Dev-Login");
});

test("jede Modulroute antwortet 200 und traegt keine Fehlerseite", async ({ page }) => {
  /*
   * Die Breitenprobe zum Fall darueber: acht Routen, ein Abruf je Route. Sie
   * findet dieselbe Klasse (RSC-Bruch) an jeder anderen Flaeche des Moduls, und
   * sie kostet fast nichts — die Erstuebersetzung faellt ohnehin an.
   *
   * `test.setTimeout` hoch, und das ist keine Schikane: unter `next dev` mit
   * kaltem `.next` uebersetzt der Server jede dieser acht Routen beim ERSTEN
   * Treffer, samt antd. Die 90 s der Konfiguration sind fuer EINEN Test bemessen,
   * nicht fuer acht Erstuebersetzungen.
   */
  test.setTimeout(300_000);

  await devLogin(page, { host: ZEICHEN_HOST, groups: ZEICHEN_ADMIN_GRUPPE });

  for (const pfad of MODULROUTEN) {
    const antwort = await page.request.get(zeichenUrl(pfad));
    const html = await antwort.text();
    expect(antwort.status(), `${pfad}: ${html.slice(0, 400)}`).toBe(200);
    expect(html, `${pfad} zeigt Nexts Fehlerflaeche`).not.toContain("Application error");
    expect(html, `${pfad} ist im Login gelandet`).not.toContain("Dev-Login");
  }
});

test("die Offline-Flaeche traegt keinen Klarnamen — mit Positivkontrolle", async ({ page }) => {
  /*
   * ⛔ DIESE ZUSAGE TRAEGT DEN GANZEN OFFLINE-ENTWURF (Spec §7.3): der Service
   * Worker cacht `/offline` und lehnt jedes HTML mit `"userName"` ab. Waere
   * `/offline` unter der Suite-Huelle gebaut, stuende der Klarname im
   * Flight-Payload, der Inhaltsriegel griffe zu Recht — und die PWA cachte
   * schlicht NICHTS, ohne Fehlermeldung.
   *
   * ⚠️ DIESER FALL LAEUFT IN DER CI, der PWA-Lauf nicht. Er deckt die INHALTLICHE
   * Haelfte der Zusage ab; dass der Worker sie auch anwendet, misst
   * `_lib/sw-quelle.test.ts` (Aufgabe 9) und der Handlauf `pnpm e2e:pwa`.
   */
  await devLogin(page, { host: ZEICHEN_HOST });

  const offline = await page.request.get(zeichenUrl("/offline"));
  const offlineHtml = await offline.text();
  expect(offline.status(), offlineHtml.slice(0, 400)).toBe(200);
  expect(offlineHtml, "die Offline-Flaeche traegt den Klarnamen im Flight-Payload").not.toContain(
    "userName",
  );
  expect(offlineHtml).not.toContain("dev@localtest.me");
  /*
   * ⛔ DER ANZEIGENAME EXTRA, UND DAS IST GEMESSEN, NICHT VORSORGE (Aufgabe 10,
   * Gegenprobe 3): der Riegel des Workers sucht woertlich nach `"userName"` und
   * `"angemeldet"` (`_lib/sw-quelle.ts`) — das sind die PROP-NAMEN aus dem
   * Flight-Payload der Suite-Huelle. Eine Flaeche, die `session.user.name`
   * SELBST rendert, traegt keinen der beiden Namen: die eingesetzte Sonde
   * („<span>{sitzung?.user?.name}</span>" auf `/offline") lief mit den zwei
   * Zeilen darueber GRUEN durch, weil der Dev-Login als Namen „Dev User" fuehrt
   * und die Adresse gar nicht im Markup steht. Diese Zeile schliesst die Luecke
   * im TEST; die gleichlautende Luecke im WORKER-Riegel steht im Bericht.
   */
  expect(offlineHtml, "die Offline-Flaeche rendert den Anzeigenamen der Sitzung").not.toContain(
    "Dev User",
  );
  // Positiver Nachweis, dass die Flaeche ueberhaupt gerendert hat.
  expect(offlineHtml).toContain('data-testid="zeichen-offline"');

  /*
   * POSITIVKONTROLLE, und ohne sie bewiese die Zusicherung oben nur, dass
   * irgendein String irgendwo fehlt: dieselbe Sitzung, eine Seite UNTER der
   * Huelle — dort MUSS `userName` stehen. Verschwaende die Zeichenkette eines
   * Tages aus dem Payload (anderer Prop-Name in `SuiteNav`), waere der Test oben
   * leer-gruen, und diese Zeile wird dann laut.
   */
  const mitHuelle = await page.request.get(zeichenUrl("/katalog"));
  expect(
    await mitHuelle.text(),
    "die Huelle traegt kein `userName` mehr — die Zusicherung oben misst nichts",
  ).toContain("userName");
});

test("Katalog: suchen, Treffer oeffnen, ganze Seite oeffnen", async ({ page }) => {
  await devLogin(page, { host: ZEICHEN_HOST, callbackPath: "/katalog" });

  /*
   * „loeschgruppe" OHNE Umlaut, und das ist der Punkt: gemessen findet reine
   * Kleinschreibung 0 von 232 (Spec §3.3). Dieser eine Anschlag prueft die
   * Faltung `falte()` end-to-end — Generat, Naht und Insel auf einem Codepfad.
   * Auf einem Tablet mit Handschuhen ist genau das der Normalfall.
   */
  await page.getByTestId("zeichen-suche").fill("loeschgruppe");

  /*
   * ⛔ DIE TREFFER SIND `<button>`, KEINE `<a href>` — die Insel navigiert
   * bewusst nicht (Aufgabe 6: waehrend des Klicks ging gemessen KEINE einzige
   * Anfrage hinaus; genau darauf beruht die Offline-Flaeche). Der Griff traegt
   * die Id ROH, mit Doppelpunkt.
   */
  const treffer = page.locator('[data-testid^="zeichen-kachel-"]');
  await expect(treffer).toHaveCount(1);
  await expect(page.getByTestId("zeichen-trefferzahl")).toHaveText("1 von 246 Zeichen");

  await treffer.first().click();
  const detailbereich = page.getByTestId("zeichen-detailbereich");
  await expect(detailbereich.locator("svg").first()).toBeVisible();

  /*
   * ⛔ `klickeWennRuhig` UND NICHT `.click()` — gemessener Anlass auf `main`
   * (Lauf 31951787232): Playwright meldete den Klick als gelungen, der Knoten war
   * ein echter `<a href>`, er trug danach sogar den Fokus, und im Netzwerkteil
   * stand fuer das Ziel KEIN einziger Aufruf. Die Huelle war zwischen `mousedown`
   * und `mouseup` um ~240 px gesprungen (`SessionProvider` holt
   * `/api/auth/session` nach), das `click`-Ereignis feuerte auf dem gemeinsamen
   * `<div>`-Vorfahren, und ein `<div>` navigiert nicht. Kein groesseres
   * Zeitbudget und keine Wiederholung heilt das.
   */
  await klickeWennRuhig(detailbereich.getByRole("link", { name: "Ganze Seite öffnen" }));
  await page.waitForURL(/\/katalog\/.+/);

  await expect(page.getByTestId("zeichen-detail").locator("svg").first()).toBeVisible();
});

test("merken: die Server Action antwortet, und die Merkliste zeigt die Zeile", async ({ page }) => {
  test.setTimeout(180_000);

  await devLogin(page, { host: ZEICHEN_HOST });
  // Falle 10: der Warmlauf-GET uebersetzt die Routen, BEVOR der erste echte POST
  // faellt. Angemeldet, sonst uebersetzt er nur den Login-Redirect.
  await warmeZeichenRouten(page.request);

  await merkeSicher(page, ANKER_ID);

  await page.goto(zeichenUrl("/merkliste"));
  const zeile = page.getByTestId(`zeichen-merkzeile-${ANKER_ID}`);
  await expect(zeile).toHaveCount(1);

  /*
   * Der Weg von der Merkzeile auf die Einzelseite — er prueft nebenbei, dass der
   * Link die Id KODIERT baut (`encodeURIComponent`, Aufgabe 6): ohne die Kodierung
   * landete der Doppelpunkt roh in der Adresse, und die Seite antwortete 404.
   */
  await klickeWennRuhig(zeile.getByRole("link"));
  await page.waitForURL(/\/katalog\/.+/);
  await expect(page.getByTestId("zeichen-detail")).toBeVisible();

  // Gegenprobe im selben Fall: der Weg zurueck raeumt auch wieder auf. Ohne sie
  // bliebe eine Merkliste, die nur waechst, unbemerkt.
  await page.goto(zeichenUrl("/merkliste"));
  await mitAntwort(page, "/merkliste", () =>
    page.getByTestId(`zeichen-merkliste-entfernen-${ANKER_ID}`).click(),
  );
  await expect(page.getByTestId(`zeichen-merkzeile-${ANKER_ID}`)).toHaveCount(0);
});

/** Der erste freie (nicht gesperrte) Wert eines Achsen-Auswahlfeldes. */
async function ersterFreierWert(feld: Locator): Promise<string> {
  const wert = await feld.evaluate((el) => {
    const s = el as HTMLSelectElement;
    const o = Array.from(s.options).find((x) => x.value !== "" && !x.disabled);
    return o ? o.value : "";
  });
  expect(wert, "das Auswahlfeld hat keinen einzigen freien Wert").not.toBe("");
  return wert;
}

test("Baukasten: ein Zeichen bauen und als SVG herunterladen", async ({ page }) => {
  /*
   * Die Baukasten-Insel laedt ueber `dynamic(..., { ssr: false })` (Spec §3.4) —
   * ihr Chunk wird unter `next dev` beim ersten Treffer uebersetzt und traegt den
   * Katalog-Code (gemessen 133 KB gzip). Das passt nicht in die 90 s der
   * Konfiguration, wenn `.next` kalt ist.
   */
  test.setTimeout(240_000);

  await devLogin(page, { host: ZEICHEN_HOST, callbackPath: "/baukasten" });

  /*
   * Schritt 1 der erzwungenen Schrittfolge (Spec §6.1): die Grundzeichenart
   * entscheidet, welche Achsen ueberhaupt existieren. `formation` ist die Art, die
   * nackt komponiert — `circle-12` und `reduced-house` bekommen einen Platzhalter
   * und lieferten hier kein Bild.
   *
   * ⛔ KEIN `locator.dragTo()` (Falle 11) — im ganzen Modul wird nichts gezogen.
   * Der gemessene Anlass steht in `CLAUDE.md`: ein Zug lief reproduzierbar in den
   * vollen 90-Sekunden-Timeout, ohne dass je ein `drop` feuerte.
   */
  const kachel = page.getByTestId("tz-kachel-formation");
  await expect(kachel).toBeVisible({ timeout: 180_000 });
  await kachel.click();

  await expect(page.getByTestId("tz-vorschau").locator("svg")).toBeVisible();
  await expect(page.getByTestId("tz-bedeutung")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByTestId("tz-export-svg").click();
  const datei = await download;

  expect(datei.suggestedFilename()).toMatch(/\.svg$/);
  const pfad = await datei.path();
  const inhalt = await readFile(pfad, "utf8");
  /*
   * Auf den INHALT pruefen, nicht nur auf das Ereignis: ein `<a download>` mit
   * leerem Blob loeste dasselbe Ereignis aus, und die Zusage „du bekommst dein
   * Zeichen" waere leer-gruen.
   */
  expect(inhalt.startsWith("<svg"), inhalt.slice(0, 120)).toBe(true);
  expect(inhalt).toContain("</svg>");
});

test("Speichern: beide Rueckfragen, und der Doppelkonflikt endet nach EINER Bestaetigung", async ({
  page,
}) => {
  /*
   * ⛔ DER EINZIGE BROWSERSEITIGE NACHWEIS DES `name`/`value`-WEGES (Korrektur 8
   * des Auftrags). Die Bestaetigung haengt am AUSLOESENDEN Submit-Knopf, weil
   * React-State im selben Ereignis noch den alten Wert truege — daran hing eine
   * gemessene Endlosschleife (Aufgabe 7, Befund W1). Serverseitig ist der Weg
   * dicht getestet; browserseitig trifft ihn NICHTS: das DOM-Harness
   * (`qr/_lib/test-dom.tsx`) verschickt ein `submit`-Ereignis OHNE Submitter, und
   * genau der Submitter traegt hier die Information.
   *
   * ⚠️ EIGENE NAMEN JE LAUF (`marke`), und das ist Wiederholungsfestigkeit: die
   * Konflikte dieses Falls werden ABSICHTLICH erzeugt; ein fester Name traefe im
   * zweiten CI-Versuch auf die Zeilen des ersten und verschoebe jede Rueckfrage
   * um einen Schritt.
   */
  test.setTimeout(300_000);

  await devLogin(page, { host: ZEICHEN_HOST, callbackPath: "/baukasten" });
  await warmeZeichenRouten(page.request);

  const kachel = page.getByTestId("tz-kachel-formation");
  await expect(kachel).toBeVisible({ timeout: 180_000 });
  await kachel.click();
  await expect(page.getByTestId("tz-vorschau").locator("svg")).toBeVisible();

  const marke = Date.now().toString(36);
  const N1 = `E2E ${marke} eins`;
  const N2 = `E2E ${marke} zwei`;
  const N3 = `E2E ${marke} drei`;

  const name = page.locator("#tz-name");
  const speichern = page.getByTestId("tz-speichern-knopf");
  const rueckfrage = page.getByTestId("tz-rueckfrage");
  const gespeichert = page.getByTestId("tz-gespeichert");

  /*
   * ⚠️ IMMER AUF DEN ERWARTETEN NAMEN PRUEFEN, NIE NUR AUF SICHTBARKEIT: der
   * Erfolgskasten bleibt nach einem Speichern STEHEN und verschwindet erst, wenn
   * die naechste Aktion antwortet (Aufgabe 7, Beobachtung am Ende des Berichts).
   * Ein `waitFor` auf einen stehengebliebenen Kasten loest sofort auf und bewiese
   * nichts — dieselbe Familie wie CLAUDE.mds Fallen 10/12.
   */
  const speichere = async (wert: string) => {
    await name.fill(wert);
    await mitAntwort(page, "/baukasten", () => speichern.click());
  };

  // 1 — sauber anlegen: Zusammenstellung C1 unter N1.
  await speichere(N1);
  await expect(gespeichert).toContainText(N1);

  // 2 — RUECKFRAGE „gleicher Name": dieselbe Zusammenstellung, derselbe Name.
  await speichere(N1);
  await expect(rueckfrage).toContainText("Unter diesem Namen hast du schon ein Zeichen");
  await mitAntwort(page, "/baukasten", () => page.getByTestId("tz-rueckfrage-ja").click());
  await expect(gespeichert).toContainText(N1);
  await expect(rueckfrage).toHaveCount(0);

  // 3 — RUECKFRAGE „gleiche Zusammenstellung": C1 noch einmal, unter neuem Namen.
  await speichere(N2);
  await expect(rueckfrage).toContainText("Diese Zusammenstellung hast du schon");
  await expect(rueckfrage).toContainText(N1);
  await mitAntwort(page, "/baukasten", () => page.getByTestId("tz-rueckfrage-ja").click());
  await expect(gespeichert).toContainText(N2);

  // 4 — eine ZWEITE Zusammenstellung C2 unter N3: ohne Konflikt, als Grundlage
  //     fuer den Doppelfall darunter.
  const zugehoerigkeit = page.locator('[data-achse-wahl="zugehoerigkeit"]');
  await zugehoerigkeit.selectOption(await ersterFreierWert(zugehoerigkeit));
  await expect(page.getByTestId("tz-vorschau").locator("svg")).toBeVisible();
  await speichere(N3);
  await expect(gespeichert).toContainText(N3);

  /*
   * 5 — BEIDE KONFLIKTE ZUGLEICH: der Name N1 ist vergeben (mit C1), und die
   * Zusammenstellung C2 liegt unter dem ANDEREN Namen N3. Vorher wechselten sich
   * hier zwei Kaesten endlos ab — „Ueberschreiben" loeste die
   * Zusammenstellungsfrage aus, „Trotzdem sichern" wieder die Namensfrage, und
   * gespeichert wurde nie. Die Zusage lautet: die Namensfrage kommt, und EINE
   * Bestaetigung beendet den Vorgang.
   */
  await speichere(N1);
  await expect(rueckfrage).toContainText("Unter diesem Namen hast du schon ein Zeichen");
  await mitAntwort(page, "/baukasten", () => page.getByTestId("tz-rueckfrage-ja").click());
  await expect(gespeichert).toContainText(N1);
  await expect(rueckfrage, "nach EINER Bestaetigung steht die zweite Frage da — Endlosschleife")
    .toHaveCount(0);

  // Und auf `/meine` liegen genau die drei Namen dieses Laufs.
  await page.goto(zeichenUrl("/meine"));
  for (const n of [N1, N2, N3]) {
    await expect(page.getByTestId("tz-meine-liste")).toContainText(n);
  }
});

test("Lernen: eine Runde, eine Antwort, und der Server hat sie angenommen", async ({ page }) => {
  test.setTimeout(180_000);

  await devLogin(page, { host: ZEICHEN_HOST });
  await warmeZeichenRouten(page.request);

  await page.goto(zeichenUrl("/lernen"));

  /*
   * Der fachliche Vorbehalt steht ueber dem Startknopf (Spec §5.6): gemessen ist
   * `review.domain.status` bei 544 von 544 Zeilen `pending`. Dass der Kasten
   * dasteht, ist keine Option — nur sein Wortlaut ist Betreibersache. Deshalb
   * steht er hier als Zusicherung und nicht als Kommentar.
   */
  await expect(page.getByTestId("zeichen-vorbehalt")).toBeVisible();

  await klickeWennRuhig(page.getByTestId("lernen-start"));
  await page.waitForURL(/\/lernen\/runde/);

  await expect(page.getByTestId("quiz-frage")).toBeVisible();
  const optionen = page.getByTestId("quiz-option");
  await expect(optionen).toHaveCount(4);

  /*
   * Der Stand wird nach JEDER einzelnen Antwort serverseitig geschrieben (Spec
   * §5.4), nicht am Rundenende. Also gibt es hier eine Antwort zu pruefen — und
   * genau die wird geprueft, nicht eine spaetere Zahl auf `/lernen`.
   */
  await mitAntwort(page, "/lernen/runde", () => optionen.first().click());

  /*
   * Wort zuerst, Zeichen zweitens, Farbe zuletzt (Spec §5.5, Falle 3:
   * `colorError === colorPrimary === #c8000f`). Der Test liest deshalb das WORT —
   * eine Farbzusicherung waere hier die falsche Probe und in jsdom ohnehin keine.
   */
  await expect(page.getByTestId("quiz-aufloesung")).toContainText(/Richtig\.|Nicht ganz\./);
});

test("Lernsets: die Verwaltung gehoert der Admin-Gruppe — und nur ihr", async ({ page }) => {
  test.setTimeout(180_000);

  await devLogin(page, {
    host: ZEICHEN_HOST,
    groups: ZEICHEN_ADMIN_GRUPPE,
    callbackPath: "/verwaltung/lernsets",
  });
  await expect(page.getByRole("heading", { level: 1, name: "Lernsets" })).toBeVisible();

  const alsAdmin = await page.request.get(zeichenUrl("/verwaltung/lernsets"));
  expect(alsAdmin.status()).toBe(200);

  /*
   * ⛔ ROLLENWECHSEL UEBER `wechsleAnmeldung`, NIE BLANKES `clearCookies()`.
   * Gemessen auf `main` (Lauf 33173490683): eine noch laufende
   * `/api/auth/session`-Antwort setzte den Sitzungscookie Millisekunden NACH dem
   * Leeren neu, `/login` leitete die bestehende Sitzung sofort weiter, und der
   * Fehlschlag kam 80 Sekunden spaeter als „waiting for getByLabel('email')" —
   * eine Meldung, die nach einem kaputten Anmeldeformular klingt und keins meint.
   * `wechsleAnmeldung` geht vorher auf `about:blank` und prueft den leeren Krug.
   * Dieselbe Falle stand in Aufgabe 9 noch einmal (der erste Lauf zeigte
   * faelschlich die echte Katalogseite).
   */
  await wechsleAnmeldung(page, { host: ZEICHEN_HOST, groups: "" });

  const ohneGruppe = await page.request.get(zeichenUrl("/verwaltung/lernsets"));
  expect(
    ohneGruppe.status(),
    "ohne Admin-Gruppe muss die Lernset-Verwaltung 404 antworten (moduleAdminPageOrNotFound)",
  ).toBe(404);

  /*
   * ⛔ DIE GEGENPROBE TRAEGT DEN FALL: ohne sie waere der 404 oben auch dann
   * gruen, wenn die Route gar nicht existiert oder das ganze Modul den Zugang
   * verweigert. Erst „mit Gruppe 200, ohne Gruppe 404, auf DERSELBEN Adresse,
   * und der Katalog bleibt beiden offen" benennt die STUFE statt der Huelle.
   * Dieselbe Lehre wie „V-L3 D" in `e2e/radio-verwaltung.spec.ts`.
   */
  expect(
    (await page.request.get(zeichenUrl("/katalog"))).status(),
    "das Modul selbst ist zu — der 404 oben misst dann nicht die Admin-Stufe",
  ).toBe(200);

  // Und der Navigationseintrag verschwindet mit dem Recht: `_lib/nav.ts` zeigt
  // „Lernsets" nur bei `canAdminModule("zeichen")` — DASSELBE Praedikat, das die
  // Route gatet. Ein sichtbarer Link auf einen 404 waere eine Sackgasse.
  await page.goto(zeichenUrl("/katalog"));
  await expect(page.getByRole("link", { name: "Lernsets" })).toHaveCount(0);
  // Positivkontrolle zur Zeile darueber: die Leiste steht ueberhaupt da.
  await expect(page.getByRole("link", { name: "Katalog" }).first()).toBeVisible();
});

test("die Lernset-Verwaltung antwortet auf einem fremden Suite-Host mit 404", async ({ page }) => {
  /*
   * Der Direktzugriff auf die INNERE Pfadform von einem anderen Suite-Host —
   * `decideRoute`s `internal`-Zweig gatet nach dem Segment, nicht nach dem Host,
   * die Admin-Stufe muss also auch von dort greifen. `feedback.localtest.me`
   * existiert bereits (`playwright.config.ts` wartet auf dessen `/login`) und ist
   * die schaerfere Probe als ein erfundener Host, weil `moduleForHost` dort
   * tatsaechlich ein Modul liefert.
   */
  await devLogin(page, { host: ZEICHEN_HOST, groups: "" });
  const antwort = await page.request.get(fremdUrl("/m/zeichen/verwaltung/lernsets"));
  expect(antwort.status()).toBe(404);

  /*
   * Die Gegenprobe auf demselben fremden Host: der Katalog ist von dort ERREICHBAR
   * (`decideRoute` gatet nach dem Segment, nicht nach dem Host). Ohne sie waere
   * der 404 oben auch dann gruen, wenn der fremde Host das ganze Modul sperrt —
   * und dann maesse er nicht die Admin-Stufe.
   */
  const katalog = await page.request.get(fremdUrl(`/m/zeichen/katalog`));
  expect(katalog.status(), "der fremde Host sperrt das ganze Modul").toBe(200);
  // Und die Einzelseite traegt dieselbe kodierte Id-Form wie auf dem Modul-Host.
  expect((await page.request.get(detailUrl(ANKER_ID))).status()).toBe(200);
});
