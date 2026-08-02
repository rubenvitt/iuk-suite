import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";

import { inboxFiles, shareFiles, shares, zugangslinks } from "@/app/m/files/_db/schema";
import { erzeugeToken, tokenHash } from "@/app/m/files/_lib/token";
import { devLogin } from "./fixtures";
import { setzeAvModus } from "./helpers/avModus";
import { decodeQrPng } from "./helpers/decode-qr";

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
 * DIESE DATEI ERBT KEINEN ZUSTAND VOM SEED. Die Punkte 1-6 brauchen ueberhaupt
 * keinen — sie sind Aussagen ueber Rolle und Riegel, nicht ueber Daten;
 * `e2e/files-fileshare.spec.ts` laeuft in Pfadreihenfolge VOR dieser Datei
 * (`workers: 1`, eine geteilte Datenbank je Lauf) und legt Freigaben an, eine
 * Zusicherung auf den Leerzustand der Uebersicht waere hier deshalb allein gruen
 * und in der Suite rot (`docs/design/README.md:214-220`); den Leerzustand
 * besitzt der DOM-Test in `_ui/SharesUebersicht.test.tsx` (T36).
 *
 * DIE HOST-ABNAHME (T44, Punkte 7-10 unten) STELLT IHREN ZUSTAND SELBST HER,
 * und zwar in JEDEM Test einzeln: eine Freigabe mit einer freigegebenen Datei
 * samt Blob, einen Abgabelink. Der Grund ist derselbe wie oben — ein Test, der
 * „hier liegt eine Freigabe" von einer frueher laufenden Datei erbt, ist
 * entweder allein gruen oder in der Suite gruen, nie beides. Gesaet wird
 * DIREKT (Drizzle + Datei), nicht ueber die Oberflaeche: die 404-Zusage der
 * dreizehn Handler haengt nicht daran, WIE eine Zeile entstanden ist, und ein
 * Upload ueber die Insel zoege die Warteschlange, den Fake-Scanner und die
 * Chunk-Schleife in einen Test, der von all dem nichts behauptet.
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

