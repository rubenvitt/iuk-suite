import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { E2E_PORT, warteAufGestreamteInhalte } from "./fixtures";
import { gespeichertZurRunde, legeTestQuizAn } from "./helpers/quiz";

/**
 * LIVE-QUIZ im Browser. Dieser Teil: der `postMessage`-Vertrag der Beamer-Ansicht im iframe
 * (Spec §5.5, `docs/slidev/LiveQuiz.vue`). Ein Elternfenster sendet `{ typ: "iuk-quiz", schritt }`,
 * der Beamer geht zu diesem Schritt und meldet `{ typ: "iuk-quiz-stand", schritt, schrittAnzahl }`
 * zurück. Dazu der ganze Ablauf mit einem Beamer und drei Handys (Wettbewerb) und ein Lagebild.
 *
 * Jedes Handy ist ein eigener Browserkontext (eigenes Cookie = eigene Teilnahme). Gewartet wird nur
 * auf sichtbaren Text und auf die Antwort jeder ausgelösten Anfrage, nie auf eine feste Zeit.
 */
const FEEDBACK = `http://feedback.localtest.me:${E2E_PORT}`;

/** Falle 10: alle Wege einmal per GET übersetzen lassen, bevor der erste POST sie trifft. */
async function warmlauf(request: APIRequestContext, beamer: string) {
  await request.get(`${FEEDBACK}/k/gibt-es-nicht`); // legt auch die Datenbank an (Migration)
  await request.get(beamer);
  await request.get(`${beamer}/schritt`);
  await request.get(`${beamer}/beenden`);
  await request.get(`${FEEDBACK}/q/ZZZZZZ`);
  await request.get(`${FEEDBACK}/q/ZZZZZZ/beitritt`);
  await request.get(`${FEEDBACK}/q/ZZZZZZ/antwort`);
  await request.get(`${FEEDBACK}/q/ZZZZZZ/strom?pruefen=1`);
}

const istPost = (pfad: string) => (r: { url(): string; request(): { method(): string } }) =>
  r.url().endsWith(pfad) && r.request().method() === "POST";

/** Ein Schritt am Beamer über „Weiter“ — mit der Antwort des Servers geprüft. */
async function weiter(beamer: Page) {
  const antwort = beamer.waitForResponse(istPost("/schritt"));
  await beamer.getByRole("button", { name: "Weiter" }).click();
  expect((await antwort).status()).toBe(200);
}

/** Beamer allein im Browser öffnen, „Lobby öffnen“ und den Beitrittscode ablesen. */
async function oeffneLobby(beamer: Page, url: string, titel: string): Promise<string> {
  await beamer.goto(url);
  await warteAufGestreamteInhalte(beamer);
  await expect(beamer.getByRole("heading", { name: titel })).toBeVisible();
  const lobby = beamer.waitForResponse(istPost("/schritt"));
  await beamer.getByRole("button", { name: "Lobby öffnen" }).click();
  expect((await lobby).status()).toBe(200);
  await expect(beamer.getByRole("heading", { name: "Mach mit" })).toBeVisible();
  const codeBild = beamer.getByRole("img", { name: /^Code / });
  await expect(codeBild).toHaveAttribute("aria-label", /^Code( [A-Z2-9]){6}$/);
  return (await codeBild.getAttribute("aria-label"))!.replace(/^Code /, "").replaceAll(" ", "");
}

/** Ein Handy in eigenem Kontext: Seite des Codes öffnen, beitreten (mit Spitzname im Wettbewerb). */
async function handyTrittBei(browser: Browser, code: string, spitzname?: string): Promise<Page> {
  const kontext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const handy = await kontext.newPage();
  await handy.goto(`${FEEDBACK}/q/${code}`);
  await warteAufGestreamteInhalte(handy);
  const feld = handy.getByLabel("Dein Spitzname");
  if (spitzname) await feld.fill(spitzname);
  else {
    await expect(feld).toHaveCount(0);
    await expect(handy.getByText("Anonym — kein Name, keine Uhrzeit.")).toBeVisible();
  }
  const beitritt = handy.waitForResponse(istPost("/beitritt"));
  await handy.getByRole("button", { name: "Mitmachen" }).click();
  expect((await beitritt).status()).toBe(200);
  await expect(handy.getByRole("heading", { name: "Du bist dabei." })).toBeVisible();
  return handy;
}

async function handyAntwortet(handy: Page, frage: string, option: string) {
  await expect(handy.getByRole("heading", { name: frage })).toBeVisible();
  const antwort = handy.waitForResponse(istPost("/antwort"));
  await handy.getByRole("button", { name: option, exact: true }).click();
  expect((await antwort).status()).toBe(200);
  await expect(handy.getByRole("heading", { name: "Antwort ist da." })).toBeVisible();
}

