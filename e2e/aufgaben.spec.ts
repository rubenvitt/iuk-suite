import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { setzeAvModus } from "./helpers/avModus";

const HOST = "aufgaben.localtest.me";
const GRUPPE = "iuk-aufgaben-nutzer";

/** Minimale, aber echte PNG-Signatur (8 Bytes) plus etwas Nutzlast — `_lib/ablage.ts` prueft nur die Magic Bytes. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

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

/*
 * AUFGABE 14 — DIE KOORDINATION: EINSTIEG, VERTEILUNG, PERSONENVERWALTUNG. Zwei voellig neue
 * Routen (`/verteilen`, `/personen`) UND die erste echte `EinstiegKoordination` statt des
 * Platzhalters aus Aufgabe 13 — dieselbe Kombination aus neuer Route und neuer Client-Insel
 * (`VerteilenDialog.tsx`s Table+Modal, `PersonenFormular.tsx`, `PersonenTabelle.tsx`), die
 * `typecheck`, `lint`, `build` und Vitest strukturell nicht sehen koennen (Kopfkommentar oben).
 *
 * `rike@localtest.me` TRIFFT GENAU DIE KOORDINATIONS-PERSONA AUS `seedLokal.ts`
 * (`subFuer({ sub: "rike", ... }) === "dev:rike@localtest.me"`).
 */
test("Verteilung: die Koordination meldet sich an, die Modulwurzel zeigt „Verteilung“ und bleibt fehlerfrei", async ({
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
    email: "rike@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Verteilung", level: 1 })).toBeVisible();
  // Minor 4 (Fix-Runde 1): dieser h1-Abruf allein waere auch vor Aufgabe 14 gruen gewesen (der
  // Platzhalter aus Aufgabe 13 trug denselben Titel) — die Posteingang-Zeile bindet den ECHTEN
  // Inhalt, wie es der `/verteilen`-Abruf unten schon tut.
  await expect(page.getByText("Verbandskästen im Fahrzeugpark prüfen")).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

test("Verteilen: /verteilen antwortet der Koordination mit 200 und zeigt den Posteingang", async ({
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
    email: "rike@localtest.me",
    callbackPath: "/verteilen",
  });
  const res = await page.goto(`http://${HOST}:3100/verteilen`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Verteilen", level: 1 })).toBeVisible();
  // Der Seed legt „Verbandskästen im Fahrzeugpark prüfen" als eingegangene, noch unverteilte
  // Aufgabe an — genau die Zeile, die diese Seite zeigen soll.
  await expect(page.getByText("Verbandskästen im Fahrzeugpark prüfen")).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

/**
 * DIE KERNZUSAGE DER GESAMTEN AUFGABE (Spec §8.3, Brief woertlich): „/verteilen antwortet einer
 * auftrag-Person mit 404, und der Weg dorthin existiert in ihrer Oberflaeche nicht. Beides prueft
 * dasselbe Praedikat aus derselben Quelle." — das ist die Antwort auf die urspruengliche
 * Beschwerde, dass Jönne und Schulle (hier: Malte, Tomke) faktisch mitverteilen, ohne die
 * Gesamtlage zu kennen. EIN E2E-FALL DAFUER IST PFLICHT, NICHT NUR EIN VITEST-TEST (Brief) — diese
 * Zusage ist bereits auf Vitest-Ebene gebunden (`verteilen/page.test.tsx`), hier zusaetzlich
 * end-to-end, weil sie die eigentliche fachliche Kernanforderung des Moduls traegt.
 */
test("Verteilen-Gegenprobe: eine auftrag-Person bekommt auf /verteilen 404 — der Weg existiert in ihrer Oberflaeche nicht", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "malte@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/verteilen`);
  expect(res?.status()).toBe(404);
});

test("Personenverwaltung: /personen antwortet der Koordination mit 200", async ({ page }) => {
  const konsolenFehler: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") konsolenFehler.push(msg.text());
  });
  page.on("pageerror", (err) => konsolenFehler.push(err.message));

  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "rike@localtest.me",
    callbackPath: "/personen",
  });
  const res = await page.goto(`http://${HOST}:3100/personen`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Personenverwaltung", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Person anlegen" })).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

