import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as schema from "../../../../_db/schema";
import { zugangslinks, type NewZugangslinkRow } from "../../../../_db/schema";
import { erzeugeToken, tokenHash } from "../../../../_lib/token";
import type { Grenzen } from "../../../../_lib/grenzen";

/**
 * `PUT /api/u/<token>/upload` — TEIL 1 (Task 31): Guard, Chunk-Weg, MIME, Zeile.
 *
 * DIE ZUSAGE, die dieser Test besitzt: eine anonyme Abgabe ist **sofort**
 * quittiert; der Zugangs-Guard steht **vor** allem anderen; und ein Fremder ohne
 * Zugangsdaten kann den naechsten **gueltigen** Melder nicht aussperren.
 *
 * DER GEMESSENE ALT-AUSFALL, den Punkt 1 umkehrt: in `drop` zaehlt der
 * `onRequest`-Hook VOR jedem preHandler-Guard hoch — fuenf Uploads OHNE Session
 * sperren gemessen den naechsten Upload MIT gueltiger Session. Deshalb prueft der
 * Test hier nicht die von der Spec genannten fuenf Fehlversuche (die liegen unter
 * `FILES_FEHLVERSUCHE_PRO_MIN` = 10 und waeren auch bei falsch verdrahtetem
 * Zaehler gruen), sondern **erschoepft den Zaehler sichtbar** (429) und laesst
 * DANACH eine gueltige Abgabe von DERSELBEN Adresse durch.
 *
 * WAS T50 SPAETER ERGAENZT und hier deshalb bewusst FEHLT: Mengenbudget je Token,
 * die Wettlauf-Rueckabwicklung, die IP-Notbremse (`FILES_IP_ANFRAGEN_PRO_10MIN`)
 * und der `POST`-Altweg. Diese Datei gehoert beiden Tasks (Plan §2).
 */

// --- Vorrichtung ------------------------------------------------------------

const VERWALTUNGS_HOST = "files.localtest.me";
const INBOX_HOST = "drop.localtest.me";

/**
 * Die Zahlen der Vorrichtung. `FILES_MAX_DATEI_BYTES` MUSS ueber
 * `FILES_CHUNK_BYTES` (4 MiB) liegen, sonst wirft `grenzen()` schon beim Lesen
 * (Pruefung 2 aus §9.4) — kleine Grenzen fuer die 413-Faelle kommen deshalb
 * ueber `grenzenUeberschreibung`, nicht ueber die Umgebung.
 */
const ENV_VORGABE: Record<string, string> = {
  SUITE_HOST_FILES: `${VERWALTUNGS_HOST},${INBOX_HOST}`,
  FILES_MAX_DATEI_BYTES: String(12 * 1024 * 1024),
  FILES_AV_MAX_BYTES: String(12 * 1024 * 1024),
  FILES_MAX_ABLAUF_TAGE: "7",
};

const { grenzenUeberschreibung, storungAmSchreiben, storungAmAbschluss } = vi.hoisted(() => ({
  grenzenUeberschreibung: { wert: null as Partial<Grenzen> | null },
  storungAmSchreiben: { art: null as null | "kein-platz" | "nicht-schreibbar" },
  storungAmAbschluss: { art: null as null | "kein-platz" },
}));

/**
 * `grenzen()` bleibt ECHT und wird nur ueberschrieben. Zwei Zweige sind anders
 * nicht erreichbar:
 *
 * - eine **kleine** `maxDateiBytes` (der 413-Fall ohne 12 MiB Testdaten),
 * - eine `avMaxBytes` UNTERHALB von `maxDateiBytes` — genau die Lage, die
 *   Pruefung 3 aus §9.4 beim Boot verbietet und die §6.6 ausdruecklich als
 *   ZWEITE Linie behandelt sehen will („damit die erste keine stille
 *   Voraussetzung hat").
 */
vi.mock("../../../../_lib/grenzen", async (original) => {
  const echt = await original<typeof import("../../../../_lib/grenzen")>();
  return {
    ...echt,
    grenzen: (env?: Record<string, string | undefined>) => ({
      ...echt.grenzen(env),
      ...(grenzenUeberschreibung.wert ?? {}),
    }),
  };
});

/**
 * Die Ablage bleibt ECHT — geschrieben wird in ein Temp-Verzeichnis. Injiziert
 * wird nur ein Fehler NACH dem echten Schreiben: nur so existiert die
 * Zwischendatei wirklich, und „507 mit **geloeschter** Zwischendatei" ist eine
 * Aussage ueber das Dateisystem statt ueber einen Mock. Die Fehlerklassen kommen
 * aus dem Originalmodul, damit `instanceof` im Handler greift.
 */
