import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";

/*
 * WAS DIESE DATEI BESITZT (Spec §7.1, §5.4, §6.6; Plan T27):
 *
 *  - dass der ZIELPFAD aus der Datenbank kommt und nie vom Browser: der Handler
 *    nimmt ausschliesslich eine `fileId` entgegen, `shareId` liest er aus der
 *    Zeile. In der Alt-App war der Schluessel ein freier Request-Header
 *    (Analyse Falle 28),
 *  - dass `?ab=` ein BYTE-OFFSET ist, der genau der Laenge der Zwischendatei
 *    entsprechen muss — der Zustand ist die Laenge der `.part`-Datei, es gibt
 *    keinen zweiten Mechanismus,
 *  - die Abbildung der Betriebsfehler aus §5.4 auf Statuscodes (413/507/500),
 *  - den AV-Grenzfall aus §6.6 (benannte Ablehnung statt dauerhaft `unscanned`),
 *  - den ABBRUCH (`DELETE`) samt Neuableitung von `shares.type`.
 *
 * Was sie NICHT besitzt: die Rollensperre ueber ALLE Endpunkte (das ist T44,
 * e2e), die Client-Schleife der Upload-Insel (T35) und die Warteschlange selbst
 * (T17, `_lib/av.test.ts`).
 *
 * Gegen eine echte, migrierte Datei-DB und eine echte Ablage — nicht gegen ein
 * Mock: die Zeitstempel sind SEKUNDEN (`mode: "timestamp"`), und die
 * Offset-Zusage ist eine Aussage ueber das Dateisystem. Beides waere gegen ein
 * Mock gruen, ohne zu gelten. Muster uebernommen aus `_db/queries.test.ts`.
 */

const DIR = "./.data/files-upload-test";

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

const MiB = 1024 * 1024;

/**
 * Die Grenze liegt bewusst dicht UEBER `FILES_CHUNK_BYTES` (4 MiB):
 * `grenzen()` weist jede Konfiguration ab, in der die Chunk-Groesse nicht
 * KLEINER ist als `FILES_MAX_DATEI_BYTES` (§9.4 Pruefung 2). Ein kleinerer
 * Testwert waere also gar nicht ladbar — die 413-Probe muss darum wirklich
 * ueber 4 MiB schreiben.
 */
const MAX_DATEI_BYTES = 4 * MiB + 1;

