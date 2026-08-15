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
  // AUFGABE 20: DASSELBE PRAEDIKAT ENTSCHEIDET AUCH UEBER DEN ZIEHGRIFF (`darfPlanAendern`,
  // `Wochenplan.tsx`s `ziehbar`/`aktionen`) — ein fremder Plan bekommt keinen einzigen
  // `[data-aufgabe-id]`, obwohl er (anders als die beiden Assertions oben) durchaus bereits
  // eingeplante Aufgaben zeigt, an denen ein Ziehgriff sonst haengen wuerde.
  await expect(page.locator("[data-aufgabe-id]")).toHaveCount(0);
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

    /*
     * DIE UPLOAD-ROUTE VOR DEM ECHTEN POST UEBERSETZEN — dasselbe Bild wie
     * `files-fileshare.spec.ts`s Warmlauf vor `/api/download/[id]` (Kopfkommentar
     * dort). `next dev`/Turbopack kompiliert einen Route Handler beim ERSTEN
     * Treffer; landet der eigentliche `fetch("...nachweis/hochladen", {method:
     * "POST"})` aus `NachweisFormular.tsx` waehrend genau dieser Erstkompilierung,
     * loest der HMR-Kanal einen vollen Seiten-Reload aus, und der Browser bricht
     * die schon laufende Anfrage MIT AB (`net::ERR_ABORTED`, `canceled: true`,
     * NIE eine Antwort) — kein Timing-Zufall, gemessen per CDP-`Network`-Domaene:
     * derselbe Klick liefert nach diesem Warmlauf zuverlaessig `200`, ohne ihn
     * zuverlaessig `ERR_ABORTED`. Ein `GET` auf eine Route, die nur `POST`
     * exportiert, kompiliert genauso (Next generiert die 405-Antwort erst NACH
     * dem Laden des Moduls) und ist harmlos: er beruehrt weder Zugriffsrecht
     * noch Datenbank.
     */
    const warmlauf = await page.request.get(`http://${HOST}:3100${nachweisHref}/nachweis/hochladen`);
    expect(warmlauf.status(), await warmlauf.text()).toBe(405);
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

/**
 * KLICKT „NACHWEIS SPEICHERN" UND PRUEFT DIE ANTWORT SELBST, STATT NUR AUF EINEN
 * SPAETEREN ZUSTANDSWECHSEL ZU WARTEN (Befund `task-19-befund.md`): ohne diese
 * Pruefung lief eine abgelehnte Antwort (404/405/413 — Routenkollision,
 * Zustandsriegel, zu grosse Anfrage) STILL in `wartenAufNachweisStatus`s
 * Zeitbudget, und die Fehlermeldung lautete „Zustand nicht eingetreten" statt
 * „Upload abgelehnt". `page.waitForResponse` faengt GENAU die Antwort auf
 * `.../nachweis/hochladen` ab — unabhaengig davon, ob sie ankommt, bevor oder
 * nachdem der Klick selbst aufgeloest ist.
 */
async function sendeNachweis(page: import("@playwright/test").Page): Promise<void> {
  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/nachweis/hochladen")),
    page.getByRole("button", { name: "Nachweis speichern" }).click(),
  ]);
  expect(antwort.ok(), `Upload abgelehnt: HTTP ${antwort.status()} — ${await antwort.text()}`).toBe(true);
}

