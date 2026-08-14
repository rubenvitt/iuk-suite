import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

const HOST = "aufgaben.localtest.me";
const GRUPPE = "iuk-aufgaben-nutzer";

/**
 * WARUM DIESER ABRUF DER WICHTIGSTE TEST DES MODULS IST: die vier Suite-Fallen,
 * die diesen Plan bedrohen (antd-Compound in RSC, ein WERT aus einem
 * "use client"-Modul, @ant-design/icons in RSC, ein gestempeltes
 * data-theme="auto") bestehen `pnpm typecheck`, `pnpm lint`, `pnpm build` UND
 * `pnpm vitest run`. Nur ein echter Abruf zeigt den 500.
 *
 * WIEDER DIE ANONYME DEV-ADRESSE (`dev@localtest.me`), SEIT FIX-RUNDE 1 (Spec-Nachtrag 2026-08-14,
 * `1d36008`): zwischenzeitlich mit `email: "alina@localtest.me"` umgangen, weil die anonyme Adresse
 * (Modulzugang, aber keine `personen`-Zeile) `notFound()` ergab. Genau dieser Fall bekommt jetzt die
 * Erklaerseite statt 404 (s. `NichtEingetragenSeite`, eigener Test unten) — die anonyme Adresse
 * pruefte also wieder etwas Sinnvolles: die Modulwurzel antwortet 200, unabhaengig davon, ob die
 * Person schon eine `personen`-Zeile hat.
 */
test("Modulwurzel antwortet mit 200 und traegt die Suite-Kopfzeile", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
  await expect(page.getByTestId("aufgaben-content")).toBeVisible();
  await expect(page.getByTestId("suite-header")).toBeVisible();
});

/**
 * DIE ERKLAERSEITE SELBST (Spec-Nachtrag 2026-08-14, `1d36008`, Fix-Runde 1): der Fall wurde bei
 * genau diesem Test sichtbar — die anonyme Dev-Adresse hat Modulzugang (die Zugangsgruppe), aber
 * keine `personen`-Zeile, und bekommt seit dieser Runde eine Erklaerseite statt `notFound()`.
 */
test("Modulzugang ohne personen-Zeile zeigt die Erklaerseite, keine 404", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, callbackPath: "/" });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Du bist noch nicht im Modul eingetragen.")).toBeVisible();
});

test("ohne die Zugangsgruppe verweigert die Middleware den Zugang", async ({ page }) => {
  // Der Riegel liegt in der Middleware (core/routing.ts), nicht im Modul —
  // dasselbe Bild wie bei `alpha` in keystone.spec.ts. Deshalb 403 und nicht
  // 404: hier verschweigt die Suite nichts, sie verweigert.
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(403);
});

/**
 * DIE ERSTE NEUE ROUTE SEIT AUFGABE 1 UND DIE ERSTE CLIENT-INSEL DES MODULS (Aufgabe 11, Brief) —
 * genau die Kombination, die `typecheck`, `lint`, `build` UND Vitest strukturell nicht sehen koennen
 * (die vier Suite-Fallen im Kopfkommentar oben). Nur dieser echte Abruf zeigt einen HTTP 500.
 *
 * `sub: "dev:alina@localtest.me"` TRIFFT GENAU DIE BUFDI-PERSONA AUS `seedLokal.ts`
 * (`subFuer({ sub: "alina", ... }) === "dev:alina@localtest.me"`) — Alina ist eine der drei BuFDis,
 * fuer die `/routinen` gedacht ist (Spec §8).
 *
 * DIE KONSOLE BLEIBT FEHLERFREI: die Client-Insel `RoutineFormular` ist der einzige Ort im Modul, an
 * dem ein Hydrationsfehler (Server- und Client-Markup weichen voneinander ab) ueberhaupt entstehen
 * koennte — ein solcher Fehler besteht `pnpm build` UND Vitest, meldet sich aber laut in der Konsole
 * eines echten Browsers.
 */
