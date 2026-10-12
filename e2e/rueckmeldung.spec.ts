import { test, expect } from "@playwright/test";

import { E2E_PORTS, devLogin, klickeWennRuhig, messeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";
import { E2E_ZUNDER_TOKEN } from "./helpers/zunder";

/**
 * DIE RÜCKMELDE-EINBINDUNG IM ECHTEN BROWSER (DRK-453).
 *
 * Die normale E2E-Suite fährt mit leerem `SUITE_RUECKMELDUNG_URL` (siehe die
 * Begründung in `playwright.config.ts`); dieses Profil schaltet die Einbindung
 * ein. `playwright.rueckmeldung.config.ts`, Port 3102.
 *
 * ⚠️ WAS HIER STEHT UND WARUM ES NICHT IN VITEST STEHEN KANN — das ist der
 * Maßstab für jeden Fall in dieser Datei:
 *
 * * **HTTP 200 auf einer Arbeitsfläche.** Die Fallen 6 und 7 (`CLAUDE.md`)
 *   ergeben HTTP 500 schon beim IMPORT, und `typecheck`, `build` und Vitest
 *   bleiben dabei grün. Nur ein echter Abruf zeigt das.
 * * **Die Lage des Knopfes.** jsdom rechnet keine Layoutboxen
 *   (`getBoundingClientRect()` liefert überall Nullen). „Unten rechts, im
 *   Bild" ist dort strukturell nicht prüfbar.
 * * **Die Druckregel.** jsdom wertet keine Media Queries aus. Dass
 *   `@media print` den `position: fixed`-Kasten wirklich wegnimmt, kennt nur
 *   ein Browser — und ohne die Regel steht laut Falle 18 ein leeres Blatt im
 *   Vorgabeformat des Druckers hinter jeder gedruckten Arbeitsseite.
 *
 * Was dagegen ohne Browser geprüft wird, steht in
 * `src/core/rueckmeldung/` (Konfiguration, Speicher, Knopf im DOM, und die
 * Quelltext-Wächter in `einbindung.test.ts`) — nicht hier noch einmal.
 */

const PORT = E2E_PORTS.rueckmeldung;
/** Der Zunder-Ersatz dieses Profils (`scripts/fake-zunder.mjs`). */
const ZUNDER = `http://127.0.0.1:${E2E_PORTS.zunder}`;

const portal = (pfad = "/") => `http://portal.localtest.me:${PORT}${pfad}`;

test("Arbeitsfläche: der schwebende Knopf steht unten rechts im Bild", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });

  // ⚠️ Zuerst der Status: ein HTTP 500 aus Falle 6/7 wäre sonst nur ein
  // fehlender Knopf, und die Meldung zeigte auf die falsche Ursache.
  const antwort = await page.goto(portal());
  expect(antwort?.status(), "Arbeitsfläche antwortet").toBe(200);

  const knopf = page.getByTestId("rueckmeldung-knopf");
  await expect(knopf).toBeVisible();

  /*
   * ⚠️ DIE LAGE IST DIE ZUSAGE, NICHT DIE EXISTENZ. „Soll nicht stören" heißt
   * messbar: der Kasten liegt vollständig im Sichtfeld (sonst wäre der
   * Ausblenden-Knopf daneben nicht erreichbar — dieselbe Klasse wie Falle 13)
   * und in dessen unterer rechter Ecke.
   *
   * `messeWennRuhig` statt eines einfachen `boundingBox()`: die Hülle bricht
   * nach `load` noch einmal um, wenn die Sitzung nachgeladen ist (Falle 12).
   * Wer einmal misst und danach rechnet, hat genau einen Versuch.
   */
  const kasten = await messeWennRuhig(page.getByTestId("rueckmeldung-schweber"));
  const sicht = page.viewportSize();
  if (!sicht) throw new Error("kein Viewport");
  expect(kasten.x, "linke Kante im Bild").toBeGreaterThanOrEqual(0);
  expect(kasten.y, "obere Kante im Bild").toBeGreaterThanOrEqual(0);
  expect(kasten.x + kasten.width, "rechte Kante im Bild").toBeLessThanOrEqual(sicht.width);
  expect(kasten.y + kasten.height, "untere Kante im Bild").toBeLessThanOrEqual(sicht.height);
  // Untere rechte Ecke: der Kasten beginnt jenseits der Mitte, in beiden Achsen.
  expect(kasten.x, "rechte Hälfte").toBeGreaterThan(sicht.width / 2);
  expect(kasten.y, "untere Hälfte").toBeGreaterThan(sicht.height / 2);
});

