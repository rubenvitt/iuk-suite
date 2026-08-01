import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * WAS DIESE DATEI BESITZT (Spec §8.7 mit §7.9 und §3.2, Plan T29):
 *
 *  - die Nutzlast traegt den Host der ROLLE `inbox` und den NORMALISIERTEN
 *    Token,
 *  - der Endpunkt ist GEGATET (`requireFilesAccess`) — sonst waere er ein Orakel
 *    „existiert dieses Token?",
 *  - die Reihenfolge der beiden Riegel: erst der HOST, dann die PERSON,
 *  - `?w=` geklemmt, dekodierbares PNG, und — anders als beim Share-QR — KEIN
 *    oeffentlicher Cache.
 *
 * ZU PUNKT 2 DER TASKLISTE, woertlich „traegt den Inbox-Host, AUCH WENN der
 * Request vom Verwaltungs-Host kommt": nicht beobachtbar, Punkt 6 antwortet auf
 * genau diesen Aufruf vorher mit 404. Gefuehrt wird die Zusage deshalb ueber das
 * ROLLEN-LITERAL — vertauschte `SUITE_HOST_FILES` und ein grossgeschriebener
 * Host mit Port; dieselbe Zweiteilung wie in `api/s/[id]/qr.png/route.test.ts`.
 *
 * Die Route fragt die DATENBANK NICHT. Das ist die eigentliche Anti-Orakel-
 * Eigenschaft: fuer ein existierendes und ein erfundenes Token ist die Antwort
 * byteweise gleich. Der Riegel schuetzt davor, dass Fremde ueberhaupt
 * Abgabe-Links erzeugen.
 */

const { qrPngSpion } = vi.hoisted(() => ({
  qrPngSpion: vi.fn<(text: string, opts?: { width?: number }) => Promise<Uint8Array>>(),
}));
vi.mock("@/core/qr", async (echtImportieren) => {
  const echt = await echtImportieren<typeof import("@/core/qr")>();
  qrPngSpion.mockImplementation(echt.qrPng);
  return { ...echt, qrPng: qrPngSpion };
});

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

const authMock = vi.mocked(auth);
const headersMock = vi.mocked(headers);
const redirectMock = vi.mocked(redirect);
const notFoundMock = vi.mocked(notFound);

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";
/** Die Vorgabegruppe aus `core/registry.ts` fuer das Modul `files`. */
const FILES_ADMIN = "drk-files-admin";
const TOKEN = "dz-2345-6789-abcd";

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

beforeEach(() => {
  qrPngSpion.mockClear();
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
