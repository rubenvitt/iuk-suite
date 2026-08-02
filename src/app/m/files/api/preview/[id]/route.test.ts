import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/*
 * WAS DIESE DATEI BESITZT (Spec §7.7, Plan T51):
 *
 *  - dieselbe Prüfkette wie der Download — 410 / 403 / 401 / 404 / 400 —, weil
 *    sie aus `_db/queries.ts` kommt und nicht hier nachgebaut wird;
 *  - die Typ-Allowlist gegen den `mime_type` AUS DER DATENBANK, nie aus einer
 *    Storage-Angabe;
 *  - `image/svg+xml` wird abgelehnt (Altbestand: heute steht es in der
 *    `PREVIEWABLE_TYPES` der Alt-App und wird `inline` ausgeliefert);
 *  - `nosniff` UND `Content-Security-Policy: sandbox` auf JEDER Antwort, auch
 *    auf jeder Fehlerantwort;
 *  - `FILES_VORSCHAU_MAX_BYTES` für ALLE Vorschauen: Text wird gekappt, alles
 *    andere oberhalb der Grenze wird ABGELEHNT statt halb geliefert;
 *  - die Vorschau zählt nicht und loggt nicht — `download_count` und
 *    `download_logs` sind vor und nach dem Aufruf identisch;
 *  - die Rollensperre: auf dem Inbox-Host antwortet dieser Endpunkt 404.
 *
 * Was sie NICHT besitzt: die Oberflächen-Hälfte des Zustands „Zu groß für die
 * Vorschau" (T40) und der echte Abruf gegen einen laufenden Server (T47/T48).
 *
 * Gegen eine echte, migrierte Datei-DB und eine echte Ablage — nicht gegen ein
 * Mock. Muster aus `_db/queries.test.ts`: DATA_DIR setzen, migrieren,
 * `globalThis.__suiteDb` verwerfen, und den Kode unter Test je Test DYNAMISCH
 * importieren, damit er diese Umgebung sieht.
 */
const DIR = "./.data/files-preview-route-test";

/** `istCookieGueltig` signiert mit `AUTH_SECRET` und WIRFT ohne. */
const GEHEIMNIS = "preview-route-test-geheimnis-lang-genug";

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

const SEK = 1000;
const TAG = 24 * 60 * 60 * SEK;

/**
 * Die Uhr der Vorrichtungen — und sie ist bewusst die ECHTE, nur auf ganze
 * Sekunden abgeschnitten.
 *
 * `_db/queries.test.ts` darf eine fest verdrahtete Zeit nehmen, weil `ladeShare`
 * dort `jetzt` gereicht bekommt. Ein Route Handler kann das nicht: die Kette
 * liest hinter ihm `new Date()`. Ein Wert wie `1_800_000_000` läge in der
 * ZUKUNFT, und „abgelaufen" wäre dann still ein gültiger Share — der Test bliebe
 * grün, ohne die Ablaufstufe je erreicht zu haben.
 *
 * Abgeschnitten auf Sekunden, weil die Spalten SEKUNDEN führen
 * (`mode: "timestamp"`): sonst geht bei jedem Vergleich der Millisekundenrest
 * verloren und ein „genau jetzt" fällt zufällig mal auf die eine, mal auf die
 * andere Seite.
 */
const JETZT = new Date(Math.floor(Date.now() / SEK) * SEK);

/**
 * Absichtlich winzig, damit die Kappung mit ein paar Bytes prüfbar ist statt mit
 * 5 MiB Testdaten. Die EINHEIT steht im Namen, wie überall in diesem Modul.
 */
