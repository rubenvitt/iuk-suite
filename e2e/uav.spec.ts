import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig, wechsleAnmeldung } from "./fixtures";
import {
  E2E_CODE_AKTIV,
  E2E_CODE_INAKTIV,
  UAV_ADMIN_GRUPPE,
  UAV_HOST,
  fremdUrl,
  uavUrl,
  warmeUavRouten,
} from "./helpers/uav";

// Falle 10 (CLAUDE.md): einmal je Datei, VOR jedem Test — deckt sowohl den
// sequentiellen Lauf (`workers: 1`, spätere Fälle träfen die Routen ohnehin
// schon warm) als auch einen gefilterten `--grep`-Lauf ab, der nur einen
// einzelnen Fall dieser Datei ausführt. Siehe `warmeUavRouten` in
// `e2e/helpers/uav.ts`.
test.beforeAll(async ({ request }) => {
  await warmeUavRouten(request);
});

/**
 * uav (Drohnen-Trainingsbegleiter) — der einzige Beweis gegen einen echten
 * Browser und einen echten Server (Task 21). Seed: `_lib/seedLokal.ts`, ueber
 * `scripts/seed-lokal.ts uav` in `playwright.config.ts` vor `next dev` gefahren
 * (zwei Teilnehmer, drei Aufgaben `1-1`/`1-2`/`2-1`, zwei Durchfuehrungen zu
 * `1-1`).
 *
 * Teilnehmer-ID des aktiven Seed-Teilnehmers (`seedLokal.ts:88`):
 * `seed-uav-teilnehmer-aktiv` — WOERTLICH dupliziert statt importiert (kein
 * Import aus `src/`, siehe `e2e/helpers/uav.ts`).
 */
const AKTIVER_TEILNEHMER_ID = "seed-uav-teilnehmer-aktiv";

test("Magic-Link löst den Code ein und landet auf dem Dashboard (Check 3)", async ({ page }) => {
  await page.goto(uavUrl(`/login?code=${E2E_CODE_AKTIV.toLowerCase()}`));
  // `level: 1` UND exakter Name — ohne Level träfe die Regex `/Training/`
  // (naheliegend, weil „Drohnen-Trainingsbegleiter" das Wort als Teilzeichenkette
  // enthält) auch die H2 „Teil 3 · Training von Einsatzszenarien" und der
  // Locator wäre nicht eindeutig (`_ui/teilnehmer/Dashboard.tsx`).
  await expect(
    page.getByRole("heading", { level: 1, name: "Drohnen-Trainingsbegleiter" }),
  ).toBeVisible();

  const cookies = await page.context().cookies(uavUrl("/"));
  const sid = cookies.find((c) => c.name === "sid");
  expect(sid, "sid-Cookie fehlt nach erfolgreichem Magic-Link-Login").toBeTruthy();
  expect(sid?.path).toBe("/");
  expect(sid?.httpOnly).toBe(true);
  // Host-only: kein `domain`-Attribut gesetzt (`sidCookieOptionen()` trägt
  // keine `domain`) — Playwright liefert dann den Host selbst zurück, NICHT
  // eine übergeordnete Domain wie `.localtest.me`.
  expect(sid?.domain).toBe(UAV_HOST);
});

test("/login ohne code auf dem uav-Host zeigt den Suite-Dev-Login (Check 8)", async ({ page }) => {
  // `decideRoute` (`src/core/routing.ts:55-58`): die Magic-Link-Brücke greift
  // NUR mit einem nichtleeren `code`-Parameter — ohne ihn ist `/login` PASSTHROUGH
  // und bleibt der suiteweite Login, unabhängig vom Host.
  await page.goto(uavUrl("/login"));
  await expect(page.getByRole("button", { name: "Dev-Login" })).toBeVisible();
});

test("inaktiver Code wird mit Meldung abgewiesen (Check 8)", async ({ page }) => {
  // Auch mit `code` gesetzt geht die Anfrage über die Magic-Link-Brücke
  // (`/m/uav/login`) — der Login-Versuch selbst schlägt serverseitig fehl,
  // weil der Teilnehmer `aktiv: false` trägt (`_lib/seedLokal.ts:89`).
  await page.goto(uavUrl(`/login?code=${E2E_CODE_INAKTIV}`));
  // NICHT `getByRole("alert")`: Next.js' eigener Route-Announcer
  // (`#__next-route-announcer__`) trägt ebenfalls `role="alert"` und macht den
  // Locator sonst mehrdeutig — `#login-fehler` ist die konkrete ID aus
  // `_ui/teilnehmer/LoginForm.tsx`.
  await expect(page.locator("#login-fehler")).toHaveText("Ungültiger oder inaktiver Code.");
  // Bleibt auf /login stehen statt eines echten Redirects auf "/".
  await expect(page).toHaveURL(/\/login/);
});

