import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { nanoid } from "nanoid";

import { zugangslinks } from "@/app/m/files/_db/schema";
import { erzeugeToken, tokenHash } from "@/app/m/files/_lib/token";
import { devLogin } from "./fixtures";
import { setzeAvModus } from "./helpers/avModus";

/**
 * DIE ANONYME ABGABE ÜBER DEN INBOX-HOST — `/u/<token>` (Spec §8.1–§8.3, Plan T38).
 *
 * WAS NUR HIER MESSBAR IST: die ganze Kette vom Handy bis zur Zeile — echter
 * Host-Rewrite, echter Chunk-PUT, echte MIME-Feststellung aus den Bytes. Zwei
 * Zusagen hängen daran, die kein Vitest halten kann:
 *
 * 1. **`.txt` kommt durch.** `text/plain` ist der einzige Allowlist-Typ OHNE
 *    Signatur (`_lib/mime.ts`); der Server nimmt ihn nur an, wenn der letzte
 *    Chunk `typ=text/plain` in der QUERY trägt (nicht im `Content-Type`-Kopf).
 *    Fehlt der Parameter, lädt die PNG-Datei anstandslos hoch und die
 *    Textdatei bekommt 415 — die Lücke fällt also genau bei dem Typ auf, den
 *    niemand zuerst probiert. Deshalb liegen hier bewusst BEIDE Formate.
 * 2. **Ein ungültiges Token bekommt HTTP 200 mit Korrekturaufforderung**, keinen
 *    Redirect und keine Fehlerseite — und der eingegebene Token taucht danach
 *    weder in der Adresse noch im Markup auf. `drop` antwortet heute `302` auf
 *    `/?error=invalid_token&token=<eingabe>`; ein gültiges Token stünde damit in
 *    Browser-History und Referer.
 *
 * DIESE DATEI STELLT IHREN ZUSTAND SELBST HER. Die Playwright-Datenbank wird
 * einmal je Lauf gelöscht, aber alle Dateien teilen sie sich (`workers: 1`, in
 * Pfadreihenfolge); ein Test, der „hier liegt ein Abgabelink" voraussetzt, ist
 * entweder allein grün oder in der Suite grün, nie beides
 * (`docs/design/README.md:214-220`).
 */

/**
 * DER PFAD STEHT HIER AUSGESCHRIEBEN UND KOMMT NICHT AUS `moduleDbPath()`.
 *
 * `DATA_DIR=./.data/e2e` setzt `playwright.config.ts` in `webServer.env` — das
 * erreicht ausschließlich den SERVERprozess. Im Testprozess ist die Variable
 * nicht gesetzt, `moduleDbPath("files")` liefe also auf `./.data/files.db`: der
 * Test säte in die ENTWICKLUNGSdatenbank, der Server läse eine andere Datei,
 * und `/u/<token>` antwortete „nicht (mehr) gültig" — ein Fehlschlag, der wie
 * ein Defekt der Seite aussieht. Nebenbei wäre der lokale Datenbestand
 * verschmutzt.
 */
const DB_PFAD = "./.data/e2e/files.db";

const INBOX = "drop.localtest.me";
const I = `http://${INBOX}:3100`;

/**
 * DER ANDERE HOST. Der Posteingang liegt in der Route-Group `(verwaltung)` und
 * ist unter `drop.…` ein 404 — dass die Abgabe von DORT hier ankommt, ist die
 * eigentliche Aussage des vierten Tests (Analyse-Falle 17).
 */
const VERWALTUNG = "files.localtest.me";
const V = `http://${VERWALTUNG}:3100`;

/** Die Modulgruppe aus dem Registry-Eintrag (`adminGroups: ["iuk-files-admin"]`). */
const GRUPPE = "iuk-files-admin";

/**
 * Legt einen Abgabelink an und gibt den Rohtoken zurück.
 *
 * ÜBER DRIZZLE UND NICHT ÜBER EIN HANDGESCHRIEBENES `INSERT`: `expires_at` ist
 * `mode: "timestamp"` und damit Unix-SEKUNDEN, nicht Millisekunden wie im Modul
 * `qr`. Ein `Date.now()` in der Spalte wäre ein Faktor-1000-Fehler — die Laufzeit
 * läge dann rund 55.000 Jahre in der Zukunft, der Test bliebe grün, und die
 * Ablaufprüfung wäre unbelegt. Drizzle rechnet die Einheit um.
 *
 * NICHT über `zugangslinkAnlegenAction`: die Action verlangt eine angemeldete
 * Sitzung (`requireFilesAccess`) und ist aus einem Playwright-Prozess nicht
 * aufrufbar; der einzige Weg über die Oberfläche wäre `/zugangslinks` — eine
 * Seite aus DERSELBEN Wellenstufe, und damit genau die Abhängigkeitskante, die
 * der Plan (§2439) ausschließt.
 */
