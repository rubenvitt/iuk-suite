import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";

/*
 * WAS DIESE DATEI BESITZT (Spec §7.4, §7.5, §7.7, §5.4, Plan T33):
 *
 *  - dass der Weg durch die EINE Prüfkette läuft und jede Stufe ihren
 *    Statuscode bekommt (410 / 403 / 401 / 404),
 *  - dass der Zähler der LETZTE Schritt vor dem ersten Byte ist: ein 401 und
 *    ein 403 erhöhen `download_count` NICHT,
 *  - dass jeder Erfolg GENAU EINE Audit-Zeile schreibt — mit der aufgelösten
 *    `file_id`, nicht `NULL` (das ist der ZIP-Magic-Value, §4.5),
 *  - den Parametervertrag `[id]` = shareId, `?file=` = fileId,
 *  - die Auslieferungs-Kopfzeilen samt der Größenabweichung aus §5.4,
 *  - die Rollensperre (ein Route Handler hat kein Layout, §3.2).
 *
 * Gegen eine echte, migrierte Datei-DB und eine echte Ablage — nicht gegen ein
 * Mock: die Prüfkette liest Sekunden-Zeitstempel (`mode: "timestamp"`) und misst
 * Blobs auf dem Dateisystem; beides ist gegen ein Mock grün, ohne zu gelten.
 * Muster übernommen aus `_db/queries.test.ts`.
 */
const DIR = "./.data/files-download-route-test";

/** Ohne `AUTH_SECRET` WIRFT `istCookieGueltig` — aus der 401 würde eine 500. */
const GEHEIMNIS = "download-route-test-geheimnis-lang-genug";

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

const SEK = 1000;
const TAG = 24 * 60 * 60 * SEK;

/** Feste Uhr für die ENTSTEHUNGS-Zeitstempel: die Spalten führen SEKUNDEN, eine
 *  laufende Uhr wäre dort ein Flackerwerk. */
const JETZT = new Date(1_800_000_000 * SEK);

/**
 * ABLAUFZEITEN dagegen relativ zur ECHTEN Uhr. Der Handler hat keinen
 * Einspritzpunkt — die Prüfkette liest `new Date()` —, und ein fester Wert wäre
 * eine Zeitbombe: er liegt irgendwann in der Vergangenheit und dreht dann jeden
 * Erfolgsfall auf 410.
 */
const KUENFTIG = () => new Date(Date.now() + 7 * TAG);
const VERGANGEN = () => new Date(Date.now() - TAG);

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  process.env.AUTH_SECRET = GEHEIMNIS;
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  // `getModuleDb` hält die Verbindung global fest und zeigte sonst auf die
  // gelöschte Datei weiter.
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Vorrichtungen. Geschrieben wird über Drizzle, NICHT über rohes SQL mit
// `Date.now()`: `mode: "timestamp"` schreibt SEKUNDEN, ein Millisekundenwert
// sähe in der Ablaufstufe richtig aus und wäre um den Faktor 1000 daneben.
// ---------------------------------------------------------------------------

type ShareVorgabe = {
  id: string;
  titel?: string;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  downloadCount?: number;
  passwordHash?: string | null;
};

async function legeShare(vorgabe: ShareVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id,
      title: vorgabe.titel ?? "Übung Nord",
      description: null,
      type: "file",
      expiresAt: vorgabe.ablaufAt ?? KUENFTIG(),
      maxDownloads: vorgabe.maxDownloads ?? null,
      downloadCount: vorgabe.downloadCount ?? 0,
      passwordHash: vorgabe.passwordHash ?? null,
      totalSize: 0,
      createdAt: JETZT,
      createdBy: "sub-1",
    })
    .run();
}

type DateiVorgabe = {
  id: string;
  shareId: string;
  dateiname?: string;
  mimeType?: string;
  inhalt?: string;
  /** Der Wert der SPALTE `size`. Vorgabe: die tatsächliche Bytezahl. Weicht er
   *  ab, prüft §5.4, dass die GEMESSENE Zahl ausgeliefert wird. */
  groesseSpalte?: number;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
  /** false = Zeile ohne Blob auf dem Dateisystem (§10.1 „nicht auffindbar"). */
  mitBlob?: boolean;
};