test("/api/admin/participants/export löst zur Export-Route auf, nicht zur [id]-Route (Check 1)", async ({
  page,
}) => {
  await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
  const antwort = await page.request.get(uavUrl("/api/admin/participants/export"));
  expect(antwort.status()).toBe(200);
  expect(antwort.headers()["content-type"]).toContain("text/csv");
  const text = await antwort.text();
  // Header-Zeile aus `api/admin/participants/export/route.ts:12` — ein Treffer
  // auf die `[id]`-Route läge stattdessen als JSON vor (Participant-Detail
  // oder ein 404 aus `NotFound`, weil "export" keine gültige Teilnehmer-ID ist).
  expect(text).toContain('"Name","Beginn","Erledigt","Gesamt","Quote","LetzteAktivität","Status"');
});

test("Die Verwaltung trägt genau eine Kopfzeile, die Teilnehmer-Ansicht gar keine (Check 2)", async ({
  page,
}) => {
  await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
  await expect(page.getByTestId("suite-header")).toHaveCount(1);
  // `(admin)/layout.tsx` trägt `variant="full"` (`FullShell`) — eine
  // `MinimalShell` darf hier NICHT zusätzlich rendern (genau das wäre die
  // doppelte Hülle aus Check 2).
  await expect(page.getByTestId("minimal-shell")).toHaveCount(0);

  /*
   * ⛔ DIE ZWEITE HÄLFTE HAT SICH UMGEDREHT — BETREIBERENTSCHEIDUNG 2026-08-29.
   *
   * Hier stand: der Teilnehmer-Zweig trägt genau EINE `suite-header` und genau
   * EINE `minimal-shell`. Das war die Zusage zu Aufgabe 15. Der Betreiber hat
   * sie aufgehoben: „anonymer Zugriff muss möglich sein und im Kiosk Mode ohne
   * Shell auch für Teilnehmer." Die Trainingsansicht läuft seither ohne jede
   * Suite-Hülle in ihrem eigenen, schlanken Rahmen
   * (`_ui/teilnehmer/TeilnehmerRahmen.tsx`) — Vorbild sind `radio/(ausleihe)`
   * und `lagerbuch/helfer`.
   *
   * Was die Zusage BLEIBT, ist ihr Kern: die beiden Zweige dürfen sich ihre
   * Hüllen nicht gegenseitig unterschieben. Deshalb wird hier weiterhin
   * gezählt — nur eben auf null. Ein `<Shell>` im Teilnehmer-Zweig ist ab
   * jetzt der Defekt, nicht seine Abwesenheit.
   *
   * Teilnehmer-Zweig separat prüfen: eigener Login-Mechanismus (Magic-Link-
   * Cookie `sid`, kein Auth.js) — Cookies erst leeren (dieselbe Bauform wie
   * `wechsleAnmeldung`, Falle „laufende /api/auth/session-Antwort setzt den
   * Cookie neu"), dann frisch als Teilnehmer anmelden.
   */
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto(uavUrl(`/login?code=${E2E_CODE_AKTIV}`));
  await page.waitForURL((url) => url.pathname !== "/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Drohnen-Trainingsbegleiter" }),
  ).toBeVisible();
  await expect(page.getByTestId("suite-header")).toHaveCount(0);
  await expect(page.getByTestId("minimal-shell")).toHaveCount(0);
  // Und der eigene Rahmen ist wirklich da — sonst wäre „keine Kopfzeile" auch
  // dann grün, wenn die ganze Hülle fehlte.
  await expect(page.locator("[data-rolle='uav-verwaltungslink']")).toHaveCount(1);
});

/*
 * DER WEG IN DIE APP UND DER WEG IN DIE VERWALTUNG — beide anonym, beide
 * sichtbar. Gemessen am 2026-08-29 fehlte beides: der Hinweis sagte „Bitte mit
 * deinem Code anmelden", sein Knopf führte auf `/login`, und dort steht ohne
 * `code`-Parameter der Suite-Login mit Pocket ID statt eines Code-Feldes
 * (`core/routing.ts` schreibt `/login` nur MIT nichtleerem `code` ins Modul um).
 * Der Verwaltungseintrag wiederum hing an `canAdminModule("uav")` — einer
 * Bedingung, die am Einstieg nie wahr ist.
 */
