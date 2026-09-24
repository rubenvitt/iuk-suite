import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  E2E_FAHRZEUG_ANDERES_NAME,
  E2E_FAHRZEUG_ID,
  E2E_FAHRZEUG_NAME,
  E2E_TOKEN_FAHRZEUG,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-305 — DER ANGEMELDETE EINSTIEG IN DEN FAHRZEUG-CHECK.
 *
 * ⚠️ WARUM DIESE DATEI DER EINZIGE ECHTE NACHWEIS IST. Drei Aussagen kann kein
 * anderes Tor dieses Repos halten:
 *
 *  1. DASS DIE SEITE FÜR EIN KONTO ÜBERHAUPT ANTWORTET. `helfer/check/page.tsx`
 *     ist eine Server Component und liest seit DRK-305 `sitzungsEtikett` als
 *     WERT aus `_lib/zugangHerkunft.ts`. Trüge diese Datei je ein
 *     `"use client"`, käme dort eine Client-Referenz statt des Wertes an —
 *     HTTP 500 für die ganze Seite, und `typecheck`, `build` und Vitest bleiben
 *     alle drei grün (Falle 6; in Vitest ist die Direktive ein wirkungsloser
 *     String). Dasselbe gilt für `CheckDurchfuehrenKnopf` in der Verwaltung:
 *     antd-Compound oder ein `@ant-design/icons`-Import ergäbe 500, bei Falle 7
 *     schon beim Import.
 *  2. DASS DER KNOPF WIRKLICH NAVIGIERT. `<Button href>` gegen
 *     `<Link><Button/></Link>` — ein `<button>` in einem `<a>` sieht am
 *     Bildschirm identisch aus, wird von `getByRole("link")` gefunden und
 *     navigiert NIE. Der DOM-Test daneben prüft die Struktur; dass ein Klick
 *     ankommt, sagt nur ein echter Browser.
 *  3. DASS DIE KETTE AM STÜCK TRÄGT. Das ist der Grund, aus dem hier ein
 *     ganzer Entnahme-Durchlauf steht und nicht nur eine Seitenprüfung: die
 *     Codex-Review zu diesem PR fand, dass `/helfer` zwar antwortete, jede
 *     Artikelzeile aber auf `/a/<id>` verlinkt — und DIESE Seite eine
 *     angemeldete Person in die Verwaltung umleitete. Beide Seiten antworteten
 *     je für sich mit 200; kaputt war erst der zweite Klick. Ein Test, der nur
 *     Seiten abruft, findet so etwas strukturell nie.
 *  4. DASS DIE BEIDEN WEGE GETRENNT BLEIBEN (Akzeptanzkriterium 4). Der
 *     Kärtchen-Weg und der Konto-Weg laufen durch DIESELBE Seite; ob die
 *     Reihenfolge der beiden Riegel hält, zeigt erst ein Lauf, in dem beides
 *     gleichzeitig vorliegt — ein Kärtchen im Cookie UND eine Anmeldung.
 *
 * Host, Gruppe, Codes und Fahrzeugnamen kommen ausschließlich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — kein Literal.
 *
 * ⚠️ WAS DIESE DATEI AN DATEN HINTERLÄSST — vollständig, weil ein Worker und
 * eine SQLite-Datei jede Spec danach erben:
 *   - `buchungen`: zwei Zeilen je Lauf des Entnahme-Durchlaufs (Umlagerung hat
 *     zwei Legs), auf `e2e-konto-artikel` — einem Artikel, der AUSSCHLIESSLICH
 *     dieser Datei gehört (`e2e/seed-lagerbuch.ts`, `angemeldetFixtures`). Er
 *     liegt mit 50 Stück im Handlager und wird nicht wieder aufgefüllt; der
 *     Lauf entnimmt 1. Auf `e2e-artikel` zu buchen wäre falsch gewesen: der
 *     Artikel gehört `lagerbuch-helfer.spec.ts`, und dessen Zusicherungen
 *     hängen an seinem Bestand.
 *   - `helfer_ziel`-Cookie: die Zielwahl gilt pro Browserkontext, nicht pro
 *     Datenbank — sie überlebt den Lauf nicht.
 *   - `tokens.last_used_at` von `E2E_TOKEN_FAHRZEUG` wandert beim Einlösen;
 *     keine Spec prüft ihn gegen NULL (alle vergleichen differenziell).
 *
 * KEIN Check wird abgeschlossen — es entsteht also keine `checks`-Zeile. Was der
 * Abschluss in die append-only-Tabellen schreibt, hält `_actions/check.test.ts`
 * ohne Browser fest.
 */