test("3 — Inbox-Host: ein Verwaltungspfad antwortet 404, derselbe Pfad auf dem Verwaltungs-Host aber nicht", async ({
  page,
}) => {
  /*
   * T44 PUNKT 3. Seit T35 steht hinter `/shares/neu` eine echte Seite, der 404
   * kommt also nicht mehr aus der Abwesenheit der Route, sondern aus
   * `requireRolle("verwaltung")` in `(verwaltung)/layout.tsx` — das ist die
   * Mutation, die dieser Punkt faengt.
   *
   * DIE ZWEITE HAELFTE IST DIE, DIE DEN PUNKT TRAEGT. „404 auf dem fremden
   * Host" allein bliebe auch dann gruen, wenn der Pfad falsch geschrieben, die
   * Route umbenannt oder das Modul gar nicht aufgeloest waere — dann prueft der
   * Test die Rechtschreibung und nicht den Riegel. Erst der ANGEMELDETE Abruf
   * auf dem Verwaltungs-Host, der 200 liefert, macht aus dem 404 eine Aussage
   * ueber die ROLLE. Damit ist die Gegenrichtung („eine Verwaltungsseite auf der
   * Abgabe-Domain") strukturell unmoeglich, und dass sie es ist, steht hier.
   */
  const aufInbox = await page.goto(`${I}/shares/neu`);
  expect(aufInbox?.status()).toBe(404);
  await expect(page.getByTestId("files-neue-freigabe")).toHaveCount(0);

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const aufVerwaltung = await page.goto(`${V}/shares/neu`);
  expect(aufVerwaltung?.status()).toBe(200);
  await expect(page.getByTestId("files-neue-freigabe")).toBeVisible();
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
 * ═══════════════════════════════════════════════════════════════════════════
 * T44 — DIE HOST-ABNAHME (Plan T44, Spec §3.2, §8.7, §10.2)
 *
 * ABNAHME-TESTS, KEINE TDD-TESTS (Kopfregel des Plans): in Welle 8a existieren
 * alle Endpunkte, und die Zusage von T27-T34, T49 und T51 ist erfuellt — diese
 * vier Punkte sind von Anfang an gruen, und das ist richtig. Wer fuer sie
 * kuenstlich Rot herstellte, braeche funktionierenden Code auf. Gemessen werden
 * sie an ihrer MUTATION, und die steht bei jedem Punkt einzeln.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * DER PFAD STEHT AUSGESCHRIEBEN UND KOMMT NICHT AUS `moduleDbPath()` bzw.
 * `_lib/storage.ts`.
 *
 * `DATA_DIR=./.data/e2e` setzt `playwright.config.ts` in `webServer.env` — das
 * erreicht ausschliesslich den SERVERprozess. Im Testprozess ist die Variable
 * nicht gesetzt, `moduleDbPath("files")` liefe also auf `./.data/files.db` und
 * `ablageWurzel()` auf `./.data/files`: der Test saete in die ENTWICKLUNGS-
 * datenbank, der Server laese andere Dateien, und jede Freigabe waere
 * „unbekannt" — ein Fehlschlag, der wie ein Defekt der Route aussieht. Dieselbe
 * Begruendung wie in `e2e/files-inbox.spec.ts`.
 */
const DB_PFAD = "./.data/e2e/files.db";
/** `<DATA_DIR>/files/<shareId>/<fileId>` (Spec §5.1, `_lib/storage.ts`). */
const ABLAGE_WURZEL = "./.data/e2e/files";

/** Acht Bytes PNG-Signatur plus Rest — mehr braucht `signaturTyp` nicht. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

function db(): ReturnType<typeof drizzle> {
  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — laeuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);
  const sqlite = new Database(DB_PFAD);
  // Derselbe Wartewert wie in `core/db`: der Serverprozess haelt dieselbe Datei
  // offen, und ohne ihn scheitert ein Schreibversuch sofort mit SQLITE_BUSY.
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite);
}

/**
 * Eine Freigabe mit GENAU EINER freigegebenen Datei und dem Blob dazu.
 *
 * `nanoid(10)` fuer BEIDE Kennungen, nicht ein sprechendes `e2e-share-1`:
 * `_lib/storage.ts` prueft jede ID gegen das nanoid-Muster, BEVOR sie ein Pfad
 * wird (`pruefeId`), und wirft sonst `UngueltigeId` — das saehe wie ein Defekt
 * der Ablage aus und waere ein Defekt des Tests.
 *
 * `av_status = 'clean'` und `bytes_vollstaendig_at` gesetzt, damit die
 * Byte-Routen auf ihrem EIGENEN Host 200 liefern. Das ist die staerkere Haelfte
 * der Gegenprobe unten: ein 403 („wird geprueft") wuerde die 404-Aussage zwar
 * auch tragen, aber ein Weg, der ueberhaupt Bytes liefert, schliesst mehr
 * Irrtuemer aus.
 */
function legeFreigabeAn(titel: string): { shareId: string; fileId: string } {
  const shareId = nanoid(10);
  const fileId = nanoid(10);
  const jetzt = new Date();

  const verbindung = db();
  verbindung
    .insert(shares)
    .values({
      id: shareId,
      title: titel,
      description: null,
      type: "file",
      // Drizzle rechnet die Einheit um: die Spalten fuehren Unix-SEKUNDEN
      // (`mode: "timestamp"`), nicht Millisekunden wie im Modul `qr`. Ein
      // `Date.now()` in der Spalte waere ein Faktor-1000-Fehler und laege rund
      // 55.000 Jahre in der Zukunft — der Test bliebe gruen.
      expiresAt: new Date(jetzt.getTime() + 24 * 60 * 60 * 1000),
      maxDownloads: null,
      downloadCount: 0,
      passwordHash: null,
      totalSize: PNG.length,
      createdAt: jetzt,
      createdBy: "e2e",
    })
    .run();
  verbindung
    .insert(shareFiles)
    .values({
      id: fileId,
      shareId,
      filename: "host-abnahme.png",
      mimeType: "image/png",
      size: PNG.length,
      createdAt: jetzt,
      bytesVollstaendigAt: jetzt,
      avStatus: "clean",
      avGeprueftAt: jetzt,
    })
    .run();

  mkdirSync(join(ABLAGE_WURZEL, shareId), { recursive: true });
  writeFileSync(join(ABLAGE_WURZEL, shareId, fileId), PNG);

  return { shareId, fileId };
}

/**
 * Ein gueltiger Abgabelink — ueber Drizzle, nicht ueber
 * `zugangslinkAnlegenAction` (die verlangt eine angemeldete Sitzung und ist aus
 * einem Playwright-Prozess nicht aufrufbar).
 *
 * GROSSZUEGIGES BUDGET mit Absicht: der Test unten schickt einen `PUT` auf den
 * Upload-Weg, und bei erschoepftem Kontingent antwortete der mit 429, BEVOR er
 * den Offset auswertet — die Gegenprobe „auf dem eigenen Host kein 404" waere
 * dann zwar noch gruen, aber aus dem falschen Grund.
 */
function legeAbgabelinkAn(name: string): string {
  const token = erzeugeToken();
  const jetzt = new Date();
  db()
    .insert(zugangslinks)
    .values({
      id: nanoid(10),
      name,
      tokenStart: token.slice(0, 7),
      tokenHash: tokenHash(token),
      createdAt: jetzt,
      createdBy: "e2e",
      expiresAt: new Date(jetzt.getTime() + 24 * 60 * 60 * 1000),
      revokedAt: null,
      budgetDateien: 50,
      budgetBytes: 50 * 1024 * 1024,
    })
    .run();
  return token;
}

/**
 * Eine Zeile im Posteingang, damit `/posteingang` seine LISTE zeigt und nicht
 * den Leerzustand. Ohne sie haenge Punkt 4 am Erfolg von Punkt 8 — und ein Test,
 * der seinen Zustand von einem frueheren erbt, ist entweder allein gruen oder in
 * der Suite gruen, nie beides.
 */
function legeInboxDateiAn(name: string): string {
  const id = nanoid(10);
  const jetzt = new Date();
  db()
    .insert(inboxFiles)
    .values({
      id,
      tokenId: null,
      dateiname: name,
      kategorie: "dokumente",
      hinweis: "T44 Linkpruefung",
      mimeType: "image/png",
      size: PNG.length,
      clientIpUnbestaetigt: null,
      empfangenAt: jetzt,
      bytesVollstaendigAt: jetzt,
      avStatus: "clean",
      avGeprueftAt: jetzt,
    })
    .run();
  mkdirSync(join(ABLAGE_WURZEL, "inbox"), { recursive: true });
  writeFileSync(join(ABLAGE_WURZEL, "inbox", id), PNG);
  return id;
}

type HandlerFall = {
  /** Wie in §1 des Plans geschrieben — die Liste ist dort namentlich. */
  name: string;
  methode: "GET" | "POST" | "PUT" | "DELETE";
  pfad: string;
  /** Der Host, dem diese Methode gehoert. */
  eigen: string;
  /** Der andere. Genau hier muss 404 stehen. */
  fremd: string;
};

test("7 — T44 Punkt 1: alle DREIZEHN Handler-Methoden antworten auf dem fremden Host 404 — und auf ihrem eigenen nicht", async ({
  request,
}) => {
  /*
   * WARUM DIESER PUNKT ALLEIN STEHT, obwohl die Layouts oben schon gemessen
   * sind: ROUTE HANDLER HABEN KEIN LAYOUT. Die Rollensperre der Route-Groups
   * erreicht sie nicht, sie ist in jedem Handler die erste Anweisung — und
   * `core/routing.ts:57-67` laesst den internen `/m/<key>`-Pfad bei
   * `requiresAuth: false` UNGEGATET durch (`if (target.requiresAuth && groups
   * === null)` greift nicht, `canAccess` steigt mit `true` aus). Ohne diese
   * dreizehn Pruefungen waere `PUT /m/files/api/u/<token>/upload` ueber JEDEN
   * Host erreichbar, dessen `moduleForHost` auf `files` zeigt. Genau diese
   * Sperre verlangt E15 (d) fuer das Fenster zwischen den beiden Cutovern, in
   * dem das Alt-Pendant noch live ist.
   *
   * DREIZEHN UND NICHT ZEHN: die Sperre gehoert der METHODE, nicht der Datei.
   * `api/upload/[fileId]` exportiert `PUT`, `GET` und `DELETE`,
   * `api/u/[token]/upload` `PUT` und `POST` — jede Methode hat eigenen Code,
   * also braucht jede ihre eigene Pruefung; eine Methode ohne eigene Pruefung
   * ist eine Sperre, die fuer sie NICHT GILT. Die Rechnung steht in §1 des
   * Plans.
   *
   * ANONYM (`request`-Fixture, nicht `page.request`): die Rollensperre ist die
   * ERSTE Anweisung und liegt damit vor jedem `requireFilesAccess()`. Eine
   * angemeldete Sitzung koennte den Unterschied zwischen „Host falsch" und
   * „Zugang fehlt" gar nicht mehr zeigen.
   */
  const { shareId, fileId } = legeFreigabeAn("T44 Host-Abnahme");
  const token = legeAbgabelinkAn("T44 Host-Abnahme");
  // Syntaktisch gueltige, aber unbelegte Kennungen: die beiden Posteingangs-
  // Routen entscheiden ueber Host und Zugang, BEVOR sie eine Zeile suchen.
  const inboxId = nanoid(10);

  const FAELLE: HandlerFall[] = [
    { name: "s/[id]/verify POST", methode: "POST", pfad: `/api/s/${shareId}/verify`, eigen: V, fremd: I },
    { name: "s/[id]/qr.png GET", methode: "GET", pfad: `/api/s/${shareId}/qr.png`, eigen: V, fremd: I },
    { name: "download/[id] GET", methode: "GET", pfad: `/api/download/${shareId}`, eigen: V, fremd: I },
    { name: "download/[id]/zip GET", methode: "GET", pfad: `/api/download/${shareId}/zip`, eigen: V, fremd: I },
    { name: "preview/[id] GET", methode: "GET", pfad: `/api/preview/${shareId}`, eigen: V, fremd: I },
    { name: "upload/[fileId] PUT", methode: "PUT", pfad: `/api/upload/${fileId}?ab=0`, eigen: V, fremd: I },
    { name: "upload/[fileId] GET", methode: "GET", pfad: `/api/upload/${fileId}`, eigen: V, fremd: I },
    { name: "upload/[fileId] DELETE", methode: "DELETE", pfad: `/api/upload/${fileId}`, eigen: V, fremd: I },
    { name: "u/[token]/upload PUT", methode: "PUT", pfad: `/api/u/${token}/upload`, eigen: I, fremd: V },
    { name: "u/[token]/upload POST", methode: "POST", pfad: `/api/u/${token}/upload`, eigen: I, fremd: V },
    { name: "u/[token]/qr.png GET", methode: "GET", pfad: `/api/u/${token}/qr.png`, eigen: I, fremd: V },
    { name: "inbox/[id] GET", methode: "GET", pfad: `/api/inbox/${inboxId}`, eigen: V, fremd: I },
    { name: "inbox/zip GET", methode: "GET", pfad: `/api/inbox/zip?ids=${inboxId}`, eigen: V, fremd: I },
  ];

  /*
   * DIE ZAHL IST DIE ZUSAGE, nicht die Anwesenheit der Schleife: eine
   * gestrichene Zeile schrumpfte den Lauf sonst STILL, und „zwoelf von dreizehn
   * gesperrt" sieht in der Ausgabe genauso gruen aus wie dreizehn.
   */
  expect(FAELLE).toHaveLength(13);

  for (const fall of FAELLE) {
    const erwarteterPfad = new URL(fall.pfad, "http://x").pathname;

    const fremd = await request.fetch(`${fall.fremd}${fall.pfad}`, { method: fall.methode });
    expect(fremd.status(), `${fall.name} auf dem FREMDEN Host`).toBe(404);
    /*
     * KEIN UMWEG ueber `/login`. Sechs der dreizehn Methoden rufen nach der
     * Rollensperre `requireFilesAccess()`, und das leitet einen ANONYMEN
     * Aufruf um (gemessen: 307). `APIResponse.url()` ist die Adresse NACH allen
     * Weiterleitungen — bliebe die Sperre weg und antwortete die Anmeldeseite
     * auf diesem Host zufaellig selbst mit 404, waere die Zusicherung darueber
     * gruen, ohne irgendetwas zu pruefen. Diese Zeile schliesst das aus, ohne
     * sich auf die Semantik von `maxRedirects` zu verlassen.
     */
    expect(new URL(fremd.url()).pathname, `${fall.name}: Umweg statt 404`).toBe(erwarteterPfad);

    /*
     * DIE GEGENPROBE, und sie ist der Grund, warum dieser Punkt ueberhaupt
     * etwas besitzt: „404 auf dem fremden Host" ist auch dann erfuellt, wenn
     * der Pfad falsch geschrieben ist, die Datei anders heisst oder das Modul
     * gar nicht aufgeloest wird. Erst „auf dem EIGENEN Host ist es KEIN 404"
     * macht daraus eine Aussage ueber die Rolle. Bewusst nur „nicht 404" und
     * kein bestimmter Code: die dreizehn Methoden antworten auf ihrem Host
     * voellig verschieden (200 Bytes, 400 fehlender Offset, 401 falsches
     * Passwort, 409 Altweg, Weiterleitung in die Anmeldung) — eine Liste
     * erwarteter Codes waere eine zweite Zusage, die diesem Test nicht gehoert.
     */
    const eigen = await request.fetch(`${fall.eigen}${fall.pfad}`, { method: fall.methode });
    expect(eigen.status(), `${fall.name} auf dem EIGENEN Host`).not.toBe(404);
  }
});

test("8 — T44 Punkt 2: ein auf dem Verwaltungs-Host erzeugter Abgabelink traegt die Abgabe-Domain MIT Port — und der Test folgt ihm bis in den Posteingang", async ({
  page,
  browser,
}) => {
  /*
   * DIE NICHT-TRIVIALE RICHTUNG (Analyse-Falle 17): die Erzeugung sitzt auf dem
   * EINEN Host, die Nutzlast muss den ANDEREN tragen. Ein Stringvergleich auf
   * den Hostnamen waere die schwaechere Haelfte — deshalb wird dem Link
   * WOERTLICH gefolgt, so wie er im Markup steht, und nicht ein
   * `${I}/u/${token}` nachgebaut: ein nachgebauter Link prueft nichts ueber den
   * Link.
   *
   * UND DER PORT GEHOERT ZUR ZUSAGE. `http://drop.localtest.me/u/<token>`
   * „enthaelt drop.localtest.me" ebenfalls und ist lokal unerreichbar;
   * `validateHostConfig` weist jeden `SUITE_HOST_*`-Wert mit `:` ab, der Host
   * aus der Rolle ist also immer portlos, und den Port muss `oeffentlicheUrl`
   * aus dem Request nehmen (T9). Genau dafuer steht das Praefix unten
   * ausgeschrieben statt als `toContain`.
   */
  setzeAvModus("ok");

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE, callbackPath: "/zugangslinks" });
  await page.goto(`${V}/zugangslinks`);
  await expect(page.getByTestId("files-zugangslinks")).toBeVisible();

  const bezeichnung = `T44 Hostwechsel ${Date.now()}`;
  await page.getByTestId("files-zugangslink-anlegen").click();
  await page.locator('input[name="name"]').fill(bezeichnung);
  await page.locator('input[name="laufzeitStunden"]').fill("24");
  await page.getByTestId("files-zugangslink-absenden").click();

  const ausgabe = page.getByTestId("files-zugangslink-ausgabe");
  await expect(ausgabe).toBeVisible({ timeout: 30_000 });

  const adresse = await page.getByTestId("files-zugangslink-link").getAttribute("href");
  expect(adresse, "die einmalige Ausgabe traegt keinen Link").not.toBeNull();
  const INBOX_PRAEFIX = `http://${INBOX}:3100/u/`;
  expect(adresse!.startsWith(INBOX_PRAEFIX), `Link ohne Abgabe-Domain und Port: ${adresse}`).toBe(
    true,
  );

  /*
   * DIE QR-NUTZLAST WIRD ZURUECKDEKODIERT, nicht am `src` abgelesen. Die
   * Adresse des Bildes und der Inhalt des Codes sind zwei verschiedene Dinge:
   * die Route baut die Nutzlast selbst aus `oeffentlicheUrl("inbox", …)`, und
   * ein QR mit dem VERWALTUNGS-Host darin saehe auf dem Bildschirm exakt gleich
   * aus. Gedruckt ist gedruckt — der Fehler faellt erst auf, wenn jemand einen
   * verteilten Aushang scannt.
   *
   * Ueber `page.request`, nicht ueber die anonyme `request`-Fixture: die Route
   * ist gegatet (§8.7), und das Sitzungs-Cookie sitzt ueber
   * `AUTH_COOKIE_DOMAIN` auf der gemeinsamen Elterndomain — deshalb erreicht es
   * auch `drop.localtest.me`.
   */
  const qrAdresse = await page.getByTestId("files-zugangslink-qr").getAttribute("src");
  expect(qrAdresse, "die einmalige Ausgabe traegt kein QR-Bild").not.toBeNull();
  const qrAntwort = await page.request.get(qrAdresse!);
  expect(qrAntwort.status(), "der QR-Abruf auf der Abgabe-Domain").toBe(200);
  expect(await decodeQrPng(Buffer.from(await qrAntwort.body()))).toBe(adresse);

  /*
   * DEM LINK FOLGEN — in einem EIGENEN, ANONYMEN Kontext. Die Abgabe ist der
   * Weg des fremden Handys; in der angemeldeten Sitzung weiterzuklicken wuerde
   * die Zusage „ohne Anmeldung" stillschweigend uebergehen.
   */
  const anonym = await browser.newContext();
  const dateiname = `t44-hostwechsel-${Date.now()}.txt`;
  const inhalt = "Abgabe ueber den auf dem Verwaltungs-Host erzeugten Link.\n";
  try {
    const handy = await anonym.newPage();
    const abgabe = await handy.goto(adresse!);
    expect(abgabe?.status(), "der erzeugte Link ist nicht erreichbar").toBe(200);
    await expect(handy.getByTestId("files-abgabe")).toBeVisible();

    await handy.locator("#abgabe-hinweis").fill("T44 Host-Abnahme");
    // Eine ECHTE Radiogruppe: `check()` wuerde an einer Knopfreihe scheitern.
    await handy.locator('input[type="radio"][value="dokumente"]').check();
    await handy
      .locator("#abgabe-dateien")
      .setInputFiles([
        { name: dateiname, mimeType: "text/plain", buffer: Buffer.from(inhalt, "utf8") },
      ]);
    await handy.getByTestId("abgabe-absenden").click();
    await expect(handy.getByTestId("eintrag-quittung")).toHaveCount(1, { timeout: 30_000 });
  } finally {
    await anonym.close();
  }

  // ZURUECK AUF DEM ANDEREN HOST: der Posteingang liegt in `(verwaltung)` und
  // ist unter `drop.…` ein 404 — dass die Abgabe von DORT hier ankommt, ist die
  // Aussage.
  await page.goto(`${V}/posteingang`);
  const zeile = page
    .locator("tbody.ant-table-tbody tr.ant-table-row")
    .filter({ hasText: dateiname });
  await expect(zeile).toHaveCount(1);
  // Und der Abgabelink, an dem sie haengt — sonst waere „im Posteingang" auch
  // fuer eine Abgabe ueber irgendeinen anderen Link erfuellt.
  await expect(zeile).toContainText(adresse!.slice(INBOX_PRAEFIX.length, INBOX_PRAEFIX.length + 7));
});