test("weggeklickt bleibt weggeklickt — auch nach dem Neuladen", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());

  await klickeWennRuhig(page.getByTestId("rueckmeldung-ausblenden"));
  await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);

  /*
   * ⚠️ DER NEULADEN-TEIL IST DER EIGENTLICHE FALL. Dass der Knopf nach dem
   * Klick verschwindet, prüft schon `RueckmeldungKnopf.test.tsx` in jsdom. Was
   * dort NICHT prüfbar ist: dass der Server ihn danach nicht wieder ins HTML
   * schreibt und dass er beim Hydrieren nicht kurz aufblitzt. Beides hängt am
   * Server-Schnappschuss `ERLEDIGT` (`zustand.ts`) und damit an einer
   * Server-Hydration, die es in jsdom nicht gibt.
   */
  await page.reload();
  await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);

  // Und die beiden dauerhaften Wege stehen weiterhin: der Knopf schafft sich
  // ab, der Zugang zur Rückmeldung nicht.
  await expect(page.getByTestId("portal-feedback")).toBeVisible();
});

test("Nutzermenü, Kachel und Knopf öffnen dasselbe Flyin (IDA-214)", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());
  await warteAufGestreamteInhalte(page);
  const formular = page.getByTestId("rueckmeldung-formular");
  /*
   * Escape erst, wenn die Schublade steht: während der Öffnungsanimation nimmt
   * rc-drawer die Taste noch nicht an (gemessen: sofort gedrückt bleibt das
   * Flyin offen, nach dem Einschwingen schließt es). `messeWennRuhig` wartet
   * genau darauf.
   */
  const schliesseMitEscape = async () => {
    await messeWennRuhig(formular);
    await page.keyboard.press("Escape");
    await expect(formular).toHaveCount(0);
  };

  await klickeWennRuhig(page.getByTestId("nutzermenue"));
  await klickeWennRuhig(page.getByTestId("feedback-link"));
  await schliesseMitEscape();

  await klickeWennRuhig(page.getByTestId("portal-feedback"));
  await schliesseMitEscape();

  await klickeWennRuhig(page.getByTestId("rueckmeldung-knopf"));
  await expect(formular).toBeVisible();
});

test("eine Rückmeldung kommt in Zunder an — mit Name, ohne E-Mail, ohne Query", async ({ page, request }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal("/?geheim=abc"));
  await warteAufGestreamteInhalte(page);

  await klickeWennRuhig(page.getByTestId("portal-feedback"));
  await page.getByText("Idee oder Wunsch", { exact: true }).click();
  await page.getByTestId("rueckmeldung-titel").fill("Sortierung der Dienste merken");
  await page.getByTestId("rueckmeldung-text").fill("Wäre praktisch.");
  // Falle 10: die ausgelöste Anfrage prüfen, nicht nur das Bild danach.
  const antwort = page.waitForResponse((r) => r.request().method() === "POST" && r.url().startsWith(portal()));
  await page.getByTestId("rueckmeldung-senden").click();
  expect((await antwort).status()).toBe(200);

  const kennung = page.getByTestId("rueckmeldung-kennung");
  await expect(kennung).toHaveText(/^IDAE-\d+$/);

  const einwuerfe = (await (await request.get(`${ZUNDER}/__test/einwuerfe`)).json()) as {
    ref: string;
    aufgabe: { title: string; description: string; type: string; links: { url: string }[] };
  }[];
  const ref = await kennung.textContent();
  const eintrag = einwuerfe.find((e) => e.ref === ref);
  expect(eintrag, "Einwurf mit der angezeigten Kennung").toBeDefined();
  expect(eintrag?.aufgabe.type).toBe("feature");
  expect(eintrag?.aufgabe.title).toBe("Sortierung der Dienste merken");
  expect(eintrag?.aufgabe.description).toContain("**Gemeldet von:**");
  expect(eintrag?.aufgabe.description).not.toContain("@");
  expect(eintrag?.aufgabe.description).not.toContain("geheim");
  expect(eintrag?.aufgabe.links[0]?.url).toBe(portal("/"));
});

