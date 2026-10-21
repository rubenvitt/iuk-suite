import { describe, expect, it, vi } from "vitest";

import type { ZunderAufgabe } from "@/core/rueckmeldung/vorlage";
import { ABGELEHNT, NICHT_ERREICHBAR, ZU_VIELE, wirfEin } from "@/core/rueckmeldung/zunder";

const EINGANG = { basis: "https://zunder.example.test", token: "zi_test0123456789abcdef" };
const AUFGABE: ZunderAufgabe = {
  external_id: "tz4a98xxat96iws9zmbrgj3a",
  title: "Inventur speichert nicht",
  description: "…",
  links: [],
};

const antwort = (status: number, json: unknown = {}) =>
  new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });

describe("wirfEin", () => {
  it("schickt an /intake/v1/tasks mit dem Eingangs-Token", async () => {
    const holen = vi.fn(async () => antwort(201, { id: "abc", ref: "IDAE-12" }));
    const r = await wirfEin(EINGANG, AUFGABE, { holen });
    expect(r).toEqual({ ok: true, id: "abc", kennung: "IDAE-12" });
    const [url, init] = holen.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://zunder.example.test/intake/v1/tasks");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${EINGANG.token}`);
    expect(JSON.parse(String(init.body))).toEqual(AUFGABE);
  });

  it("nimmt 200 (Wiederholung) wie 201", async () => {
    const holen = vi.fn(async () => antwort(200, { id: "abc", ref: "IDAE-12" }));
    expect(await wirfEin(EINGANG, AUFGABE, { holen })).toMatchObject({ ok: true, kennung: "IDAE-12" });
  });

  it("wiederholt nach einem 5xx genau einmal, mit derselben external_id", async () => {
    const holen = vi
      .fn()
      .mockResolvedValueOnce(antwort(502))
      .mockResolvedValueOnce(antwort(201, { id: "abc", ref: "IDAE-12" }));
    expect(await wirfEin(EINGANG, AUFGABE, { holen })).toMatchObject({ ok: true });
    expect(holen).toHaveBeenCalledTimes(2);
    const ids = holen.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).external_id);
    expect(new Set(ids).size).toBe(1);
  });

  it("gibt nach zwei Netzfehlern auf", async () => {
    const holen = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await wirfEin(EINGANG, AUFGABE, { holen })).toEqual({ ok: false, grund: NICHT_ERREICHBAR });
    expect(holen).toHaveBeenCalledTimes(2);
  });

  it("bricht nach dem Zeitlimit ab", async () => {
    const holen = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, ablehnen) => init?.signal?.addEventListener("abort", () => ablehnen(new Error("abort")))),
    );
    const r = await wirfEin(EINGANG, AUFGABE, { holen: holen as unknown as typeof fetch, zeitlimitMs: 10 });
    expect(r).toEqual({ ok: false, grund: NICHT_ERREICHBAR });
  });

  it.each([
    [429, ZU_VIELE],
    [400, ABGELEHNT],
  ])("meldet %i verständlich und ohne Wiederholung", async (status, grund) => {
    const holen = vi.fn(async () => antwort(status, { error: { code: "x", message: "intern" } }));
    expect(await wirfEin(EINGANG, AUFGABE, { holen, warnen: vi.fn() })).toEqual({ ok: false, grund });
    expect(holen).toHaveBeenCalledTimes(1);
  });

  /** Ein 400 nach bestandener Eingabeprüfung ist ein Suite-Fehler: Zunders Grund gehört ins Log, nicht nach vorn. */
  it("schreibt Zunders Grund für ein 400 ins Serverlog, nicht in die Meldung", async () => {
    const warnen = vi.fn();
    const holen = vi.fn(async () => antwort(400, { error: { code: "invalid_type", message: "Typ\nnur in Dev-Projekten" } }));
    const r = await wirfEin(EINGANG, AUFGABE, { holen, warnen });
    expect(r).toEqual({ ok: false, grund: ABGELEHNT });
    expect(ABGELEHNT).not.toMatch(/Prüf Titel/);
    expect(warnen).toHaveBeenCalledWith("Zunder-Eingang lehnt ab (400): invalid_type: Typ nur in Dev-Projekten");
  });

  /** Eine falsche Einrichtung ist ein Betriebsfehler: Warnung ins Log, freundlicher Satz nach vorn. */
  it.each([401, 409])("warnt bei %i ins Serverlog", async (status) => {
    const warnen = vi.fn();
    const holen = vi.fn(async () => antwort(status));
    expect(await wirfEin(EINGANG, AUFGABE, { holen, warnen })).toEqual({ ok: false, grund: NICHT_ERREICHBAR });
    expect(warnen).toHaveBeenCalledOnce();
    expect(String(warnen.mock.calls[0]?.[0])).not.toContain(EINGANG.token);
  });

  it("nimmt eine Antwort ohne ID nicht als Erfolg", async () => {
    const holen = vi.fn(async () => antwort(201, {}));
    expect(await wirfEin(EINGANG, AUFGABE, { holen, warnen: vi.fn() })).toEqual({ ok: false, grund: NICHT_ERREICHBAR });
  });
});
