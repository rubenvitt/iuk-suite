import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

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
): Promise<void> {
  await page.goto(`${V}/shares/neu`);
  await expect(page.getByTestId("files-neue-freigabe")).toBeVisible();

  await page.locator('input[name="title"]').fill(titel);
  await page.locator('input[name="expiryDays"]').fill("1");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: datei.name, mimeType: "image/png", buffer: datei.buffer });
  await page.getByRole("button", { name: /Freigabe anlegen/ }).click();
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
