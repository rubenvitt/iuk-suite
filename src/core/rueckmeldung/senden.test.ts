import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const zustand = vi.hoisted(() => ({ user: null as null | { id: string; name?: string; email?: string } }));
vi.mock("@/core/auth", () => ({ auth: async () => (zustand.user ? { user: zustand.user } : null) }));

import { sendeRueckmeldung } from "@/core/rueckmeldung/senden";
import { _eingangWarnsperreZuruecksetzen } from "@/core/rueckmeldung/eingang";
import { TAKT_GRENZE, _taktZuruecksetzen } from "@/core/rueckmeldung/takt";

const EINGABE = {
  id: "tz4a98xxat96iws9zmbrgj3a",
  art: "idee",
  titel: "Sortierung merken",
  text: "",
  modulKey: "portal",
  seite: "https://portal.example.test/",
  browser: "",
  fenster: "",
  thema: "",
};

const holen = vi.fn();

beforeEach(() => {
  zustand.user = { id: "u1", name: "Max Mustermann", email: "max@example.org" };
  vi.stubEnv("SUITE_RUECKMELDUNG_ZUNDER_URL", "https://zunder.example.test");
  vi.stubEnv("SUITE_RUECKMELDUNG_ZUNDER_TOKEN", "zi_test0123456789abcdef");
  vi.stubGlobal("fetch", holen);
  holen.mockReset();
  holen.mockImplementation(async () => new Response(JSON.stringify({ id: "abc", ref: "IDAE-7" }), { status: 201 }));
  _taktZuruecksetzen();
  _eingangWarnsperreZuruecksetzen();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendeRueckmeldung", () => {
  it("liefert die Kennung aus Zunder", async () => {
    expect(await sendeRueckmeldung(EINGABE)).toEqual({ ok: true, kennung: "IDAE-7" });
  });

  it("verlangt eine Sitzung und ruft Zunder dann gar nicht", async () => {
    zustand.user = null;
    expect((await sendeRueckmeldung(EINGABE)).ok).toBe(false);
    expect(holen).not.toHaveBeenCalled();
  });

  it("nimmt den Namen aus der Sitzung und nie die E-Mail-Adresse", async () => {
    await sendeRueckmeldung({ ...EINGABE, name: "Jemand anderes" });
    const body = JSON.parse(String((holen.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.description).toContain("**Gemeldet von:** Max Mustermann");
    expect(body.description).not.toContain("Jemand anderes");
    expect(body.description).not.toContain("max@example.org");
  });

  it("ruft Zunder bei ungültiger Eingabe nicht", async () => {
    expect((await sendeRueckmeldung({ ...EINGABE, titel: "" })).ok).toBe(false);
    expect(holen).not.toHaveBeenCalled();
  });

  it("ist ohne Eingang aus, auch wenn jemand die Action direkt ruft", async () => {
    vi.stubEnv("SUITE_RUECKMELDUNG_ZUNDER_TOKEN", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await sendeRueckmeldung(EINGABE)).ok).toBe(false);
    expect(holen).not.toHaveBeenCalled();
  });

  it("bremst nach fünf Rückmeldungen je Stunde", async () => {
    for (let i = 0; i < TAKT_GRENZE; i++) expect((await sendeRueckmeldung(EINGABE)).ok).toBe(true);
    const r = await sendeRueckmeldung(EINGABE);
    expect(r.ok).toBe(false);
    expect(holen).toHaveBeenCalledTimes(TAKT_GRENZE);
  });
});
