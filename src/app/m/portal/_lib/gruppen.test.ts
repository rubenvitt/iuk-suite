import { describe, expect, it, vi } from "vitest";
import {
  OHNE_GRUPPE_FEHLER,
  pocketIdGruppen,
  sichtbarkeitAusFormular,
  suiteGruppen,
  waehlbareGruppen,
  type PocketIdTransport,
} from "@/app/m/portal/_lib/gruppen";

/**
 * DIE GRUPPENWAHL DER PORTAL-VERWALTUNG (IDA-227). Drei Zusagen:
 *
 * 1. NICHT ÖFFENTLICH OHNE GRUPPE WIRD NIE GESPEICHERT — die Kachel wäre für
 *    niemanden sichtbar, und nichts sagte es.
 * 2. DER WERT IST `name`, NICHT `friendlyName` — nur `name` steht im
 *    `groups`-Claim, eine Kachel auf den Anzeigenamen sähe niemand.
 * 3. EIN AUSFALL VON POCKET ID WIRFT NICHT — er kostet nur die Vorschläge.
 */

function formular(eintraege: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of eintraege) fd.append(k, v);
  return fd;
}

describe("sichtbarkeitAusFormular", () => {
  it("liest mehrere Gruppen, getrimmt und ohne Doppelte", () => {
    expect(
      sichtbarkeitAusFormular(
        formular([
          ["requiredGroups", " iuk "],
          ["requiredGroups", "iuk"],
          ["requiredGroups", "sanitaet"],
          ["requiredGroups", ""],
        ]),
      ),
    ).toEqual({ isPublic: false, requiredGroups: ["iuk", "sanitaet"] });
  });

  it("speichert bei öffentlich keine Gruppen", () => {
    expect(
      sichtbarkeitAusFormular(formular([["isPublic", "on"], ["requiredGroups", "iuk"]])),
    ).toEqual({ isPublic: true, requiredGroups: [] });
  });

  it("lehnt nicht öffentlich ohne Gruppe ab", () => {
    expect(() => sichtbarkeitAusFormular(formular([]))).toThrow(OHNE_GRUPPE_FEHLER);
    expect(() => sichtbarkeitAusFormular(formular([["requiredGroups", "  "]]))).toThrow(
      OHNE_GRUPPE_FEHLER,
    );
  });
});

describe("suiteGruppen", () => {
  it("nennt Suite-Admin sowie Modul-Admin- und Zugangsgruppen aus der Env", () => {
    const gruppen = suiteGruppen({
      ADMIN_GROUP: "betrieb",
      SUITE_ADMIN_GROUP_QR: "qr-pflege",
      SUITE_ACCESS_GROUP_FILES: "dateien",
    });
    expect(gruppen).toContain("betrieb");
    expect(gruppen).toContain("qr-pflege");
    expect(gruppen).toContain("dateien");
    expect(new Set(gruppen).size).toBe(gruppen.length);
  });
});

describe("pocketIdGruppen", () => {
  const ENV = { POCKET_ID_ISSUER: "https://id.example.test/", POCKET_ID_API_KEY: "geheim" };

  function transport(seiten: unknown[][]): PocketIdTransport & { urls: string[] } {
    const urls: string[] = [];
    const t: PocketIdTransport = async (url) => {
      urls.push(url);
      const seite = Number(new URL(url).searchParams.get("pagination[page]"));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: seiten[seite - 1] ?? [], pagination: { totalPages: seiten.length } }),
      };
    };
    return Object.assign(t, { urls });
  }

  it("ohne Key: nicht eingerichtet, kein Abruf", async () => {
    const t = transport([]);
    expect(await pocketIdGruppen({ POCKET_ID_ISSUER: "https://id.example.test" }, t)).toEqual({
      status: "unconfigured",
      gruppen: [],
    });
    expect(t.urls).toEqual([]);
  });

  it("liest alle Seiten, Wert ist `name`, Anzeige `friendlyName`", async () => {
    const t = transport([
      [{ name: "iuk", friendlyName: "IuK-Gruppe" }, { name: "  ", friendlyName: "kaputt" }],
      [{ name: "sanitaet", friendlyName: "" }],
    ]);
    const ergebnis = await pocketIdGruppen(ENV, t);
    expect(ergebnis).toEqual({
      status: "ok",
      gruppen: [
        { wert: "iuk", anzeige: "IuK-Gruppe" },
        { wert: "sanitaet", anzeige: "sanitaet" },
      ],
    });
    expect(t.urls).toHaveLength(2);
    expect(t.urls[0]).toMatch(/^https:\/\/id\.example\.test\/api\/user-groups\?/);
  });

  it("ein HTTP-Fehler wirft nicht, sondern meldet `error`", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    const t: PocketIdTransport = async () => ({ ok: false, status: 401, json: async () => ({}) });
    expect(await pocketIdGruppen(ENV, t)).toEqual({ status: "error", gruppen: [] });
    fehler.mockRestore();
  });
});

describe("waehlbareGruppen", () => {
  it("vereint die Quellen, Pocket ID gewinnt die Anzeige, sortiert nach Anzeige", () => {
    expect(
      waehlbareGruppen({
        pocketId: [{ wert: "iuk", anzeige: "IuK-Gruppe" }],
        suite: ["iuk", "dashboard-admins"],
        vergeben: ["alt-gruppe", "iuk"],
      }),
    ).toEqual([
      { wert: "alt-gruppe", anzeige: "alt-gruppe" },
      { wert: "dashboard-admins", anzeige: "dashboard-admins" },
      { wert: "iuk", anzeige: "IuK-Gruppe" },
    ]);
  });
});