vi.mock("../../../../_lib/storage", async (original) => {
  const echt = await original<typeof import("../../../../_lib/storage")>();
  return {
    ...echt,
    schreibeStrom: async (...args: Parameters<typeof echt.schreibeStrom>) => {
      const ergebnis = await echt.schreibeStrom(...args);
      if (storungAmSchreiben.art === "kein-platz") {
        throw new echt.KeinPlatz("[files] kein Platz in der Ablage (Vorrichtung)");
      }
      if (storungAmSchreiben.art === "nicht-schreibbar") {
        throw new echt.AblageNichtSchreibbar("[files] Ablage nicht schreibbar (EACCES) (Vorrichtung)");
      }
      return ergebnis;
    },
    /**
     * Der zweite Stoerpunkt liegt am ENDE des Byte-Wegs — dort, wo `rename` auf
     * einem vollen oder nur lesbaren Volume genauso scheitert wie `write`.
     *
     * Er delegiert bewusst NICHT ans Original, anders als der Stoerpunkt am
     * Schreiben: `abschliesse` haette die Zwischendatei sonst schon wegbenannt,
     * und „nach dem 507 liegt nichts mehr da" waere eine leere Aussage.
     */
    abschliesse: async (...args: Parameters<typeof echt.abschliesse>) => {
      if (storungAmAbschluss.art === "kein-platz") {
        throw new echt.KeinPlatz("[files] kein Platz in der Ablage (Vorrichtung, rename)");
      }
      return echt.abschliesse(...args);
    },
  };
});

vi.mock("../../../../_db/client", () => ({ getDb: () => db }));

/**
 * Nur `reiheAvEin` wird beobachtet — der Rest von `_lib/av.ts` bleibt echt.
 * Ohne diese Beobachtung waere „der Scan ist eingereiht" die einzige Zeile des
 * Handlers, die kein Test besitzt: die Zeile steht danach zwar korrekt in der
 * Warteschlange (`av_status = 'scanning'` UND `bytes_vollstaendig_at IS NOT
 * NULL`), aber der SOFORTSCAN bliebe aus, und die Abgabe stuende bis zum
 * naechsten Takt auf „wird geprueft" — richtig, aber unnoetig (§6.4).
 */
const { reiheAvEinMock } = vi.hoisted(() => ({ reiheAvEinMock: vi.fn() }));
vi.mock("../../../../_lib/av", async (original) => {
  const echt = await original<typeof import("../../../../_lib/av")>();
  return { ...echt, reiheAvEin: reiheAvEinMock };
});

let ablage: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
const gesichert: Record<string, string | undefined> = {};

beforeAll(() => {
  ablage = mkdtempSync(join(tmpdir(), "files-inbox-upload-"));
  for (const [name, wert] of Object.entries({ ...ENV_VORGABE, DATA_DIR: ablage })) {
    gesichert[name] = process.env[name];
    process.env[name] = wert;
  }
});

