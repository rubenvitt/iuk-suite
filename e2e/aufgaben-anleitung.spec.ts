import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { AUFGABEN_KOORDINATION_GRUPPE, AUFGABEN_ZUGANG_GRUPPE } from "./helpers/aufgaben";

const HOST = "aufgaben.localtest.me";
const GRUPPE = AUFGABEN_ZUGANG_GRUPPE;
const KOORDINATION = `${AUFGABEN_ZUGANG_GRUPPE},${AUFGABEN_KOORDINATION_GRUPPE}`;

/*
 * DIE BEDIENUNGSANLEITUNG IM ECHTEN ABRUF (`/hilfe`, `/hilfe/<sicht>`).
 *
 * WARUM DIESE DATEI UEBERHAUPT EXISTIERT, OBWOHL `_lib/hilfe.test.ts` DIE INHALTE SCHON PRUEFT:
 * die Anleitungsseiten sind neue SERVER COMPONENTS mit eigenem SVG-Baum, und genau dort liegen die
 * Fallen, die `typecheck`, `lint`, `build` UND Vitest allesamt gruen lassen — Compound-Zugriff auf
 * antd (Falle 1), ein Wert aus einem `"use client"`-Modul (Falle 6), `@ant-design/icons` in RSC
 * (Falle 7) und eine Funktion ueber die RSC-Grenze (Falle 9). Nur ein echter Abruf zeigt den
 * HTTP 500. Dieselbe Begruendung wie im Kopf von `e2e/aufgaben.spec.ts`, hier fuer die zweite
 * Seitenfamilie des Moduls.
 *
 * DIE ZWEITE, EIGENSTAENDIGE ZUSAGE IST DIE BREITE: die Bilder sind SVG mit fester `viewBox`, und
 * die Uebergangstabelle hat vier Spalten. Beides sind Formen, die ein Dokument seitwaerts schieben
 * koennen, ohne dass irgendein Quelltext-Scan es saehe (`docs/design/README.md`, „Tests fuer
 * Responsives": der Scan besitzt die Regel, der Browser das Ergebnis).
 */

/** Die Kapitel, die eine BuFDi bekommt — dieselbe Menge, die `hilfeSichten` liefert. */
const BUFDI_KAPITEL = [
  { pfad: "meine-woche", titel: "Meine Woche" },
  { pfad: "einstellen", titel: "Aufgabe einstellen" },
  { pfad: "routinen", titel: "Routinen" },
  { pfad: "zeitplan", titel: "Zeitplan" },
  { pfad: "aufgabe", titel: "Die einzelne Aufgabe" },
  { pfad: "archiv", titel: "Archiv" },
];

test("Anleitung: /hilfe antwortet mit 200, zeigt die eigenen Kapitel und bleibt fehlerfrei", async ({
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
    callbackPath: "/hilfe",
  });

  await expect(page.getByRole("heading", { name: "Anleitung", level: 1 })).toBeVisible();
  /*
   * DER ROLLENABSCHNITT STEHT VOR DEM VERZEICHNIS und ist fuer JEDE Rolle derselbe: er beantwortet
   * „wer macht hier was", bevor die Frage „welche Seiten gibt es" ueberhaupt aufkommt.
   */
  for (const rolle of ["Auftraggeber", "Koordinatorin", "Auftragnehmer"]) {
    await expect(page.getByRole("heading", { name: rolle, level: 3 })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /Vier Stationen/ })).toBeVisible();
  for (const kapitel of BUFDI_KAPITEL) {
    await expect(page.getByRole("heading", { name: kapitel.titel, level: 3 })).toBeVisible();
  }
  // Die Koordinationskapitel stehen NICHT da — die Auswahl kommt aus denselben Praedikaten wie
  // die Navigation (Spec §7).
  await expect(page.getByRole("heading", { name: "Verteilen", level: 3 })).toHaveCount(0);
  // Das gemeinsame Vokabular: das Lebenszyklusbild samt Tabelle steht auf der Uebersicht.
  await expect(page.getByRole("img", { name: /Lebenszyklus|Weg einer Aufgabe/ })).toBeVisible();
  expect(konsolenFehler).toEqual([]);
});

/*
 * DIE ABGEBROCHENE SITZUNGSABFRAGE — GEMESSEN IN DER CI (Lauf 31949360333, Shard 1), NICHT
 * VERMUTET, UND SIE GEHOERT ZUR FAMILIE VON FALLE 10 (`CLAUDE.md`).
 *
 * `SessionProvider` (next-auth) ruft beim Aufbau JEDER Seite `getSession()`. Der Durchlauf unten
 * blaettert sechs Kapitel am Stueck durch; `page.goto()` kehrt nach `load` zurueck, waehrend diese
 * Abfrage noch laeuft — das naechste `goto` bricht sie ab, und der Browser meldet
 * `ClientFetchError: Failed to fetch` auf die Konsole. Gemessen: 38 solcher Zeilen bei sechs
 * Wechseln, alle mit identischem Stapel, waehrend jeder EINZELNE Abruf derselben Seiten
 * fehlerfrei bleibt (die anderen Tests dieser Datei pruefen genau das).
 *
 * ZWEI MASSNAHMEN, UND BEIDE BRAUCHT ES: `waitForLoadState("networkidle")` nach jedem Wechsel
 * laesst die Abfrage zu Ende laufen, statt sie zu provozieren — das allein reicht aber nicht,
 * weil unter Last auch eine bereits laufende Abfrage noch in den Abbruch geraten kann. Der Filter
 * daneben nimmt GENAU DIESE Signatur heraus und laesst jede andere Konsolenzeile toedlich: eine
 * Meldung, die den Abbruch einer Sitzungsabfrage beschreibt, ist eine Aussage ueber den
 * Testablauf, keine ueber die Seite.
 *
 * WAS DAMIT NICHT MEHR GEPRUEFT WIRD, AUSGESCHRIEBEN: ein echter Ausfall des Sitzungsabrufs auf
 * einer Anleitungsseite bliebe hier unbemerkt. Er kann es nicht lange bleiben — jede andere Datei
 * dieser Suite meldet sich sofort, weil ohne Sitzung keine Modulseite mehr rendert.
 */
