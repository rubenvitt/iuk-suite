import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * WAS DIESE DATEI BESITZT (Spec §7.9 und §3.2, Plan T29):
 *
 *  - die Nutzlast traegt den Host der ROLLE `verwaltung` — nicht den Host des
 *    Requests; daran haengt ein GEDRUCKTER Code,
 *  - `?w=` ist geklemmt, nicht durchgereicht,
 *  - die Antwort ist ein dekodierbares PNG mit `content-type: image/png`,
 *  - die Rollensperre des Handlers selbst (Route Handler haben kein Layout,
 *    §3.2 — die dritte Verankerung, die man vergisst).
 *
 * ZU PUNKT 1 DER TASKLISTE, woertlich „die Nutzlast des Share-QR traegt den
 * Verwaltungs-Host, AUCH WENN der Request vom Inbox-Host kommt": dieser Satz ist
 * am fertigen Handler nicht beobachtbar — Punkt 6 (Rollensperre) beantwortet
 * genau diesen Aufruf vorher mit 404, und die Sperre zu schwaechen, damit der
 * Satz messbar wird, waere die falsche Reihenfolge. Die Zusage wird deshalb ueber
 * das ROLLEN-LITERAL gefuehrt, in zwei Haelften:
 *
 *   a) VERTAUSCHTE `SUITE_HOST_FILES` — der Verwaltungs-Host wandert auf den
 *      anderen Namen, und die Nutzlast muss mitwandern. Faengt die Mutation
 *      `oeffentlicheUrl("verwaltung", …)` → `"inbox"`.
 *   b) GROSSGESCHRIEBENER Host mit Port im Request — die Nutzlast traegt den
 *      kleingeschriebenen Host AUS DER KONFIGURATION und den Port AUS DEM
 *      REQUEST. Faengt die Mutation „Host aus `resolveHost(req.headers)`", die
 *      (a) allein durchliesse.
 *
 * Was diese Datei NICHT besitzt: die Formregeln von `oeffentlicheUrl` selbst
 * (das ist `_lib/hostRolle.test.ts`, T9) und die Kapazitaetspruefung von `qrPng`
 * (`core/qr/qr.test.ts`).
 */

/**
 * Der Spion liegt VOR der echten Implementierung, nicht an ihrer Stelle: die
 * Nutzlast und die Kantenlaenge sind nur am Aufruf ablesbar (im fertigen PNG
 * stuende die URL nur noch als Modulmuster), das dekodierbare PNG braucht aber
 * die echten Bytes. `mockClear` statt `mockReset` — `mockReset` wuerfe die
 * durchgereichte Implementierung weg und Punkt 4 bekaeme `undefined`.
 */
const { qrPngSpion } = vi.hoisted(() => ({
  qrPngSpion: vi.fn<(text: string, opts?: { width?: number }) => Promise<Uint8Array>>(),
}));
vi.mock("@/core/qr", async (echtImportieren) => {
  const echt = await echtImportieren<typeof import("@/core/qr")>();
  qrPngSpion.mockImplementation(echt.qrPng);
  return { ...echt, qrPng: qrPngSpion };
});

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";
/** nanoid(10) ueber das `urlAlphabet` — die Form, die `_lib/storage.ts` erzwingt. */
const SHARE_ID = "aB3_x9-Qz1";

function zweiHosts(): void {
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
}

/*
 * BLOCKKOERPER, KEIN AUSDRUCK — und das ist keine Stilfrage. `mockClear()` gibt
 * den Mock ZURUECK (er ist verkettbar), und Vitest behandelt den Rueckgabewert
 * eines Hooks als Aufraeumfunktion: `beforeEach(() => spion.mockClear())` ruft
 * den Spion nach jedem Test ohne Argumente auf. Hier hiess das `qrPng(undefined)`
 * — ein Wurf „QR-Text darf nicht leer sein" aus dem Aufraeumen heraus, der dem
 * gerade gelaufenen Test zugeschlagen wird.
 */
