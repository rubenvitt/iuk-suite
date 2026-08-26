// src/app/m/radio/admin/(arbeit)/geraete/export/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../../../../_db/schema";
import { devices } from "../../../../_db/schema";
import { ohneKommentare } from "../../../../_lib/quelltextScan";
import { CSV_BOM, CSV_TRENNZEICHEN, EXPORT_SPALTEN } from "../../../../_lib/csv/spalten";

/**
 * DER CSV-EXPORT — `GET /admin/geraete/export`, Aufgabe V22 (`Spec:4379`, `Spec:4728`).
 *
 * ⛔ ER IST DER EINE LESE-HANDLER DER VERWALTUNG UND ERSETZT `export.ts:66-79`. Ein Route
 * Handler und keine Seite, weil die Antwort eine Datei ist und kein Dokument — `notFound()`
 * oder `redirect()` waeren im Antwortweg keine brauchbare Antwort auf einen Dateiabruf
 * (`Spec:4723-4729`, Bauform-Zulaessigkeitstafel Nr. 10).
 *
 * ⛔ DIE DREI HAELFTEN DER RIEGELFORM (B10/B11/B17, `Spec:99`/`:100`/`:117`, ausgeschrieben
 * `Spec:4379`; `riegel.test.ts` Klausel (c), gemessen `riegel.test.ts:406-465`, prueft sie
 * einzeln): `radioHostOderNull(` ja · `requireRadioHost(` nein · werfender Personen-Riegel
 * nein — und ⛔ **404, nie 403**. `riegel.test.ts` prueft die BAUFORM ueber den Quelltext,
 * diese Datei prueft das VERHALTEN. Zwei Fragen, zwei Dateien.
 *
 * ⛔ `istRadioAdmin`, NICHT DIE VERWALTUNGSSTUFE. Rechtetafel `Spec:4444-4454`, Zeile
 * „CSV-Export": Admin ja, Updater **nein** (`Spec:4451`); Alt-Beleg `export.ts:71`
 * (`requireRole('admin')`). ⚠️ UND DER FALSCHE GRIFF IST DER NAHELIEGENDE: der Handler liegt
 * unter `admin/(arbeit)/`, wo `Spec:4367`/`:4369-4375` alles andere auf
 * `requireRadioVerwaltung` setzt. Der Fall „als Updater … 404" ist der einzige, den ein
 * versehentliches Absenken auf die Verwaltungsstufe still gruen liesse — der Quelltext-Scan
 * faengt ihn NICHT, weil ein nicht-werfendes Verwaltungs-Praedikat keinen der beiden
 * werfenden Namen enthaelt.
 *
 * DREI MOCKS, JEDER MIT SEINEM GRUND (Form 1:1 aus
 * `admin/(arbeit)/import/hochladen/route.test.ts:53-66`):
 *
 *   `next/navigation` — ⛔ DER MESSPUNKT FUER B11. Ein werfender Personen-Riegel endete hier
 *   in `redirect('/login?…')`; die Attrappe macht daraus einen ERKENNBAREN Wurf, und der Fall
 *   „ohne Sitzung … 404, nicht mit einer Weiterleitung" wird dadurch rot statt still gruen.
 *   Ohne sie faenge ihn niemand.
 *
 *   `@/core/auth` — `viewerOderNull()` liest das Session-JWT (`_lib/zugang.ts:95-97`); der
 *   Test steuert damit Sitzung und Stufe.
 *
 *   `../../../../_db/client` — die Datenquelle des Handlers. ⛔ NICHT `getModuleDb()`, dessen
 *   Cache per Modulschluessel gekeyt ist und nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).
 */
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    throw new Error(`NEXT_REDIRECT:${ziel}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
vi.mock("../../../../_db/client", () => ({ getDb: () => testDb }));

import { GET } from "./route";

const QUELLE = "src/app/m/radio/admin/(arbeit)/geraete/export/route.ts";
const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const UPDATER_GRUPPE = "eine-updater-gruppe";

const ADMIN_SITZUNG = { user: { id: "sub-admin", name: "Adam Admin", groups: ["iuk-radio-admin"] } };
const UPDATER_SITZUNG = { user: { id: "sub-updater", name: "Uwe Updater", groups: [UPDATER_GRUPPE] } };

let tmp: string;
let sqlite: Database.Database;

const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const alterHost = process.env.SUITE_HOST_RADIO;

/**
 * ⛔ DREI GERAETE, UND DAS MITTLERE IST NICHT AUSLEIHBAR. Es ist der Gegenfall zum
 * `loanable`-Filter: `geraeteFuerExport` ersetzt `listAllDevices`
 * (`deviceRepo.ts:63-65`, „All devices, newest-first. Backs the full CSV export") und darf
 * NICHT filtern, waehrend `geraeteMitLeihstand` daneben filtern MUSS
 * (`deviceRepo.ts:53-59`). Ein Export, der stillschweigend nur die ausleihbaren Geraete
 * traegt, ist ein unvollstaendiger Datenbestand ohne Fehlermeldung.
 *
 * ⛔ DIE DREI `createdAt` STEHEN AUSEINANDER, damit `desc(createdAt)` eine ablesbare
 * Reihenfolge hat — mit gleichen Zeitstempeln waere jede Reihenfolgezusage unten zufaellig.
 */
const ALT = new Date(1_700_000_000_000);
const MITTE = new Date(1_700_000_060_000);
const NEU = new Date(1_700_000_120_000);

function saeeGeraete(): void {
  testDb!
    .insert(devices)
    .values([
      {
        id: "g-alt",
        issi: "1000001",
        rufname: "41/12",
        status: "Einsatzbereit",
        loanable: true,
        alamosIntegrated: true,
        lastUpdatedAt: "2026-08-01",
        deviceModes: "TMO,DMO",
        createdAt: ALT,
        updatedAt: ALT,
      },
      {
        id: "g-mitte",
        issi: "1000002",
        rufname: "41/13",
        status: "Wartung",
        loanable: false,
        alamosIntegrated: null,
        lastUpdatedAt: null,
        createdAt: MITTE,
        updatedAt: MITTE,
      },
      {
        id: "g-neu",
        // ⛔ EIN SEMIKOLON IM WERT — die Maskierungsregel aus `_lib/csv/spalten.ts` ist
        // sonst in dieser Datei unbelegt, und eine unmaskierte Zelle verschoebe beim
        // Re-Import jede Folgespalte um eins.
        rufname: "41/14; Reserve",
        issi: "1000003",
        loanable: true,
        createdAt: NEU,
        updatedAt: NEU,
      },
    ])
    .run();
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-export-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  testDb = drizzle(sqlite, { schema });
  sitzung = ADMIN_SITZUNG;
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_HOST_RADIO;
  process.env.SUITE_UPDATER_GROUP_RADIO = UPDATER_GRUPPE;
});

afterEach(() => {
  testDb = null;
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  for (const [name, wert] of [
    ["SUITE_ADMIN_GROUP_RADIO", alterAdmin],
    ["SUITE_UPDATER_GROUP_RADIO", alterUpdater],
    ["SUITE_HOST_RADIO", alterHost],
  ] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
});

/**
 * ⛔ `x-forwarded-host` UND NICHT `host`: `resolveHost` (`src/core/routing.ts:36-41`) liest
 * ihn mit Vorrang, und `Host` ist in undicis `Headers` mit dem Request-Waechter ein
 * verbotener Name — ein Test, der ihn setzt, misst am Ende die leere Zeichenkette.
 */
const RADIO_HOST = { "x-forwarded-host": "radio.localtest.me" };
const FREMDER_HOST = { "x-forwarded-host": "feedback.localtest.me" };

function anfrage(kopf: HeadersInit = RADIO_HOST): Request {
  return new Request("http://radio.localtest.me/admin/geraete/export", {
    method: "GET",
    headers: kopf,
  });
}

/**
 * Die Kopfzeile wird GELESEN, nicht abgeschrieben (`_lib/csv/spalten.ts:91-111`). Eine
 * zweite Abschrift waere die Stelle, an der eine Spaltenumbenennung still auseinanderlaeuft
 * — und sie truege ausserdem einen Umlaut in einem zitierten Wert.
 */
const KOPFZEILE = EXPORT_SPALTEN.map((spalte) => spalte.kopf).join(CSV_TRENNZEICHEN);

/** Der Rumpf ohne BOM, in Zeilen zerlegt; die Schlusszeile ist leer und faellt heraus. */
function zeilenAus(text: string): string[] {
  const ohneBom = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  return ohneBom.split("\n").filter((zeile) => zeile !== "");
}

describe("GET /admin/geraete/export — der Riegel, alles IN der Route (B11)", () => {
  it("auf einem fremden Host antwortet der Handler 404", async () => {
    /*
     * ⛔ ERSTE ZEILE DES HANDLERS, und der Grund ist Falle 61 (`_lib/host.ts:10-20`):
     * `decideRoute` gatet einen internen Pfad `/m/<key>/...` nach dem Modulsegment, ohne
     * jeden Hostbezug (`src/core/routing.ts:68-76`) — JEDER Host, der auf den
     * Suite-Container terminiert, antwortet damit auf `/m/radio/*`. Der Riegel steht in der
     * Route selbst, weil ein Route Handler KEIN Layout ueber sich hat.
     *
     * ⛔ 404 UND NICHT 403 (B10, `Spec:99`): „Der Preis der Abweichung waere, dass
     * `GET /admin/geraete/export` den Bestand an Verwaltungspfaden aufzaehlbar macht,
     * waehrend die Seiten daneben schweigen; kein Tor sieht es, beide Zweige sind gueltiges
     * HTTP."
     */
    saeeGeraete();
    const antwort = await GET(anfrage(FREMDER_HOST));
    expect(antwort.status, "ein fremder Host erreicht den Export").toBe(404);
  });

  it("ohne Sitzung antwortet der Handler 404, nicht mit einer Weiterleitung", async () => {
    /*
     * ⛔ B11 ALS VERHALTENSFALL (`Spec:100`, ausgeschrieben `Spec:4379`, bestaetigt B17
     * `Spec:117`) — er faengt ein versehentliches `requireRadioAdmin()`. Jener wirft
     * `redirect('/login?…')`; die Attrappe von `next/navigation` macht daraus einen Wurf,
     * und dieser Fall wird rot statt still gruen. Woertlich umgesetzt landete ein anonymer
     * GET auf `/admin/geraete/export` in einem LOGIN-UMWEG — typkorrekt, lint-sauber.
     */
    saeeGeraete();
    sitzung = null;
    const antwort = await GET(anfrage());
    expect(antwort.status, "eine anonyme Anfrage erreicht den Export").toBe(404);
  });

  it("als Updater antwortet der Handler 404", async () => {
    /*
     * ⛔ DER FALL, DEN EIN VERWALTUNGS-PRAEDIKAT STILL GRUEN LIESSE. Rechtetafel
     * `Spec:4451`: „CSV-Export — Admin ja, Updater **nein**"; Alt-Beleg `export.ts:71`
     * (`requireRole('admin')`). ⛔ ER IST HIER DER TRAGENDE WAECHTER UND NICHT DER SCAN:
     * ein `istRadioVerwaltung`-artiges Praedikat traegt keinen der beiden werfenden Namen,
     * `riegel.test.ts` Klausel (c) bliebe darueber gruen. Gemessen als Sonde S-V22c in
     * `.superpowers/sdd/planteil4/BERICHT-V22.md`.
     *
     * Die Updater-Stufe ist ECHT besetzt (`SUITE_UPDATER_GROUP_RADIO` gesetzt, die Sitzung
     * traegt die Gruppe) — sonst maesse der Fall nur „irgendeine fremde Gruppe".
     */
    saeeGeraete();
    sitzung = UPDATER_SITZUNG;
    const antwort = await GET(anfrage());
    expect(antwort.status, "die Updater-Stufe erreicht den Export").toBe(404);
  });

  it("als Admin antwortet der Handler mit text/csv", async () => {
    /*
     * Der positive Fall. ⛔ DER MEDIENTYP STEHT ZEICHENGLEICH IM BESTAND
     * (`export.ts:73`, `'text/csv; charset=utf-8'`) — ohne `charset` oeffnet deutsches
     * Excel die Datei in seiner Systemkodierung, und das BOM allein traegt die Zusage nur
     * fuer Excel, nicht fuer jeden anderen Leser.
     */
    saeeGeraete();
    const antwort = await GET(anfrage());
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  });

  it("die Antwort beginnt mit dem BOM", async () => {
    /*
     * ⛔ `export.ts:9`, `:61`: „UTF-8 BOM so Excel opens the `;`-delimited file with correct
     * encoding." Ohne das BOM zeigt deutsches Excel jeden Umlaut der Kopfzeile
     * („Gerätefunktionen", `export.ts:33`) als Ersatzzeichen — und die Datei laeuft trotzdem
     * durch jeden Test, der nur den Text vergleicht.
     *
     * ⛔ GEMESSEN WERDEN DIE BYTES, NICHT DER DEKODIERTE TEXT. Ein `TextDecoder` mit
     * eingeschaltetem BOM-Schnitt entfernt es beim Lesen still — der Fall pruefte dann seine
     * eigene Dekodierung statt der Antwort. Dieselbe Familie wie die Testfallen 10 bis 12
     * (`CLAUDE.md`): ein Test, der etwas anderes misst, als sein Name sagt.
     */
    saeeGeraete();
    const antwort = await GET(anfrage());
    const bytes = new Uint8Array(await antwort.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]], "das fuehrende UTF-8-BOM fehlt").toEqual([
      0xef, 0xbb, 0xbf,
    ]);
  });

  it("die Antwort traegt einen Dateinamen im Content-Disposition", async () => {
    /*
     * ⛔ ZEICHENGLEICH AUS `export.ts:74`. Der Ausloeser in Insel 1 ist ein Anker mit
     * `download`-Attribut OHNE Wert (`DeviceList.tsx:104-111`, `anchor.download = ''`) — der
     * Name der gespeicherten Datei kommt also AUSSCHLIESSLICH aus dieser Kopfzeile. Faellt
     * sie weg, speichert der Browser die Datei unter dem letzten Pfadsegment `export`, ohne
     * Endung, und deutsches Excel oeffnet sie gar nicht erst.
     */
    saeeGeraete();
    const antwort = await GET(anfrage());
    expect(antwort.headers.get("content-disposition")).toBe(
      'attachment; filename="funkgeraete-export.csv"',
    );
  });

  it("der Rumpf traegt die neunzehn Kopfzeilen des Rundlaufvertrags", async () => {
    /*
     * ⛔ GELESEN, NICHT ABGESCHRIEBEN (`_lib/csv/spalten.ts:91-111`): eine zweite Abschrift
     * der Kopfzeilen waere die Stelle, an der der Rundlaufvertrag still auseinanderlaeuft.
     * Die 19 stehen als Zahl daneben, damit ein versehentlich abgeschnittener Satz nicht
     * durch die Gleichheit mit sich selbst gruen bleibt.
     */
    saeeGeraete();
    const antwort = await GET(anfrage());
    const zeilen = zeilenAus(await antwort.text());
    expect(EXPORT_SPALTEN.length, "der Rundlaufvertrag fuehrt neunzehn Spalten").toBe(19);
    expect(zeilen[0]).toBe(KOPFZEILE);
  });

  it("der Export enthaelt auch nicht ausleihbare Geraete", async () => {
    /*
     * ⛔ DER GEGENFALL ZUM `loanable`-FILTER. `geraeteFuerExport` ersetzt `listAllDevices`
     * (`deviceRepo.ts:63-65`) und filtert NICHT — waehrend `geraeteMitLeihstand` daneben
     * filtern MUSS (`deviceRepo.ts:53-59`). Der Praezedenzfall dieses Wegs ist benannt: ein
     * Lesepfad nannte sich „ersetzt den Leih-Endpunkt" und liess den Filter weg; hier ist es
     * die Gegenrichtung, und ein hinzugefuegter Filter waere der Fehler.
     *
     * ⛔ GEZAEHLT WIRD, NICHT NUR GESUCHT: mit „die nicht ausleihbare ISSI kommt vor" bliebe
     * eine Grenze (`.limit(1)`) je nach Reihenfolge unentdeckt. Drei Datenzeilen, alle drei
     * ISSI namentlich — und `desc(createdAt)` gibt die Reihenfolge vor (`deviceRepo.ts:64`).
     */
    saeeGeraete();
    const antwort = await GET(anfrage());
    const zeilen = zeilenAus(await antwort.text());
    expect(zeilen.length, "Kopfzeile plus drei Datenzeilen").toBe(4);
    expect(zeilen[1]!.startsWith("1000003;"), "neuestes Geraet zuerst (desc(createdAt))").toBe(true);
    expect(zeilen[2]!.startsWith("1000002;"), "das nicht ausleihbare Geraet fehlt").toBe(true);
    expect(zeilen[3]!.startsWith("1000001;")).toBe(true);
  });

  it("eine Zelle mit dem Trennzeichen wird maskiert", async () => {
    /*
     * ⛔ RFC 4180 (`_lib/csv/spalten.ts:275-291`): eine unmaskierte Zelle mit `;` verschoebe
     * beim Re-Import jede Folgespalte um eins — und der Rundlauf ist die schriftlich
     * gegebene Zusage dieses Wegs (`export.ts:11-15`).
     */
    saeeGeraete();
    const antwort = await GET(anfrage());
    const zeilen = zeilenAus(await antwort.text());
    expect(zeilen[1], "die Zelle mit dem Trennzeichen steht unmaskiert im Rumpf").toContain(
      '"41/14; Reserve"',
    );
  });
});