/** Die acht Signaturbytes eines PNG — der Inhalt, den die Magic-Byte-Pruefung annimmt. */
const PNG_KOPF = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Drei Steuergroessen, und jede einzelne existiert, weil der zugehoerige Zweig
 * sonst UNERREICHBAR waere — nicht aus Bequemlichkeit:
 *
 * - `avMaxBytes`: §9.4 Pruefung 3 erzwingt `FILES_MAX_DATEI_BYTES <=
 *   FILES_AV_MAX_BYTES`, und `grenzen()` setzt sie bei JEDEM Aufruf durch. Ueber
 *   die Umgebung ist die Lage aus §6.6 („AV-Grenze tiefer als die Annahmegrenze")
 *   also nicht herstellbar. Genau diesen Fall — Boot-Pruefung faellt weg oder die
 *   Zahl sinkt zur Laufzeit — beschreibt der Plan als den Anlass fuer die zweite
 *   Linie.
 * - `schreibFehler`: ENOSPC laesst sich in einem Test nicht echt erzeugen.
 * - `reiheAvEin`: der Sofortscan darf in einem Unit-Test keine Netzverbindung
 *   oeffnen; zugleich ist „die Zeile ist eingereiht" eine Zusage von Punkt 5.
 */
const { steuerung } = vi.hoisted(() => ({
  steuerung: {
    avMaxBytes: null as number | null,
    schreibFehler: null as null | (() => unknown),
    /**
     * Verschiebt die von `schreibeStrom` GEMELDETE Bytezahl gegen die
     * tatsaechlich geschriebene. Damit trennt der Test die beiden Zahlen, die
     * im Normalfall gleich sind und deshalb austauschbar aussehen: der Zaehler
     * der Schreibfunktion und die Laenge der Datei. §5.4 sagt der Datei den
     * Vorrang zu — ohne diese Verschiebung ist die Zusage nicht pruefbar.
     */
    byteZaehlerVerschiebung: 0,
    reiheAvEin: vi.fn(),
  },
}));

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("../../../_lib/grenzen", async (echt) => {
  const m = await echt<typeof import("../../../_lib/grenzen")>();
  return {
    ...m,
    grenzen: (env?: Record<string, string | undefined>) => {
      const g = m.grenzen(env);
      return steuerung.avMaxBytes === null ? g : { ...g, avMaxBytes: steuerung.avMaxBytes };
    },
  };
});

vi.mock("../../../_lib/storage", async (echt) => {
  const m = await echt<typeof import("../../../_lib/storage")>();
  return {
    ...m,
    schreibeStrom: async (...args: Parameters<typeof m.schreibeStrom>) => {
      const fehler = steuerung.schreibFehler;
      if (fehler !== null) throw fehler();
      const ergebnis = await m.schreibeStrom(...args);
      return { bytes: ergebnis.bytes + steuerung.byteZaehlerVerschiebung };
    },
  };
});

vi.mock("../../../_lib/av", async (echt) => {
  const m = await echt<typeof import("../../../_lib/av")>();
  return { ...m, reiheAvEin: steuerung.reiheAvEin };
});

import { auth } from "@/core/auth";

const authMock = vi.mocked(auth);

/** Feste Uhr: die Spalten fuehren SEKUNDEN, eine laufende Uhr waere ein Flackerwerk. */
const JETZT = new Date(1_800_000_000 * 1000);

const SHARE = "shareAAA01";
const DATEI_A = "fileAAAA01";
const DATEI_B = "fileAAAA02";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
  vi.stubEnv("FILES_MAX_DATEI_BYTES", String(MAX_DATEI_BYTES));
  vi.stubEnv("FILES_AV_MAX_BYTES", String(MAX_DATEI_BYTES));
  vi.stubEnv("FILES_MAX_ABLAUF_TAGE", "7");

  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  // NUR `Date` eingefroren: dieser Weg schreibt echte Bytes durch echte
  // Stroeme, und ein mitgefaelschtes `setImmediate` hielte sie an. Der Wert ist
  // eine ganze Sekunde, der Rundlauf durch `mode: "timestamp"` also verlustfrei.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(JETZT);

  steuerung.avMaxBytes = null;
  steuerung.schreibFehler = null;
  steuerung.byteZaehlerVerschiebung = 0;
  steuerung.reiheAvEin.mockClear();

  authMock.mockReset();
  authMock.mockResolvedValue({
    user: { id: "sub-1", groups: ["drk-files-admin"] },
  } as never);
});

afterEach(() => {
  // `restoreAllMocks` stellt die Uhr NICHT zurueck — eine stehengebliebene
  // Fake-Uhr traefe jede spaeter laufende Datei derselben Umgebung.
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Vorrichtungen. Geschrieben wird ueber Drizzle, NICHT ueber rohes SQL mit
// `Date.now()`: `mode: "timestamp"` schreibt SEKUNDEN, ein Millisekundenwert
// saehe richtig aus und waere um den Faktor 1000 daneben (`schema.ts:4-13`).
// ---------------------------------------------------------------------------

async function bank() {
  const { getDb } = await import("@/app/m/files/_db/client");
  return getDb();
}

async function legeShare(typ: "file" | "folder" = "file", totalSize = 0): Promise<void> {
  const { shares } = await import("@/app/m/files/_db/schema");
  (await bank())
    .insert(shares)
    .values({
      id: SHARE,
      title: "Uebung Nord",
      description: null,
      type: typ,
      expiresAt: new Date(JETZT.getTime() + 7 * 24 * 3600 * 1000),
      maxDownloads: null,
      downloadCount: 0,
      passwordHash: null,
      totalSize,
      createdAt: JETZT,
      createdBy: "sub-1",
    })
    .run();
}

type DateiVorgabe = {
  id: string;
  dateiname?: string;
  /** `true` = `bytes_vollstaendig_at` gesetzt (§4.4). */
  vollstaendig?: boolean;
  groesse?: number;
};

async function legeDatei(vorgabe: DateiVorgabe): Promise<void> {
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  (await bank())
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId: SHARE,
      filename: vorgabe.dateiname ?? "bild.png",
      // Der Platzhalter aus `anlegenAction` (§7.1) — er wird beim letzten Chunk
      // durch den FESTGESTELLTEN Typ ersetzt.
      mimeType: "application/octet-stream",
      size: vorgabe.groesse ?? 0,
      createdAt: JETZT,
      bytesVollstaendigAt: vorgabe.vollstaendig ? JETZT : null,
      avStatus: "scanning",
      avGeprueftAt: null,
    })
    .run();
}

