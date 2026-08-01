import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/*
 * WAS DIESE DATEI BESITZT (Spec §8.7 mit §7.9 und §3.2, Plan T29):
 *
 *  - die Nutzlast traegt den Host der ROLLE `inbox` und den NORMALISIERTEN
 *    Token,
 *  - der Endpunkt ist GEGATET (`requireFilesAccess`) — sonst waere er ein Orakel
 *    „existiert dieses Token?",
 *  - die Reihenfolge der beiden Riegel: erst der HOST, dann die PERSON,
 *  - `?w=` geklemmt, dekodierbares PNG, und — anders als beim Share-QR — KEIN
 *    oeffentlicher Cache,
 *  - `?dl=1` macht daraus einen DOWNLOAD (§8.7 „erhalten bleiben muss der
 *    PNG-Download", Dateiname nach §7.9).
 *
 * ZU PUNKT 2 DER TASKLISTE, woertlich „traegt den Inbox-Host, AUCH WENN der
 * Request vom Verwaltungs-Host kommt": nicht beobachtbar, Punkt 6 antwortet auf
 * genau diesen Aufruf vorher mit 404. Gefuehrt wird die Zusage deshalb ueber das
 * ROLLEN-LITERAL — vertauschte `SUITE_HOST_FILES` und ein grossgeschriebener
 * Host mit Port; dieselbe Zweiteilung wie in `api/s/[id]/qr.png/route.test.ts`.
 *
 * ZWEI WEGE, ZWEI ANTI-ORAKEL-LAGEN — und der Unterschied ist die Zusage:
 * OHNE `?dl=1` fragt die Route die Datenbank NICHT, die Antwort ist fuer ein
 * existierendes und ein erfundenes Token byteweise gleich (das ist der Weg, den
 * das `<img>` der Druckansicht geht). MIT `?dl=1` MUSS sie fragen — der
 * Dateiname der Kopfzeile steht nur dort —, und damit unterscheidet die Antwort
 * zwischen „gibt es" und „gibt es nicht". Tragbar ist das ausschliesslich hinter
 * `requireFilesAccess()`: wer den Riegel passiert, sieht die ganze Liste der
 * Abgabelinks ohnehin. Deshalb prueft diese Datei nicht nur, DASS gegatet wird,
 * sondern dass die Datenbank vor dem Riegel UNBERUEHRT bleibt.
 */

const { qrPngSpion, getDbSpion } = vi.hoisted(() => ({
  qrPngSpion: vi.fn<(text: string, opts?: { width?: number }) => Promise<Uint8Array>>(),
  getDbSpion: vi.fn(),
}));
vi.mock("@/core/qr", async (echtImportieren) => {
  const echt = await echtImportieren<typeof import("@/core/qr")>();
  qrPngSpion.mockImplementation(echt.qrPng);
  return { ...echt, qrPng: qrPngSpion };
});

/*
 * Die DATENBANK ist echt (migriert, im Speicher) — nur ihr Zugang ist ein Spion.
 * Beides wird gebraucht: die Zeile, weil der Dateiname aus einer echten Spalte
 * kommen soll, und der Spion, weil „vor dem Riegel wird nicht gefragt" sonst
 * keine beobachtbare Aussage hat.
 */
vi.mock("../../../../_db/client", () => ({ getDb: getDbSpion }));

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { auth } from "@/core/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import * as schema from "../../../../_db/schema";
import { zugangslinks } from "../../../../_db/schema";
import { tokenHash } from "../../../../_lib/token";

const authMock = vi.mocked(auth);
const headersMock = vi.mocked(headers);
const redirectMock = vi.mocked(redirect);
const notFoundMock = vi.mocked(notFound);

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";
/** Die Vorgabegruppe aus `core/registry.ts` fuer das Modul `files`. */
const FILES_ADMIN = "drk-files-admin";
const TOKEN = "dz-2345-6789-abcd";
/** Ein Token derselben Grammatik, zu dem es KEINE Zeile gibt. */
const TOKEN_OHNE_ZEILE = "dz-9876-5432-zyxw";