test("Nachweis hochladen — ein Fund (Fake-clamd „found“) wird NICHT ausgeliefert, Fertig melden bleibt verweigert", async ({
  page,
}) => {
  setzeAvModus("found");
  await oeffneNachweisAufgabe(page);

  await page.locator("#nf-datei").setInputFiles({ name: "beweisfoto.png", mimeType: "image/png", buffer: PNG });
  await sendeNachweis(page);
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
  await sendeNachweis(page);

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
  // UEBERSPRUNGEN STATT ROT, MIT BEGRUENDUNG (Befund `task-19-befund.md`): dieser
  // Test haengt am VORIGEN (`sauberesNachweisSrc` entsteht dort) — `workers: 1`
  // macht das zulaessig, aber ein fehlgeschlagener Upload im vorigen Test darf
  // hier nicht als ZWEITER, eigenstaendiger Fehler erscheinen (`toBeTruthy()`
  // auf `null`). Ein klarer Ueberspringgrund haelt fest, WESSEN Fehlschlag das
  // eigentlich ist, statt ihn zu verdecken.
  test.skip(
    sauberesNachweisSrc === null,
    "übersprungen: der vorige Test („ein sauberes Bild … wird ausgeliefert“) hat kein sauberesNachweisSrc geliefert — siehe dessen Fehlschlag, nicht diesen",
  );
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
 *
 * ERST OEFFNEN, DANN PRUEFEN (nachgezogen beim Rebase auf `main`): der App-Wechsel haengt seit dem
 * Navigations-Umbau am Modultitel und nicht mehr an einer immer sichtbaren Knopfreihe — die
 * Eintraege stehen in einem Panel hinter `app-umschalter`. Ein blankes
 * `getByRole("link", { name: /Aufgaben/ })` fand vorher nichts mehr. Die ZUSAGE ist unveraendert
 * („die Sitzung traegt die Zugangsgruppe, also steht Aufgaben im Umschalter"); nur ihr Weg dorthin
 * ist einer mehr. Wortgleich mit `keystone.spec.ts`s „switcher reflects groups", das dieselbe
 * Umstellung auf `main` bereits vollzogen hat — die Einschraenkung auf `app-panel` erledigt
 * nebenbei die Mehrdeutigkeit, die der Absatz oben umgeht.
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
  await page.getByTestId("app-umschalter").click();
  await expect(page.getByTestId("app-panel").getByRole("link", { name: /Aufgaben/ })).toBeVisible();
});

/*
 * AB HIER AUFGABE 20 — ZIEHEN ZWISCHEN TAGEN UND INNERHALB EINES TAGES, AB 768px.
 *
 * „ZIEHEN IST DIE EINE BEDIENART, DIE EIN JSDOM-TEST STRUKTURELL NICHT BEWEISEN KANN“ (Brief): kein
 * Zeigergeraet, keine echte Ereigniskette. `ZiehBereich.test.tsx` deckt die reine Rangabbildung und
 * die Ereignisverdrahtung mit HANDGEBAUTEN Ereignissen ab — der eigentliche Nachweis, dass ein
 * ECHTES Zeigergeraet in einem ECHTEN Browser dieselbe Kette ausloest, ist ausschliesslich hier.
 *
 * VIEWPORT: die Standardgroesse dieser Suite (1280×720, `playwright.config.ts` setzt nichts
 * anderes) liegt bereits ueber 768px — ohne das existiert `.wochenGitter` gar nicht (Spec §9.6).
 *
 * KEIN `locator.dragTo()` (Befund waehrend dieser Aufgabe): Playwrights eingebaute Methode setzt
 * Quelle/Ziel per EINEM Sprung und loest bei diesem nativen HTML5-Drag (kein Bibliotheks-Overlay,
 * kein `mousedown`/`click`-Ersatz) in Chromium nur UNZUVERLAESSIG ein echtes `dragstart` aus,
 * besonders wenn das Ziel kein weiterer Ziehgriff, sondern eine grosse Tagesspalte ist — ein
 * `page.waitForResponse` danach lief in genau diesem Fall in die vollen 90s, WEIL NIE EIN `drop`
 * feuerte (kein Timing-Zufall: reproduzierbar in mehreren Laeufen, per Konsolen-Instrumentierung
 * von `ZiehBereich.tsx` waehrend der Fehlersuche belegt). `zieheZu()` unten fuehrt denselben Zug
 * stattdessen ueber eine ECHTE, SCHRITTWEISE Mausbewegung (`page.mouse.move/down/move.../up`) —
 * damit feuern `dragstart`/`dragover`/`drop` zuverlaessig, in jedem Testfall unten bestaetigt.
 *
 * `page.waitForResponse` FAENGT DIE ANTWORT DES ZUGS SELBST AB (Lektion aus Aufgabe 19), nicht nur
 * eine spaetere Zustandsaenderung — sonst liefe eine abgelehnte oder abgebrochene Server-Action-
 * Antwort still ins Zeitbudget der nachfolgenden Sichtbarkeits-Assertion.
 */

/**
 * ECHTE, SCHRITTWEISE MAUSBEWEGUNG STATT `locator.dragTo()` — s. Kopfkommentar oben fuer das Warum.
 * Viele kleine Schritte (20) mit kurzer Pause (20ms) dazwischen, weil Chromium einen Drag nur bei
 * kontinuierlicher Bewegung ueber eine Mindestdistanz als HTML5-Drag erkennt, nicht bei einem
 * einzelnen Sprung ans Ziel.
 */
async function zieheZu(
  page: import("@playwright/test").Page,
  quelle: import("@playwright/test").Locator,
  ziel: import("@playwright/test").Locator,
): Promise<void> {
  const quellBox = await quelle.boundingBox();
  const zielBox = await ziel.boundingBox();
  expect(quellBox, "Quelle des Zugs hat keine sichtbare Bounding Box").not.toBeNull();
  expect(zielBox, "Ziel des Zugs hat keine sichtbare Bounding Box").not.toBeNull();
  const sx = quellBox!.x + quellBox!.width / 2;
  const sy = quellBox!.y + quellBox!.height / 2;
  const zx = zielBox!.x + zielBox!.width / 2;
  const zy = zielBox!.y + zielBox!.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const SCHRITTE = 20;
  for (let i = 1; i <= SCHRITTE; i++) {
    await page.mouse.move(sx + ((zx - sx) * i) / SCHRITTE, sy + ((zy - sy) * i) / SCHRITTE);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(100);
  await page.mouse.up();
}

test("Ziehbereich: die Knopfstrecke bleibt bedienbar, und ein Zug innerhalb eines Tages ändert den Rang, lässt die übrigen Einträge in Ruhe", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "bendix@localtest.me",
    callbackPath: "/",
  });

  const montag = page.locator('[data-rolle="wochengitter"] [data-tag]').first();

  // DIE ZUSAGE, DIE DIESE AUFGABE NICHT BRECHEN DARF (Brief): Auf-/Ab-Knoepfe bleiben da und
  // bedienbar, auch im nun ziehbaren Bereich.
  await expect(montag.getByRole("button", { name: /nach oben verschieben/ }).first()).toBeVisible();
  await expect(montag.getByRole("button", { name: /nach unten verschieben/ }).first()).toBeVisible();

  // BENDIX' MONTAG (`seedLokal.ts`): „Materialtransport Kreisverband“ (planRang 0, EXPLIZIT
  // gestaffelt seit dem Aufgabe-20-Fund — s. `seedLokal.ts`s Kommentar dort) und „Nachbereitung
  // Materialtransport“ (planRang 1), beide ohne eigene Uhrzeit — derselbe Ankerwert, die
  // Reihenfolge spiegelt deshalb den Rang.
  const zeileA = montag.locator("li").filter({ hasText: "Materialtransport Kreisverband" });
  const zeileB = montag.locator("li").filter({ hasText: "Nachbereitung Materialtransport" });
  await expect(zeileA).toHaveCount(1);
  await expect(zeileB).toHaveCount(1);
  const vorher = await montag.locator("li").allTextContents();
  expect(vorher[0]).toContain("Materialtransport Kreisverband");
  expect(vorher[1]).toContain("Nachbereitung Materialtransport");

  const griffB = zeileB.locator("[data-aufgabe-id]");
  const griffA = zeileA.locator("[data-aufgabe-id]");

  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200),
    zieheZu(page, griffB, griffA),
  ]);
  expect(antwort.ok(), `Zug abgelehnt: HTTP ${antwort.status()}`).toBe(true);

  // GENAU DIESE ZWEI ZEILEN, IN VERTAUSCHTER REIHENFOLGE — nichts verschwunden, nichts
  // hinzugekommen („laesst die uebrigen Eintraege in Ruhe“). AUTOMATISCH WIEDERHOLENDE
  // `expect(locator)`-Assertions, NICHT ein einmaliger `allTextContents()`-Schnappschuss: die
  // Server-Action-Antwort (oben abgefangen) markiert nur, dass die ANFRAGE durch ist, nicht dass
  // React das aktualisierte Markup schon COMMITTET hat — ein sofortiger `allTextContents()`-Aufruf
  // kann genau dazwischen einen veralteten Stand einfangen, ohne dass ein zweiter Versuch folgt.
  await expect(montag.locator("li")).toHaveCount(2);
  await expect(montag.locator("li").nth(0)).toContainText("Nachbereitung Materialtransport");
  await expect(montag.locator("li").nth(1)).toContainText("Materialtransport Kreisverband");
});

