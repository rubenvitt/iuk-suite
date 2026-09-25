import { Locator, Page, Response, expect } from "@playwright/test"; import { E2E_PORT, E2E_PORTS } from "./helpers/ports"; export { E2E_PORT, E2E_PORTS }; import { E2E_VORGEBAUT } from "./helpers/server";

export async function devLogin(
  page: Page,
  opts: { host: string; email?: string; groups?: string; callbackPath?: string; port?: number },
) {
  const cb = encodeURIComponent(opts.callbackPath ?? "/");
  // Port ist überschreibbar, weil der PWA-Spike auf einem eigenen Server läuft.
  await page.goto(`http://${opts.host}:${opts.port ?? E2E_PORT}/login?callbackUrl=${cb}`);
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
  // page itself is compiled before the suite starts. Against the prebuilt server
  // (CI since DRK-415) nothing compiles: 20s, below the 45s test timeout, so a stuck login reports here.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: E2E_VORGEBAUT ? 20_000 : 45_000 });
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
  await messeWennRuhig(ort, { ...optionen, wer: "klickeWennRuhig" });
  await ort.click();
}

/**
 * MISST DEN KASTEN EINES ELEMENTS, SOBALD ER STILLSTEHT — und gibt ihn zurueck.
 *
 * ⚠️ DIESELBE PROBE WIE OBEN, UND DAS IST DER PUNKT: `klickeWennRuhig` ruft
 * sie. Wer sie fuers Messen ein zweites Mal hinschriebe, haette zwei Begriffe
 * von „ruhig", die beim naechsten Nachjustieren auseinanderlaufen.
 *
 * ⚠️ DER ANLASS IST EINE GEMESSENE ROETE, KEINE VORSORGE (DRK-339, Lauf
 * 35066242148). Eine Zusicherung auf die Trefferflaeche einer Radio-Zeile in
 * einem Popconfirm las **35,2 px** statt der erwarteten 44 — und 35,2 ist
 * exakt 44 × 0,8. 0,8 ist die Anfangsskalierung von antds Aufblend-Animation;
 * `boundingBox()` liefert den TRANSFORMIERTEN Kasten, misst also die
 * halbfertige Animation. Die Wiederholung las 39,9 px — ein Wert mittendrin,
 * und genau seine Unstetigkeit verraet die Ursache.
 *
 * ⚠️ DAS SYMPTOM FUEHRT IN DIE IRRE. Es sieht aus wie „die CSS-Regel greift
 * nicht" und schickt die Suche in die Spezifitaet (Falle 5) — dabei steht die
 * Regel richtig da, und der Kasten ist am Ende 44 px hoch. Wer hier die Regel
 * „verstaerkt", macht sie kaputt, ohne dass der Test gruen wird.
 */
export async function messeWennRuhig(
  ort: Locator,
  optionen: { timeout?: number; wer?: string } = {},
): Promise<{ x: number; y: number; width: number; height: number }> {
  const frist = optionen.timeout ?? 15_000;
  const wer = optionen.wer ?? "messeWennRuhig";
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
    if (ruhig >= NOETIGE_RUHE && jetzt !== null) return jetzt;
  }
  // Laut statt still: ein Element, das sich nach 15 s immer noch bewegt, ist ein
  // Befund und kein Grund, trotzdem zu klicken oder zu messen.
  throw new Error(
    `${wer}: das Element kam binnen ${frist} ms nicht zur Ruhe — ` +
      `zuletzt gemessen ${JSON.stringify(vorher)}`,
  );
}