/**
 * Der Name der Zeile — mit Umlaut, Leerzeichen und Punkten, also genau den drei
 * Zeichenklassen, an denen sich „entschaerft" von „roh" unterscheidet.
 */
const NAME_IN_DER_DB = "Übung Nord 30.07.";

/**
 * Die erwartete Kopfzeile, WOERTLICH und nicht aus `_lib/zip.ts` gerechnet: eine
 * aus derselben Quelle gebaute Erwartung ginge auch dann durch, wenn beide
 * Seiten gemeinsam falsch liegen. Der ASCII-Teil ist `entschaerfeTitel` (§7.9,
 * `[^a-zA-Z0-9_-]` → `_`), `-qr.png` haengt DAHINTER — davor entschaerft, wuerde
 * aus `.png` ein `_png`.
 */
const ERWARTETE_KOPFZEILE =
  `attachment; filename="_bung_Nord_30_07_-qr.png"; filename*=UTF-8''_bung_Nord_30_07_-qr.png`;

function zweiHosts(): void {
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
}

function sessionMit(groups: string[]): never {
  return {
    user: { id: "u-1", groups, fachgruppen: [], name: null, email: null, isAdmin: false },
  } as never;
}

/** Angemeldet UND berechtigt — der Normalfall, in dem ein QR ueberhaupt entsteht. */
function berechtigt(): void {
  authMock.mockResolvedValue(sessionMit([FILES_ADMIN]));
}

beforeAll(() => {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/files/_db/migrations" });
  db.insert(zugangslinks)
    .values({
      id: "zl-testtest",
      name: NAME_IN_DER_DB,
      tokenStart: TOKEN.slice(0, 7),
      tokenHash: tokenHash(TOKEN),
      createdAt: new Date(),
      createdBy: "test",
      expiresAt: new Date(Date.now() + 3_600_000),
      budgetDateien: 10,
      budgetBytes: 1024,
    })
    .run();
  // `mockImplementation`, nicht `mockReturnValue`: `mockClear` in `beforeEach`
  // loescht nur die Aufrufe und laesst die Implementierung stehen.
  getDbSpion.mockImplementation(() => db);
});

beforeEach(() => {
  qrPngSpion.mockClear();
  getDbSpion.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue(null as never);
  redirectMock.mockClear();
  notFoundMock.mockClear();
  headersMock.mockResolvedValue(new Headers({ host: INBOX }) as never);
});
afterEach(() => {
  // Blockkoerper: der Rueckgabewert eines Hooks gilt Vitest als
  // Aufraeumfunktion (siehe die ausfuehrliche Begruendung in
  // `api/s/[id]/qr.png/route.test.ts`).
  vi.unstubAllEnvs();
});

async function ruf(
  kopf: Record<string, string>,
  token = TOKEN,
  abfrage = "",
): Promise<Response> {
  const { GET } = await import("./route");
  return GET(
    new Request(`http://localhost:3000/m/files/api/u/${token}/qr.png${abfrage}`, {
      headers: kopf,
    }),
    { params: Promise.resolve({ token }) },
  );
}

function kodierteNutzlast(): string {
  return qrPngSpion.mock.calls[0][0];
}

function kodierteBreite(): number | undefined {
  return qrPngSpion.mock.calls[0][1]?.width;
}