test("Ziehbereich: ein Zug zwischen zwei Tagen ruft einplanenAction mit dem Zieltag — Routinen bleiben nicht ziehbar", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/",
  });

  const spalten = page.locator('[data-rolle="wochengitter"] [data-tag]');
  const montag = spalten.nth(0);
  const dienstag = spalten.nth(1);

  // ROUTINEN SIND NICHT ZIEHBAR (Spec §8.1) — Alinas taegliche „Frühbesprechung“ ist als solche
  // sichtbar, traegt aber strukturell keinen Ziehgriff.
  const routineZeile = montag.locator("li").filter({ hasText: "Frühbesprechung" });
  await expect(routineZeile).toHaveCount(1);
  await expect(routineZeile.locator("[data-aufgabe-id]")).toHaveCount(0);

  const zeile = montag.locator("li").filter({ hasText: "Standwache Blutspendetermin" });
  await expect(zeile).toHaveCount(1);
  const griff = zeile.locator("[data-aufgabe-id]");

  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200),
    zieheZu(page, griff, dienstag),
  ]);
  expect(antwort.ok(), `Zug abgelehnt: HTTP ${antwort.status()}`).toBe(true);

  await expect(montag.locator("li").filter({ hasText: "Standwache Blutspendetermin" })).toHaveCount(0);
  await expect(dienstag.locator("li").filter({ hasText: "Standwache Blutspendetermin" })).toHaveCount(1);
});

test("Ziehbereich: eine in_arbeit-Aufgabe lässt sich ziehen und bleibt in_arbeit", async ({ page }) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "carla@localtest.me",
    callbackPath: "/",
  });

  const spalten = page.locator('[data-rolle="wochengitter"] [data-tag]');
  const montag = spalten.nth(0);
  const dienstag = spalten.nth(1);

  const zeile = montag.locator("li").filter({ hasText: "Blutdruckmessgeräte kalibrieren" });
  await expect(zeile).toHaveCount(1);
  // KEIN Statuscheck HIER — der Wochenplan zeigt keinen Zustands-Chip je Zeile (`Wochenplan.tsx`s
  // `EintragZeile` rendert nur Uhrzeit/Titel/Ziehgriff/RangKnoepfe). Der Statuscheck steht deshalb
  // erst NACH dem Zug, auf der Detailseite (unten).
  const griff = zeile.locator("[data-aufgabe-id]");
  const href = await zeile.getByRole("link", { name: "Blutdruckmessgeräte kalibrieren" }).getAttribute("href");
  expect(href, "kein Link auf die Detailseite — Aufgabe 19s Fund waere nicht behoben").toBeTruthy();

  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.status() === 200),
    zieheZu(page, griff, dienstag),
  ]);
  expect(antwort.ok(), `Zug abgelehnt: HTTP ${antwort.status()}`).toBe(true);

  const zieleZeile = dienstag.locator("li").filter({ hasText: "Blutdruckmessgeräte kalibrieren" });
  await expect(zieleZeile).toHaveCount(1);
  // DER STATUS BLEIBT in_arbeit, OHNE SONDERFALL (Spec-Nachtrag `72ef235`, Brief) — auf der
  // Detailseite geprueft, die ueber den jetzt echten Link erreichbar ist.
  await page.goto(`http://${HOST}:3100${href}`);
  await expect(page.getByText("In Bearbeitung")).toBeVisible();
});

test("Ziehbereich: ein abgebrochener Zug (Loslassen außerhalb jeder Tagesspalte) ändert nichts", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "bendix@localtest.me",
    callbackPath: "/",
  });

  const montag = page.locator('[data-rolle="wochengitter"] [data-tag]').first();
  const zeile = montag.locator("li").filter({ hasText: "Materialtransport Kreisverband" });
  const griff = zeile.locator("[data-aufgabe-id]");
  const vorher = await montag.locator("li").allTextContents();

  // KEIN `page.waitForResponse` HIER — genau das Gegenteil wird behauptet: es soll KEINE Antwort
  // geben. Stattdessen wird waehrend des (misslingenden) Zugs auf jede POST-Antwort gelauscht;
  // taucht eine auf, ist das der Fehlschlag dieses Tests, keine Bestaetigung.
  let gesehenerPost = false;
  const beobachten = (antwort: import("@playwright/test").Response) => {
    if (antwort.request().method() === "POST") gesehenerPost = true;
  };
  page.on("response", beobachten);
  try {
    // Auf das <h1> der Seite gezogen — weit ausserhalb jeder `[data-tag]`-Flaeche.
    await zieheZu(page, griff, page.getByRole("heading", { level: 1 }));
    // KEIN fester `waitForTimeout` (Review-Fund): ein Test, der beweisen soll, dass NICHTS
    // passiert, darf sich nicht auf eine geratene Wartezeit verlassen — zu kurz macht ihn blind,
    // zu lang bremst ihn unnoetig. `networkidle` wartet stattdessen auf ein beobachtbares Signal
    // (keine Netzwerkaktivitaet mehr), dasselbe Muster wie `devLogin` es schon nutzt, und ist damit
    // an den tatsaechlichen Netzwerkzustand gekoppelt, nicht an eine Konstante.
    await page.waitForLoadState("networkidle");
  } finally {
    page.off("response", beobachten);
  }
  expect(gesehenerPost, "ein abgebrochener Zug hat trotzdem eine Server-Anfrage ausgeloest").toBe(false);

  const nachher = await montag.locator("li").allTextContents();
  expect(nachher).toEqual(vorher);
});