afterAll(() => {
  for (const [name, wert] of Object.entries(gesichert)) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
  rmSync(ablage, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/files/_db/migrations" });
  // Auch die ABLAGE beginnt je Test leer: sonst sammelt das Postfach-Verzeichnis
  // die Blobs aller vorherigen Tests, und „nach der Ablehnung liegt nichts mehr
  // da" waere keine pruefbare Aussage mehr.
  rmSync(join(ablage, "files"), { recursive: true, force: true });
  grenzenUeberschreibung.wert = null;
  storungAmSchreiben.art = null;
  storungAmAbschluss.art = null;
  reiheAvEinMock.mockClear();
});

afterEach(() => sqlite.close());

/**
 * Der Fehlversuchszaehler lebt im PROZESSSPEICHER und ueberlebt jeden
 * `beforeEach`. Statt das Modul zwischen den Tests neu zu laden — was die
 * Fehlerklassen aus `_lib/storage` in eine zweite Registry heben und jedes
 * `instanceof` still brechen wuerde — bekommt jeder Test seine eigene Adresse.
 */
let ipZaehler = 0;
function neueIp(): string {
  ipZaehler += 1;
  return `10.${Math.floor(ipZaehler / 250)}.${ipZaehler % 250}.7`;
}

function neuerLink(over: Partial<NewZugangslinkRow> = {}): { id: string; token: string } {
  const token = erzeugeToken();
  const id = nanoid(10);
  db.insert(zugangslinks)
    .values({
      id,
      name: "Übung Nord",
      tokenStart: token.slice(0, 7),
      tokenHash: tokenHash(token),
      createdAt: new Date(),
      createdBy: "test",
      expiresAt: new Date(Date.now() + 3600_000),
      budgetDateien: 100,
      budgetBytes: 100 * 1024 * 1024,
      ...over,
    })
    .run();
  return { id, token };
}

type Frage = Record<string, string | number | undefined>;

async function put(opts: {
  token: string;
  frage?: Frage;
  koerper?: Uint8Array;
  host?: string;
  ip?: string;
}): Promise<Response> {
  const { PUT } = await import("./route");
  const suche = new URLSearchParams();
  for (const [name, wert] of Object.entries(opts.frage ?? {})) {
    if (wert !== undefined) suche.set(name, String(wert));
  }
  const url = `http://${opts.host ?? INBOX_HOST}/m/files/api/u/${encodeURIComponent(
    opts.token,
  )}/upload?${suche.toString()}`;
  const anfrage = new Request(url, {
    method: "PUT",
    headers: {
      "x-forwarded-host": opts.host ?? INBOX_HOST,
      "x-forwarded-for": opts.ip ?? neueIp(),
    },
    // Kopie in einen eigenen ArrayBuffer: `BodyInit` verlangt `Uint8Array<ArrayBuffer>`.
    body: new Uint8Array(opts.koerper ?? []),
  });
  return PUT(anfrage, { params: Promise.resolve({ token: opts.token }) });
}

type Antwortkoerper = {
  id?: string;
  empfangen?: number;
  fertig?: boolean;
  code?: string;
  fehler?: string;
  erwartetesAb?: number;
  mimeTyp?: string;
};

async function koerperVon(antwort: Response): Promise<Antwortkoerper> {
  const text = await antwort.text();
  return text === "" ? {} : (JSON.parse(text) as Antwortkoerper);
}

/** Eine Datei in EINER Anfrage: `ab=0` ohne `id`, zugleich `ende=1`. */
async function abgabe(
  token: string,
  inhalt: Uint8Array,
  frage: Frage = {},
  opts: { ip?: string; host?: string } = {},
): Promise<Response> {
  return put({
    token,
    koerper: inhalt,
    ip: opts.ip,
    host: opts.host,
    frage: { ab: 0, ende: 1, name: "foto.png", typ: "image/png", ...frage },
  });
}

const PNG = (fuellung = 16): Uint8Array =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(fuellung).fill(0x42)]);

const PDF = (text = "%PDF-1.7\nInhalt der Übung\n") => new TextEncoder().encode(text);

/** Binaer, ohne bekannte Signatur, mit NUL — also weder Allowlist-Typ noch Text. */
const UNBEKANNT = Uint8Array.from([0x00, 0xff, 0x13, 0x37, 0x00, 0x99, 0xab, 0xcd]);

function inboxZeilen(): Record<string, unknown>[] {
  return sqlite.prepare("SELECT * FROM inbox_files").all() as Record<string, unknown>[];
}

function blobPfad(id: string): string {
  return join(ablage, "files", "inbox", id);
}

/**
 * Was WIRKLICH im Postfach-Verzeichnis liegt — Blobs UND `.part`-Reste. Eine
 * Pruefung auf einen einzelnen erwarteten Pfad koennte einen Rest unter einer
 * anderen ID nicht sehen; das Verzeichnislisting kann es.
 */
function inboxDateien(): string[] {
  const verzeichnis = join(ablage, "files", "inbox");
  return existsSync(verzeichnis) ? readdirSync(verzeichnis).sort() : [];
}

// --- Punkt 1: der Zugangs-Guard steht vor allem anderen ---------------------

