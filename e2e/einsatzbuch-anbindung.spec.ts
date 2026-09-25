import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig, E2E_PORT } from "./fixtures";

/**
 * Stufe 5, Task 4: die Anmeldeseite des Einsatzbuch-Rechners ohne Suite-Chrome.
 *
 * PROBE (Plan Stufe 5, Task 4, Step 1 — vor allem anderen): beweist den
 * Laufzeitweg, den kein `pnpm build` sieht — eine externe Weiterleitung auf
 * `http://127.0.0.1:<port>/rueckruf…` aus einer Server Component, und dass der Login-Umweg die
 * Query erhält. Das sind die Fälle 1 und 3 unten.
 *
 * ⚠️ `page.route`/`page.context().route()` FANGEN DEN ZWEITEN SPRUNG EINER
 * URSPRUNGSÜBERGREIFENDEN WEITERLEITUNG NICHT ZUVERLÄSSIG AB — GEMESSEN, NICHT VERMUTET (drei
 * Diagnosefälle):
 *   1. Direktes `page.goto("http://127.0.0.1:<port>/…")` MIT `page.route(...)`: die Route greift,
 *      200 kommt an.
 *   2. Dieselbe Route registriert, dann `page.goto` auf `/anmelden…` (307 auf 127.0.0.1): die
 *      Route greift NICHT, Chromium versucht eine ECHTE Verbindung → `ERR_CONNECTION_REFUSED`,
 *      weil dort nichts lauscht.
 *   3. Derselbe Ablauf wie 2, aber mit einem ECHTEN `http.createServer` auf dem Zielport statt
 *      einer Route: die Weiterleitung kommt vollständig an (307 dann 200), der Server sieht die
 *      Anfrage.
 * Der Mechanismus selbst (externe 307-Weiterleitung aus einer Server Component) funktioniert
 * also einwandfrei; nur das Mocking-Werkzeug versagt beim zweiten Sprung. Diese Spec lauscht
 * deshalb mit einem echten `http.createServer` auf `127.0.0.1:<port>` statt mit `page.route` —
 * näher an der echten App ohnehin, die dort einen echten Loopback-Listener betreibt.
 */
const HOST = "einsatzbuch.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

const zufallsPort = () => 40_000 + Math.floor(Math.random() * 20_000);
const state = () => randomBytes(16).toString("base64url"); // 22 Zeichen
const challengeRoh = () => randomBytes(32).toString("base64url"); // 43 Zeichen, ungültig als PKCE-Challenge zu S256 — genügt für die reinen Parameter-Proben
/** PKCE S256 (RFC 7636 §4.2), wie `_lib/anbindung/token.ts`s `s256`. */
function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url"); // 64 Zeichen, innerhalb 43–128
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { verifier, challenge };
}

/**
 * Steht für den Loopback-Rückruf der App: ein echter HTTP-Server auf `127.0.0.1:<port>`, der
 * JEDE Anfrage zählt und die ERSTE festhält. `wait()` löst mit deren Query auf; `treffer()` liest
 * die Anzahl ohne zu warten (für den Fall, dass gar keine Anfrage kommen soll).
 */