/*
 * AB HIER AUFGABE 21 — DIE UMSCHALTUNG BEI DREI VIEWPORTS, DER WAAGERECHTE-SCROLL-CHECK, DER
 * DUNKELMODUS, DIE VERTAGTE TASTATURBEDIENUNG UND DER VOLLE DURCHLAUF. Der volle Durchlauf steht
 * ABSICHTLICH ALS LETZTER FALL DER GANZEN DATEI (Begruendung an seinem eigenen Kopfkommentar) —
 * alles andere in diesem Block ist les-/zustandsneutral fuer die Woche, auf die Aufgabe 20s
 * Zieh-Tests sich verlassen, ausser dem Tastatur-Fall (der VERAENDERT Bendix' Montag ein weiteres
 * Mal) — auch er steht deshalb nach den Zieh-Tests, nicht davor.
 */

/*
 * DIE UMSCHALTUNG BEI 390, 820 UND 1280PX (Spec §9.6, §10, Brief Teil 4 Punkt 4). Beide
 * Auspraegungen rendern IMMER ins HTML (Kopfkommentar `Wochenplan.tsx`); nur eine Medienabfrage
 * (767.98px) blendet je eine aus — ein Sichtbarkeits-Check ist deshalb der einzige, der die
 * tatsaechlich AUSGELIEFERTE Umschaltung sieht, kein jsdom-Test wertet eine `@media`-Regel aus.
 * 820px ist ausdruecklich die Mitte zwischen den beiden Enden (Spec §10: „die Suite hatte dort
 * zweimal Defekte, die an beiden Enden unsichtbar waren").
 */
for (const vp of [
  { breite: 390, hoehe: 844, sichtbar: "tagesliste" as const },
  { breite: 820, hoehe: 1180, sichtbar: "wochengitter" as const },
  { breite: 1280, hoehe: 720, sichtbar: "wochengitter" as const },
]) {
  test.describe(`Umschaltung bei ${vp.breite}px`, () => {
    test.use({ viewport: { width: vp.breite, height: vp.hoehe } });

    test(`zeigt ${
      vp.sichtbar === "tagesliste"
        ? "die Tagesliste, nicht das Wochengitter"
        : "das Wochengitter, nicht die Tagesliste"
    }`, async ({ page }) => {
      await devLogin(page, { host: HOST, groups: GRUPPE, email: "alina@localtest.me", callbackPath: "/" });

      const wochengitter = page.locator('[data-rolle="wochengitter"]');
      const tagesliste = page.locator('[data-rolle="tagesliste"]');

      if (vp.sichtbar === "tagesliste") {
        await expect(tagesliste).toBeVisible();
        await expect(wochengitter).toBeHidden();
      } else {
        await expect(wochengitter).toBeVisible();
        await expect(tagesliste).toBeHidden();
      }
    });
  });
}

/**
 * KEIN WAAGERECHTES SCROLLEN AUF KEINEM DER DREI VIEWPORTS (Brief Teil 4, Punkt 5) — LOKAL IN
 * DIESER DATEI, NICHT IN EINEM HELFER: Vorbild `e2e/lagerbuch-mobil.spec.ts:98-104`, dieselbe
 * Begruendung dort ("ein Layout-Helfer gehoert nicht zu dem, was diese Datei traegt").
 *
 * GEMESSEN WIRD `documentElement` UND `body`: die Brief-Formulierung nennt woertlich
 * `scrollWidth <= clientWidth am body`, die uebliche Aussagekraft liegt aber am `documentElement`
 * (Vorbild `lagerbuch-mobil.spec.ts`). Beide Werte werden deshalb geprueft, statt sich fuer einen
 * zu entscheiden — weichen sie je einmal ab, ist DAS ein Befund fuer den Bericht, keine still
 * aufgeloeste Wahl.
 *
 * MINDESTENS EINE SEITE MIT ECHTER `Table` IST PFLICHT (`/verteilen`, `/personen`): die
 * Brief-Begruendung ist woertlich "die Zusicherung, an der eine Tabelle ohne `scroll={{x}}`
 * auffaellt" — ein Sweep nur ueber "Meine Woche" (keine `Table`) waere dafuer wirkungslos.
 */
async function ueberlauf(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    vwDoc: document.documentElement.clientWidth,
    scrollDoc: document.documentElement.scrollWidth,
    vwBody: document.body.clientWidth,
    scrollBody: document.body.scrollWidth,
    schuldige: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.right > window.innerWidth + 1 && b.width > 1 && b.height > 1;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const klasse = typeof el.className === "string" ? el.className : "";
        return `${el.tagName}.${klasse.slice(0, 40)} rechts=${Math.round(b.right)} text="${(el.textContent ?? "").trim().slice(0, 60)}"`;
      })
      .slice(0, 5),
  }));
}