describe("PUT /api/u/[token]/upload — Punkt 1: Zugangs-Guard zuerst", () => {
  it("weist ein unbekanntes Token mit 401 ab und legt keine Zeile an", async () => {
    neuerLink();
    const antwort = await abgabe("dz-2345-6789-abcd", PNG());

    expect(antwort.status).toBe(401);
    expect((await koerperVon(antwort)).code).toBe("token");
    expect(inboxZeilen()).toHaveLength(0);
  });

  it("weist ein grammatikalisch ungueltiges Token mit 401 ab (kein 500)", async () => {
    const antwort = await abgabe("nicht-mal-ein-token", PNG());

    expect(antwort.status).toBe(401);
    expect((await koerperVon(antwort)).code).toBe("token");
  });

  it("weist ein ABGELAUFENES Token mit 401 ab", async () => {
    const { token } = neuerLink({ expiresAt: new Date(Date.now() - 1000) });
    const antwort = await abgabe(token, PNG());

    expect(antwort.status).toBe(401);
    expect(inboxZeilen()).toHaveLength(0);
  });

  it("weist ein WIDERRUFENES Token mit 401 ab", async () => {
    const { token } = neuerLink({ revokedAt: new Date(Date.now() - 1000) });
    const antwort = await abgabe(token, PNG());

    expect(antwort.status).toBe(401);
    expect(inboxZeilen()).toHaveLength(0);
  });

  /**
   * DER KERN VON PUNKT 1. Der Zaehler wird sichtbar erschoepft (429) — und die
   * gueltige Abgabe von DERSELBEN Adresse geht trotzdem durch. Wer den Zaehler
   * VOR den Guard zieht (die Bauform von `drop`), macht diesen Test rot.
   */
  it("erschoepfte Fehlversuche sperren die naechste GUELTIGE Abgabe derselben Adresse nicht", async () => {
    const { token } = neuerLink();
    const ip = neueIp();

    const stati: number[] = [];
    for (let n = 0; n < 12; n += 1) {
      stati.push((await abgabe("dz-2345-6789-abcd", PNG(), {}, { ip })).status);
    }

    // Erst 401, ab dem erschoepften Zaehler 429 — der Zaehler zaehlt also wirklich.
    expect(stati.slice(0, 10)).toEqual(new Array(10).fill(401));
    expect(stati.at(-1)).toBe(429);

    const gueltig = await abgabe(token, PNG(), {}, { ip });
    expect(gueltig.status).toBe(200);
    expect(inboxZeilen()).toHaveLength(1);
  });
});

// --- Punkt 6: Rollensperre --------------------------------------------------

describe("PUT /api/u/[token]/upload — Punkt 6: Rollensperre", () => {
  it("antwortet auf dem VERWALTUNGS-Host mit 404, auch mit gueltigem Token", async () => {
    const { token } = neuerLink();
    const antwort = await abgabe(token, PNG(), {}, { host: VERWALTUNGS_HOST });

    expect(antwort.status).toBe(404);
    expect(inboxZeilen()).toHaveLength(0);
  });

  it("antwortet auf einem unbekannten Host mit 404", async () => {
    const { token } = neuerLink();
    const antwort = await abgabe(token, PNG(), {}, { host: "fremd.example" });

    expect(antwort.status).toBe(404);
  });
});

// --- Punkt 2: der Chunk-Weg -------------------------------------------------

