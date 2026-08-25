// src/app/m/radio/admin/(arbeit)/import/hochladen/route.test.ts
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
import { LESE_FEHLER } from "../../../../_lib/csv/einlesen";

/**
 * DER DATEISCHRITT DES CSV-IMPORTS — `POST /admin/import/hochladen`, Entscheidung **E-V16**
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:994-1045`), Aufgabe V18.
 *
 * ⛔ ER IST EIN ROUTE HANDLER UND KEINE SERVER ACTION, und das ist bauformbedingt: eine Server
 * Action, die eine hochgeladene Datei entgegennimmt, laeuft gegen
 * `experimental.serverActions.bodySizeLimit` (Vorgabe 1 MB), und `next.config.ts` hebt sie
 * nicht an. Das Haus hat den Fall zweimal so entschieden
 * (`src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts:2-9`,
 * `src/app/m/files/api/u/[token]/upload/route.ts`).
 *
 * ⛔ DIE DREI HAELFTEN DER RIEGELFORM (B10/B11/B17, `riegel.test.ts` Klausel (c)):
 * `radioHostOderNull(` ja · `requireRadioHost(` nein · werfender Personen-Riegel nein — und
 * ⛔ **404, nie 403**. `riegel.test.ts` prueft die BAUFORM ueber den Quelltext; diese Datei
 * prueft das VERHALTEN. Zwei Fragen, zwei Dateien.
 *
 * ⛔ `istRadioAdmin`, NICHT DIE VERWALTUNGSSTUFE (Rechtetafel `Spec:4451`: „CSV-Import —
 * Admin ja, Updater **nein**"; Betreiberentscheidung ⬜ **V-L5** vom 2026-08-24,
 * `.superpowers/sdd/planteil4/progress.md`). Der Fall „als Updater … 404" ist der einzige,
 * den ein versehentliches `requireRadioVerwaltung()` still gruen liesse.
 *
 * VIER MOCKS, JEDER MIT SEINEM GRUND (Form 1:1 aus `admin/actions.verhalten.test.ts:55-84`):
 *
 *   `next/navigation` — ⛔ DER MESSPUNKT FUER B11. Ein werfender Personen-Riegel endete hier
 *   in `redirect('/login?…')`; die Attrappe macht daraus einen ERKENNBAREN Wurf, und der
 *   Fall „ohne Sitzung … 404, nicht mit einer Weiterleitung" wird dadurch rot statt still
 *   gruen. Ohne sie faenge ihn niemand.
 *
 *   `@/core/auth` — `viewerOderNull()` liest das Session-JWT (`_lib/zugang.ts:95-97`); der
 *   Test steuert damit Sitzung und Stufe.
 *
 *   `../../../../_db/client` — ⛔ DIE TRAGENDE HAELFTE DER NEGATIVEN ZUSICHERUNG. Der Handler
 *   importiert `getDb` heute NICHT; eine Zeilenzaehlung ueber eine Datenbank, die er gar
 *   nicht erreichen kann, waere leer-gruen. Mit dieser Attrappe bekommt JEDER kuenftige
 *   Schreibweg genau die migrierte Datei-Datenbank, die der Fall danach zaehlt — die Sonde
 *   „ein `insert` in den Handler" faerbt ihn damit rot. ⛔ NICHT `getModuleDb()`, dessen
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

import { POST } from "./route";

const QUELLE = "src/app/m/radio/admin/(arbeit)/import/hochladen/route.ts";
const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const UPDATER_GRUPPE = "eine-updater-gruppe";

const ADMIN_SITZUNG = { user: { id: "sub-admin", name: "Adam Admin", groups: ["iuk-radio-admin"] } };
const UPDATER_SITZUNG = { user: { id: "sub-updater", name: "Uwe Updater", groups: [UPDATER_GRUPPE] } };

let tmp: string;
let sqlite: Database.Database;

const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const alterHost = process.env.SUITE_HOST_RADIO;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-hochladen-"));
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

/** Eine CSV mit erkennbarer ISSI-Spalte, Semikolon getrennt (deutsches Excel). */
const CSV = "ISSI;Rufname;Status\n1000001;41/12;Einsatzbereit\n1000002;41/13;Wartung\n";