test("Personenverwaltung-Gegenprobe: eine bufdi-Person bekommt auf /personen 404", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/personen`);
  expect(res?.status()).toBe(404);
});

/*
 * AUFGABE 15 — DER AUFTRAGGEBER: EINSTIEG, „AUFGABE EINSTELLEN", FREIGABEN. Drei voellig neue
 * Routen-Abrufe (`/`, jetzt mit `EinstiegAuftrag` statt des Platzhalters aus Aufgabe 13, plus die
 * beiden NEUEN Routen `/neu` und `/freigaben`) UND zwei neue Client-Inseln
 * (`AufgabeFormular.tsx`, `FreigabeZone.tsx`) — dieselbe Kombination, die `typecheck`, `lint`,
 * `build` und Vitest strukturell nicht sehen koennen (Kopfkommentar oben).
 *
 * `malte@localtest.me` TRIFFT DIE `auftrag`-PERSONA AUS `seedLokal.ts` (schon oben als
 * Verteilen-Gegenprobe genutzt).
 */
test("Meine Auftraege: ein Auftraggeber meldet sich an, die Modulwurzel zeigt „Meine Aufträge“ und bleibt fehlerfrei", async ({
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
    email: "malte@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Meine Aufträge", level: 1 })).toBeVisible();
  // GEZIELT AUF DEN SEITENINHALT, NICHT AUF DIE MODULNAVIGATION (Aufgabe 16): seit `_lib/nav.ts`
  // traegt auch die Kopfzeilen-Navigation einen Verweis „Aufgabe einstellen" auf `/neu` — derselbe
  // Name existiert jetzt ZWEIMAL auf der Seite (Nav-Link UND der Knopf im Seitenkopf), ein
  // ungezielter `page.getByRole("link", …)` waere seitdem mehrdeutig.
  await expect(
    page.getByTestId("aufgaben-content").getByRole("link", { name: "Aufgabe einstellen" }),
  ).toHaveAttribute("href", "/neu");
  expect(konsolenFehler).toEqual([]);
});

/**
 * DIE KERNZUSAGE DIESER AUFGABE, END-TO-END (Spec §8.3, Brief woertlich): kein Weg zum Verteilen
 * auf der Auftraggeber-Oberflaeche selbst — nicht nur die 404-Gegenprobe auf `/verteilen` (oben,
 * seit Aufgabe 14), sondern die Abwesenheit des Verweises AUF DIESER SEITE. Sucht aktiv danach,
 * statt es nur zu behaupten (Brief: „kann deine e2e-Assertion überhaupt rot werden").
 */
test("Meine Auftraege enthaelt keinen Weg zum Verteilen — kein Verweis, kein Knopf", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "malte@localtest.me",
    callbackPath: "/",
  });
  await expect(page.getByRole("link", { name: "Verteilen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Verteilen" })).toHaveCount(0);
  const hrefs = await page.locator("a").evaluateAll((links) =>
    links.map((l) => l.getAttribute("href")),
  );
  expect(hrefs.some((h) => h?.includes("verteilen"))).toBe(false);
});

test("Aufgabe einstellen: /neu antwortet mit 200 und zeigt das Formular samt „fuer mich selbst“-Wahl fuer auftrag", async ({
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
    email: "malte@localtest.me",
    callbackPath: "/neu",
  });
  const res = await page.goto(`http://${HOST}:3100/neu`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Aufgabe einstellen", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Für mich selbst einstellen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aufgabe einstellen" })).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

/**
 * `/neu` GATET NICHT AUF EINE ROLLE (Spec §8: „BuFDis fuer sich selbst") — eine BuFDi erreicht die
 * Seite ebenfalls, aber OHNE die Wahl „fuer mich selbst" (sie besteht fuer diese Rolle nicht,
 * `darfEinstellenFuerAndere`).
 */
test("Aufgabe einstellen: eine BuFDi erreicht /neu ebenfalls, aber ohne die „fuer mich selbst“-Wahl", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/neu",
  });
  const res = await page.goto(`http://${HOST}:3100/neu`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Aufgabe einstellen", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Für mich selbst einstellen")).toHaveCount(0);
});