/*
 * Die Spalten stehen AUSGESCHRIEBEN, auch hier in der Vorrichtung: die
 * Quelltext-Zusicherung in `_db/queries.test.ts` verbietet ein argumentloses
 * `select()` im GANZEN Modulverzeichnis, Testdateien eingeschlossen — sonst
 * kaeme ein echter Treffer in einer Testdatei durch.
 */
async function holeDatei(id: string) {
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  return (await bank())
    .select({
      id: shareFiles.id,
      shareId: shareFiles.shareId,
      filename: shareFiles.filename,
      mimeType: shareFiles.mimeType,
      size: shareFiles.size,
      bytesVollstaendigAt: shareFiles.bytesVollstaendigAt,
      avStatus: shareFiles.avStatus,
    })
    .from(shareFiles)
    .where(eq(shareFiles.id, id))
    .get();
}

async function holeShare() {
  const { shares } = await import("@/app/m/files/_db/schema");
  return (await bank())
    .select({ id: shares.id, type: shares.type, totalSize: shares.totalSize })
    .from(shares)
    .where(eq(shares.id, SHARE))
    .get();
}

// --- Aufrufe ---------------------------------------------------------------

type PutOpt = { ab?: number; ende?: boolean; host?: string; typ?: string };

function adresse(fileId: string, opt: PutOpt): URL {
  const url = new URL(`http://intern/m/files/api/upload/${fileId}`);
  if (opt.ab !== undefined) url.searchParams.set("ab", String(opt.ab));
  if (opt.ende) url.searchParams.set("ende", "1");
  return url;
}

function kopf(opt: PutOpt): Headers {
  // Der Host kommt ueber `x-forwarded-host` — den `host`-Header setzt `fetch`
  // selbst und laesst ihn nicht ueberschreiben; `resolveHost` liest ohnehin
  // zuerst `x-forwarded-host` (`routing.ts:36-41`).
  const h = new Headers({ "x-forwarded-host": opt.host ?? VERWALTUNG });
  if (opt.typ !== undefined) h.set("content-type", opt.typ);
  return h;
}

/**
 * `Uint8Array` ist unter der hiesigen `lib`-Kombination kein `BodyInit` (die
 * Typen sind seit TS 5.7 ueber `ArrayBufferLike` generisch). Ein reiner
 * `ArrayBuffer` ist es — und die Kopie ist noetig, weil `.buffer` bei einem
 * Ausschnitt mehr enthalten kann als der Ausschnitt selbst.
 */
function alsKoerper(bytes: Uint8Array): ArrayBuffer {
  const kopie = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(kopie).set(bytes);
  return kopie;
}

async function put(fileId: string, koerper: Uint8Array, opt: PutOpt = {}): Promise<Response> {
  const { PUT } = await import("./route");
  return PUT(
    new Request(adresse(fileId, opt), {
      method: "PUT",
      body: alsKoerper(koerper),
      headers: kopf(opt),
    }),
    { params: Promise.resolve({ fileId }) },
  );
}

async function hole(fileId: string, opt: PutOpt = {}): Promise<Response> {
  const { GET } = await import("./route");
  return GET(new Request(adresse(fileId, opt), { headers: kopf(opt) }), {
    params: Promise.resolve({ fileId }),
  });
}

async function brichAb(fileId: string, opt: PutOpt = {}): Promise<Response> {
  const { DELETE } = await import("./route");
  return DELETE(new Request(adresse(fileId, opt), { method: "DELETE", headers: kopf(opt) }), {
    params: Promise.resolve({ fileId }),
  });
}