test("fällt Zunder aus, bleibt der Text stehen", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());
  await warteAufGestreamteInhalte(page);

  await klickeWennRuhig(page.getByTestId("portal-feedback"));
  await page.getByText("Etwas klappt nicht", { exact: true }).click();
  await page.getByTestId("rueckmeldung-titel").fill("Speichern hängt [zunder-weg]");
  await page.getByTestId("rueckmeldung-senden").click();

  await expect(page.getByTestId("rueckmeldung-fehler")).toBeVisible();
  await expect(page.getByTestId("rueckmeldung-titel")).toHaveValue("Speichern hängt [zunder-weg]");
});

/**
 * ⚠️ DER TOKEN GEHÖRT AUF DEN SERVER. Vitest prüft die Form des Props
 * (`konfiguration.test.ts`); ob er trotzdem irgendwo ins HTML oder in die
 * RSC-Nutzlast rutscht, sieht nur ein echter Abruf.
 */
test("der Zunder-Token steht nicht im ausgelieferten HTML", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  const antwort = await page.goto(portal());
  expect(await antwort?.text()).not.toContain(E2E_ZUNDER_TOKEN);
  await klickeWennRuhig(page.getByTestId("portal-feedback"));
  await expect(page.getByTestId("rueckmeldung-formular")).toBeVisible();
  expect(await page.content()).not.toContain(E2E_ZUNDER_TOKEN);
});

/**
 * FALLE 24: die Schublade stiehlt den Fokus zeitversetzt. Wer sofort nach dem
 * Öffnen tippt, muss im Titelfeld landen — jsdom und `toBeFocused` sehen den
 * Raub nicht, nur das Ergebnis des Tippens.
 */
test("wer sofort tippt, schreibt in den Titel", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByTestId("portal-feedback"));
  await page.keyboard.type("Sofort getippt");
  await expect(page.getByTestId("rueckmeldung-titel")).toHaveValue("Sofort getippt");
});

/** FALLE 13: auf einem schmalen Telefon ragt die Schublade nicht über den Rand. */
test("das Flyin passt auf 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByTestId("portal-feedback"));
  const kasten = await messeWennRuhig(page.getByTestId("rueckmeldung-formular"));
  expect(kasten.x).toBeGreaterThanOrEqual(0);
  expect(kasten.x + kasten.width).toBeLessThanOrEqual(320);
});

/**
 * ⚠️ OHNE DIESEN FALL STEHT HINTER JEDER GEDRUCKTEN ARBEITSSEITE EIN LEERES
 * BLATT (Falle 18). Im Druckkontext wird aus `position: fixed` ein Kasten in
 * Fenstergröße; er liegt ausserhalb jeder benannten `@page` und damit auf der
 * unbenannten ohne `size`. Gemessen ist dieses Muster am geschlossenen
 * Navigationsschub (`core/shell/shell.module.css`), und **kein anderes Tor
 * sieht es**: der Quelltext-Wächter in `einbindung.test.ts` prüft, dass die
 * Regel DASTEHT, nicht dass sie greift — dafür braucht es eine Engine, die
 * Media Queries auswertet.
 */
test("im Druck ist der Knopf weg", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", port: PORT });
  await page.goto(portal());
  await expect(page.getByTestId("rueckmeldung-schweber")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("rueckmeldung-schweber")).toBeHidden();

  // Positivkontrolle: zurück auf `screen` steht er wieder da. Ohne sie wäre der
  // Fall auch dann grün, wenn der Knopf aus einem ganz anderen Grund
  // verschwunden wäre.
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByTestId("rueckmeldung-schweber")).toBeVisible();
});

test.describe("Flächen, die frei bleiben", () => {
  test("Kiosk trägt keinen Rückmeldeknopf", async ({ page }) => {
    const antwort = await page.goto(`http://kioskdemo.localtest.me:${PORT}/`);
    expect(antwort?.status()).toBe(200);
    await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);
  });

  test("die schmale, anonyme Ansicht (QR-Codes) trägt weder Knopf noch Menüeintrag", async ({
    page,
  }) => {
    const antwort = await page.goto(`http://qr.localtest.me:${PORT}/`);
    expect(antwort?.status()).toBe(200);
    // Der Knopf hängt an `FullShell`, der Menüeintrag zusätzlich an `angemeldet`
    // — anonym auf einer schmalen Ansicht fällt beides weg.
    await expect(page.getByTestId("rueckmeldung-schweber")).toHaveCount(0);
    await expect(page.getByTestId("nutzermenue")).toHaveCount(0);
  });
});