/**
 * `/freigaben` — DIE WARTESCHLANGE ALS EIGENE ROUTE (Aufgabe 15, Spec §8). `tomke@localtest.me`
 * TRIFFT DIE ZWEITE `auftrag`-PERSONA AUS `seedLokal.ts` — sie ist der eingetragene Pruefer der
 * Demo-Aufgabe „Erste-Hilfe-Kurs Nachbereitung" (`status: "freigabe_offen"`), erscheint fuer sie
 * also unter „Meine".
 */
test("Freigaben: /freigaben antwortet einer Auftraggeberin mit 200 und zeigt ihre eigene Freigabe", async ({
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
    email: "tomke@localtest.me",
    callbackPath: "/freigaben",
  });
  const res = await page.goto(`http://${HOST}:3100/freigaben`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Freigaben", level: 1 })).toBeVisible();
  await expect(page.getByText("Erste-Hilfe-Kurs Nachbereitung")).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

/**
 * DIESELBE AUFGABE, FUER DIE KOORDINATION „IN VERTRETUNG" (Tomke ist der eingetragene Pruefer,
 * nicht Rike) — dieselbe Unterscheidung, die `istVertretungsfreigabe` traegt (`_lib/zugang.ts`).
 */
test("Freigaben: dieselbe Aufgabe erscheint fuer die Koordination unter „in Vertretung“", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "rike@localtest.me",
    callbackPath: "/freigaben",
  });
  const res = await page.goto(`http://${HOST}:3100/freigaben`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Erste-Hilfe-Kurs Nachbereitung")).toBeVisible();
});

test("Freigaben-Gegenprobe: eine BuFDi bekommt auf /freigaben 404", async ({ page }) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/freigaben`);
  expect(res?.status()).toBe(404);
});

/*
 * AUFGABE 16 — AUFGABENDETAIL, ARCHIV, MODULNAVIGATION, SICHTBAR IM APP-SWITCHER. ZWEI VOELLIG
 * NEUE ROUTEN (`/a/<id>`, `/archiv") UND DIE ERSTE `Popconfirm`-CLIENT-INSEL AUSSERHALB VON
 * `PersonenTabelle.tsx` (`_ui/AktionsZone.tsx`s „Zurückziehen") — dieselbe Kombination, die
 * `typecheck`, `lint`, `build` und Vitest strukturell nicht sehen koennen (Kopfkommentar oben).
 *
 * DIE ID KOMMT AUS DEM GERENDERTEN MARKUP, NICHT FEST VERDRAHTET (Vorbild der
 * `/plan/<fremde-person>`-Test oben): `seedLokal.ts`s Ids sind `nanoid`-Werte, kein stabiler Wert.
 * „Verbandskästen im Fahrzeugpark prüfen" ist die eine, noch `eingegangene` Demo-Aufgabe Maltes —
 * ihr Titel verlinkt in „Meine Aufträge" (`_ui/AufgabenListe.tsx`) auf `/a/<id>`.
 */
test("Aufgabendetail: /a/<id> antwortet mit 200, zeigt Chip-Zeile, Metablock, Verlauf und die Zurückziehen-Aktion", async ({
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
    email: "malte@localtest.me",
    callbackPath: "/",
  });

  const detailLink = page.getByRole("link", { name: "Verbandskästen im Fahrzeugpark prüfen" });
  const href = await detailLink.getAttribute("href");
  expect(href, "kein Verweis auf das Aufgabendetail gefunden").toBeTruthy();
  expect(href).toMatch(/^\/a\//);

  const res = await page.goto(`http://${HOST}:3100${href}`);
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Verbandskästen im Fahrzeugpark prüfen", level: 1 }),
  ).toBeVisible();
  // DIE CHIP-ZEILE (Zustand, Prioritaet) UND DER METABLOCK (Auftraggeber). "Malte" steht mehrfach
  // auf der Seite (Kontextzeile, Metablock, Verlauf) — `getByText` gezielt auf den Metablock-Wert
  // (`<dd>`) eingeschraenkt, statt mehrdeutig ueber die ganze Seite zu suchen.
  await expect(page.getByText("Zu verteilen")).toBeVisible();
  await expect(page.getByText("Mittel")).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "Malte" })).toBeVisible();
  // DER VERLAUF ALS JOURNAL — mindestens der Eintrag "Eingestellt" aus dem Seed.
  await expect(page.getByText("Eingestellt")).toBeVisible();
  // DIE AKTIONSZONE: Malte ist Ersteller einer Aufgabe im Zustand "eingegangen" — "Zurückziehen"
  // ist bestaetigungspflichtig (Spec §9.9) und deshalb die ERSTE echte `Popconfirm`-Client-Insel
  // ausserhalb von `_ui/PersonenTabelle.tsx`.
  await expect(page.getByRole("button", { name: "Zurückziehen" })).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

