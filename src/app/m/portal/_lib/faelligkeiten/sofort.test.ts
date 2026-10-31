import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaelligkeitenAbo } from "@/app/m/portal/_db/schema";
import type { Sofortmeldung } from "@/core/faelligkeiten";
import type { FaelligkeitsQuelle } from "./quellen";
import { _sofortZuruecksetzen, sofortNachricht, sofortschritt, type SofortAbhaengigkeiten } from "./sofort";

const VERSAND = { serverUrl: "https://ntfy.example", basis: "http://ntfy", token: "tk_x", praefix: "iuk-faellig-" };

function abo(personId: string, teil: Partial<FaelligkeitenAbo> = {}): FaelligkeitenAbo {
  return {
    personId, thema: `iuk-faellig-${personId}`, push: true, abgewaehlt: [], gruppen: ["lagerbuch-admin"],
    gesendeteWoche: null, erstelltAm: new Date(), ...teil,
  };
}

const MANGEL: Sofortmeldung = { id: "m1", art: "Mangel", titel: "Mangel gemeldet: RTW 1", zeilen: ["• Verschmutzt", "1 Foto"], pfad: "/verwaltung/maengel" };

function quelle(meldungen: Sofortmeldung[], vermerken = vi.fn()): FaelligkeitsQuelle {
  return {
    modul: "lagerbuch", titel: "Lagerbuch", arten: ["Mangel"],
    darfSehen: (g) => !!g?.includes("lagerbuch-admin"),
    lesen: () => [],
    sofort: { lesen: () => meldungen, vermerken },
  };
}

function abh(teil: Partial<SofortAbhaengigkeiten>): SofortAbhaengigkeiten {
  return {
    jetzt: new Date("2026-10-31T15:00:00Z"),
    versand: VERSAND,
    abos: () => [abo("anna"), abo("ben", { gruppen: ["andere"] }), abo("cem", { abgewaehlt: ["lagerbuch:Mangel"] })],
    verzeichnis: async () => null,
    quellen: [],
    basis: () => "https://lagerbuch.example",
    senden: vi.fn(async () => {}),
    melden: vi.fn(),
    ...teil,
  };
}

beforeEach(() => _sofortZuruecksetzen());

describe("Sofort-Push", () => {
  it("schickt nur an Abos, die das Modul verwalten und die Art nicht abgewählt haben, und vermerkt", async () => {
    const vermerken = vi.fn();
    const senden = vi.fn(async () => {});
    const r = await sofortschritt(abh({ quellen: [quelle([MANGEL], vermerken)], senden }));
    expect(r).toEqual({ gesendet: 1, gescheitert: 0, vermerkt: 1 });
    expect(senden).toHaveBeenCalledWith(
      { basis: "http://ntfy", thema: "iuk-faellig-anna", token: "tk_x" },
      expect.objectContaining({ title: "Mangel gemeldet: RTW 1", click: "https://lagerbuch.example/verwaltung/maengel", priority: 4 }),
    );
    expect(vermerken).toHaveBeenCalledWith(["m1"], expect.any(Date));
  });

  it("nimmt die Gruppen aus dem Verzeichnis, wenn es eins gibt", async () => {
    const senden = vi.fn(async () => {});
    await sofortschritt(abh({
      quellen: [quelle([MANGEL])], senden,
      verzeichnis: async () => new Map([["anna", null], ["ben", ["lagerbuch-admin"]], ["cem", ["lagerbuch-admin"]]]),
    }));
    expect(senden).toHaveBeenCalledTimes(1);
    expect((senden.mock.calls[0] as unknown[])[0]).toMatchObject({ thema: "iuk-faellig-ben" });
  });

  it("vermerkt nicht, wenn der Versand an alle scheitert, und schickt beim Nachholen niemandem doppelt", async () => {
    const vermerken = vi.fn();
    const abos = () => [abo("anna"), abo("dora")];
    const scheitertFuerDora = vi.fn(async (ziel: { thema: string }) => { if (ziel.thema.endsWith("dora")) throw new Error("HTTP 502"); });
    const alleScheitern = vi.fn(async () => { throw new Error("HTTP 502"); });

    let r = await sofortschritt(abh({ quellen: [quelle([MANGEL], vermerken)], abos, senden: alleScheitern }));
    expect(r.vermerkt).toBe(0);
    expect(vermerken).not.toHaveBeenCalled();

    r = await sofortschritt(abh({ quellen: [quelle([MANGEL], vermerken)], abos, senden: scheitertFuerDora }));
    expect(r).toEqual({ gesendet: 1, gescheitert: 1, vermerkt: 1 });

    const nochmal = vi.fn(async () => {});
    await sofortschritt(abh({ quellen: [quelle([MANGEL], vermerken)], abos, senden: nochmal }));
    expect((nochmal.mock.calls as unknown[][]).map((c) => (c[0] as { thema: string }).thema)).toEqual(["iuk-faellig-dora"]);
  });

  it("vermerkt auch ohne Empfänger und tut ohne Versand nichts", async () => {
    const vermerken = vi.fn();
    expect((await sofortschritt(abh({ quellen: [quelle([MANGEL], vermerken)], abos: () => [] }))).vermerkt).toBe(1);
    const lesen = vi.fn(() => [MANGEL]);
    await sofortschritt(abh({ versand: null, quellen: [{ ...quelle([]), sofort: { lesen, vermerken } }] }));
    expect(lesen).not.toHaveBeenCalled();
  });

  it("wirft nie, auch wenn das Verzeichnis nicht antwortet", async () => {
    const melden = vi.fn();
    const r = await sofortschritt(abh({ quellen: [quelle([MANGEL])], verzeichnis: async () => { throw new Error("Pocket ID nicht erreichbar"); }, melden }));
    expect(r).toEqual({ gesendet: 0, gescheitert: 0, vermerkt: 0 });
    expect(melden).toHaveBeenCalledTimes(1);
  });

  it("die Nachricht trägt keinen Freitext, nur die Zeilen der Meldung", () => {
    expect(sofortNachricht(MANGEL, null)).toEqual({
      title: "Mangel gemeldet: RTW 1", message: "• Verschmutzt\n1 Foto", priority: 4, tags: ["warning"],
    });
  });
});
