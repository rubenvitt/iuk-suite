import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const { starteAvArbeiterMock } = vi.hoisted(() => ({ starteAvArbeiterMock: vi.fn() }));
vi.mock("./av", () => ({ starteAvArbeiter: starteAvArbeiterMock }));

/**
 * DAS TOR VOR `loesche` — die einzige Vorrichtung, mit der sich „die
 * Protokollzeile steht VOR der Arbeit in der Datenbank" ueberhaupt pruefen
 * laesst.
 *
 * Ein Absturz mitten im Lauf ist nicht nachstellbar (der Prozess ist dann weg).
 * Nachstellbar ist der Zustand, an dem er sich zeigt: waehrend der Lauf noch
 * arbeitet, MUSS die Zeile schon dastehen — mit `beendet_at` NULL. Wer die
 * Zeile erst am Ende schriebe, haette nach einem Absturz gar keine, und §4.8
 * verspricht genau daran die Erkennbarkeit.
 *
 * Im Normalfall ist das Tor offen und reicht durch; ein Test, der es schliesst,
 * haelt den Lauf an einer definierten Stelle an.
 */
const { storageTor } = vi.hoisted(() => ({
  storageTor: { warte: null as Promise<void> | null },
}));
vi.mock("./storage", async (echt) => {
  const modul = await echt<typeof import("./storage")>();
  return {
    ...modul,
    loesche: async (ziel: Parameters<typeof modul.loesche>[0]) => {
      if (storageTor.warte !== null) await storageTor.warte;
      return modul.loesche(ziel);
    },
  };
});

import { fuehreAufraeumLaufAus, starteFilesHintergrund, stoppeAufraeumTimer } from "./boot";

/**
 * DIE WACHE VOR DEM HINTERGRUNDSTART.
 *
 * Sie fehlte, und der Befund kam nicht aus einem Test, sondern aus einem
 * 75-Sekunden-Dev-Lauf mit leerem `SUITE_HOST_FILES` und ohne `FILES_`-Variablen:
 * 16 von 22 Logzeilen waren `console.error` — vier Zeilen „uebersprungen, die
 * Zahlen sind ungueltig: …" pro Runde und pro Takt, und der Rueckfall-Takt
 * wiederholt das alle 60 Sekunden ohne Ende. Kein `NODE_ENV`-Zweig davor, es
 * traefe also die Produktion, und zwar genau die Instanzen, auf denen `files`
 * (noch) keinen Host hat.
 *
 * Der Zustand ist NICHT hypothetisch: bis zum Cutover ist er der Normalfall.
 * `filesBootFehler()` bricht den Start nur ab, wenn ein Host GESETZT und die
 * Konfiguration trotzdem kaputt ist — ohne Host laeuft die Suite absichtlich
 * weiter, und dann darf das Modul nicht in eine Fehlerschleife laufen.
 */
const PFLICHT = {
  FILES_MAX_DATEI_BYTES: "524288000",
  FILES_AV_MAX_BYTES: "524288000",
  FILES_MAX_ABLAUF_TAGE: "7",
};

let ursprung: NodeJS.ProcessEnv;
let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ursprung = process.env;
  process.env = { ...process.env };
  for (const name of Object.keys(PFLICHT)) delete process.env[name];
  starteAvArbeiterMock.mockClear();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  // Der Takt ueberlebt den Test sonst: er haengt an einem Modulzustand, nicht am
  // Testlauf, und der naechste Test saehe einen Timer, den er nie gestartet hat.
  stoppeAufraeumTimer();
  storageTor.warte = null;
  process.env = ursprung;
  infoSpy.mockRestore();
});

