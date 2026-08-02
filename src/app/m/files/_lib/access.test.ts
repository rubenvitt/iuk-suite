import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * WAS DIESE DATEI BESITZT (Spec §2.4, Plan T10):
 *
 *  - dass es GENAU EINE Zugangsstufe gibt und der Suite-Admin KEINE Abkuerzung
 *    bekommt (die Betreiberentscheidung),
 *  - dass eine LEERE Liste NICHTS gewaehrt — die Verknuepfung aus §2.4 und
 *    ausdruecklich nicht die aus `canAccess`,
 *  - dass beide Env-Ueberschreibungen an dieser Stelle wirken,
 *  - dass der `callbackUrl` auf den VERWALTUNGS-Host zeigt, und vor dem Cutover
 *    auf den relativen Pfad zurueckfaellt statt auf einen geratenen Host.
 *
 * Was sie NICHT besitzt: „Host aus der Rolle, Port aus dem Request" (das ist
 * `hostRolle.test.ts`, T9) und dass der Riegel auch GERUFEN wird (Layout,
 * Verteiler und Actions — fremde Tasks).
 */

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { auth } from "@/core/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isFilesAdmin, requireFilesAccess, viewerAusSession } from "./access";

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

/**
 * Der Suite-Admin steht hier als LITERAL, nicht als `suiteAdminGroup()`-Aufruf.
 * Zwei Gruende: die Fertig-Bedingung von T10 grept das ganze Modulverzeichnis
 * nach `suiteAdminGroup`/`isModuleAdmin` und darf nichts finden — auch nicht in
 * dieser Testdatei; und der Vorgabewert steht so in der `.env` des Servers
 * (`core/groups.ts:76`), ist also die Zeichenkette, die real ankommt.
 */
const SUITE_ADMIN = "dashboard-admins";

const authMock = vi.mocked(auth);
const headersMock = vi.mocked(headers);

/** Der Zustand nach dem Cutover (und ab T14 in Dev/E2E): beide Rollen belegt. */
function zweiHosts(): void {
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
}

function sessionMit(id: string, groups: string[]): never {
  return {
    user: { id, groups, fachgruppen: [], name: null, email: null, isAdmin: false },
  } as never;
}

/** Der Riegel laeuft immer auf dem Verwaltungs-Host; E2E dort auf Port 3100. */
function aufVerwaltungshost(host = `${VERWALTUNG}:3100`): void {
  headersMock.mockResolvedValue(new Headers({ host }) as never);
}

beforeEach(() => {
  authMock.mockReset();
  headersMock.mockReset();
  vi.mocked(redirect).mockClear();
  vi.mocked(notFound).mockClear();
  aufVerwaltungshost();
});

afterEach(() => vi.unstubAllEnvs());