describe("GET /api/u/[token]/qr.png — die Nutzlast kommt aus der ROLLE", () => {
  it("traegt den Inbox-Host aus der Konfiguration und den Port aus dem Request", async () => {
    zweiHosts();
    berechtigt();

    await ruf({ host: "DROP.LOCALTEST.ME:3100" });

    expect(kodierteNutzlast()).toBe(`http://${INBOX}:3100/u/${TOKEN}`);
  });

  it("folgt der ROLLE, nicht dem Namen: vertauschte SUITE_HOST_FILES vertauscht die Nutzlast", async () => {
    // Index 1 ist die Inbox — steht dort `files.localtest.me`, gehoert der
    // Abgabe-QR dorthin.
    vi.stubEnv("SUITE_HOST_FILES", `${INBOX},${VERWALTUNG}`);
    berechtigt();

    await ruf({ host: VERWALTUNG });

    expect(kodierteNutzlast()).toBe(`http://${VERWALTUNG}/u/${TOKEN}`);
  });

  it("kodiert den NORMALISIERTEN Token — ein abgeschriebener Code darf gross geschrieben sein", async () => {
    zweiHosts();
    berechtigt();

    // Gross geschrieben und mit falsch gesetzten Trennzeichen: genau das, was
    // beim Abschreiben und Vorlesen entsteht (§4.7). Gedruckt gehoert die
    // kanonische Form.
    await ruf({ host: INBOX }, "DZ-23456789ABCD");

    expect(kodierteNutzlast()).toBe(`http://${INBOX}/u/${TOKEN}`);
  });

  it("lehnt einen Token ab, der nicht der Grammatik entspricht — 404, kein QR", async () => {
    zweiHosts();
    berechtigt();

    // `0` gehoert nicht zum Alphabet (§4.7): die vier verwechselbaren Zeichen
    // sind bewusst ausgeschlossen.
    const antwort = await ruf({ host: INBOX }, "dz-0000-0000-0000");

    expect(antwort.status).toBe(404);
    expect(qrPngSpion).not.toHaveBeenCalled();
  });
});