const VORSCHAU_MAX_BYTES = 32;

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  vi.stubEnv("AUTH_SECRET", GEHEIMNIS);
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
  // Die drei Pflichtzahlen aus §9.3; ohne sie wirft `grenzen()`.
  vi.stubEnv("FILES_MAX_DATEI_BYTES", "12582912");
  vi.stubEnv("FILES_AV_MAX_BYTES", "12582912");
  vi.stubEnv("FILES_MAX_ABLAUF_TAGE", "7");
  vi.stubEnv("FILES_VORSCHAU_MAX_BYTES", String(VORSCHAU_MAX_BYTES));
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
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
      type: "folder",
      expiresAt: vorgabe.ablaufAt ?? new Date(JETZT.getTime() + 7 * TAG),
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
  /** Der Wert der SPALTE — die Allowlist prüft ihn, nicht den Inhalt. */
  mimeType?: string;
  inhalt?: Buffer;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
  mitBlob?: boolean;
};

async function legeDatei(vorgabe: DateiVorgabe) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  const vollstaendig = vorgabe.vollstaendig ?? true;
  const inhalt = vorgabe.inhalt ?? Buffer.from("kurzer text", "utf8");

  getDb()
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId: vorgabe.shareId,
      filename: vorgabe.dateiname ?? "notiz.txt",
      mimeType: vorgabe.mimeType ?? "text/plain",
      size: inhalt.byteLength,
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
    await schreibeStrom(ziel, quelle(), { maxBytes: 12_582_912 });
    await abschliesse(ziel);
  }
}

/** Der Cookie-Kopf einer gültigen Entsperrung — die Route parst ihn selbst. */
async function entsperrKopf(shareId: string, ablauf: Date): Promise<string> {
  const { erzeugeShareCookie } = await import("@/app/m/files/_lib/passwort");
  const vorlage = erzeugeShareCookie(shareId, ablauf, JETZT);
  if (!vorlage) throw new Error("Vorrichtung: kein Cookie für einen abgelaufenen Share");
  return `${vorlage.name}=${vorlage.value}`;
}

async function hashe(passwort: string) {
  const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
  return bcryptHash(passwort);
}

type RufVorgabe = {
  shareId: string;
  file?: string | null;
  host?: string;
  cookie?: string;
};

async function ruf(vorgabe: RufVorgabe): Promise<Response> {
  const { GET } = await import("@/app/m/files/api/preview/[id]/route");
  const url = new URL(`http://intern/api/preview/${encodeURIComponent(vorgabe.shareId)}`);
  if (vorgabe.file != null) url.searchParams.set("file", vorgabe.file);
  const kopf: Record<string, string> = { host: vorgabe.host ?? VERWALTUNG };
  if (vorgabe.cookie) kopf.cookie = vorgabe.cookie;
  return GET(new Request(url, { headers: kopf }), {
    params: Promise.resolve({ id: vorgabe.shareId }),
  });
}

function zaehlerUndLog(shareId: string): { count: number; logZeilen: number } {
  const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
  const zeile = sqlite.prepare("SELECT download_count AS n FROM shares WHERE id = ?").get(shareId) as
    | { n: number }
    | undefined;
  const log = sqlite
    .prepare("SELECT COUNT(*) AS n FROM download_logs WHERE share_id = ?")
    .get(shareId) as { n: number };
  sqlite.close();
  return { count: zeile?.n ?? -1, logZeilen: log.n };
}

/** Ein Standard-Share mit genau EINER `clean`-Textdatei. */
async function einfacherFall(inhalt?: Buffer, mimeType?: string) {
  await legeShare({ id: "sh00000001" });
  await legeDatei({ id: "fi00000001", shareId: "sh00000001", inhalt, mimeType });
}

// ---------------------------------------------------------------------------

describe("Rollensperre (§3.2) — Route Handler haben kein Layout", () => {
  it("auf dem Inbox-Host antwortet der Vorschau-Weg 404", async () => {
    await einfacherFall();
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001", host: INBOX });
    expect(antwort.status).toBe(404);
  });

  it("auf einem unbekannten Host antwortet er 404", async () => {
    await einfacherFall();
    const antwort = await ruf({
      shareId: "sh00000001",
      file: "fi00000001",
      host: "fremd.example.org",
    });
    expect(antwort.status).toBe(404);
  });

  it("auf dem Verwaltungs-Host liefert er die Bytes", async () => {
    await einfacherFall();
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(200);
  });
});