function legeAbgabelinkAn(
  name: string,
  laufzeitStunden = 24,
  opts: { widerrufen?: boolean } = {},
): string {
  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — läuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);

  const token = erzeugeToken();
  const jetzt = new Date();
  const sqlite = new Database(DB_PFAD);
  try {
    // Derselbe Wartewert wie in `core/db`: der Serverprozess hält dieselbe
    // Datei offen, und ohne ihn scheitert ein Schreibversuch sofort mit
    // SQLITE_BUSY statt kurz zu warten.
    sqlite.pragma("busy_timeout = 5000");
    drizzle(sqlite)
      .insert(zugangslinks)
      .values({
        id: nanoid(10),
        name,
        tokenStart: token.slice(0, 7),
        tokenHash: tokenHash(token),
        createdAt: jetzt,
        createdBy: "e2e",
        expiresAt: new Date(jetzt.getTime() + laufzeitStunden * 60 * 60 * 1000),
        /*
         * WIDERRUF IST KEIN ZEILENLÖSCHEN (§8.6): `revoked_at` bleibt stehen,
         * damit die `token_id`-Bezüge der schon empfangenen Uploads erhalten
         * bleiben. Der Link ist danach GÜLTIG SYNTAKTISCH und trotzdem
         * abgelehnt — genau der Fall, den Test 5 von „unbekanntes Token"
         * unterscheidet.
         */
        revokedAt: opts.widerrufen ? jetzt : null,
        // Großzügig: T50 erzwingt das Mengenbudget in derselben Stufe, und ein
        // knappes Budget ließe die zweite Datei mit 429 auflaufen — ein
        // Fehlschlag, der nach einem Defekt des Formulars aussähe.
        budgetDateien: 50,
        budgetBytes: 50 * 1024 * 1024,
      })
      .run();
  } finally {
    sqlite.close();
  }
  return token;
}

