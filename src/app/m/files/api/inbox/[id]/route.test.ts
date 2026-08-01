import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/*
 * WAS DIESE DATEI BESITZT (Spec §2.1, §5.4, §6.3, §8.6; Plan T32):
 *
 *  - dass der Posteingang-Download NUR mit Zugang UND NUR ab `clean` Bytes
 *    liefert,
 *  - dass die Reihenfolge der Riegel stimmt: Rolle vor Zugang (ein
 *    Ausgeloggter auf dem Inbox-Host bekommt 404, keine Anmeldeaufforderung)
 *    und AV vor Blob (eine gesperrte Datei ohne Bytes ist 403, nicht 404 —
 *    sonst verriete der Statuscode, ob Bytes existieren; dieselbe Linie wie
 *    `_db/queries.test.ts:532` fuer den Share-Weg),
 *  - dass `Content-Length` aus der GEMESSENEN Groesse kommt und nicht aus der
 *    Spalte `size` (§5.4),
 *  - dass ein fehlender `mime_type` `application/octet-stream` wird und nicht
 *    geraten,
 *  - dass ein fehlender Blob 404 ist und nicht 500 (Verhaltensaenderung
 *    gegenueber der Alt-App, §5.4).
 *
 * Was sie NICHT besitzt: dass `requireFilesAccess` die richtige Gruppe fragt
 * (`_lib/access.test.ts`, T10), die Host→Rolle-Aufloesung (`hostRolle.test.ts`,
 * T9) und die Zusammensetzung von `Content-Disposition` (`zip.test.ts`, T21).
 * Hier wird nur belegt, dass dieser Handler sie RUFT und in der richtigen
 * Reihenfolge.
 *
 * Gegen eine echte, migrierte Datei-DB und eine echte Ablage — Muster aus
 * `_db/queries.test.ts`. Ein Mock waere gruen, ohne zu gelten: die Spalten
 * fuehren SEKUNDEN (`mode: "timestamp"`), und `Content-Length` ist genau die
 * Zahl, die nur das Dateisystem kennt.
 */

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { auth } from "@/core/auth";
import { headers } from "next/headers";
import { AV_STATUS, istFreigegeben } from "@/app/m/files/_lib/av";

const DIR = "./.data/files-inbox-route-test";

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

/** Die Gruppe aus `registry.ts:88` — sie ist der eine Weg in die Verwaltung. */
const ZUGANGSGRUPPE = "drk-files-admin";

const SEK = 1000;
/** Feste Uhr: die Spalten fuehren SEKUNDEN, eine laufende Uhr waere Flackerwerk. */
const JETZT = new Date(1_800_000_000 * SEK);

const authMock = vi.mocked(auth);

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  authMock.mockReset();
  vi.mocked(headers).mockReset();
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

/** Eingeloggt und berechtigt. */
function mitZugang(): void {
  authMock.mockResolvedValue({
    user: { id: "sub-1", groups: [ZUGANGSGRUPPE], fachgruppen: [], name: null, email: null, isAdmin: false },
  } as never);
}

/** Eingeloggt, aber in keiner Gruppe dieses Moduls. */
function ohneZugang(): void {
  authMock.mockResolvedValue({
    user: { id: "sub-2", groups: ["irgendeine-andere-gruppe"], fachgruppen: [], name: null, email: null, isAdmin: false },
  } as never);
}

/** Gar nicht eingeloggt. */
function ausgeloggt(): void {
  authMock.mockResolvedValue(null as never);
}

type InboxVorgabe = {
  id: string;
  dateiname?: string;
  mimeType?: string | null;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  /** Der Inhalt des Blobs. `null` = Zeile ohne Bytes auf dem Dateisystem. */
  inhalt?: string | null;
  /** Weicht sie vom Inhalt ab, muss `Content-Length` dem INHALT folgen (§5.4). */
  gemeldeteGroesse?: number;
};