describe("PUT /api/u/[token]/upload — Punkt 2: der Chunk-Weg", () => {
  it("setzt zwei Chunks zur vollstaendigen Datei zusammen", async () => {
    const { token } = neuerLink();
    const kopf = PNG(4);
    const rest = Uint8Array.from([1, 2, 3, 4, 5, 6]);

    const erster = await put({ token, koerper: kopf, frage: { ab: 0, name: "bild.png" } });
    expect(erster.status).toBe(200);
    const { id, empfangen, fertig } = await koerperVon(erster);
    expect(empfangen).toBe(kopf.byteLength);
    expect(fertig).toBe(false);
    expect(id).toBeTypeOf("string");

    const zweiter = await put({
      token,
      koerper: rest,
      frage: { id, ab: kopf.byteLength, ende: 1, typ: "image/png" },
    });
    expect(zweiter.status).toBe(200);
    expect((await koerperVon(zweiter)).fertig).toBe(true);

    const abgelegt = readFileSync(blobPfad(id!));
    expect(new Uint8Array(abgelegt)).toEqual(Uint8Array.from([...kopf, ...rest]));
    expect(inboxZeilen()[0].size).toBe(kopf.byteLength + rest.byteLength);
  });

  it("antwortet 409 mit dem ERWARTETEN Offset, wenn `ab` nicht der Laenge entspricht", async () => {
    const { token } = neuerLink();
    const kopf = PNG(4);
    const { id } = await koerperVon(
      await put({ token, koerper: kopf, frage: { ab: 0, name: "bild.png" } }),
    );

    const daneben = await put({
      token,
      koerper: Uint8Array.from([9, 9]),
      frage: { id, ab: kopf.byteLength + 5 },
    });

    expect(daneben.status).toBe(409);
    const koerper = await koerperVon(daneben);
    expect(koerper.code).toBe("offset");
    expect(koerper.erwartetesAb).toBe(kopf.byteLength);
  });

  /**
   * Die Gegenrichtung, und sie ist die gefaehrlichere: `ab` UNTERHALB der
   * liegenden Laenge. Ein `ab >= 0`-Vergleich statt `ab === Laenge` naehme sie an,
   * und weil `anhaengen: ab > 0` gilt, wuerden die Bytes trotzdem ANGEHAENGT — der
   * Blob waere still verdorben, und `pruefeInhaltstyp` beim letzten Chunk saehe
   * nichts davon, weil es nur die (korrekten) Kopfbytes liest.
   *
   * MUTATION: `bisher !== ab` → `bisher < ab` im Handler — dieser Test muss rot
   * werden. Ohne ihn besitzt die Suite die Zusage „genau die Laenge" nur nach oben.
   */
  it("antwortet 409 auch auf ein `ab` UNTERHALB der Laenge — und haengt nichts an", async () => {
    const { token } = neuerLink();
    const kopf = PNG(4);
    const { id } = await koerperVon(
      await put({ token, koerper: kopf, frage: { ab: 0, name: "bild.png" } }),
    );

    const zuFrueh = await put({
      token,
      koerper: Uint8Array.from([9, 9]),
      frage: { id, ab: kopf.byteLength - 4 },
    });

    expect(zuFrueh.status).toBe(409);
    const koerper = await koerperVon(zuFrueh);
    expect(koerper.code).toBe("offset");
    expect(koerper.erwartetesAb).toBe(kopf.byteLength);
    // Die Zwischendatei ist UNVERAENDERT: kein Byte des abgewiesenen Abschnitts
    // hat sie erreicht.
    expect(statSync(`${blobPfad(id!)}.part`).size).toBe(kopf.byteLength);
  });

  /**
   * §5.3, die Zusage von `wx`: ein ZWEITER Starter auf dasselbe Ziel sieht EEXIST
   * statt verschraenkter Bytes. Der erste Chunk hier traegt bewusst KEINE Bytes —
   * das ist genau der Zwischenzustand eines laufenden Starters zwischen
   * `open(…, "wx")` und dem ersten `write`: die Zwischendatei existiert, ist aber
   * leer, `fortschritt` liest 0, und der Offsetvergleich laesst den zweiten
   * Aufrufer durch. Erst `wx` meldet den Konflikt.
   *
   * ZWEI MUTATIONEN muessen diesen Test roeten: `anhaengen: ab > 0` → `anhaengen:
   * true` (dann oeffnet auch der Starter mit `a`, EEXIST entsteht nie) und ein
   * entfernter EEXIST-Zweig in `aufSchreibfehler` (dann faellt der Fehler in den
   * `throw` am Ende und wird ein unbehandelter 500).
   */
  it("meldet einen zweiten Starter auf dasselbe Ziel als 409 statt als 500", async () => {
    const { token } = neuerLink();
    const erster = await put({
      token,
      koerper: new Uint8Array(),
      frage: { ab: 0, name: "bild.png" },
    });
    expect(erster.status).toBe(200);
    const { id } = await koerperVon(erster);
    expect(statSync(`${blobPfad(id!)}.part`).size).toBe(0);

    const zweiter = await put({ token, koerper: PNG(), frage: { id, ab: 0 } });

    expect(zweiter.status).toBe(409);
    const koerper = await koerperVon(zweiter);
    expect(koerper.code).toBe("offset");
    expect(koerper.erwartetesAb).toBe(0);
    // Nichts angehaengt — das ist der ganze Punkt von `wx`.
    expect(statSync(`${blobPfad(id!)}.part`).size).toBe(0);
  });

  it("laesst die unvollstaendige Zeile mit `bytes_vollstaendig_at = NULL` stehen", async () => {
    const { token } = neuerLink();
    await put({ token, koerper: PNG(4), frage: { ab: 0, name: "bild.png" } });

    const zeile = inboxZeilen()[0];
    // Genau diese Bedingung haelt die AV-Warteschlange von der Zeile fern
    // (`_lib/av.ts`, `auftraege`): eine Zeile ohne Blob liefe sonst in
    // „Can't access file" und stuende am Ende auf `error` — fail-closed.
    expect(zeile.bytes_vollstaendig_at).toBeNull();
    expect(zeile.av_status).toBe("scanning");
    expect(zeile.size).toBe(0);
  });

  it("antwortet 404 auf eine unbekannte `id`", async () => {
    const { token } = neuerLink();
    const antwort = await put({ token, koerper: PNG(), frage: { id: nanoid(10), ab: 0 } });

    expect(antwort.status).toBe(404);
  });

  /**
   * Die Objekt-Zugehoerigkeit wird SERVERSEITIG aufgeloest, nie aus dem
   * URL-Parameter geglaubt (`CLAUDE.md`, Abschnitt „Zugriffsschutz"): sonst
   * haengt ein zweiter Melder mit gueltigem eigenen Token Bytes an die laufende
   * Abgabe eines fremden Tokens an.
   */
  it("antwortet 404 auf eine `id`, die zu einem ANDEREN Token gehoert", async () => {
    const fremd = neuerLink();
    const eigen = neuerLink();
    const { id } = await koerperVon(
      await put({ token: fremd.token, koerper: PNG(4), frage: { ab: 0, name: "bild.png" } }),
    );

    const antwort = await put({
      token: eigen.token,
      koerper: Uint8Array.from([1]),
      frage: { id, ab: 12 },
    });

    expect(antwort.status).toBe(404);
  });

  it("antwortet 404 auf eine bereits ABGESCHLOSSENE `id`", async () => {
    const { token } = neuerLink();
    const { id } = await koerperVon(await abgabe(token, PNG()));

    const nochmal = await put({ token, koerper: Uint8Array.from([1]), frage: { id, ab: 0 } });
    expect(nochmal.status).toBe(404);
  });
});

