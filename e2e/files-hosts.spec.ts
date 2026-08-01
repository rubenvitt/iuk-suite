import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * DIE ZWEI-HOST-KLASSE DES MODULS `files` — die Aussage, die NUR ein echter
 * Browser gegen zwei echte Hosts hat (Spec §3.4, §3.5).
 *
 * `files` bedient zwei Prod-Hosts aus EINER Variable `SUITE_HOST_FILES`, und die
 * Reihenfolge traegt die Rolle (Index 0 = Verwaltung, Index 1 = Inbox). Beide
 * Hosts rewriten auf denselben Pfad `/m/files` (`routing.ts:78` setzt fuer `/`
 * `rest = ""`), es gibt also KEINEN Pfadunterschied, an dem Next entscheiden
 * koennte — der Rollen-Verteiler `page.tsx` liest den Host und entscheidet
 * selbst.
 *
 * WARUM DIESE DATEI UEBERHAUPT: in Dev und Test leitet `moduleUrl` sonst einen
 * EINZIGEN Host `<key>.localtest.me` ab (`moduleUrl.ts:24-26`), und kein Test der
 * Suite setzt `SUITE_HOST_*` je auf zwei Hosts — die ganze Klasse war lokal
 * unpruefbar (Analyse-Falle 17). `playwright.config.ts` setzt deshalb
 * `SUITE_HOST_FILES=files.localtest.me,drop.localtest.me`; Wildcard-DNS loest
 * jeden `*.localtest.me` auf 127.0.0.1 auf, und `prodHostsFor` liest
 * `envHostsFor` unabhaengig von `NODE_ENV` (`hosts.ts:39-46`). Damit laeuft hier
 * DERSELBE Code-Pfad wie in Produktion.
 *
 * DIESE DATEI ERBT KEINEN ZUSTAND VOM SEED und stellt auch keinen her: alle
 * sechs Zusagen sind Aussagen ueber Rolle und Riegel, nicht ueber Daten. Das ist
 * Absicht — `e2e/files-fileshare.spec.ts` laeuft in Pfadreihenfolge VOR dieser
 * Datei (`workers: 1`, eine geteilte Datenbank je Lauf) und legt Freigaben an.
 * Eine Zusicherung auf den Leerzustand der Uebersicht waere hier deshalb allein
 * gruen und in der Suite rot (`docs/design/README.md:214-220`); den Leerzustand
 * besitzt der DOM-Test in `_ui/SharesUebersicht.test.tsx` (T36).
 */

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";
const V = `http://${VERWALTUNG}:3100`;
const I = `http://${INBOX}:3100`;

/** Die Modulgruppe aus dem Registry-Eintrag (`adminGroups: ["drk-files-admin"]`). */
const GRUPPE = "drk-files-admin";

test("1 — Verwaltungs-Host: `/` zeigt die Freigaben-Uebersicht und die dreigliedrige Modulnavigation", async ({
  page,
}) => {
  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

  // Die Uebersicht selbst, nicht irgendein „Freigaben" auf der Seite: der
  // Navigationseintrag traegt dasselbe Wort, ein `getByText("Freigaben")` waere
  // also auch bei voelliger Abwesenheit der Uebersicht gruen.
  const uebersicht = page.getByTestId("files-uebersicht");
  await expect(uebersicht.getByRole("heading", { name: "Freigaben" })).toBeVisible();

  /*
   * DREI Eintraege, und die Zahl ist die Zusage — nicht die Anwesenheit des
   * Behaelters: `Modulnav` rendert bei leerer Liste gar nichts
   * (`SuiteNav.tsx:175`), aber eine Liste mit einem Eintrag ergaebe denselben
   * `data-testid` und dieselbe gruene Behaelter-Pruefung.
   *
   * Auf `modulnav` eingegrenzt, weil der Drawer dieselben Links ein zweites Mal
   * traegt (`SuiteNav.tsx:405-413`) — ein ungegrenztes `getByRole("link")` waere
   * eine Strict-Mode-Verletzung, kein Befund.
   */
  const modulnav = page.getByTestId("modulnav");
  await expect(modulnav.getByRole("link")).toHaveCount(3);
  await expect(modulnav.getByRole("link", { name: "Freigaben" })).toBeVisible();
  await expect(modulnav.getByRole("link", { name: "Posteingang" })).toBeVisible();
  await expect(modulnav.getByRole("link", { name: "Abgabelinks" })).toBeVisible();
});

test("2 — Inbox-Host: `/` zeigt die Abgabe-Hinweisseite, ohne Shell und ohne App-Switcher", async ({
  page,
}) => {
  // ANONYM, ohne jeden Login: die Inbox-Domain wird auf einem fremden Handy
  // geoeffnet. Zwei VERSCHIEDENE Ansichten unter demselben Pfad `/` — das ist
  // die Messung, die Analyse E2 fuer den `headers()`-Aufruf im Verteiler
  // verlangt.
  const res = await page.goto(`${I}/`);
  expect(res?.status()).toBe(200);

  await expect(page.getByTestId("files-inbox-start")).toBeVisible();
  await expect(page.getByText(/nur über den Link/i)).toBeVisible();

  // KEINE Shell und KEIN App-Switcher, und beides einzeln: `suite-header` ist
  // die Shell (`SuiteHeader.tsx:65`), `modulzeile` der App-Switcher
  // (`SuiteNav.tsx:303`). Ein Switcher zeigte hier auf vier Module, die die
  // aufrufende Person nicht betreten darf — jeder Eintrag eine Sackgasse.
  await expect(page.getByTestId("suite-header")).toHaveCount(0);
  await expect(page.getByTestId("modulzeile")).toHaveCount(0);
  await expect(page.getByTestId("modulnav")).toHaveCount(0);
});