const UEBERLAUF_SEITEN: { label: string; pfad: string; email: string; titel: string }[] = [
  { label: "/ (Alina)", pfad: "/", email: "alina@localtest.me", titel: "Meine Woche" },
  // BENDIX' UND CARLAS WOCHEN SIND DIE EIGENTLICHEN GEGENPROBEN (advisor-Hinweis nach dem ersten
  // 820px-Fund): `flex-wrap: wrap` auf `.routineZeile` behebt den langen Routinennamen, aber NICHT
  // notwendigerweise `.budget`/`.budgetUeberbucht` — beide tragen `white-space: nowrap`
  // (`aufgaben.module.css`), und Bendix' Montag ist die EINE ueberbuchte Demo-Fixtur
  // ("9,17 / 7,80 Std. — überbucht", laenger als jede Alina-Zeile). Carlas "Nachtbereitschaft-
  // Übergabe" ist der laengste Routinenname im ganzen Seed. Ohne diese beiden Zeilen bewiese der
  // Sweep nur "eine Person mit kurzen Texten laeuft nicht ueber" — nicht die Zusicherung, die der
  // Brief verlangt.
  { label: "/ (Bendix, ueberbuchter Montag)", pfad: "/", email: "bendix@localtest.me", titel: "Meine Woche" },
  { label: "/ (Carla, laengster Routinenname)", pfad: "/", email: "carla@localtest.me", titel: "Meine Woche" },
  // `Table` mit `scroll={{x: "max-content"}}` — die eine Seite, fuer die diese Zusicherung
  // ueberhaupt etwas beweist (s. Kopfkommentar).
  { label: "/verteilen", pfad: "/verteilen", email: "rike@localtest.me", titel: "Verteilen" },
  { label: "/personen", pfad: "/personen", email: "rike@localtest.me", titel: "Personenverwaltung" },
  { label: "/archiv", pfad: "/archiv", email: "rike@localtest.me", titel: "Archiv" },
];

/*
 * 768PX IST DIE VIERTE BREITE, UND SIE IST DIE ENGSTE — NACHTRAEGLICH AUFGENOMMEN (Nach-Rebase-
 * Runde, Befund B). Bis dahin fuhr dieser Sweep 390/820/1280 und liess damit ausgerechnet die
 * KANTE aus, an der die Suite-Seitenleiste einschnappt: `src/core/shell/shell.module.css` zeigt
 * `.sider` ab `@media (min-width: 768px)`. 768px ist also die erste Breite, an der dem Modul die
 * 240px fehlen — und zugleich die kleinste, an der das Wochengitter ueberhaupt sichtbar ist
 * (`aufgaben.module.css` blendet es bis 767.98px aus). Beides zusammen ergibt die schmalste
 * Inhaltsflaeche, die dieses Modul je bekommt: gemessen 528px, gegenueber 580px bei 820px.
 *
 * WAS DAS GEKOSTET HAT, IST BELEGT UND NICHT HYPOTHETISCH: `/` lief bei 768px um 28px ueber
 * (`scrollWidth` 796 bei `clientWidth` 768) — ein DRITTER roter Fall neben den zwei bei 820px, den
 * nie jemand gesehen hat, weil keine Messung dort stand. Eine Viewport-Liste, die an einer Kante
 * nicht misst, ist genau an der Stelle blind, an der sich das Layout aendert.
 *
 * DIE LISTE IST AUCH JETZT NICHT VOLLSTAENDIG, und das steht hier, damit es nicht als „geprueft"
 * durchgeht: `/routinen` und `/freigaben` sind in `UEBERLAUF_SEITEN` NICHT enthalten, obwohl ihre
 * Zeilenaktionen in derselben Runde von 24px auf 44px gewachsen sind. Beide wurden bei 820px von
 * Hand nachgemessen und laufen nicht ueber; bewacht sind sie nicht. Bewusst so belassen — die
 * Laufzeit dieses Sweeps waechst multiplikativ ueber Seiten x Breiten.
 */
for (const vp of [
  { breite: 390, hoehe: 844 },
  { breite: 768, hoehe: 1180 },
  { breite: 820, hoehe: 1180 },
  { breite: 1280, hoehe: 720 },
]) {
  test.describe(`Kein waagerechtes Scrollen bei ${vp.breite}px`, () => {
    test.use({ viewport: { width: vp.breite, height: vp.hoehe } });

    for (const seite of UEBERLAUF_SEITEN) {
      test(`${seite.label} laeuft nicht ueber`, async ({ page }) => {
        await devLogin(page, {
          host: HOST,
          groups: GRUPPE,
          email: seite.email,
          callbackPath: seite.pfad,
        });
        const antwort = await page.goto(`http://${HOST}:3100${seite.pfad}`);
        expect(antwort?.status(), `${seite.pfad}: HTTP`).toBe(200);
        await expect(page.getByRole("heading", { name: seite.titel, level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");

        const mass = await ueberlauf(page);
        expect(
          mass.scrollDoc,
          `${seite.pfad} bei ${vp.breite}px (documentElement): ${mass.schuldige.join(" | ")}`,
        ).toBeLessThanOrEqual(mass.vwDoc);
        expect(
          mass.scrollBody,
          `${seite.pfad} bei ${vp.breite}px (body): ${mass.schuldige.join(" | ")}`,
        ).toBeLessThanOrEqual(mass.vwBody);
      });
    }
  });
}

/**
 * DUNKELMODUS UEBER `getComputedStyle`, NICHT UEBER DAS ATTRIBUT (Brief Teil 4, Punkt 6): eine
 * unaufgeloeste `--auf-*`-Variable meldet sich nie von selbst — nur eine tatsaechliche Auswertung
 * zeigt, ob sie zu ihrem dunklen Wert aufloest. ERST DER HELLE WERT, DANN ERST NACH DEM UMSCHALTEN
 * DER DUNKLE (advisor-Hinweis): nur den dunklen Wert zu pruefen koennte "der Umschalter wirkt" nicht
 * von "beide Zweige sind ohnehin dunkel" unterscheiden.
 *
 * `setAttribute("data-theme", "dark")` IM BROWSER REICHT HIER (Vorbild `shell-mobil.spec.ts`s
 * `--iuk-marke`-Test): `--auf-*` haengt an `:root[data-theme="dark"] .modul` in
 * `aufgaben.module.css` und wertet das Attribut direkt aus, unabhaengig vom serverseitig gesetzten
 * Theme-Cookie.
 */
test("Dunkelmodus: --auf-tinte loest ueber getComputedStyle tatsaechlich zu ihrem dunklen Wert auf", async ({
  page,
}) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, email: "alina@localtest.me", callbackPath: "/" });
  const inhalt = page.getByTestId("aufgaben-content");

  const hell = await inhalt.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--auf-tinte").trim(),
  );
  expect(hell, "heller Wert weicht von aufgaben.module.css ab").toBe("#1a1d20");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const dunkel = await inhalt.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--auf-tinte").trim(),
  );
  expect(
    dunkel,
    "im Dunkelmodus bleibt --auf-tinte auf dem hellen Wert stehen — eine unaufgeloeste CSS-Variable meldet sich nie von selbst",
  ).toBe("#ece9e2");
});

