import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * DER PWA-LAUF DES MODULS `zeichen` (Spec §7, §8.3).
 *
 * ⛔ ER LAEUFT IN KEINER CI, UND DAS IST EINE BENANNTE SCHWAECHE DES ENTWURFS,
 * KEIN VERSEHEN (Spec §8.4): `.github/workflows/ci.yml` faehrt
 * `pnpm e2e --shard=n/5`, also ausschliesslich das normale Profil. Dieser Lauf
 * ist ein HANDLAUF vor dem Merge — `pnpm e2e:pwa`.
 *
 * ⚠️ SEIT DER MERKLISTE-ENTSCHEIDUNG (Spec §7.5) WIEGT DAS SCHWERER ALS ZUVOR.
 * Bis dahin war die Zusage „auf dem Geraet liegt nichts Personenbezogenes" mit
 * einem Unit-Test gegen den Worker-Quelltext haltbar. Sie ist es nicht mehr: die
 * Merkliste liegt in IndexedDB, offline gibt es keine Authentifizierung (das
 * Sitzungscookie ist `HttpOnly` und fuer Seite wie Worker unsichtbar), und
 * IndexedDB ueberlebt den Logout genauso wie der Cache. Was davon eine
 * Maschinenpruefung hat, steht hier — und hier laeuft es nur, wenn ein Mensch es
 * startet.
 *
 * ⛔ ZWEI EINTRAEGE MACHEN DIESE DATEI ERST LAUFFAEHIG, und ohne BEIDE laeuft sie
 * entweder gar nicht oder im falschen Profil:
 *   * `testMatch` in `playwright.pwa.config.ts` (sonst wird sie dort nie gefunden),
 *   * `testIgnore` in `playwright.config.ts` (sonst laeuft sie zusaetzlich auf dem
 *     Dev-Server ohne sicheren Kontext, wo `navigator.serviceWorker` fehlt).
 * Dazu `zeichen.localtest.me:3101` in `ORIGINS` und `SUITE_HOST_ZEICHEN` +
 * `ZEICHEN_SW=1` in `webServer.env` derselben Config.
 */

const ZEICHEN = "http://zeichen.localtest.me:3101";
const HOST = "zeichen.localtest.me";
const PORT = 3101;

/**
 * Name aus `_lib/sw-quelle.ts` (Aufgabe 9). Bewusst dupliziert statt importiert:
 * der Test soll nach einem Versionssprung auffallen und nicht stillschweigend
 * mitwandern — `activate` loescht JEDEN anderen Cache-Namen, ein stiller
 * Gleichlauf verdeckte also genau den Fall, den man sehen will.
 */
const CACHE = "zeichen-pwa-v1";

/** Ebenfalls aus `_lib/sw-quelle.ts`/`_lib/merkgeraet.ts`, aus demselben Grund dupliziert. */
const IDB = "zeichen-merkliste";

/** Aus `e2e/helpers/zeichen.ts` — dort steht die Kopplung an `ANKER` ausgeschrieben. */
const ANKER_ID = "rezept:C.1.1";

/** Der Cache-Write haengt an `waitUntil` und ist nach der Navigation nicht zwingend durch. */
async function warteAufGecachteHuelle(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          async (c) => (await (await caches.open(c)).match("/offline")) !== undefined,
          CACHE,
        ),
      { timeout: 60_000 },
    )
    .toBe(true);
}

/**
 * Holt einen Pfad AUS DER SEITE HERAUS, nicht ueber Playwrights Node-Client.
 *
 * ⛔ DAS IST KEIN GESCHMACK, ES IST GEMESSEN (Aufgabe 10, erster PWA-Lauf). In
 * diesem Profil laeuft der Server als Prod-Build (`next start`), und next-auth
 * setzt seinen Sitzungscookie dort mit `secure: true` — gemessen:
 *
 *   authjs.session-token  secure=true  domain=.localtest.me
 *   authjs.callback-url   secure=true  domain=.localtest.me
 *
 * Der BROWSER schickt ihn trotzdem ueber `http://…:3101`, weil
 * `--unsafely-treat-insecure-origin-as-secure` die Herkunft als vertrauenswuerdig
 * fuehrt. `page.request` ist ein EIGENER HTTP-Client in Node, der diese
 * Chrome-Fahne nicht kennt: er laesst den Secure-Cookie weg, die Middleware
 * antwortet `307 -> /login`, der Client folgt, und heraus kommt eine
 * 200er-Antwort MIT HTML. Die Meldung lautet dann „Unexpected token '<' …is not
 * valid JSON" und klingt nach einem kaputten Route Handler.
 *
 * ⚠️ `pwa-spike.spec.ts` trifft das nicht: `beta` und `qr` sind anonym erreichbar.
 * Jede AUTHENTIFIZIERTE Pruefung in diesem Profil geht deshalb durch die Seite.
 */