test("Aufgabendetail-Gegenprobe: /a/<unbekannt> ergibt 404", async ({ page }) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "malte@localtest.me",
    callbackPath: "/",
  });
  const res = await page.goto(`http://${HOST}:3100/a/unbekannte-id`);
  expect(res?.status()).toBe(404);
});

/**
 * ARCHIV: FUER ALLE, GEFILTERT AUF SICHTRECHT (Spec §8). Rike (koordination) sieht JEDE
 * abgeschlossene Aufgabe — sowohl Bendix' Selbstaufgabe als auch Dörtes (ausgeschiedene) Aufgabe,
 * die Malte fuer sie eingestellt hat.
 */
test("Archiv: /archiv antwortet mit 200 und zeigt abgeschlossene Aufgaben, gefiltert auf das Sichtrecht", async ({
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
    email: "rike@localtest.me",
    callbackPath: "/archiv",
  });
  const res = await page.goto(`http://${HOST}:3100/archiv`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Archiv", level: 1 })).toBeVisible();
  await expect(page.getByText("Eigene Fortbildung: Reanimation auffrischen")).toBeVisible();
  await expect(page.getByText("Depotbestand Winterausstattung dokumentieren")).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

test("Archiv: der Prioritätsfilter (Client-Insel) filtert serverseitig, ohne Konsolenfehler", async ({
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
    email: "rike@localtest.me",
    callbackPath: "/archiv",
  });
  // „Eigene Fortbildung: Reanimation auffrischen" ist die eine Demo-Aufgabe mit Prioritaet
  // „niedrig" — VOR dem Filtern sichtbar (Gegenprobe, dass sie ueberhaupt existiert).
  await expect(page.getByText("Eigene Fortbildung: Reanimation auffrischen")).toBeVisible();

  await page.getByLabel("Priorität").selectOption("hoch");
  await page.waitForURL((url) => url.search.includes("prioritaet=hoch"));
  // `networkidle` VOR der naechsten Navigation (Vorbild `fixtures.ts`s `devLogin`, dieselbe
  // Begruendung): das native GET-Formular loest eine ECHTE Seitennavigation aus, und eine zweite
  // Navigation waehrend next-auths `SessionProvider` noch eine Sitzungsabfrage der vorherigen
  // Seite offen hat, bricht diese ab — der Browser meldet das als `ClientFetchError`, kein
  // Anwendungsfehler dieser Seite.
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Eigene Fortbildung: Reanimation auffrischen")).toHaveCount(0);

  // POSITIVE ZUSICHERUNG (Fix-Runde 1, Minor 6): die reine Abwesenheits-Pruefung oben liesse auch
  // eine leere oder kaputt gerenderte Seite durchgehen. Auf „niedrig" zurueckgefiltert MUSS die
  // Aufgabe wieder erscheinen — nur das beweist, dass der Filter tatsaechlich filtert, statt bloss
  // alles auszublenden.
  await page.getByLabel("Priorität").selectOption("niedrig");
  await page.waitForURL((url) => url.search.includes("prioritaet=niedrig"));
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Eigene Fortbildung: Reanimation auffrischen")).toBeVisible();

  expect(konsolenFehler).toEqual([]);
});

/*
 * AUFGABE 19 — NACHWEIS HOCHLADEN UND AUSLIEFERN. DER SICHERHEITSKRITISCHSTE PFAD DES MODULS, UND
 * EINE NEUE ROUTE (`/a/<id>/nachweis/<nachweisId>`) — genau die Bauform, bei der ein fehlender
 * Riegel im Vitest-Test unsichtbar bliebe (kein Layout, keine Middleware ueber einem Route
 * Handler). `AUFGABEN_AV_HOST/PORT` zeigen in `playwright.config.ts` auf DENSELBEN Fake-clamd wie
 * `files` — `setzeAvModus` macht den Scan-Ausgang deterministisch, ohne echtes clamd.
 *
 * `expect.poll(...).toPass()`-AEHNLICHES MUSTER STATT FESTER WARTEZEIT: der Scan laeuft
 * fire-and-forget NACH dem Upload (Brief-Vertrag aus Aufgabe 18 — die Action wartet nicht darauf),
 * die Seite zeigt das Ergebnis erst beim NAECHSTEN Aufruf. `wartenAufNachweisStatus` laedt die
 * Seite deshalb wiederholt neu, bis der erwartete Zustand erscheint, statt eine Zeit zu raten.
 *
 * „Fahrzeugerstausstattung fotografisch dokumentieren" (`_lib/seedLokal.ts`) ist die eigens dafuer
 * angelegte Demo-Aufgabe: `verteilt`, unverplant, `nachweisPflicht: true`, `nachweisArt: "bild"`,
 * zugewiesen an Alina, OHNE vorhandenen Nachweis — die Tests unten durchlaufen den Upload selbst.
 *
 * `verteilt`+unverplant IST KEIN ZUFALL (Kopfkommentar `seedLokal.ts`): nur in diesem Zustand
 * erscheint der Titel als ECHTER LINK (Alinas Posteingang, `wartetAufEinplanung`) — die
 * Wochenplan-Spalten verlinken nicht (`_ui/Wochenplan.tsx` rendert Titel nur als Text).
 * `oeffneNachweisAufgabe` klickt sich ueber den Posteingang zur Detailseite und startet die
 * Aufgabe dort selbst (`in_arbeit`), bevor Upload/Fertig-melden ueberhaupt angeboten werden.
 */
const NACHWEIS_AUFGABE = "Fahrzeugerstausstattung fotografisch dokumentieren";

// GEMERKTER PFAD, EINMAL GEFUNDEN (Modulebene, ueberlebt einzelne Tests — `workers: 1` haelt
// denselben Node-Prozess fuer die ganze Datei): sobald die Aufgabe gestartet ist (`in_arbeit`),
// verschwindet ihr Titel aus Alinas Posteingang (`wartetAufEinplanung` verlangt `status ===
// "verteilt"`) — der ZWEITE Test dieser Suite faende sonst gar keinen Link mehr. Der erste Aufruf
// entdeckt den Pfad ueber den echten Link (beweist, dass er existiert), jeder weitere navigiert
// direkt dorthin.
let nachweisHref: string | null = null;
/** Der `src` des zuletzt erfolgreich ausgelieferten, `sauber`en Bildes — fuer die IDOR-Gegenprobe im naechsten Test. */
let sauberesNachweisSrc: string | null = null;

async function oeffneNachweisAufgabe(page: import("@playwright/test").Page): Promise<void> {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });

  if (nachweisHref === null) {
    const link = page.getByRole("link", { name: NACHWEIS_AUFGABE });
    const href = await link.getAttribute("href");
    expect(href, "kein Verweis auf die Nachweis-Demoaufgabe gefunden").toBeTruthy();
    nachweisHref = href;
  }
  await page.goto(`http://${HOST}:3100${nachweisHref}`);

  // NUR BEIM ERSTEN AUFRUF SICHTBAR: eine bereits gestartete Aufgabe zeigt „Bearbeitung starten"
  // nicht mehr (`aktionsOptionen.starten` wird dann false) — der zweite Test dieser Datei trifft
  // die Aufgabe schon `in_arbeit` an, der Knopf fehlt dann folgerichtig.
  const startenKnopf = page.getByRole("button", { name: "Bearbeitung starten" });
  if (await startenKnopf.isVisible().catch(() => false)) {
    await startenKnopf.click();
    await expect(page.getByRole("button", { name: "Nachweis speichern" })).toBeVisible();
  }
}

