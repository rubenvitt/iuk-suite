import { test, expect, type Page, type APIResponse } from "@playwright/test";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
// Umbenannt beim Import, damit an der Aufrufstelle steht, WOZU sie da ist: ein
// LESER auf die E2E-Datenbank, kein zweiter Schreibweg neben dem Server.
import DatenbankLeser from "better-sqlite3";

import { devLogin } from "./fixtures";
import { setzeAvModus } from "./helpers/avModus";

/**
 * DER BYTE-WEG DER FREIGABEN — WAS NUR EIN ECHTER BROWSER GEGEN EINEN ECHTEN
 * SERVER BELEGT (Spec §7.1, §9.2, §11.5; Plan T35).
 *
 * DIE ZUSAGE DIESER DATEI IST EINE DIFFERENZ, NICHT EIN ERFOLG: derselbe
 * 12-MiB-Inhalt kommt ueber die Upload-Insel (chunked, 4 MiB je `PUT`)
 * VOLLSTAENDIG an und ist byteweise identisch zurueckzulesen — und in EINEM
 * `PUT` wird er STILL gekappt. Ohne die zweite Haelfte belegt die erste nur,
 * dass Hochladen geht; die Kappungsebene, um die es geht, waere ungemessen.
 *
 * DIE DREI KAPPUNGSEBENEN UND IHRE DREI SYMPTOME (§9.2) — nur die mittlere ist
 * hier pruefbar:
 * 1. Server Actions, 1 MB → HTTP 413, laut. Umgangen, weil durch
 *    `anlegenAction` nur Text geht (Titel und die NAMEN der Dateien).
 * 2. Next-Proxy, `proxyClientMaxBodySize` = 10 MiB → **STILL**:
 *    `cloneBodyStream` bricht ab, schiebt `null` in beide Streams und gibt nur
 *    ein `console.warn` aus (`server/body-streams.js:85-101`). Kein Fehler beim
 *    Client, kein Statuscode — die Datei ist einfach kuerzer. **Genau das misst
 *    Punkt 2 unten.** Wer nur den Chunk-Weg prueft, umgeht diese Ebene und
 *    sieht sie nie.
 * 3. Cloudflare Free, 100 MB → Fehler vom Edge, ohne Container-Log. Nicht
 *    lokal pruefbar, Runbook-Sache (§11.7).
 *
 * DIESE DATEI STELLT IHREN ZUSTAND SELBST HER. Die Playwright-Datenbank wird
 * einmal je Lauf geloescht, aber alle Dateien teilen sie sich, `workers: 1`, in
 * Pfadreihenfolge (`docs/design/README.md:214-220`). Es wird deshalb nichts
 * vorausgesetzt, was eine andere Datei angelegt haette — jede Freigabe hier
 * entsteht im Test.
 *
 * `setzeAvModus("ok")` STEHT IN JEDEM TEST und nicht einmal oben: der Fake liest
 * die Modusdatei bei JEDER Verbindung, und T47 (Welle 8b) ergaenzt dieselbe
 * Datei um `error`-Faelle. Eine einmalige Vorbelegung waere dann rennabhaengig.
 *
 * OHNE ANTWORTENDEN SCANNER IST DIESE DATEI UNAUSFUEHRBAR, und zwar richtig so:
 * fail-closed (§6.3) laesst keine Datei je `clean` werden, `/api/download`
 * antwortet dauerhaft 403. Der Fake laeuft als zweiter `webServer`-Eintrag
 * (`playwright.config.ts`); von Hand ist es `pnpm dev:av`.
 */

const VERWALTUNG = "files.localtest.me";
const V = `http://${VERWALTUNG}:3100`;

/** Die Modulgruppe aus dem Registry-Eintrag (`adminGroups: ["iuk-files-admin"]`). */
const GRUPPE = "iuk-files-admin";

/**
 * 12 MiB — und die Zahl ist von zwei Seiten festgelegt, nicht gewaehlt:
 * `playwright.config.ts` setzt `FILES_MAX_DATEI_BYTES=12582912`, und §11.5
 * verlangt eine Datei ueber den 10 MiB des Next-Proxys. Zwischen beiden liegt
 * genau dieser Wert.
 */
const ZWOELF_MIB = 12 * 1024 * 1024;

/**
 * Ein Inhalt mit echter PNG-Signatur und einer Fuellung, die von der Position
 * abhaengt. Beides ist noetig: ohne Signatur lehnt die MIME-Pruefung ab (§8.5),
 * und mit einer konstanten Fuellung waere ein um Bytes verschobener Inhalt
 * byteweise identisch — der Vergleich unten wuerde eine Verschiebung nicht
 * sehen.
 */