/**
 * MELDET DIE LAUFENDE SITZUNG AB UND MELDET SICH NEU AN — der Rollenwechsel
 * innerhalb EINES Testfalls.
 *
 * ⚠️ `about:blank` VOR `clearCookies()`, UND DAS IST GEMESSEN, NICHT VORSORGE.
 * Gemessen auf `main` (Lauf 33173490683, Job `e2e (1)`, Versuch 2 von
 * `aufgaben.spec.ts`, „Der volle Durchlauf"), aus der Ablaufverfolgung gelesen:
 *
 *     13:11:18.522  GET /api/auth/session   Cookie: csrf, theme, callback-url, session-token
 *     13:11:18.526  GET /api/auth/session   (dito)          ← beide VOR clearCookies losgeschickt
 *     ~13:11:18.55  clearCookies()
 *     ~13:11:18.60  Antwort auf .522 landet: Set-Cookie: authjs.session-token=…
 *     13:11:18.603  GET /login?callbackUrl=%2Fverteilen
 *                   Cookie: authjs.session-token   ← csrf, callback-url, theme sind WEG,
 *                                                    die Sitzung ist WIEDER DA
 *                   → 307 nach "/"
 *
 * Der Cookie-Krug beweist es Feld für Feld: alles, was `clearCookies()` gelöscht
 * hat, fehlt — nur der Sitzungscookie steht wieder drin, weil die Antwort einer
 * NOCH LAUFENDEN `/api/auth/session`-Anfrage ihn Millisekunden vor der
 * Navigation neu gesetzt hat. `SessionProvider` holt diese Route im Hintergrund
 * nach, und next-auth erneuert den Cookie bei JEDEM Lesen (`Set-Cookie` steht
 * auf jeder 200-Antwort dieser Route).
 *
 * ⚠️ DAS SYMPTOM ZEIGT AUF DIE FALSCHE STELLE: `/login` leitet eine bestehende
 * Sitzung sofort weiter (`src/app/login/page.tsx`, `if (session?.user)
 * redirect("/")`), `devLogin`s `waitForURL` löst dabei SOFORT auf (die Adresse
 * verlässt "/login" ja tatsächlich), und der Fehlschlag kommt 80 Sekunden später
 * als `locator.fill: waiting for getByLabel('email')` — eine Meldung, die nach
 * einem kaputten Anmeldeformular klingt und keins meint. Dieselbe Familie wie
 * CLAUDE.mds Fallen 10/11/12: ein Test, der etwas anderes misst, als sein Name
 * sagt.
 *
 * `about:blank` beendet das Dokument samt seiner laufenden Anfragen; danach kann
 * nichts mehr einen Cookie setzen. Die Prüfung des leeren Krugs danach kostet
 * nichts und macht einen künftigen Rückfall LAUT statt still.
 *
 * ⚠️ KEIN GATE FINDET DAS: `build`/`typecheck`/`lint` sehen einen Aufruf, Vitest
 * startet keinen Browser, und lokal ist es unsichtbar — der Krug wird nur dann
 * neu gefüllt, wenn die Antwort in genau das Fenster zwischen `clearCookies()`
 * und der nächsten Navigation fällt, und das braucht die Latenz eines kleinen
 * CI-Runners.
 */
export async function wechsleAnmeldung(
  page: Page,
  opts: Parameters<typeof devLogin>[1],
): Promise<void> {
  await page.goto("about:blank");
  await page.context().clearCookies();
  expect(
    (await page.context().cookies()).map((c) => c.name),
    "Nach clearCookies() steht noch ein Cookie im Krug — eine laufende Anfrage hat ihn neu gesetzt",
  ).toEqual([]);
  await devLogin(page, opts);
}