describe("GET /api/u/[token]/qr.png — der Riegel", () => {
  it("weist eine angemeldete Person OHNE Modulgruppe mit notFound ab und kodiert nichts", async () => {
    zweiHosts();
    authMock.mockResolvedValue(sessionMit(["irgendeine-andere-gruppe"]));

    await expect(ruf({ host: INBOX })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  it("schickt eine anonyme Anfrage in die Anmeldung und kodiert nichts", async () => {
    zweiHosts();

    await expect(ruf({ host: INBOX })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock.mock.calls[0][0]).toContain("/login?callbackUrl=");
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  it("der Suite-Admin allein bekommt keinen QR — `files` kennt keine Abkuerzung", async () => {
    zweiHosts();
    // `isAdmin` bleibt hier wirkungslos: `isFilesAdmin` liest ausschliesslich die
    // Modulgruppen (§2.4, Betreiberentscheidung vom 28.07.).
    authMock.mockResolvedValue(sessionMit(["dashboard-admins"]));

    await expect(ruf({ host: INBOX })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  /**
   * ERST DER HOST, DANN DIE PERSON — dieselbe Reihenfolge und dieselbe
   * Begruendung wie in `(verwaltung)/layout.tsx`: andernfalls schickte ein
   * anonymer Aufruf auf dem FALSCHEN Host erst in den Login und antwortete
   * danach mit 404. Der Login waere eine Sackgasse, und die Rollentrennung
   * haette einen Umweg, der die Existenz des Pfades verraet.
   */
  it("antwortet auf dem Verwaltungs-Host mit 404, OHNE vorher in die Anmeldung zu schicken", async () => {
    zweiHosts();

    const antwort = await ruf({ host: VERWALTUNG });

    expect(antwort.status).toBe(404);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  it("antwortet auf einem fremden Host mit 404", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: "fremd.example.org" });

    expect(antwort.status).toBe(404);
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  /**
   * DIE REIHENFOLGE HOST → PERSON → TOKEN, jetzt BEOBACHTBAR: seit `?dl=1` gibt
   * es eine Tabellenabfrage, und die ist die einzige Stelle im Modul, an der
   * diese Route zwischen „Token existiert" und „Token existiert nicht"
   * unterscheidet. Laege sie vor einem der beiden Riegel, waere aus dem gegateten
   * Endpunkt genau das Orakel geworden, das §8.7 mit dem Riegel verhindert —
   * und zwar fuer JEDEN, der die Adresse kennt.
   *
   * Ohne diese drei Faelle bliebe eine hochgezogene Abfrage gruen: die
   * Statuscodes daneben aendern sich dabei nicht.
   */
  describe("die Datenbank bleibt VOR den Riegeln unberuehrt — auch mit `?dl=1`", () => {
    it("auf dem Verwaltungs-Host", async () => {
      zweiHosts();
      berechtigt();

      await ruf({ host: VERWALTUNG }, TOKEN, "?dl=1");

      expect(getDbSpion).not.toHaveBeenCalled();
    });

    it("bei einer anonymen Anfrage", async () => {
      zweiHosts();

      await expect(ruf({ host: INBOX }, TOKEN, "?dl=1")).rejects.toThrow("NEXT_REDIRECT");
      expect(getDbSpion).not.toHaveBeenCalled();
    });

    it("bei einer angemeldeten Person ohne Modulgruppe", async () => {
      zweiHosts();
      authMock.mockResolvedValue(sessionMit(["irgendeine-andere-gruppe"]));

      await expect(ruf({ host: INBOX }, TOKEN, "?dl=1")).rejects.toThrow("NEXT_NOT_FOUND");
      expect(getDbSpion).not.toHaveBeenCalled();
    });
  });
});

describe("GET /api/u/[token]/qr.png — `?w=` wird geklemmt, nicht durchgereicht", () => {
  it.each([
    ["", 512],
    ["?w=1024", 1024],
    ["?w=100000", 2048],
    ["?w=0", 512],
    ["?w=-5", 512],
    ["?w=abc", 512],
    ["?w=", 512],
  ])("%s → %i px", async (abfrage, erwartet) => {
    zweiHosts();
    berechtigt();

    await ruf({ host: INBOX }, TOKEN, abfrage);

    expect(kodierteBreite()).toBe(erwartet);
  });
});

/**
 * Siehe die Begruendung in `api/s/[id]/qr.png/route.test.ts`: Kopf von Hand
 * lesen, und die Kantenlaenge NICHT gegen `?w=` pruefen — dieselbe Vorgabe 512
 * ergibt hier gemessene 511×511, weil die Nutzlast laenger ist.
 */
function pngKopf(bytes: Uint8Array): { breite: number; hoehe: number } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(...bytes.slice(12, 16))).toBe("IHDR");
  expect(String.fromCharCode(...bytes.slice(bytes.length - 8, bytes.length - 4))).toBe("IEND");
  return { breite: sicht.getUint32(16), hoehe: sicht.getUint32(20) };
}

describe("GET /api/u/[token]/qr.png — die Antwort", () => {
  it("ist ein dekodierbares, quadratisches PNG mit content-type image/png", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX });

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/png");
    const { breite, hoehe } = pngKopf(new Uint8Array(await antwort.arrayBuffer()));
    expect(breite).toBeGreaterThan(0);
    expect(breite).toBe(hoehe);
  });

  /**
   * KEIN `public` — der Unterschied zur Share-Route, und er ist kein Detail.
   * Diese Route ist gegatet, ihre Nutzlast IST der Abgabe-Link, und ein
   * gemeinsamer Cache (Cloudflare liegt davor) schluesselt auf die URL, nicht auf
   * die Sitzung: mit `public` reichte ein Treffer im Edge-Cache, um das Bild —
   * und damit den Link — an einen Unangemeldeten auszuliefern. Genau der Riegel
   * eine Zeile darueber waere damit umgangen.
   */
  it("wird NICHT in einem gemeinsamen Cache abgelegt — die Nutzlast ist der Abgabe-Link", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX });

    expect(antwort.headers.get("cache-control")).toBe("private, no-store");
  });
});

/**
 * `?dl=1` — DER PNG-DOWNLOAD (§8.7: „Erhalten bleiben muss der PNG-Download,
 * weil er der dokumentierte Zweck war"; Dateiname nach §7.9).
 *
 * WARUM DIE ROUTE ES TUN MUSS und nicht das `download`-Attribut im Markup: der
 * Browser ignoriert `download` bei FREMDER Herkunft, und fremd ist die Herkunft
 * hier nicht zufaellig, sondern per Konfiguration garantiert — die Route liegt
 * auf der Inbox-Domain, die Seite auf der Verwaltungs-Domain, und
 * `validateFilesHosts` bricht ab, wenn beide Rollen denselben Host tragen
 * (`_lib/hostRolle.ts`). Ohne Kopfzeile navigiert der Knopf nur, und im selben
 * Tab kostete das die EINMALIGE Token-Ausgabe (§4.7).
 */
describe("GET /api/u/[token]/qr.png — `?dl=1` liefert einen Download", () => {
  it("traegt `attachment` und den Dateinamen AUS DER DATENBANK", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX }, TOKEN, "?dl=1");

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-disposition")).toBe(ERWARTETE_KOPFZEILE);
  });

  /**
   * DER NAME KOMMT NIE AUS DER ANFRAGE. Ein Name aus dem Client in einer
   * Kopfzeile waere eine Injektionsstelle — und selbst gehaertet
   * (`dispositionKopfzeile`) waere er eine Auskunft, die der Aufrufer sich
   * selbst erteilt: der Dateiname soll den Abgabelink WIEDERERKENNBAR machen,
   * und wiedererkennbar ist nur, was in der Zeile steht.
   */
  it("ignoriert einen Namen aus der URL — die Kopfzeile ist keine Client-Flaeche", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf(
      { host: INBOX },
      TOKEN,
      `?dl=1&name=${encodeURIComponent('fremd"; x=y')}&dateiname=fremd&filename=fremd`,
    );

    expect(antwort.headers.get("content-disposition")).toBe(ERWARTETE_KOPFZEILE);
    expect(antwort.headers.get("content-disposition")).not.toContain("fremd");
  });

  it("bleibt sonst dieselbe Antwort: PNG, geklemmtes `?w=`, kein gemeinsamer Cache", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX }, TOKEN, "?w=100000&dl=1");

    expect(antwort.headers.get("content-type")).toBe("image/png");
    // Ein `attachment` darf die Cache-Zusage nicht mitziehen: die Nutzlast IST
    // weiterhin der Abgabe-Link.
    expect(antwort.headers.get("cache-control")).toBe("private, no-store");
    expect(kodierteBreite()).toBe(2048);
    const { breite, hoehe } = pngKopf(new Uint8Array(await antwort.arrayBuffer()));
    expect(breite).toBe(hoehe);
  });

  /**
   * OHNE `?dl=1` BLEIBT ALLES, WIE ES WAR — und das ist keine Kosmetik: dieselbe
   * Adresse steht als `<img src>` in der Ausgabe und in der Druckansicht
   * (`_ui/ZugangslinksListe.tsx`). Eine `attachment`-Kopfzeile dort machte aus
   * dem angezeigten QR einen Download-Dialog.
   */
  it("traegt OHNE `?dl=1` keine content-disposition und fragt die Datenbank nicht", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX }, TOKEN, "?w=1024");

    expect(antwort.headers.get("content-disposition")).toBeNull();
    expect(getDbSpion).not.toHaveBeenCalled();
  });

  /**
   * GENAU `1`, wie `ende=1` im Upload-Weg. Ein „irgendwas Wahres" waere ein
   * zweiter, ungeschriebener Vertrag — und `dl=0` hiesse dann Download.
   */
  it.each(["?dl=0", "?dl=", "?dl=ja", "?dl=11"])(
    "%s ist KEIN Download — und fragt die Datenbank nicht",
    async (abfrage) => {
      zweiHosts();
      berechtigt();

      const antwort = await ruf({ host: INBOX }, TOKEN, abfrage);

      expect(antwort.headers.get("content-disposition")).toBeNull();
      expect(getDbSpion).not.toHaveBeenCalled();
    },
  );

  /**
   * Ein Token ohne Zeile bekommt dieselbe Antwort wie eines, das der Grammatik
   * nicht entspricht: 404 ohne Rumpfunterschied, und VOR `qrPng` — ein
   * ausgeliefertes Bild waere die Auskunft „diesen Link gibt es nicht mehr", nur
   * in Bytes.
   */
  it("antwortet mit 404, wenn es zu dem Token keine Zeile gibt — und kodiert nichts", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX }, TOKEN_OHNE_ZEILE, "?dl=1");

    expect(antwort.status).toBe(404);
    expect(antwort.headers.get("content-disposition")).toBeNull();
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  it("loest den Token normalisiert auf — der abgeschriebene Code findet seine Zeile", async () => {
    zweiHosts();
    berechtigt();

    const antwort = await ruf({ host: INBOX }, "DZ-23456789ABCD", "?dl=1");

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-disposition")).toBe(ERWARTETE_KOPFZEILE);
  });
});