async function hole(
  page: Page,
  pfad: string,
): Promise<{ status: number; typ: string; rumpf: string }> {
  return page.evaluate(async (p) => {
    const r = await fetch(p);
    return { status: r.status, typ: r.headers.get("content-type") ?? "", rumpf: await r.text() };
  }, pfad);
}

/** Liegt die Geraetedatenbank der Merkliste auf diesem Geraet? */
function idbDa(page: Page): Promise<boolean> {
  return page.evaluate(
    async (name) => (await indexedDB.databases()).some((d) => d.name === name),
    IDB,
  );
}

test("der Modul-Host liefert Manifest, Icon und Worker — mit use-credentials", async ({
  page,
  request,
}) => {
  await devLogin(page, { host: HOST, port: PORT });
  await page.goto(`${ZEICHEN}/katalog`);

  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("href", "/manifest.webmanifest");
  /*
   * ⛔ OHNE `crossOrigin="use-credentials"` HOLT DER BROWSER DAS MANIFEST OHNE
   * COOKIES und bekommt Login-HTML (Spec §7.3). Das Attribut kommt im ganzen Repo
   * sonst nicht vor — es gibt also kein zweites Vorbild, an dem der Fehler
   * auffiele.
   */
  await expect(link).toHaveAttribute("crossorigin", "use-credentials");

  /*
   * ⛔ DER RUMPF WIRD ALS TEXT GELESEN UND ERST DANN GEPARST. Ein Abruf ohne
   * Sitzung landet ueber `307 -> /login` bei einer 200er-ANTWORT MIT HTML;
   * `response.json()` scheitert dann an „Unexpected token '<'" — eine Meldung,
   * die nach einem kaputten Route Handler klingt und keinen meint. Gemessen in
   * genau diesem Fall (Aufgabe 10, erster PWA-Lauf).
   */
  const manifest = await hole(page, "/manifest.webmanifest");
  expect(manifest.status, manifest.rumpf.slice(0, 300)).toBe(200);
  expect(
    manifest.rumpf.slice(0, 300),
    "das Manifest kam als HTML statt als JSON — der Abruf lief ohne Sitzung ins Login",
  ).not.toContain("<!DOCTYPE");
  const json = JSON.parse(manifest.rumpf);
  /*
   * ⛔ `start_url: "/offline"` UND NICHT `"/"` — und das ist der Unterschied zu
   * `qr` und `uav`, die beide `"/"` fuehren. Hier waere `/` die RSC-Startseite
   * unter der Suite-Huelle, die ausdruecklich NICHT im Cache liegt: die
   * installierte PWA landete offline auf Chromiums Netzwerkfehlerseite.
   */
  expect(json.start_url).toBe("/offline");
  expect(json.scope).toBe("/");
  expect(json.icons[0].src).toBe("/pwa-icon.svg");

  const icon = await hole(page, "/pwa-icon.svg");
  expect(icon.status).toBe(200);
  expect(icon.typ).toContain("image/svg+xml");

  const sw = await hole(page, "/sw.js");
  expect(sw.status).toBe(200);
  expect(sw.typ).toContain("javascript");

  // Gegenprobe auf einem fremden Suite-Host: dort gibt es das alles nicht — der
  // Pfad rewritet ins Portal. `request` (ohne Sitzung) statt `page.request`:
  // gemessen antwortet der Portal-Host anonym mit dem Login, nie mit JavaScript.
  const fremd = await request.get("http://portal.localtest.me:3101/sw.js");
  expect(fremd.headers()["content-type"] ?? "").not.toContain("javascript");
});