test("9 — T44 Punkt 4: keine Verwaltungsseite traegt einen RELATIVEN `/u/`-Link", async ({
  page,
}) => {
  /*
   * DIE GEGENPROBE DER PRUEFFRAGE „fuehrt kein Weg dorthin, wo die aufrufende
   * Person nicht hindarf?" (`docs/design/README.md`): ein relativer `/u/`-Link
   * waere auf dem Verwaltungs-Host eine 404-Sackgasse — die Rollentrennung
   * macht ihn zwangslaeufig kaputt, und zwar erst beim Klick.
   *
   * DER POSITIVE GEGENPART STEHT IN PUNKT 8: dort wird belegt, dass es
   * ueberhaupt einen `/u/`-Link gibt und dass er ABSOLUT auf die Abgabe-Domain
   * zeigt. Ohne ihn waere dieser Punkt hier auch dann gruen, wenn die
   * Oberflaeche gar keinen Abgabelink mehr ausgibt.
   *
   * UND JEDE SEITE MUSS LINKS HABEN. „Kein href beginnt mit `/u/`" ist auf
   * einer Seite ohne Links leer wahr; faellt eine Seite in einen Leerzustand
   * oder in eine Fehlerkarte, faellt die Zusicherung mit auf.
   */
  const { shareId } = legeFreigabeAn("T44 Linkpruefung");
  legeInboxDateiAn(`t44-linkpruefung-${Date.now()}.png`);

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

  const SEITEN: { pfad: string; marker: string }[] = [
    { pfad: "/", marker: "files-uebersicht" },
    { pfad: "/shares/neu", marker: "files-neue-freigabe" },
    { pfad: `/shares/${shareId}`, marker: "files-share-detail" },
    { pfad: `/shares/${shareId}/bearbeiten`, marker: "files-share-bearbeiten" },
    { pfad: "/posteingang", marker: "files-posteingang" },
    { pfad: "/zugangslinks", marker: "files-zugangslinks" },
  ];
  // ALLE Verwaltungsseiten, und die Zahl haelt das fest: eine spaeter
  // hinzugefuegte Seite faellt sonst still aus dem Scan.
  expect(SEITEN).toHaveLength(6);

  for (const seite of SEITEN) {
    const res = await page.goto(`${V}${seite.pfad}`);
    expect(res?.status(), `${seite.pfad} antwortet nicht`).toBe(200);
    await expect(page.getByTestId(seite.marker), `${seite.pfad} zeigt nicht ihren Inhalt`).toBeVisible();

    const hrefs = await page.locator("a[href]").evaluateAll((elemente) =>
      elemente.map((e) => e.getAttribute("href") ?? ""),
    );
    expect(hrefs.length, `${seite.pfad} hat gar keine Links — die Pruefung waere leer wahr`)
      .toBeGreaterThan(0);
    const relativ = hrefs.filter((h) => h === "/u" || h.startsWith("/u/"));
    expect(relativ, `${seite.pfad} traegt relative Inbox-Links: ${relativ.join(", ")}`).toEqual([]);
  }
});

