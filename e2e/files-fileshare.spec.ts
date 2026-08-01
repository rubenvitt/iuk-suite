import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
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

/** Die Modulgruppe aus dem Registry-Eintrag (`adminGroups: ["drk-files-admin"]`). */
const GRUPPE = "drk-files-admin";

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
