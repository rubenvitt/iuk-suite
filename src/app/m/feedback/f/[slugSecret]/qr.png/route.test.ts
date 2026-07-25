import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/feedback/_db/schema";
import { insertGroup } from "@/app/m/feedback/_db/queries";

/**
 * Der PNG wird NICHT dekodiert: geprüft wird die URL, die in den Kodierer geht.
 * Sie ist der ganze Befund — ein QR-Code ist ein DRUCKSTÜCK, eine falsche Adresse
 * darin fällt erst an der Wand auf.
 */
const { qrPngMock } = vi.hoisted(() => ({
  qrPngMock: vi.fn<(text: string, opts?: { width?: number }) => Promise<Uint8Array>>(
    async () => new Uint8Array(),
  ),
}));
vi.mock("@/core/qr", () => ({ qrPng: qrPngMock }));
vi.mock("@/app/m/feedback/_db/client", () => ({ getDb: () => db }));
vi.mock("../../../_db/client", () => ({ getDb: () => db }));

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  insertGroup(db, {
    name: "Bereitschaft",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  qrPngMock.mockClear();
});
afterEach(() => sqlite.close());

const TOKEN = "bereitschaft-abc12";
const params = Promise.resolve({ slugSecret: TOKEN });

/** Die URL, die der Kodierer bekommen hat. */
function kodierteUrl(): string {
  return qrPngMock.mock.calls[0][0];
}

async function ruf(headers: Record<string, string>, query = ""): Promise<Response> {
  const { GET } = await import("./route");
  // `req.url` trägt bewusst die INTERNE Adresse: genau die Lage nach dem
  // Host-Rewrite der Middleware.
  return GET(new Request("http://localhost:3000/f/" + TOKEN + query, { headers }), { params });
}

/** Die Kantenlänge, die der Kodierer bekommen hat. */
function kodierteBreite(): number | undefined {
  return qrPngMock.mock.calls[0][1]?.width;
}

describe("GET /f/[slugSecret]/qr.png — der kodierte Host", () => {
  /**
   * Derselbe Defekt wie der Produktions-Blocker aus N1: `host` allein trägt hinter
   * einem Reverse-Proxy dessen eigenen (Upstream-)Namen. Ohne den Vorrang von
   * `x-forwarded-host` kodierte die Route eine UNERREICHBARE Adresse in ein
   * Plakat. Die Vorrangregel liegt in `core/routing.resolveHost` — eine zweite
   * Auflösung wäre der nächste Ort, an dem sie auseinanderläuft.
   */
  it("kodiert bei umgeschriebenem Host den öffentlichen Host aus x-forwarded-host", async () => {
    await ruf({
      host: "10.0.3.14:3000", // die interne Upstream-Adresse
      "x-forwarded-host": "feedback.iuk-ue.de",
      "x-forwarded-proto": "https",
    });

    expect(kodierteUrl()).toBe(`https://feedback.iuk-ue.de/f/${TOKEN}`);
  });

  it("bei einer Kommaliste gewinnt der erste Wert (der Client-Host)", async () => {
    await ruf({
      host: "10.0.3.14:3000",
      "x-forwarded-host": "feedback.iuk-ue.de, proxy.intern",
      "x-forwarded-proto": "https",
    });

    expect(kodierteUrl()).toBe(`https://feedback.iuk-ue.de/f/${TOKEN}`);
  });

  it("ohne x-forwarded-host bleibt es beim Host-Header (unveränderter Direktbetrieb)", async () => {
    await ruf({ host: "feedback.localtest.me:3000" });

    expect(kodierteUrl()).toBe(`http://feedback.localtest.me:3000/f/${TOKEN}`);
  });

  it("leerer x-forwarded-host fällt auf host zurück, nicht auf die leere Adresse", async () => {
    await ruf({ host: "feedback.localtest.me:3000", "x-forwarded-host": "" });

    expect(kodierteUrl()).toBe(`http://feedback.localtest.me:3000/f/${TOKEN}`);
  });

  /**
   * `?w=` gibt es, weil der Aushang den Code auf 90mm druckt: 512px sind dort
   * ~145 dpi und sichtbar ausgefranst (§3.5). Die Route ist ÖFFENTLICH und
   * unangemeldet, und `cache-control: public` schlüsselt auf die ganze URL —
   * ein ungeprüftes `?w=` wäre Rechenlast- und Cache-Verstärkung mit einer
   * Zeichenfolge als Eintrittskarte. Deshalb: geklemmt, nicht durchgereicht.
   */
  it("druckt auf Wunsch in 1024px — der Aushang braucht die Auflösung", async () => {
    await ruf({ host: "feedback.localtest.me:3000" }, "/qr.png?w=1024");

    expect(kodierteBreite()).toBe(1024);
  });

  it("ohne Parameter bleibt es bei 512px", async () => {
    await ruf({ host: "feedback.localtest.me:3000" });

    expect(kodierteBreite()).toBe(512);
  });

  it("klemmt absurde und unsinnige Werte, statt sie zu kodieren", async () => {
    for (const [wert, erwartet] of [
      ["?w=100000", 2048],
      ["?w=0", 512],
      ["?w=-5", 512],
      ["?w=abc", 512],
      ["?w=", 512],
    ] as const) {
      qrPngMock.mockClear();
      await ruf({ host: "feedback.localtest.me:3000" }, "/qr.png" + wert);
      expect(kodierteBreite(), `w=${wert}`).toBe(erwartet);
    }
  });

  it("falsches Secret: 404 und kein QR-Code", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost:3000/x", { headers: { host: "h" } }), {
      params: Promise.resolve({ slugSecret: "bereitschaft-zzzzz" }),
    });

    expect(res.status).toBe(404);
    expect(qrPngMock).not.toHaveBeenCalled();
  });
});