function pngInhalt(groesseBytes: number): Buffer {
  const bytes = Buffer.alloc(groesseBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  for (let i = 8; i < groesseBytes; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
  return bytes;
}

const pruefsumme = (bytes: Buffer | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Das Formular ausfuellen und abschicken — ohne auf die Bytes zu warten. */
async function legeFreigabeAn(
  page: Page,
  datei: { name: string; buffer: Buffer },
  titel: string,
  zusatz: { passwort?: string; beschreibung?: string } = {},
): Promise<void> {
  await page.goto(`${V}/shares/neu`);
  await expect(page.getByTestId("files-neue-freigabe")).toBeVisible();

  await page.locator('input[name="title"]').fill(titel);
  await page.locator('input[name="expiryDays"]').fill("1");
  if (zusatz.beschreibung !== undefined) {
    await page.locator('textarea[name="description"]').fill(zusatz.beschreibung);
  }
  if (zusatz.passwort !== undefined) {
    await page.locator('input[name="password"]').fill(zusatz.passwort);
  }
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: datei.name, mimeType: "image/png", buffer: datei.buffer });
  await page.getByRole("button", { name: /Freigabe anlegen/ }).click();
}

/**
 * Kennungen und Wartepunkt der Insel — dieselben Griffe wie in Test 1, hier
 * einmal statt viermal.
 *
 * `data-zustand="fertig"` heisst „die BYTES liegen", nicht „die Datei ist
 * freigegeben": der AV-Lauf beginnt erst danach. Wer das verwechselt, misst den
 * Wartezustand nie.
 */
async function ladeHochUndWarteAufBytes(
  page: Page,
  datei: { name: string; buffer: Buffer },
  titel: string,
  zusatz: { passwort?: string; beschreibung?: string } = {},
): Promise<{ shareId: string; fileId: string }> {
  await legeFreigabeAn(page, datei, titel, zusatz);

  const eintrag = page.locator("[data-file-id]");
  await expect(eintrag).toBeVisible({ timeout: 60_000 });
  const fileId = await eintrag.getAttribute("data-file-id");
  const shareId = await page.getByTestId("files-upload-liste").getAttribute("data-share-id");
  expect(fileId, "die Insel muss die Datei-Kennung ausweisen").toBeTruthy();
  expect(shareId, "die Insel muss die Freigabe-Kennung ausweisen").toBeTruthy();

  await expect(eintrag).toHaveAttribute("data-zustand", "fertig", { timeout: 120_000 });
  return { shareId: shareId!, fileId: fileId! };
}

/**
 * `download_count` DIREKT AUS DER E2E-DATENBANK.
 *
 * Warum nicht ueber die Oberflaeche: die Freigaben-Uebersicht zeigt den Zaehler
 * zwar („n / ∞"), aber nur ANGEMELDET — und Test 5 unten loescht am Ende die
 * Cookies des Kontexts, um den Zustand „ohne Entsperrung" herzustellen. Eine
 * Messung, die selbst eine Anmeldung braucht, koennte den Zustand danach nicht
 * mehr messen. Die Datenbank ist hier die kuerzere und die ehrlichere Auskunft.
 *
 * `readonly`, und der Pfad ist `DATA_DIR` aus `playwright.config.ts`. Eine
 * eigene Verbindung neben der des Servers ist unter WAL unproblematisch.
 */
function downloadZaehler(shareId: string): number {
  const sqlite = new DatenbankLeser("./.data/e2e/files.db", { readonly: true });
  const zeile = sqlite.prepare("SELECT download_count AS n FROM shares WHERE id = ?").get(shareId) as
    | { n: number }
    | undefined;
  sqlite.close();
  if (zeile === undefined) throw new Error(`Kein Share ${shareId} in der E2E-Datenbank`);
  return zeile.n;
}

test("1 — eine Datei ueber 10 MiB kommt chunkweise vollstaendig an und ist byteweise identisch zurueckzulesen", async ({
  page,
}) => {
  // Kalter `next dev`, 12 MiB ueber CDP, drei `PUT`s und ein Scan derselben
  // Groesse passen nicht in die 90 s der Konfiguration.
  test.setTimeout(240_000);
  /*
   * `haengt` VOR dem Upload, und das ist keine Schikane, sondern der einzige
   * Weg, „vor `clean` gesperrt" DETERMINISTISCH zu messen. Der erste Versuch
   * laeuft in `FILES_AV_TIMEOUT_MS` (2 000 ms) — solange steht die Zeile auf
   * `scanning` und `/api/download` antwortet 403 KONSTRUKTIV, nicht zufaellig.
   * Auf den natuerlichen Ablauf zu setzen hiesse, eine Sub-Sekunden-Wette
   * abzuschliessen: zwischen dem letzten `PUT` und der ersten Abfrage liegen
   * ein paar hundert Millisekunden, und in derselben Groessenordnung ist der
   * Scan fertig. Rennabhaengig ROT ist schlimmer als rennabhaengig gruen.
   *
   * `scanneMitWiederholung` (T17) liest den Modus bei JEDEM Versuch neu:
   * Versuch 2 startet nach `FILES_AV_WIEDERHOLUNG_SEKUNDEN` (1 s) und findet
   * dann `ok`. Wird unten nicht rechtzeitig umgeschaltet, sind beide Versuche
   * verbraucht, die Zeile faellt auf `error` — und der Test wird LAUT rot statt
   * still gruen.
   */
  setzeAvModus("haengt");

  const inhalt = pngInhalt(ZWOELF_MIB);
  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  await legeFreigabeAn(page, { name: "bericht.png", buffer: inhalt }, "Lagebericht 12 MiB");

  /*
   * DIE KENNUNGEN WERDEN GELESEN, SOLANGE DIE BYTES NOCH FLIESSEN. Sie stehen
   * im Markup, sobald `anlegenAction` geantwortet hat — also lange vor dem
   * letzten Chunk. Zwischen „fertig" und der Sperrpruefung unten bleibt damit
   * nur EIN Umlauf; das Fenster bis zum zweiten AV-Versuch (≈ 3 s) ist knapp,
   * und zwei zusaetzliche `getAttribute` gehoeren nicht hinein.
   */
  const eintrag = page.locator("[data-file-id]");
  await expect(eintrag).toBeVisible({ timeout: 60_000 });
  const fileId = await eintrag.getAttribute("data-file-id");
  const shareId = await page.getByTestId("files-upload-liste").getAttribute("data-share-id");
  expect(fileId, "die Insel muss die Datei-Kennung ausweisen").toBeTruthy();
  expect(shareId, "die Insel muss die Freigabe-Kennung ausweisen").toBeTruthy();
  const adresse = `${V}/api/download/${shareId}?file=${fileId}`;

  await expect(eintrag).toHaveAttribute("data-zustand", "fertig", { timeout: 180_000 });

  /*
   * ERST DIE SPERRE, DANN DER SCANNER. Der Fake steht noch auf `haengt`, die
   * Zeile ist `scanning` — `/api/download` MUSS hier 403 antworten (T33
   * Punkt 1). Erst danach wird umgeschaltet; Versuch 2 der AV-Kette liest den
   * neuen Modus.
   */
  const gesperrt = await page.request.get(adresse);
  expect(gesperrt.status(), "vor `clean` muss der Download gesperrt sein").toBe(403);
  setzeAvModus("ok");

  // Der Zustand steht als TEXT da, nicht nur als Balken — jetzt, wo es nicht
  // mehr im Zeitfenster oben liegt.
  await expect(eintrag).toContainText("vollständig übertragen");

  /*
   * GEPOLLT WIRD DER ZUSTAND, NIE EINE WARTEZEIT. Ein Test, der nach dem
   * Upload sofort laedt, ist rennabhaengig gruen; einer mit fester
   * `waitForTimeout`-Spanne ist es auf der anderen Seite. Jede Antwort ausser
   * 403 und 200 ist ein Befund — insbesondere ein 403, das nie endet, faellt
   * unten durch die Obergrenze an Versuchen.
   */
  const statusfolge: number[] = [gesperrt.status()];
  let koerper: Buffer | null = null;
  for (let versuch = 0; versuch < 90; versuch += 1) {
    const antwort = await page.request.get(adresse);
    statusfolge.push(antwort.status());
    if (antwort.status() === 200) {
      koerper = await antwort.body();
      break;
    }
    expect(
      antwort.status(),
      `unerwarteter Zustand auf dem Downloadweg: ${statusfolge.join(", ")}`,
    ).toBe(403);
    await page.waitForTimeout(500);
  }

  expect(statusfolge.at(-1), `Statusfolge: ${statusfolge.join(", ")}`).toBe(200);
  expect(koerper).not.toBeNull();

  // Laenge UND Pruefsumme: die Laenge allein liesse eine Verschiebung durch,
  // die Pruefsumme allein ergaebe im Fehlerfall keinen brauchbaren Befund.
  expect(koerper!.length).toBe(ZWOELF_MIB);
  expect(pruefsumme(koerper!)).toBe(pruefsumme(inhalt));
});

test("2 — DERSELBE Inhalt in EINEM PUT wird still gekappt (die 10-MiB-Ebene des Next-Proxys)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  setzeAvModus("ok");

  const inhalt = pngInhalt(ZWOELF_MIB);
  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

  /*
   * Gebraucht wird nur eine ZEILE ohne Bytes — den Weg dorthin geht die
   * Oberflaeche, die Bytes der Insel werden abgefangen. Der Ersatz waere ein
   * direkter Aufruf von `anlegenAction`, den es von auszen nicht gibt.
   */
  await page.route("**/api/upload/**", (route) => route.abort());
  await legeFreigabeAn(
    page,
    { name: "einzeln.png", buffer: pngInhalt(4096) },
    "Gegenprobe: ein einziger PUT",
  );
  const eintrag = page.locator("[data-file-id]");
  await expect(eintrag).toHaveAttribute("data-zustand", "fehler", { timeout: 60_000 });
  const fileId = await eintrag.getAttribute("data-file-id");
  await page.unroute("**/api/upload/**");

  /*
   * DER GANZE INHALT IN EINER ANFRAGE — der Weg, den die Insel bewusst NICHT
   * geht. `page.request` erbt die Cookies des Kontexts, der Riegel
   * `requireFilesAccess()` ist also erfuellt.
   */
  const antwort = await page.request.put(`${V}/api/upload/${fileId}?ab=0&ende=1`, {
    data: inhalt,
    headers: { "content-type": "image/png" },
    timeout: 180_000,
  });

  // KEIN Fehler, KEIN Statuscode: genau das ist das Symptom dieser Ebene.
  expect(antwort.status(), "die Kappung meldet sich nicht — sie ist still").toBe(200);
  const ergebnis = (await antwort.json()) as { groesseBytes?: number };
  /*
   * NUR DIE OBERE SCHRANKE — und das ist die ganze Zusage. Wo genau
   * `cloneBodyStream` abbricht, ist Implementierungsdetail: gemessen am
   * 2026-08-01 gegen `next dev` waren es 10 469 160 Bytes von 12 582 912
   * (rund 9,98 MiB, knapp unter dem 10-MiB-Default). Eine zweite Schranke bei
   * exakt 10 MiB haette nur eine Art hinzugefuegt, rot zu werden, waehrend die
   * Kappung tut, was sie soll.
   */
  expect(
    ergebnis.groesseBytes,
    "in EINEM PUT kommen nicht alle 12 MiB an — sonst ist `proxyClientMaxBodySize` " +
      "in dieser Umgebung nicht wirksam und die Zusage waere hier nicht belegbar",
  ).toBeLessThan(ZWOELF_MIB);
});