test("Routinen: BuFDi meldet sich an, /routinen antwortet mit 200 und bleibt fehlerfrei", async ({
  page,
}) => {
  const konsolenFehler: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") konsolenFehler.push(msg.text());
  });
  page.on("pageerror", (err) => konsolenFehler.push(err.message));

  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/routinen",
  });

  await expect(page.getByRole("heading", { name: "Routinen", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Routine anlegen" })).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

/*
 * AUFGABE 13 — DIE ZWEI PFLICHT-ABRUFE FUER DIE ERSTE SEITENAUFGABE: die Modulwurzel bekommt
 * echten Inhalt (statt des Platzhalters aus Aufgabe 1), und `/plan/<personId>` ist eine VOELLIG
 * neue Route. Beide bestehen die vier Suite-Fallen aus dem Kopfkommentar oben strukturell nicht —
 * nur ein echter Abruf zeigt einen HTTP 500.
 */
test("Meine Woche: eine BuFDi meldet sich an, die Modulwurzel antwortet mit 200 und zeigt „Meine Woche“", async ({
  page,
}) => {
  const konsolenFehler: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") konsolenFehler.push(msg.text());
  });
  page.on("pageerror", (err) => konsolenFehler.push(err.message));

  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Meine Woche", level: 1 })).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

/**
 * DIE KERNZUSAGE VON `/plan/[personId]` (Spec §7, §8): ein fremder Zeitplan ist LESBAR, aber OHNE
 * jede Aktion — dasselbe Praedikat (`darfPlanAendern`) entscheidet in Navigation UND Riegel, damit
 * kein Knopf auf etwas zeigt, was die Action ohnehin ablehnt. Die Zielperson wird ueber den
 * echten Fusszeilen-Verweis in „Meine Woche" gefunden (`href` aus dem gerenderten Markup), NICHT
 * ueber eine fest verdrahtete Test-Id — die id ist eine von `seedLokal.ts` erzeugte `nanoid`, kein
 * stabiler Wert.
 */
test("/plan/<fremde-person> ist lesbar, aber ohne jede Aktion — kein Formular, kein Rangknopf", async ({
  page,
}) => {
  const konsolenFehler: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") konsolenFehler.push(msg.text());
  });
  page.on("pageerror", (err) => konsolenFehler.push(err.message));

  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });

  const fremderLink = page.getByRole("link", { name: /^Zeitplan von / }).first();

  const href = await fremderLink.getAttribute("href");
  expect(href, "kein Fusszeilen-Verweis zu einem fremden Zeitplan gefunden").toBeTruthy();

  const res = await page.goto(`http://${HOST}:3100${href}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Zeitplan von /);
  // KEIN `getByRole("button", { name: "Einplanen" })`-Assert (Review-Fund, Fix-Runde 1): der Seed
  // gibt jedem BuFDi ausschliesslich bereits verplante Aufgaben, die Liste waere also AUCH dann
  // leer, wenn `darfAendern` durch "immer wahr" ersetzt wuerde — eine Assertion, die nie rot werden
  // kann, ist kein Beleg. Die beiden Verschiebe-Assertions binden dagegen echt: RangKnoepfe werden
  // nur bei `zeigeAktionen` ueberhaupt gerendert.
  await expect(page.getByRole("button", { name: /nach oben verschieben/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /nach unten verschieben/ })).toHaveCount(0);
  expect(konsolenFehler).toEqual([]);
});

/**
 * DIE GRENZE DER AUSNAHME AUS SPEC-NACHTRAG 2026-08-14, END-TO-END GEPRUEFT, NICHT NUR BEHAUPTET:
 * eine unbekannte OBJEKT-Id in der URL bleibt `notFound()` — anders als die eigene, fehlende
 * `personen`-Zeile der Sitzungsperson (s. Test oben), bei der die Person selbst durchaus existiert.
 */
test("/plan/<unbekannte-id> bleibt notFound() — die Grenze der Erklaerseiten-Ausnahme", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/plan/unbekannte-id`);
  expect(res?.status()).toBe(404);
});
