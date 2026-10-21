import { describe, expect, it, vi } from "vitest";
import {
  ladeRechte,
  rechteKatalog,
  RechteFehler,
  setzeMitgliedschaft,
  type PocketGruppe,
  type PocketIdTransport,
} from "./rechte";

const ENV = { POCKET_ID_API_URL: "https://id.example", POCKET_ID_API_KEY: "k", ADMIN_GROUP: "admin" };

function g(id: string, name: string, extra: Partial<PocketGruppe> = {}): PocketGruppe {
  return { id, name, anzeige: name, ldap: false, ...extra };
}

/** Ein Pocket ID im Speicher: Gruppen, Personen und ihre Mitgliedschaften. */
function fakePocketId(start: { gruppen: { id: string; name: string; ldapId?: string }[]; mitglieder: Record<string, string[]> }) {
  const mitglieder = structuredClone(start.mitglieder);
  const aufrufe: { method: string; url: string; body?: unknown }[] = [];
  const antwort = (status: number, daten: unknown) => ({ ok: status < 400, status, json: async () => daten });
  const transport: PocketIdTransport = async (url, init) => {
    const method = init.method ?? "GET";
    aufrufe.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    const pfad = new URL(url).pathname;
    let m = pfad.match(/^\/api\/user-groups\/([^/]+)$/);
    if (m) {
      const gruppe = start.gruppen.find((x) => x.id === decodeURIComponent(m![1]));
      return gruppe ? antwort(200, gruppe) : antwort(404, {});
    }
    m = pfad.match(/^\/api\/users\/([^/]+)\/groups$/);
    if (m) {
      const ids = mitglieder[decodeURIComponent(m[1])];
      return ids ? antwort(200, ids.map((id) => start.gruppen.find((x) => x.id === id))) : antwort(404, {});
    }
    m = pfad.match(/^\/api\/users\/([^/]+)\/user-groups$/);
    if (m && method === "PUT") {
      mitglieder[decodeURIComponent(m[1])] = (JSON.parse(init.body!) as { userGroupIds: string[] }).userGroupIds;
      return antwort(200, {});
    }
    return antwort(404, {});
  };
  return { transport, mitglieder, aufrufe };
}

describe("rechteKatalog", () => {
  it("ordnet Gruppen den Modulrollen zu und lässt Fremdes unter „Weitere“", () => {
    const gruppen = [
      g("1", "admin"),
      g("2", "aufgaben-nutzer"),
      g("3", "aufgaben-admin"),
      g("4", "tailscale_user"),
      g("5", "radio-admin"),
      g("6", "radio-updater"),
    ];
    const { abschnitte, weitere } = rechteKatalog(gruppen, { ...ENV, SUITE_UPDATER_GROUP_RADIO: "radio-updater" });
    expect(abschnitte[0]).toMatchObject({ schluessel: "suite", rollen: [{ art: "betrieb", gruppe: { name: "admin" } }] });
    expect(abschnitte.find((a) => a.schluessel === "aufgaben")?.rollen.map((r) => [r.art, r.gruppe.name])).toEqual([
      ["nutzer", "aufgaben-nutzer"],
      ["admin", "aufgaben-admin"],
    ]);
    expect(abschnitte.find((a) => a.schluessel === "radio")?.rollen.map((r) => r.art)).toEqual(["admin", "updater"]);
    expect(weitere.map((w) => w.name)).toEqual(["tailscale_user"]);
  });

  it("zeigt kein Modul, dessen Gruppen es in Pocket ID nicht gibt", () => {
    const { abschnitte } = rechteKatalog([g("1", "admin")], ENV);
    expect(abschnitte.map((a) => a.schluessel)).toEqual(["suite"]);
  });

  it("führt eine Gruppe, die Zugang und Verwaltung zugleich ist, einmal als Verwaltung", () => {
    const { abschnitte } = rechteKatalog([g("1", "personal")], {
      ...ENV,
      SUITE_ACCESS_GROUP_FILES: "personal",
      SUITE_ADMIN_GROUP_FILES: "personal",
    });
    expect(abschnitte.find((a) => a.schluessel === "files")?.rollen.map((r) => r.art)).toEqual(["admin"]);
  });

  it("zeigt während einer Umbenennung alte und neue Gruppe, solange beide existieren", () => {
    const { abschnitte } = rechteKatalog([g("1", "radio_admin"), g("2", "radio-admin")], {
      ...ENV,
      SUITE_ADMIN_GROUP_RADIO: "radio_admin,radio-admin",
    });
    expect(abschnitte.find((a) => a.schluessel === "radio")?.rollen.map((r) => r.gruppe.name)).toEqual([
      "radio_admin",
      "radio-admin",
    ]);
  });
});