/**
 * LAEDT DIE SEITE WIEDERHOLT NEU, BIS DIE BEDINGUNG ZUTRIFFT (oder das Zeitbudget aufgebraucht
 * ist) — der Scan ist asynchron, die Seite zeigt sein Ergebnis erst nach einem neuen Aufruf.
 */
async function wartenAufNachweisStatus(
  page: import("@playwright/test").Page,
  bedingung: () => Promise<boolean>,
  versucheMax = 20,
): Promise<void> {
  for (let i = 0; i < versucheMax; i++) {
    if (await bedingung()) return;
    await page.waitForTimeout(250);
    await page.reload();
  }
  throw new Error(`Der erwartete Nachweis-Zustand ist nach ${versucheMax} Versuchen nicht eingetreten.`);
}

test("Nachweis hochladen — ein Fund (Fake-clamd „found“) wird NICHT ausgeliefert, Fertig melden bleibt verweigert", async ({
  page,
}) => {
  setzeAvModus("found");
  await oeffneNachweisAufgabe(page);

  await page.locator("#nf-datei").setInputFiles({ name: "beweisfoto.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Nachweis speichern" }).click();
  await expect(page.getByRole("button", { name: "Nachweis speichern" })).toBeVisible();

  await wartenAufNachweisStatus(page, async () => {
    const grund = page.getByTestId("nachweis-bild-grund");
    if ((await grund.count()) === 0) return false;
    const text = (await grund.textContent()) ?? "";
    return !text.includes("wird noch geprüft");
  });

  // KEIN BILD — der Fund wird nicht ausgeliefert, weder inline noch als direkter Abruf.
  await expect(page.getByTestId("nachweis-bild")).toHaveCount(0);

  // FERTIG MELDEN BLEIBT VERWEIGERT — die genaue Wortwahl ("wird noch geprueft" vs. "nicht
  // freigegeben") ist Vitest-Sache (`actions.test.ts`); hier zaehlt nur die Invariante, die fuer
  // JEDEN Nicht-„sauber"-Zustand gilt: kein Fortschritt, die Aufgabe bleibt „In Bearbeitung".
  await page.getByRole("button", { name: "Fertig melden" }).click();
  await expect(page.getByText(/Für diese Aufgabe ist ein Bildnachweis erforderlich\.|nicht freigegeben|geprüft/)).toBeVisible();
  await expect(page.getByText("In Bearbeitung")).toBeVisible();
});