test("10 — der oeffentliche Freigabe-Pfad `/s/<id>` gehoert dem Verwaltungs-Host, nicht der Abgabe-Domain", async ({
  page,
}) => {
  /*
   * SCHLIESST DEN ERSTEN DER BEIDEN RIEGEL, die der Schlusskommentar dieser
   * Datei seit Welle 4 als „gebaut, aber strukturell unbewacht" fuehrt. Er war
   * T35 zugedacht (der ersten Seite unter `(oeffentlich-share)`), und
   * `e2e/files-fileshare.spec.ts` — die Datei, die `/s/<id>` besitzt — kennt den
   * Inbox-Host bis heute nicht. Er gehoert ohnehin hierher: die Aussage ist eine
   * ueber ZWEI Hosts, und nur diese Datei hat beide.
   *
   * DIE MUTATION, die er faengt: in `(oeffentlich-share)/layout.tsx`
   * `requireRolle("verwaltung", …)` nach `requireRolle("inbox", …)` drehen.
   * Danach waere `/s/<id>` auf dem Verwaltungs-Host 404 und auf der
   * Abgabe-Domain erreichbar — also genau die GEDRUCKTEN und verteilten
   * Freigabe-Links kaputt, sichtbar erst, wenn jemand einen davon aufruft.
   * GEDRUCKT IST GEDRUCKT.
   *
   * ANONYM und mit einer ECHTEN, passwortfreien Freigabe: sonst kaeme der 404
   * aus der Abwesenheit der Zeile statt aus der Rolle, und beide Haelften saehen
   * gleich aus.
   */
  const { shareId } = legeFreigabeAn("T44 oeffentlicher Freigabe-Pfad");

  const aufInbox = await page.goto(`${I}/s/${shareId}`);
  expect(aufInbox?.status()).toBe(404);

  const aufVerwaltung = await page.goto(`${V}/s/${shareId}`);
  expect(aufVerwaltung?.status()).toBe(200);
  // Die Freigabe selbst, nicht irgendein 200: eine Zustandsseite
  // („abgelaufen", „Limit erreicht") antwortet ebenfalls mit 200.
  await expect(page.getByTestId("files-freigabe")).toBeVisible();
});

