import { beforeEach, describe, expect, it, vi } from "vitest";

const zustand: { user: { id: string; name: string | null; groups: string[] } | null } = { user: null };
vi.mock("@/core/auth", () => ({ auth: async () => (zustand.user ? { user: zustand.user } : null) }));
const audit = vi.hoisted(() => ({ denied: vi.fn(), login: vi.fn() }));
vi.mock("@/core/audit/server", async (orig) => ({
  ...(await orig<typeof import("@/core/audit/server")>()),
  auditDenied: audit.denied,
  auditLoginRequired: audit.login,
}));

import { anmeldePfad, anmeldezugang, leseAnmeldeparameter, rueckrufUrl } from "./anmeldeseite";

const GUELTIG = { port: "54321", state: "a".repeat(22), challenge: "b".repeat(43) };

describe("leseAnmeldeparameter", () => {
  it("liest gültige Parameter ohne Einrichtung", () => {
    expect(leseAnmeldeparameter(GUELTIG)).toEqual({ port: 54321, state: GUELTIG.state, challenge: GUELTIG.challenge, einrichtung: null });
  });

  it("Port 1023 und 65536 werden abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, port: "1023" })).toBeNull();
    expect(leseAnmeldeparameter({ ...GUELTIG, port: "65536" })).toBeNull();
  });

  it("port=08080 wird abgewiesen — nur Ziffern ohne führende Null", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, port: "08080" })).toBeNull();
  });

  it("port mit Buchstaben wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, port: "54321x" })).toBeNull();
  });

  it("state mit „/“ wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, state: `${"a".repeat(20)}/x` })).toBeNull();
  });

  it("state unter 16 Zeichen wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, state: "a".repeat(15) })).toBeNull();
  });

  it("challenge mit 42 Zeichen wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, challenge: "b".repeat(42) })).toBeNull();
  });

  it("art ohne name wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, art: "echt" })).toBeNull();
  });

  it("art mit leerem name wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, art: "echt", name: "   " })).toBeNull();
  });

  it("art mit ungültigem Wert wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, art: "andere", name: "X" })).toBeNull();
  });

  it("name über 60 Zeichen wird abgewiesen", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, art: "echt", name: "x".repeat(61) })).toBeNull();
  });

  it("art mit gültigem, getrimmtem name liefert die Einrichtung", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, art: "test", name: "  Übungsrechner  " })).toEqual({
      port: 54321, state: GUELTIG.state, challenge: GUELTIG.challenge,
      einrichtung: { art: "test", name: "Übungsrechner" },
    });
  });

  it("Array-Werte (doppelter Query-Parameter) nehmen den ersten", () => {
    expect(leseAnmeldeparameter({ ...GUELTIG, port: [GUELTIG.port, "1"] })).toEqual({
      port: 54321, state: GUELTIG.state, challenge: GUELTIG.challenge, einrichtung: null,
    });
  });
});

describe("anmeldePfad", () => {
  it("baut den kanonischen Pfad ohne Einrichtung", () => {
    expect(anmeldePfad({ port: 1, state: "s", challenge: "c", einrichtung: null })).toBe("/anmelden?port=1&state=s&challenge=c");
  });

  it("hängt art und name an, wenn eine Einrichtung gewählt wurde", () => {
    expect(anmeldePfad({ port: 1, state: "s", challenge: "c", einrichtung: { art: "echt", name: "EL" } }))
      .toBe("/anmelden?port=1&state=s&challenge=c&art=echt&name=EL");
  });
});

describe("rueckrufUrl", () => {
  it("beginnt immer mit http://127.0.0.1: und kodiert state", () => {
    const url = rueckrufUrl({ port: 54321, state: "a b" }, { code: "c0de" });
    expect(url.startsWith("http://127.0.0.1:54321/rueckruf?")).toBe(true);
    expect(url).toContain("code=c0de");
    expect(url).toContain("state=a+b");
  });

  it("der Fehlerfall trägt state und fehler, keinen code", () => {
    expect(rueckrufUrl({ port: 1, state: "s" }, { fehler: "kein_zugang" })).toBe("http://127.0.0.1:1/rueckruf?state=s&fehler=kein_zugang");
  });

  it("Abbruch trägt fehler=abgebrochen", () => {
    expect(rueckrufUrl({ port: 1, state: "s" }, { fehler: "abgebrochen" })).toBe("http://127.0.0.1:1/rueckruf?state=s&fehler=abgebrochen");
  });
});

describe("anmeldezugang", () => {
  beforeEach(() => {
    zustand.user = null;
    audit.denied.mockClear();
    audit.login.mockClear();
  });

  it("ohne Sitzung: loginUrl mit kodierter Query, Audit login_required", async () => {
    const pfad = "/anmelden?port=1&state=s&challenge=c";
    const z = await anmeldezugang(pfad);
    expect(z).toEqual({ art: "anmelden", loginUrl: `/login?callbackUrl=${encodeURIComponent(pfad)}` });
    expect(audit.login).toHaveBeenCalledWith("einsatzbuch");
    expect(audit.denied).not.toHaveBeenCalled();
  });

  it("mit Sitzung, ohne Gruppe: kein_zugang, Audit access_denied mit Akteur", async () => {
    zustand.user = { id: "s1", name: "Jana", groups: ["andere"] };
    const z = await anmeldezugang("/anmelden");
    expect(z).toEqual({ art: "kein_zugang" });
    expect(audit.denied).toHaveBeenCalledTimes(1);
    expect(audit.denied).toHaveBeenCalledWith("einsatzbuch", { kind: "user", id: "s1", name: "Jana" });
    expect(audit.login).not.toHaveBeenCalled();
  });

  it("mit Sitzung und Gruppe: ok mit dem Viewer", async () => {
    zustand.user = { id: "s1", name: "Jana", groups: ["einsatzbuch-verwaltung"] };
    const z = await anmeldezugang("/anmelden");
    expect(z).toEqual({ art: "ok", viewer: zustand.user });
    expect(audit.denied).not.toHaveBeenCalled();
    expect(audit.login).not.toHaveBeenCalled();
  });
});