describe("isFilesAdmin: die EINE Stufe, ohne Suite-Admin-Abkuerzung", () => {
  it("Mitglied der Modul-Admin-Gruppe darf, ein Fremder nicht, `null` nie", () => {
    expect(isFilesAdmin({ sub: "a", groups: ["drk-files-admin"] })).toBe(true);
    expect(isFilesAdmin({ sub: "b", groups: ["irgendeine-andere-gruppe"] })).toBe(false);
    expect(isFilesAdmin({ sub: "c", groups: [] })).toBe(false);
    expect(isFilesAdmin(null)).toBe(false);
  });

  /*
   * DIE BETREIBERENTSCHEIDUNG, als eigener Fall: `isModuleAdmin` aus
   * `core/groups` laesst den Suite-Admin unbedingt durch (`:104`), dieses Modul
   * nicht. Zugang zu `files` heisst Einblick in fremde Freigaben UND in ein
   * Postfach mit Uploads Dritter; Betrieb und Einsicht sind zwei Rollen.
   */
  it("der Suite-Admin allein ist hier NICHT berechtigt", () => {
    expect(isFilesAdmin({ sub: "betreiber", groups: [SUITE_ADMIN] })).toBe(false);
  });

  it("der Suite-Admin MIT files-Gruppe ist berechtigt — der Weg steht offen", () => {
    expect(isFilesAdmin({ sub: "b2", groups: [SUITE_ADMIN, "drk-files-admin"] })).toBe(true);
  });

  /*
   * PUNKT 4 DES PLANS, und der teuerste Fehler dieses Tasks. Er ist nur mit
   * geleerter Admin-Variable pruefbar: `adminGroupsFor` liefert sonst immer
   * `["drk-files-admin"]`, die Liste ist also nie leer und die Mutation auf die
   * `canAccess`-Bauform (`erlaubt.length === 0 || …`) bliebe gruen.
   *
   * `SUITE_ADMIN_GROUP_FILES=""` heisst „keine modul-eigenen Admins"
   * (`groups.ts:81-88`); `requiredGroups` ist in der Registry ohnehin leer. Die
   * beiden Variablen sind hier NICHT symmetrisch: eine leer gesetzte
   * `SUITE_ACCESS_GROUP_FILES` ist bewusst wirkungslos (`groups.ts:63-71`) und
   * wird beim Boot als Konfigurationsfehler gemeldet.
   */
  it("BEIDE Listen leer gewaehren NICHTS — nicht alles", () => {
    vi.stubEnv("SUITE_ADMIN_GROUP_FILES", "");
    expect(isFilesAdmin({ sub: "x", groups: ["drk-files-admin"] })).toBe(false);
    expect(isFilesAdmin({ sub: "y", groups: [SUITE_ADMIN, "beliebig", "noch-eine"] })).toBe(
      false,
    );
    expect(isFilesAdmin({ sub: "z", groups: [] })).toBe(false);
  });

  it("die Env-Ueberschreibung wirkt: gesetzt zaehlt NUR die genannte Gruppe", () => {
    vi.stubEnv("SUITE_ADMIN_GROUP_FILES", "dateien-verwaltung");
    expect(isFilesAdmin({ sub: "neu", groups: ["dateien-verwaltung"] })).toBe(true);
    // Der Vorgabewert traegt nach dem Umhaengen nicht mehr — sonst waere die
    // Ueberschreibung eine Erweiterung, keine Ersetzung.
    expect(isFilesAdmin({ sub: "alt", groups: ["drk-files-admin"] })).toBe(false);
  });

  it("die Zugangsvariable gewaehrt DIESELBE eine Stufe wie die Admin-Variable", () => {
    vi.stubEnv("SUITE_ACCESS_GROUP_FILES", "dateien-nutzer");
    expect(isFilesAdmin({ sub: "n", groups: ["dateien-nutzer"] })).toBe(true);
    // Und die Admin-Gruppe bleibt daneben gueltig: beide Listen gelten zusammen.
    expect(isFilesAdmin({ sub: "a", groups: ["drk-files-admin"] })).toBe(true);
    expect(isFilesAdmin({ sub: "f", groups: ["fremd"] })).toBe(false);
  });
});

describe("viewerAusSession", () => {
  it("liest sub und Gruppen; ohne id gibt es keinen Viewer", () => {
    expect(viewerAusSession(sessionMit("u1", ["drk-files-admin"]))).toEqual({
      sub: "u1",
      groups: ["drk-files-admin"],
    });
    expect(viewerAusSession(null)).toBeNull();
    expect(viewerAusSession({ user: { groups: ["x"] } } as never)).toBeNull();
  });

  it("eine Sitzung ohne Gruppen-Claim ist die leere Menge, kein Absturz", () => {
    // Ein alter Token ohne `groups` darf nicht in einen 500 laufen, sondern in
    // den 404 des Riegels — sonst haengt die Fehlerform an der Token-Version.
    expect(viewerAusSession({ user: { id: "u2" } } as never)).toEqual({
      sub: "u2",
      groups: [],
    });
  });
});