/*
 * WAS DIESE DATEI HEUTE NICHT PRUEFEN KANN — und wer es uebernimmt.
 *
 * BEIDE Rollen-Riegel, die hier seit Welle 4 als „gebaut, aber strukturell
 * unbewacht" standen, sind inzwischen geschlossen — sie bleiben mit Mutation und
 * Besitzer stehen, damit niemand sie fuer ungeprueft haelt und ein zweites Mal
 * misst:
 *
 * 1. `(oeffentlich-share)/layout.tsx` — `requireRolle("verwaltung", …)` nach
 *    `requireRolle("inbox", …)` gedreht. GESCHLOSSEN durch Punkt 10 oben (T44);
 *    die Mutation wurde am 01.08. ausgefuehrt und faellt: „`GET
 *    <inbox-host>/s/<id>` — Expected: 404, Received: 200".
 *
 * 2. `(verwaltung)/layout.tsx` — `await requireFilesAccess()` entfernt. Folge:
 *    die GESAMTE Verwaltung (`/shares/*`, `/posteingang`, `/zugangslinks`)
 *    stuende jedem angemeldeten Suite-Nutzer offen. Das Modul ist
 *    `requiresAuth: false`, die Middleware gatet hier also nachweislich nicht
 *    (Begruendung im Kopf jener Datei). Punkt 5 oben besitzt denselben Riegel
 *    NUR fuer den Verteiler (`page.tsx`), nicht fuer das Group-Layout.
 *    GESCHLOSSEN durch T35: `e2e/files-fileshare.spec.ts`, Punkt 3
 *    („`/shares/neu` angemeldet OHNE die Modulgruppe: 404, nicht 403").
 *
 * Kein `test.fixme()` fuer kuenftige Luecken: ein uebersprungener Test mit einer
 * Adresse, die es nicht gibt, sieht wie eine bekannte Luecke aus und wird beim
 * ersten Aufraeumen geloescht. Ein Kommentar mit Mutation und Besitzer
 * ueberlebt das.
 */