describe("starteFilesHintergrund", () => {
  it("startet den AV-Arbeiter NICHT, wenn die Zahlen fehlen", () => {
    starteFilesHintergrund();
    expect(starteAvArbeiterMock).not.toHaveBeenCalled();
  });

  it("sagt EINMAL, warum es nichts tut — und zwar als Information, nicht als Fehler", () => {
    /*
     * `console.info` und nicht `console.error`: ein Modul ohne Host ist kein
     * Stoerfall, sondern der Zustand vor seinem Cutover. Eine Fehlerzeile dort
     * stumpft genau die Aufmerksamkeit ab, die spaeter eine echte braucht.
     */
    starteFilesHintergrund();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const meldung = String(infoSpy.mock.calls[0]?.[0]);
    expect(meldung).toContain("[files]");
    // Die Meldung muss den Grund NENNEN, sonst sucht der Betreiber im Falschen.
    expect(meldung).toContain("FILES_MAX_DATEI_BYTES");
  });

  it("startet ihn, sobald die Zahlen vollstaendig sind", () => {
    // Die Gegenprobe gehoert dazu: eine Wache, die IMMER haelt, waere derselbe
    // Fehler in die andere Richtung — die Warteschlange bliebe unbearbeitet,
    // jeder Upload stuende dauerhaft auf `scanning`, und kein Test wuerde rot.
    Object.assign(process.env, PFLICHT);
    starteFilesHintergrund();
    expect(starteAvArbeiterMock).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T46 — Aufraeum-Timer und Aufraeum-Lauf (Spec §7.6, §4.8)
// ---------------------------------------------------------------------------

/*
 * GEGEN EINE ECHTE, MIGRIERTE DATENBANK UND EINE ECHTE ABLAGE, nicht gegen ein
 * Mock. Zwei Aussagen dieses Tasks sind gegen ein Mock gruen, ohne zu gelten:
 * dass die Spalten SEKUNDEN fuehren (`mode: "timestamp"`, nicht `timestamp_ms`
 * wie im Modul `qr` — ein Faktor-1000-Fehler waere paritaetsgruen), und dass
 * der Trockenlauf tatsaechlich keine Zeile und kein Byte anfasst.
 *
 * Muster uebernommen aus `_db/queries.test.ts`: DATA_DIR setzen, migrieren,
 * `globalThis.__suiteDb` verwerfen (`getModuleDb` haelt die Verbindung global
 * fest und zeigte sonst auf die geloeschte Datei weiter).
 */
const DIR = "./.data/files-boot-test";
const ABLAGE = join(DIR, "files");

const SEK = 1000;
const STUNDE = 60 * 60 * SEK;
const TAG = 24 * STUNDE;

/** Die Vorbelegung aus §9.3 (`FILES_AUFRAEUMEN_TAKT_MINUTEN` = 60) in Millisekunden. */
const TAKT_MS = 60 * 60 * SEK;

/** nanoid(10)-foermig — kuerzere IDs kaeme `pruefeId` in `storage.ts` gar nicht an. */
const SHARE_ALT = "aaaaaaaaaa";
const SHARE_LEBT = "bbbbbbbbbb";
const WAISE = "cccccccccc";
const DATEI_FERTIG = "dddddddddd";
const DATEI_HALB = "eeeeeeeeee";
const DATEI_LEBT = "ffffffffff";
const INBOX_ALT = "gggggggggg";

async function db() {
  const { getDb } = await import("../_db/client");
  return getDb();
}

async function tabellen() {
  return import("../_db/schema");
}

function frischeDatenbank(): void {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(ABLAGE, { recursive: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(join(DIR, "files.db"));
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
}

/** Die Rohzeilen der Protokolltabelle — bewusst ueber rohes SQL. */
function protokoll(): Record<string, number | string | null>[] {
  const sqlite = new Database(join(DIR, "files.db"), { readonly: true });
  try {
    return sqlite.prepare("SELECT * FROM aufraeum_laeufe ORDER BY id").all() as Record<
      string,
      number | string | null
    >[];
  } finally {
    sqlite.close();
  }
}

function blobPfad(shareId: string, fileId: string): string {
  return join(ABLAGE, shareId, fileId);
}

/**
 * Der Bestand, an dem jede der fuenf Regeln aus §7.6 genau einmal greift — und
 * je ein Gegenstueck, das sie NICHT greifen darf.
 *
 * `jetzt` ist ein Parameter: zwei `new Date()` in einer Vorrichtung liegen an
 * einer Sekundengrenze auseinander, und die Spalten fuehren Sekunden.
 */
async function legeBestandAn(jetzt: Date): Promise<void> {
  const bank = await db();
  const { shares, shareFiles, downloadLogs, inboxFiles } = await tabellen();

  // Abgelaufen UND ausserhalb der Karenz (24 h Vorbelegung).
  bank
    .insert(shares)
    .values({
      id: SHARE_ALT,
      title: "Uebung Nord",
      type: "folder",
      expiresAt: new Date(jetzt.getTime() - 3 * TAG),
      downloadCount: 0,
      totalSize: 300,
      createdAt: new Date(jetzt.getTime() - 10 * TAG),
      createdBy: "sub-1",
    })
    .run();
  // Lebt — und ist das Gegenstueck: weder Zeile noch Verzeichnis darf fallen.
  bank
    .insert(shares)
    .values({
      id: SHARE_LEBT,
      title: "Laeuft noch",
      type: "folder",
      expiresAt: new Date(jetzt.getTime() + 3 * TAG),
      downloadCount: 0,
      totalSize: 0,
      createdAt: new Date(jetzt.getTime() - 10 * TAG),
      createdBy: "sub-1",
    })
    .run();

  bank
    .insert(shareFiles)
    .values([
      {
        id: DATEI_FERTIG,
        shareId: SHARE_ALT,
        filename: "lage.pdf",
        mimeType: "application/pdf",
        size: 100,
        createdAt: new Date(jetzt.getTime() - 10 * TAG),
        bytesVollstaendigAt: new Date(jetzt.getTime() - 10 * TAG),
        avStatus: "clean",
      },
      {
        id: DATEI_HALB,
        shareId: SHARE_ALT,
        filename: "halb.bin",
        mimeType: "application/octet-stream",
        size: 200,
        createdAt: new Date(jetzt.getTime() - 10 * TAG),
        bytesVollstaendigAt: null,
        avStatus: "scanning",
      },
      // Unvollstaendig UND verfallen, aber an einem UEBERLEBENDEN Share: genau
      // die Zeile, die einzeln stirbt (`FILES_UPLOAD_VERFALL_STUNDEN` = 24).
      {
        id: DATEI_LEBT,
        shareId: SHARE_LEBT,
        filename: "abgebrochen.bin",
        mimeType: "application/octet-stream",
        size: 50,
        createdAt: new Date(jetzt.getTime() - 3 * TAG),
        bytesVollstaendigAt: null,
        avStatus: "scanning",
      },
    ])
    .run();

  bank
    .insert(downloadLogs)
    .values([
      { shareId: SHARE_ALT, fileId: null, downloadedAt: new Date(jetzt.getTime() - 200 * TAG) },
      // Frisch — die Gegenprobe zur Aufbewahrungsfrist (90 Tage Vorbelegung).
      { shareId: SHARE_LEBT, fileId: null, downloadedAt: new Date(jetzt.getTime() - 1 * TAG) },
    ])
    .run();

  bank
    .insert(inboxFiles)
    .values({
      id: INBOX_ALT,
      tokenId: null,
      dateiname: "abgabe.jpg",
      kategorie: null,
      hinweis: null,
      mimeType: "image/jpeg",
      size: 40,
      empfangenAt: new Date(jetzt.getTime() - 200 * TAG),
      bytesVollstaendigAt: new Date(jetzt.getTime() - 200 * TAG),
      avStatus: "clean",
    })
    .run();

  // Die Bytes auf der Platte, in genau der Form, die `_lib/storage.ts` erzeugt.
  mkdirSync(join(ABLAGE, SHARE_ALT), { recursive: true });
  mkdirSync(join(ABLAGE, SHARE_LEBT), { recursive: true });
  mkdirSync(join(ABLAGE, "inbox"), { recursive: true });
  // Ein Verzeichnis OHNE `shares`-Zeile — es wird GEMELDET und nicht geloescht.
  mkdirSync(join(ABLAGE, WAISE), { recursive: true });
  writeFileSync(blobPfad(SHARE_ALT, DATEI_FERTIG), "x".repeat(100));
  writeFileSync(`${blobPfad(SHARE_ALT, DATEI_HALB)}.part`, "y".repeat(30));
  writeFileSync(`${blobPfad(SHARE_LEBT, DATEI_LEBT)}.part`, "z".repeat(10));
  writeFileSync(join(ABLAGE, "inbox", INBOX_ALT), "i".repeat(40));
  writeFileSync(join(ABLAGE, WAISE, "hhhhhhhhhh"), "w".repeat(5));
}

async function zaehle(tabelle: "shares" | "share_files" | "download_logs" | "inbox_files") {
  const sqlite = new Database(join(DIR, "files.db"), { readonly: true });
  try {
    const zeile = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${tabelle}`).get() as { n: number };
    return zeile.n;
  } finally {
    sqlite.close();
  }
}

/**
 * Wartet, bis KEIN Lauf mehr unterwegs ist — und ohne diese Wartestelle ist der
 * Takt-Test unter Last unzuverlaessig.
 *
 * Ein Takt endet nicht mit dem Timer-Ereignis: der Lauf liest das
 * Ablageverzeichnis, und dieses `readdir` haengt am ECHTEN Ereignisring, nicht
 * an der gestellten Uhr. `advanceTimersByTimeAsync` leert nur Mikroaufgaben.
 * Faellt der naechste Takt in einen noch laufenden, ueberspringt ihn die
 * Ueberlappungswache — der Test maesse dann die Wache statt den Takt, und zwar
 * je nach Maschinenlast mal so und mal so. Genau das ist im vollen Suite-Lauf
 * passiert, waehrend die Datei allein gruen war.
 *
 * Die Schleife ist BEGRENZT und ihr Ergebnis ist keine Zusicherung: bleibt der
 * Lauf aus, kehrt sie einfach zurueck und die Zaehlung darunter faellt. Ein
 * `while (true)` haette daraus eine Zeitueberschreitung gemacht, deren Ursache
 * man erst suchen muss.
 *
 * `setImmediate` bleibt dafuer ECHT (`toFake` unten), sonst gaebe es keinen Weg
 * zurueck in den echten Ring.
 */
async function warteAufRuhe(): Promise<void> {
  for (let versuch = 0; versuch < 1000; versuch++) {
    const zeilen = protokoll();
    if (zeilen.length > 0 && zeilen.every((z) => z.beendet_at !== null)) return;
    await new Promise((weiter) => setImmediate(weiter));
  }
}

describe("Der Aufraeum-Timer", () => {
  beforeEach(() => {
    Object.assign(process.env, PFLICHT);
    frischeDatenbank();
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    vi.setSystemTime(new Date("2026-08-01T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("laeuft beim Boot NICHT sofort — der erste Lauf ist verzoegert", async () => {
    starteFilesHintergrund();
    expect(protokoll()).toHaveLength(0);

    // Eine Millisekunde vor dem Takt darf noch nichts passiert sein. Diese
    // Haelfte traegt die EINHEIT: `FILES_AUFRAEUMEN_TAKT_MINUTEN` sind Minuten,
    // ein `* 1000` statt `* 60_000` liesse den Lauf hier schon geschehen sein.
    await vi.advanceTimersByTimeAsync(TAKT_MS - 1);
    expect(protokoll()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(protokoll()).toHaveLength(1);
    await warteAufRuhe();
  });

  it("wiederholt sich im Takt — ein einmaliger Lauf waere kein Timer", async () => {
    starteFilesHintergrund();
    for (let takt = 0; takt < 3; takt++) {
      await vi.advanceTimersByTimeAsync(TAKT_MS);
      await warteAufRuhe();
    }
    expect(protokoll()).toHaveLength(3);
  });

  it("wird EINMAL registriert, nicht je Aufruf", async () => {
    // `register()` laeuft unter HMR mehr als einmal; zwei Timer waeren zwei
    // Laeufe je Takt, die einander die Zeilen unter den Fuessen wegloeschen.
    starteFilesHintergrund();
    starteFilesHintergrund();
    starteFilesHintergrund();
    await vi.advanceTimersByTimeAsync(TAKT_MS);
    await warteAufRuhe();
    expect(protokoll()).toHaveLength(1);
  });

  it("startet gar nicht, solange die Zahlen fehlen", async () => {
    for (const name of Object.keys(PFLICHT)) delete process.env[name];
    starteFilesHintergrund();
    await vi.advanceTimersByTimeAsync(3 * TAKT_MS);
    expect(protokoll()).toHaveLength(0);
  });
});

describe("Ein Aufraeum-Lauf", () => {
  beforeEach(() => {
    Object.assign(process.env, PFLICHT);
    delete process.env.FILES_AUFRAEUMEN_TROCKENLAUF;
    delete process.env.FILES_INBOX_AUFBEWAHRUNG_TAGE;
    frischeDatenbank();
  });

  it("schreibt EINE Zeile mit allen sieben Zaehlspalten aus §4.8", async () => {
    const jetzt = new Date();
    await legeBestandAn(jetzt);
    process.env.FILES_INBOX_AUFBEWAHRUNG_TAGE = "30";

    await fuehreAufraeumLaufAus();

    const zeilen = protokoll();
    expect(zeilen).toHaveLength(1);
    const zeile = zeilen[0];

    expect(zeile.trockenlauf).toBe(0);
    expect(zeile.shares_geloescht).toBe(1);
    // Beide Dateien des sterbenden Shares PLUS die einzeln verfallene.
    expect(zeile.dateien_geloescht).toBe(3);
    expect(zeile.bytes_geloescht).toBe(100 + 200 + 50 + 40);
    expect(zeile.logzeilen_geloescht).toBe(1);
    expect(zeile.inbox_geloescht).toBe(1);
    // Zwei `.part` lagen tatsaechlich auf der Platte.
    expect(zeile.parts_geloescht).toBe(2);
    expect(zeile.verwaiste_blobs_gemeldet).toBe(1);
    expect(zeile.fehler).toBeNull();

    // ZEHNSTELLIGE SEKUNDEN, nicht Millisekunden (`schema.ts:4-13`). Ein
    // Faktor-1000-Fehler waere paritaetsgruen und fiele sonst nirgends auf.
    expect(String(zeile.gestartet_at)).toMatch(/^\d{10}$/);
    expect(String(zeile.beendet_at)).toMatch(/^\d{10}$/);
    expect(Number(zeile.beendet_at)).toBeGreaterThanOrEqual(Number(zeile.gestartet_at));
  });

  it("loescht Zeilen und Bytes wirklich — und nur die vorgesehenen", async () => {
    const jetzt = new Date();
    await legeBestandAn(jetzt);
    process.env.FILES_INBOX_AUFBEWAHRUNG_TAGE = "30";

    await fuehreAufraeumLaufAus();

    expect(await zaehle("shares")).toBe(1);
    expect(await zaehle("share_files")).toBe(0);
    expect(await zaehle("download_logs")).toBe(1);
    expect(await zaehle("inbox_files")).toBe(0);

    expect(existsSync(blobPfad(SHARE_ALT, DATEI_FERTIG))).toBe(false);
    expect(existsSync(join(ABLAGE, SHARE_ALT))).toBe(false);
    expect(existsSync(`${blobPfad(SHARE_LEBT, DATEI_LEBT)}.part`)).toBe(false);
    expect(existsSync(join(ABLAGE, "inbox", INBOX_ALT))).toBe(false);

    // Das Verzeichnis des lebenden Shares bleibt.
    expect(existsSync(join(ABLAGE, SHARE_LEBT))).toBe(true);
  });

  it("meldet verwaiste Verzeichnisse und loescht davon NICHTS", async () => {
    /*
     * Verwaiste Bytes automatisch zu loeschen waere in einem Modul, dessen
     * Bestand gerade importiert wird, der teuerste denkbare Fehler (§7.6): ein
     * verwaistes Verzeichnis kann eine Datei sein, deren Zeile noch entsteht.
     */
    const jetzt = new Date();
    await legeBestandAn(jetzt);

    const ergebnis = await fuehreAufraeumLaufAus();

    expect(ergebnis.zahlen.verwaisteBlobsGemeldet).toBe(1);
    expect(existsSync(join(ABLAGE, WAISE))).toBe(true);
    expect(existsSync(join(ABLAGE, WAISE, "hhhhhhhhhh"))).toBe(true);
    // `inbox` und `.ablage-probe` sind KEINE Waisen — sie bekommen nie eine
    // `shares`-Zeile, und wer den Bericht befolgt, loeschte sonst das ganze
    // anonyme Postfach.
    expect(existsSync(join(ABLAGE, "inbox"))).toBe(true);
  });

  it("zaehlt im Trockenlauf dieselben Zahlen und loescht nichts", async () => {
    const jetzt = new Date();
    await legeBestandAn(jetzt);
    process.env.FILES_INBOX_AUFBEWAHRUNG_TAGE = "30";
    process.env.FILES_AUFRAEUMEN_TROCKENLAUF = "1";

    await fuehreAufraeumLaufAus();

    const zeile = protokoll()[0];
    expect(zeile.trockenlauf).toBe(1);
    // DIESELBEN Zahlen wie im echten Lauf — sonst waere die Vorschau, deren
    // einziger Zweck der Vergleich ist (§4.8), wertlos.
    expect(zeile.shares_geloescht).toBe(1);
    expect(zeile.dateien_geloescht).toBe(3);
    expect(zeile.bytes_geloescht).toBe(100 + 200 + 50 + 40);
    expect(zeile.logzeilen_geloescht).toBe(1);
    expect(zeile.inbox_geloescht).toBe(1);
    expect(zeile.verwaiste_blobs_gemeldet).toBe(1);
    // `parts_geloescht` ist die EINZIGE Zahl, die im Trockenlauf 0 sein MUSS:
    // sie zaehlt tatsaechliche Unlinks, und die gibt es hier nicht.
    expect(zeile.parts_geloescht).toBe(0);

    expect(await zaehle("shares")).toBe(2);
    expect(await zaehle("share_files")).toBe(3);
    expect(await zaehle("download_logs")).toBe(2);
    expect(await zaehle("inbox_files")).toBe(1);
    expect(existsSync(blobPfad(SHARE_ALT, DATEI_FERTIG))).toBe(true);
    expect(existsSync(`${blobPfad(SHARE_LEBT, DATEI_LEBT)}.part`)).toBe(true);
  });

  it("laesst den ENV-Trockenlauf nicht vom Knopf ueberstimmen", async () => {
    /*
     * Der Schalter ist die Sicherung fuer den ERSTEN Lauf nach dem Cutover. Ein
     * Auslöser, der ihn ueberstimmt, hebt genau die Sicherung auf, wegen der er
     * gesetzt wurde.
     */
    const jetzt = new Date();
    await legeBestandAn(jetzt);
    process.env.FILES_AUFRAEUMEN_TROCKENLAUF = "1";

    const ergebnis = await fuehreAufraeumLaufAus({ nurVorschau: false });

    expect(ergebnis.trockenlauf).toBe(true);
    expect(protokoll()[0].trockenlauf).toBe(1);
    expect(await zaehle("shares")).toBe(2);
  });

  it("meldet einen Fehler in der Zeile, statt still zu enden", async () => {
    const jetzt = new Date();
    await legeBestandAn(jetzt);
    storageTor.warte = Promise.reject(new Error("Vorrichtung: Platte weg"));
    // Sonst meldet Node die Ablehnung als unbehandelt, bevor der Lauf sie liest.
    storageTor.warte.catch(() => {});

    const ergebnis = await fuehreAufraeumLaufAus();

    expect(ergebnis.fehler).toContain("Platte weg");
    const zeile = protokoll()[0];
    expect(String(zeile.fehler)).toContain("Platte weg");
    // Ein GESCHEITERTER Lauf ist beendet; NULL bedeutet „Prozess mittendrin weg".
    expect(zeile.beendet_at).not.toBeNull();
  });

  it("steht mit `beendet_at` NULL in der Datenbank, WAEHREND er arbeitet", async () => {
    const jetzt = new Date();
    await legeBestandAn(jetzt);

    let oeffne: () => void = () => {};
    storageTor.warte = new Promise<void>((weiter) => {
      oeffne = weiter;
    });

    const lauf = fuehreAufraeumLaufAus();
    // Dem Lauf Gelegenheit geben, bis ans Tor zu kommen.
    await new Promise((weiter) => setTimeout(weiter, 10));

    const waehrenddessen = protokoll();
    expect(waehrenddessen).toHaveLength(1);
    expect(waehrenddessen[0].beendet_at).toBeNull();

    oeffne();
    await lauf;
    expect(protokoll()[0].beendet_at).not.toBeNull();
  });

  it("laesst die Inbox in Ruhe, solange keine Frist gesetzt ist", async () => {
    /*
     * `FILES_INBOX_AUFBEWAHRUNG_TAGE` hat BEWUSST keine Vorbelegung: nicht
     * gesetzt heisst „keine Frist" und ist das heutige Verhalten von `drop`.
     * Eine erfundene Vorbelegung loeschte beim ersten Lauf nach dem Cutover den
     * Altbestand — `empfangen_at` importierter Zeilen ist die Quell-`mtime` und
     * damit alt.
     */
    const jetzt = new Date();
    await legeBestandAn(jetzt);

    const ergebnis = await fuehreAufraeumLaufAus();

    expect(ergebnis.zahlen.inboxGeloescht).toBe(0);
    expect(await zaehle("inbox_files")).toBe(1);
    expect(existsSync(join(ABLAGE, "inbox", INBOX_ALT))).toBe(true);
  });

  it("laeuft auf einem leeren Bestand durch, ohne etwas zu behaupten", async () => {
    const ergebnis = await fuehreAufraeumLaufAus();
    expect(ergebnis.fehler).toBeNull();
    expect(ergebnis.zahlen.sharesGeloescht).toBe(0);
    expect(ergebnis.zahlen.verwaisteBlobsGemeldet).toBe(0);
    expect(readdirSync(ABLAGE)).toEqual([]);
  });
});