test("3 — Inbox-Host: ein Verwaltungspfad antwortet 404", async ({ page }) => {
  // ABNAHME, nicht Zusage dieser Welle: `/shares/neu` entsteht erst in Welle 6a
  // (T35), der 404 kommt hier noch aus der Abwesenheit der Route. Tragend wird
  // dieser Punkt mit T35 — die Mutation, die er dann faengt, ist „die
  // Rollenzusicherung aus `(verwaltung)/layout.tsx` entfernen".
  const res = await page.goto(`${I}/shares/neu`);
  expect(res?.status()).toBe(404);
});

test("4 — Verwaltungs-Host: ein Inbox-Pfad antwortet 404", async ({ page }) => {
  // Ebenfalls Abnahme: `/u/<token>` entsteht in Welle 6a (T38). Der Token ist
  // syntaktisch gueltig (`dz-xxxx-xxxx-xxxx`), damit der 404 spaeter aus der
  // ROLLE kommt und nicht aus der Token-Grammatik.
  const res = await page.goto(`${V}/u/dz-2345-6789-abcd`);
  expect(res?.status()).toBe(404);
});

test("5 — Verwaltungs-Host ohne die Modulgruppe: 404, nicht 403", async ({ page }) => {
  // `groups: ""` — angemeldet, aber in keiner Gruppe. Der Riegel steht im
  // VERTEILER, nicht nur im Group-Layout: `page.tsx` liegt auszerhalb aller
  // Route-Groups, `(verwaltung)/layout.tsx` greift fuer die Wurzelseite also
  // nicht. Ohne `requireFilesAccess()` dort stuende die Uebersicht ungegatet auf
  // der Modulwurzel — genau diese Mutation faengt dieser Punkt.
  await devLogin(page, { host: VERWALTUNG, groups: "" });
  const res = await page.goto(`${V}/`);
  // 404 und NICHT 403: die Existenz der Seite wird nicht verraten.
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("files-uebersicht")).toHaveCount(0);
});

test("6 — `/u` gibt es nur auf dem Inbox-Host", async ({ page }) => {
  // Die Inbox-Wurzel existiert unter ZWEI Adressen (`/` und `/u`) und auf genau
  // EINEM Host. Beide Haelften stehen in einem Test, weil die Aussage der
  // Unterschied ist: ein `/u`, das auf beiden Hosts 200 antwortet, ist genauso
  // falsch wie eines, das nirgends antwortet.
  const aufVerwaltung = await page.goto(`${V}/u`);
  expect(aufVerwaltung?.status()).toBe(404);

  const aufInbox = await page.goto(`${I}/u`);
  expect(aufInbox?.status()).toBe(200);
  await expect(page.getByTestId("files-inbox-start")).toBeVisible();
});

/*
 * WAS DIESE DATEI HEUTE NICHT PRUEFEN KANN — und wer es uebernimmt.
 *
 * Zwei Rollen-Riegel sind gebaut, aber strukturell unbewacht, weil hinter ihnen
 * noch keine Seite steht (`pnpm build` listet aus diesem Modul nur `/m/files`
 * und `/m/files/u`). Beide Mutationen wurden ausgefuehrt und blieben 6/6 gruen;
 * sie stehen hier, damit der spaetere Task sie nicht neu finden muss:
 *
 * 1. `(oeffentlich-share)/layout.tsx` — `requireRolle("verwaltung", …)` nach
 *    `requireRolle("inbox", …)` gedreht. Folge: `/s/<id>` waere auf dem
 *    Verwaltungs-Host 404 und auf der Inbox-Domain erreichbar — also genau die
 *    GEDRUCKTEN und verteilten Freigabe-Links kaputt, und zwar erst dann
 *    sichtbar, wenn jemand einen davon aufruft.
 *    Faellt an: T35 (erste Seite unter `(oeffentlich-share)`). Der Punkt lautet
 *    „`GET <inbox-host>/s/<id>` → 404, `GET <verwaltungs-host>/s/<id>` → 200".
 *
 * 2. `(verwaltung)/layout.tsx` — `await requireFilesAccess()` entfernt. Folge:
 *    die GESAMTE Verwaltung (`/shares/*`, `/posteingang`, `/zugangslinks`)
 *    stuende jedem angemeldeten Suite-Nutzer offen. Das Modul ist
 *    `requiresAuth: false`, die Middleware gatet hier also nachweislich nicht
 *    (Begruendung im Kopf jener Datei). Punkt 5 oben besitzt denselben Riegel
 *    NUR fuer den Verteiler (`page.tsx`), nicht fuer das Group-Layout.
 *    Faellt an: T35 oder T44. Der Punkt lautet „`GET <verwaltungs-host>/shares/neu`
 *    angemeldet OHNE Modulgruppe → 404".
 *
 * Kein `test.fixme()` dafuer: ein uebersprungener Test mit einer Adresse, die es
 * nicht gibt, sieht wie eine bekannte Luecke aus und wird beim ersten Aufraeumen
 * geloescht. Ein Kommentar mit Mutation und Besitzer ueberlebt das.
 */