async function legeDatei(vorgabe: DateiVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  const vollstaendig = vorgabe.vollstaendig ?? true;
  const inhalt = Buffer.from(vorgabe.inhalt ?? "Lagemeldung 07:00", "utf8");

  getDb()
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId: vorgabe.shareId,
      filename: vorgabe.dateiname ?? "bericht.pdf",
      mimeType: vorgabe.mimeType ?? "application/pdf",
      size: vorgabe.groesseSpalte ?? inhalt.byteLength,
      createdAt: JETZT,
      bytesVollstaendigAt: vollstaendig ? JETZT : null,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: vorgabe.avStatus === "scanning" ? null : JETZT,
    })
    .run();

  if (vorgabe.mitBlob ?? vollstaendig) {
    const { schreibeStrom, abschliesse } = await import("@/app/m/files/_lib/storage");
    const ziel = { art: "share", shareId: vorgabe.shareId, fileId: vorgabe.id } as const;
    async function* quelle() {
      yield new Uint8Array(inhalt);
    }
    await schreibeStrom(ziel, quelle(), { maxBytes: 1024 });
    await abschliesse(ziel);
  }
  return inhalt;
}

/** Ein Share mit genau EINER freigegebenen Datei — der Normalfall. */
async function einfacherShare(): Promise<Buffer> {
  await legeShare({ id: "share00001" });
  return legeDatei({ id: "datei00001", shareId: "share00001" });
}

type RufVorgabe = {
  /** Vorgabe: der Verwaltungs-Host. */
  host?: string;
  /** `?file=` — `undefined` heisst „nicht gesetzt". */
  file?: string;
  cookie?: string;
  /** Weitere Kopfzeilen (Absenderadresse, `Range`, …). */
  kopf?: Record<string, string>;
};

async function ruf(shareId: string, vorgabe: RufVorgabe = {}): Promise<Response> {
  const { GET } = await import("./route");
  const suche = vorgabe.file === undefined ? "" : `?file=${encodeURIComponent(vorgabe.file)}`;
  const kopfzeilen: Record<string, string> = {
    // `req.url` trägt nach dem Host-Rewrite die INTERNE Adresse; der echte Host
    // steht im Kopf. Genau die Lage, in der der Handler seine Rolle auflöst.
    host: vorgabe.host ?? VERWALTUNG,
    ...(vorgabe.cookie ? { cookie: vorgabe.cookie } : {}),
    ...(vorgabe.kopf ?? {}),
  };
  return GET(
    new Request(`http://localhost:3000/m/files/api/download/${shareId}${suche}`, {
      headers: kopfzeilen,
    }),
    { params: Promise.resolve({ id: shareId }) },
  );
}

async function downloadCount(shareId: string): Promise<number> {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
  const zeile = getDb()
    .select({ n: shares.downloadCount })
    .from(shares)
    .where(eq(shares.id, shareId))
    .get();
  return zeile?.n ?? -1;
}

async function logZeilen(shareId: string) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { downloadLogs } = await import("@/app/m/files/_db/schema");
  // Spalten AUFGEZÄHLT, nicht `select()` ohne Argument: die
  // Quelltext-Zusicherung in `queries.test.ts` verbietet die argumentlose Form
  // im ganzen Modul, damit `password_hash` die Grenze nirgends versehentlich
  // überquert — und eine Testdatei ist von dieser Regel nicht ausgenommen.
  return getDb()
    .select({
      fileId: downloadLogs.fileId,
      clientIpUnbestaetigt: downloadLogs.clientIpUnbestaetigt,
      userAgent: downloadLogs.userAgent,
    })
    .from(downloadLogs)
    .where(eq(downloadLogs.shareId, shareId))
    .all();
}

/** Ein gültiges Entsperr-Cookie für diesen Share, als `Cookie`-Kopfzeile. */
async function cookieFuer(shareId: string, ablaufAt: Date): Promise<string> {
  const { erzeugeShareCookie } = await import("@/app/m/files/_lib/passwort");
  const vorlage = erzeugeShareCookie(shareId, ablaufAt);
  if (!vorlage) throw new Error("Vorrichtung: Share bereits abgelaufen");
  return `${vorlage.name}=${vorlage.value}`;
}

// ---------------------------------------------------------------------------
// Punkt 7 — Rollensperre. Steht zuerst, weil sie VOR allem anderen greift.
// ---------------------------------------------------------------------------