/**
 * DIE SICHTBARE DARSTELLUNG EINER TABELLENZEILE — Zeile ODER Karte (DRK-451).
 *
 * ⚠️ DER ANLASS IST EINE GEMESSENE ROETE, KEINE VORSORGE. Seit die langen
 * Tabellen unterhalb von 768px als Karten rendern, steht die Tabelle dort auf
 * `display: none` — sie ist aber weiterhin IM BAUM. Ein Greifer ueber
 * `[data-row-key]` findet damit auf dem Telefon einen VERBORGENEN Knoten, und
 * das Symptom fuehrt in die Irre:
 *
 *     waiting for locator('[data-row-key]').first() to be visible
 *     31 × locator resolved to hidden <div role="row" data-row-key="…">
 *
 * Das liest sich wie „die Zeile kommt nicht" — also wie ein Datenproblem oder
 * ein zu knappes Zeitbudget. Beides ist falsch: die Zeile ist da, sie ist nur
 * nicht die Darstellung, die der Nutzer bei dieser Breite sieht. Gemessen in
 * CI-Lauf 35663637630, `e2e (suite-huelle)`, an `flyin-breite.spec.ts` bei
 * 390px.
 *
 * ⚠️ SCHLIMMER ALS EIN ROTER TEST IST DER STILLE FALL. Eine Zusicherung, die
 * keine Sichtbarkeit verlangt (`toContainText`, ein `evaluate` auf den Kasten),
 * MISST DEN VERBORGENEN KNOTEN KLAGLOS WEITER — sie prueft dann die Tabelle,
 * waehrend auf dem Schirm eine Karte steht. Das ist dieselbe Familie wie
 * CLAUDE.mds Fallen 10/11/12: ein Test, der etwas anderes misst, als sein Name
 * sagt. Wer eine Zeile auf mehreren Breiten anfasst, greift sie deshalb hier.
 *
 * ⚠️ UND DESHALB STEHT HIER `:visible` UND KEINE BREITENABFRAGE. Eine
 * Fallunterscheidung auf 768 im Test waere ein ZWEITER Ort fuer den Breakpoint
 * der Suite — genau das, was `docs/design/README.md` mit „ein Breakpoint"
 * ausschliesst; sie ginge beim naechsten Nachjustieren still auseinander.
 * `:visible` fragt stattdessen das Ergebnis ab: welche der beiden
 * Darstellungen steht gerade da.
 */
export function sichtbareZeilen(ort: Page | Locator, schluessel?: string): Locator {
  const wahl = schluessel === undefined
    ? "[data-row-key]:visible, [data-karte-key]:visible"
    : `[data-row-key='${schluessel}']:visible, [data-karte-key='${schluessel}']:visible`;
  return ort.locator(wahl);
}

/**
 * WARTET, BIS GENAU EINE DER BEIDEN DARSTELLUNGEN IM BILD STEHT (DRK-451).
 *
 * ⚠️ DER ANLASS IST EINE GEMESSENE ROETE, DIE `sichtbareZeilen` SELBST
 * AUSGELOEST HAT — und das ist der Grund, warum sie hier daneben steht.
 * Kartenliste und Tabelle stehen BEIDE im Baum; welche verschwindet,
 * entscheidet eine Regel aus einem CSS-Modul. Unter `next dev` kommt die
 * nicht mit dem ersten Bild, sondern wird nachgereicht. In diesem Fenster
 * sind kurz BEIDE sichtbar, und weil die Karten VOR der Tabelle rendern,
 * greift `sichtbareZeilen(page).first()` dann die Karte — bei 1280px, wo sie
 * gleich darauf verschwindet.
 *
 * ⚠️ DAS SYMPTOM NENNT DIE URSACHE NICHT: Playwright meldet den Klick als
 * gelungen, und die naechste Zusicherung faellt mit „element(s) not found"
 * auf die SCHUBLADE. Das liest sich wie ein kaputter Zeilenklick, gemessen in
 * CI-Lauf 35669113741 (`flyin-breite:110`, dreimal in Folge; `:179` einmal,
 * in der Wiederholung gruen — dieselbe Ursache, nur seltener getroffen).
 * Dieselbe Familie wie CLAUDE.mds Falle 12: gewartet wird auf etwas, das nie
 * angestossen wurde.
 *
 * ⚠️ WARUM NICHT EINFACH `[data-row-key]` NEHMEN, wo die Tabelle gemeint ist:
 * an einer Stelle, die NUR breit misst, ist das richtig und steht auch so da.
 * Wer aber ueber mehrere Breiten laeuft, braucht beide — und dann ist die
 * Probe auf das fertige Raster die Abhilfe, nicht ein laengeres Zeitbudget
 * (das Fenster ist kurz, der Fehler trotzdem reproduzierbar).
 */