/** Acht Bytes PNG-Signatur plus Rest — mehr braucht `signaturTyp` nicht. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

test("1 — zwei Dateien mit Hinweis und Kategorie: zwei Quittungen, je Datei einzeln", async ({
  page,
}) => {
  const token = legeAbgabelinkAn("E2E Abgabe zwei Dateien");

  const res = await page.goto(`${I}/u/${token}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("files-abgabe")).toBeVisible();

  // Ein Hinweis und eine Kategorie für den ganzen Vorgang (§8.3) — nicht
  // positionsgebunden wie im Multipart-Body von `drop`.
  await page.locator("#abgabe-hinweis").fill("Lage Nord, Übergabe 21:30");
  // Eine ECHTE Radiogruppe: `check()` würde an einer Knopfreihe scheitern.
  await page.locator('input[type="radio"][value="dokumente"]').check();

  await page.locator("#abgabe-dateien").setInputFiles([
    {
      // `.txt` ist der Prüfstein: ohne `typ=text/plain` im letzten Chunk
      // antwortet der Server 415, weil es für Text keine Signatur gibt.
      name: "lage.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Einsatzstelle geräumt, Übergabe erfolgt.\n", "utf8"),
    },
    { name: "bild.png", mimeType: "image/png", buffer: PNG },
  ]);

  await expect(page.getByTestId("abgabe-eintrag")).toHaveCount(2);
  await page.getByTestId("abgabe-absenden").click();

  // ZWEI Quittungen, nicht eine Sammelmeldung: „je Datei einzeln" ist die
  // Zusage, und mit nur einer Datei wäre sie nicht von einer Sammelmeldung zu
  // unterscheiden.
  await expect(page.getByTestId("eintrag-quittung")).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId("eintrag-fehler")).toHaveCount(0);

  for (const name of ["lage.txt", "bild.png"]) {
    const zeile = page.locator(`[data-testid="abgabe-eintrag"][data-datei="${name}"]`);
    await expect(zeile).toHaveAttribute("data-zustand", "fertig");
    await expect(zeile.getByTestId("eintrag-quittung")).toBeVisible();
  }
});

test("2 — ein unbekanntes Token: HTTP 200 mit Korrekturaufforderung, kein Redirect, kein Token in der Adresse", async ({
  page,
}) => {
  // Syntaktisch gültig (`dz-xxxx-xxxx-xxxx`) und in keiner Zeile — damit die
  // Antwort aus der AUFLÖSUNG kommt und nicht aus der Grammatik.
  const unbekannt = "dz-2345-6789-abcd";
  const res = await page.goto(`${I}/u/${unbekannt}`);

  // 200, nicht 401 und nicht 404: der Melder steht mit einem gedruckten Zettel
  // vor dem Handy und braucht eine Korrektur, keine Fehlerseite (§8.1).
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("files-abgabe-ungueltig")).toBeVisible();
  await expect(page.getByText("Dieser Abgabelink ist nicht (mehr) gültig")).toBeVisible();
  // KEIN Formular — sonst liefe die Abgabe in ein 401 statt vorher zu stoppen.
  await expect(page.getByTestId("abgabe-formular")).toHaveCount(0);

  // KEIN Redirect und KEIN Token-Parameter: `drop` hängt ihn heute an
  // `/?error=invalid_token&token=<eingabe>` und legt ihn damit in History und
  // Referer ab. Bei einem GÜLTIGEN Token wäre das ein Zugangsdatum.
  const adresse = new URL(page.url());
  expect(adresse.pathname).toBe(`/u/${unbekannt}`);
  expect(adresse.search).toBe("");
});

test("3 — ein grammatikalisch unmögliches Token endet auf derselben Seite, ohne den Text zu spiegeln", async ({
  page,
}) => {
  // `0`, `1`, `l` und `o` sind nicht im Alphabet; `normalisiereToken` lehnt ab,
  // bevor überhaupt eine Datenbankzeile gesucht wird.
  const unsinn = "dz-0000-1111-llll";
  const res = await page.goto(`${I}/u/${unsinn}`);

  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("files-abgabe-ungueltig")).toBeVisible();

  /*
   * Der eingegebene Text wird NICHT in den sichtbaren Seitentext gespiegelt.
   * Für einen Tippfehler wäre das harmlos; dieselbe Seite nimmt aber auch einen
   * fast richtigen — also fast gültigen — Token entgegen, und der stünde dann in
   * jedem Bildschirmfoto, das jemand an den I&K schickt.
   *
   * GEMESSEN WIRD DER SICHTBARE TEXT, nicht `page.content()`. Der Pfad steht
   * zwangsläufig im Markup: Next legt den Routenbaum als Flight-Daten in ein
   * `<script>`, und die Adresszeile trägt ihn ohnehin. Eine Zusicherung über den
   * rohen Rumpf wäre deshalb nicht schärfer, sondern schlicht unerfüllbar —
   * nachgemessen: sie fiel an genau dieser Stelle.
   */
  expect(await page.locator("body").innerText()).not.toContain(unsinn);
});

/**
 * DER POSTEINGANG AUF DEM ANDEREN HOST (Spec §8.6, Plan T43).
 *
 * WAS NUR HIER MESSBAR IST: die Kette von der anonymen Abgabe auf `drop.…` bis
 * zur Zeile auf `files.…` — echter Host-Rewrite in beide Richtungen, echter
 * Chunk-PUT, echte AV-Kette (Fake-Scanner T14, Warteschlange T17, Startpunkt in
 * `_lib/boot.ts` T22), echter Download über `/api/inbox/<id>`. Kein Vitest kann
 * das halten: die eine Hälfte liegt in einem Route Handler ohne Layout, die
 * andere hinter zwei verschiedenen `Host`-Kopfzeilen.
 *
 * GEWARTET WIRD AUF DEN ZUSTAND, NIE AUF EINE ZEITSPANNE. „Ab `clean`
 * herunterladbar" setzt den abgeschlossenen Scan voraus; vor `clean` antwortet
 * `/api/inbox/<id>` mit 403 (T32 Punkt 2). Ein Test, der sofort lädt, ist
 * rennabhängig grün — und ein `waitForTimeout` wäre dieselbe Wette mit mehr
 * Zeilen. Die Seite frischt sich nicht selbst auf, deshalb steht das `reload()`
 * IM Wiederholungsblock.
 */
