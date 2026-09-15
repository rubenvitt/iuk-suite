import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { ZIEL_COOKIE } from "../_lib/entnahmeZiel";

/**
 * DIE ZIELWAHL AM REGAL — DRK-300.
 *
 * Was diese Datei trägt, und warum jeweils GENAU HIER:
 *
 *   - Die Wahl LANDET IM COOKIE, und zwar mit denselben Attributen wie die
 *     Sitzung. Ein `path`, das nicht `/` ist, liefe auf `/helfer` und auf
 *     `/a/<id>` auseinander — die Wahl wäre je nach Seite eine andere, und
 *     zwar still.
 *   - Ein untaugliches Fahrzeug setzt KEIN Cookie. Ohne diese Zusage merkte
 *     sich der Zugang ein stillgelegtes Fahrzeug, und jede folgende Entnahme
 *     liefe in den Fehlerzweig der Buchung — auf einer Seite, die das Ziel
 *     als gültig anzeigt.
 *   - Der RIEGEL steht VOR dem Cookie. Er ist hier keine Formalie: eine
 *     Server Action ist ein eigener Einstiegspunkt mit global aufrufbarer
 *     Kennung, ganz gleich, welche Seite sie eingebaut hat.
 *   - `returnTo` geht durch `sanitizeReturnTo`. Die Wahlseite ist über einen
 *     Suchparameter erreichbar, der im Formular landet — ohne die Prüfung
 *     wäre das ein Open Redirect auf einer Fläche, die mit einem laminierten
 *     Kärtchen erreichbar ist.
 */

const stand = vi.hoisted(() => ({
  cookieOps: [] as {
    art: "set" | "delete";
    name: string;
    wert?: string;
    opt?: Record<string, unknown>;
  }[],
  umleitungen: [] as string[],
}));

const { riegel } = vi.hoisted(() => ({
  riegel: vi.fn<(db: unknown) => Promise<unknown>>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, wert: string, opt: Record<string, unknown>) => {
      stand.cookieOps.push({ art: "set", name, wert, opt });
    },
    delete: (name: string, opt?: Record<string, unknown>) => {
      stand.cookieOps.push({ art: "delete", name, opt });
    },
  }),
}));

// `redirect()` WIRFT in der echten Laufzeit einen Next-internen Fehler; für die
// Unit-Aussage genügt ein erkennbarer Wurf (`_actions/sitzung.test.ts:119`).
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    stand.umleitungen.push(ziel);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: (db: unknown) => riegel(db),
}));

vi.mock("../_db/client", () => ({
  getDb: () => {
    throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db");
  },
}));

import { waehleEntnahmeZiel } from "./entnahmeZiel";

let t: TestDb;

const ZUGANG_OK = {
  ok: true,
  zugang: {
    tokenId: "tk1",
    code: "482-137",
    label: "RTW 1",
    laeuftAb: new Date(Date.now() + 3_600_000),
  },
};

function formular(felder: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(felder)) fd.set(k, v);
  return fd;
}

/** Die Action leitet IMMER um — der Wurf ist der Redirect, nicht ein Fehler. */
async function waehle(felder: Record<string, string>) {
  await expect(waehleEntnahmeZiel(formular(felder), t.db)).rejects.toThrow("NEXT_REDIRECT");
}

function gesetzte() {
  return stand.cookieOps.filter((o) => o.name === ZIEL_COOKIE);
}

beforeEach(() => {
  stand.cookieOps.length = 0;
  stand.umleitungen.length = 0;
  riegel.mockResolvedValue(ZUGANG_OK);
  t = migrierteTestDb("lagerbuch-actions-ziel-");
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false },
    { id: "lager-2", name: "Außenlager", typ: "lager", aktiv: true },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

describe("waehleEntnahmeZiel", () => {
  it("merkt ein Fahrzeug und kehrt zur Artikelseite zurück", async () => {
    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    expect(gesetzte()).toHaveLength(1);
    expect(gesetzte()[0]).toMatchObject({ art: "set", wert: "fz:fz-1" });
    // ÄUSSERER Pfad (Falle 63): der Browser steht auf dem Modul-Host.
    expect(stand.umleitungen).toEqual(["/a/art-1"]);
  });

  it("setzt das Cookie mit `path: /` — sonst gilt die Wahl je Seite anders", async () => {
    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    const opt = gesetzte()[0]!.opt!;
    expect(opt.path).toBe("/");
    // Kein Zugriff aus dem Skript der Seite — die Wahl ist Serversache.
    expect(opt.httpOnly).toBe(true);
    expect(opt.sameSite).toBe("lax");
    // Sie überlebt den nächsten Scan, sonst wäre „für den Zugang gemerkt"
    // wertlos.
    expect(opt.maxAge).toBeGreaterThan(0);
  });

  it("merkt die AUSDRÜCKLICHE Verbrauchswahl als eigenen Wert", async () => {
    // ⚠️ Der Träger des ganzen Tickets: „Verbrauch" ist ein GESETZTES Cookie,
    // kein fehlendes. Würde die Action hier löschen statt setzen, wäre die
    // Wahl nicht von „noch nichts gewählt" zu unterscheiden — und die nächste
    // Entnahme verlangte sie erneut.
    await waehle({ ziel: "verbrauch", returnTo: "/a/art-1" });

    expect(gesetzte()).toHaveLength(1);
    expect(gesetzte()[0]).toMatchObject({ art: "set", wert: "verbrauch" });
  });

  it("merkt sich ein untaugliches Ziel NICHT", async () => {
    // Das Handlager steht in der Liste, weil es EXISTIERT und AKTIV ist: eine
    // Prüfung, die nur „unbekannt" abweist, ließe es durch.
    for (const roh of ["fz:fz-alt", "fz:lager-2", "fz:gibtsnicht", `fz:${HANDLAGER_ID}`]) {
      stand.cookieOps.length = 0;
      await waehle({ ziel: roh, returnTo: "/a/art-1" });
      expect(gesetzte(), roh).toEqual([]);
    }
  });

  it("merkt sich einen unlesbaren Wert NICHT", async () => {
    await waehle({ ziel: "kaputt", returnTo: "/a/art-1" });
    expect(gesetzte()).toEqual([]);
  });

  it("ein GESPERRTES Kärtchen setzt kein Ziel", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt" });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    expect(gesetzte()).toEqual([]);
    // Zurück aufs Gate, nicht auf die Artikelseite: dort käme die Person nicht
    // weiter und wüsste nicht, warum.
    expect(stand.umleitungen[0]).toMatch(/^\/\?|^\/$/);
  });

  it("weist ein fremdes `returnTo` ab und landet auf der Artikelliste", async () => {
    // Ohne `sanitizeReturnTo` wäre das ein Open Redirect — auf einer Fläche,
    // die mit einem laminierten Kärtchen erreichbar ist.
    for (const boese of ["//boese.example", "https://boese.example", "/\\boese.example"]) {
      stand.umleitungen.length = 0;
      await waehle({ ziel: "fz:fz-1", returnTo: boese });
      expect(stand.umleitungen, boese).toEqual(["/helfer"]);
    }
  });
});