function loopbackServer(port: number): { wait: () => Promise<URLSearchParams>; treffer: () => number; schliessen: () => Promise<void> } {
  let zaehler = 0;
  let aufgeloest!: (q: URLSearchParams) => void;
  const versprechen = new Promise<URLSearchParams>((resolve) => { aufgeloest = resolve; });
  const server: Server = createServer((req, res) => {
    zaehler += 1;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("Du kannst dieses Fenster schließen.");
    if (zaehler === 1) aufgeloest(new URL(req.url ?? "/", `http://127.0.0.1:${port}`).searchParams);
  });
  const bereit = new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    wait: async () => { await bereit; return versprechen; },
    treffer: () => zaehler,
    schliessen: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * PKCE, Anmeldeseite, `tausch` und `einrichten` in einem — der Helfer, den Task 5 weiter nutzt.
 * `art: "echt"` überlebt einen schon vorhandenen aktiven echten Rechner: die Ersetzen-Frage
 * erscheint dann statt der sofortigen Weiterleitung, und der Helfer beantwortet sie mit
 * „Ersetzen“ (CI wiederholt einen roten Lauf gegen dieselbe Datenbank).
 * Wärmt `tausch` und `einrichten` je mit einem GET auf (Falle 10 aus `CLAUDE.md`): ein GET auf
 * einen POST-Handler antwortet 405, das genügt als Warmlauf.
 */
async function rechnerAnlegen(
  page: Page,
  request: APIRequestContext,
  o: { art: "echt" | "test"; name: string },
): Promise<{ geraeteToken: string; sitzungstoken: string; rechnerId: string }> {
  const port = zufallsPort();
  const st = state();
  const { verifier, challenge } = pkce();
  const rueckruf = loopbackServer(port);
  let code: string;
  try {
    await page.goto(url(`/anmelden?port=${port}&state=${st}&challenge=${challenge}&art=${o.art}&name=${encodeURIComponent(o.name)}`));
    const ersetzenKnopf = page.getByRole("button", { name: "Ersetzen" });
    if (await ersetzenKnopf.isVisible().catch(() => false)) await ersetzenKnopf.click();
    const empfangen = await rueckruf.wait();
    const fehler = empfangen.get("fehler");
    if (fehler) throw new Error(`rechnerAnlegen: Anmeldeseite antwortete mit fehler=${fehler}`);
    const c = empfangen.get("code");
    if (!c) throw new Error("rechnerAnlegen: kein code im Rückruf");
    code = c;
  } finally {
    await rueckruf.schliessen();
  }

  expect((await request.get(url("/api/anmelden/tausch"))).status()).toBe(405);
  const tausch = await request.post(url("/api/anmelden/tausch"), { data: { code, verifier } });
  if (!tausch.ok()) throw new Error(`rechnerAnlegen: tausch ${tausch.status()} ${await tausch.text()}`);
  const tauschKoerper = (await tausch.json()) as { sitzungstoken: string };

  expect((await request.get(url("/api/einrichten"))).status()).toBe(405);
  const einrichten = await request.post(url("/api/einrichten"), {
    headers: { authorization: `Bearer ${tauschKoerper.sitzungstoken}` },
    data: { art: o.art, name: o.name },
  });
  if (!einrichten.ok()) throw new Error(`rechnerAnlegen: einrichten ${einrichten.status()} ${await einrichten.text()}`);
  const einrichtenKoerper = (await einrichten.json()) as { rechnerId: string; geraeteToken: string };
  return { geraeteToken: einrichtenKoerper.geraeteToken, sitzungstoken: tauschKoerper.sitzungstoken, rechnerId: einrichtenKoerper.rechnerId };
}

test.describe("Anmeldeseite des Einsatzbuch-Rechners", () => {
  test("mit Sitzung und Gruppe: Weiterleitung mit code und state auf 127.0.0.1, echter 307", async ({ page }) => {
    await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
    const port = zufallsPort();
    const st = state();
    const ch = challengeRoh();

    const rueckruf = loopbackServer(port);
    try {
      await page.goto(url(`/anmelden?port=${port}&state=${st}&challenge=${ch}`));
      const empfangen = await rueckruf.wait();
      expect(empfangen.get("state")).toBe(st);
      expect(empfangen.get("code")).toBeTruthy();
      expect(page.url()).toBe(`http://127.0.0.1:${port}/rueckruf?code=${empfangen.get("code")}&state=${st}`);
    } finally {
      await rueckruf.schliessen();
    }

    // Zusatzprobe: der GET selbst antwortet mit einem ECHTEN 307 (kein Streaming-Meta-Refresh,
    // Next-Doku `redirect.md`: „insert a meta tag" nur „in a streaming context"). `page.request`
    // folgt der Weiterleitung nicht (`maxRedirects: 0`) — die Zieladresse steht im `Location`-Kopf.
    const st2 = state();
    const direkt = await page.request.get(url(`/anmelden?port=${port}&state=${st2}&challenge=${ch}`), { maxRedirects: 0 });
    expect(direkt.status()).toBe(307);
    expect(direkt.headers()["location"]).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/rueckruf\\?code=.+&state=${st2}$`));
  });

  test("ohne Gruppe: Kein Zugang zum Einsatzbuch, keine Weiterleitung", async ({ page }) => {
    await devLogin(page, { host: HOST, groups: "dashboard-admins", callbackPath: "/login" });
    const port = zufallsPort();
    const rueckruf = loopbackServer(port);
    try {
      await page.goto(url(`/anmelden?port=${port}&state=${state()}&challenge=${challengeRoh()}`));
      await expect(page.getByText("Kein Zugang zum Einsatzbuch", { exact: true })).toBeVisible();
      await expect(page.getByText("Dein Konto ist nicht in der Gruppe für das Einsatzbuch. Bitte wende dich an die Leitung.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Zurück zum Einsatzbuch-Rechner" })).toHaveAttribute(
        "href", new RegExp(`^http://127\\.0\\.0\\.1:${port}/rueckruf\\?state=.+&fehler=kein_zugang$`),
      );
      // Keine Anfrage auf 127.0.0.1: die Seite hat NICHT weitergeleitet, nur einen Link angeboten.
      expect(rueckruf.treffer()).toBe(0);
    } finally {
      await rueckruf.schliessen();
    }
  });

  test("ohne Sitzung: Login-Umweg mit erhaltener Query, danach Weiterleitung auf 127.0.0.1", async ({ page }) => {
    const port = zufallsPort();
    const st = state();
    const ch = challengeRoh();

    await page.goto(url(`/anmelden?port=${port}&state=${st}&challenge=${ch}`));
    await page.waitForURL(/\/login\?callbackUrl=/);
    // `devLogin` navigiert selbst zu `/login?callbackUrl=…` — mit ihrem EIGENEN Aufruf würde sie
    // den von UNSERER Seite gebauten callbackUrl überschreiben. Deshalb wird er hier gelesen und
    // unverändert an `devLogin` weitergereicht: das prüft, dass GENAU dieser Wert zurückführt.
    const callbackUrl = new URL(page.url()).searchParams.get("callbackUrl");
    expect(callbackUrl).toBeTruthy();
    const erwartet = `/anmelden?${new URLSearchParams({ port: String(port), state: st, challenge: ch }).toString()}`;
    expect(decodeURIComponent(callbackUrl!)).toBe(erwartet);

    const rueckruf = loopbackServer(port);
    try {
      await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: decodeURIComponent(callbackUrl!) });
      const empfangen = await rueckruf.wait();
      expect(empfangen.get("state")).toBe(st);
      expect(empfangen.get("code")).toBeTruthy();
    } finally {
      await rueckruf.schliessen();
    }
  });

  test("echt bei vorhandenem echtem Rechner fragt nach und leitet erst nach Ersetzen", async ({ page, request }) => {
    await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
    // Legt den vorhandenen echten Rechner über die API an — das echte Schlüsselpaar dafür
    // stellt `e2e/seed-einsatzbuch.ts` vor `next dev` sicher (`playwright.config.ts`).
    await rechnerAnlegen(page, request, { art: "echt", name: "Erster Leitrechner" });

    const port = zufallsPort();
    const st = state();
    const { verifier, challenge } = pkce();
    await page.goto(url(`/anmelden?port=${port}&state=${st}&challenge=${challenge}&art=echt&name=${encodeURIComponent("Zweiter Leitrechner")}`));
    await expect(page.getByText(/Es gibt bereits einen echten Rechner, eingerichtet am .+ von .+ — ersetzen\?/)).toBeVisible();
    await expect(page.getByText("Der bisherige Rechner wird widerrufen und kann danach weder Stammdaten holen noch Anker melden.")).toBeVisible();

    const rueckruf = loopbackServer(port);
    const empfangenP = rueckruf.wait();
    await page.getByRole("button", { name: "Ersetzen" }).click();
    const empfangen = await empfangenP;
    expect(empfangen.get("state")).toBe(st);
    const code = empfangen.get("code");
    expect(code).toBeTruthy();
    await rueckruf.schliessen();

    // Erst der Tausch beweist die Markierung Ende-zu-Ende: `ersetzen` steht in der Sitzung, die
    // `loeseEin` aus dem Code gelesen hat, nicht nur in der Adresse.
    const tausch = await request.post(url("/api/anmelden/tausch"), { data: { code, verifier } });
    expect(tausch.ok(), await tausch.text()).toBeTruthy();
    const koerper = (await tausch.json()) as { einrichtung: { art: string; name: string; ersetzen: boolean } | null };
    expect(koerper.einrichtung).toMatchObject({ art: "echt", name: "Zweiter Leitrechner", ersetzen: true });
  });
});