describe("Rollensperre — ein Route Handler hat kein Layout (§3.2)", () => {
  it("der Inbox-Host antwortet 404, und zwar als ANTWORT, nicht als Wurf", async () => {
    await einfacherShare();
    // `notFound()` wäre hier ein Wurf im Antwortweg statt einer benannten 404 —
    // deshalb `rolleOderNull`, deshalb dieser Test.
    const res = await ruf("share00001", { host: INBOX, file: "datei00001" });
    expect(res.status).toBe(404);
  });

  it("ein unbekannter Host antwortet 404", async () => {
    await einfacherShare();
    const res = await ruf("share00001", { host: "fremd.example", file: "datei00001" });
    expect(res.status).toBe(404);
  });

  it("die Sperre greift VOR dem Zähler — der Inbox-Host verbraucht keinen Download", async () => {
    await einfacherShare();
    await ruf("share00001", { host: INBOX, file: "datei00001" });
    expect(await downloadCount("share00001")).toBe(0);
    expect(await logZeilen("share00001")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Punkt 1 — die eine Prüfkette, Stufe für Stufe.
// ---------------------------------------------------------------------------

describe("Prüfkette (§7.4): jede Stufe hat ihren Statuscode", () => {
  it("unbekannte Share-ID → 404", async () => {
    const res = await ruf("gibtsnicht", { file: "datei00001" });
    expect(res.status).toBe(404);
  });

  it("abgelaufen → 410 (nicht 404: die Zustandsseite ist eine andere Aussage)", async () => {
    await legeShare({ id: "share00001", ablaufAt: VERGANGEN() });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(410);
  });

  it("Limit erreicht → 410", async () => {
    await legeShare({ id: "share00001", maxDownloads: 2, downloadCount: 2 });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(410);
  });

  it("AV nicht `clean` → 403, für JEDEN nicht freigegebenen Wert", async () => {
    for (const status of ["scanning", "infected", "error", "unscanned"] as const) {
      rmSync(DIR, { recursive: true, force: true });
      mkdirSync(DIR, { recursive: true });
      const sqlite = new Database(`${DIR}/files.db`);
      migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
      sqlite.close();
      delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

      await legeShare({ id: "share00001" });
      await legeDatei({ id: "datei00001", shareId: "share00001", avStatus: status });
      const res = await ruf("share00001", { file: "datei00001" });
      expect(res.status, `av_status=${status}`).toBe(403);
    }
  });

  it("Passwort fehlt → 401", async () => {
    const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
    await legeShare({ id: "share00001", passwordHash: bcryptHash("geheim") });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(401);
  });

  it("Cookie eines FREMDEN Shares → 401 (die Bindung ist kryptografisch)", async () => {
    const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
    const ablauf = KUENFTIG();
    await legeShare({ id: "share00001", passwordHash: bcryptHash("geheim") });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    await legeShare({ id: "share00002", ablaufAt: ablauf });

    // Der Wert von Share 2 unter dem NAMEN von Share 1 — Cookie-Namen wählt der
    // Client.
    const { erzeugeShareCookie, cookieName } = await import("@/app/m/files/_lib/passwort");
    const fremd = erzeugeShareCookie("share00002", ablauf);
    const res = await ruf("share00001", {
      file: "datei00001",
      cookie: `${cookieName("share00001")}=${fremd?.value}`,
    });
    expect(res.status).toBe(401);
  });

  it("gültiges Cookie → 200, der Passwortschutz ist damit ÜBERWINDBAR und nicht nur dicht", async () => {
    const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
    const ablauf = KUENFTIG();
    await legeShare({ id: "share00001", passwordHash: bcryptHash("geheim"), ablaufAt: ablauf });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    const res = await ruf("share00001", {
      file: "datei00001",
      cookie: await cookieFuer("share00001", ablauf),
    });
    expect(res.status).toBe(200);
  });

  it("Blob fehlt → 404 (die Alt-App lieferte dort 500)", async () => {
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001", mitBlob: false });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(404);
    // Dieselbe Invariante wie bei 401 und 403: ohne Byte kein Verbrauch.
    expect(await downloadCount("share00001")).toBe(0);
    expect(await logZeilen("share00001")).toHaveLength(0);
  });

  it("unvollständige Zeile (kein `bytes_vollstaendig_at`) → 404", async () => {
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001", vollstaendig: false });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(404);
  });

  it("AV steht VOR dem Blob: gesperrt UND ohne Blob → 403, nicht 404", async () => {
    // Sonst verrät der Statuscode, ob zu einer gesperrten Datei Bytes liegen.
    await legeShare({ id: "share00001" });
    await legeDatei({
      id: "datei00001",
      shareId: "share00001",
      avStatus: "infected",
      mitBlob: false,
    });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Punkt 2 — der Zähler ist der LETZTE Schritt vor dem ersten Byte.
// ---------------------------------------------------------------------------

describe("Zähler (§7.5): kein Verbrauch ohne Berechtigung", () => {
  it("ein 401 erhöht `download_count` nicht", async () => {
    const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
    await legeShare({ id: "share00001", maxDownloads: 3, passwordHash: bcryptHash("geheim") });
    await legeDatei({ id: "datei00001", shareId: "share00001" });

    expect(await downloadCount("share00001")).toBe(0);
    // Drei fremde GETs ohne Passwort. Liefe das Inkrement vor der
    // Cookie-Prüfung, wäre der Share danach tot.
    for (let i = 0; i < 3; i += 1) {
      expect((await ruf("share00001", { file: "datei00001" })).status).toBe(401);
    }
    expect(await downloadCount("share00001")).toBe(0);
  });

  it("ein 403 erhöht `download_count` nicht", async () => {
    await legeShare({ id: "share00001", maxDownloads: 3 });
    await legeDatei({ id: "datei00001", shareId: "share00001", avStatus: "scanning" });

    expect((await ruf("share00001", { file: "datei00001" })).status).toBe(403);
    expect(await downloadCount("share00001")).toBe(0);
  });

  it("der Erfolgsfall erhöht `download_count` um genau eins", async () => {
    await einfacherShare();
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    expect(await downloadCount("share00001")).toBe(1);
  });

  it("das Inkrement ist die Sperre: der letzte erlaubte Download geht, der nächste ist 410", async () => {
    await legeShare({ id: "share00001", maxDownloads: 1 });
    await legeDatei({ id: "datei00001", shareId: "share00001" });

    const erster = await ruf("share00001", { file: "datei00001" });
    expect(erster.status).toBe(200);
    await erster.arrayBuffer();
    expect(await downloadCount("share00001")).toBe(1);

    const zweiter = await ruf("share00001", { file: "datei00001" });
    expect(zweiter.status).toBe(410);
    // Kein Überzählen: die abgewiesene Anfrage lässt den Wert stehen.
    expect(await downloadCount("share00001")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 + 4 — die Auslieferung.
// ---------------------------------------------------------------------------

describe("Auslieferung (§7.7): Kopfzeilen und Bytes", () => {
  it("liefert die Bytes des Blobs, unverändert", async () => {
    const inhalt = await einfacherShare();
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(inhalt)).toBe(true);
  });

  it("`Content-Type` kommt aus `mime_type` — nie geraten, nie aus einer Storage-Angabe", async () => {
    await legeShare({ id: "share00001" });
    await legeDatei({
      id: "datei00001",
      shareId: "share00001",
      dateiname: "lage.txt",
      mimeType: "text/plain; charset=utf-8",
    });
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("`Content-Disposition: attachment` IMMER, mit beiden `filename`-Formen", async () => {
    await legeShare({ id: "share00001" });
    await legeDatei({
      id: "datei00001",
      shareId: "share00001",
      // Ein Umlaut ist der Alt-Befund: `filename="%C3%9C…"` kam beim Empfänger
      // als Prozentsalat an.
      dateiname: "Übung Nord.pdf",
    });
    const res = await ruf("share00001", { file: "datei00001" });
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd.startsWith("attachment;")).toBe(true);
    // Der angeführte Teil ist ASCII und UNKODIERT.
    expect(cd).toContain('filename="_bung Nord.pdf"');
    expect(cd).toContain("filename*=UTF-8''%C3%9Cbung%20Nord.pdf");
  });

  it("trägt `nosniff`", async () => {
    await einfacherShare();
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("`Content-Length` ist die GEMESSENE Bytezahl", async () => {
    const inhalt = await einfacherShare();
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.headers.get("content-length")).toBe(String(inhalt.byteLength));
  });

  it("weicht `size` von der Wirklichkeit ab, gilt die WIRKLICHKEIT — und die Abweichung wird geloggt (§5.4)", async () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    await legeShare({ id: "share00001" });
    // Die Spalte behauptet 999 Bytes, auf der Platte liegen 17. Ein falsches
    // `Content-Length` bricht den Download beim Empfänger ab — der Fehler wäre
    // dann bei IHM sichtbar statt im Log.
    const inhalt = await legeDatei({
      id: "datei00001",
      shareId: "share00001",
      groesseSpalte: 999,
    });
    expect(inhalt.byteLength).not.toBe(999);

    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.headers.get("content-length")).toBe(String(inhalt.byteLength));
    expect(Buffer.from(await res.arrayBuffer()).byteLength).toBe(inhalt.byteLength);
    expect(warnung).toHaveBeenCalled();
    const meldung = warnung.mock.calls.map((c) => c.join(" ")).join(" | ");
    expect(meldung).toContain("999");
    expect(meldung).toContain("datei00001");
  });

  it("kein `Accept-Ranges` — und ein `Range` bekommt die GANZE Datei mit 200, kein 206", async () => {
    // Die Abwesenheit des Kopfes allein besitzt die Zusage nicht: sie bliebe
    // auch dann bestehen, wenn jemand Range-Auslieferung ergänzt. Der Beleg ist
    // die Antwort auf eine Range-Anfrage.
    const inhalt = await einfacherShare();
    const res = await ruf("share00001", {
      file: "datei00001",
      kopf: { range: "bytes=0-1" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBeNull();
    expect(res.headers.get("content-range")).toBeNull();
    expect(Buffer.from(await res.arrayBuffer()).equals(inhalt)).toBe(true);
  });

  it("ein Zwischencache darf die Antwort nicht aufbewahren", async () => {
    // Der Share ist passwort-gegatet und download-begrenzt; eine geteilte
    // Zwischenablage lieferte beides aus, ohne dass dieser Handler es sieht.
    await einfacherShare();
    const res = await ruf("share00001", { file: "datei00001" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

// ---------------------------------------------------------------------------
// Punkt 5 — der Parametervertrag.
// ---------------------------------------------------------------------------

describe("Parametervertrag: `[id]` ist die shareId, `?file=` wählt die Datei", () => {
  it("bei GENAU EINER Datei ist `?file=` optional", async () => {
    const inhalt = await einfacherShare();
    const res = await ruf("share00001");
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(inhalt)).toBe(true);
  });

  it("fehlt `?file=` bei MEHR ALS EINER Datei → 400, ausdrücklich nicht „die erste\"", async () => {
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001", dateiname: "a.pdf" });
    await legeDatei({ id: "datei00002", shareId: "share00001", dateiname: "b.pdf" });

    const res = await ruf("share00001");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("file");
    // Eine 400 ist kein Download.
    expect(await downloadCount("share00001")).toBe(0);
    expect(await logZeilen("share00001")).toHaveLength(0);
  });

  it("die 400 steht HINTER dem Passwort: ohne Cookie ist sie eine 401", async () => {
    // Sonst verrät der Statuscode, dass dieser Share mehr als eine Datei hat —
    // an jemanden, der das Passwort nicht kennt.
    const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
    await legeShare({ id: "share00001", passwordHash: bcryptHash("geheim") });
    await legeDatei({ id: "datei00001", shareId: "share00001", dateiname: "a.pdf" });
    await legeDatei({ id: "datei00002", shareId: "share00001", dateiname: "b.pdf" });

    const res = await ruf("share00001");
    expect(res.status).toBe(401);
  });

  it("eine `fileId` aus einem FREMDEN Share → 404 (Zusammengehörigkeit, nicht Existenz)", async () => {
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    await legeShare({ id: "share00002" });
    await legeDatei({ id: "datei00002", shareId: "share00002" });

    // `datei00002` EXISTIERT und ist freigegeben — nur nicht in diesem Share.
    const res = await ruf("share00001", { file: "datei00002" });
    expect(res.status).toBe(404);
    expect(await downloadCount("share00002")).toBe(0);
  });

  it("eine unbekannte `fileId` → 404", async () => {
    await einfacherShare();
    const res = await ruf("share00001", { file: "gibtsnicht" });
    expect(res.status).toBe(404);
  });

  it("auch OHNE `?file=` läuft die volle Prüfkette: gesperrt bleibt 403", async () => {
    // Der Weg ohne `?file=` löst die Datei selbst auf. Täte er das, ohne die
    // Kette ein zweites Mal zu durchlaufen, bekäme ein `scanning`-Share hier
    // seine Bytes — die Auflösung wäre dann die zweite Prüfstelle (§7.4).
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001", avStatus: "scanning" });
    const res = await ruf("share00001");
    expect(res.status).toBe(403);
    expect(await downloadCount("share00001")).toBe(0);
  });

  it("auch OHNE `?file=` bleibt ein fehlender Blob 404 — und verbraucht nichts", async () => {
    // Der Statuscode ALLEIN besitzt diese Aussage nicht: wer die Kette
    // überspringt, zählt, protokolliert und stolpert erst beim Öffnen über den
    // fehlenden Blob — und antwortet dann ebenfalls 404. Der Unterschied steht
    // in den beiden Zeilen darunter.
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001", mitBlob: false });
    const res = await ruf("share00001");
    expect(res.status).toBe(404);
    expect(await downloadCount("share00001")).toBe(0);
    expect(await logZeilen("share00001")).toHaveLength(0);
  });

  it("`?file=` ohne Wert heisst „nicht gesetzt“, nicht „die leere ID“", async () => {
    // Ohne diese Normalisierung liefe `…?file=` in die Dateiauflösung mit einer
    // ID, die es nie gibt: aus dem benannten 400 würde ein 404, und der
    // Empfänger einer Ein-Datei-Freigabe bekäme statt seiner Datei nichts.
    await legeShare({ id: "share00001" });
    await legeDatei({ id: "datei00001", shareId: "share00001", dateiname: "a.pdf" });
    await legeDatei({ id: "datei00002", shareId: "share00001", dateiname: "b.pdf" });
    expect((await ruf("share00001", { file: "" })).status).toBe(400);

    await legeShare({ id: "share00002" });
    const inhalt = await legeDatei({ id: "datei00003", shareId: "share00002" });
    const res = await ruf("share00002", { file: "" });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(inhalt)).toBe(true);
  });

  it("ein Share OHNE jede Datei → 404, nicht 400", async () => {
    await legeShare({ id: "share00001" });
    const res = await ruf("share00001");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Punkt 6 — das Audit-Log.
// ---------------------------------------------------------------------------

describe("Audit-Log (§4.5, §7.8): genau eine Zeile je Erfolg", () => {
  it("der Erfolgsfall schreibt GENAU EINE Zeile mit der aufgelösten `file_id`", async () => {
    await einfacherShare();
    const res = await ruf("share00001", {
      file: "datei00001",
      kopf: { "cf-connecting-ip": "93.184.216.34", "user-agent": "Testklient/1.0" },
    });
    expect(res.status).toBe(200);
    await res.arrayBuffer();

    const zeilen = await logZeilen("share00001");
    expect(zeilen).toHaveLength(1);
    // `null` ist der Magic Value „ZIP des ganzen Shares" (§4.5) — hier wäre er
    // falsch, und das Audit-Log zeigte für einen Dateidownload „ZIP".
    expect(zeilen[0].fileId).toBe("datei00001");
    // Gespeichert wird das NETZ, nicht die Adresse.
    expect(zeilen[0].clientIpUnbestaetigt).toBe("93.184.216.0");
    expect(zeilen[0].userAgent).toBe("Testklient/1.0");
  });

  it("auch OHNE `?file=` steht die aufgelöste `file_id` in der Zeile, nie `NULL`", async () => {
    await einfacherShare();
    const res = await ruf("share00001");
    expect(res.status).toBe(200);
    await res.arrayBuffer();

    const zeilen = await logZeilen("share00001");
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].fileId).toBe("datei00001");
  });

  it("ein 401 und ein 403 schreiben KEINE Zeile", async () => {
    const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
    await legeShare({ id: "share00001", passwordHash: bcryptHash("geheim") });
    await legeDatei({ id: "datei00001", shareId: "share00001" });
    expect((await ruf("share00001", { file: "datei00001" })).status).toBe(401);

    await legeShare({ id: "share00002" });
    await legeDatei({ id: "datei00002", shareId: "share00002", avStatus: "scanning" });
    expect((await ruf("share00002", { file: "datei00002" })).status).toBe(403);

    expect(await logZeilen("share00001")).toHaveLength(0);
    expect(await logZeilen("share00002")).toHaveLength(0);
  });

  it("ohne jede Adresskopfzeile bleibt die Spalte NULL statt „unknown\"", async () => {
    await einfacherShare();
    const res = await ruf("share00001", { file: "datei00001" });
    await res.arrayBuffer();
    const zeilen = await logZeilen("share00001");
    expect(zeilen[0].clientIpUnbestaetigt).toBeNull();
  });
});
