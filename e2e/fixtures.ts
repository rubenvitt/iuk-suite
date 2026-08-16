import { Locator, Page, expect } from "@playwright/test";

export async function devLogin(
  page: Page,
  opts: { host: string; email?: string; groups?: string; callbackPath?: string; port?: number },
) {
  const cb = encodeURIComponent(opts.callbackPath ?? "/");
  // Port ist überschreibbar, weil der PWA-Spike auf einem eigenen Server läuft.
  await page.goto(`http://${opts.host}:${opts.port ?? 3100}/login?callbackUrl=${cb}`);
  // The login form is a client component; on a cold cross-host load (dev mode,
  // no shared cache across *.localtest.me origins) React can still be
  // hydrating when the click lands, so the browser falls through to a native
  // form GET instead of the JS submit handler. Wait for the network to settle
  // (scripts fetched + executed) before interacting so the click always hits
  // the hydrated handler.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("email").fill(opts.email ?? "dev@localtest.me");
  await page.getByLabel("groups").fill(opts.groups ?? "");
  await page.getByRole("button", { name: "Dev-Login" }).click();
  // next-auth's client signIn() posts the credentials, then assigns
  // window.location.href to the final redirect target — a real navigation,
  // not just a fetch. Waiting for networkidle right after click() is racy:
  // the POST can still be in flight (nothing navigating yet) when idle is
  // sampled, so the wait resolves before the redirect starts and callers
  // that immediately navigate elsewhere (e.g. page.goto to another host)
  // can cancel the pending login redirect (net::ERR_ABORTED). Wait for the
  // URL to actually leave /login first, then let the network settle.
  //
  // 45s, NOT 10s — and that is not a wager, it is a measurement. The budget
  // used to be 10s, which holds on every developer machine and failed in CI
  // every time, because CI runs `next dev` on a cold `.next` (fresh checkout,
  // no build cache) on a small runner. This one click makes the dev server
  // compile the next-auth route handlers AND the authenticated module root
  // before the browser can leave /login. Measured on a deleted `.next` with the
  // machine put under artificial CPU load, to stand in for a CI runner: 13.7s.
  // The same login a second time, warm: 0.3s. So 10s was never reachable in CI
  // and the first logging-in test of the run always died right here. The login
  // page itself is compiled before the suite starts — see `webServer.url` in
  // playwright.config.ts, where the numbers are written out in full.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
  await page.waitForLoadState("networkidle");
}

