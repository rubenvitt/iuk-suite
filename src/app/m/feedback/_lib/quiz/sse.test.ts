import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sseAntwort } from "./sse";
import { abonniere, anzahlAbonnenten, melde } from "./verteiler";

const dec = new TextDecoder();
async function lies(r: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await r.read();
  return { text: value ? dec.decode(value) : "", done };
}

describe("sseAntwort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sendet sofort den Stand mit den richtigen Kopfzeilen", async () => {
    const ac = new AbortController();
    const res = sseAntwort(ac.signal, 10, () => ({ a: 1 }));
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    const r = res.body!.getReader();
    expect((await lies(r)).text).toBe('data: {"a":1}\n\n');
    ac.abort();
  });

  it("sendet bei melde erneut, gebündelt", async () => {
    const ac = new AbortController();
    let n = 0;
    const res = sseAntwort(ac.signal, 11, () => ({ n: ++n }));
    const r = res.body!.getReader();
    await lies(r);
    melde(11);
    melde(11);
    vi.advanceTimersByTime(250);
    expect((await lies(r)).text).toBe('data: {"n":2}\n\n');
    ac.abort();
  });

  it("sendet alle 15 s einen Herzschlag", async () => {
    const ac = new AbortController();
    const res = sseAntwort(ac.signal, 12, () => ({}));
    const r = res.body!.getReader();
    await lies(r);
    vi.advanceTimersByTime(15_000);
    expect((await lies(r)).text).toBe(": ping\n\n");
    ac.abort();
  });

  it("sendet ende und schließt, wenn sicht null liefert", async () => {
    const ac = new AbortController();
    let aus = false;
    const res = sseAntwort(ac.signal, 13, () => (aus ? null : { ok: 1 }));
    const r = res.body!.getReader();
    await lies(r);
    aus = true;
    melde(13);
    vi.advanceTimersByTime(250);
    expect((await lies(r)).text).toBe("event: ende\ndata: {}\n\n");
    expect((await lies(r)).done).toBe(true);
    expect(anzahlAbonnenten(13)).toBe(0);
  });

  it("meldet bei abort ab und schließt", async () => {
    const ac = new AbortController();
    const res = sseAntwort(ac.signal, 14, () => ({}));
    const r = res.body!.getReader();
    await lies(r);
    expect(anzahlAbonnenten(14)).toBe(1);
    ac.abort();
    expect(anzahlAbonnenten(14)).toBe(0);
    expect((await lies(r)).done).toBe(true);
  });

  it("meldet bei cancel ab", async () => {
    const ac = new AbortController();
    const res = sseAntwort(ac.signal, 15, () => ({}));
    const r = res.body!.getReader();
    await lies(r);
    await r.cancel();
    expect(anzahlAbonnenten(15)).toBe(0);
  });

  it("schließt sauber, wenn sicht wirft", async () => {
    const ac = new AbortController();
    let wirf = false;
    const res = sseAntwort(ac.signal, 16, () => {
      if (wirf) throw new Error("db weg");
      return {};
    });
    const r = res.body!.getReader();
    await lies(r);
    wirf = true;
    melde(16);
    vi.advanceTimersByTime(250);
    expect((await lies(r)).done).toBe(true);
    expect(anzahlAbonnenten(16)).toBe(0);
  });

  it("liefert 503, wenn der Verteiler voll ist", () => {
    const abm: Array<() => void> = [];
    for (let i = 0; i < 200; i++) abm.push(abonniere(17, () => {})!);
    const res = sseAntwort(new AbortController().signal, 17, () => ({}));
    expect(res.status).toBe(503);
    expect(res.body).toBeNull();
    abm.forEach((a) => a());
  });
});