// --- Punkt 3: die Groessengrenzen ------------------------------------------

describe("PUT /api/u/[token]/upload — Punkt 3: Groessengrenzen", () => {
  it("antwortet 413 mit Grenze UND Einheit und loescht die Zwischendatei", async () => {
    grenzenUeberschreibung.wert = { maxDateiBytes: 32 };
    const { token } = neuerLink();

    const antwort = await abgabe(token, PNG(64));

    expect(antwort.status).toBe(413);
    const koerper = await koerperVon(antwort);
    expect(koerper.code).toBe("zu-gross");
    expect(koerper.fehler).toContain("32");
    expect(koerper.fehler).toContain("Bytes");
    // Weder Blob noch Zwischendatei noch Zeile bleiben zurueck: eine
    // Inbox-Zeile ohne Frist holt sonst NIEMAND mehr ab
    // (`_lib/aufraeumen.ts`: `inboxAufbewahrungTage === null` ist die Vorgabe).
    expect(inboxDateien()).toEqual([]);
    expect(inboxZeilen()).toHaveLength(0);
  });

  /**
   * §6.6, die ZWEITE Linie: oberhalb von `FILES_AV_MAX_BYTES` wird BENANNT
   * abgelehnt, statt die Datei anzunehmen und dauerhaft `unscanned` zu setzen.
   * Im Normalbetrieb ist der Zweig unerreichbar (Pruefung 3 aus §9.4 erzwingt
   * `maxDatei <= avMax`), deshalb ist die Ueberschreibung der einzige ehrliche
   * Weg dorthin.
   *
   * MUTATION: die Pruefung `bytes > avMaxBytes` im Handler entfernen — dieser
   * Test muss rot werden.
   */
  it("lehnt oberhalb von FILES_AV_MAX_BYTES mit „Datei zu groß für die Virenprüfung“ ab", async () => {
    grenzenUeberschreibung.wert = { maxDateiBytes: 1024, avMaxBytes: 16 };
    const { token } = neuerLink();

    const antwort = await abgabe(token, PNG(64));

    expect(antwort.status).toBe(413);
    const koerper = await koerperVon(antwort);
    expect(koerper.fehler).toContain("Datei zu groß für die Virenprüfung");
    expect(inboxZeilen()).toHaveLength(0);
  });
});

// --- Punkt 4: der Erfolgsfall ----------------------------------------------