async function* alsStrom(text: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(text);
}

async function legeInboxDatei(vorgabe: InboxVorgabe): Promise<void> {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { inboxFiles } = await import("@/app/m/files/_db/schema");
  const inhalt = vorgabe.inhalt === undefined ? "Ich bin der Inhalt." : vorgabe.inhalt;

  if (inhalt !== null) {
    // Ueber die Ablage selbst, nicht ueber einen nachgebauten Pfad: das
    // Pfadschema ist die Zusage von `_lib/storage.ts`, und ein zweiter Pfad im
    // Test waere genau die Stelle, an der beide auseinanderlaufen.
    const { schreibeStrom, abschliesse } = await import("@/app/m/files/_lib/storage");
    const ziel = { art: "inbox", inboxFileId: vorgabe.id } as const;
    await schreibeStrom(ziel, alsStrom(inhalt), { maxBytes: 1_000_000 });
    await abschliesse(ziel);
  }

  getDb()
    .insert(inboxFiles)
    .values({
      id: vorgabe.id,
      tokenId: null,
      dateiname: vorgabe.dateiname ?? "Bericht.pdf",
      kategorie: null,
      hinweis: null,
      mimeType: vorgabe.mimeType === undefined ? "application/pdf" : vorgabe.mimeType,
      size: vorgabe.gemeldeteGroesse ?? (inhalt === null ? 0 : Buffer.byteLength(inhalt)),
      clientIpUnbestaetigt: null,
      empfangenAt: JETZT,
      bytesVollstaendigAt: JETZT,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: JETZT,
    })
    .run();
}

async function rufeAuf(id: string, host = VERWALTUNG): Promise<Response> {
  const { GET } = await import("./route");
  const req = new Request(`http://${host}/m/files/api/inbox/${id}`, { headers: { host } });
  return GET(req, { params: Promise.resolve({ id }) });
}

/**
 * `notFound()` wirft; das App-Route-Modul von Next uebersetzt genau diesen
 * Digest in eine 404-Antwort (`next/dist/server/route-modules/app-route/module.js:475`).
 * Der Digest ist deshalb die ehrliche Zusicherung — nicht ein selbstgebauter
 * Marker aus einem Mock.
 */