describe("GET /admin/geraete/export — die Bauform, die kein Typ haelt", () => {
  it("nennt radioHostOderNull und KEINEN werfenden Riegel", () => {
    /*
     * ⛔ DIESELBE AUSSAGE WIE `riegel.test.ts` KLAUSEL (c), hier NAMENTLICH auf diese eine
     * Datei. Sie ist keine Doppelung, sondern die Haelfte, die ueberlebt, wenn jemand den
     * Filter der Klausel (c) enger fasst — und sie nennt den literalen Pfad, den ein
     * pfadgenerischer Scan nicht erzeugen kann (dieselbe Begruendung wie in
     * `admin/(arbeit)/import/hochladen/route.test.ts:243-249`).
     */
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q, "kein radioHostOderNull( — der Handler hat kein Layout ueber sich").toMatch(
      /\bradioHostOderNull\s*\(/,
    );
    expect(q, "die werfende Host-Form in einem Route Handler (Spec §1.4.3, Schicht ii)").not.toMatch(
      /\brequireRadioHost\s*\(/,
    );
    expect(q, "ein werfender Personen-Riegel — Login-Umweg (B11, Spec:100/4379)").not.toMatch(
      /\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/,
    );
    expect(q, "403 statt 404 macht den Bestand an Verwaltungspfaden aufzaehlbar (B10)").not.toMatch(
      /\b403\b/,
    );
    expect(q, "istRadioAdmin( fehlt — der Handler prueft dann keine Stufe (Spec:4451)").toMatch(
      /\bistRadioAdmin\s*\(/,
    );
  });
});