test("Nachweis hochladen — ein sauberes Bild (Fake-clamd „ok“) wird ausgeliefert, Fertig melden geht danach durch", async ({
  page,
}) => {
  setzeAvModus("ok");
  await oeffneNachweisAufgabe(page);

  await page.locator("#nf-datei").setInputFiles({ name: "beweisfoto.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Nachweis speichern" }).click();

  await wartenAufNachweisStatus(page, async () => (await page.getByTestId("nachweis-bild").count()) > 0);

  // DIE ECHTE AUSLIEFERUNG: Bytes UND Content-Type kommen tatsaechlich vom Server, nicht nur die
  // <img>-Praesenz im Markup.
  const src = await page.getByTestId("nachweis-bild").getAttribute("src");
  expect(src, "kein src auf dem ausgelieferten Bild").toBeTruthy();
  const antwort = await page.request.get(`http://${HOST}:3100${src}`);
  expect(antwort.status()).toBe(200);
  expect(antwort.headers()["content-type"]).toBe("image/png");
  expect(Buffer.compare(await antwort.body(), PNG)).toBe(0);

  // FERTIG MELDEN GEHT JETZT DURCH — die Nachweispflicht ist mit einem `sauber`en Bild erfuellt.
  await page.getByRole("button", { name: "Fertig melden" }).click();
  await expect(page.getByRole("heading", { name: NACHWEIS_AUFGABE, level: 1 })).toBeVisible();
  await expect(page.getByText("Freigabe offen")).toBeVisible();

  // Fuer die IDOR-/Sichtrecht-Gegenprobe im NAECHSTEN Test aufgehoben — ein zweiter `devLogin`
  // INNERHALB dieses Tests waere ein zweiter echter Anmeldevorgang mit bereits gueltiger Sitzung
  // (Alina) und lief in der Praxis in einen Timeout auf der Anmeldeseite; ein FRISCHER Playwright-
  // Test (eigener Browserkontext, keine Sitzung) ist der sauberere Weg, dieselbe Aussage zu pruefen.
  sauberesNachweisSrc = src;
});