function form(inhalt: string, name = "geraete.csv"): FormData {
  const f = new FormData();
  f.set("datei", new File([inhalt], name, { type: "text/csv" }));
  return f;
}

/**
 * Ein echtes `Request` mit `multipart/form-data`-Rumpf: `formData()` verlangt einen Rumpf,
 * den undici selbst kodiert hat (Vorbild
 * `src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.test.ts:101-112`).
 */
function anfrage(daten: FormData, kopf: HeadersInit = RADIO_HOST): Request {
  return new Request("http://radio.localtest.me/admin/import/hochladen", {
    method: "POST",
    body: daten,
    headers: kopf,
  });
}

type Antwort = { ok: true; spalten: string[]; zeilen: string[][] } | { ok: false; fehler: string };

describe("POST /admin/import/hochladen — der Riegel, alles IN der Route (B11)", () => {
  it("auf einem fremden Host antwortet der Handler 404", async () => {
    /*
     * ⛔ ERSTE ZEILE DES HANDLERS, und der Grund ist Falle 61 (`_lib/host.ts:10-20`):
     * `decideRoute` gatet einen internen Pfad `/m/<key>/...` nach dem Modulsegment, ohne
     * jeden Hostbezug — JEDER Host, der auf den Suite-Container terminiert, antwortet damit
     * auf `/m/radio/*`. Der Riegel steht in der Route selbst, weil ein Route Handler KEIN
     * Layout ueber sich hat.
     *
     * ⛔ 404 UND NICHT 403 (B10, `Spec:99`): ein 403 machte den Bestand an
     * Verwaltungspfaden aufzaehlbar, waehrend die Seiten daneben schweigen.
     */
    const antwort = await POST(anfrage(form(CSV), FREMDER_HOST));
    expect(antwort.status, "ein fremder Host erreicht den Dateischritt").toBe(404);
  });

  it("ohne Sitzung antwortet der Handler 404, nicht mit einer Weiterleitung", async () => {
    /*
     * ⛔ B11 ALS VERHALTENSFALL (`Spec:100`, ausgeschrieben `Spec:4379`, bestaetigt B17
     * `Spec:117`) — er faengt ein versehentliches `requireRadioAdmin()`. Jener wirft
     * `redirect('/login?…')`; die Attrappe von `next/navigation` macht daraus einen Wurf,
     * und dieser Fall wird rot statt still gruen. Woertlich umgesetzt landete ein anonymer
     * POST in einem LOGIN-UMWEG — typkorrekt, lint-sauber.
     */
    sitzung = null;
    const antwort = await POST(anfrage(form(CSV)));
    expect(antwort.status, "eine anonyme Anfrage erreicht den Dateischritt").toBe(404);
  });

  it("als Updater antwortet der Handler 404", async () => {
    /*
     * ⛔ DER FALL, DEN EIN `requireRadioVerwaltung()` STILL GRUEN LIESSE. Rechtetafel
     * `Spec:4451`: „CSV-Import — Admin ja, Updater **nein**"; Betreiberentscheidung ⬜ V-L5.
     * Die Updater-Stufe ist hier ECHT besetzt (`SUITE_UPDATER_GROUP_RADIO` gesetzt, die
     * Sitzung traegt die Gruppe) — sonst maesse der Fall nur „irgendeine fremde Gruppe".
     */
    sitzung = UPDATER_SITZUNG;
    const antwort = await POST(anfrage(form(CSV)));
    expect(antwort.status, "die Updater-Stufe erreicht den Dateischritt").toBe(404);
  });

  it("als Admin liefert er Spalten und Rohzeilen als JSON", async () => {
    /*
     * Der positive Fall. ⛔ SPALTEN UND ROHZEILEN, MEHR NICHT (E-V16): die Zuordnung faellt
     * in der Insel, das Schreiben in `importSchreibenAction`.
     */
    const antwort = await POST(anfrage(form(CSV)));
    expect(antwort.status).toBe(200);
    const rumpf = (await antwort.json()) as Antwort;
    expect(rumpf.ok).toBe(true);
    if (!rumpf.ok) throw new Error("unerreichbar — die Zeile darueber haelt es");
    expect(rumpf.spalten).toEqual(["ISSI", "Rufname", "Status"]);
    expect(rumpf.zeilen).toEqual([
      ["1000001", "41/12", "Einsatzbereit"],
      ["1000002", "41/13", "Wartung"],
    ]);
  });

  it("er schreibt KEINE Zeile in die Datenbank", async () => {
    /*
     * ⛔ DIE NEGATIVE ZUSICHERUNG, UND SIE IST DER PUNKT: die Vorschau ist der Schritt, der
     * nichts tut (E-V16, woertlich „gibt Spaltennamen und Rohzeilen als JSON zurueck und
     * **schreibt NICHTS**").
     *
     * ⛔ WARUM SIE TRAGEN KANN, OBWOHL DER HANDLER `getDb` GAR NICHT IMPORTIERT: die
     * Attrappe von `../../../../_db/client` oben liefert die migrierte Datei-Datenbank, die
     * hier gezaehlt wird. Jeder Schreibweg, den jemand nachtraeglich einbaut, laeuft durch
     * genau diese Verbindung — die Sonde „ein `insert` in den Handler" faerbt den Fall rot.
     * Ohne die Attrappe waere er leer-gruen, und das steht hier, statt verschwiegen zu werden.
     */
    await POST(anfrage(form(CSV)));
    expect(testDb!.select().from(devices).all(), "der Dateischritt hat geschrieben").toEqual([]);
  });

  it("eine leere Datei ergibt eine Meldung, keinen Wurf", async () => {
    /*
     * ⛔ EINE MELDUNG IM JSON, KEIN WURF UND KEIN 500 — `import.ts:24-30` faengt den Wurf aus
     * `decodeCsv` eine Ebene hoeher ab und antwortet mit „Leere oder ungültige Datei"
     * (`import.ts:28`). Der Text wird GELESEN und nicht abgeschrieben: `LESE_FEHLER` in
     * `_lib/csv/einlesen.ts` traegt ihn zeichengleich.
     *
     * ⚠️ DER STATUS BLEIBT 200 UND WIRD NICHT ZU 400 WIE IM BESTAND (`import.ts:21`, `:28`).
     * Der Grund ist die Hausform: die Suite reicht Schreib- und Lesefehler als
     * `{ ok: false, fehler }` durch (`_lib/csv/einlesen.ts:58-67`, `admin/actions.ts:86`),
     * und ein 404/403-freier Fehlercode auf diesem Weg waere die einzige Stelle des Moduls,
     * an der ein Fachfehler als HTTP-Fehler erscheint.
     */
    const antwort = await POST(anfrage(form("")));
    expect(antwort.status, "eine leere Datei antwortet mit einem HTTP-Fehler").toBe(200);
    const rumpf = (await antwort.json()) as Antwort;
    expect(rumpf).toEqual({ ok: false, fehler: LESE_FEHLER });
  });

  it("ohne Dateifeld ergibt er dieselbe Meldung", async () => {
    /*
     * `import.ts:20-22` antwortet hier mit „Keine Datei hochgeladen". ⚠️ BENANNTE
     * ZUSAMMENFALTUNG: die Suite gibt denselben Text wie fuer die unlesbare Datei, weil beide
     * Faelle fuer die bedienende Person dasselbe bedeuten — der Assistent zeigt ohnehin
     * „Datei konnte nicht gelesen werden" (`ImportWizard.tsx:101`). Ein zweiter Text ohne
     * zweite Handlung waere eine Unterscheidung, die niemand sieht.
     */
    const leer = new FormData();
    leer.set("datei", "keine-datei");
    const antwort = await POST(anfrage(leer));
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ ok: false, fehler: LESE_FEHLER });
  });
});

describe("POST /admin/import/hochladen — die Bauform, die kein Typ haelt", () => {
  it("nennt radioHostOderNull und KEINEN werfenden Riegel", () => {
    /*
     * ⛔ DIESELBE AUSSAGE WIE `riegel.test.ts` KLAUSEL (c), hier NAMENTLICH auf diese eine
     * Datei. Sie ist keine Doppelung, sondern die Haelfte, die ueberlebt, wenn jemand den
     * Filter der Klausel (c) enger fasst — und sie nennt den literalen Pfad, den ein
     * pfadgenerischer Scan nicht erzeugen kann (dieselbe Begruendung wie bei den vier
     * Seiten-Zusicherungen in `admin/actions.test.ts`).
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
  });
});