const teilPfad = (fileId: string) => `${DIR}/files/${SHARE}/${fileId}.part`;
const zielPfad = (fileId: string) => `${DIR}/files/${SHARE}/${fileId}`;

// ---------------------------------------------------------------------------

describe("Der Riegel", () => {
  it("Punkt 1: eine Sitzung ohne Zugang laeuft in das notFound-Verhalten — nie 403", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    authMock.mockResolvedValue({ user: { id: "sub-2", groups: ["andere-gruppe"] } } as never);

    await expect(put(DATEI_A, PNG_KOPF, { ab: 0 })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Punkt 1: ohne Sitzung fuehrt der Weg zur Anmeldung, nicht zu 403", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    authMock.mockResolvedValue(null as never);

    await expect(put(DATEI_A, PNG_KOPF, { ab: 0 })).rejects.toThrow("NEXT_REDIRECT");
  });

  it("Punkt 7: auf dem Inbox-Host antworten ALLE DREI Methoden 404 — kein Wurf", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    const antworten = [
      await put(DATEI_A, PNG_KOPF, { ab: 0, host: INBOX }),
      await hole(DATEI_A, { host: INBOX }),
      await brichAb(DATEI_A, { host: INBOX }),
    ];

    expect(antworten.map((a) => a.status)).toEqual([404, 404, 404]);
    // Und die Bytes sind nirgends gelandet: die Sperre steht VOR dem Schreiben.
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
  });

  it("Punkt 7: auf dem Inbox-Host verlangt die Route auch OHNE Sitzung keine Anmeldung — 404, kein Wurf", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    // Der Test darueber laeuft mit der berechtigten Standardsitzung und wuerde
    // deshalb auch bei umgekehrter Reihenfolge in `riegel` gruen bleiben. Erst
    // die KOMBINATION beider Bedingungen haelt die Reihenfolge fest: Rolle
    // zuerst, Zugriff danach. Andersherum bekaeme ein Anonymer auf dem
    // Inbox-Host einen 307 auf `/login` — und der verriete, dass es unter
    // dieser Adresse etwas zu holen gibt (§3.2, wie `api/inbox/[id]`).
    authMock.mockResolvedValue(null as never);

    const antworten = [
      await put(DATEI_A, PNG_KOPF, { ab: 0, host: INBOX }),
      await hole(DATEI_A, { host: INBOX }),
      await brichAb(DATEI_A, { host: INBOX }),
    ];

    expect(antworten.map((a) => a.status)).toEqual([404, 404, 404]);
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
  });
});