test("im Cache liegt die rahmenlose Offline-Flaeche — und sonst nichts Personenbezogenes", async ({
  page,
}) => {
  await devLogin(page, { host: HOST, port: PORT, callbackPath: "/katalog" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);

  const inhalt = await page.evaluate(async (c) => {
    const cache = await caches.open(c);
    const huelle = await cache.match("/offline");
    return {
      pfade: (await cache.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search),
      html: huelle ? await huelle.text() : null,
    };
  }, CACHE);

  /*
   * DER INHALTSRIEGEL, gemessen statt behauptet (Spec §7.3): im HTTP-Cache landet
   * kein HTML mit `"userName"`. Diese Zusage bleibt scharf, auch nachdem §7.5 die
   * groessere Zusage aufgegeben hat.
   */
  expect(inhalt.html, "die gecachte Huelle traegt einen Klarnamen").not.toContain("userName");
  expect(inhalt.html).not.toContain("angemeldet");
  // ⛔ DER „LOGIN"-MARKER: ohne den `redirected`-Riegel kommt der gemessene
  // `307 -> /login` als `ok: true` an und braenne sich als Offline-Flaeche ein.
  expect(inhalt.html).not.toContain("Dev-Login");
  expect(inhalt.html).not.toContain("callbackUrl");
  // Positiver Nachweis, dass hier ueberhaupt die richtige Seite liegt — ohne ihn
  // bliebe alles oben auch ueber einem leeren Dokument gruen.
  expect(inhalt.html).toContain('data-testid="zeichen-offline"');

  // Keine gegatete Flaeche, keine RSC-Antwort einer Soft-Navigation (die Allowlist
  // `isCacheableAsset` gegen die Denylist, die `"/?_rsc=<hash>"` durchliess).
  expect(inhalt.pfade.some((p) => p.startsWith("/katalog"))).toBe(false);
  expect(inhalt.pfade.some((p) => p.startsWith("/merkliste"))).toBe(false);
  expect(inhalt.pfade.some((p) => p.includes("_rsc"))).toBe(false);
  expect(inhalt.pfade.some((p) => p.startsWith("/api/"))).toBe(false);
  // Und die Buendel liegen wirklich da — sonst traegt die Flaeche offline nicht.
  expect(inhalt.pfade.some((p) => p.startsWith("/_next/static/"))).toBe(true);
});

test("offline: start_url oeffnen, suchen, Treffer sehen", async ({ page, context }) => {
  await devLogin(page, { host: HOST, port: PORT, callbackPath: "/katalog" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);

  await context.setOffline(true);

  /*
   * ⛔ `page.goto("/")` NACH `setOffline(true)` — DAS IST DER `start_url`-FALL.
   * Eine installierte PWA startet auf ihrer `start_url`; der Navigationszweig
   * findet fuer `/` nichts im Cache und faellt auf `/offline` zurueck. Faellt er
   * es nicht, sieht der Nutzer Chromiums Netzwerkfehlerseite — und zwar
   * ausgerechnet in dem Moment, fuer den das ganze Kapitel gebaut wurde.
   */
  await page.goto(`${ZEICHEN}/`);
  await expect(page.getByTestId("zeichen-offline")).toBeVisible();

  // Der Stand der Sammlung (Spec §7.4): ohne ihn kann niemand beurteilen, ob das,
  // was er offline sieht, aktuell ist — der Cache kann beliebig alt sein.
  await expect(page.getByTestId("zeichen-offline-stand")).toContainText("246 Zeichen");

  /*
   * ⛔ EINE ECHTE INTERAKTION, KEIN „SEITE LAEDT OFFLINE". Die Zusage lautet
   * „alle 246 Zeichen nachschlagen und durchsuchen", und Suchen braucht die
   * hydrierte Insel samt ihrem Datenpaket. Steht nur das Standbild, waere der
   * Test gruen und die Zusage falsch.
   */
  /*
   * ⛔ ZUERST: GENAU EINE KATALOGFLAECHE. Ein Lauf des Betreuers brach hier mit
   * einer Playwright-„strict mode violation" ab — `zeichen-trefferzahl` loeste zu
   * ZWEI Knoten auf, der erste innerhalb von `zeichen-offline`, der zweite
   * ausserhalb.
   *
   * ⬜ WOHER DER ZWEITE STAMMEN KANN, ist im Repo eindeutig: die Kennung steht an
   * genau EINER Stelle im Quelltext (`_ui/KatalogInsel.tsx:237`), und die Insel
   * wird an genau ZWEI Stellen eingebunden — auf `/offline` (INNERHALB von
   * `zeichen-offline`) und auf `(shell)/katalog` (ausserhalb, in der Huelle). Ein
   * Knoten ausserhalb gehoert also zur Shell-Katalogseite: genau der Seite, auf
   * der dieser Fall unmittelbar vor `page.goto("/")` steht (`devLogin(...,
   * callbackPath: "/katalog")`). Zwei Knoten heissen damit „die vorige Seite
   * haengt noch im Baum", nicht „die Offline-Flaeche rendert doppelt".
   *
   * ⬜ NICHT REPRODUZIERT, und deshalb steht hier eine Zusicherung und keine
   * Erklaerung: 18 Ausfuehrungen dieses Falls blieben gruen — einzeln, im vollen
   * Lauf, sechsfach wiederholt, am Stand VOR der Fix-Welle, mit dunklem
   * Farbschema und unter Vollast. 400 Abtastungen des Baums im 5-ms-Takt
   * unmittelbar nach der Navigation sahen durchweg genau EINEN Knoten, und die
   * gecachte `/offline`-Huelle enthaelt die Kennung genau einmal.
   *
   * ⛔ DIE ABHILFE IST KEIN `.first()`, DAS DEN ZWEITEN KNOTEN WEGBLENDET.
   * `toHaveCount(1)` WIEDERHOLT (Playwright wartet die Zusicherung aus) und macht
   * ein Rennen damit unschaedlich, ohne die Frage offenzulassen: bliebe wirklich
   * ein zweiter Knoten stehen, faellt der Fall hier mit „expected 1, received 2" —
   * einer Zahl, die den Befund nennt, statt einer Strict-Mode-Meldung, die nach
   * etwas ganz anderem klingt.
   */
  await expect(page.getByTestId("zeichen-offline")).toHaveCount(1);
  await expect(page.getByTestId("zeichen-trefferzahl")).toHaveCount(1);

  await expect(page.getByTestId("zeichen-trefferzahl")).toHaveText("246 von 246 Zeichen");
  await page.getByTestId("zeichen-suche").fill("loeschgruppe");
  await expect(page.getByTestId("zeichen-trefferzahl")).toHaveText("1 von 246 Zeichen");
  const treffer = page.locator('[data-testid^="zeichen-kachel-"]');
  await expect(treffer).toHaveCount(1);
  // Und das Zeichen selbst ist da, nicht nur seine Zeile: das SVG steckt im
  // Generat, das mit dem Buendel gecacht wurde.
  await treffer.first().click();
  await expect(page.getByTestId("zeichen-detailbereich").locator("svg").first()).toBeVisible();
  // Offline gibt es KEIN „Merken" (die Insel bekommt `offline`) — der Knopf, der
  // ohne Verbindung nur in einen Fehler liefe, steht gar nicht erst da.
  await expect(page.getByTestId("zeichen-merken")).toHaveCount(0);

  // Und ein Lesezeichen auf eine nicht gecachte Route landet ebenfalls auf der
  // Offline-Flaeche statt in der Fehlerseite (Spec §7.3: die Adresszeile luegt,
  // und das ist der bewusst gewaehlte kleinere Schaden).
  await page.goto(`${ZEICHEN}/lernen`);
  await expect(page.getByTestId("zeichen-offline")).toBeVisible();

  await context.setOffline(false);
});

test("die Merkliste ist offline da — und der Loeschknopf raeumt sie vom Geraet", async ({
  page,
  context,
}) => {
  await devLogin(page, { host: HOST, port: PORT });

  /*
   * Online merken (ueber die Server Action), wiederholungsfest: `next start`
   * behaelt seine Datenbank ueber alle Faelle und Versuche eines Laufs.
   * ⛔ GEMERKT WIRD AUF `/katalog?z=<id>`: die Einzelseite `/katalog/<id>` ist
   * eine reine Server Component ohne Knopf.
   */
  await page.goto(`${ZEICHEN}/katalog?z=${encodeURIComponent(ANKER_ID)}`);
  const knopf = page.getByTestId("zeichen-merken");
  await expect(knopf).toBeVisible();
  if (((await knopf.textContent()) ?? "").includes("Merken")) {
    const antwort = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/katalog"),
    );
    await knopf.click();
    expect((await antwort).status()).toBe(200);
  }
  await expect(knopf).toHaveText("Aus der Merkliste nehmen");

  // Die Merkliste wird bei jedem ONLINE-Aufruf einer Shell-Seite nach IndexedDB
  // gespiegelt (`MerklisteSpiegel` im `(shell)`-Layout, Spec §7.5) — geschrieben
  // wird nur online, gelesen offline.
  await page.goto(`${ZEICHEN}/katalog`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);
  await expect.poll(() => idbDa(page), { timeout: 30_000 }).toBe(true);

  await context.setOffline(true);
  await page.goto(`${ZEICHEN}/`);

  const geraeteliste = page.getByTestId("zeichen-merkliste-geraet-liste");
  await expect(geraeteliste).toContainText("Löschstaffel");
  /*
   * Der Hinweis steht unmittelbar bei der Liste, nicht in einer Fusszeile: auf
   * einem geteilten Geraet sieht sie auch, wer sich nach dir anmeldet. Er ist
   * kein Riegel, er ist eine Aussage — und deshalb ist seine ANWESENHEIT die
   * Zusage, die hier geprueft wird.
   */
  await expect(page.getByTestId("zeichen-merkliste-geraet-hinweis")).toContainText(
    "auf diesem Gerät",
  );

  await page.getByTestId("zeichen-merkliste-geraet-loeschen").click();

  await expect.poll(() => idbDa(page), { timeout: 30_000 }).toBe(false);
  await expect(page.getByTestId("zeichen-merkliste-geraet-leer")).toBeVisible();
  /*
   * ⛔ UND DER KATALOG BLEIBT — GEMESSEN GEGEN DIE HEUTIGE FASSUNG, nicht gegen
   * die erste: `loescheGeraetedaten()` raeumte anfangs auch alle Caches und nahm
   * damit den offline verfuegbaren Katalog mit, obwohl weder Knopf noch Hinweis
   * das sagen (Aufgabe 9, Fix-Runde 1). Die Tat ist verengt worden; diese Zeile
   * haelt die Entscheidung fest. Wer sie umdreht, dreht eine begruendete
   * Entscheidung um und merkt es hier.
   */
  expect(await page.evaluate(() => caches.keys()), "der Loeschknopf hat den Katalog mitgenommen")
    .toContain(CACHE);
  await page.reload();
  await expect(page.getByTestId("zeichen-offline")).toBeVisible();

  await context.setOffline(false);
});

test("der Logout-Haken loescht Cache UND Merkliste", async ({ page }) => {
  /*
   * Der Logout-Haken ist seit Spec §7.5 keine Vorsorge mehr, sondern die tragende
   * Massnahme fuer den GEORDNETEN Fall — und ausdruecklich nicht fuer Ablauf,
   * Widerruf, Gruppenentzug oder ein weggelegtes Geraet. next-auth sendet genau
   * `POST /api/auth/signout`.
   *
   * ⚠️ DER WORKER LOESCHT BEIM ANBLICK DER ANFRAGE, nicht auf eine bestimmte
   * Antwort hin (`_lib/sw-quelle.ts`, Aufgabe 9). Ob die Antwort 302 oder wegen
   * fehlendem CSRF-Token 400 lautet, ist deshalb gleichgueltig. Loescht die
   * Umsetzung stattdessen erst nach einer 200er-Antwort, ist DIESER Fall die
   * Stelle, an der das auffaellt — dann hat Aufgabe 9 ihre Zusage nicht erfuellt,
   * und der Test wird nicht angepasst, sondern der Worker.
   */
  await devLogin(page, { host: HOST, port: PORT, callbackPath: "/katalog" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await warteAufGecachteHuelle(page);
  // Vorbedingung ausdruecklich: ohne sie waere „Cache leer" auch dann gruen, wenn
  // nie etwas darin lag.
  expect(await page.evaluate(() => caches.keys())).toContain(CACHE);

  await page.evaluate(() => fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined));

  await expect
    .poll(() => page.evaluate(() => caches.keys().then((k) => k.length)), { timeout: 30_000 })
    .toBe(0);
  await expect.poll(() => idbDa(page), { timeout: 30_000 }).toBe(false);
});