test("3 — `/shares/neu` angemeldet OHNE die Modulgruppe: 404, nicht 403", async ({ page }) => {
  /*
   * DIESER PUNKT SCHLIESST EINE BENANNTE LUECKE (`e2e/files-hosts.spec.ts`,
   * Schlusskommentar Punkt 2): das Modul ist `requiresAuth: false` — sonst liefe
   * jeder anonyme `/s/<id>`-Aufruf in den Login —, und `canAccess` steigt fuer
   * solche Module frueh aus. Die Middleware gatet hier also NACHWEISLICH nicht;
   * der einzige Riegel ist `await requireFilesAccess()` in
   * `(verwaltung)/layout.tsx`. Bis zu dieser Welle stand hinter dem Layout keine
   * Seite, die Mutation „diese Zeile entfernen" blieb 6/6 gruen.
   *
   * 404 und NICHT 403: die Existenz der Seite wird nicht verraten (§2.4).
   */
  await devLogin(page, { host: VERWALTUNG, groups: "" });
  const antwort = await page.goto(`${V}/shares/neu`);
  expect(antwort?.status()).toBe(404);
  await expect(page.getByTestId("files-neue-freigabe")).toHaveCount(0);
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * `/s/<id>` — DIE OEFFENTLICHE ANSICHT UND IHR SERVERSEITIGES PASSWORT-GATE
 * (Spec §7.4, §11.2, §11.5; Plan T40)
 *
 * WARUM DIESE VIER PUNKTE HIER STEHEN UND NICHT IN EINEM VITEST — jeder von
 * ihnen ist von einer Testebene tiefer STRUKTURELL nicht zu sehen:
 *
 * - Punkt 4 misst den ROHEN HTTP-Body. Unter Vitest ist `"use client"` ein
 *   wirkungsloser String; es entsteht kein RSC-Payload, und ein Baum, den die
 *   echte Antwort als Client-Referenz uebertruege, rendert dort einfach mit.
 *   Genau daran liegt der Alt-Defekt (Analyse Falle 12): die Alt-Seite laedt die
 *   Dateien VOR der Passwortpruefung und uebergibt die fertigen Ansichten als
 *   `children` an eine Client-Komponente.
 * - Punkt 5 braucht ein echtes `Set-Cookie` samt Browser-Jar ueber ZWEI
 *   Anfragen hinweg.
 * - Punkt 6 vergleicht drei echte HTTP-Antworten byteweise; ein Handler-Test
 *   (T28) sieht nur seine eigene Rueckgabe.
 * - Punkt 7 misst eine Datenbankspalte VOR und NACH einem abgewiesenen Request.
 *   §11.2 weist dieser Zeile ausdruecklich „Handler-Test + E2E" zu.
 * - Punkt 8 beobachtet den Uebergang `scanning → clean` in einer laufenden
 *   Anwendung; §11.5 weist ihn E2E zu, und T47 laeuft in `error`, erreicht
 *   `clean` also nie.
 *
 * JEDE FREIGABE HIER ENTSTEHT IM TEST — nichts wird von einer anderen Datei
 * geerbt (`docs/design/README.md:214-220`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Klein — nur Punkt 1 und 2 oben brauchen 12 MiB; fuenf weitere Tests in dieser
 * Groesse sprengten den Lauf.
 *
 * UND EINE KRUMME ZAHL, nicht 4096: sie taucht als „4711" und als „4,6 KiB"
 * genau einmal im Universum dieser Antwort auf. Eine Zweierpotenz stuende auch
 * in Bundle-Namen und Chunk-Groessen und machte die Suche unten unbrauchbar —
 * entweder falsch rot oder (schlimmer) nie rot, weil man sie deshalb weglaesst.
 */
const KLEIN = 4711;
const KLEIN_TEXT = "4,6 KiB";

const PASSWORT = "geheimes-passwort";

test("4 — vor dem Entsperren steht im ROHEN Body kein Dateiname, keine Beschreibung und kein Hash", async ({
  page,
}) => {
  test.setTimeout(120_000);
  setzeAvModus("ok");

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const { shareId, fileId } = await ladeHochUndWarteAufBytes(
    page,
    { name: "geheimakte-t40-payload.png", buffer: pngInhalt(KLEIN) },
    "Vertrauliche Uebergabe T40",
    { passwort: PASSWORT, beschreibung: "GEHEIMEBESCHREIBUNGT40" },
  );

  /*
   * `page.request.get` und danach `.text()`: der ganze ausgelieferte Text, also
   * DOM UND RSC-Payload (`self.__next_f.push(...)`) in einer Zeichenkette. Eine
   * Suche im sichtbaren DOM haette den Payload nicht gesehen — und genau dort
   * steckte der Alt-Defekt.
   */
  const gesperrt = await page.request.get(`${V}/s/${shareId}`);
  expect(gesperrt.status()).toBe(200);
  const roh = await gesperrt.text();

  for (const geheim of [
    "geheimakte-t40-payload.png",
    "GEHEIMEBESCHREIBUNGT40",
    // Die Datei-KENNUNG nackt, ohne Adresse drumherum: ein Leck, das rohe
    // `ShareDatei`-Objekte in den Payload spuelte, truege sie genau so — und
    // rutschte an einer Liste vorbei, die nur nach `/api/download/` sucht.
    fileId,
    // Die GROESSE, in beiden Schreibweisen: als Zahl aus der Spalte und als
    // Text, wie die Zeile ihn zeigte.
    String(KLEIN),
    KLEIN_TEXT,
    "$2b$",
    "/api/download/",
    "/api/preview/",
  ]) {
    expect(roh, `„${geheim}" darf vor dem Entsperren im Body nicht vorkommen`).not.toContain(
      geheim,
    );
  }
  // Die Gegenprobe zur Gegenprobe: die Maske ist ueberhaupt da. Ohne sie
  // bestuende die Zusage oben auch fuer eine leere Seite.
  expect(roh).toContain('type="password"');

  /*
   * UND DIE ANDERE RICHTUNG — UEBER DIE MASKE, NICHT UEBER `page.request`.
   *
   * Zwei Dinge auf einmal, und das zweite kann NUR ein echter Browser: dass die
   * Client-Insel HYDRIERT. Ein API-Aufruf auf `/verify` liefe auch dann durch,
   * wenn `PasswortMaske` serverseitig zwar rendert, im Browser aber nie zum
   * Leben kaeme — der Knopf waere dann ein nacktes `submit`, der Browser
   * schickte ein GET auf dieselbe Adresse, und die Maske erschiene wieder. Von
   * „Passwort falsch" ist das nicht zu unterscheiden, und alle Zusagen dieser
   * Datei blieben gruen. Also: tippen, klicken, und danach muss die Datei
   * DASTEHEN.
   *
   * Zugleich der Beleg, dass der Erfolgsweg (`location.reload()`) auf der
   * entsperrten Seite landet und nicht irgendwo.
   */
  await page.goto(`${V}/s/${shareId}`);
  await expect(page.getByTestId("files-freigabe-passwort")).toBeVisible();
  await page.locator('input[type="password"]').fill(PASSWORT);
  await page.getByRole("button", { name: /Freigabe öffnen/ }).click();

  await expect(page.getByText("geheimakte-t40-payload.png")).toBeVisible({ timeout: 30_000 });

  const offen = await (await page.request.get(`${V}/s/${shareId}`)).text();
  expect(offen).toContain("geheimakte-t40-payload.png");
  expect(offen).toContain("GEHEIMEBESCHREIBUNGT40");
  expect(offen).toContain(KLEIN_TEXT);
  expect(offen).not.toContain("$2b$");
});

test("5 — entsperrt laedt der Download, ohne Cookie 401 — und ein 401 zaehlt nicht mit", async ({
  page,
}) => {
  test.setTimeout(180_000);
  setzeAvModus("ok");

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const { shareId, fileId } = await ladeHochUndWarteAufBytes(
    page,
    { name: "protokoll.png", buffer: pngInhalt(KLEIN) },
    "Cookie-Weg T40",
    { passwort: PASSWORT },
  );
  const adresse = `${V}/api/download/${shareId}?file=${fileId}`;

  // OHNE Cookie: 401 — und der Zaehler bleibt stehen (§7.4, letzte zwei
  // Zusagen). Die Alt-App las `password_hash` auf keinem der drei byteliefernden
  // Wege.
  const vorher = downloadZaehler(shareId);
  expect((await page.request.get(adresse)).status()).toBe(401);
  expect(downloadZaehler(shareId), "ein 401 darf `download_count` nicht erhoehen").toBe(vorher);

  expect(
    (await page.request.post(`${V}/api/s/${shareId}/verify`, { data: { password: PASSWORT } }))
      .status(),
  ).toBe(200);

  /*
   * GEPOLLT WIRD DER ZUSTAND, NIE EINE WARTEZEIT. Vor `clean` antwortet der
   * Download 403 — ohne dieses Warten waere die Cookie-Zusage rennabhaengig
   * gruen (oder rot, je nachdem, wer schneller ist).
   */
  const statusfolge: number[] = [];
  for (let versuch = 0; versuch < 60; versuch += 1) {
    const antwort = await page.request.get(adresse);
    statusfolge.push(antwort.status());
    if (antwort.status() === 200) break;
    expect(antwort.status(), `unerwartet auf dem Downloadweg: ${statusfolge.join(", ")}`).toBe(403);
    await page.waitForTimeout(500);
  }
  expect(statusfolge.at(-1), `Statusfolge: ${statusfolge.join(", ")}`).toBe(200);

  // Der positive Gegenbeweis zu den beiden „bleibt stehen"-Zusagen: der Zaehler
  // BEWEGT sich, wenn der Download durchgeht. Ohne ihn waere „unveraendert"
  // auch dann gruen, wenn nie irgendetwas zaehlte.
  expect(downloadZaehler(shareId)).toBe(vorher + 1);

  // Cookie weg = Entsperrung weg. Als LETZTES, weil es auch die Anmeldung
  // mitloescht — auf einem oeffentlichen Weg ist das ohne Folgen.
  await page.context().clearCookies();
  expect((await page.request.get(adresse)).status()).toBe(401);
  expect(downloadZaehler(shareId), "der zweite 401 zaehlt ebenso wenig").toBe(vorher + 1);
});

test("6 — das Orakel ist geschlossen: unbekannt, passwortfrei und falsch antworten IDENTISCH", async ({
  page,
}) => {
  test.setTimeout(120_000);
  setzeAvModus("ok");

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const ohnePasswort = await ladeHochUndWarteAufBytes(
    page,
    { name: "offen.png", buffer: pngInhalt(KLEIN) },
    "Ohne Passwort T40",
  );
  const mitPasswort = await ladeHochUndWarteAufBytes(
    page,
    { name: "zu.png", buffer: pngInhalt(KLEIN) },
    "Mit Passwort T40",
    { passwort: PASSWORT },
  );

  const faelle: [string, string][] = [
    // Eine ID in gueltiger Form, die es nicht gibt — sonst schiede sie schon an
    // der Grammatik aus und der Fall waere ein anderer.
    ["unbekannte ID", "zzzzzzzzzz"],
    ["passwortfreier Share", ohnePasswort.shareId],
    ["falsches Passwort", mitPasswort.shareId],
  ];

  const antworten: { name: string; status: number; koerper: string }[] = [];
  for (const [name, id] of faelle) {
    const a = await page.request.post(`${V}/api/s/${id}/verify`, {
      data: { password: "definitiv-falsch" },
    });
    antworten.push({ name, status: a.status(), koerper: await a.text() });
  }

  for (const a of antworten) {
    expect(a.status, `${a.name} muss 401 antworten, nicht 404`).toBe(401);
  }
  // UND der Rumpf: ein eigener Text je Fall waere dasselbe Orakel in Prosa.
  expect(
    new Set(antworten.map((a) => a.koerper)).size,
    `drei verschiedene Ruempfe: ${antworten.map((a) => `${a.name}=${a.koerper}`).join(" | ")}`,
  ).toBe(1);
});

test("7 — ein 403 (AV nicht `clean`) zaehlt `download_count` nicht hoch", async ({ page }) => {
  test.setTimeout(180_000);
  /*
   * `error` UND NICHT `haengt`: `error` ist ein ENDZUSTAND. Der Zaehler laesst
   * sich damit ohne Zeitfenster messen — mit `haengt` haette der Test drei
   * Anfragen in die zwei Sekunden des ersten AV-Versuchs pressen muessen, und
   * ein verpasstes Fenster waere rennabhaengig ROT.
   */
  setzeAvModus("error");

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const { shareId, fileId } = await ladeHochUndWarteAufBytes(
    page,
    { name: "gesperrt.png", buffer: pngInhalt(KLEIN) },
    "AV-Sperre T40",
  );
  const adresse = `${V}/api/download/${shareId}?file=${fileId}`;

  const vorher = downloadZaehler(shareId);
  const antwort = await page.request.get(adresse);
  expect(antwort.status(), "ohne `clean` liefert der Download keine Bytes").toBe(403);
  expect(downloadZaehler(shareId), "ein 403 darf `download_count` nicht erhoehen").toBe(vorher);

  // Zweimal, damit „unveraendert" nicht an einem einzelnen Aufruf haengt.
  expect((await page.request.get(adresse)).status()).toBe(403);
  expect(downloadZaehler(shareId)).toBe(vorher);
});

test("8 — der beobachtete Uebergang `scanning → clean`: `<meta refresh>` verschwindet, der Download oeffnet", async ({
  page,
}) => {
  test.setTimeout(180_000);
  /*
   * `haengt` VOR dem Upload — dieselbe Bauform wie in Test 1 und aus demselben
   * Grund: nur so ist „vor `clean` gesperrt" DETERMINISTISCH zu messen. Auf den
   * natuerlichen Ablauf zu setzen hiesse, eine Sub-Sekunden-Wette abzuschliessen.
   *
   * ABWEICHUNG VOM PLANTEXT, DER HIER `setzeAvModus("ok")` NENNT: mit `ok` kann
   * der Scan fertig sein, BEVOR die erste Seitenanfrage rausgeht — der
   * Wartezustand waere dann nie da und der Test rennabhaengig rot. Der Rest des
   * Punktes bleibt woertlich: Wartezustand mit `<meta refresh>` und 403, danach
   * kein Refresh mehr und 200.
   *
   * Der erste AV-Versuch laeuft `FILES_AV_TIMEOUT_MS` (2 000 ms), Versuch 2
   * beginnt eine Sekunde spaeter und liest den Modus NEU. Zwischen „Bytes
   * fertig" und dem Umschalten unten liegen deshalb genau zwei Anfragen und
   * sonst nichts. Wird zu spaet umgeschaltet, sind beide Versuche verbraucht,
   * die Zeile faellt auf `error` — und der Test wird LAUT rot statt still gruen.
   */
  setzeAvModus("haengt");

  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const { shareId, fileId } = await ladeHochUndWarteAufBytes(
    page,
    { name: "unterwegs.png", buffer: pngInhalt(KLEIN) },
    "Uebergang T40",
  );
  const adresse = `${V}/api/download/${shareId}?file=${fileId}`;

  const gesperrt = await page.request.get(adresse);
  const wartend = await (await page.request.get(`${V}/s/${shareId}`)).text();
  setzeAvModus("ok");

  expect(gesperrt.status(), "vor `clean` muss der Download gesperrt sein").toBe(403);
  expect(
    wartend,
    "im Wartezustand traegt die Seite die JS-freie Selbstaktualisierung",
  ).toContain('http-equiv="refresh"');

  const statusfolge: number[] = [gesperrt.status()];
  for (let versuch = 0; versuch < 60; versuch += 1) {
    const antwort = await page.request.get(adresse);
    statusfolge.push(antwort.status());
    if (antwort.status() === 200) break;
    expect(antwort.status(), `unerwartet auf dem Downloadweg: ${statusfolge.join(", ")}`).toBe(403);
    await page.waitForTimeout(500);
  }
  expect(statusfolge.at(-1), `Statusfolge: ${statusfolge.join(", ")}`).toBe(200);

  /*
   * UND JETZT DIE ANDERE HAELFTE DER ZUSAGE. Der Vitest belegt nur die
   * ANWESENHEIT des Tags; dass er nach dem Statuswechsel WEG ist, entscheidet
   * sich an echten Daten — und ohne diese Zeile laedt eine fertige Seite auf
   * einem fremden Handy weiter alle 5 Sekunden nach.
   */
  const fertig = await (await page.request.get(`${V}/s/${shareId}`)).text();
  expect(fertig).not.toContain('http-equiv="refresh"');
  expect(fertig).toContain("unterwegs.png");
  expect(fertig).toContain(`/api/download/${shareId}?file=${fileId}`);
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * FAIL-CLOSED UEBER ALLE FUENF LESEWEGE (Spec §6.3, §7.7, §8.6; Plan T47)
 *
 * DIE ZUSAGE: mit einem Scanner, der Fehler meldet, ist KEIN Byte erreichbar —
 * auf `/api/download`, `/api/download/<id>/zip`, `/api/preview`,
 * `/api/inbox/<id>` und `/api/inbox/zip` —, und die Verwaltung sagt, was los
 * ist.
 *
 * ABNAHME-TEST, KEIN TDD-TEST (Kopfregel des Plans). In Stufe 8b existiert
 * alles, was hier geprueft wird; diese beiden Tests sind von Anfang an gruen,
 * und das ist richtig. Die MUTATION, an der sie zu messen sind: `istFreigegeben`
 * (`_lib/av.ts`) so aendern, dass es auch bei `error` oder `scanning` freigibt —
 * danach muessen mindestens vier der fuenf Lesewege rot werden. Fuer die
 * Oberflaechen-Haelfte (Punkt 6 und 8) faengt eine zweite Mutation: das
 * `avStatus === "error"`-Praedikat am Wiederholen-Knopf bzw.
 * `mindestensEineWirdGeprueft` am `<meta refresh>`.
 *
 * WARUM DER ALT-BEFUND DAS NOETIG MACHT: in `drop` werden der `catch`-Block und
 * damit der KOMPLETTE `AV_FAIL_OPEN`-Schalter fuer Protokollfehler nie erreicht
 * — end-to-end in beiden Schalterstellungen identisch gemessen. „fail-closed"
 * ist deshalb nur eine Zusage, wenn `error` ERREICHBAR und der Weg dorthin
 * AUSFUEHRBAR ist. Genau das leistet der Fake-Modus (T14): der Zustand wird
 * SCHRITT FUER SCHRITT umgeschaltet (Plan-Festlegung H), nicht einmal oben
 * vorbelegt — derselbe Lauf braucht vorher `clean`, und Punkt 8 braucht `clean`
 * UND `scanning` in EINEM Share.
 *
 * WAS 403 NICHT UNTERSCHEIDET — und warum unten die Datenbank mitliest:
 * `scanning` und `error` antworten auf allen Byte-Wegen DASSELBE (403). Ein Test,
 * der nur Statuscodes zusicherte, waere auch dann gruen, wenn die Zeile beim
 * Messen laengst von `scanning` nach `error` gekippt ist — die Haelfte
 * „geprueft wird je EINER Zeile in `scanning`" haette dann niemand. Deshalb wird
 * `av_status` VOR und NACH jedem Messblock aus der E2E-Datenbank gelesen
 * (`imScanningFenster`), und die einzige Stelle, an der die beiden Zustaende von
 * auszen ueberhaupt unterscheidbar sind — der GRUND in der `_HINWEIS.txt` —
 * wird woertlich zugesichert.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Der Inbox-Host. Die Abgabe liegt dort, der Posteingang auf `files.…` (§3.4). */
const INBOX = "drop.localtest.me";

type AvTabelle = "share_files" | "inbox_files";

/**
 * `av_status` DIREKT AUS DER E2E-DATENBANK — die Begruendung steht im
 * Abschnittskopf: 403 unterscheidet `scanning` und `error` nicht.
 *
 * Dieselbe Bauform wie `downloadZaehler` oben: `readonly`, Pfad aus `DATA_DIR`
 * (`playwright.config.ts`), eine eigene Verbindung neben der des Servers ist
 * unter WAL unproblematisch. Die Spaltennamen sind die der Migration
 * (`share_files.av_status`, `inbox_files.av_status`) und nicht die
 * Drizzle-Bezeichner — gelesen wird, was der Route Handler auch sieht.
 */
function avStatusVon(tabelle: AvTabelle, id: string): string {
  const sqlite = new DatenbankLeser("./.data/e2e/files.db", { readonly: true });
  // `tabelle` ist eine Union aus zwei Literalen, kein Fremdtext.
  const zeile = sqlite.prepare(`SELECT av_status AS s FROM ${tabelle} WHERE id = ?`).get(id) as
    | { s: string }
    | undefined;
  sqlite.close();
  if (zeile === undefined) throw new Error(`Keine Zeile ${tabelle}/${id} in der E2E-Datenbank`);
  return zeile.s;
}

/** Name → Kennung fuer alle Dateien einer Freigabe, in EINER Abfrage. */
function shareDateiIds(shareId: string): Map<string, string> {
  const sqlite = new DatenbankLeser("./.data/e2e/files.db", { readonly: true });
  const zeilen = sqlite
    .prepare("SELECT id, filename FROM share_files WHERE share_id = ?")
    .all(shareId) as { id: string; filename: string }[];
  sqlite.close();
  return new Map(zeilen.map((z) => [z.filename, z.id]));
}

/** Die Kennung einer Abgabe ueber ihren Anzeigenamen — der ist je Lauf eindeutig. */
function inboxDateiId(dateiname: string): string {
  const sqlite = new DatenbankLeser("./.data/e2e/files.db", { readonly: true });
  const zeile = sqlite.prepare("SELECT id FROM inbox_files WHERE dateiname = ?").get(dateiname) as
    | { id: string }
    | undefined;
  sqlite.close();
  if (zeile === undefined) throw new Error(`Keine Abgabe „${dateiname}" in der E2E-Datenbank`);
  return zeile.id;
}

/**
 * GEWARTET WIRD AUF DEN ZUSTAND, NIE AUF EINE ZEITSPANNE. Mit
 * `FILES_AV_TIMEOUT_MS=2000`, `FILES_AV_VERSUCHE=2` und
 * `FILES_AV_WIEDERHOLUNG_SEKUNDEN=1` (§9.3) ist jeder Uebergang in ≈ 5 s
 * durchlaufen; die Frist ist trotzdem grosszuegig, weil ein kalter `next dev`
 * die erste Uebersetzung dazwischenschiebt.
 */
async function warteAufAvStatus(
  tabelle: AvTabelle,
  id: string,
  erwartet: string,
  fristMs = 90_000,
): Promise<void> {
  await expect
    .poll(() => avStatusVon(tabelle, id), { timeout: fristMs, intervals: [100, 200, 250] })
    .toBe(erwartet);
}

/**
 * Die Eintraege eines ZIP aus dem ZENTRALVERZEICHNIS, samt Inhalt.
 *
 * DOPPELT ZU `api/inbox/zip/route.test.ts` UND ABSICHTLICH: dort ist die
 * Funktion eine lokale Testhilfe ohne Export, und ein `e2e/helpers/zip.ts` waere
 * eine Datei ausserhalb der Liste dieses Tasks. Gelesen wird das
 * Zentralverzeichnis und nicht die lokalen Koepfe: mit `archiver` steht die
 * Groesse dort im Data-Descriptor HINTER den Daten, im Zentralverzeichnis
 * dagegen richtig — und nur von dort ist der Inhalt sicher zu schneiden.
 */
function zipEintraege(daten: Buffer): { name: string; inhalt: string }[] {
  let eocd = -1;
  for (let i = daten.length - 22; i >= 0; i--) {
    if (daten.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd, "kein End-of-Central-Directory — das ist kein ZIP").toBeGreaterThanOrEqual(0);

  const anzahl = daten.readUInt16LE(eocd + 10);
  let p = daten.readUInt32LE(eocd + 16);
  const aus: { name: string; inhalt: string }[] = [];
  for (let n = 0; n < anzahl; n++) {
    const methode = daten.readUInt16LE(p + 10);
    const komprimiert = daten.readUInt32LE(p + 20);
    const namensLaenge = daten.readUInt16LE(p + 28);
    const extraLaenge = daten.readUInt16LE(p + 30);
    const kommentarLaenge = daten.readUInt16LE(p + 32);
    const versatz = daten.readUInt32LE(p + 42);
    const name = daten.subarray(p + 46, p + 46 + namensLaenge).toString("utf8");
    // Das lokale `extra` ist NICHT dasselbe wie das zentrale.
    const start = versatz + 30 + daten.readUInt16LE(versatz + 26) + daten.readUInt16LE(versatz + 28);
    const roh = daten.subarray(start, start + komprimiert);
    aus.push({
      name,
      inhalt: (methode === 8 ? inflateRawSync(roh) : Buffer.from(roh)).toString("utf8"),
    });
    p += 46 + namensLaenge + extraLaenge + kommentarLaenge;
  }
  return aus;
}

async function archivVon(antwort: APIResponse): Promise<{ name: string; inhalt: string }[]> {
  expect(antwort.status(), await antwort.text().catch(() => "")).toBe(200);
  expect(antwort.headers()["content-type"]).toContain("application/zip");
  return zipEintraege(Buffer.from(await antwort.body()));
}

/** Der Text der Fehlliste — sie MUSS da sein, wo etwas ausgeschlossen wurde. */
function hinweisAus(eintraege: { name: string; inhalt: string }[]): string {
  const treffer = eintraege.find((e) => e.name === "_HINWEIS.txt");
  expect(
    treffer,
    `keine _HINWEIS.txt im Archiv — enthalten: ${eintraege.map((e) => e.name).join(", ")}`,
  ).toBeDefined();
  return treffer!.inhalt;
}

/**
 * DIE DREI AUSSCHLUSSGRUENDE WOERTLICH (`_lib/zip.ts`,
 * `ZIP_AUSSCHLUSS_MELDUNGEN`). Sie sind die EINZIGE Stelle, an der `scanning`
 * und `error` von auszen unterscheidbar sind — „einer der beiden AV-Gruende"
 * waere genau die Zusicherung, die das wieder aufgibt.
 */
const GRUND_SCANNING = "Die Virenprüfung läuft noch";
const GRUND_ERROR = "Die Virenprüfung war nicht möglich";
const GRUND_UNVOLLSTAENDIG = "Die Übertragung wurde nicht abgeschlossen";

const fehlzeile = (name: string, grund: string): string => `- ${name} — ${grund}`;

/**
 * EIN MESSBLOCK, DER NACHWEISLICH IN `scanning` LIEF.
 *
 * Warum das ein Helfer ist und keine Handvoll Zeilen: mit `haengt` steht eine
 * Zeile nur ≈ 5 s auf `scanning` (`FILES_AV_VERSUCHE` × `FILES_AV_TIMEOUT_MS`
 * plus ein Abstand), danach ist sie `error`. Das Fenster reicht fuer die paar
 * Anfragen dreifach — aber „reicht" ist keine Zusage, und eine verpasste
 * Messung waere hier nicht rot, sondern STILL FALSCH: 403 antwortet auch
 * `error`.
 *
 * Also wird das Fenster BEZEUGT (`av_status` vor und nach dem Block) und im
 * Zweifel NEU HERGESTELLT — ueber genau den Knopf, den Punkt 6 ohnehin verlangt
 * (`avWiederholenAction`, T45: `error → scanning` plus Einreihen). Das ist kein
 * Umweg um die Uhr, sondern der dokumentierte Zustandsuebergang aus §6.2.
 *
 * Ein Fehlschlag WAEHREND die Zeile noch `scanning` ist, wird sofort
 * durchgereicht — das ist ein Befund und kein Fensterproblem.
 */
async function imScanningFenster(
  zeile: { tabelle: AvTabelle; id: string },
  wiederherstellen: () => Promise<void>,
  messung: () => Promise<void>,
): Promise<void> {
  let letzterFehler: unknown = null;
  for (let versuch = 1; versuch <= 3; versuch += 1) {
    if (avStatusVon(zeile.tabelle, zeile.id) !== "scanning") await wiederherstellen();
    await warteAufAvStatus(zeile.tabelle, zeile.id, "scanning", 30_000);

    try {
      await messung();
    } catch (fehler) {
      if (avStatusVon(zeile.tabelle, zeile.id) === "scanning") throw fehler;
      letzterFehler = fehler;
      continue;
    }

    const nachher = avStatusVon(zeile.tabelle, zeile.id);
    if (nachher === "scanning") return;
    letzterFehler = new Error(
      `Das Fenster war zu Ende, bevor der Messblock fertig war: ${zeile.tabelle}/${zeile.id} ` +
        `steht auf „${nachher}". Versuch ${versuch} von 3.`,
    );
  }
  throw letzterFehler;
}

/**
 * Eine Freigabe mit MEHREREN Dateien und ZUNAECHST OHNE BYTES.
 *
 * WARUM DIE BYTES DER INSEL ABGEFANGEN WERDEN — und das ist die tragende
 * Entscheidung dieses Tests: `anlegenAction` legt je Absendung eine NEUE
 * Freigabe an (`nanoid(10)`), es gibt keinen Weg, einer bestehenden Freigabe
 * spaeter eine Datei hinzuzufuegen. Ein Share mit `clean` UND `error` UND
 * `scanning` (Punkt 8) entsteht deshalb nur, wenn alle Zeilen in EINER Absendung
 * entstehen und danach EINZELN vollstaendig werden — der AV-Modus wird zwischen
 * den Dateien umgeschaltet. Ueber die Insel waere die Reihenfolge eine
 * Sub-Sekunden-Wette; hier ist sie bestimmt.
 *
 * Dieselbe Bauform wie Test 2 oben, samt `unroute` vor den eigenen `PUT`s.
 * Der Preis ist, dass die Insel drei Eintraege auf „fehler" zeigt — deshalb
 * misst Punkt 7 („der Melder sah keinen technischen Fehler") in Test 10 am
 * UNANGETASTETEN Abgabeweg.
 */
async function legeFreigabeOhneBytesAn(
  page: Page,
  namen: readonly string[],
  titel: string,
): Promise<string> {
  await page.route("**/api/upload/**", (route) => route.abort());
  await page.goto(`${V}/shares/neu`);
  await expect(page.getByTestId("files-neue-freigabe")).toBeVisible();

  await page.locator('input[name="title"]').fill(titel);
  await page.locator('input[name="expiryDays"]').fill("1");
  await page.locator('input[type="file"]').setInputFiles(
    namen.map((name) => ({ name, mimeType: "image/png", buffer: pngInhalt(KLEIN) })),
  );
  await page.getByRole("button", { name: /Freigabe anlegen/ }).click();

  const liste = page.getByTestId("files-upload-liste");
  await expect(liste).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-file-id][data-zustand="fehler"]')).toHaveCount(namen.length, {
    timeout: 60_000,
  });
  const shareId = await liste.getAttribute("data-share-id");
  expect(shareId, "die Insel muss die Freigabe-Kennung ausweisen").toBeTruthy();

  await page.unroute("**/api/upload/**");
  return shareId!;
}

/** Alle Bytes EINER Zeile in einem `PUT` — der Inhalt ist mit 4711 Byte weit
 *  unter der stillen 10-MiB-Kappe des Next-Proxys (Test 2). */
async function sendeAlleBytes(page: Page, fileId: string): Promise<void> {
  const antwort = await page.request.put(`${V}/api/upload/${fileId}?ab=0&ende=1`, {
    data: pngInhalt(KLEIN),
    headers: { "content-type": "image/png" },
  });
  expect(antwort.status(), await antwort.text()).toBe(200);
}

test("9 — fail-closed auf den drei Freigabe-Lesewegen: `error` UND `scanning` liefern kein Byte", async ({
  page,
}) => {
  // Kalter `next dev`: `/api/download/<id>/zip`, `/api/preview` und
  // `/shares/<id>` werden in DIESEM Test zum ersten Mal uebersetzt.
  test.setTimeout(300_000);

  const NAME_A = "t47-freigegeben.png";
  const NAME_B = "t47-pruefung-fehlgeschlagen.png";
  const NAME_C = "t47-pruefung-laeuft.png";

  setzeAvModus("ok");
  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });

  const shareId = await legeFreigabeOhneBytesAn(page, [NAME_A, NAME_B, NAME_C], "fail-closed T47");
  const ids = shareDateiIds(shareId);
  const idA = ids.get(NAME_A)!;
  const idB = ids.get(NAME_B)!;
  const idC = ids.get(NAME_C)!;
  expect([idA, idB, idC].every(Boolean), "drei Zeilen in der Freigabe").toBe(true);

  // --- Stufe 1: `ok` → Datei A wird freigegeben --------------------------
  await sendeAlleBytes(page, idA);
  await warteAufAvStatus("share_files", idA, "clean");

  // --- Stufe 2: `error` → Datei B ist ein ENDZUSTAND ---------------------
  setzeAvModus("error");
  await sendeAlleBytes(page, idB);
  await warteAufAvStatus("share_files", idB, "error");

  /*
   * WARMLAUF, KEIN TOTER CODE: die beiden Verwaltungsseiten werden hier zum
   * ersten Mal uebersetzt (kalter `next dev`, und `files-fileshare.spec.ts`
   * laeuft als erste files-Datei). Ohne diesen Aufruf faellt die Uebersetzung
   * spaeter in das ≈ 5 s kurze `scanning`-Fenster bzw. in den
   * Wiederherstellungsweg von `imScanningFenster`.
   */
  await page.goto(`${V}/shares/${shareId}`);
  await expect(page.getByTestId("files-share-detail")).toBeVisible({ timeout: 120_000 });

  // Punkt 1 und 3 in `error`.
  expect(
    (await page.request.get(`${V}/api/download/${shareId}?file=${idB}`)).status(),
    "eine Zeile in `error` liefert keine Bytes",
  ).toBe(403);
  expect(
    (await page.request.get(`${V}/api/preview/${shareId}?file=${idB}`)).status(),
    "auch die Vorschau ist ein Byte-Weg",
  ).toBe(403);

  // Punkt 2 in `error` — und zugleich der Warmlauf der ZIP-Route.
  const archivFehler = await archivVon(await page.request.get(`${V}/api/download/${shareId}/zip`));
  expect(archivFehler.map((e) => e.name).sort()).toEqual(["_HINWEIS.txt", NAME_A]);
  expect(hinweisAus(archivFehler)).toContain(fehlzeile(NAME_B, GRUND_ERROR));
  // C hat noch keine Bytes — der Grund ist ein ANDERER, und dass er
  // unterschieden wird, ist der Beleg, dass die Fehlliste nicht pauschal ist.
  expect(hinweisAus(archivFehler)).toContain(fehlzeile(NAME_C, GRUND_UNVOLLSTAENDIG));

  /*
   * DIE GEGENPROBE, und ohne sie waere dieser Test auch dann gruen, wenn das
   * Modul GAR NICHTS mehr ausliefert: die freigegebene Datei kommt durch.
   */
  const offen = await page.request.get(`${V}/api/download/${shareId}?file=${idA}`);
  expect(offen.status(), "die `clean`-Zeile MUSS ausgeliefert werden").toBe(200);
  expect((await offen.body()).length).toBe(KLEIN);

  // --- Stufe 3: `haengt` → Datei C steht auf `scanning` ------------------
  setzeAvModus("haengt");
  await sendeAlleBytes(page, idC);

  await imScanningFenster(
    { tabelle: "share_files", id: idC },
    async () => {
      // Der Wiederholen-Knopf aus T45 stellt `scanning` wieder her — derselbe
      // Uebergang, den Punkt 6 unten als Oberflaeche zusichert.
      await page.goto(`${V}/shares/${shareId}`);
      await page.getByTestId(`files-detail-av-wiederholen-${idC}`).click();
    },
    async () => {
      // Punkt 1 und 3 in `scanning`.
      expect((await page.request.get(`${V}/api/download/${shareId}?file=${idC}`)).status()).toBe(
        403,
      );
      expect((await page.request.get(`${V}/api/preview/${shareId}?file=${idC}`)).status()).toBe(403);

      // Punkt 2 in `scanning` — und der Grund unterscheidet sich woertlich von
      // dem der `error`-Zeile daneben. Beide stehen in DERSELBEN Fehlliste.
      const archiv = await archivVon(await page.request.get(`${V}/api/download/${shareId}/zip`));
      expect(archiv.map((e) => e.name).sort()).toEqual(["_HINWEIS.txt", NAME_A]);
      expect(hinweisAus(archiv)).toContain(fehlzeile(NAME_C, GRUND_SCANNING));
      expect(hinweisAus(archiv)).toContain(fehlzeile(NAME_B, GRUND_ERROR));

      /*
       * PUNKT 8, ERSTE HAELFTE: `clean` UND `scanning` in EINEM Share. Die
       * freigegebene Datei wird ausgeliefert (ihr Downloadlink steht da), die
       * andere erscheint als ZEILENZUSTAND — und ausdruecklich NICHT als
       * ganzseitiger Wartezustand, der die Freigabe verdeckte.
       */
      const seite = await (await page.request.get(`${V}/s/${shareId}`)).text();
      expect(seite).toContain(`/api/download/${shareId}?file=${idA}`);
      expect(seite).toContain("wird geprüft");
      expect(seite).toContain("Prüfung nicht möglich");
      expect(
        seite,
        "der ganzseitige Wartezustand gilt nur, wenn NICHTS freigegeben ist",
      ).not.toContain('data-testid="files-freigabe-warten"');
      expect(seite, "solange eine Zeile geprueft wird, laedt die Seite nach").toContain(
        'http-equiv="refresh"',
      );
    },
  );

  // --- Stufe 4: C faellt auf `error` — kein Dauerversuch ------------------
  await warteAufAvStatus("share_files", idC, "error");

  /*
   * PUNKT 8, ZWEITE HAELFTE: jetzt ist keine Zeile mehr `scanning`, und die
   * Seite laedt NICHT mehr nach. Ohne diese Zusicherung frischte eine Freigabe
   * mit dauerhaft fehlgeschlagener Pruefung auf einem fremden Handy fuer immer
   * alle 5 Sekunden nach. Die freigegebene Datei steht weiterhin bereit.
   */
  const ruhend = await (await page.request.get(`${V}/s/${shareId}`)).text();
  expect(ruhend).not.toContain('http-equiv="refresh"');
  expect(ruhend).toContain(`/api/download/${shareId}?file=${idA}`);
  expect(ruhend).toContain("Prüfung nicht möglich");

  /*
   * PUNKT 6, ERSTE STELLE: die Verwaltung sagt, was los ist — und bietet den
   * einzigen Weg zurueck an. An `clean` steht KEIN Knopf: `avWiederholenAction`
   * kennt nur `error → scanning`, und ein Knopf an einer Zeile, an der die
   * Action nichts tut, waere eine Sackgasse.
   */
  await page.goto(`${V}/shares/${shareId}`);
  await expect(page.getByTestId("files-share-detail")).toBeVisible();
  await expect(page.getByText("Prüfung nicht möglich").first()).toBeVisible();
  await expect(page.getByTestId(`files-detail-av-wiederholen-${idB}`)).toBeVisible();
  await expect(page.getByTestId(`files-detail-av-wiederholen-${idC}`)).toBeVisible();
  await expect(page.getByTestId(`files-detail-av-wiederholen-${idA}`)).toHaveCount(0);
});

/**
 * Legt einen Abgabelink UEBER DIE OBERFLAECHE an und gibt seine volle Adresse
 * zurueck.
 *
 * NICHT ueber ein `INSERT` wie in `files-inbox.spec.ts`: dort war `/zugangslinks`
 * eine Seite derselben Wellenstufe und damit ausgeschlossen — hier ist sie da,
 * und der Weg ueber die Oberflaeche spart einen zweiten Schreibweg in dieselbe
 * Datenbank. Der Rohtoken wird genau EINMAL ausgegeben (§8.4); die Adresse steht
 * am Link der Ausgabe und traegt den INBOX-Host samt Port.
 */
async function legeAbgabelinkAn(page: Page, name: string): Promise<string> {
  await page.goto(`${V}/zugangslinks`);
  await expect(page.getByTestId("files-zugangslinks")).toBeVisible({ timeout: 120_000 });
  // Das Formular haengt an einem Umschalter — es steht nicht dauerhaft offen.
  await page.getByTestId("files-zugangslink-anlegen").click();
  await page.locator('input[name="name"]').fill(name);
  await page.getByTestId("files-zugangslink-absenden").click();

  const link = page.getByTestId("files-zugangslink-link");
  await expect(link).toBeVisible({ timeout: 60_000 });
  const adresse = await link.getAttribute("href");
  expect(adresse, "die einmalige Ausgabe muss die Adresse tragen").toBeTruthy();
  // Der Erzeugungshost ist `files.…`, die Nutzlast muss `drop.…` tragen
  // (Analyse-Falle 17) — sonst laeuft die Abgabe unten in eine 404.
  expect(adresse!).toContain(`${INBOX}:3100/u/`);
  return adresse!;
}

/**
 * EINE Abgabe auf einem fremden Handy — und der Beleg fuer Punkt 7 bei JEDER
 * Abgabe, auch der in `error` und `haengt`: die Quittung steht da, und der
 * Melder sieht KEINEN technischen Fehler. Die Virenpruefung ist asynchron; sie
 * darf die Abgabe nicht scheitern lassen, sondern nur die spaetere Ausgabe.
 */
async function gibAb(page: Page, adresse: string, dateiname: string): Promise<void> {
  await page.goto(adresse);
  await expect(page.getByTestId("files-abgabe")).toBeVisible({ timeout: 120_000 });
  await page.locator('input[type="radio"][value="dokumente"]').check();
  await page.locator("#abgabe-dateien").setInputFiles([
    {
      name: dateiname,
      mimeType: "text/plain",
      buffer: Buffer.from(`Abgabe ${dateiname}\n`, "utf8"),
    },
  ]);
  await page.getByTestId("abgabe-absenden").click();
  await expect(page.getByTestId("eintrag-quittung")).toHaveCount(1, { timeout: 60_000 });
  await expect(
    page.getByTestId("eintrag-fehler"),
    "der Melder darf von der Virenpruefung nichts merken",
  ).toHaveCount(0);
  await expect(
    page.locator(`[data-testid="abgabe-eintrag"][data-datei="${dateiname}"]`),
  ).toHaveAttribute("data-zustand", "fertig");
}

test("10 — fail-closed auf den beiden Posteingang-Lesewegen, und die Abgabe bleibt quittiert", async ({
  page,
}) => {
  test.setTimeout(300_000);

  // Je Lauf eindeutig: alle Testdateien teilen sich eine Datenbank, und ein
  // fester Name traefe im zweiten Lauf auf die Zeile des ersten.
  const stempel = Date.now();
  const NAME_D = `t47-inbox-freigegeben-${stempel}.txt`;
  const NAME_E = `t47-inbox-fehlgeschlagen-${stempel}.txt`;
  const NAME_F = `t47-inbox-laeuft-${stempel}.txt`;

  setzeAvModus("ok");
  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE });
  const abgabe = await legeAbgabelinkAn(page, `T47 fail-closed ${stempel}`);

  // --- Stufe 1: `ok` → Abgabe D wird freigegeben -------------------------
  await gibAb(page, abgabe, NAME_D);
  const idD = inboxDateiId(NAME_D);
  await warteAufAvStatus("inbox_files", idD, "clean");

  // --- Stufe 2: `error` → Abgabe E ist ein ENDZUSTAND --------------------
  setzeAvModus("error");
  await gibAb(page, abgabe, NAME_E);
  const idE = inboxDateiId(NAME_E);
  await warteAufAvStatus("inbox_files", idE, "error");

  // Warmlauf, kein toter Code — Begruendung wie in Test 9.
  await page.goto(`${V}/posteingang`);
  await expect(page.getByTestId("files-posteingang")).toBeVisible({ timeout: 120_000 });

  // Punkt 4 in `error`.
  expect(
    (await page.request.get(`${V}/api/inbox/${idE}`)).status(),
    "eine Abgabe in `error` liefert keine Bytes",
  ).toBe(403);

  // Punkt 5 in `error` — dieselbe Ausschlussregel wie beim Freigabe-ZIP.
  const postFehler = await archivVon(
    await page.request.get(`${V}/api/inbox/zip?ids=${idD},${idE}`),
  );
  expect(postFehler.map((e) => e.name).sort()).toEqual(["_HINWEIS.txt", NAME_D]);
  expect(hinweisAus(postFehler)).toContain(fehlzeile(NAME_E, GRUND_ERROR));

  // Die Gegenprobe: die freigegebene Abgabe kommt durch.
  const offen = await page.request.get(`${V}/api/inbox/${idD}`);
  expect(offen.status(), "die `clean`-Abgabe MUSS ausgeliefert werden").toBe(200);
  expect(await offen.text()).toBe(`Abgabe ${NAME_D}\n`);

  // --- Stufe 3: `haengt` → Abgabe F steht auf `scanning` -----------------
  setzeAvModus("haengt");
  await gibAb(page, abgabe, NAME_F);
  const idF = inboxDateiId(NAME_F);

  await imScanningFenster(
    { tabelle: "inbox_files", id: idF },
    async () => {
      await page.goto(`${V}/posteingang`);
      await page.getByTestId(`files-inbox-av-wiederholen-tabelle-${idF}`).click();
    },
    async () => {
      // Punkt 4 in `scanning`.
      expect((await page.request.get(`${V}/api/inbox/${idF}`)).status()).toBe(403);

      // Punkt 5 in `scanning` — mit dem Grund, der `scanning` von `error`
      // unterscheidet.
      const archiv = await archivVon(
        await page.request.get(`${V}/api/inbox/zip?ids=${idD},${idE},${idF}`),
      );
      expect(archiv.map((e) => e.name).sort()).toEqual(["_HINWEIS.txt", NAME_D]);
      expect(hinweisAus(archiv)).toContain(fehlzeile(NAME_F, GRUND_SCANNING));
      expect(hinweisAus(archiv)).toContain(fehlzeile(NAME_E, GRUND_ERROR));
    },
  );

  // --- Stufe 4: F faellt auf `error`, und die Verwaltung sagt es ---------
  await warteAufAvStatus("inbox_files", idF, "error");

  /*
   * PUNKT 6, ZWEITE STELLE: „Prüfung nicht möglich" MIT Wiederholen-Knopf, an
   * jeder `error`-Zeile und an keiner anderen. Die Kartenliste steht im selben
   * Markup (`nurMobil`), deshalb traegt jeder Griff die Darstellung im Namen.
   */
  await page.goto(`${V}/posteingang`);
  await expect(page.getByTestId("files-posteingang-tabelle")).toBeVisible();
  await expect(page.getByText("Prüfung nicht möglich").first()).toBeVisible();
  await expect(page.getByTestId(`files-inbox-av-wiederholen-tabelle-${idE}`)).toBeVisible();
  await expect(page.getByTestId(`files-inbox-av-wiederholen-tabelle-${idF}`)).toBeVisible();
  await expect(page.getByTestId(`files-inbox-av-wiederholen-tabelle-${idD}`)).toHaveCount(0);
});