export async function warteAufDarstellung(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const imBild = (wahl: string): number =>
      [...document.querySelectorAll(wahl)]
        .filter((el) => el.getClientRects().length > 0).length;
    // Die leere Kartenliste ist ein `<p>`, die gefuellte ein `<ul>` — beide
    // zaehlen, sonst haengt die Probe auf einer Seite ohne Treffer.
    const schmal = imBild("[data-rolle='schmalkarten'], [data-rolle='schmalkarten-leer']");
    const breit = imBild("[data-rolle='breitansicht']");
    /*
     * ⚠️ „KEINE BEIDER SORTEN GLEICHZEITIG" — NICHT „GENAU EINE". Der erste
     * Anlauf zaehlte beide zusammen und verlangte 1; das ist auf einer Seite
     * mit EINER Tabelle richtig und auf jeder anderen unerfuellbar. Das
     * Fahrzeugblatt traegt zwei (Soll und Verfall), also stand dort dauerhaft
     * 2 — die Probe lief in ihr Zeitbudget, und ihre eigene Meldung („das
     * Raster ist nicht fertig") behauptete eine Ursache, die es nicht gab.
     * Gemessen in CI-Lauf 35671119278: drei Fehlschlaege in
     * `lagerbuch-ist-bestand`, auf allen drei Breiten.
     */
    return schmal === 0 || breit === 0;
  }), {
    message: "Karten und Tabelle stehen noch beide im Bild — das Raster ist nicht fertig",
  }).toBe(true);
}

/**
 * WARTET, BIS DIE HUELLE IHRE SPALTEN AUFGETEILT HAT — der Inhalt beginnt dort,
 * wo die Seitenleiste endet (DRK-322, nach `fixtures.ts` gehoben mit DRK-361).
 *
 * ⚠️ DER ANLASS IST EINE GEMESSENE ROETE, KEINE VORSORGE. Gemessen am
 * 2026-09-15 auf dem Fahrzeugblatt bei 834px, dreimal in Folge gleich:
 *
 *     sofort nach dem ersten sichtbaren Treffer   main 834px — Tabellenkasten 802/802
 *     nach der Hydration                          main 594px — Tabellenkasten 562/746
 *
 * Die Leiste steht in BEIDEN Zustaenden mit 240px da (`display: block`) — wer
 * nur nach ihr sieht, schliesst faelschlich, das Raster stehe. Der Inhalt lag
 * anfangs bloss UNTER ihr statt neben ihr, weil `ant-layout-has-sider` erst mit
 * der Hydration kam (Falle 12, zweiter Absatz, in `CLAUDE.md`).
 *
 * ⚠️ SEIT DRK-363 IST DIE PROBE SOFORT WAHR: `SuiteRahmen` setzt `hasSider`,
 * die Klasse steht im Server-HTML (`shell-spaltenaufteilung.spec.ts`). Sie
 * bleibt trotzdem vor jeder Messung stehen, die von der Breite der
 * Inhaltsspalte abhaengt — sie kostet nichts und faengt es, falls die Klasse je
 * wieder erst mit der Hydration kommt oder ein CSS-Modul unter `next dev`
 * nachgereicht wird.
 *
 * ⚠️ DIE RICHTUNG DES FEHLERS IST MEIST DIE STILLE. Im Zwischenzustand hat der
 * Inhalt 240px MEHR Platz: „die Tabelle scrollt in sich" faellt dann laut, aber
 * „kein Ueberlauf", „Kachel mindestens 190px" oder „Spalten nebeneinander"
 * bestehen, obwohl die fertige Seite sie verletzen koennte.
 *
 * ⚠️ NICHT MIT EINEM GROESSEREN ZEITBUDGET ZU HEILEN, und `networkidle` ist
 * keine Zusage ueber das Raster: wer einmal per `evaluate` misst und danach nur
 * noch rechnet, hat genau einen Versuch. Diese Probe fragt die Invariante ab,
 * nicht eine Frist.
 *
 * Unterhalb von 768px steht die Leiste auf `display: none`
 * (`core/shell/shell.module.css`), ihr Kasten ist durchweg 0; ohne Navigation
 * gibt es gar keine. In beiden Faellen ist die Probe sofort wahr, ohne etwas
 * zu behaupten — und das ist richtig: ohne Leiste gibt es nichts zu warten.
 */