describe("Der Chunk-Weg", () => {
  it("Punkt 2: ein `ab` ungleich der Laenge der Zwischendatei ergibt 409 mit dem erwarteten Offset", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    await put(DATEI_A, new Uint8Array(30), { ab: 0 });

    const daneben = await put(DATEI_A, new Uint8Array(5), { ab: 99 });
    expect(daneben.status).toBe(409);
    expect(await daneben.json()).toMatchObject({ erwartetesOffsetBytes: 30 });

    // Auch der zu KLEINE Offset ist ein Konflikt, kein stilles Ueberschreiben.
    const zurueck = await put(DATEI_A, new Uint8Array(5), { ab: 10 });
    expect(zurueck.status).toBe(409);
    expect(await zurueck.json()).toMatchObject({ erwartetesOffsetBytes: 30 });
  });

  it("Punkt 3: zwei Chunks ergeben die vollstaendige Datei, und GET nennt nach dem ersten genau dessen Bytezahl", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    const eins = new Uint8Array([...PNG_KOPF, 1, 2, 3]);
    const zwei = new Uint8Array([4, 5, 6, 7]);

    expect((await put(DATEI_A, eins, { ab: 0 })).status).toBe(200);

    const stand = await hole(DATEI_A);
    expect(stand.status).toBe(200);
    expect(await stand.json()).toMatchObject({ empfangeneBytes: eins.length });

    expect((await put(DATEI_A, zwei, { ab: eins.length, ende: true, typ: "image/png" })).status).toBe(
      200,
    );

    expect(new Uint8Array(readFileSync(zielPfad(DATEI_A)))).toEqual(
      new Uint8Array([...eins, ...zwei]),
    );

    // Nach dem Umbenennen gibt es keine Zwischendatei mehr, `empfangeneBytes`
    // faellt also auf 0. Ohne die zweite Auskunft hielte ein wiederaufnehmender
    // Client eine fertige Datei fuer eine unbegonnene und lieferte sie erneut.
    expect(await (await hole(DATEI_A)).json()).toMatchObject({
      empfangeneBytes: 0,
      vollstaendig: true,
    });
  });

  it("Punkt 4: die Ueberschreitung faellt beim ZAEHLEN, ergibt 413 mit Grenze und Einheit und loescht die Zwischendatei", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    const zuGross = new Uint8Array(MAX_DATEI_BYTES + 1);
    zuGross.set(PNG_KOPF, 0);

    const antwort = await put(DATEI_A, zuGross, { ab: 0 });
    expect(antwort.status).toBe(413);

    const koerper = (await antwort.json()) as { fehler: string; grenzeBytes: number };
    expect(koerper.grenzeBytes).toBe(MAX_DATEI_BYTES);
    // Die EINHEIT gehoert in die Meldung, nicht in einen Kommentar (§9.1): vier
    // Groessenlimits an vier Orten in drei Einheiten, mit zwei truegerischen Paaren.
    expect(koerper.fehler).toContain("Bytes");
    expect(koerper.fehler).toContain(String(MAX_DATEI_BYTES));

    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
    expect((await holeDatei(DATEI_A))?.bytesVollstaendigAt).toBeNull();
  });

  it("Punkt 5: der letzte Chunk stellt fest, benennt um, misst, summiert neu und reiht ein", async () => {
    // `total_size` steht absichtlich FALSCH (0) und eine zweite, schon
    // vollstaendige Datei traegt 100 Bytes: nur so unterscheidet der Test
    // „neu summiert" von „um die neuen Bytes erhoeht".
    await legeShare("folder", 0);
    await legeDatei({ id: DATEI_B, vollstaendig: true, groesse: 100 });
    // Eine dritte, UNVOLLSTAENDIGE Zeile mit einer Bytezahl ungleich 0: ohne sie
    // bewegt sich beim Streichen des `IS NOT NULL`-Filters nichts, weil
    // `anlegenAction` heute `size: 0` schreibt. Die §4.4-Zusage („gezaehlt
    // werden ausschliesslich VOLLSTAENDIGE Zeilen") waere dann unbewacht.
    await legeDatei({ id: "fileAAAA04", groesse: 7777 });
    await legeDatei({ id: DATEI_A });

    const inhalt = new Uint8Array([...PNG_KOPF, 9, 9, 9, 9]);
    const antwort = await put(DATEI_A, inhalt, { ab: 0, ende: true, typ: "image/png" });
    expect(antwort.status).toBe(200);

    const zeile = await holeDatei(DATEI_A);
    expect(zeile?.size).toBe(inhalt.length);
    expect(zeile?.mimeType).toBe("image/png");
    // Der WERT, nicht bloss seine Existenz: die Spalte fuehrt `mode:
    // "timestamp"`, also SEKUNDEN. Ein Faktor-1000-Fehler oder ein
    // Platzhalterdatum saehe unter `not.toBeNull()` genauso richtig aus.
    expect(zeile?.bytesVollstaendigAt?.getTime()).toBe(JETZT.getTime());
    // `av_status` BLEIBT `scanning` — der Scan laeuft hinter der Antwort (§6.1).
    expect(zeile?.avStatus).toBe("scanning");

    expect((await holeShare())?.totalSize).toBe(100 + inhalt.length);

    // Umbenannt: das Ziel existiert, die Zwischendatei nicht mehr.
    expect(existsSync(zielPfad(DATEI_A))).toBe(true);
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);

    expect(steuerung.reiheAvEin).toHaveBeenCalledWith({
      art: "share",
      shareId: SHARE,
      fileId: DATEI_A,
    });
  });

  it("Punkt 5: die gemessene Bytezahl gewinnt gegen eine Selbstauskunft des Clients", async () => {
    await legeShare();
    // Die Zeile behauptet 12345 Bytes; geschrieben werden 12.
    await legeDatei({ id: DATEI_A, groesse: 12345 });

    const inhalt = new Uint8Array([...PNG_KOPF, 1, 2, 3, 4]);
    await put(DATEI_A, inhalt, { ab: 0, ende: true, typ: "image/png" });

    expect((await holeDatei(DATEI_A))?.size).toBe(12);
    expect((await holeShare())?.totalSize).toBe(12);
  });

  it("Punkt 5: `size` traegt die Laenge der DATEI, nicht die Selbstauskunft der Schreibfunktion", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    // Der Zaehler meldet sieben Bytes zu viel. Beide Zahlen sind im Normalfall
    // gleich; nur so ist zu sehen, welche in der Spalte landet (§5.4: ein
    // falsches `Content-Length` braeche den Download beim Empfaenger ab).
    steuerung.byteZaehlerVerschiebung = 7;

    const inhalt = new Uint8Array([...PNG_KOPF, 1, 2, 3, 4]);
    await put(DATEI_A, inhalt, { ab: 0, ende: true, typ: "image/png" });

    expect((await holeDatei(DATEI_A))?.size).toBe(inhalt.length);
    expect((await holeShare())?.totalSize).toBe(inhalt.length);
  });

  it("eine bereits vollstaendige Zeile wird nicht ein zweites Mal beschrieben", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, vollstaendig: true, groesse: 12 });

    const antwort = await put(DATEI_A, PNG_KOPF, { ab: 0 });

    // Sonst entstuende ein neuer Blob unter einem bereits geprueften
    // `av_status`, und der Empfaenger laedt Bytes, die niemand gesehen hat.
    expect(antwort.status).toBe(409);
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
    expect((await holeDatei(DATEI_A))?.size).toBe(12);
  });

  it("ein `ab`, das kein Byte-Offset ist, ergibt 400 statt einer geratenen 0", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    for (const roh of ["-1", "1.5", "0x10", "1e3", "abc"]) {
      const url = new URL(`http://intern/m/files/api/upload/${DATEI_A}?ab=${roh}`);
      const { PUT } = await import("./route");
      const antwort = await PUT(
        new Request(url, {
          method: "PUT",
          body: new ArrayBuffer(0),
          headers: new Headers({ "x-forwarded-host": VERWALTUNG }),
        }),
        { params: Promise.resolve({ fileId: DATEI_A }) },
      );
      expect([roh, antwort.status]).toEqual([roh, 400]);
    }
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
  });

  it("ein zweiter Starter auf dasselbe Ziel laeuft in einen GEMELDETEN Konflikt, nicht in verschraenkte Bytes", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    // Ein leerer erster Chunk legt die Zwischendatei mit Laenge 0 an. Der
    // Fortschritt ist damit 0 — genau der Wert, den ein zweiter Starter
    // schickt. `wx` meldet den Fall, statt die Bytes zweier Uploads zu mischen
    // (in `drop` gemessen: vier gleichzeitige Uploads → vier 200, ZWEI Dateien).
    expect((await put(DATEI_A, new Uint8Array(0), { ab: 0 })).status).toBe(200);

    const zweiter = await put(DATEI_A, PNG_KOPF, { ab: 0 });
    expect(zweiter.status).toBe(409);
    expect(await zweiter.json()).toMatchObject({ erwartetesOffsetBytes: 0 });
  });

  it("Punkt 6: ein Inhalt, der die MIME-Pruefung nicht passiert, wird abgelehnt — Zwischendatei weg, Zeile unvollstaendig", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, dateiname: "bild.png" });

    // Kein Signaturtreffer und kein Text (NUL-Byte) — also „gehoert nicht hierher".
    const unrat = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const antwort = await put(DATEI_A, unrat, { ab: 0, ende: true, typ: "image/png" });

    expect(antwort.status).toBe(415);
    expect(((await antwort.json()) as { fehler: string }).fehler).toMatch(/Format/i);

    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
    expect(existsSync(zielPfad(DATEI_A))).toBe(false);
    const zeile = await holeDatei(DATEI_A);
    expect(zeile?.bytesVollstaendigAt).toBeNull();
    expect(zeile?.mimeType).toBe("application/octet-stream");
    expect(steuerung.reiheAvEin).not.toHaveBeenCalled();
  });

  /*
   * Die beiden folgenden Faelle sind das EINZIGE Paar, das den NAMEN des
   * Deklarationskopfes traegt. Jede andere MIME-Probe hier fuettert eine echte
   * PNG-Signatur, und ueber die entscheiden die Magic Bytes allein — ein
   * `deklariert: null` im Handler bliebe dort unbemerkt. `text/plain` ist der
   * einzige Allowlist-Typ OHNE Signatur (`_lib/mime.ts:360-368`): die
   * Deklaration ist sein einziges Positivsignal. Faellt sie weg (falsch
   * geschriebener Header-Name, ein Client ohne den Kopf), wird jede
   * `.txt`-Abgabe still mit 415 abgewiesen.
   */
  it("Punkt 6: reiner Text wird nur angenommen, wenn der Client ihn als `text/plain` AUSWEIST", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, dateiname: "notiz.txt" });

    const inhalt = new TextEncoder().encode("Hallo Welt\n");
    const antwort = await put(DATEI_A, inhalt, { ab: 0, ende: true, typ: "text/plain" });

    expect(antwort.status).toBe(200);
    // Der FESTGESTELLTE Typ ersetzt den Platzhalter — und festgestellt werden
    // konnte er hier nur aus der Deklaration plus Endung.
    expect((await holeDatei(DATEI_A))?.mimeType).toBe("text/plain");
  });

  it("Punkt 6: DIESELBEN Textbytes OHNE Deklaration ergeben 415 `text-nicht-ausgewiesen`", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, dateiname: "notiz.txt" });

    const inhalt = new TextEncoder().encode("Hallo Welt\n");
    const antwort = await put(DATEI_A, inhalt, { ab: 0, ende: true });

    expect(antwort.status).toBe(415);
    // Nur die Deklaration unterscheidet diesen Fall vom vorigen. Ohne diesen
    // Grund kaeme `bericht.html` als `text/plain` durch und waere beim
    // Empfaenger einen Doppelklick von ausgefuehrtem Markup entfernt.
    expect((await antwort.json()) as { grund: string }).toMatchObject({
      grund: "text-nicht-ausgewiesen",
    });
    expect(existsSync(zielPfad(DATEI_A))).toBe(false);
    expect((await holeDatei(DATEI_A))?.mimeType).toBe("application/octet-stream");
  });

  it("Punkt 9: oberhalb von FILES_AV_MAX_BYTES wird BENANNT abgelehnt statt dauerhaft `unscanned` angenommen", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    // §9.4 Pruefung 3 macht diesen Zweig im Normalbetrieb unerreichbar; er ist
    // die ZWEITE Linie fuer den Tag, an dem die Zahl zur Laufzeit sinkt (§6.6).
    steuerung.avMaxBytes = 4;

    const inhalt = new Uint8Array([...PNG_KOPF, 1, 2, 3]);
    const antwort = await put(DATEI_A, inhalt, { ab: 0, ende: true, typ: "image/png" });

    expect(antwort.status).toBe(413);
    expect(((await antwort.json()) as { fehler: string }).fehler).toContain("Virenpruefung");

    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
    expect(existsSync(zielPfad(DATEI_A))).toBe(false);
    const zeile = await holeDatei(DATEI_A);
    expect(zeile?.bytesVollstaendigAt).toBeNull();
    expect(zeile?.avStatus).toBe("scanning");
  });

  it("Punkt 10: `KeinPlatz` ergibt 507 mit geloeschter Zwischendatei", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    // Erst echte Bytes, damit es ueberhaupt eine Zwischendatei zu loeschen gibt.
    await put(DATEI_A, new Uint8Array([...PNG_KOPF, 1, 2]), { ab: 0 });
    expect(existsSync(teilPfad(DATEI_A))).toBe(true);

    const { KeinPlatz } = await import("../../../_lib/storage");
    steuerung.schreibFehler = () => new KeinPlatz("[files] kein Platz in der Ablage (test)");

    const antwort = await put(DATEI_A, new Uint8Array([3, 4]), { ab: 10 });
    expect(antwort.status).toBe(507);
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
  });

  it("Punkt 10: `AblageNichtSchreibbar` ergibt 500 UND eine laute Logzeile", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });

    const { AblageNichtSchreibbar } = await import("../../../_lib/storage");
    steuerung.schreibFehler = () => new AblageNichtSchreibbar("[files] Ablage nicht schreibbar (EACCES)");
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});

    const antwort = await put(DATEI_A, PNG_KOPF, { ab: 0 });

    expect(antwort.status).toBe(500);
    // Ohne die Zeile sieht der Betreiber einen 500 ohne Grund — und ein
    // Konfigurationsfehler ist kein Nutzerfehler (§5.4).
    expect(laut).toHaveBeenCalled();
    expect(laut.mock.calls.flat().join(" ")).toContain(DATEI_A);
  });

  it("eine unbekannte fileId ergibt 404 — der Zielpfad entsteht nur aus einer gefundenen Zeile", async () => {
    await legeShare();
    expect((await put("nichtdaXYZ", PNG_KOPF, { ab: 0 })).status).toBe(404);
    expect((await hole("nichtdaXYZ")).status).toBe(404);
  });
});