test("anonym führen beide Wege irgendwohin: Code-Feld und Verwaltung (Check 10)", async ({
  page,
}) => {
  await page.goto("about:blank");
  await page.context().clearCookies();
  const start = await page.goto(uavUrl("/"));
  expect(start?.status()).toBe(200);

  // Der Verwaltungsweg steht im eigenen Rahmen — OHNE vorherige Anmeldung, und
  // mit `callbackUrl`, damit man danach in der Verwaltung landet und nicht
  // wieder auf der Trainingsansicht.
  const verwaltung = page.locator("[data-rolle='uav-verwaltungslink']");
  await expect(verwaltung).toBeVisible();
  await expect(verwaltung).toHaveAttribute("href", "/api/auth/signin?callbackUrl=%2Fadmin");

  /*
   * ANONYM IST DER KATALOG LESBAR — Betreiberentscheidung 2026-08-29: „Auf
   * einem geteilten Tablet soll man den Aufgabenkatalog auch ohne jeden Code
   * durchblättern können — nur lesen, nichts erfassen." Vorher lag hier ein
   * Sperrbildschirm. Die Aufgaben stammen aus dem Seed und kommen über
   * `GET /api/tasks`, das anonyme Aufrufe seit derselben Entscheidung mit 200
   * beantwortet (`api/tasks/route.ts`).
   */
  const aufgabe = page.getByRole("link", { name: /Vorflugkontrolle/ });
  await expect(aufgabe).toBeVisible();
  // ...aber ohne alles Persönliche: keine Fortschrittskarte, kein Zähler.
  await expect(page.getByText("Gesamtfortschritt")).toHaveCount(0);
  await expect(page.getByText(/Durchführungen erfasst/)).toHaveCount(0);

  await klickeWennRuhig(aufgabe);
  await expect(page).toHaveURL(/\/aufgabe\?id=1-1/);
  // Der Inhalt ist da (Schritt aus dem Seed), die Erfassung nicht.
  await expect(page.getByText("Akkuzustand prüfen")).toBeVisible();
  await expect(page.getByLabel("Drohnensteuerer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Durchführung hinzufügen" })).toHaveCount(0);
  await expect(page.getByText(/^Durchführungen \d+ \/ \d+$/)).toHaveCount(0);

  // Und der Knopf des Hinweises führt auf ein echtes Code-Feld (`/anmelden`),
  // nicht auf den Pocket-ID-Login.
  await klickeWennRuhig(page.getByRole("link", { name: "Mit Code anmelden" }));
  await expect(page).toHaveURL(uavUrl("/anmelden"));
  await expect(page.locator("#login-code")).toBeVisible();
});

test("PWA: Manifest im HTML, sw.js im Modus 'cachen', fremder Host liefert 404 (Check 4)", async ({
  page,
  request,
}) => {
  await page.goto(uavUrl("/"));
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("href", "/manifest.webmanifest");

  const manifest = await request.get(uavUrl("/manifest.webmanifest"));
  expect(manifest.status()).toBe(200);
  const json = await manifest.json();
  expect(json.name).toBe("Drohnen-Trainingsbegleiter");

  // `UAV_SW_MODUS=cachen` steht in `webServer.env` (`e2e/helpers/uav.ts`s
  // `UAV_ENV`) — nur in diesem Modus liefert `/sw.js` `UAV_SW_CACHE_QUELLE`
  // (`_lib/sw-quelle.ts`), deren Cache-Name `uav-pwa-v1` lautet.
  const sw = await request.get(uavUrl("/sw.js"));
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(await sw.text()).toContain("uav-pwa-v1");

  const fremd = await request.get(fremdUrl("/sw.js"));
  expect(fremd.status()).toBe(404);
});