export async function warteAufSpaltenaufteilung(page: Page): Promise<void> {
  await warteAufGestreamteInhalte(page); await expect.poll(() => page.evaluate(() => {
    const inhalt = document.querySelector(".ant-layout-content");
    const leiste = document.querySelector(".ant-layout-sider");
    if (!inhalt) return false;
    const links = inhalt.getBoundingClientRect().left;
    const rechts = leiste ? leiste.getBoundingClientRect().right : 0;
    return links >= rechts - 1;
  }), {
    message: "Der Inhalt liegt noch unter der Seitenleiste statt neben ihr",
  }).toBe(true);
}

/**
 * WELCHER 404 ES WAR — fuer die Meldung einer Zusicherung auf `status() === 200`.
 *
 * Zwei Ausfaelle sehen im Browser gleich aus (dieselbe Seite aus
 * `app/not-found.tsx`) und haben entgegengesetzte Ursachen:
 *
 *   - Die SEITE weist ab (`notFound()` im Guard oder weil ein Datensatz fehlt).
 *     Der Router-Baum im Flight-Payload beginnt dann beim Segment der
 *     umgeschriebenen Route (gemessen: `m`).
 *   - `next dev` KENNT DIE ROUTE NICHT. Dann rendert Next seine eigene
 *     `/_not-found`-Route, und der Baum beginnt dort.
 *
 * Gemessen in CI-Lauf 35043030333 (DRK-369): `/groups/1/evenings/1/auswertung`
 * lieferte dreimal 404 mit Baum `/_not-found`, waehrend das Cockpit
 * `/groups/1` im selben Versuch `eveningId: 1` und `surveyId: 1` auslieferte.
 * Die Daten stimmten also; die Spur „Seed-Ids und Reihenfolge der Specs" war
 * falsch und haette einen halben Tag gekostet. Die Gegenprobe gegen einen
 * lokalen `next dev`: Abend 1 unter Gruppe 2 und Abend 999 → 404 mit Baum `m`,
 * eine erfundene Adresse → 404 mit Baum `/_not-found`.
 *
 * Liefert "" bei 200, sonst einen Satz zum Anhaengen an die Meldung. Liest den
 * Payload nur im Fehlerfall. Faende die Probe den Baum nicht mehr (anderes
 * Payload-Format nach einem Next-Upgrade), sagt sie das, statt zu raten.
 */
export async function warumNicht200(antwort: Response | null): Promise<string> {
  if (!antwort) return " — keine Antwort";
  if (antwort.status() === 200) return "";
  const html = await antwort.text().catch(() => "");
  const wurzel = /\\"f\\":\[\[\[\\"\\",\{\\"children\\":\[\\"([^"\\]*)/.exec(html)?.[1];
  if (wurzel === "/_not-found") {
    return " — Router-Baum `/_not-found`: next dev KENNT DIE ROUTE NICHT. Kein notFound() der Seite, keine Datenfrage (DRK-369)";
  }
  if (wurzel) {
    return ` — Router-Baum beginnt bei „${wurzel}": die Route ist bekannt, die SEITE hat abgewiesen (notFound() im Guard oder fehlende Daten)`;
  }
  return " — Router-Baum im Payload nicht gefunden (Format geaendert?)";
}

/**
 * WARTET, BIS REACT SEINE GESTREAMTEN INHALTE EINGESETZT HAT (DRK-415, Falle 22).
 *
 * Next streamt Suspense-Inhalte als `<div hidden id="S:n">` hinter die Seite und
 * setzt sie per Skript an ihren Platz. Gegen den gebauten Stand bleibt dieser
 * Container gemessen bis ~350 ms NACH `load` stehen (React bündelt das
 * Einsetzen), und solange steht der Inhalt DOPPELT im Baum: einmal sichtbar,
 * einmal versteckt mit Breite 0. Ein Greifer trifft dann zwei Knoten (strict
 * mode), eine Zählung doppelt so viele, eine Breitenmessung Nullen. Unter
 * `next dev` war das Fenster von der Übersetzungszeit verdeckt.
 *
 * Ohne gestreamten Inhalt ist die Probe sofort wahr.
 */
export async function warteAufGestreamteInhalte(page: Page): Promise<void> {
  await expect(
    page.locator('div[hidden][id^="S:"]'),
    "React hat gestreamte Suspense-Inhalte noch nicht eingesetzt",
  ).toHaveCount(0);
}