/**
 * DIE IDOR-/SICHTRECHT-GEGENPROBE, ECHT ABGERUFEN, IN EINEM FRISCHEN KONTEXT: Carla (eine andere
 * BuFDi, weder Ersteller, Zugewiesene, Pruefer noch Koordination dieser Aufgabe) bekommt denselben
 * Pfad NICHT — 404, kein Redirect, keine Anmeldeseite. `darfNachweisSehen` gilt in der Route,
 * nicht nur auf der Seite (Spec §2: „Leistungsnachweise sind kein Aushang").
 */
test("Nachweis-Auslieferung: eine andere BuFDi ohne darfNachweisSehen bekommt denselben Pfad NICHT — 404", async ({
  page,
}) => {
  expect(sauberesNachweisSrc, "der vorige Test hat kein sauberes Bild geliefert").toBeTruthy();
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "carla@localtest.me",
    callbackPath: "/",
  });
  const antwort = await page.request.get(`http://${HOST}:3100${sauberesNachweisSrc}`);
  expect(antwort.status()).toBe(404);
});

/**
 * SICHTBAR IM APP-SWITCHER (Aufgabe 16, `showInSwitcher: true`) — geprueft VON EINEM ANDEREN
 * MODUL AUS (Vorbild `keystone.spec.ts`s „switcher reflects groups"), nicht von der aufgaben-Seite
 * selbst: dort traegt seit dieser Aufgabe AUCH die Modulnavigation einen Eintrag „Aufgaben" (der
 * Wurzel-Anker aus `_lib/nav.ts`), und beide Verweise waeren unter demselben Namen mehrdeutig.
 * `alpha-users,iuk-aufgaben-nutzer` ist EINE Sitzung mit BEIDEN Gruppen — dieselbe SSO-Zusicherung
 * wie in `keystone.spec.ts`.
 */
test("App-Switcher: seit Aufgabe 16 erscheint „Aufgaben“ fuer eine Person mit der Zugangsgruppe", async ({
  page,
}) => {
  await devLogin(page, {
    host: "alpha.localtest.me",
    groups: `alpha-users,${GRUPPE}`,
    callbackPath: "/",
  });
  await expect(page.getByTestId("alpha-content")).toBeVisible();
  await expect(page.getByRole("link", { name: /Aufgaben/ })).toBeVisible();
});