describe("Punkt 1 — dieselbe Prüfkette wie der Download (§7.4)", () => {
  it("unbekannter Share → 404", async () => {
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(404);
  });

  it("abgelaufen → 410", async () => {
    await legeShare({ id: "sh00000001", ablaufAt: new Date(JETZT.getTime() - TAG) });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(410);
  });

  it("Limit erreicht → 410", async () => {
    await legeShare({ id: "sh00000001", maxDownloads: 2, downloadCount: 2 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(410);
  });

  it("Passwort gesetzt, kein Cookie → 401", async () => {
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(401);
  });

  it("Passwort gesetzt, gefälschtes Cookie → 401", async () => {
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    const antwort = await ruf({
      shareId: "sh00000001",
      file: "fi00000001",
      cookie: "files_s_sh00000001=sh00000001.9999999999.gefaelscht",
    });
    expect(antwort.status).toBe(401);
  });

  it("Passwort gesetzt, gültiges Cookie → 200", async () => {
    const ablauf = new Date(JETZT.getTime() + 7 * TAG);
    await legeShare({ id: "sh00000001", ablaufAt: ablauf, passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    const antwort = await ruf({
      shareId: "sh00000001",
      file: "fi00000001",
      cookie: await entsperrKopf("sh00000001", ablauf),
    });
    expect(antwort.status).toBe(200);
  });

  it("AV nicht clean → 403, für jeden der vier nicht freigebenden Zustände", async () => {
    for (const status of ["scanning", "infected", "error", "unscanned"] as const) {
      rmSync(DIR, { recursive: true, force: true });
      mkdirSync(DIR, { recursive: true });
      const sqlite = new Database(`${DIR}/files.db`);
      migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
      sqlite.close();
      delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

      await legeShare({ id: "sh00000001" });
      await legeDatei({ id: "fi00000001", shareId: "sh00000001", avStatus: status });
      const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
      expect(antwort.status, `avStatus=${status}`).toBe(403);
    }
  });

  it("Zeile vollständig, Blob fehlt → 404", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", mitBlob: false });
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(404);
  });

  it("fileId aus einem FREMDEN Share → 404 (Zusammengehörigkeit, nicht nur Existenz)", async () => {
    await legeShare({ id: "sh00000001" });
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000002" });
    expect((await ruf({ shareId: "sh00000001", file: "fi00000002" })).status).toBe(404);
  });

  it("Passwort VOR Dateiauflösung: eine fremde fileId ohne Cookie ergibt 401, nicht 404", async () => {
    // Sonst verriete der Statuscode, ob eine geratene fileId zu diesem Share
    // gehört, ohne dass jemand das Passwort kennt.
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000002" });
    expect((await ruf({ shareId: "sh00000001", file: "fi00000002" })).status).toBe(401);
  });
});

describe("Punkt 1 — der Parametervertrag: [id] ist die shareId, ?file= wählt die Datei", () => {
  it("fehlendes ?file= bei MEHR als einer Datei → 400 mit benanntem Grund, NICHT die erste", async () => {
    await legeShare({ id: "sh00000001" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", inhalt: Buffer.from("eins") });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001", inhalt: Buffer.from("zwei") });
    const antwort = await ruf({ shareId: "sh00000001" });
    expect(antwort.status).toBe(400);
    const text = await antwort.text();
    expect(text).not.toContain("eins");
    expect(text.toLowerCase()).toContain("file");
  });

  it("fehlendes ?file= bei GENAU einer Datei ist erlaubt", async () => {
    await einfacherFall(Buffer.from("nur eine"));
    const antwort = await ruf({ shareId: "sh00000001" });
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toBe("nur eine");
  });

  it("ein Share ganz ohne Datei → 404 und kein 200 mit leerem Körper", async () => {
    await legeShare({ id: "sh00000001" });
    expect((await ruf({ shareId: "sh00000001" })).status).toBe(404);
  });
});

describe("Punkt 2 — die Typ-Allowlist prüft den mime_type AUS DER DATENBANK", () => {
  it("ein nicht vorschaufähiger Typ wird abgelehnt (415), obwohl die Datei ladbar ist", async () => {
    await einfacherFall(
      Buffer.from("PKirgendwas"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(415);
    // Kein Byte der Datei im Körper — abgelehnt heißt abgelehnt.
    expect(await antwort.text()).not.toContain("irgendwas");
  });

  it("der Content-Type kommt aus der Spalte, nicht aus dem Inhalt", async () => {
    // Die Alt-Route prüfte den DB-Wert und lieferte den Storage-Wert aus: eine
    // Route, ZWEI Quellen für denselben Wert (Analyse 2.1, Befund 6). Hier liegen
    // PDF-Bytes unter einem `image/png`-Eintrag; ausgeliefert wird `image/png`.
    await einfacherFall(Buffer.from("%PDF-1.7 nicht wirklich"), "image/png");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/png");
  });

  it("text/plain bekommt charset=utf-8 dazu, sonst rät der Browser die Kodierung", async () => {
    await einfacherFall(Buffer.from("Grüße", "utf8"), "text/plain");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("alle vorschaufähigen Typen sind Werte der MIME-Allowlist des Moduls", async () => {
    const { VORSCHAU_TYPEN } = await import("@/app/m/files/api/preview/[id]/route");
    const { MIME_ALLOWLIST } = await import("@/app/m/files/_lib/mime");
    const erlaubt = MIME_ALLOWLIST.map((e) => e.typ);
    for (const typ of VORSCHAU_TYPEN) expect(erlaubt).toContain(typ);
    // HEIC und HEIF sind ZWEI Zeichenketten (mime.ts): wer nur eine listet,
    // verliert die Hälfte der iPhone-Fotos.
    expect(VORSCHAU_TYPEN).toContain("image/heic");
    expect(VORSCHAU_TYPEN).toContain("image/heif");
  });
});

describe("Punkt 3 — image/svg+xml wird abgelehnt", () => {
  it("eine Altbestand-Zeile mit image/svg+xml bekommt keine Vorschau", async () => {
    // Ein SVG ist ein ausführbares Dokument im Origin der Fileshare-Domain.
    // Heute steht es in `PREVIEWABLE_TYPES` der Alt-App und wird `inline`
    // ausgeliefert — ohne `nosniff` und ohne CSP.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "utf8");
    await einfacherFall(svg, "image/svg+xml");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(415);
    expect(await antwort.text()).not.toContain("<svg");
  });

  it("die Typliste enthält image/svg+xml nicht", async () => {
    const { VORSCHAU_TYPEN } = await import("@/app/m/files/api/preview/[id]/route");
    expect(VORSCHAU_TYPEN as readonly string[]).not.toContain("image/svg+xml");
  });
});

describe("Punkt 4 — nosniff UND Content-Security-Policy: sandbox auf JEDER Antwort", () => {
  it("auch auf 200, 400, 401, 403, 404, 410 und 415", async () => {
    const ablauf = new Date(JETZT.getTime() + 7 * TAG);
    await legeShare({ id: "sh00000001", ablaufAt: ablauf });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    await legeShare({ id: "sh00000002", ablaufAt: new Date(JETZT.getTime() - TAG) });
    await legeShare({ id: "sh00000003", passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000003", shareId: "sh00000003" });
    await legeShare({ id: "sh00000004" });
    await legeDatei({ id: "fi00000004", shareId: "sh00000004", avStatus: "infected" });
    await legeShare({ id: "sh00000005" });
    await legeDatei({ id: "fi00000005", shareId: "sh00000005", inhalt: Buffer.from("a") });
    await legeDatei({ id: "fi00000006", shareId: "sh00000005", inhalt: Buffer.from("b") });
    await legeShare({ id: "sh00000006" });
    await legeDatei({ id: "fi00000007", shareId: "sh00000006", mimeType: "image/svg+xml" });

    const faelle: [string, Promise<Response>][] = [
      ["200", ruf({ shareId: "sh00000001", file: "fi00000001" })],
      ["410", ruf({ shareId: "sh00000002" })],
      ["401", ruf({ shareId: "sh00000003", file: "fi00000003" })],
      ["403", ruf({ shareId: "sh00000004", file: "fi00000004" })],
      ["404", ruf({ shareId: "sh99999999", file: "fi00000001" })],
      ["400", ruf({ shareId: "sh00000005" })],
      ["415", ruf({ shareId: "sh00000006", file: "fi00000007" })],
    ];

    for (const [name, versprechen] of faelle) {
      const antwort = await versprechen;
      expect(antwort.status, `Fall ${name}`).toBe(Number(name));
      expect(antwort.headers.get("x-content-type-options"), `Fall ${name}`).toBe("nosniff");
      expect(antwort.headers.get("content-security-policy"), `Fall ${name}`).toBe("sandbox");
    }
  });

  it("und auf der 404 der Rollensperre", async () => {
    await einfacherFall();
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001", host: INBOX });
    expect(antwort.headers.get("x-content-type-options")).toBe("nosniff");
    expect(antwort.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("die Auslieferung ist inline, nicht attachment — sonst wäre es kein Vorschau-Weg", async () => {
    await einfacherFall();
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.headers.get("content-disposition")).toMatch(/^inline\b/);
  });
});

describe("Punkt 5 — FILES_VORSCHAU_MAX_BYTES gilt für ALLE Vorschauen", () => {
  it("Text über der Grenze wird gekappt und trägt den Hinweis „gekürzt angezeigt“", async () => {
    const lang = Buffer.from("A".repeat(VORSCHAU_MAX_BYTES + 100), "utf8");
    await einfacherFall(lang, "text/plain");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(200);
    const rohKoerper = Buffer.from(await antwort.arrayBuffer());
    const text = rohKoerper.toString("utf8");
    // Gekappt: höchstens die Grenze an Nutzbytes, plus der angehängte Hinweis.
    expect(text.startsWith("A".repeat(VORSCHAU_MAX_BYTES))).toBe(true);
    expect(text).not.toContain("A".repeat(VORSCHAU_MAX_BYTES + 1));
    expect(text).toContain("gekürzt angezeigt");
    expect(antwort.headers.get("x-vorschau-gekuerzt")).toBe("1");
    // Gegen die GEMESSENE Körperlänge, nicht gegen eine nachgerechnete Zahl:
    // §5.4 nennt ein falsches `Content-Length` als Bruchstelle beim Empfänger,
    // und `antwort.text()` allein liest den Körper unabhängig vom Header — der
    // Fehler wäre für die Suite sonst strukturell unsichtbar. Der Hinweis ist
    // kein reiner ASCII-Text („…", „ü", „—"), deshalb Bytes und nicht Zeichen.
    expect(antwort.headers.get("content-length")).toBe(String(rohKoerper.byteLength));
    // Auch die gekappte Antwort ist eine Vorschau, kein Download.
    expect(antwort.headers.get("content-disposition")).toMatch(/^inline\b/);
  });

  it("Text UNTER der Grenze kommt unverändert und ohne Hinweis", async () => {
    await einfacherFall(Buffer.from("kurz", "utf8"), "text/plain");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    const rohKoerper = Buffer.from(await antwort.arrayBuffer());
    expect(rohKoerper.toString("utf8")).toBe("kurz");
    expect(antwort.headers.get("x-vorschau-gekuerzt")).toBeNull();
    expect(antwort.headers.get("content-length")).toBe(String(rohKoerper.byteLength));
  });

  it("Text GENAU auf der Grenze kommt ungekappt und ohne Hinweis", async () => {
    // Der Grenzfall des TEXT-Wegs — der Bildweg hat seinen zwei Fälle weiter
    // unten, der Textweg hatte keinen. Ohne ihn überlebt ein `<=` → `<` im
    // Handler: eine Datei von exakt `FILES_VORSCHAU_MAX_BYTES` bekäme
    // `X-Vorschau-Gekuerzt: 1` und den Hinweis angehängt, obwohl kein Byte
    // fehlt. Das ist zweimal falsch: eine unwahre Aussage über die Datei, und
    // ein Körper, der nicht mehr die Datei ist.
    const genau = Buffer.alloc(VORSCHAU_MAX_BYTES, 0x41);
    await einfacherFall(genau, "text/plain");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(200);
    const text = await antwort.text();
    expect(text).toBe("A".repeat(VORSCHAU_MAX_BYTES));
    expect(text).not.toContain("gekürzt");
    expect(antwort.headers.get("x-vorschau-gekuerzt")).toBeNull();
  });

  it("die Kappung zerschneidet keine Mehrbyte-Sequenz", async () => {
    // „€" ist DREI Bytes, und die Grenze (32) ist durch drei NICHT teilbar: nach
    // 10 Zeichen sind 30 Bytes voll, das elfte wird auf Byte 32 mitten
    // durchgeschnitten. Genau dieser Rest muss wegfallen — sonst kommt beim
    // Empfänger ein U+FFFD an, ausgerechnet an der Stelle, an der „gekürzt
    // angezeigt" steht und niemand mehr genau hinsieht.
    //
    // Ein zweibyte-Zeichen wäre hier WERTLOS gewesen: 32 ist durch zwei teilbar,
    // die Kappung fiele zufällig auf eine gültige Grenze und der Test bliebe
    // auch ohne den Rückschnitt grün (gemessen).
    const zeichen = "€";
    const ganze = Math.floor(VORSCHAU_MAX_BYTES / 3);
    expect(VORSCHAU_MAX_BYTES % 3).not.toBe(0);
    const lang = Buffer.from(zeichen.repeat(40), "utf8");
    await einfacherFall(lang, "text/plain");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    const text = await antwort.text();
    expect(text).not.toContain("�");
    expect(text.startsWith(zeichen.repeat(ganze))).toBe(true);
    expect(text.startsWith(zeichen.repeat(ganze + 1))).toBe(false);
  });

  it("die Kappung zerschneidet auch keine VIER-Byte-Sequenz (Emoji)", async () => {
    // Das „€" oben deckt nur die Drei-Byte-Ankündigung ab. Ein Emoji ist VIER
    // Bytes (F0 9F 98 80) — der Zweig, den sonst kein Fall mit echten Daten
    // erreicht, und genau der Fall, den die Handys der Melderinnen erzeugen.
    //
    // Die Grenze muss nach DREI der vier Bytes fallen, und das ist die einzige
    // Lage, die etwas beweist: schneidet sie schon nach zweien, wird ohnehin
    // gekappt, egal ob die Sequenz als 3 oder als 4 Bytes angekündigt gilt —
    // beide sind größer als der verbleibende Platz. Erst bei 3-von-4 gehen die
    // beiden Antworten auseinander (gemessen: mit „Vier-Byte-Kopf meldet 3"
    // blieb die Zwei-von-vier-Lage grün).
    const vorspann = Buffer.from("A".repeat(VORSCHAU_MAX_BYTES - 3), "utf8");
    expect(VORSCHAU_MAX_BYTES - vorspann.byteLength).toBe(3);
    const lang = Buffer.concat([vorspann, Buffer.from("😀 und noch viel mehr Text", "utf8")]);
    await einfacherFall(lang, "text/plain");

    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    const text = await antwort.text();
    expect(text).not.toContain("�");
    expect(text.startsWith("A".repeat(VORSCHAU_MAX_BYTES - 3))).toBe(true);
    expect(text).not.toContain("😀");
    expect(text).toContain("gekürzt angezeigt");
  });

  it("der Rückschnitt greift auch, wenn der Kopf gar kein gültiges UTF-8 ist", async () => {
    // `text/plain` sagt nichts über die KODIERUNG — `MIME_ALLOWLIST` kennt den
    // Typ, nicht den Zeichensatz, eine Latin-1-Zeile ist im Modul also zulässig.
    // Ein Rückschnitt, der zum Entscheiden den ganzen Kopf dekodieren muss,
    // scheitert hier an jedem Versuch und gibt den Puffer STILL unverändert
    // zurück: der Anschnitt bleibt stehen, ausgerechnet in dem Fall, für den der
    // Rückschnitt da ist.
    const vorspann = Buffer.concat([Buffer.from([0xff]), Buffer.from("A".repeat(29), "utf8")]);
    // Das „€" muss die Grenze STRADDELN, sonst prüft der Fall nichts — geprüft
    // statt nachgerechnet, damit der Test nicht still aufhört zu prüfen, wenn
    // jemand VORSCHAU_MAX_BYTES verschiebt.
    expect(vorspann.byteLength).toBeLessThan(VORSCHAU_MAX_BYTES);
    expect(vorspann.byteLength + 3).toBeGreaterThan(VORSCHAU_MAX_BYTES);
    const lang = Buffer.concat([vorspann, Buffer.from("€ und danach noch viel mehr Text", "utf8")]);
    await einfacherFall(lang, "text/plain");

    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    const koerper = Buffer.from(await antwort.arrayBuffer());
    // Auf Bytes geprüft, nicht auf Zeichen: das 0xFF dekodiert zu U+FFFD (drei
    // Bytes aus einem), ein Weg über `text()` und `Buffer.byteLength` liefe also
    // über einen Rundlauf, den es hier nicht gibt.
    const schnitt = koerper.indexOf(Buffer.from("\n\n[…", "utf8"));
    expect(schnitt).toBeGreaterThan(0);
    const nutz = koerper.subarray(0, schnitt);
    expect(nutz.byteLength).toBe(vorspann.byteLength);
    expect(nutz[nutz.byteLength - 1]).toBe(0x41);
  });

  it("ein BILD über der Grenze bekommt KEINE Vorschau — nicht die halbe (413)", async () => {
    // Ein halbes Bild ist keine Vorschau. Und ohne diese Ablehnung wäre eine
    // 400-MB-JPEG-Vorschau ein ungezählter, beliebig oft wiederholbarer
    // Vollabruf.
    const gross = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from("P".repeat(VORSCHAU_MAX_BYTES + 100), "utf8"),
    ]);
    await einfacherFall(gross, "image/png");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(413);
    expect(await antwort.text()).not.toContain("PPPP");
  });

  it("ein Bild GENAU auf der Grenze wird noch ausgeliefert", async () => {
    const genau = Buffer.alloc(VORSCHAU_MAX_BYTES, 0x41);
    await einfacherFall(genau, "image/png");
    const antwort = await ruf({ shareId: "sh00000001", file: "fi00000001" });
    expect(antwort.status).toBe(200);
    expect(Buffer.from(await antwort.arrayBuffer()).equals(genau)).toBe(true);
    expect(antwort.headers.get("content-length")).toBe(String(VORSCHAU_MAX_BYTES));
  });

  it("ein PDF über der Grenze wird ebenso abgelehnt — die Grenze gilt nicht nur für Bilder", async () => {
    const gross = Buffer.from("%PDF-".padEnd(VORSCHAU_MAX_BYTES + 50, "x"), "utf8");
    await einfacherFall(gross, "application/pdf");
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(413);
  });
});

describe("vorschauZustand — das EINE Prädikat für Oberfläche und Riegel (§10.2)", () => {
  // T40 zeigt an der Stelle des Vorschau-Knopfes „Zu groß für die Vorschau"
  // plus Download-Knopf. Baute die Seite Typliste und Größenvergleich nach,
  // zeigte der Knopf irgendwann etwas anderes an, als die Route tut — und ein
  // Einstiegspunkt liefe in einen Fehler. Deshalb gehört diese Funktion geprüft
  // und nicht nur als Nebenprodukt des Handlers mitgenommen.
  const basis = { groesse: 10, gemesseneGroesse: 10 };

  it("ein nicht gelisteter Typ ist nicht vorschaufähig, unabhängig von der Größe", async () => {
    const { vorschauZustand } = await import("@/app/m/files/api/preview/[id]/route");
    expect(vorschauZustand({ ...basis, mimeType: "image/svg+xml" }, 1000)).toBe(
      "typ-nicht-vorschaufaehig",
    );
    expect(vorschauZustand({ ...basis, mimeType: "application/zip" }, 1000)).toBe(
      "typ-nicht-vorschaufaehig",
    );
  });

  it("Text kennt kein „zu groß“ — er wird gekappt, nicht abgelehnt", async () => {
    const { vorschauZustand } = await import("@/app/m/files/api/preview/[id]/route");
    const riesig = { mimeType: "text/plain", groesse: 1e9, gemesseneGroesse: 1e9 };
    expect(vorschauZustand(riesig, 100)).toBe("vorschau");
  });

  it("alles andere oberhalb der Grenze ist „zu groß“, auf der Grenze nicht", async () => {
    const { vorschauZustand } = await import("@/app/m/files/api/preview/[id]/route");
    const bild = (bytes: number) => ({
      mimeType: "image/png",
      groesse: bytes,
      gemesseneGroesse: bytes,
    });
    expect(vorschauZustand(bild(101), 100)).toBe("zu-gross-fuer-vorschau");
    expect(vorschauZustand(bild(100), 100)).toBe("vorschau");
  });

  it("die GEMESSENE Größe schlägt die Spalte — ausgeliefert würden die Bytes auf der Platte", async () => {
    const { vorschauZustand } = await import("@/app/m/files/api/preview/[id]/route");
    // Spalte sagt „klein", die Platte sagt „groß": ohne den Vorrang der Messung
    // liefe die Route in einen Vollabruf, den die Grenze verhindern soll.
    expect(
      vorschauZustand({ mimeType: "image/png", groesse: 10, gemesseneGroesse: 999 }, 100),
    ).toBe("zu-gross-fuer-vorschau");
    // Und ohne Messung entscheidet die Spalte, statt still „passt schon".
    expect(vorschauZustand({ mimeType: "image/png", groesse: 999, gemesseneGroesse: null }, 100)).toBe(
      "zu-gross-fuer-vorschau",
    );
  });
});

describe("Punkt 6 — die Vorschau zählt nicht und wird nicht geloggt", () => {
  it("download_count und download_logs sind vor und nach einem Erfolg identisch", async () => {
    await legeShare({ id: "sh00000001", maxDownloads: 5, downloadCount: 2 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    const vorher = zaehlerUndLog("sh00000001");
    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(200);
    expect(zaehlerUndLog("sh00000001")).toEqual(vorher);
    expect(vorher.count).toBe(2);
  });

  it("auch zehn Vorschauen verbrauchen einen Share mit max_downloads = 1 nicht", async () => {
    await legeShare({ id: "sh00000001", maxDownloads: 1, downloadCount: 0 });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    for (let i = 0; i < 10; i++) {
      expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(200);
    }
    expect(zaehlerUndLog("sh00000001")).toEqual({ count: 0, logZeilen: 0 });
  });

  it("ein 401 und ein 403 zählen und loggen ebenfalls nicht", async () => {
    await legeShare({ id: "sh00000001", passwordHash: await hashe("geheim") });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001" });
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000002", shareId: "sh00000002", avStatus: "infected" });

    expect((await ruf({ shareId: "sh00000001", file: "fi00000001" })).status).toBe(401);
    expect((await ruf({ shareId: "sh00000002", file: "fi00000002" })).status).toBe(403);
    expect(zaehlerUndLog("sh00000001")).toEqual({ count: 0, logZeilen: 0 });
    expect(zaehlerUndLog("sh00000002")).toEqual({ count: 0, logZeilen: 0 });
  });

  it("Quelltext-Zusicherung: der Handler ruft keine Zähl- und keine Logfunktion", async () => {
    // Der Laufzeittest oben ist der Beweis; diese Zeile ist der Riegel dagegen,
    // dass ein späterer Umbau „der Vollständigkeit halber" eine Logzeile
    // ergänzt. Sie ist billig und benennt die verbotenen Namen.
    const quelle = readFileSync("src/app/m/files/api/preview/[id]/route.ts", "utf8");
    for (const verboten of ["zaehleDownload", "protokolliereDownload", "downloadLogs"]) {
      expect(quelle).not.toContain(verboten);
    }
  });
});