describe("ladeRechte", () => {
  it("ohne Key: unconfigured, ohne Abruf", async () => {
    const transport = vi.fn();
    expect(await ladeRechte({}, transport)).toEqual({ status: "unconfigured", gruppen: [], personen: [] });
    expect(transport).not.toHaveBeenCalled();
  });

  it("liest alle Seiten und die Gruppen je Person", async () => {
    const transport: PocketIdTransport = async (url) => {
      const u = new URL(url);
      const seite = Number(u.searchParams.get("pagination[page]"));
      if (u.pathname === "/api/user-groups") {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: "g1", name: "admin", friendlyName: "Suite: Betrieb" }], pagination: { totalPages: 1 } }) };
      }
      const data =
        seite === 1
          ? [{ id: "u2", displayName: "Zora", email: "z@x", userGroups: [] }]
          : [{ id: "u1", firstName: "Anna", lastName: "Alt", userGroups: [{ id: "g1", name: "admin" }], disabled: true }];
      return { ok: true, status: 200, json: async () => ({ data, pagination: { totalPages: 2 } }) };
    };
    const daten = await ladeRechte(ENV, transport);
    expect(daten.status).toBe("ok");
    expect(daten.gruppen).toEqual([{ id: "g1", name: "admin", anzeige: "Suite: Betrieb", ldap: false }]);
    expect(daten.personen).toEqual([
      { id: "u1", name: "Anna Alt", email: null, gruppenIds: ["g1"], gesperrt: true },
      { id: "u2", name: "Zora", email: "z@x", gruppenIds: [], gesperrt: false },
    ]);
  });

  it("ein Ausfall wird ein Zustand, kein Wurf", async () => {
    const transport: PocketIdTransport = async () => ({ ok: false, status: 500, json: async () => ({}) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await ladeRechte(ENV, transport)).status).toBe("error");
  });
});

describe("setzeMitgliedschaft", () => {
  const gruppen = [{ id: "a", name: "admin" }, { id: "k", name: "kommplan-nutzer" }, { id: "l", name: "ldap-gruppe", ldapId: "cn=x" }];

  it("nimmt auf und lässt die übrigen Gruppen der Person stehen", async () => {
    const pid = fakePocketId({ gruppen, mitglieder: { u1: ["a"] } });
    const ergebnis = await setzeMitgliedschaft({ personId: "u1", gruppeId: "k", mitglied: true, selbstId: "ich" }, ENV, pid.transport);
    expect(ergebnis.geaendert).toBe(true);
    expect(pid.mitglieder.u1).toEqual(["a", "k"]);
  });

  it("nimmt heraus", async () => {
    const pid = fakePocketId({ gruppen, mitglieder: { u1: ["a", "k"] } });
    await setzeMitgliedschaft({ personId: "u1", gruppeId: "k", mitglied: false, selbstId: "ich" }, ENV, pid.transport);
    expect(pid.mitglieder.u1).toEqual(["a"]);
  });

  it("schreibt nicht, wenn der Zustand schon stimmt", async () => {
    const pid = fakePocketId({ gruppen, mitglieder: { u1: ["k"] } });
    const ergebnis = await setzeMitgliedschaft({ personId: "u1", gruppeId: "k", mitglied: true, selbstId: "ich" }, ENV, pid.transport);
    expect(ergebnis.geaendert).toBe(false);
    expect(pid.aufrufe.some((a) => a.method === "PUT")).toBe(false);
  });

  it("verweigert die eigene Betriebsgruppe, bevor geschrieben wird", async () => {
    const pid = fakePocketId({ gruppen, mitglieder: { ich: ["a"] } });
    await expect(
      setzeMitgliedschaft({ personId: "ich", gruppeId: "a", mitglied: false, selbstId: "ich" }, ENV, pid.transport),
    ).rejects.toBeInstanceOf(RechteFehler);
    expect(pid.mitglieder.ich).toEqual(["a"]);
  });

  it("lässt die Betriebsgruppe anderer abgeben", async () => {
    const pid = fakePocketId({ gruppen, mitglieder: { u1: ["a"] } });
    await setzeMitgliedschaft({ personId: "u1", gruppeId: "a", mitglied: false, selbstId: "ich" }, ENV, pid.transport);
    expect(pid.mitglieder.u1).toEqual([]);
  });

  it("verweigert LDAP-Gruppen und unbekannte Gruppen", async () => {
    const pid = fakePocketId({ gruppen, mitglieder: { u1: [] } });
    await expect(
      setzeMitgliedschaft({ personId: "u1", gruppeId: "l", mitglied: true, selbstId: "ich" }, ENV, pid.transport),
    ).rejects.toBeInstanceOf(RechteFehler);
    await expect(
      setzeMitgliedschaft({ personId: "u1", gruppeId: "gibtsnicht", mitglied: true, selbstId: "ich" }, ENV, pid.transport),
    ).rejects.toThrow();
    expect(pid.mitglieder.u1).toEqual([]);
  });
});
