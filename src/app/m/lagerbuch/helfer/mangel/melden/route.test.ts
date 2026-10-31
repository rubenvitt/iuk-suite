import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { lagerorte, maengel } from "../../../_db/schema";
import { VOLLE_REICHWEITE } from "../../../_lib/helferBereich";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "lagerbuch.example" }) }));
vi.mock("../../../_lib/host", () => ({ lagerbuchHostOderNull: () => "lagerbuch" }));

let t: TestDb;
vi.mock("../../../_db/client", () => ({ getDb: () => t.db }));

type Zugang = Awaited<ReturnType<typeof import("../../../_lib/helferZugang").requireHelferSchreibend>>;
let zugang: Zugang;
vi.mock("../../../_lib/helferZugang", () => ({ requireHelferSchreibend: async () => zugang }));

import { POST } from "./route";

const KARTE: Zugang = {
  ok: true,
  zugang: {
    herkunft: "token", tokenId: "tok-1", code: "123-456", label: "RTW 1", laeuftAb: new Date(Date.now() + 3600_000),
    fahrzeugBindung: null, reichweite: VOLLE_REICHWEITE,
  },
};

let daten: string;
let vorher: string | undefined;
beforeEach(() => {
  t = migrierteTestDb();
  t.db.insert(lagerorte).values({ id: "rtw", name: "RTW 1", typ: "fahrzeug", einheitenart: "fahrzeug" }).run();
  zugang = KARTE;
  vorher = process.env.DATA_DIR;
  daten = mkdtempSync(join(tmpdir(), "lagerbuch-mangel-"));
  process.env.DATA_DIR = daten;
});
afterEach(() => {
  t.schliessen();
  if (vorher === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = vorher;
  rmSync(daten, { recursive: true, force: true });
});

function anfrage(felder: Record<string, string | string[]>, fotos: Blob[] = [], kopf: Record<string, string> = {}): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(felder)) for (const w of [v].flat()) fd.append(k, w);
  for (const f of fotos) fd.append("foto", f, "bild.jpg");
  return new Request("https://lagerbuch.example/helfer/mangel/melden", {
    method: "POST", body: fd, headers: { host: "lagerbuch.example", ...kopf },
  });
}

async function jpeg(): Promise<Blob> {
  const b = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#888" } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(b)], { type: "image/jpeg" });
}

describe("POST /helfer/mangel/melden", () => {
  it("legt die Meldung mit bereinigten Punkten und neu gerechneten Fotos an", async () => {
    const r = await POST(anfrage(
      { ort: "rtw", punkt: ["Verschmutzt", "erfunden"], beschreibung: "  Sitz vorne links  ", name: "Kim" },
      [await jpeg(), await jpeg()],
    ));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const m = t.db.select().from(maengel).get()!;
    expect(m).toMatchObject({
      lagerortId: "rtw", punkte: ["Verschmutzt"], beschreibung: "Sitz vorne links", melderName: "Kim",
      quelleTyp: "token", quelleId: "123-456", fotos: 2, erledigtAt: null,
    });
    const dateien = readdirSync(join(daten, "lagerbuch", "maengel")).sort();
    expect(dateien).toEqual([`${m.id}-0.jpg`, `${m.id}-1.jpg`]);
    const meta = await sharp(join(daten, "lagerbuch", "maengel", dateien[0]!)).metadata();
    expect(meta.width).toBe(1600);
  });

  it("verlangt einen Punkt oder eine Beschreibung, bei „Etwas anderes“ die Beschreibung", async () => {
    let r = await POST(anfrage({ ort: "rtw" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, feld: "punkte" });
    r = await POST(anfrage({ ort: "rtw", punkt: "Etwas anderes" }));
    expect(await r.json()).toMatchObject({ ok: false, feld: "beschreibung" });
    expect(t.db.select().from(maengel).all()).toHaveLength(0);
  });

  it("lehnt einen unbekannten Ort, ein Nicht-Bild und eine fremde Herkunft ab, ohne etwas zu schreiben", async () => {
    expect((await POST(anfrage({ ort: "gibtsnicht", punkt: "Verschmutzt" }))).status).toBe(400);
    const r = await POST(anfrage({ ort: "rtw", punkt: "Verschmutzt" }, [new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" })]));
    expect(await r.json()).toMatchObject({ ok: false, feld: "fotos" });
    expect((await POST(anfrage({ ort: "rtw", punkt: "Verschmutzt" }, [], { origin: "https://boese.example" }))).status).toBe(403);
    expect(t.db.select().from(maengel).all()).toHaveLength(0);
  });

  it("lehnt ohne Sitzung ab", async () => {
    zugang = { ok: false, grund: "sitzung", nochAngemeldet: false };
    expect((await POST(anfrage({ ort: "rtw", punkt: "Verschmutzt" }))).status).toBe(401);
  });

  it("nimmt höchstens drei Fotos", async () => {
    const f = await jpeg();
    const r = await POST(anfrage({ ort: "rtw", punkt: "Verschmutzt" }, [f, f, f, f]));
    expect(await r.json()).toMatchObject({ ok: false, feld: "fotos" });
  });

  it("bricht einen übergroßen Körper beim Lesen ab, auch ohne content-length", async () => {
    const block = new Uint8Array(1024 * 1024);
    let n = 0;
    const strom = new ReadableStream<Uint8Array>({
      pull(c) { if (n++ < 60) c.enqueue(block); else c.close(); },
    });
    const req = new Request("https://lagerbuch.example/helfer/mangel/melden", {
      method: "POST", body: strom, duplex: "half",
      headers: { host: "lagerbuch.example", "content-type": "multipart/form-data; boundary=x" },
    } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(n).toBeLessThan(60);
    expect((await POST(anfrage({ ort: "rtw" }, [], { "content-length": "999999999" }))).status).toBe(413);
  });
});