/**
 * DER ARTIKEL, DER NUR DIESER DATEI GEHÖRT (`angemeldetFixtures` im Seed).
 *
 * ⚠️ NICHT `e2e-artikel`: der gehört `lagerbuch-helfer.spec.ts`, und dessen
 * Zusicherungen hängen an seinem Handlager-Bestand. Eine Buchung von hier aus
 * senkte ihn bei jedem Lauf und bei jedem Retry — und machte jene Spec still
 * reihenfolge- und wiederholungsabhängig.
 */
const KONTO_ARTIKEL = "e2e-konto-artikel";

/**
 * DER KNOPF IM SEITENKOPF, NICHT DER EINTRAG IN DER SEITENLEISTE.
 *
 * ⚠️ BEIDE HEISSEN „Check durchführen“, und das ist Absicht — dieselbe Sache
 * soll gleich heißen, egal von wo man kommt. Ein ungefilterter
 * `getByRole("link", { name: "Check durchführen" })` findet dadurch ZWEI
 * Treffer und scheitert an Playwrights Strict Mode. Gemessen im CI-Lauf zu
 * PR #164: „strict mode violation“ auf beiden Knöpfen, während lokal gar kein
 * angemeldeter Lauf zustande kam.
 *
 * `seitenkopf-aktionen` ist der Behälter, den `core/shell/Seitenkopf.tsx` um
 * die Aktionsleiste legt — ein benannter Vertrag, kein abgelesener Selektor.
 */
const kopfKnopf = (page: Page, name: string) =>
  page.getByTestId("seitenkopf-aktionen").getByRole("link", { name });

/** Ein Fahrzeugname als Suchmuster — dieselbe Hilfe wie im Kärtchen-Lauf. */
const alsText = (name: string) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

/**
 * Die Zielwahl — Bauform 1:1 aus `lagerbuch-helfer.spec.ts`.
 *
 * ⚠️ DIE ANTWORT WIRD GEPRÜFT, nicht nur die spätere Zustandsänderung (zweite
 * Testregel aus Falle 10): sonst läuft eine abgelehnte Antwort still ins
 * Zeitbudget und meldet sich als etwas ganz anderes.
 */
async function waehleZiel(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("radio", { name }).check();
  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/helfer/ziel")),
    page.getByRole("button", { name: "Ziel übernehmen" }).click(),
  ]);
  expect(
    antwort.status(),
    `die Zielwahl muss serverseitig ankommen — Antwort war ${antwort.status()}`,
  ).toBeLessThan(400);
}