beforeEach(() => {
  qrPngSpion.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function ruf(kopf: Record<string, string>, abfrage = ""): Promise<Response> {
  const { GET } = await import("./route");
  // `req.url` traegt bewusst die INTERNE Adresse: genau die Lage nach dem
  // Host-Rewrite der Middleware (`core/routing.ts`). Der oeffentliche Host steht
  // nur in den Kopfzeilen.
  return GET(
    new Request(`http://localhost:3000/m/files/api/s/${SHARE_ID}/qr.png${abfrage}`, {
      headers: kopf,
    }),
    { params: Promise.resolve({ id: SHARE_ID }) },
  );
}

/** Die Zeichenkette, die in den Kodierer gegangen ist — der ganze Befund. */
function kodierteNutzlast(): string {
  return qrPngSpion.mock.calls[0][0];
}

function kodierteBreite(): number | undefined {
  return qrPngSpion.mock.calls[0][1]?.width;
}

describe("GET /api/s/[id]/qr.png — die Nutzlast kommt aus der ROLLE", () => {
  it("traegt den Verwaltungs-Host aus der Konfiguration und den Port aus dem Request", async () => {
    zweiHosts();

    await ruf({ host: "FILES.LOCALTEST.ME:3100" });

    // Kleingeschrieben (aus der Konfiguration), Port 3100 (aus dem Request):
    // E2E laeuft auf 3100, `pnpm dev` auf 3000, und `SUITE_HOST_*` darf keinen
    // Port tragen (`core/hosts.ts` weist `:` ab).
    expect(kodierteNutzlast()).toBe(`http://${VERWALTUNG}:3100/s/${SHARE_ID}`);
  });

  it("folgt der ROLLE, nicht dem Namen: vertauschte SUITE_HOST_FILES vertauscht die Nutzlast", async () => {
    // Index 0 ist die Verwaltung — steht dort `drop.localtest.me`, gehoert der
    // Share-QR dorthin. Das ist die Haelfte der Zusage, die ein hartkodierter
    // Hostname oder die Rolle `inbox` nicht erfuellen kann.
    vi.stubEnv("SUITE_HOST_FILES", `${INBOX},${VERWALTUNG}`);

    await ruf({ host: INBOX });

    expect(kodierteNutzlast()).toBe(`http://${INBOX}/s/${SHARE_ID}`);
  });

  it("nimmt das Protokoll aus x-forwarded-proto — hinter Traefik ist es https", async () => {
    zweiHosts();

    await ruf({ host: "10.0.3.14:3000", "x-forwarded-host": VERWALTUNG, "x-forwarded-proto": "https" });

    expect(kodierteNutzlast()).toBe(`https://${VERWALTUNG}/s/${SHARE_ID}`);
  });
});

describe("GET /api/s/[id]/qr.png — `?w=` wird geklemmt, nicht durchgereicht", () => {
  it("nimmt eine gewuenschte Druckbreite an", async () => {
    zweiHosts();

    await ruf({ host: VERWALTUNG }, "?w=1024");

    expect(kodierteBreite()).toBe(1024);
  });

  it.each([
    ["", 512],
    ["?w=100000", 2048],
    ["?w=0", 512],
    ["?w=-5", 512],
    ["?w=abc", 512],
    ["?w=", 512],
  ])("%s → %i px", async (abfrage, erwartet) => {
    zweiHosts();

    await ruf({ host: VERWALTUNG }, abfrage);

    expect(kodierteBreite()).toBe(erwartet);
  });
});

/**
 * Die PNG-Signatur, der IHDR-Kopf und der IEND-Abschluss werden von Hand
 * gelesen: das belegt „dekodierbar" ohne eine zusaetzliche Abhaengigkeit. Die
 * Kantenlaenge wird NICHT gegen `?w=` geprueft — node-qrcode skaliert in ganzen
 * Modulen, die tatsaechliche Kantenlaenge weicht deshalb ab, und zwar je nach
 * Nutzlaenge verschieden: am laufenden Dev-Server gemessen liefert derselbe
 * Vorgabewert 512 fuer den Share-QR 512×512 und fuer den laengeren Inbox-QR
 * 511×511. Die exakten Zahlen besitzt der Spion (Abschnitt darueber), die Bytes
 * besitzen die Dekodierbarkeit. Beides zu koppeln hiesse, eine Bibliotheksinterna
 * zu zementieren — und der Test waere fuer eine der beiden Routen falsch.
 */
function pngKopf(bytes: Uint8Array): { breite: number; hoehe: number } {
  expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const sicht = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(...bytes.slice(12, 16))).toBe("IHDR");
  expect(String.fromCharCode(...bytes.slice(bytes.length - 8, bytes.length - 4))).toBe("IEND");
  return { breite: sicht.getUint32(16), hoehe: sicht.getUint32(20) };
}

describe("GET /api/s/[id]/qr.png — die Antwort", () => {
  it("ist ein dekodierbares, quadratisches PNG mit content-type image/png", async () => {
    zweiHosts();

    const antwort = await ruf({ host: VERWALTUNG });

    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/png");
    const { breite, hoehe } = pngKopf(new Uint8Array(await antwort.arrayBuffer()));
    expect(breite).toBeGreaterThan(0);
    expect(breite).toBe(hoehe);
  });

  it("darf oeffentlich zwischengespeichert werden — die Route ist selbst oeffentlich", async () => {
    zweiHosts();

    const antwort = await ruf({ host: VERWALTUNG });

    expect(antwort.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});

describe("GET /api/s/[id]/qr.png — die Rollensperre des Handlers", () => {
  it("antwortet auf dem Inbox-Host mit 404 und kodiert nichts", async () => {
    zweiHosts();

    const antwort = await ruf({ host: INBOX });

    expect(antwort.status).toBe(404);
    expect(qrPngSpion).not.toHaveBeenCalled();
  });

  it("antwortet auf einem fremden Host mit 404 — 404 statt 403, die Existenz wird nicht verraten", async () => {
    zweiHosts();

    const antwort = await ruf({ host: "fremd.example.org" });

    expect(antwort.status).toBe(404);
    expect(qrPngSpion).not.toHaveBeenCalled();
  });
});