/** Die Lobby-Zahl „<n> dabei“: zwei Spans ohne Abstand, also ein Block mit genau diesem Text. */
const dabei = (beamer: Page, n: number) => beamer.locator("div").filter({ hasText: new RegExp(`^${n}dabei$`) });

test("Wettbewerb: Beamer und drei Handys spielen eine Frage bis zur Rangliste, ohne Neuladen", async ({ page, browser, request }) => {
  const titel = `e2e Wettbewerb ${Date.now()}`;
  await request.get(`${FEEDBACK}/k/gibt-es-nicht`);
  const secret = legeTestQuizAn({ titel, modus: "wettbewerb", anzahlFragen: 2 });
  const beamerUrl = `${FEEDBACK}/beamer/${secret}`;
  await warmlauf(request, beamerUrl);

  const code = await oeffneLobby(page, beamerUrl, titel);
  await expect(dabei(page, 0)).toHaveCount(1);

  const namen = ["Anna", "Ben", "Cem"];
  const handys: Page[] = [];
  for (const name of namen) handys.push(await handyTrittBei(browser, code, name));
  // Die Zahl kommt über den Strom, der Beamer lädt nicht neu.
  await expect(dabei(page, 3)).toHaveCount(1);

  // Schritt 1: Frage 1 auf dem Beamer und auf allen Handys.
  await weiter(page);
  await expect(page.getByRole("heading", { name: "Welche Zahl ist 1?" })).toBeVisible();
  await expect(page.getByText(/^0 Antworten von 3$/)).toBeVisible();

  // Zwei Handys antworten (eins richtig, eins falsch), das dritte nicht.
  await handyAntwortet(handys[0], "Welche Zahl ist 1?", "Eins");
  await handyAntwortet(handys[1], "Welche Zahl ist 1?", "Zwei");
  await expect(handys[2].getByRole("heading", { name: "Welche Zahl ist 1?" })).toBeVisible();
  await expect(page.getByText(/^2 Antworten von 3$/)).toBeVisible();

  // Schritt 2: Auflösung mit Verteilung — je eine Stimme für Eins und Zwei, keine für Drei.
  await weiter(page);
  await expect(page.getByText("richtig, 1 von 2")).toBeVisible();
  const balken = page.locator("[data-balken] [data-option]");
  await expect(balken).toHaveCount(3);
  await expect(balken.nth(0)).toHaveAttribute("data-richtig", "");
  for (const [i, n] of [[0, "1"], [1, "1"], [2, "0"]] as const) {
    await expect(balken.nth(i).locator("span").filter({ hasText: new RegExp(`^${n}$`) })).toHaveCount(1);
  }
  await expect(handys[0].getByRole("heading", { name: "Richtig." })).toBeVisible();
  await expect(handys[1].getByRole("heading", { name: "Daneben." })).toBeVisible();
  await expect(handys[2].getByRole("heading", { name: "Keine Antwort." })).toBeVisible();

  // Schritt 3: Zwischenstand mit allen drei Namen, Anna (richtig) vorn.
  await weiter(page);
  await expect(page.getByRole("heading", { name: "Zwischenstand" })).toBeVisible();
  const plaetze = page.getByRole("listitem");
  await expect(plaetze).toHaveCount(3);
  await expect(plaetze.nth(0)).toContainText("Anna");
  for (const name of namen) await expect(page.getByRole("list").getByText(name, { exact: true })).toBeVisible();

  for (const handy of handys) await handy.context().close();
});