/**
 * KLICKT ERST, WENN DAS ELEMENT SEINEN PLATZ NICHT MEHR WECHSELT — und das ist
 * kein vorsorgliches Warten, sondern die Abhilfe zu einem GEMESSENEN Ausfall.
 *
 * ⚠️ DAS SYMPTOM SIEHT AUS WIE „DER KNOPF NAVIGIERT NICHT". Gemessen auf `main`
 * (Lauf 31951787232, Shard 2, alle drei Versuche gleich), in der Ablaufverfolgung
 * des Laufs nachgelesen und nicht vermutet:
 *
 *     TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
 *     waiting for navigation until "commit"
 *
 * Playwright meldete den Klick als gelungen („click action done"), der
 * aufgeloeste Knoten war ein echter Anker (`<a href="/verwaltung/checklisten">`),
 * und im Netzwerkteil der Ablaufverfolgung steht fuer das Ziel **kein einziger
 * Aufruf**. Der Anker trug danach den Fokus (`[active]` im ariaSnapshot) — der
 * `mousedown` hat ihn also getroffen.
 *
 * ⚠️ DIE URSACHE IST EIN UMBRUCH ZWISCHEN `mousedown` UND `mouseup`. Die
 * Bildfolge der Aufzeichnung zeigt es Bild fuer Bild: bei 349,02 s (Klick laeuft)
 * steht der Knopf auf y≈346, bei 349,23 s (Klick fertig) auf y≈107 — die Seite
 * ist um rund 240 px nach oben gesprungen. Playwright setzt beide Mausereignisse
 * auf den Punkt, den es VOR dem Klick berechnet hat (hier y=347): `mousedown`
 * trifft den Anker, `mouseup` faellt auf die Flaeche, die inzwischen dort liegt.
 * Ein `click`-Ereignis feuert dann auf dem gemeinsamen VORFAHREN beider Ziele —
 * einem `<div>`, keinem Anker —, und ein `<div>` navigiert nicht. Kein
 * `preventDefault`, kein kaputter Knopf, keine Anfrage.
 *
 * ⚠️ WOHER DER UMBRUCH KOMMT: `SessionProvider` holt die Sitzung im Browser
 * nach. In der CI scheitern die ersten zwei `/api/auth/session` (348,45 s,
 * `dur=-1ms`, im Protokoll als `ClientFetchError: Failed to fetch` — die Route
 * ist unter `next dev` beim ersten Treffer noch in Uebersetzung); erst der
 * Nachschlag bei 349,19 s antwortet. Mit der Sitzung wechselt die Huelle von der
 * schmalen Platzhalter-Navigation auf die volle Spalte, und der Inhalt rutscht
 * hoch. Das passiert also NACH `load` — `page.goto(..., waitUntil: "load")` ist
 * durch, und Playwrights eigene Stabilitaetsprobe ebenfalls: sie misst VOR dem
 * Klick, nicht waehrend seiner ~200 ms.
 *
 * ⚠️ NICHT MIT EINEM GROESSEREN ZEITBUDGET ZU HEILEN, und das ist derselbe
 * Irrtum, den `lagerbuch-checklisten.spec.ts` schon einmal ausgeschrieben hat:
 * gewartet wird auf eine Navigation, die nie angestossen wurde. Auch die zwei
 * Wiederholungen aus `playwright.config.ts` fangen es nicht — die Lage haelt
 * ueber alle drei Versuche an, weil sie an der Uebersetzungslatenz des
 * Dev-Servers haengt und nicht am Zufall.
 *
 * LOKAL IST DAS UNSICHTBAR: bei warmem `.next` antwortet `/api/auth/session`
 * vor `load`, die Huelle steht schon richtig, und derselbe Klick navigiert (20
 * von 20 Mal gemessen). Nur die CI mit kaltem `.next` auf einem kleinen Runner
 * schiebt die Antwort hinter den Klick.
 */
export async function klickeWennRuhig(
  ort: Locator,
  optionen: { timeout?: number } = {},
): Promise<void> {
  const frist = optionen.timeout ?? 15_000;
  const seite = ort.page();
  // DREI gleiche Messungen in Folge, nicht zwei: der beobachtete Sprung faellt
  // in ein Fenster von ~200 ms, und zwei Proben im Abstand von 100 ms koennten
  // beide davor liegen. Drei decken die volle Dauer eines Klicks ab.
  const NOETIGE_RUHE = 3;
  const ABSTAND = 100;

  // EIN Zeitbudget fuer beides, nicht zweimal `frist`: die Frist steht vor dem
  // Sichtbarwerden, damit ein langsam erscheinendes Element nicht heimlich das
  // doppelte Budget bekommt.
  const ende = Date.now() + frist;
  await ort.waitFor({ state: "visible", timeout: frist });

  let vorher = await ort.boundingBox();
  let ruhig = 0;
  while (Date.now() < ende) {
    await seite.waitForTimeout(ABSTAND);
    const jetzt = await ort.boundingBox();
    const gleich =
      vorher !== null &&
      jetzt !== null &&
      jetzt.x === vorher.x &&
      jetzt.y === vorher.y &&
      jetzt.width === vorher.width &&
      jetzt.height === vorher.height;
    ruhig = gleich ? ruhig + 1 : 0;
    vorher = jetzt;
    if (ruhig >= NOETIGE_RUHE) {
      await ort.click();
      return;
    }
  }
  // Laut statt still: ein Element, das sich nach 15 s immer noch bewegt, ist ein
  // Befund und kein Grund, trotzdem zu klicken.
  throw new Error(
    `klickeWennRuhig: das Element kam binnen ${frist} ms nicht zur Ruhe — ` +
      `zuletzt gemessen ${JSON.stringify(vorher)}`,
  );
}