/**
 * Stufe 5, Task 5: die Verwaltungsseite „Rechner" (Widerruf, Test-Rechner löschen) und die
 * Rechnerstatus-Karten der Übersicht.
 */
test.describe("Rechnerseite der Einsatzbuch-Verwaltung", () => {
  test("listet einen Test-Rechner und löscht ihn nach Bestätigung", async ({ page, request }) => {
    await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
    const name = `Testrechner ${Date.now()}`;
    const { geraeteToken } = await rechnerAnlegen(page, request, { art: "test", name });

    // Warmlauf zuerst (Falle 10 gilt für POST-Handler; ein GET auf `stammdaten` ist selbst
    // schon der eigentliche Abruf, hier als Beleg, dass das Token VOR dem Löschen noch gilt).
    const vorher = await request.get(url("/api/stammdaten"), { headers: { authorization: `Bearer ${geraeteToken}` } });
    expect(vorher.status()).toBe(200);

    await page.goto(url("/rechner"));
    // Über die Tabellen-Rolle, nicht über den Text (Vorbild `einsatzbuch-stammdaten.spec.ts`):
    // `Kartentabelle` rendert Karten- UND Tabellendarstellung ins DOM, CSS blendet eine aus, und
    // ein reiner Textgreifer träfe deshalb beide (`display: none` zählt für `getByText` mit).
    const tabelle = page.getByRole("table", { name: "Test-Rechner" });
    const zeile = tabelle.locator("[data-row-key]", { hasText: name });
    await expect(zeile).toBeVisible();

    await klickeWennRuhig(zeile.getByRole("button", { name: "Test-Rechner löschen" }));
    await expect(page.getByText(`Test-Rechner „${name}“ löschen?`)).toBeVisible();
    await klickeWennRuhig(page.getByRole("button", { name: "Endgültig löschen" }));
    await expect(zeile).toHaveCount(0);
    await expect(tabelle.getByText("Keine Test-Rechner.")).toBeVisible();

    const nachher = await request.get(url("/api/stammdaten"), { headers: { authorization: `Bearer ${geraeteToken}` } });
    expect(nachher.status()).toBe(401);
  });
});

test.describe("Übersicht der Einsatzbuch-Verwaltung", () => {
  test("zeigt Rechnerstatus", async ({ page, request }) => {
    await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
    await rechnerAnlegen(page, request, { art: "test", name: `Statusrechner ${Date.now()}` });

    await page.goto(url("/"));
    await expect(page.getByText("Echter Rechner", { exact: true })).toBeVisible();
    await expect(page.getByText("Anker-Abweichungen", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Rechner verwalten" })).toHaveAttribute("href", "/rechner");
  });
});