const ABGEBROCHENE_SITZUNGSABFRAGE = /ClientFetchError|Failed to fetch/;

test("Anleitung: jedes Kapitel einer BuFDi rendert — Skizze, Schritte, Grenzen", async ({ page }) => {
  const konsolenFehler: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ABGEBROCHENE_SITZUNGSABFRAGE.test(msg.text())) {
      konsolenFehler.push(msg.text());
    }
  });
  page.on("pageerror", (err) => konsolenFehler.push(err.message));

  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/hilfe",
  });

  for (const kapitel of BUFDI_KAPITEL) {
    const antwort = await page.goto(`http://${HOST}:3100/hilfe/${kapitel.pfad}`);
    expect(antwort?.status(), kapitel.pfad).toBe(200);
    // Erst die Seite fertig werden lassen, dann weiterblaettern (s. Kommentar oben).
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: kapitel.titel, level: 1 })).toBeVisible();
    // Die Szene steht vor allem anderen — sie ist der Anknuepfungspunkt, nicht Zierrat.
    await expect(page.locator("p").first()).not.toBeEmpty();
    await expect(page.getByRole("heading", { name: "Aufbau der Sicht" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schritt für Schritt" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Was hier nicht geht — und warum" })).toBeVisible();
    // Die Layoutskizze ist ein echtes Bild mit Beschreibung, kein dekoratives SVG.
    await expect(page.getByRole("img", { name: /Aufbau der Sicht/ })).toBeVisible();
  }
  expect(konsolenFehler).toEqual([]);
});

/*
 * DIE VERDRAHTUNG IM BETRIEB: der Verweis steht auf der Flaeche, nicht nur im Verzeichnis — die
 * Frage entsteht vor der Sicht, nicht im Inhaltsverzeichnis. `_lib/hilfe.test.ts` haelt per
 * Quelltext-Scan fest, dass JEDE Sicht ein `hilfe="…"` traegt; hier wird EIN Weg wirklich geklickt.
 */
test("Anleitung: der Verweis auf einer Sicht fuehrt in ihr Kapitel und wieder zurueck", async ({
  page,
}) => {
  await devLogin(page, {
    host: HOST,
    groups: GRUPPE,
    email: "alina@localtest.me",
    callbackPath: "/routinen",
  });

  /*
   * UEBER DAS ZIEL ADRESSIERT, NICHT UEBER DIE AUFSCHRIFT: seit dem Navigationseintrag
   * „Anleitung" (`_lib/nav.ts`) gibt es auf jeder Seite ZWEI Verweise mit diesem Namen — den der
   * Shell (auf `/hilfe`) und den des Seitenkopfs (auf das Kapitel DIESER Sicht). Ein
   * `getByRole("link", { name: "Anleitung" }).first()` faende den der Shell, und der Test bewiese
   * das Gegenteil dessen, was er behauptet.
   */
  await page.locator('a[href="/hilfe/routinen"]').click();
  await expect(page).toHaveURL(/\/hilfe\/routinen$/);
  await expect(page.getByRole("heading", { name: "Routinen", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Sicht öffnen" }).first().click();
  await expect(page).toHaveURL(/\/routinen$/);
});

test("Anleitung: die Koordination bekommt ihre eigenen Kapitel", async ({ page }) => {
  await devLogin(page, {
    host: HOST,
    groups: KOORDINATION,
    email: "rike@localtest.me",
    callbackPath: "/hilfe",
  });

  await expect(page.getByRole("heading", { name: "Verteilung", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personenverwaltung", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meine Woche", level: 3 })).toHaveCount(0);
});

/*
 * KEIN WAAGERECHTES SCROLLEN — DIE ZUSAGE, DIE NUR DER BROWSER GEBEN KANN.
 *
 * 360px ist die schmalste Breite, die das Modul bedienen soll (dieselbe Zahl wie der
 * 360px-Sweep in `e2e/aufgaben.spec.ts`). Geprueft werden die zwei Formen, die sie brechen
 * koennten: die Uebersicht (Kartengitter plus Bild) und das Kapitel `aufgabe` (die vierspaltige
 * Uebergangstabelle unter dem Lebenszyklusbild).
 */
for (const seite of [
  { label: "Übersicht", pfad: "/hilfe" },
  { label: "Kapitel mit Übergangstabelle", pfad: "/hilfe/aufgabe" },
  { label: "Kapitel mit Wochenachse", pfad: "/hilfe/meine-woche" },
]) {
  test(`Anleitung bei 360px: ${seite.label} laeuft nicht ueber`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await devLogin(page, {
      host: HOST,
      groups: GRUPPE,
      email: "alina@localtest.me",
      callbackPath: seite.pfad,
    });
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ueberlauf, `${seite.label} schiebt das Dokument um ${ueberlauf}px seitwaerts`).toBeLessThanOrEqual(0);
  });
}