test("Verwaltung: Liste rendert Teilnehmer ohne RSC-Fehler, Klick ins Detail (Check 5, Falle 9)", async ({
  page,
}) => {
  await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
  await expect(page).toHaveURL(uavUrl("/admin"));

  // Frischer, echter Abruf der Seite (nicht nur der devLogin-Redirect) — der
  // Statuscode selbst ist der erste Beweis gegen einen RSC-Serialisierungsfehler
  // (Next liefert dafür einen 500er, keine 200-Seite mit leerem Rumpf).
  const antwort = await page.goto(uavUrl("/admin"));
  expect(antwort?.status()).toBe(200);

  // `<Table columns={[{render}]}>` aus einer Server Component heraus wirft
  // "Functions cannot be passed directly to Client Components" (CLAUDE.md
  // Falle 9) — träfe das zu, bliebe die Seite auf einem Next-Fehlerbildschirm
  // stehen und der Teilnehmername erschiene nie.
  const zeile = page.getByRole("link", { name: "Erika Mustermann (E2E)" });
  await expect(zeile).toBeVisible();

  await klickeWennRuhig(zeile);
  await expect(page).toHaveURL(uavUrl(`/admin/teilnehmer/${AKTIVER_TEILNEHMER_ID}`));
  await expect(page.getByRole("heading", { name: "Erika Mustermann (E2E)" })).toBeVisible();
});

test("Verwaltung ohne Gruppe: notFound() rendert 404 (Check 6, kosmetisch)", async ({ page }) => {
  await devLogin(page, { host: UAV_HOST, groups: "", callbackPath: "/admin" });
  await expect(page.getByRole("heading", { name: "Diese Seite gibt es hier nicht." })).toBeVisible();
  await page.screenshot({
    path: ".superpowers/sdd/2026-08-28-modul-uav/task-21-admin-404.png",
  });
});