describe("Der Abbruch (DELETE)", () => {
  it("Punkt 8: loescht Zwischendatei UND unvollstaendige Zeile und antwortet 204", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    await put(DATEI_A, new Uint8Array([...PNG_KOPF, 1, 2]), { ab: 0 });
    expect(existsSync(teilPfad(DATEI_A))).toBe(true);

    const antwort = await brichAb(DATEI_A);

    expect(antwort.status).toBe(204);
    expect(existsSync(teilPfad(DATEI_A))).toBe(false);
    expect(await holeDatei(DATEI_A)).toBeUndefined();
  });

  it("Punkt 8: eine unbekannte fileId ergibt 404", async () => {
    await legeShare();
    expect((await brichAb("nichtdaXYZ")).status).toBe(404);
  });

  it("Punkt 8: ein zweites DELETE auf dieselbe ID ist still 204", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A });
    await put(DATEI_A, new Uint8Array([...PNG_KOPF, 1, 2]), { ab: 0 });

    expect((await brichAb(DATEI_A)).status).toBe(204);
    // Der Browser wiederholt den Abbruch, wenn die Verbindung mitten im Upload
    // wegbricht — ein Fehler waere hier eine Falschmeldung.
    expect((await brichAb(DATEI_A)).status).toBe(204);
  });

  it("Punkt 8: eine VOLLSTAENDIGE Zeile wird nicht geloescht, sondern benannt abgewiesen", async () => {
    await legeShare();
    await legeDatei({ id: DATEI_A, vollstaendig: true, groesse: 12 });

    const antwort = await brichAb(DATEI_A);

    expect(antwort.status).toBe(409);
    // Der Loeschweg fuer fertige Dateien heisst `shareLoeschenAction` (T37) —
    // die Meldung muss den naechsten Schritt benennen.
    expect(((await antwort.json()) as { fehler: string }).fehler).toMatch(/vollstaendig|abgeschlossen/i);
    expect(await holeDatei(DATEI_A)).toBeDefined();
  });

  it("Punkt 8: `shares.type` wird nach dem Loeschen NEU abgeleitet (zwei Dateien, eine abgebrochen → `file`)", async () => {
    await legeShare("folder");
    await legeDatei({ id: DATEI_B, vollstaendig: true, groesse: 100 });
    await legeDatei({ id: DATEI_A });

    expect((await brichAb(DATEI_A)).status).toBe(204);

    // Sonst zeigte ein Share nach einem abgebrochenen zweiten Upload dauerhaft
    // „Ordner" bei einer Datei (T26 Punkt 5, dieselbe Regel).
    expect((await holeShare())?.type).toBe("file");
  });

  it("Punkt 8: bleiben mehrere Dateien uebrig, bleibt es ein Ordner", async () => {
    await legeShare("folder");
    await legeDatei({ id: DATEI_B, vollstaendig: true, groesse: 100 });
    await legeDatei({ id: "fileAAAA03", vollstaendig: true, groesse: 100 });
    await legeDatei({ id: DATEI_A });

    expect((await brichAb(DATEI_A)).status).toBe(204);

    expect((await holeShare())?.type).toBe("folder");
  });
});