/**
 * DIE VERTAGTE TASTATURBEDIENUNG (aus Aufgabe 12, Spec §8.5: „das ist mit der Tastatur bedienbar
 * ... die Grundlage, auf der Abschnitt G aufsetzt") UND IHRE GEGENPROBE (Fokus muss SICHTBAR
 * bleiben) — beide gehoeren hierher, nicht in einen jsdom-Test (Aufgabe-12-Begruendung, woertlich
 * im Brief: „der haette am Ende jsdom geprueft, nicht die Zusage aus Spec §8.5").
 *
 * EINE ECHTE TAB-KETTE, KEIN `.focus()`: nur echte `Tab`-Tastendruecke durchlaufen dieselbe
 * Browser-interne Tabreihenfolge, die eine Person ohne Maus erlebt — `.focus()` uebersprnge genau
 * die Frage, ob das Element ueberhaupt ERREICHBAR ist. Ein deaktivierter Button (`disabled`, nicht
 * `aria-disabled` — `RangKnoepfe.tsx`s Kopfkommentar) ist nativ kein Tab-Stopp; der erste Eintrag
 * eines Tages traegt deshalb keinen erreichbaren „nach oben"-Knopf, der zweite (nicht `istErste`)
 * schon — genau der wird hier angesteuert.
 */