test("Verwaltung-Gating: ohne Gruppe 404, mit Gruppe Liste, fremder Host 404 für die Admin-API (Check 9)", async ({
  page,
}) => {
  // Ohne Gruppe: `requireUavAdminPage()` → `notFound()`.
  await devLogin(page, { host: UAV_HOST, groups: "", callbackPath: "/admin" });
  await expect(page.getByRole("heading", { name: "Diese Seite gibt es hier nicht." })).toBeVisible();

  // Mit Gruppe: Liste erreichbar.
  await wechsleAnmeldung(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
  await expect(page.getByRole("link", { name: "Erika Mustermann (E2E)" })).toBeVisible();

  // Fremder Host, ABER mit derselben (gültigen) Admin-Sitzung: `hostAbweisung()`
  // prüft den Host, nicht die Gruppe — `istUavHost` liest den Anfrage-Host
  // (`resolveHost`), der hier `feedback.localtest.me` ist, nicht `uav`.
  const antwort = await page.request.get(fremdUrl("/m/uav/api/admin/participants"));
  expect(antwort.status()).toBe(404);

  // M1: derselbe Riegel auf LAYOUT-Ebene, nicht nur auf der API. Ohne
  // `requireUavHost(await headers())` als erste Anweisung in `(teilnehmer)/
  // layout.tsx` bzw. `(admin)/layout.tsx` rendert die Teilnehmer-Insel bzw. die
  // Verwaltung auf JEDEM Suite-Host, der auf den Container terminiert — die
  // relativen `/api/*`-Aufrufe der Teilnehmer-Insel träfen dort das falsche
  // Modul (`src/app/m/uav/_lib/host.ts`).
  const fremdTeilnehmer = await page.request.get(fremdUrl("/m/uav/"));
  expect(fremdTeilnehmer.status()).toBe(404);
  const fremdVerwaltung = await page.request.get(fremdUrl("/m/uav/admin"));
  expect(fremdVerwaltung.status()).toBe(404);
});

test("Erfassung offline → online → in der Verwaltung sichtbar (Check 7)", async ({ page, context }) => {
  // Falle 10 (CLAUDE.md): der Warmlauf steht in `test.beforeAll` oben (deckt
  // auch einen gefilterten `--grep`-Lauf ab, der nur diesen Fall ausführt) —
  // `/api/sync`, `/api/me`, `/api/anmeldung` sind hier also bereits übersetzt,
  // BEVOR der echte, nicht wiederholte `POST /api/sync` unten in das
  // HMR-Reload-Fenster laufen könnte (`net::ERR_ABORTED`).
  await page.goto(uavUrl(`/login?code=${E2E_CODE_AKTIV}`));
  await page.waitForURL((url) => url.pathname !== "/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Drohnen-Trainingsbegleiter" }),
  ).toBeVisible();

  // Aufgabe 1.1 über einen echten `next/link` öffnen (TaskCard) — Falle 12:
  // `klickeWennRuhig` statt `.click()`, weil `SessionProvider`/Hydration die
  // Seite zwischen mousedown/mouseup verschieben kann.
  await klickeWennRuhig(page.getByRole("link", { name: /Vorflugkontrolle/ }));
  await expect(page).toHaveURL(/\/aufgabe\?id=1-1/);

  // Ausgangslage: auf einer frischen DB zwei Durchführungen zu 1-1 aus dem Seed
  // (`_lib/seedLokal.ts`, `LOKALE_DURCHFUEHRUNGEN`) — also "2". NICHT als
  // Literal "2 / 3" fest verdrahtet: `retries: 2` gilt in der CI (CLAUDE.md-
  // Testregel zu Falle 10 daneben), ein Retry teilt sich Server UND
  // `./.data/e2e/uav.db` mit dem ersten Versuch (nur der Browser-Kontext ist
  // frisch) — ein bereits erfolgreich synchronisierter erster Versuch hätte den
  // Zähler schon auf 3 stehen, und ein hartes "2 / 3" liefe auf jedem Retry
  // unheilbar rot, obwohl die Zusage selbst (+1) weiter hält.
  const zaehler = page.getByText(/^Durchführungen \d+ \/ \d+$/);
  await expect(zaehler).toBeVisible();
  const vorherText = await zaehler.textContent();
  const vorherMatch = vorherText?.match(/^Durchführungen (\d+) \/ (\d+)$/);
  if (!vorherMatch) throw new Error(`Zähler nicht lesbar: ${String(vorherText)}`);
  const vorher = Number(vorherMatch[1]);
  const ziel = vorherMatch[2];

  await context.setOffline(true);

  await page.getByLabel("Drohnensteuerer").fill("E2E Pilot");
  await page.getByLabel("Luftraumbeobachter").fill("E2E Beobachter");
  await page.getByRole("button", { name: "Durchführung hinzufügen" }).click();

  // Bleibt lokal (localStorage-Queue) — kein Netzaufruf, solange offline.
  await expect(page.getByText(`Durchführungen ${vorher + 1} / ${ziel}`)).toBeVisible();
  await expect(page.getByText("Offline — Änderungen werden gespeichert")).toBeVisible();

  const syncAntwort = page.waitForResponse(
    (r) => r.url() === uavUrl("/api/sync") && r.request().method() === "POST",
    { timeout: 45_000 },
  );
  await context.setOffline(false);
  const antwort = await syncAntwort;
  expect(antwort.status()).toBe(200);

  /*
   * „Synchronisiert" ist seit 2026-08-29 eine BESTAETIGUNG UND KEIN DAUERZUSTAND
   * (`_ui/teilnehmer/SyncStatus.tsx`): der Chip zeigt sich nur noch nach einer
   * Stoerung — hier also genau nach dem Offline-Fenster oben — und blendet sich
   * nach sechs Sekunden aus. Die Zusage gilt deshalb unveraendert, aber sie hat
   * ein Zeitfenster; ohne die vorangehende Offline-Phase gaebe es den Chip gar
   * nicht mehr zu sehen.
   */
  await expect(page.getByText("Synchronisiert")).toBeVisible();

  // Als Admin (devLogin mit Gruppe, frischer Kontext) das Detail öffnen:
  // `anzahl` für 1-1 ist jetzt 1 mehr als der Zähler von vor der Erfassung
  // (auf einer frischen DB: 1 mehr als die 2 aus dem Seed).
  await wechsleAnmeldung(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
  await page.goto(uavUrl(`/admin/teilnehmer/${AKTIVER_TEILNEHMER_ID}`));
  // Über den eindeutigen Aufgabentitel statt der Nummer "1.1" filtern — ein
  // rohes `li:has-text("1.1")` könnte zusätzlich ein `<li>` der Seitenleiste
  // treffen und liefe im Strict Mode auf einen Fehler.
  const zeile11 = page.getByRole("listitem").filter({ hasText: "Vorflugkontrolle" });
  await expect(zeile11).toBeVisible();
  // NICHT `\b<Zahl>\b`: `TeilnehmerDetail.tsx` rendert Titel und Zähler als
  // Geschwister-`<span>`s ohne Trenner dazwischen — der Text kommt bei
  // Playwright verkettet als „…Vorflugkontrolle3/3" an, und zwischen dem
  // Wortzeichen „e" und der Ziffer „3" gibt es KEINE Wortgrenze (beides sind
  // \w-Zeichen), ein `\b` davor schlägt deshalb fehl (gemessen: „Received
  // string: …Vorflugkontrolle3/3", Match verweigert). `getByText(…, { exact:
  // true })`, auf den genauen Zähler-Span skaliert, ist robust dagegen.
  await expect(zeile11.getByText(`${vorher + 1}/${ziel}`, { exact: true })).toBeVisible();
});