async function erwarteNextNotFound(aufruf: Promise<unknown>): Promise<void> {
  await expect(aufruf).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

// ---------------------------------------------------------------------------

describe("Punkt 6 + Punkt 1: Rollensperre VOR dem Zugangsriegel", () => {
  it("auf dem Inbox-Host 404 — auch mit Zugang und clean", async () => {
    mitZugang();
    await legeInboxDatei({ id: "in00000001" });

    const res = await rufeAuf("in00000001", INBOX);

    expect(res.status).toBe(404);
    // Der Handler baut die 404 SELBST (§2.1): ein `notFound()`-Wurf ist keine
    // brauchbare Antwort auf einen Download-Link.
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("auf einem UNBEKANNTEN Host 404 — nicht nur auf dem Inbox-Host", async () => {
    // Haelt die Mutation `!== "verwaltung"` → `=== "inbox"` auf: die sieht auf
    // dem Inbox-Host gleich aus und laesst jeden fremden Host durch.
    mitZugang();
    await legeInboxDatei({ id: "in00000001" });

    expect((await rufeAuf("in00000001", "fremder.host.example")).status).toBe(404);
  });

  it("ausgeloggt auf dem Inbox-Host: 404, KEINE Anmeldeaufforderung", async () => {
    // Die Reihenfolge ist die Aussage. Liefe der Zugangsriegel zuerst, bekaeme
    // ein Anonymer einen 307 auf `/login` — und wuesste damit, dass es hier
    // etwas zu holen gibt.
    ausgeloggt();
    await legeInboxDatei({ id: "in00000001" });

    const res = await rufeAuf("in00000001", INBOX);

    expect(res.status).toBe(404);
    expect(authMock).not.toHaveBeenCalled();
  });
});

describe("Punkt 1: ohne Zugang → 404", () => {
  it("eingeloggt ohne Gruppe → 404 (die Existenz wird nicht verraten)", async () => {
    ohneZugang();
    await legeInboxDatei({ id: "in00000001" });

    await erwarteNextNotFound(rufeAuf("in00000001"));
  });

  it("der Riegel laeuft VOR der Zeile: auch eine unbekannte id ergibt 404 ohne DB-Blick", async () => {
    ohneZugang();
    await erwarteNextNotFound(rufeAuf("in99999999"));
  });
});

describe("Punkt 2: nur `clean` gibt frei — 403 mit benanntem Zustand", () => {
  /**
   * ABGELEITET aus `AV_STATUS`, nicht abgeschrieben. Eine handgeschriebene
   * Liste bliebe gruen, wenn `_lib/av.ts` einen sechsten Zustand bekaeme — und
   * der Handler antwortete dann mit dem Rumpf `"undefined"`, weil sein
   * Meldungskatalog den Wert nicht kennt. Dieselbe Bauform wie in
   * `_lib/zip.test.ts`.
   */
  const gesperrt = AV_STATUS.filter((status) => !istFreigegeben(status));

  it.each(gesperrt)("av_status %s → 403", async (status) => {
    mitZugang();
    await legeInboxDatei({ id: "in00000001", avStatus: status });

    const res = await rufeAuf("in00000001");

    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/plain");
    // Kein leerer Rumpf und kein technischer Code: die Person, die auf
    // „Herunterladen" geklickt hat, muss lesen koennen, WARUM nichts kommt.
    expect(await res.text()).not.toBe("");
  });

  it("die vier Zustaende sind UNTERSCHEIDBAR benannt", async () => {
    // Ohne diese Zusicherung waere eine Sammelmeldung („nicht freigegeben")
    // gruen — und „wird geprueft" (wartet) waere von „gesperrt" (endgueltig)
    // nicht zu unterscheiden.
    mitZugang();
    const meldungen = new Map<string, string>();
    for (const status of gesperrt) {
      rmSync(`${DIR}/files`, { recursive: true, force: true });
      const { getDb } = await import("@/app/m/files/_db/client");
      const { inboxFiles } = await import("@/app/m/files/_db/schema");
      getDb().delete(inboxFiles).run();
      await legeInboxDatei({ id: "in00000001", avStatus: status });
      meldungen.set(status, await (await rufeAuf("in00000001")).text());
    }
    expect(new Set(meldungen.values()).size).toBe(gesperrt.length);
    // Kein Rumpf darf `"undefined"` sein — genau das kaeme heraus, wenn der
    // Meldungskatalog des Handlers einen Zustand nicht kennt.
    for (const meldung of meldungen.values()) expect(meldung).not.toMatch(/undefined/);
    // `scanning` ist ein WARTEZUSTAND, kein Urteil — das muss im Text stehen,
    // sonst liest sich „wird geprueft" wie „gesperrt".
    expect(meldungen.get("scanning")).toMatch(/erneut/);
    expect(meldungen.get("scanning")).not.toMatch(/gesperrt/);
  });

  it("AV gewinnt ueber den Blob: gesperrt UND ohne Bytes → 403, nicht 404", async () => {
    // Sonst verriete der Statuscode, ob zu einer gesperrten Zeile Bytes
    // existieren. Dieselbe Linie wie `_db/queries.test.ts:532`.
    mitZugang();
    await legeInboxDatei({ id: "in00000001", avStatus: "scanning", inhalt: null });

    expect((await rufeAuf("in00000001")).status).toBe(403);
  });
});

describe("Punkt 3: der Erfolgsfall", () => {
  it("200 mit Content-Type aus der DB, attachment in BEIDEN Namensformen, nosniff, gemessener Laenge", async () => {
    mitZugang();
    // Ein Name MIT Umlaut UND Endung: bei reinem ASCII waeren beide
    // Namensformen identisch und der Test bewiese nichts. Die Endung haelt
    // fest, dass hier NICHT der Archiv-Weg (`entschaerfeTitel` → `Bericht_pdf`)
    // benutzt wird.
    await legeInboxDatei({
      id: "in00000001",
      dateiname: "Übung Nord.pdf",
      mimeType: "application/pdf",
      inhalt: "Zwölf Boxkämpfer",
    });

    const res = await rufeAuf("in00000001");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="_bung Nord.pdf"; filename*=UTF-8''%C3%9Cbung%20Nord.pdf`,
    );
    const bytes = Buffer.byteLength("Zwölf Boxkämpfer");
    expect(res.headers.get("content-length")).toBe(String(bytes));
    expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe("Zwölf Boxkämpfer");
  });

  it("`Content-Length` kommt aus der GEMESSENEN Groesse, nicht aus der Spalte `size`", async () => {
    // Ohne diese Abweichung sind beide Zahlen gleich und der Test koennte gar
    // nicht sagen, welche gelesen wurde (§5.4).
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    mitZugang();
    await legeInboxDatei({ id: "in00000001", inhalt: "abc", gemeldeteGroesse: 999 });

    const res = await rufeAuf("in00000001");

    expect(res.headers.get("content-length")).toBe("3");
    expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe("abc");
    // §5.4: die Abweichung wird geloggt, sonst faellt sie nirgends auf.
    expect(warnung).toHaveBeenCalled();
    // Ueber ALLE Aufrufe, nicht ueber `calls[0]`: im selben Prozess kann eine
    // fremde Warnung zuerst kommen, und der Test faende dann einen Defekt, der
    // keiner ist.
    expect(warnung.mock.calls.map((c) => String(c[0])).join("\n")).toContain("in00000001");
  });

  it("kein `Accept-Ranges`, kein 206 — bewusst nicht ergaenzt (§7.7)", async () => {
    mitZugang();
    await legeInboxDatei({ id: "in00000001" });

    expect((await rufeAuf("in00000001")).headers.get("accept-ranges")).toBeNull();
  });
});

describe("Punkt 4: fehlender `mime_type` (Altbestand)", () => {
  it("`mime_type IS NULL` → application/octet-stream, nicht geraten", async () => {
    mitZugang();
    // Der Name ENDET auf `.pdf`: wer aus der Endung raet, faellt hier auf.
    await legeInboxDatei({ id: "in00000001", dateiname: "Alt.pdf", mimeType: null });

    const res = await rufeAuf("in00000001");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("Punkt 5: fehlender Blob → 404, nicht 500", () => {
  it("Zeile clean, Bytes weg → 404 mit benanntem Zustand", async () => {
    mitZugang();
    await legeInboxDatei({ id: "in00000001", inhalt: null });

    const res = await rufeAuf("in00000001");

    expect(res.status).toBe(404);
    expect(await res.text()).not.toBe("");
  });

  it("unbekannte id → 404", async () => {
    mitZugang();
    await legeInboxDatei({ id: "in00000001" });

    expect((await rufeAuf("in99999999")).status).toBe(404);
  });

  it("eine gefundene ZEILE mit kaputter ID (Importfehler) → 404 statt 500", async () => {
    // Der Weg durch `!zeile` ist der leichte Fall. Dieser hier trifft eine
    // Zeile, deren PK keine nanoid(10) ist — `_lib/storage.ts` wirft dafuer
    // `UngueltigeId`, BEVOR es irgendeinen Pfad aufloest. Ungefangen waere das
    // HTTP 500 auf einem Byte-Weg, an dem §5.4 gerade keinen 500 haben will.
    mitZugang();
    await legeInboxDatei({ id: "../../etc/passwd", inhalt: null });

    expect((await rufeAuf("../../etc/passwd")).status).toBe(404);
  });
});