async function tabZu(
  page: import("@playwright/test").Page,
  ziel: import("@playwright/test").Locator,
  maxTabs = 150,
): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    const fokussiert = await ziel
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (fokussiert) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Ziel wurde nach ${maxTabs} Tab-Druecken nicht fokussiert.`);
}

test("Tastaturbedienung: eine Aufgabe laesst sich ohne Maus verschieben (Tab, Enter) — der Fokus bleibt sichtbar", async ({
  page,
}) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, email: "bendix@localtest.me", callbackPath: "/" });

  const montag = page.locator('[data-rolle="wochengitter"] [data-tag]').first();
  const vorher = await montag.locator("li").allTextContents();
  expect(vorher.length, "Bendix' ueberbuchter Montag braucht zwei Eintraege fuer diesen Test").toBeGreaterThanOrEqual(2);

  const zweiteZeile = montag.locator("li").nth(1);
  const hochKnopf = zweiteZeile.getByRole("button", { name: /nach oben verschieben/ });
  await expect(hochKnopf).toBeEnabled();

  await tabZu(page, hochKnopf);
  await expect(hochKnopf).toBeFocused();

  // DIE GEGENPROBE: DER FOKUS MUSS SICHTBAR SEIN (Brief) — `outline-width` UND `outline-style`,
  // nicht nur eines von beiden (ein `2px`-Ring mit `style: none` rendert ebenfalls nichts).
  const fokusStil = await hochKnopf.evaluate((el) => {
    const stil = getComputedStyle(el);
    return { breite: stil.outlineWidth, art: stil.outlineStyle };
  });
  expect(fokusStil.breite, "Fokusring unsichtbar: outline-width ist 0px").not.toBe("0px");
  expect(fokusStil.art, "Fokusring unsichtbar: outline-style ist none").not.toBe("none");

  const seite = page.url();
  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url() === seite),
    page.keyboard.press("Enter"),
  ]);
  expect(antwort.ok(), `Verschieben abgelehnt: HTTP ${antwort.status()}`).toBe(true);

  await expect(montag.locator("li")).toHaveCount(vorher.length);
  // GENAU DIE ERSTEN ZWEI ZEILEN VERTAUSCHT — dieselbe Zusicherungslinie wie der Maus-Zug weiter
  // oben, nicht nur "irgendetwas hat sich geaendert".
  await expect(montag.locator("li").nth(0)).toHaveText(vorher[1]);
  await expect(montag.locator("li").nth(1)).toHaveText(vorher[0]);
});

function inTagen(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * ROLLENWECHSEL INNERHALB DESSELBEN TESTFALLS (Brief: „der volle Durchlauf, in EINEM Testfall").
 * EIN ZWEITER `devLogin`-AUFRUF IM SELBEN BROWSERKONTEXT WUERDE OHNE DAS COOKIE-LOESCHEN NIE DAS
 * FORMULAR SEHEN: `src/app/login/page.tsx` leitet `/login` bei einer BEREITS authentifizierten
 * Sitzung sofort mit `if (session?.user) redirect("/")` weiter — VOR jedem Blick auf das
 * E-Mail-/Gruppenfeld. Ohne `clearCookies()` waere der Fehlschlag zudem IRREFUEHREND: `devLogin`s
 * eigenes `waitForURL(url => !url.pathname.startsWith("/login"))` loest bei diesem Redirect SOFORT
 * auf (die URL verlaesst ja tatsaechlich "/login"), das Formular fehlt trotzdem — der naechste
 * Schritt schlaegt dann mit einem `getByLabel("email")`-Timeout fehl, nicht mit einer Meldung, die
 * "schon angemeldet" sagt. Das Cookie-Loeschen bildet nach, was Spec §13 ohnehin als vorgesehenen
 * Rollenwechsel beschreibt ("man wechselt sich, indem man sich mit einer anderen Adresse
 * anmeldet") — ohne bestehende Sitzung waere es ohnehin wirkungslos.
 */
async function wechsleRolle(
  page: import("@playwright/test").Page,
  opts: Parameters<typeof devLogin>[1],
): Promise<void> {
  await page.context().clearCookies();
  await devLogin(page, opts);
}

/**
 * WARTET AUF DIE POST-ANTWORT DER GERADE GEKLICKTEN SERVER ACTION, GENAU AUF DIE URL DER
 * AKTUELLEN SEITE (Server Actions posten per Vorgabe auf die Seite, von der sie ausgehen) — NICHT
 * nur auf "irgendeine POST-Antwort": ein bloßes `method() === "POST"`-Praedikat koennte sich an
 * eine unbeteiligte Anfrage haengen und ein gruenes, aber bedeutungsloses Ergebnis liefern.
 *
 * `antwort.ok()` IST HIER NUR EINE TRANSPORTZUSICHERUNG (advisor-Befund): `aufgabeEinstellenAction`,
 * `verteilenAction` & Co. antworten bei einem FELDFEHLER ebenfalls mit HTTP 200
 * (`{ok:false, fieldErrors}`) — die eigentliche Zusicherung je Schritt im Test unten ist deshalb
 * immer ein sichtbarer ZUSTANDSWECHSEL (ein Link erscheint, ein Dialog schliesst sich, ein
 * Status-Chip aendert sich), NIE allein diese Antwortpruefung.
 */
async function klickeUndWarteAufSeite(
  page: import("@playwright/test").Page,
  aktion: () => Promise<void>,
): Promise<void> {
  const seite = page.url();
  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url() === seite),
    aktion(),
  ]);
  expect(
    antwort.ok(),
    `Aktion auf ${seite} abgelehnt: HTTP ${antwort.status()} — ${await antwort.text()}`,
  ).toBe(true);
}

/**
 * DER VOLLE DURCHLAUF — DER TEST, FUER DEN DAS MODUL GEBAUT WURDE (Brief, woertlich): einstellen
 * (Auftraggeber) → verteilen mit Zeitvorschlag (Koordination) → annehmen (BuFDi) → Bearbeitung
 * starten → fertig melden mit Bildnachweis → freigeben (Prüfer), IN EINEM Testfall, mit
 * Rollenwechseln. Jede der sechzehn Actions ist laengst einzeln geprueft (Aufgaben 9/10/12/19/20);
 * dieser Fall belegt, dass sie ZUSAMMEN funktionieren — die Uebergangstabelle, die Nachweispflicht
 * und die Freigabe in einer einzigen, echten Geschichte.
 *
 * EINE EIGENE, EINDEUTIG BENANNTE AUFGABE (Spec §10: „jeder e2e-Test stellt seinen Zustand selbst
 * her") — `Date.now()` im Titel macht sie ueber mehrere Laeufe gegen einen WARMEN Server hinweg
 * eindeutig (ein `pnpm exec playwright test` gegen dieselbe, nicht neu geseedete `.data/e2e`-DB
 * haette sonst bei einem zweiten Lauf zwei gleichnamige Zeilen und `getByRole("link", {name:
 * titel})` wuerde mehrdeutig) — `Date.now()` ist hier zulaessig, das Verbot aus den
 * Workflow-Skript-Regeln gilt nicht fuer Playwright-Testdateien.
 *
 * DER ZEITVORSCHLAG LIEGT ZWEI WOCHEN IN DER ZUKUNFT (`inTagen(14)`), WEIT AUSSERHALB DER VON
 * AUFGABE 20s ZIEH-TESTS GENUTZTEN AKTUELLEN WOCHE: die Aufgabe erscheint dadurch nie im
 * Standard-Wochenplan (Alinas/Bendix'/Carlas aktuelle Woche bleibt unberuehrt), was diesen ganzen
 * Test von den Zieh-Tests entkoppelt — dieselbe Ueberlegung wie der Kopfkommentar am Blockanfang.
 *
 * CARLA IST DIE ZIELPERSON (nicht Alina/Bendix, die restlichen Tests dieser Datei nutzen sie
 * bereits fuer andere Zustaende): eine dritte, bisher wenig beanspruchte BuFDi haelt das Risiko
 * einer zufaelligen Kollision klein.
 *
 * MALTE IST AUFTRAGGEBER **UND** PRUEFER — kein Zufall, sondern Spec §5.2/§9 (Brief-Kommentar
 * `aufgabeEinstellenAction`): eine Fremdaufgabe bekommt beim Einstellen automatisch den Ersteller
 * als Pruefer (`prueferId: start.istSelbst ? null : ersteller.id`). Der Rollenwechsel am Ende geht
 * deshalb zurueck zu Malte, nicht zu einer vierten Person.
 */
test("Der volle Durchlauf: einstellen, verteilen mit Zeitvorschlag, annehmen, starten, fertig melden mit Bildnachweis, freigeben — ueber drei Rollen", async ({
  page,
}) => {
  setzeAvModus("ok");
  const titel = `E2E-Rundlauf ${Date.now()}: Fahrzeugtafel erneuern`;
  const faelligAm = inTagen(21);
  const vorschlagDatum = inTagen(14);

  // 1. EINSTELLEN — Malte, Auftraggeber, ueber /neu. Bildnachweispflicht angehakt, damit der
  // Durchlauf spaeter den Bildnachweis-Weg nimmt (Brief: „fertig melden mit Bildnachweis").
  await wechsleRolle(page, {
    host: HOST,
    groups: GRUPPE,
    email: "malte@localtest.me",
    callbackPath: "/neu",
  });
  await page.goto(`http://${HOST}:3100/neu`);
  await page.locator("#af-titel").fill(titel);
  await page
    .locator("#af-beschreibung")
    .fill("Vom vollen e2e-Durchlauf (Aufgabe 21) angelegte Testaufgabe.");
  await page.locator("#af-faelligAm").fill(faelligAm);
  await page.locator("#af-dauerMinuten").fill("30");
  // Checkbox ZUERST, dann erst erscheint #af-nachweisart ueberhaupt (AufgabeFormular.tsx rendert
  // das Auswahlfeld nur bei angehaktem Schalter) — die umgekehrte Reihenfolge schluege still fehl.
  await page.locator("#af-nachweispflicht").check();
  await page.locator("#af-nachweisart").selectOption("bild");
  await klickeUndWarteAufSeite(page, () =>
    page.getByRole("button", { name: "Aufgabe einstellen" }).click(),
  );

  await page.goto(`http://${HOST}:3100/`);
  const neueAufgabe = page.getByRole("link", { name: titel });
  const href = await neueAufgabe.getAttribute("href");
  expect(
    href,
    "Aufgabe wurde nicht angelegt — kein Verweis auf sie in „Meine Aufträge“",
  ).toBeTruthy();
  const aufgabeId = href!.replace("/a/", "");

  // 2. VERTEILEN MIT ZEITVORSCHLAG — Rike, Koordination, an Carla.
  await wechsleRolle(page, {
    host: HOST,
    groups: GRUPPE,
    email: "rike@localtest.me",
    callbackPath: "/verteilen",
  });
  await page.goto(`http://${HOST}:3100/verteilen`);
  await page.getByTestId(`verteilen-${aufgabeId}`).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Carla").check();
  await page.locator("#vd-vorschlag-datum").fill(vorschlagDatum);
  await page.locator("#vd-vorschlag-uhrzeit").fill("09:00");
  await klickeUndWarteAufSeite(page, () =>
    page.getByRole("dialog").getByRole("button", { name: "Verteilen" }).click(),
  );
  // DER DIALOG SCHLIESST SICH VON SELBST (`VerteilenDialog.tsx`s Kopfkommentar): das ist der
  // eigentliche Beleg, dass die Aufgabe `status: "eingegangen"` verlassen hat — kein zweiter,
  // separat gepflegter Zustand, der auseinanderlaufen koennte.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId(`verteilen-${aufgabeId}`)).toHaveCount(0);

  // 3. ANNEHMEN — Carla, BuFDi, uebernimmt den Zeitvorschlag unveraendert.
  await wechsleRolle(page, {
    host: HOST,
    groups: GRUPPE,
    email: "carla@localtest.me",
    callbackPath: "/",
  });
  const posteingangZeile = page.locator("#posteingang li").filter({ hasText: titel });
  await expect(posteingangZeile).toHaveCount(1);
  const annehmenKnopf = posteingangZeile.getByRole("button", { name: /^Annehmen:/ });
  await expect(annehmenKnopf).toBeVisible();
  await klickeUndWarteAufSeite(page, () => annehmenKnopf.click());
  // DIE AUFGABE VERLAESST DEN POSTEINGANG: `wartetAufEinplanung` verlangt `planDatum === null`,
  // und das ist nach „Annehmen" nicht mehr wahr — der eigentliche Beleg, kein Knopftext.
  await expect(page.locator("#posteingang").getByText(titel)).toHaveCount(0);

  // 4. BEARBEITUNG STARTEN — Carla, auf der Detailseite.
  await page.goto(`http://${HOST}:3100/a/${aufgabeId}`);
  await expect(page.getByRole("heading", { name: titel, level: 1 })).toBeVisible();
  await klickeUndWarteAufSeite(page, () =>
    page.getByRole("button", { name: "Bearbeitung starten" }).click(),
  );
  await expect(page.getByText("In Bearbeitung")).toBeVisible();

  // 5. FERTIG MELDEN MIT BILDNACHWEIS — WARMLAUF ZUERST (Lektion 1: Turbopack-Kompilierfenster,
  // dasselbe Bild wie `oeffneNachweisAufgabe` oben), DANN DIE ANTWORT DES UPLOADS SELBST PRUEFEN
  // (Lektion 2, dasselbe Bild wie `sendeNachweis` oben) — statt nur auf einen spaeteren
  // Zustandswechsel zu warten.
  const warmlauf = await page.request.get(`http://${HOST}:3100/a/${aufgabeId}/nachweis/hochladen`);
  expect(warmlauf.status(), await warmlauf.text()).toBe(405);

  await page
    .locator("#nf-datei")
    .setInputFiles({ name: "rundlauf.png", mimeType: "image/png", buffer: PNG });
  const [uploadAntwort] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/nachweis/hochladen")),
    page.getByRole("button", { name: "Nachweis speichern" }).click(),
  ]);
  expect(
    uploadAntwort.ok(),
    `Upload abgelehnt: HTTP ${uploadAntwort.status()} — ${await uploadAntwort.text()}`,
  ).toBe(true);

  await wartenAufNachweisStatus(page, async () => (await page.getByTestId("nachweis-bild").count()) > 0);

  await klickeUndWarteAufSeite(page, () =>
    page.getByRole("button", { name: "Fertig melden" }).click(),
  );
  await expect(page.getByText("Freigabe offen")).toBeVisible();

  // 6. FREIGEBEN — zurueck zu Malte: Auftraggeber UND (weil keine Selbstaufgabe) automatisch der
  // eingetragene Pruefer (s. Kopfkommentar).
  await wechsleRolle(page, {
    host: HOST,
    groups: GRUPPE,
    email: "malte@localtest.me",
    callbackPath: "/",
  });
  await page.goto(`http://${HOST}:3100/a/${aufgabeId}`);
  await klickeUndWarteAufSeite(page, () => page.getByTestId(`freigeben-${aufgabeId}`).click());
  // `exact: true`, NICHT nur `getByText("Abgeschlossen")` (gefunden beim ersten Lauf): das Journal
  // traegt seit `abgeschlossen` NUN AUCH eine Verlaufszeile, deren Text "Abgeschlossen" ALS
  // TEILSTRING enthaelt ("... — Abgeschlossen", `EREIGNIS_TEXT`) — ohne `exact` waere die Abfrage
  // seit genau diesem Schritt mehrdeutig (Strict-Mode-Fehler), der Status-Chip ist aber der einzige
  // Treffer mit GENAU diesem Text.
  await expect(page.getByText("Abgeschlossen", { exact: true })).toBeVisible();
});