describe("requireFilesAccess: der Backstop", () => {
  it("Mitglied der Admin-Gruppe kommt durch und bekommt seinen Viewer", async () => {
    zweiHosts();
    authMock.mockResolvedValue(sessionMit("u1", ["drk-files-admin"]));

    await expect(requireFilesAccess()).resolves.toEqual({
      sub: "u1",
      groups: ["drk-files-admin"],
    });
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("Mitglied der Zugangsgruppe kommt genauso durch", async () => {
    zweiHosts();
    vi.stubEnv("SUITE_ACCESS_GROUP_FILES", "dateien-nutzer");
    authMock.mockResolvedValue(sessionMit("u2", ["dateien-nutzer"]));

    await expect(requireFilesAccess()).resolves.toEqual({
      sub: "u2",
      groups: ["dateien-nutzer"],
    });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("Eingeloggter ohne Gruppe bekommt 404 — keinen 403 und keine Weiterleitung", async () => {
    zweiHosts();
    authMock.mockResolvedValue(sessionMit("u3", ["irgendeine-andere-gruppe"]));

    await expect(requireFilesAccess()).rejects.toThrow();

    // Auf `notFound` festgenagelt und nicht nur auf „wirft": `redirect` wirft
    // ebenfalls. Ohne diese Zeile bliebe der Fall gruen, wenn aus dem 404 eine
    // Anmeldeaufforderung wird — und die verraet, dass es hier etwas gibt.
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("der Suite-Admin OHNE files-Gruppe bekommt 404", async () => {
    zweiHosts();
    authMock.mockResolvedValue(sessionMit("betreiber", [SUITE_ADMIN]));

    await expect(requireFilesAccess()).rejects.toThrow();

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("beide Listen leer: auch ein Eingeloggter mit Gruppen bekommt 404", async () => {
    zweiHosts();
    vi.stubEnv("SUITE_ADMIN_GROUP_FILES", "");
    authMock.mockResolvedValue(sessionMit("u4", ["drk-files-admin", SUITE_ADMIN]));

    await expect(requireFilesAccess()).rejects.toThrow();

    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("keine Sitzung: Weiterleitung mit callbackUrl auf den VERWALTUNGS-Host", async () => {
    zweiHosts();
    authMock.mockResolvedValue(null as never);

    await expect(requireFilesAccess()).rejects.toThrow();

    expect(notFound).not.toHaveBeenCalled();
    /*
     * Der ganze Wert wird festgenagelt, nicht nur „enthaelt files.localtest.me":
     * sonst blieben zwei Mutationen gruen — der interne Pfad `/m/files` als
     * Ziel (er landet nach dem Login auf der Modulwurzel des PORTAL-Hosts,
     * weil `suiteRedirect` relative Ziele an die `baseUrl` haengt,
     * `redirect.ts:41`) und ein vergessenes `encodeURIComponent`.
     */
    expect(redirect).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent(`http://${VERWALTUNG}:3100/`)}`,
    );
  });

  it("erzeugt den callbackUrl NIE aus dem Request-Host, sondern aus der Rolle", async () => {
    // Der Riegel laeuft normalerweise auf dem Verwaltungs-Host. Selbst wenn er
    // es eines Tages nicht taete, darf der Ruecksprung nicht auf der
    // Inbox-Domain landen: dort bedient keine Verwaltungsroute (§3.2).
    zweiHosts();
    aufVerwaltungshost(`${INBOX}:3100`);
    authMock.mockResolvedValue(null as never);

    await expect(requireFilesAccess()).rejects.toThrow();

    expect(redirect).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent(`http://${VERWALTUNG}:3100/`)}`,
    );
  });

  it("VOR dem Cutover ist der callbackUrl der RELATIVE Pfad, kein geratener Host", async () => {
    /*
     * Der Normalzustand vor dem Cutover: `prodHosts: []` und kein
     * `SUITE_HOST_FILES`, also `hostFuerRolle("verwaltung") === null`.
     *
     * Ein geratener absoluter Host waere hier still fatal: `suiteRedirect`
     * erlaubt ein absolutes Ziel nur, wenn `moduleForHost` den Host kennt UND
     * das Protokoll dem der `baseUrl` entspricht (`redirect.ts:30-56`) — sonst
     * landet der Login STUMM auf dem Portal (`hosts.ts:55-63`). Ein relativer
     * Pfad geht dagegen unveraendert durch (`redirect.ts:41`).
     */
    vi.stubEnv("SUITE_HOST_FILES", "");
    authMock.mockResolvedValue(null as never);

    await expect(requireFilesAccess()).rejects.toThrow();

    expect(redirect).toHaveBeenCalledWith("/login?callbackUrl=%2Fm%2Ffiles");
    // Und die Gegenprobe zur Zeichenkette oben: kein Protokoll, kein Host.
    expect(vi.mocked(redirect).mock.calls[0][0]).not.toContain("http");
  });

  it("prueft die Sitzung, bevor sie den Host anfasst — `oeffentlicheUrl` wirft ohne Host", async () => {
    // Reihenfolge im Rumpf: erst `hostFuerRolle`-Rueckfall, dann
    // `oeffentlicheUrl`. Umgekehrt bekaeme die anonyme Anfrage vor dem Cutover
    // einen 500 statt einer Anmeldeaufforderung.
    vi.stubEnv("SUITE_HOST_FILES", "");
    authMock.mockResolvedValue(null as never);

    await expect(requireFilesAccess()).rejects.toThrow("NEXT_REDIRECT");
  });
});