describe("PUT /api/u/[token]/upload — Punkt 4: die Zeile in `inbox_files`", () => {
  it("schreibt Status, Token, Kategorie, Hinweis und den FESTGESTELLTEN Typ", async () => {
    const { id: tokenId, token } = neuerLink();

    const antwort = await abgabe(token, PNG(), {
      name: "bild.png",
      // Die Deklaration ist falsch — der FESTGESTELLTE Typ muss gewinnen.
      typ: "application/pdf",
      kategorie: "bilder",
      hinweis: "Zwei Fahrzeuge, Halle 3",
    });

    expect(antwort.status).toBe(200);
    const zeile = inboxZeilen()[0];
    expect(zeile.av_status).toBe("scanning");
    expect(zeile.token_id).toBe(tokenId);
    expect(zeile.kategorie).toBe("bilder");
    expect(zeile.hinweis).toBe("Zwei Fahrzeuge, Halle 3");
    expect(zeile.mime_type).toBe("image/png");
    expect(zeile.bytes_vollstaendig_at).not.toBeNull();
    expect((await koerperVon(antwort)).mimeTyp).toBe("image/png");
  });

  it("reiht den Scan erst beim LETZTEN Chunk ein — nie bei einer Zeile ohne Bytes", async () => {
    const { token } = neuerLink();

    const erster = await put({ token, koerper: PNG(4), frage: { ab: 0, name: "bild.png" } });
    const { id } = await koerperVon(erster);
    expect(reiheAvEinMock).not.toHaveBeenCalled();

    await put({ token, koerper: Uint8Array.from([7, 7]), frage: { id, ab: 12, ende: 1 } });

    expect(reiheAvEinMock).toHaveBeenCalledTimes(1);
    expect(reiheAvEinMock).toHaveBeenCalledWith({ art: "inbox", inboxFileId: id });
  });

  /**
   * §12: `Übung_Größe.pdf` darf NICHT mehr zu `ubung_groe.pdf` werden. Der Name
   * steckt in keinem Pfad mehr (`_lib/storage.ts`), also braucht er kein
   * verlustbehaftetes Sanitizing — entfernt werden ausschliesslich Steuerzeichen
   * und Pfadtrenner.
   */
  it("erhaelt Umlaute, Leerzeichen und Grossschreibung im Anzeigenamen", async () => {
    const { token } = neuerLink();
    await abgabe(token, PDF(), { name: "Übung_Größe.pdf", typ: "application/pdf" });

    expect(inboxZeilen()[0].dateiname).toBe("Übung_Größe.pdf");
  });

  it("entfernt NUR Steuerzeichen und Pfadtrenner aus dem Anzeigenamen", async () => {
    const { token } = neuerLink();
    await abgabe(token, PDF(), {
      name: "../ord\\ner/Ü b\r\n\u0000ung  (2).pdf",
      typ: "application/pdf",
    });

    // Der DOPPELTE Abstand bleibt stehen: „nur Steuerzeichen und Pfadtrenner"
    // heisst auch, dass Weissraum NICHT zusammengefasst wird.
    expect(inboxZeilen()[0].dateiname).toBe("..ordnerÜ bung  (2).pdf");
  });

  it("kuerzt die Absenderadresse mit `ipKuerzen` auf ihr Netz", async () => {
    const { token } = neuerLink();
    await abgabe(token, PNG(), {}, { ip: "93.184.216.34" });

    expect(inboxZeilen()[0].client_ip_unbestaetigt).toBe("93.184.216.0");
  });

  /**
   * SEKUNDEN, nicht Millisekunden (`mode: "timestamp"`, §4.1). Gelesen wird der
   * ROHE Spaltenwert — Drizzle rechnet einen Faktor-1000-Fehler beim Zurueckgeben
   * wieder heraus, und der Test waere gruen, waehrend die Spalte um den Faktor
   * 1000 falsch steht.
   */
  it("schreibt `empfangen_at` in Unix-SEKUNDEN", async () => {
    const { token } = neuerLink();
    await abgabe(token, PNG());

    const roh = inboxZeilen()[0].empfangen_at as number;
    expect(Math.abs(roh - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(5);
  });

  it("nimmt einen Hinweis mit 500 CODE POINTS an — auch wenn er 1000 UTF-16-Einheiten hat", async () => {
    const { token } = neuerLink();
    const hinweis = "🚒".repeat(500);
    expect(hinweis.length).toBe(1000);

    const antwort = await abgabe(token, PNG(), { hinweis });

    expect(antwort.status).toBe(200);
    expect(inboxZeilen()[0].hinweis).toBe(hinweis);
  });

  it("weist einen Hinweis ueber 500 Code Points ab", async () => {
    const { token } = neuerLink();
    const antwort = await abgabe(token, PNG(), { hinweis: "a".repeat(501) });

    expect(antwort.status).toBe(400);
    expect((await koerperVon(antwort)).code).toBe("hinweis");
    expect(inboxZeilen()).toHaveLength(0);
  });

  it("weist eine Kategorie ab, die nicht in der Liste steht", async () => {
    const { token } = neuerLink();
    const antwort = await abgabe(token, PNG(), { kategorie: "__none__" });

    expect(antwort.status).toBe(400);
    expect((await koerperVon(antwort)).code).toBe("kategorie");
    expect(inboxZeilen()).toHaveLength(0);
  });

  it("speichert eine fehlende Kategorie als NULL", async () => {
    const { token } = neuerLink();
    await abgabe(token, PNG());

    expect(inboxZeilen()[0].kategorie).toBeNull();
  });

  it("lehnt Inhalt ab, der die Magic-Byte-Pruefung nicht besteht — ohne Blob und ohne Zeile", async () => {
    const { token } = neuerLink();
    const antwort = await abgabe(token, UNBEKANNT, { name: "evil.html", typ: "image/png" });

    expect(antwort.status).toBe(415);
    expect((await koerperVon(antwort)).code).toBe("typ-nicht-erlaubt");
    expect(inboxDateien()).toEqual([]);
    expect(inboxZeilen()).toHaveLength(0);
  });
});

// --- Punkt 5: die Fehlerabbildung aus §5.4 ---------------------------------

describe("PUT /api/u/[token]/upload — Punkt 5: §5.4", () => {
  it("bildet `KeinPlatz` auf 507 ab und loescht die Zwischendatei", async () => {
    const { token } = neuerLink();
    storungAmSchreiben.art = "kein-platz";

    const antwort = await put({ token, koerper: PNG(), frage: { ab: 0, name: "bild.png" } });

    expect(antwort.status).toBe(507);
    const zeile = inboxZeilen()[0];
    // Die ZEILE bleibt: der Melder kann mit derselben `id` bei `ab=0` neu
    // beginnen. Der Platzmangel ist ein Betriebszustand, keine Ablehnung.
    expect(zeile.bytes_vollstaendig_at).toBeNull();
    expect(existsSync(`${blobPfad(zeile.id as string)}.part`)).toBe(false);
  });

  /**
   * DIESELBE Abbildung am ENDE des Byte-Wegs. `schreibeStrom` ist nicht die
   * einzige Stelle, die §5.4-Fehler wirft: `fortschritt` (stat), `kopfBytes`
   * (open) und `abschliesse` (rename) tun es auch. Lag der Riegel nur um das
   * Schreiben, wurde aus einem ENOSPC beim `rename` ein 500 mit leerem Rumpf —
   * UND die Zwischendatei blieb liegen, wo unter der Standardkonfiguration
   * niemand sie mehr abholt (`_lib/aufraeumen.ts` kennt fuer unvollstaendige
   * `inbox_files` keine Frist, `FILES_INBOX_AUFBEWAHRUNG_TAGE` hat keine
   * Vorbelegung).
   */
  it("bildet `KeinPlatz` beim ABSCHLIESSEN auf 507 ab und laesst keine Bytes zurueck", async () => {
    const { token } = neuerLink();
    storungAmAbschluss.art = "kein-platz";

    const antwort = await abgabe(token, PNG());

    expect(antwort.status).toBe(507);
    expect((await koerperVon(antwort)).code).toBe("kein-platz");
    // Weder Blob noch `.part`.
    expect(inboxDateien()).toEqual([]);
    // Die ZEILE bleibt — wie im Fall oben: Platzmangel ist ein Betriebszustand,
    // keine Aussage ueber die Datei, und der Melder beginnt mit derselben `id`
    // bei `ab=0` neu (§5.4).
    const zeile = inboxZeilen()[0];
    expect(zeile.bytes_vollstaendig_at).toBeNull();
    // Und der Scan wurde NICHT eingereiht: die Datei gibt es nicht.
    expect(reiheAvEinMock).not.toHaveBeenCalled();
  });

  it("bildet `AblageNichtSchreibbar` auf 500 ab und loggt LAUT", async () => {
    const { token } = neuerLink();
    storungAmSchreiben.art = "nicht-schreibbar";
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});

    const antwort = await put({ token, koerper: PNG(), frage: { ab: 0, name: "bild.png" } });

    expect(antwort.status).toBe(500);
    expect(laut).toHaveBeenCalled();
    expect(laut.mock.calls.flat().join(" ")).toContain("[files]");
    laut.mockRestore();
  });
});