test("4 — die anonyme Abgabe erscheint im Posteingang des anderen Hosts und ist ab `clean` herunterladbar", async ({
  page,
}) => {
  // In JEDEM Test, nicht einmal oben: der Fake liest die Modusdatei bei jeder
  // Verbindung, und T47 setzt im selben Lauf `error` (`workers: 1`).
  setzeAvModus("ok");

  const token = legeAbgabelinkAn("E2E Posteingang");
  // EINDEUTIG je Lauf: alle Dateien teilen sich eine Datenbank, und ein fester
  // Name träfe im zweiten Lauf auf die Zeile des ersten.
  const dateiname = `posteingang-${Date.now()}.txt`;
  const inhalt = "Meldung aus dem Posteingang-Test.\n";
  const hinweis = "Lage Süd, Übergabe 06:15";

  await page.goto(`${I}/u/${token}`);
  await expect(page.getByTestId("files-abgabe")).toBeVisible();
  await page.locator("#abgabe-hinweis").fill(hinweis);
  await page.locator('input[type="radio"][value="dokumente"]').check();
  await page.locator("#abgabe-dateien").setInputFiles([
    { name: dateiname, mimeType: "text/plain", buffer: Buffer.from(inhalt, "utf8") },
  ]);
  await page.getByTestId("abgabe-absenden").click();
  await expect(page.getByTestId("eintrag-quittung")).toHaveCount(1, { timeout: 30_000 });

  /*
   * HOSTWECHSEL. `/posteingang` liegt in der Route-Group `(verwaltung)`, deren
   * Layout `requireRolle("verwaltung")` UND `requireFilesAccess()` trägt — ohne
   * Anmeldung in der Modulgruppe gäbe es hier keine Seite, sondern einen Login.
   */
  await devLogin(page, { host: VERWALTUNG, groups: GRUPPE, callbackPath: "/posteingang" });
  await page.goto(`${V}/posteingang`);

  const zeile = () =>
    page.locator("tbody.ant-table-tbody tr.ant-table-row").filter({ hasText: dateiname });

  await expect(zeile()).toHaveCount(1);
  // HINWEIS UND KATEGORIE stehen in der Zeile — beide sind Angaben, die die
  // abgebende Person gemacht hat, und ohne sie wäre die Ansicht eine
  // Dateiliste statt eines Postfachs.
  await expect(zeile()).toContainText(hinweis);
  await expect(zeile()).toContainText("dokumente");
  // Und der Abgabelink, an dem sie hängt: `token_start` im Klartext.
  await expect(zeile()).toContainText(token.slice(0, 7));

  await expect(async () => {
    await page.reload();
    await expect(zeile()).toContainText("freigegeben");
  }).toPass({ timeout: 60_000 });

  const adresse = await zeile()
    .locator("[data-testid^='files-inbox-download-tabelle-']")
    .getAttribute("href");
  expect(adresse, "der Download-Knopf trägt keine Adresse").not.toBeNull();

  const antwort = await page.request.get(`${V}${adresse}`);
  expect(antwort.status()).toBe(200);
  // `attachment`, nicht `inline`: der Posteingang liefert aus, er zeigt nicht an.
  expect(antwort.headers()["content-disposition"]).toContain("attachment");
  expect(await antwort.text()).toBe(inhalt);
});

/**
 * EIN WIDERRUFENER LINK LEHNT AB — MIT HTTP 200, NICHT MIT 404.
 *
 * Der Unterschied ist die ganze Aussage: ein 404 sähe für den Melder aus wie
 * ein Tippfehler in der Adresse, und er tippte den gedruckten Code noch einmal.
 * Die Seite sagt stattdessen, dass DIESER Link nicht mehr gilt (§8.1) — und sie
 * sagt es mit demselben Satz wie bei einem unbekannten und einem abgelaufenen
 * Token, damit von außen nicht unterscheidbar ist, welcher der drei Fälle
 * vorliegt.
 */
test("5 — ein widerrufener Abgabelink lehnt ab, ohne 404", async ({ page }) => {
  const token = legeAbgabelinkAn("E2E widerrufen", 24, { widerrufen: true });

  const res = await page.goto(`${I}/u/${token}`);

  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("files-abgabe-ungueltig")).toBeVisible();
  await expect(page.getByText("Dieser Abgabelink ist nicht (mehr) gültig")).toBeVisible();
  // KEIN Formular: eine Abgabe liefe sonst erst beim ersten Chunk in ein 401.
  await expect(page.getByTestId("abgabe-formular")).toHaveCount(0);
});