test("Lagebild: kein Spitzname, keine Rangliste, kein Name in der Datenbank", async ({ page, browser, request }) => {
  const titel = `e2e Lagebild ${Date.now()}`;
  await request.get(`${FEEDBACK}/k/gibt-es-nicht`);
  const secret = legeTestQuizAn({ titel, modus: "lagebild", anzahlFragen: 1 });
  const beamerUrl = `${FEEDBACK}/beamer/${secret}`;
  await warmlauf(request, beamerUrl);

  const code = await oeffneLobby(page, beamerUrl, titel);
  const handy = await handyTrittBei(browser, code);
  await expect(handy.getByText("Anonym — kein Name, keine Uhrzeit.")).toHaveCount(0); // nur vor dem Beitritt
  await expect(dabei(page, 1)).toHaveCount(1);

  await weiter(page);
  await handyAntwortet(handy, "Welche Zahl ist 1?", "Eins");
  await expect(page.getByText(/^1 Antworten von 1$/)).toBeVisible();

  await weiter(page);
  await expect(page.getByText("richtig, 1 von 1")).toBeVisible();

  // Nach der einzigen Frage folgt im Lagebild direkt der Schluss, ohne Zwischenstand.
  await weiter(page);
  await expect(page.getByRole("heading", { name: "So steht die Gruppe" })).toBeVisible();
  await expect(page.getByText("Lagebild, anonym")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zwischenstand" })).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(0);

  const gespeichert = gespeichertZurRunde(code);
  expect(gespeichert.spitznamen).toEqual([null]);
  expect(gespeichert.antwortzeiten).toEqual([null]);

  await handy.context().close();
});

test("der Beamer im iframe folgt postMessage vom Elternfenster und meldet seinen Stand", async ({ page, request }) => {
  // Falle 10: Routen vorab kompilieren, bevor der erste POST aus dem iframe kommt. Das erste GET legt
  // auch die Datenbank an (Migration beim ersten Zugriff), die `legeTestQuizAn` danach öffnet.
  await request.get(`${FEEDBACK}/k/gibt-es-nicht`);
  const secret = legeTestQuizAn();
  const beamer = `${FEEDBACK}/beamer/${secret}`;
  await request.get(beamer);
  await request.get(`${beamer}/schritt`);

  // Das Elternfenster: eine fremde Seite (about:blank) mit dem iframe, wie die Slidev-Folie. Der
  // Empfänger steht VOR dem iframe im Dokument: der Beamer meldet seinen ersten Stand gleich nach dem
  // Laden, und ein Empfänger, der erst nach `setContent` dazukommt, verpasst ihn bei warmem Server.
  await page.setContent(
    `<script>window.staende = []; addEventListener("message", (e) => { if (e.data && e.data.typ === "iuk-quiz-stand") window.staende.push(e.data); });</script>` +
      `<iframe id="quiz" src="${beamer}" tabindex="-1" style="width:1280px;height:720px;border:0"></iframe>`,
  );
  const rahmen = page.frameLocator("#quiz");
  const sende = (schritt: number) =>
    page.evaluate((n) => {
      (document.getElementById("quiz") as HTMLIFrameElement).contentWindow!.postMessage({ typ: "iuk-quiz", schritt: n }, "*");
    }, schritt);
  const letzterStand = () =>
    page.evaluate(() => {
      const l = (window as unknown as { staende: { schritt: number; schrittAnzahl: number }[] }).staende;
      return l[l.length - 1] ?? null;
    });

  // Vor dem Start: Titel statt Lobby, Stand mit Schritt 0 und der Schrittzahl des Quiz.
  await expect(rahmen.getByRole("heading", { name: "e2e Slidev-Quiz" })).toBeVisible();
  await expect.poll(letzterStand).toMatchObject({ schritt: 0 });
  const anzahl = (await letzterStand())!.schrittAnzahl;
  expect(anzahl).toBeGreaterThanOrEqual(5);

  // Schritt 0: die Lobby (legt die Runde an).
  const lobby = page.waitForResponse((r) => r.url().endsWith("/schritt") && r.request().method() === "POST");
  await sende(0);
  expect((await lobby).status()).toBe(200);
  await expect(rahmen.getByRole("heading", { name: "Mach mit" })).toBeVisible();

  // Schritt 1: Frage 1.
  const frage = page.waitForResponse((r) => r.url().endsWith("/schritt") && r.request().method() === "POST");
  await sende(1);
  expect((await frage).status()).toBe(200);
  await expect(rahmen.getByRole("heading", { name: "Welche Zahl ist 1?" })).toBeVisible();
  // Falle 22: gestreamter Inhalt steht kurz doppelt im DOM — im Dokument des iframe, nicht im Elternfenster.
  await warteAufGestreamteInhalte(rahmen);
  await expect(rahmen.getByText("Frage 1 von 2")).toBeVisible();
  await expect.poll(letzterStand).toMatchObject({ schritt: 1, schrittAnzahl: anzahl });

  // Dieselbe Nachricht noch einmal ändert nichts (idempotent), eine fremde Nachricht auch nicht.
  await sende(1);
  await page.evaluate(() => {
    (document.getElementById("quiz") as HTMLIFrameElement).contentWindow!.postMessage({ typ: "anderes", schritt: 0 }, "*");
  });
  await expect(rahmen.getByRole("heading", { name: "Welche Zahl ist 1?" })).toBeVisible();

  // Schritt 2: Auflösung, mit dem Beamer allein im iframe (keine Bedienknöpfe).
  await sende(2);
  await warteAufGestreamteInhalte(rahmen);
  await expect(rahmen.getByText("Auflösung")).toBeVisible();
  await expect(rahmen.getByRole("button", { name: "Weiter" })).toHaveCount(0);
  await expect.poll(letzterStand).toMatchObject({ schritt: 2 });
});