test.describe("DRK-305 — angemeldet prüfen, ohne Code", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("ohne Kärtchen führt /helfer/check auf die VOLLE Fahrzeugwahl", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/helfer/check"));
    // Die eine Zeile, die Falle 6 und Falle 7 überhaupt sichtbar macht.
    expect(antwort!.status(), "HTTP 500 = Client-Wert oder Zeichen in der Server Component")
      .toBe(200);

    /*
     * ⚠️ „EINHEIT WAEHLEN“, NICHT MEHR „FAHRZEUG WAEHLEN“ (DRK-309). Die Liste
     * dahinter fuehrt Fahrzeuge UND Taschen; eine Ueberschrift, die nur eine
     * der beiden Arten nennt, waere hier nicht Geschmack, sondern falsch —
     * wer eine Tasche pruefen will, schloesse daraus, er sei am falschen Ort.
     */
    await expect(page.getByText("Einheit wählen")).toBeVisible();
    // Beide Fahrzeuge des Seeds: „nicht auf ein einzelnes beschränkt“ ist die
    // User Story, und zwei Einträge sind ihr kleinstmöglicher Beleg.
    await expect(page.getByRole("link", { name: alsText(E2E_FAHRZEUG_NAME) })).toBeVisible();
    await expect(
      page.getByRole("link", { name: alsText(E2E_FAHRZEUG_ANDERES_NAME) }),
    ).toBeVisible();
  });

  test("der Kopf nennt die angemeldete Person — und keinen Token-Code", async ({ page }) => {
    await page.goto(lagerbuchUrl("/helfer/check"));
    await expect(page.getByText(/^Angemeldet: /)).toBeVisible();
    // Gegenprobe: das Kärtchen-Etikett beginnt mit „Zugang: Token“. Ohne sie
    // wäre die Zeile darüber auch dann grün, wenn beide Sätze gleichzeitig
    // dastünden.
    await expect(page.getByText(/^Zugang: Token/)).toHaveCount(0);
  });

  test("statt „Beenden“ steht der Weg zurück in die Verwaltung", async ({ page }) => {
    /*
     * `beenden` löscht das Kärtchen-Cookie, und hier gibt es keins. Der Knopf
     * liefe ins Leere und setzte die angemeldete Person wortlos aufs Gate — wo
     * sie einen Code eingeben soll, den sie nicht hat. Ohne diesen Weg wäre der
     * Einstieg überdies eine Sackgasse: der Helfer-Rahmen trägt keine
     * Suite-Navigation.
     */
    await page.goto(lagerbuchUrl("/helfer/check"));
    const zurueck = page.getByRole("link", { name: "Zur Verwaltung" });
    await expect(zurueck).toBeVisible();
    await klickeWennRuhig(zurueck);
    await page.waitForURL((u) => u.pathname.endsWith("/verwaltung"));
  });

  test("„Check durchführen“ auf der Fahrzeugliste navigiert wirklich", async ({ page }) => {
    /*
     * ⚠️ DIE ZUSAGE IST DIE NAVIGATION, NICHT DER KNOPF. `<Link><Button/></Link>`
     * wäre am Bildschirm nicht zu unterscheiden, und die Adresse bliebe nach dem
     * Klick stehen — genau der Fehler, den `ChecklisteKnopf` schon einmal hatte
     * und den vier Tore durchgelassen haben.
     */
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    expect(antwort!.status()).toBe(200);

    await klickeWennRuhig(kopfKnopf(page, "Check durchführen"));
    await page.waitForURL((u) => u.pathname.endsWith("/helfer/check"));
    await expect(page.getByText("Einheit wählen")).toBeVisible();
  });

  test("„Check durchführen“ am Fahrzeugblatt wählt DIESES Fahrzeug vor", async ({ page }) => {
    await page.goto(lagerbuchUrl(`/verwaltung/fahrzeuge/${E2E_FAHRZEUG_ID}`));
    await klickeWennRuhig(kopfKnopf(page, "Check durchführen"));
    await page.waitForURL(
      (u) => u.pathname.endsWith("/helfer/check") && u.searchParams.get("fz") === E2E_FAHRZEUG_ID,
    );
    // Vorausgewählt — aber NICHT gebunden: der Weg zu einem anderen Fahrzeug
    // bleibt offen. Das ist der Unterschied zum gescannten Kärtchen (DRK-302).
    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();
  });

  test("die Entnahme ohne Code trägt bis zur Buchung — Schrank → Fahrzeug", async ({ page }) => {
    /*
     * ⚠️ DER LAUF, DEN DIE CODEX-REVIEW ERZWUNGEN HAT. Der Einstieg „Bestand →
     * Entnahme“ verspricht eine Entnahme ohne Code; geprüft wird deshalb die
     * ganze Kette und nicht der erste Schirm: Liste → Artikel → Zielwahl →
     * Buchung. Die Umleitung, die es vorher an `/a/<id>` gab, wäre genau hier
     * aufgefallen — und nur hier.
     */
    await page.goto(lagerbuchUrl("/helfer"));
    await klickeWennRuhig(page.getByRole("link", { name: /E2E Konto Kompresse/ }));
    await page.waitForURL(new RegExp(`/a/${KONTO_ARTIKEL}`));

    // Kein Kärtchen im Spiel: der Kopf nennt die Person.
    await expect(page.getByText(/^Angemeldet: /)).toBeVisible();

    // DRK-300: ohne ausdrückliche Wahl wird nicht gebucht — auch angemeldet nicht.
    await expect(page.getByRole("button", { name: "Entnahme buchen" })).toBeDisabled();
    await klickeWennRuhig(page.locator("[data-rolle='entnahme-ziel'] a"));
    await page.waitForURL(/\/helfer\/ziel/);
    await waehleZiel(page, alsText(E2E_FAHRZEUG_NAME));
    await page.waitForURL(new RegExp(`/a/${KONTO_ARTIKEL}`));

    /*
     * ⚠️ DIE ANTWORT WIRD GEPRÜFT, nicht nur der Satz danach — zweite Testregel
     * aus Falle 10 (`CLAUDE.md`). Ohne sie läuft eine abgelehnte
     * oder abgebrochene Server-Action still ins Zeitbudget und meldet sich als
     * „gebucht“ wurde nicht sichtbar — also als etwas ganz anderes als der
     * tatsächliche HTTP-Fehler.
     */
    const [antwort] = await Promise.all([
      page.waitForResponse((r) =>
        r.request().method() === "POST" && r.url().includes(`/a/${KONTO_ARTIKEL}`)),
      page.getByRole("button", { name: "Entnahme buchen" }).click(),
    ]);
    expect(
      antwort.status(),
      `die Buchung muss serverseitig ankommen — Antwort war ${antwort.status()}`,
    ).toBeLessThan(400);
    await expect(page.getByText(/gebucht/i)).toBeVisible();
  });

  test("das Artikelblatt bleibt erreichbar — als Link statt als Umleitung", async ({ page }) => {
    // Was die frühere Umleitung geleistet hat, leistet jetzt ein Link auf der
    // Seite. Verloren geht dadurch nichts; es kostet einen Klick statt keinen.
    await page.goto(lagerbuchUrl(`/a/${KONTO_ARTIKEL}`));
    await klickeWennRuhig(page.getByRole("link", { name: "In der Verwaltung öffnen" }));
    await page.waitForURL((u) => u.searchParams.get("a") === KONTO_ARTIKEL);
  });

  test("ein gescanntes Kärtchen gewinnt gegen die Anmeldung (DRK-302 bleibt)", async ({ page }) => {
    /*
     * AKZEPTANZKRITERIUM 4, schärfste Form: beide Herkünfte liegen gleichzeitig
     * vor. Käme das Konto zuerst, verschwände die Bindung aus DRK-302 für jede
     * angemeldete Person — still, und nur für die, die beides haben.
     */
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await page.goto(lagerbuchUrl("/helfer/check"));

    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();
    // ⚠️ DIE NEGATIVE ZUSICHERUNG MUSS DEN HEUTIGEN TEXT NENNEN: „Fahrzeug
    // wählen“ gibt es seit DRK-309 nirgends mehr, sie waere also trivial gruen
    // und hoerte auf, die Bindung aus DRK-302 zu behaupten.
    await expect(page.getByText("Einheit wählen")).toHaveCount(0);
    // Und der Kopf zeigt wieder das Kärtchen, nicht das Konto.
    await expect(page.getByText(/^Zugang: Token/)).toBeVisible();
  });
});
